import { uploadConfig } from '../services/uploadConfig.js';
import { storeBuffers, removeBuffers } from '../services/bulkStorage.js';
import { sendError } from '../middleware/errors.js';
import express from 'express';
import multer from 'multer';
import bulkService from '../services/bulkService.js';
import { validateBatch } from '../services/fileValidator.js';

const router = express.Router();
for (const param of ['id', 'batchId']) router.param(param, (req, res, next, value) => {
  if (!/^[a-f\d]{24}$/i.test(value)) return res.status(400).json({ success: false, error: 'El identificador no es válido.' });
  next();
});
router.param('fileIndex', (req, res, next, value) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(400).json({ success: false, error: 'El archivo seleccionado no es válido.' });
  next();
});


const maxBulkFiles = uploadConfig().maxBulkFiles;
const maxFileSizeMB = uploadConfig().maxFileSizeMB;

// Configurar multer para carga masiva
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSizeMB * 1024 * 1024,
    files: maxBulkFiles
  },
  fileFilter: (req, file, cb) => {
    // Permitir cualquier extensión/mimetype en multer, validaremos a fondo en el servicio
    cb(null, true);
  }
});

router.get('/config', (req, res) => res.json({ success: true, data: uploadConfig() }));

/**
 * POST /api/receipts/bulk
 * Iniciar carga masiva de recibos
 */
router.post('/', upload.array('pdfs', maxBulkFiles), async (req, res) => {
  try {
    const files = req.files;
    let relativePaths = [];

    if (req.body.relativePaths) {
      try {
        relativePaths = typeof req.body.relativePaths === 'string'
          ? JSON.parse(req.body.relativePaths)
          : req.body.relativePaths;
      } catch (e) {
        relativePaths = [];
      }
    }

    // Validar lote
    const batchValidation = validateBatch(files);
    if (!batchValidation.valid) {
      return res.status(400).json({
        success: false,
        error: batchValidation.errors.join('; ')
      });
    }

    if (!Array.isArray(relativePaths) || relativePaths.some(p => typeof p !== 'string')) return res.status(400).json({ success: false, error: 'Las rutas de los archivos no son válidas.' });
    // Crear registro de lote
    const bulkImport = await bulkService.createBulkImport(files, relativePaths);

    try { await storeBuffers(bulkImport._id, files); }
    catch (error) { await bulkService.deleteBulkImport(bulkImport._id); throw error; }
    // Iniciar procesamiento asíncrono en background (no bloquea respuesta)
    bulkService.processBulkImport(bulkImport._id, []).catch(err => {
      console.error(`[BulkRoutes] Error en procesamiento asíncrono del lote ${bulkImport._id}:`, err);
    });

    res.status(202).json({
      success: true,
      message: 'Carga masiva iniciada',
      data: bulkImport
    });
  } catch (error) {
    console.error('Error al iniciar carga masiva:', error);
    sendError(res, error);
  }
});

/**
 * GET /api/receipts/bulk/:batchId
 * Obtener estado de un lote de importación
 */
router.get('/:batchId', async (req, res) => {
  try {
    const bulkImport = await bulkService.getBulkImportStatus(req.params.batchId);
    res.json({ success: true, data: bulkImport });
  } catch (error) {
    const statusCode = error.message === 'Lote no encontrado' ? 404 : 500;
    sendError(res, Object.assign(error, { status: statusCode }));
  }
});

/**
 * POST /api/receipts/bulk/:batchId/retry
 * Reintentar todos los archivos fallidos de un lote
 */
router.post('/:batchId/retry', upload.array('pdfs', maxBulkFiles), async (req, res) => {
  try {
    const files = req.files || [];
    let fileBuffersMap = {};

    if (files.length > 0) {
      // Mapear por nombre original
      files.forEach(f => {
        fileBuffersMap[f.originalname] = f.buffer;
      });

      // Mapear también por índice si viene relativePaths/indices
      let indices = [];
      if (req.body.indices) {
        try {
          indices = typeof req.body.indices === 'string' ? JSON.parse(req.body.indices) : req.body.indices;
          indices.forEach((idx, i) => {
            if (files[i]) fileBuffersMap[idx] = files[i].buffer;
          });
        } catch (e) {}
      }
    }

    const updatedBatch = await bulkService.retryFailedFiles(req.params.batchId, fileBuffersMap);

    res.json({
      success: true,
      message: 'Reintento iniciado',
      data: updatedBatch
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /api/receipts/bulk/:batchId/files/:fileIndex/retry
 * Reintentar un archivo específico de un lote
 */
router.post('/:batchId/files/:fileIndex/retry', upload.single('pdf'), async (req, res) => {
  try {
    const { batchId, fileIndex } = req.params;
    const idx = parseInt(fileIndex, 10);

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Se requiere el archivo PDF para reintentar' });
    }

    const updatedBatch = await bulkService.retryFile(batchId, idx, req.file.buffer);

    res.json({
      success: true,
      message: 'Reintento de archivo completado',
      data: updatedBatch
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /api/receipts/bulk/:batchId/files/:fileIndex/review
 * Asignar período manual y guardar archivo en estado needs_review
 */
router.post('/:batchId/files/:fileIndex/review', async (req, res) => {
  try {
    const { batchId, fileIndex } = req.params;
    const { year, month, montoNeto } = req.body;

    if (!year || !month) {
      return res.status(400).json({ success: false, error: 'Se requieren year y month' });
    }

    const updatedBatch = await bulkService.reviewFile(batchId, parseInt(fileIndex, 10), {
      year: parseInt(year, 10),
      month: Number(month),
      montoNeto
    });

    res.json({
      success: true,
      message: 'Archivo revisado y guardado correctamente',
      data: updatedBatch
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * DELETE /api/receipts/bulk/:batchId
 * Eliminar un registro de lote
 */
router.delete('/:batchId', async (req, res) => {
  try {
    const result = await bulkService.deleteBulkImport(req.params.batchId);
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
