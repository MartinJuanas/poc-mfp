import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateFile } from '../services/fileValidator.js';
import { uploadConfig } from '../services/uploadConfig.js';
import { summarize, calculateReceipt } from '../services/finance.js';
import { pick } from '../middleware/validation.js';
import { sendError } from '../middleware/errors.js';
import express from 'express';
import multer from 'multer';
import Receipt from '../models/Receipt.js';
import { parseReceipt, parseMultipleReceipts } from '../services/pdfParser.js';
import { getDolarRates, convertToUSD } from '../services/dolarApi.js';

const router = express.Router();
for (const param of ['id', 'batchId']) router.param(param, (req, res, next, value) => {
  if (!/^[a-f\d]{24}$/i.test(value)) return res.status(400).json({ success: false, error: 'El identificador no es válido.' });
  next();
});
router.param('fileIndex', (req, res, next, value) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(400).json({ success: false, error: 'El archivo seleccionado no es válido.' });
  next();
});


// Configurar multer para subida de archivos
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: uploadConfig().maxFileSizeMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'), false);
        }
    }
});

/**
 * GET /api/receipts
 * Listar todos los recibos
 */
router.get('/', async (req, res) => {
    try {
        const receipts = await Receipt.find()
            .sort({ fechaAcreditacion: -1, 'periodo.anio': -1, 'periodo.mes': -1 })
            .lean();

        res.json({
            success: true,
            count: receipts.length,
            data: receipts
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/receipts/compare
 * Comparar dos recibos por ID
 */
router.get('/compare', async (req, res) => {
    try {
        const { idA, idB } = req.query;

        if (!idA || !idB) {
            return res.status(400).json({ success: false, error: 'Se requieren idA e idB' });
        }

        const [receiptA, receiptB] = await Promise.all([
            Receipt.findById(idA).lean(),
            Receipt.findById(idB).lean()
        ]);

        if (!receiptA || !receiptB) {
            return res.status(404).json({ success: false, error: 'Uno o ambos recibos no encontrados' });
        }

        // Normalizar: convertir haberes y retenciones del Receipt en una lista unificada
        const normalizeItems = (receipt) => {
            const items = [];

            // Helper para generar código si no existe
            const getCode = (item) => {
                if (item.codigo) return item.codigo;
                // Generar código basado en descripción (slug-like)
                return (item.descripcion || 'unknown')
                    .toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
                    .replace(/[^a-z0-9]/g, '_'); // replace non-alphanumeric with underscore
            };

            // Haberes: monto = haberesConAporte + haberesSinAporte
            (receipt.haberes || []).forEach(h => {
                items.push({
                    codigo: getCode(h),
                    descripcion: h.descripcion || 'Sin descripción',
                    tipo: 'haber',
                    monto: (h.haberesConAporte || 0) + (h.haberesSinAporte || 0)
                });
            });

            // Retenciones: monto = importe
            (receipt.retenciones || []).forEach(r => {
                items.push({
                    codigo: getCode(r),
                    descripcion: r.descripcion || 'Sin descripción',
                    tipo: 'descuento',
                    monto: r.importe || 0
                });
            });

            return items;
        };

        // Agrupar items por código
        const groupItems = (items) => {
            const map = new Map();
            items.forEach(item => {
                // Ahora siempre tendremos un código (real o generado)
                if (!map.has(item.codigo)) {
                    map.set(item.codigo, { ...item });
                } else {
                    // Si el código se repite, sumar montos
                    const existing = map.get(item.codigo);
                    existing.monto += item.monto;
                }
            });
            return map;
        };

        const itemsA = groupItems(normalizeItems(receiptA));
        const itemsB = groupItems(normalizeItems(receiptB));

        // Unificar todos los códigos
        const allCodes = new Set([...itemsA.keys(), ...itemsB.keys()]);
        const comparison = [];

        allCodes.forEach(code => {
            const itemA = itemsA.get(code);
            const itemB = itemsB.get(code);

            const montoA = itemA ? itemA.monto : 0;
            const montoB = itemB ? itemB.monto : 0;
            const delta = montoB - montoA;

            // Determinar descripción y tipo (preferir B, sino A)
            const baseItem = itemB || itemA;

            comparison.push({
                codigo: code,
                descripcion: baseItem.descripcion,
                tipo: baseItem.tipo,
                montoA,
                montoB,
                delta,
                isNew: !itemA && !!itemB,
                isRemoved: !!itemA && !itemB
            });
        });

        // Calcular totales globales
        const globalStats = {
            bruto: {
                A: receiptA.totalHaberes || 0,
                B: receiptB.totalHaberes || 0,
                delta: (receiptB.totalHaberes || 0) - (receiptA.totalHaberes || 0)
            },
            neto: {
                A: receiptA.montoNeto || 0,
                B: receiptB.montoNeto || 0,
                delta: (receiptB.montoNeto || 0) - (receiptA.montoNeto || 0)
            },
            retenciones: {
                A: receiptA.totalRetenciones || 0,
                B: receiptB.totalRetenciones || 0,
                delta: (receiptB.totalRetenciones || 0) - (receiptA.totalRetenciones || 0)
            }
        };

        res.json({
            success: true,
            data: {
                receiptA: { period: receiptA.periodo, id: receiptA._id },
                receiptB: { period: receiptB.periodo, id: receiptB._id },
                globalStats,
                items: comparison.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            }
        });

    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/receipts/stats
 * Obtener estadísticas de ingresos
 */
router.get('/stats', async (req, res) => {
    try {
        const receipts = await Receipt.find().lean();

        if (receipts.length === 0) {
            return res.json({
                success: true,
                data: { totalRecibos: 0, promedioMensual: 0 }
            });
        }

        const summary = summarize(receipts, []);
        const totalIngresos = summary.totalNeto;
        const promedioMensual = summary.promedioNeto;

        // Obtener cotización actual
        const rates = await getDolarRates().catch(() => ({}));

        // Calcular totales en USD
        const totalEnDolarOficial = rates.oficial ? totalIngresos / rates.oficial.venta : null;
        const totalEnDolarBlue = rates.blue ? totalIngresos / rates.blue.venta : null;
        const totalEnDolarCripto = rates.cripto ? totalIngresos / rates.cripto.venta : null;

        res.json({
            success: true,
            data: {
                totalRecibos: receipts.length,
                totalIngresos,
                promedioMensual: Math.round(promedioMensual * 100) / 100,
                totalEnDolarOficial: totalEnDolarOficial ? Math.round(totalEnDolarOficial * 100) / 100 : null,
                totalEnDolarBlue: totalEnDolarBlue ? Math.round(totalEnDolarBlue * 100) / 100 : null,
                totalEnDolarCripto: totalEnDolarCripto ? Math.round(totalEnDolarCripto * 100) / 100 : null,
                cotizacionActual: rates
            }
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/receipts/:id
 * Obtener un recibo específico
 */
router.get('/:id', async (req, res) => {
    try {
        const receipt = await Receipt.findById(req.params.id);

        if (!receipt) {
            return res.status(404).json({ success: false, error: 'Recibo no encontrado' });
        }

        res.json({ success: true, data: receipt });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * POST /api/receipts/analyze
 * Analizar PDF y devolver datos sin guardar (Draft Mode)
 */
router.post('/analyze', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se envió ningún archivo' });
        }

        const validation = await validateFile(req.file);
        if (!validation.valid) return res.status(400).json({ success: false, error: validation.errors.join('; ') });
        const duplicate = await Receipt.findOne({ fileHash: validation.hash }).lean();
        if (duplicate) return res.status(409).json({ success: false, error: 'Este archivo ya fue procesado anteriormente.', existingId: duplicate._id });
        // Parsear el PDF
        const parsedData = await parseReceipt(req.file.buffer);

        // Obtener cotización actual para referencia
        const rates = await getDolarRates().catch(() => ({}));
        parsedData.cotizacionDolar = {
            oficial: rates.oficial?.venta,
            blue: rates.blue?.venta,
            mayorista: rates.mayorista?.venta,
            cripto: rates.cripto?.venta
        };

        if (parsedData.montoNeto) {
            parsedData.montoEnDolares = {
                oficial: rates.oficial ? Math.round((parsedData.montoNeto / rates.oficial.venta) * 100) / 100 : null,
                blue: rates.blue ? Math.round((parsedData.montoNeto / rates.blue.venta) * 100) / 100 : null,
                mayorista: rates.mayorista ? Math.round((parsedData.montoNeto / rates.mayorista.venta) * 100) / 100 : null,
                cripto: rates.cripto ? Math.round((parsedData.montoNeto / rates.cripto.venta) * 100) / 100 : null
            };
        }

        parsedData.archivoOriginal = req.file.originalname;
        parsedData.fileHash = validation.hash;

        res.json({
            success: true,
            data: parsedData
        });
    } catch (error) {
        console.error('Error analizando recibo:', error);
        sendError(res, error);
    }
});

/**
 * POST /api/receipts
 * Guardar un recibo confirmado (desde JSON)
 */
router.post('/', async (req, res) => {
    try {
        const receiptData = pick(req.body, ['numeroRecibo', 'periodo', 'diasTrabajo', 'montoNeto', 'totalHaberes', 'totalRetenciones', 'cuil', 'empleado', 'empleador', 'banco', 'numeroCuenta', 'fechaAcreditacion', 'haberes', 'retenciones', 'items', 'subtotal', 'iva', 'obraSocial', 'tipoRecibo', 'categoria', 'tipoMovimiento', 'motivoCategoria', 'moneda', 'archivoOriginal', 'fileHash', 'extractionMethod', 'extractionWarning', 'cotizacionDolar', 'montoEnDolares']);
        receiptData.numeroRecibo ||= `MANUAL-${crypto.randomUUID()}`;

        // Verificar si ya existe por número
        if (receiptData.numeroRecibo) {
            const existing = await Receipt.findOne({ numeroRecibo: receiptData.numeroRecibo });
            if (existing) {
                return res.status(409).json({
                    success: false,
                    error: 'Ya existe un comprobante con este número',
                    existingId: existing._id
                });
            }
        }

        const receipt = new Receipt(receiptData);
        await receipt.save();

        res.status(201).json({
            success: true,
            message: 'Comprobante guardado correctamente',
            data: receipt
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * PUT /api/receipts/:id
 * Actualizar un recibo existente
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = pick(req.body, ['numeroRecibo', 'periodo', 'diasTrabajo', 'montoNeto', 'totalHaberes', 'totalRetenciones', 'cuil', 'empleado', 'empleador', 'banco', 'numeroCuenta', 'fechaAcreditacion', 'haberes', 'retenciones', 'items', 'subtotal', 'iva', 'obraSocial', 'tipoRecibo', 'categoria', 'tipoMovimiento', 'motivoCategoria', 'moneda', 'archivoOriginal', 'fileHash', 'extractionMethod', 'extractionWarning', 'cotizacionDolar', 'montoEnDolares']);
        delete updateData.fileHash;

        const receipt = await Receipt.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!receipt) {
            return res.status(404).json({ success: false, error: 'Comprobante no encontrado' });
        }

        res.json({
            success: true,
            message: 'Comprobante actualizado',
            data: receipt
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * POST /api/receipts/upload
 * Subir y procesar un PDF de recibo de sueldo (Legacy / Direct Upload)
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se envió ningún archivo' });
        }

        const validation = await validateFile(req.file);
        if (!validation.valid) return res.status(400).json({ success: false, error: validation.errors.join('; ') });
        const duplicate = await Receipt.findOne({ fileHash: validation.hash }).lean();
        if (duplicate) return res.status(409).json({ success: false, error: 'Este archivo ya fue procesado anteriormente.', existingId: duplicate._id });
        // Parsear el PDF
        const parsedData = await parseReceipt(req.file.buffer);

        // Obtener cotización actual
        const rates = await getDolarRates().catch(() => ({}));

        // Agregar cotización y conversión
        parsedData.cotizacionDolar = {
            oficial: rates.oficial?.venta,
            blue: rates.blue?.venta,
            mayorista: rates.mayorista?.venta,
            cripto: rates.cripto?.venta
        };

        if (parsedData.montoNeto) {
            parsedData.montoEnDolares = {
                oficial: rates.oficial ? Math.round((parsedData.montoNeto / rates.oficial.venta) * 100) / 100 : null,
                blue: rates.blue ? Math.round((parsedData.montoNeto / rates.blue.venta) * 100) / 100 : null,
                mayorista: rates.mayorista ? Math.round((parsedData.montoNeto / rates.mayorista.venta) * 100) / 100 : null,
                cripto: rates.cripto ? Math.round((parsedData.montoNeto / rates.cripto.venta) * 100) / 100 : null
            };
        }

        parsedData.archivoOriginal = req.file.originalname;
        parsedData.fileHash = validation.hash;

        // Verificar si ya existe
        const existing = parsedData.numeroRecibo ? await Receipt.findOne({ numeroRecibo: parsedData.numeroRecibo }) : null;
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'Este recibo ya fue cargado',
                existingId: existing._id
            });
        }

        // Guardar en MongoDB
        const receipt = new Receipt(parsedData);
        await receipt.save();

        // Eliminar texto completo de la respuesta
        const responseData = receipt.toObject();
        delete responseData.textoCompleto;

        res.status(201).json({
            success: true,
            message: 'Recibo procesado correctamente',
            data: responseData
        });
    } catch (error) {
        console.error('Error procesando recibo:', error);
        sendError(res, error);
    }
});

/**
 * POST /api/receipts/import-folder
 * Importar PDFs desde una carpeta del servidor
 */
router.post('/import-folder', async (req, res) => {
    try {
        const { folderPath } = req.body;
        const allowedRoot = process.env.IMPORT_FOLDER_ROOT;
        if (!allowedRoot) return res.status(403).json({ success: false, error: 'La importación desde el servidor no está habilitada. Usá Carga masiva.' });
        const resolved = fs.realpathSync(path.resolve(folderPath || ''));
        const relative = path.relative(fs.realpathSync(path.resolve(allowedRoot)), resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return res.status(403).json({ success: false, error: 'La carpeta está fuera del directorio permitido.' });

        if (!folderPath) {
            return res.status(400).json({ success: false, error: 'Se requiere folderPath' });
        }

        const parsedReceipts = await parseMultipleReceipts(resolved);
        const rates = await getDolarRates().catch(() => ({}));

        let imported = 0;
        let skipped = 0;
        const errors = [];

        for (const parsedData of parsedReceipts) {
            try {
                // Agregar cotización
                parsedData.cotizacionDolar = {
                    oficial: rates.oficial?.venta,
                    blue: rates.blue?.venta,
                    mayorista: rates.mayorista?.venta,
                    cripto: rates.cripto?.venta
                };

                if (parsedData.montoNeto) {
                    parsedData.montoEnDolares = {
                        oficial: rates.oficial ? Math.round((parsedData.montoNeto / rates.oficial.venta) * 100) / 100 : null,
                        blue: rates.blue ? Math.round((parsedData.montoNeto / rates.blue.venta) * 100) / 100 : null,
                        mayorista: rates.mayorista ? Math.round((parsedData.montoNeto / rates.mayorista.venta) * 100) / 100 : null,
                        cripto: rates.cripto ? Math.round((parsedData.montoNeto / rates.cripto.venta) * 100) / 100 : null
                    };
                }

                // Verificar si ya existe
                const existing = parsedData.numeroRecibo ? await Receipt.findOne({ numeroRecibo: parsedData.numeroRecibo }) : null;
                if (existing) {
                    skipped++;
                    continue;
                }

                const receipt = new Receipt(parsedData);
                await receipt.save();
                imported++;
            } catch (err) {
                errors.push({ file: parsedData.archivoOriginal, error: 'No se pudo guardar este documento. Revisá los datos e intentá nuevamente.' });
            }
        }

        res.json({
            success: true,
            message: `Importación completada`,
            data: {
                total: parsedReceipts.length,
                imported,
                skipped,
                errors
            }
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * DELETE /api/receipts/:id
 * Eliminar un recibo
 */
router.delete('/:id', async (req, res) => {
    try {
        const receipt = await Receipt.findByIdAndDelete(req.params.id);

        if (!receipt) {
            return res.status(404).json({ success: false, error: 'Recibo no encontrado' });
        }

        res.json({ success: true, message: 'Recibo eliminado' });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/calculate', (req, res) => {
    try { res.json(calculateReceipt(req.body)); } catch (error) { sendError(res, Object.assign(error, { status: 400 })); }
});

export default router;
