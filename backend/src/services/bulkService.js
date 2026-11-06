import { uploadConfig } from './uploadConfig.js';
import { readBuffer, removeBuffers } from './bulkStorage.js';
import { validPeriod } from './finance.js';
import BulkImport from '../models/BulkImport.js';
import Receipt from '../models/Receipt.js';
import { parseReceipt } from './pdfParser.js';
import { getDolarRates } from './dolarApi.js';
import { detectPeriod } from './periodDetector.js';
import { calculateFileHash, validateFile, sanitizeFileName, validateRelativePath } from './fileValidator.js';

/**
 * Servicio de importación masiva de recibos.
 *
 * Gestiona el ciclo de vida de un lote de archivos PDF:
 * creación, procesamiento con concurrencia limitada,
 * detección de duplicados, detección de período,
 * reintentos y revisión manual.
 */

// Semáforo simple basado en Promises para limitar concurrencia
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      next();
    }
  }
}

const globalSemaphore = new Semaphore(uploadConfig().concurrency);
const hashLocks = new Map();
async function withHashLock(hash, work) {
  const previous = hashLocks.get(hash) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  hashLocks.set(hash, current);
  await previous;
  try { return await work(); }
  finally { release(); if (hashLocks.get(hash) === current) hashLocks.delete(hash); }
}

/**
 * Crea una importación masiva a partir de archivos subidos
 * @param {Array} files - Archivos de multer [{ buffer, originalname, mimetype, size }]
 * @param {Array} relativePaths - Rutas relativas correspondientes
 * @returns {Object} BulkImport document
 */
export async function createBulkImport(files, relativePaths = []) {
  // Detectar nombre de carpeta raíz desde los paths
  let folderName = 'Archivos sueltos';
  if (relativePaths.length > 0) {
    const firstPath = relativePaths.find(p => p && p.includes('/'));
    if (firstPath) {
      folderName = firstPath.split('/')[0] || folderName;
    }
  }

  // Construir array de archivos para el lote
  const bulkFiles = files.map((file, index) => {
    const rp = relativePaths[index] || '';
    const { sanitized } = validateRelativePath(rp);

    return {
      originalName: file.originalname,
      relativePath: sanitized,
      sanitizedName: sanitizeFileName(file.originalname),
      fileSize: file.buffer.length,
      mimeType: file.mimetype,
      status: 'pending'
    };
  });

  const bulkImport = new BulkImport({
    originalFolderName: folderName,
    totalFiles: files.length,
    files: bulkFiles
  });

  await bulkImport.save();

  console.log(`[BulkImport] Lote ${bulkImport._id} creado: ${files.length} archivos`);

  return bulkImport;
}

/**
 * Procesa todos los archivos pendientes de un lote con concurrencia limitada
 * @param {string} batchId - ID del lote
 * @param {Array} fileBuffers - Buffers de los archivos (mismo orden que files)
 */
