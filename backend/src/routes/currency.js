import { sendError } from '../middleware/errors.js';
import express from 'express';
import { getDolarRates, convertToUSD } from '../services/dolarApi.js';

const router = express.Router();

/**
 * GET /api/currency
 * Obtener cotizaciones actuales del dólar
 */
router.get('/', async (req, res) => {
    try {
        const rates = await getDolarRates();

        res.json({
            success: true,
            data: rates
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/currency/refresh
 * Forzar actualización de cotizaciones
 */
router.get('/refresh', async (req, res) => {
    try {
        const rates = await getDolarRates(true); // forceRefresh = true

        res.json({
            success: true,
            message: 'Cotizaciones actualizadas',
            data: rates
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * POST /api/currency/convert
 * Convertir un monto de ARS a USD
 */
router.post('/convert', async (req, res) => {
    try {
        const { amount, tipo = 'oficial' } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Se requiere un monto válido' });
        }

        const result = await convertToUSD(amount, tipo);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        sendError(res, error);
    }
});

export default router;
