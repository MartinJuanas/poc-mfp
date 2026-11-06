import { pick } from '../middleware/validation.js';
import { sendError } from '../middleware/errors.js';
import express from 'express';
import Goal from '../models/Goal.js';
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


/**
 * GET /api/goals
 * Listar todas las metas
 */
router.get('/', async (req, res) => {
    try {
        const { tipo, completada } = req.query;
        const filter = {};

        if (tipo) filter.tipo = tipo;
        if (completada !== undefined) filter.completada = completada === 'true';

        const goals = await Goal.find(filter).sort({ createdAt: -1 });

        res.json({
            success: true,
            count: goals.length,
            data: goals
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/goals/summary
 * Resumen de metas activas
 */
router.get('/summary', async (req, res) => {
    try {
        const goals = await Goal.find({ completada: false });
        const rates = await getDolarRates().catch(() => ({}));

        let totalAhorro = 0;
        let totalInversion = 0;
        let metasAhorro = 0;
        let metasInversion = 0;

        for (const goal of goals) {
            if (goal.tipo === 'ahorro') {
                metasAhorro++;
                totalAhorro += goal.moneda === 'USD' ? (rates.blue?.venta > 0 ? goal.montoActual * rates.blue.venta : 0) : goal.montoActual;
            } else {
                metasInversion++;
                totalInversion += goal.moneda === 'USD' ? (rates.blue?.venta > 0 ? goal.montoActual * rates.blue.venta : 0) : goal.montoActual;
            }
        }

        res.json({
            success: true,
            data: {
                metasActivas: goals.length,
                metasAhorro,
                metasInversion,
                totalAhorro,
                totalesPorMoneda: { ARS: goals.filter(g => g.moneda !== "USD").reduce((s, g) => s + g.montoActual, 0), USD: goals.filter(g => g.moneda === "USD").reduce((s, g) => s + g.montoActual, 0) },
                conversionIncompleta: goals.some(g => g.moneda === "USD") && !(rates.blue?.venta > 0),
                totalInversion,
                totalEnDolarBlue: rates.blue ? Math.round(((totalAhorro + totalInversion) / rates.blue.venta) * 100) / 100 : null,
                totalEnDolarCripto: rates.cripto ? Math.round(((totalAhorro + totalInversion) / rates.cripto.venta) * 100) / 100 : null,
                cotizacion: rates
            }
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/goals/:id
 * Obtener una meta específica
 */
router.get('/:id', async (req, res) => {
    try {
        const goal = await Goal.findById(req.params.id);

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Meta no encontrada' });
        }

        res.json({ success: true, data: goal });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * POST /api/goals
 * Crear una nueva meta
 */
router.post('/', async (req, res) => {
    try {
        const { nombre, tipo, montoObjetivo, moneda, fechaObjetivo, montoActual, subtipo, rendimientoMensual } = req.body;

        if (!nombre || !tipo) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren nombre y tipo'
            });
        }

        const initialAmount = montoActual ? parseFloat(montoActual) : 0;
        const initialAportes = [];

        if (initialAmount > 0) {
            initialAportes.push({
                monto: initialAmount,
                descripcion: 'Saldo Inicial',
                fecha: new Date()
            });
        }

        const goal = new Goal({
            nombre,
            tipo,
            montoObjetivo: montoObjetivo || 0,
            montoActual: initialAmount,
            moneda: moneda || 'ARS',
            fechaObjetivo: fechaObjetivo ? new Date(fechaObjetivo) : null,
            subtipo: subtipo || '',
            rendimientoMensual: rendimientoMensual || 0,
            aportes: initialAportes,
            completada: Number(montoObjetivo) > 0 && initialAmount >= Number(montoObjetivo)
        });

        await goal.save();

        res.status(201).json({
            success: true,
            message: 'Meta creada correctamente',
            data: goal
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * PUT /api/goals/:id
 * Actualizar una meta
 */
router.put('/:id', async (req, res) => {
    try {
        const updates = pick(req.body, ['nombre', 'tipo', 'montoObjetivo', 'montoActual', 'moneda', 'fechaObjetivo', 'subtipo', 'rendimientoMensual']);

        const goal = await Goal.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Meta no encontrada' });
        }

        // Verificar si se completó
        await Goal.updateOne({ _id: goal._id }, [
            { $set: { completada: { $and: [{ $gt: ['$montoObjetivo', 0] }, { $gte: ['$montoActual', '$montoObjetivo'] }] } } }
        ]);
        res.json({ success: true, data: await Goal.findById(goal._id) });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * POST /api/goals/:id/aportes
 * Agregar un aporte a una meta
 */
router.post('/:id/aportes', async (req, res) => {
    try {
        const { monto, descripcion } = req.body;

        if (!monto || monto <= 0) {
            return res.status(400).json({ success: false, error: 'Se requiere un monto válido' });
        }

        const contribution = Math.round(Number(monto) * 100) / 100;
        if (!(contribution > 0)) return res.status(400).json({ success: false, error: 'Ingresá un monto mayor a cero.' });
        const goal = await Goal.findByIdAndUpdate(req.params.id, [
            { $set: {
                montoActual: { $round: [{ $add: ['$montoActual', contribution] }, 2] },
                aportes: { $concatArrays: [{ $ifNull: ['$aportes', []] }, [{ monto: contribution, descripcion: { $literal: String(descripcion || '') }, fecha: new Date() }]] }
            } },
            { $set: { completada: { $and: [{ $gt: ['$montoObjetivo', 0] }, { $gte: ['$montoActual', '$montoObjetivo'] }] } } }
        ], { new: true });
        if (!goal) return res.status(404).json({ success: false, error: 'Meta no encontrada' });

        res.json({
            success: true,
            message: `Aporte de $${monto} registrado`,
            data: goal
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * DELETE /api/goals/:id
 * Eliminar una meta
 */
router.delete('/:id', async (req, res) => {
    try {
        const goal = await Goal.findByIdAndDelete(req.params.id);

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Meta no encontrada' });
        }

        res.json({ success: true, message: 'Meta eliminada' });
    } catch (error) {
        sendError(res, error);
    }
});

export default router;