export async function processBulkImport(batchId, fileBuffers) {
  const semaphore = globalSemaphore;

  // Marcar lote como en procesamiento
  await BulkImport.findByIdAndUpdate(batchId, { status: 'processing' });

  const bulkImport = await BulkImport.findById(batchId);
  if (!bulkImport) throw new Error('Lote no encontrado');

  // Obtener cotizaciones una sola vez para todo el lote
  let rates;
  try {
    rates = await getDolarRates();
  } catch (err) {
    console.warn('[BulkImport] No se pudieron obtener cotizaciones:', err.message);
    rates = {};
  }

  // Procesar archivos en paralelo con concurrencia limitada
  const promises = bulkImport.files.map(async (fileDoc, index) => {
    if (fileDoc.status !== 'pending') return;

    await semaphore.acquire();
    try {
      await processFile(batchId, index, fileBuffers[index], rates);
    } catch (err) {
      console.error(`[BulkImport] Error inesperado procesando archivo ${index}:`, err.message);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);

  // Actualizar estado final del lote
  await finalizeBatch(batchId);
}

/**
 * Procesa un archivo individual dentro de un lote
 */
async function processFile(batchId, fileIndex, buffer, rates) {
  try { buffer ||= await readBuffer(batchId, fileIndex); }
  catch { await updateFileStatus(batchId, fileIndex, 'failed', { error: 'Volvé a seleccionar este PDF para reintentarlo.', errorCode: 'VALIDATION_ERROR' }); return; }
  return withHashLock(calculateFileHash(buffer), () => processFileLocked(batchId, fileIndex, buffer, rates));
}
async function processFileLocked(batchId, fileIndex, buffer, rates) {
  const startTime = Date.now();
  const fileUpdate = {};

  try {
    const metadata = await BulkImport.findById(batchId).lean();
    const source = metadata?.files[fileIndex];
    if (!source) throw new Error('Archivo no encontrado');
    await updateFileStatus(batchId, fileIndex, 'uploading');
    const hash = calculateFileHash(buffer);
    if (source.fileHash && source.fileHash !== hash) {
      await updateFileStatus(batchId, fileIndex, 'failed', { error: 'Seleccioná el mismo PDF para reintentar este archivo.', errorCode: 'VALIDATION_ERROR' });
      return;
    }
    const previous = await Receipt.findOne({ fileHash: hash }).lean();
    if (previous) {
      await updateFileStatus(batchId, fileIndex, 'duplicate', { fileHash: hash, duplicateReceiptId: previous._id, detectedYear: previous.periodo?.anio, detectedMonth: previous.periodo?.mes, duplicateProcessedAt: previous.createdAt });
      return;
    }
    const validation = await validateFile({ buffer, originalname: source.originalName, mimetype: source.mimeType }, source.relativePath);
    if (!validation.valid) {
      await updateFileStatus(batchId, fileIndex, 'failed', {
        error: validation.errors.join('; '),
        errorCode: validation.errorCode,
        processingTime: Date.now() - startTime
      });
      return;
    }

    // 3. Calcular hash y verificar duplicado
    const fileHash = validation.hash || calculateFileHash(buffer);
    await updateFileField(batchId, fileIndex, 'fileHash', fileHash);

    const existingReceipt = await Receipt.findOne({ fileHash }).lean();
    if (existingReceipt) {
      await updateFileStatus(batchId, fileIndex, 'duplicate', {
        fileHash,
        duplicateReceiptId: existingReceipt._id,
        processingTime: Date.now() - startTime
      });
      return;
    }

    // 4. Extraer datos del PDF
    await updateFileStatus(batchId, fileIndex, 'extracting');

    let extractedData;
    try {
      extractedData = await parseReceipt(buffer);
    } catch (err) {
      const errorCode = err.message?.includes('No se pudo extraer texto')
        ? 'EMPTY_PDF'
        : 'LLM_ERROR';
      await updateFileStatus(batchId, fileIndex, 'failed', {
        error: "No pudimos leer este PDF. Verificá que contenga texto y no tenga contraseña.",
        errorCode,
        processingTime: Date.now() - startTime
      });
      return;
    }

    // 5. Detectar período
    const bulkDoc = await BulkImport.findById(batchId).lean();
    const fileDoc = bulkDoc.files[fileIndex];

    const period = detectPeriod({
      extractedData,
      relativePath: fileDoc.relativePath,
      fileName: fileDoc.originalName
    });

    // Aplicar período detectado si no viene del PDF
    if (period.year) extractedData.periodo = { ...extractedData.periodo, anio: period.year };
    if (period.month) extractedData.periodo = { ...extractedData.periodo, mes: period.month };

    // 6. Validación de período
    await updateFileStatus(batchId, fileIndex, 'validating');

    if (extractedData.numeroRecibo) {
      const existing = await Receipt.findOne({ numeroRecibo: extractedData.numeroRecibo }).lean();
      if (existing) {
        await updateFileStatus(batchId, fileIndex, 'duplicate', { fileHash, duplicateReceiptId: existing._id, detectedYear: existing.periodo?.anio, detectedMonth: existing.periodo?.mes, duplicateProcessedAt: existing.createdAt });
        return;
      }
    }
    const needsReview = !validPeriod({ mes: period.month, anio: period.year }) || !Number.isFinite(extractedData.montoNeto) || extractedData.montoNeto < 0 || extractedData._fallback;

    if (needsReview) {
      // Guardar datos extraídos para revisión manual sin texto completo
      const dataForReview = { ...extractedData };
      delete dataForReview.textoCompleto;

      await updateFileStatus(batchId, fileIndex, 'needs_review', {
        detectedYear: period.year,
        detectedMonth: period.month,
        periodSource: period.source,
        extractedData: dataForReview,
        reviewReason: !period.year || !period.month ? "period" : "extraction",
        processingTime: Date.now() - startTime
      });
      return;
    }

    // 7. Enriquecer con cotización dólar
    enrichWithDolarRates(extractedData, rates);

    // 8. Guardar recibo
    extractedData.archivoOriginal = fileDoc.originalName;
    extractedData.fileHash = fileHash;
    extractedData.bulkImportId = batchId;
    extractedData.periodSource = period.source;

    // Verificar duplicado por numeroRecibo
    if (extractedData.numeroRecibo) {
      const existingByNumber = await Receipt.findOne({ numeroRecibo: extractedData.numeroRecibo }).lean();
      if (existingByNumber) {
        await updateFileStatus(batchId, fileIndex, 'duplicate', { duplicateReceiptId: existingByNumber._id });
        return;
      }
    }

    const receipt = new Receipt(extractedData);
    await receipt.save();

    // Obtener provider/model del env para logging
    const provider = process.env.LLM_PROVIDER || 'google';
    const model = process.env.LLM_MODEL || 'gemini-2.5-flash';

    await updateFileStatus(batchId, fileIndex, 'saved', {
      fileHash,
      detectedYear: period.year,
      detectedMonth: period.month,
      periodSource: period.source,
      receiptId: receipt._id,
      provider,
      model,
      processingTime: Date.now() - startTime
    });

    console.log(`[BulkImport] ${batchId} - Archivo ${fileIndex} (${fileDoc.originalName}) guardado en ${Date.now() - startTime}ms`);

  } catch (err) {
    if (err.code === 11000) {
      const existing = await Receipt.findOne({ $or: [{ fileHash: calculateFileHash(buffer) }, ...(err.keyValue?.numeroRecibo ? [{ numeroRecibo: err.keyValue.numeroRecibo }] : [])] }).lean();
      await updateFileStatus(batchId, fileIndex, 'duplicate', { duplicateReceiptId: existing?._id });
      return;
    }
    console.error(`[BulkImport] Error procesando archivo ${fileIndex}: ${err.name}`);
    await updateFileStatus(batchId, fileIndex, 'failed', {
      error: "No pudimos guardar este recibo. Intentá nuevamente.",
      errorCode: 'UNKNOWN_ERROR',
      processingTime: Date.now() - startTime
    });
  }
}

/**
 * Enriquece datos extraídos con cotización del dólar
 */
function enrichWithDolarRates(data, rates) {
  if (!rates) return;

  data.cotizacionDolar = {
    oficial: rates.oficial?.venta,
    blue: rates.blue?.venta,
    mayorista: rates.mayorista?.venta,
    cripto: rates.cripto?.venta
  };

  if (data.montoNeto) {
    data.montoEnDolares = {
      oficial: rates.oficial ? Math.round((data.montoNeto / rates.oficial.venta) * 100) / 100 : null,
      blue: rates.blue ? Math.round((data.montoNeto / rates.blue.venta) * 100) / 100 : null,
      mayorista: rates.mayorista ? Math.round((data.montoNeto / rates.mayorista.venta) * 100) / 100 : null,
      cripto: rates.cripto ? Math.round((data.montoNeto / rates.cripto.venta) * 100) / 100 : null
    };
  }
}

/**
 * Actualiza el status de un archivo en el lote
 */
async function updateFileStatus(batchId, fileIndex, status, extraFields = {}) {
  const updateFields = {
    [`files.${fileIndex}.status`]: status,
    ...Object.fromEntries(
      Object.entries(extraFields).map(([k, v]) => [`files.${fileIndex}.${k}`, v])
    )
  };

  await BulkImport.findByIdAndUpdate(batchId, { $set: updateFields });
  await refreshCounts(batchId);
}

/**
 * Actualiza un campo individual de un archivo
 */
async function updateFileField(batchId, fileIndex, field, value) {
  await BulkImport.findByIdAndUpdate(batchId, {
    $set: { [`files.${fileIndex}.${field}`]: value }
  });
}

export function batchCounts(files) {
  const terminal = ['saved', 'failed', 'duplicate', 'needs_review'];
  return {
    processedFiles: files.filter(f => terminal.includes(f.status)).length,
    successfulFiles: files.filter(f => f.status === 'saved').length,
    failedFiles: files.filter(f => f.status === 'failed').length,
    duplicateFiles: files.filter(f => f.status === 'duplicate').length,
    needsReviewFiles: files.filter(f => f.status === 'needs_review').length
  };
}
async function refreshCounts(batchId) {
  // Aggregation is evaluated atomically on the current document, not a stale read.
  const terminal = ['saved', 'failed', 'duplicate', 'needs_review'];
  const count = statuses => ({ $size: { $filter: { input: '$files', as: 'f', cond: { $in: ['$$f.status', statuses] } } } });
  await BulkImport.findByIdAndUpdate(batchId, [{ $set: {
    processedFiles: count(terminal), successfulFiles: count(['saved']), failedFiles: count(['failed']), duplicateFiles: count(['duplicate']), needsReviewFiles: count(['needs_review'])
  } }]);
}
/**
 * Finaliza un lote: calcula contadores y estado final
 */
async function finalizeBatch(batchId) {
  const batch = await BulkImport.findById(batchId).lean();
  if (!batch) return;

  const counts = batchCounts(batch.files);

  if (counts.processedFiles < batch.files.length) { await refreshCounts(batchId); return; }
  let status = 'completed';
  if (counts.failedFiles > 0 || counts.needsReviewFiles > 0) {
    status = 'completed_with_errors';
  }
  if (counts.successfulFiles === 0 && counts.failedFiles === batch.files.length) {
    status = 'failed';
  }

  await BulkImport.findByIdAndUpdate(batchId, {
    $set: {
      ...counts,
      status,
      completedAt: new Date()
    }
  });

  console.log(`[BulkImport] Lote ${batchId} finalizado: ${JSON.stringify(counts)}`);
}

async function claimBatch(batchId) {
  const claimed = await BulkImport.findOneAndUpdate({ _id: batchId, status: { $ne: 'processing' } }, { $set: { status: 'processing', completedAt: null } }, { new: true });
  if (!claimed) throw Object.assign(new Error('El lote sigue procesándose'), { status: 409 });
  return claimed;
}

/**
 * Reintenta todos los archivos fallidos de un lote
 * @param {string} batchId
 * @param {Object} fileBuffersMap - Map { fileIndex: Buffer }
 */
export async function retryFailedFiles(batchId, fileBuffersMap) {
  const batch = await BulkImport.findById(batchId);
  if (!batch) throw Object.assign(new Error('Lote no encontrado'), { status: 404 });
  if (batch.status === 'processing') throw Object.assign(new Error('El lote sigue procesándose'), { status: 409 });

  if (!batch.files.some(f => f.status === 'failed')) return batch;
  await claimBatch(batchId);
  // Resetear archivos fallidos a pending
  const failedIndices = [];
  for (let i = 0; i < batch.files.length; i++) {
    if (batch.files[i].status === 'failed') {
      failedIndices.push(i);
      await updateFileStatus(batchId, i, 'pending', {
        error: null,
        errorCode: null,
        processingTime: null
      });
    }
  }

  if (failedIndices.length === 0) {
    return batch;
  }

  await BulkImport.findByIdAndUpdate(batchId, { status: 'processing' });

  let rates;
  try {
    rates = await getDolarRates();
  } catch (err) {
    rates = {};
  }

  const semaphore = globalSemaphore;

  const promises = failedIndices.map(async (fileIndex) => {
    await semaphore.acquire();
    try {
      const buffer = fileBuffersMap[fileIndex] || await readBuffer(batchId, fileIndex).catch(() => null);
      if (!buffer) {
        await updateFileStatus(batchId, fileIndex, 'failed', { error: 'Volvé a seleccionar este PDF para reintentarlo.', errorCode: 'VALIDATION_ERROR' });
        return;
      }
      await processFile(batchId, fileIndex, buffer, rates);
    } finally { semaphore.release(); }

  });

  await Promise.all(promises);
  await finalizeBatch(batchId);

  return BulkImport.findById(batchId);
}

/**
 * Reintenta un archivo específico de un lote
 * @param {string} batchId
 * @param {number} fileIndex
 * @param {Buffer} buffer
 */
export async function retryFile(batchId, fileIndex, buffer) {
  const batch = await BulkImport.findById(batchId);
  if (!batch) throw Object.assign(new Error('Lote no encontrado'), { status: 404 });
  if (batch.status === 'processing') throw Object.assign(new Error('El lote sigue procesándose'), { status: 409 });
  if (!Number.isSafeInteger(fileIndex) || fileIndex < 0 || fileIndex >= batch.files.length) throw Object.assign(new Error('Índice de archivo inválido'), { status: 400 });

  const file = batch.files[fileIndex];
  if (file.status !== 'failed' && file.status !== 'needs_review') {
    throw Object.assign(new Error('El archivo no está en estado reintentable'), { status: 400 });
  }

  await claimBatch(batchId);
  // Resetear a pending
  await updateFileStatus(batchId, fileIndex, 'pending', {
    error: null,
    errorCode: null,
    processingTime: null
  });

  await BulkImport.findByIdAndUpdate(batchId, { status: 'processing' });

  let rates;
  try {
    rates = await getDolarRates();
  } catch (err) {
    rates = {};
  }

  await globalSemaphore.acquire();
  try { await processFile(batchId, fileIndex, buffer, rates); } finally { globalSemaphore.release(); }
  await finalizeBatch(batchId);

  return BulkImport.findById(batchId);
}

/**
 * Revisión manual: asigna período y guarda un archivo que estaba en needs_review
 * @param {string} batchId
 * @param {number} fileIndex
 * @param {{ year: number, month: number }} reviewData
 */
export async function reviewFile(batchId, fileIndex, reviewData) {
  if (!validPeriod({ mes: reviewData.month, anio: reviewData.year })) throw Object.assign(new Error('Período inválido'), { status: 400 });
  const batch = await BulkImport.findById(batchId).select('+files.extractedData');
  if (!batch) throw Object.assign(new Error('Lote no encontrado'), { status: 404 });
  if (batch.status === 'processing') throw Object.assign(new Error('El lote sigue procesándose'), { status: 409 });
  if (!Number.isSafeInteger(fileIndex) || fileIndex < 0 || fileIndex >= batch.files.length) throw Object.assign(new Error('Índice de archivo inválido'), { status: 400 });

  const file = batch.files[fileIndex];
  if (file.status !== 'needs_review') {
    throw Object.assign(new Error('El archivo no está en revisión'), { status: 400 });
  }

  if (reviewData.montoNeto !== undefined && (!Number.isFinite(Number(reviewData.montoNeto)) || Number(reviewData.montoNeto) < 0)) throw Object.assign(new Error('Monto inválido'), { status: 400 });
  if (!Number.isFinite(reviewData.montoNeto !== undefined ? Number(reviewData.montoNeto) : file.extractedData?.montoNeto)) throw Object.assign(new Error('Revisá el importe neto'), { status: 400 });
  await claimBatch(batchId);
  const startTime = Date.now();

  try {
    // Recuperar datos extraídos
    const extractedData = file.extractedData;
    if (!extractedData) {
      throw new Error('No se encontraron datos extraídos para este archivo');
    }

    if (reviewData.montoNeto !== undefined) extractedData.montoNeto = Number(reviewData.montoNeto);
    if (!Number.isFinite(extractedData.montoNeto) || extractedData.montoNeto < 0) throw Object.assign(new Error('Monto inválido'), { status: 400 });
    extractedData.extractionMethod ||= 'manual';
    // Aplicar período manual
    extractedData.periodo = {
      mes: reviewData.month,
      anio: reviewData.year
    };

    // Enriquecer con cotización dólar
    let rates;
    try {
      rates = await getDolarRates();
      enrichWithDolarRates(extractedData, rates);
    } catch (err) {
      // Continuar sin cotización
    }

    // Guardar recibo
    extractedData.archivoOriginal = file.originalName;
    extractedData.fileHash = file.fileHash;
    extractedData.bulkImportId = batchId;
    extractedData.periodSource = 'manual';

    const duplicateByHash = extractedData.fileHash ? await Receipt.findOne({ fileHash: extractedData.fileHash }).lean() : null;
    if (duplicateByHash) {
      await updateFileStatus(batchId, fileIndex, 'duplicate', { duplicateReceiptId: duplicateByHash._id });
      await finalizeBatch(batchId); return BulkImport.findById(batchId);
    }
    // Verificar duplicado por numeroRecibo
    if (extractedData.numeroRecibo) {
      const existingByNumber = await Receipt.findOne({ numeroRecibo: extractedData.numeroRecibo }).lean();
      if (existingByNumber) {
        await updateFileStatus(batchId, fileIndex, 'duplicate', { duplicateReceiptId: existingByNumber._id });
        await finalizeBatch(batchId);
        return BulkImport.findById(batchId);
      }
    }

    const receipt = new Receipt(extractedData);
    await receipt.save();

    await updateFileStatus(batchId, fileIndex, 'saved', {
      detectedYear: reviewData.year,
      detectedMonth: reviewData.month,
      periodSource: 'manual',
      receiptId: receipt._id,
      extractedData: null, // Limpiar datos temporales
      processingTime: Date.now() - startTime
    });

    await finalizeBatch(batchId);
    return BulkImport.findById(batchId);

  } catch (err) {
    if (err.code === 11000) {
      await updateFileStatus(batchId, fileIndex, 'duplicate'); await finalizeBatch(batchId); return BulkImport.findById(batchId);
    }
    await updateFileStatus(batchId, fileIndex, 'failed', {
      error: "No pudimos confirmar este recibo. Revisá los datos e intentá nuevamente.",
      errorCode: 'VALIDATION_ERROR',
      processingTime: Date.now() - startTime
    });
    await finalizeBatch(batchId);
    throw err;
  }
}

/**
 * Obtiene el estado de un lote
 */
export async function getBulkImportStatus(batchId) {
  const batch = await BulkImport.findById(batchId).select('+files.extractedData');
  if (!batch) throw Object.assign(new Error('Lote no encontrado'), { status: 404 });
  return batch;
}

/**
 * Elimina un lote (solo si no está en procesamiento)
 */
export async function deleteBulkImport(batchId) {
  const batch = await BulkImport.findById(batchId);
  if (!batch) throw Object.assign(new Error('Lote no encontrado'), { status: 404 });
  if (batch.status === 'processing') {
    throw new Error('No se puede eliminar un lote en procesamiento');
  }

  await BulkImport.findByIdAndDelete(batchId);
  await removeBuffers(batchId);
  return { deleted: true };
}

export async function recoverInterruptedBatches() {
  const batches = await BulkImport.find({ status: { $in: ['created', 'processing'] } });
  for (const batch of batches) {
    for (let i = 0; i < batch.files.length; i++) {
      if (['uploading', 'extracting', 'validating'].includes(batch.files[i].status)) await updateFileStatus(batch._id, i, 'pending');
    }
    processBulkImport(batch._id, []).catch(() => console.error('[BulkImport] No se pudo recuperar un lote.'));
  }
}

export default {
  createBulkImport,
  processBulkImport,
  retryFailedFiles,
  retryFile,
  reviewFile,
  getBulkImportStatus,
  deleteBulkImport
};
