import { pick } from '../middleware/validation.js';
import { sumMoney, cents } from '../services/finance.js';
import { sendError } from '../middleware/errors.js';
import express from 'express';
import Expense, { CATEGORIAS } from '../models/Expense.js';
import Receipt from '../models/Receipt.js';
import { validPeriod } from '../services/finance.js';
import { rankDescriptions, explainRanking } from '../services/expenseRanking.js';
import { monthWindow, weeklyExpenses } from '../services/weeklyExpenses.js';
import ExpenseBudget from '../models/ExpenseBudget.js';

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
 * GET /api/expenses
 * Listar gastos con filtros opcionales: ?mes=X&anio=Y&categoria=Z
 */
router.get('/', async (req, res) => {
    try {
        const { mes, anio, categoria } = req.query;
        const filter = {};

        if (mes) filter['periodo.mes'] = parseInt(mes);
        if (anio) filter['periodo.anio'] = parseInt(anio);
        if (categoria) filter.categoria = categoria;

        const expenses = await Expense.find(filter).sort({ createdAt: -1 });

        res.json({
            success: true,
            count: expenses.length,
            data: expenses
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/expenses/categorias
 * Devolver las categorías disponibles
 */
router.get('/categorias', (req, res) => {
    res.json({ success: true, data: CATEGORIAS });
});

router.get('/budgets', async (req, res) => {
    try {
        const periodo = { mes: Number(req.query.mes), anio: Number(req.query.anio) };
        if (!validPeriod(periodo)) return res.status(400).json({ success: false, error: 'Elegí el mes y año del presupuesto.' });
        const filter = { 'periodo.mes': periodo.mes, 'periodo.anio': periodo.anio };
        const [budgets, expenses] = await Promise.all([ExpenseBudget.find(filter).lean(), Expense.find(filter).select('categoria monto').lean()]);
        const data = budgets.map(b => {
            const gastado = sumMoney(expenses.filter(e => e.categoria === b.categoria).map(e => e.monto));
            return { categoria: b.categoria, limite: b.limite, gastado, porcentaje: Math.round(cents(gastado) / cents(b.limite) * 100), excedido: cents(gastado) > cents(b.limite), disponible: (cents(b.limite) - cents(gastado)) / 100 };
        }).sort((a,b) => b.porcentaje - a.porcentaje);
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.put('/budgets/:category', async (req, res) => {
    try {
        const { periodo, limite } = req.body;
        if (!CATEGORIAS.includes(req.params.category) || !validPeriod(periodo) || typeof limite !== 'number' || !Number.isFinite(limite) || limite <= 0 || !Number.isSafeInteger(cents(limite)) || Math.abs(limite - cents(limite) / 100) > 1e-8) return res.status(400).json({ success: false, error: 'Revisá la categoría y el límite del presupuesto (mayor a cero y hasta dos decimales).' });
        const filter = { categoria: req.params.category, 'periodo.mes': Number(periodo.mes), 'periodo.anio': Number(periodo.anio) };
        const data = await ExpenseBudget.findOneAndUpdate(filter, { $set: { limite } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.delete('/budgets/:category', async (req, res) => {
    try {
        const periodo = { mes: Number(req.query.mes), anio: Number(req.query.anio) };
        if (!CATEGORIAS.includes(req.params.category) || !validPeriod(periodo)) return res.status(400).json({ success: false, error: 'Revisá la categoría y el período.' });
        await ExpenseBudget.deleteOne({ categoria: req.params.category, 'periodo.mes': periodo.mes, 'periodo.anio': periodo.anio });
        res.json({ success: true });
    } catch (error) { sendError(res, error); }
});

/**
 * GET /api/expenses/summary
 * Resumen de gastos por período: total, por categoría, balance vs ingreso
 * Query: ?mes=X&anio=Y
 */
router.get('/summary', async (req, res) => {
    try {
        const { mes, anio } = req.query;

        if (!mes || !anio) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren parámetros mes y anio'
            });
        }

        const filter = {
            'periodo.mes': parseInt(mes),
            'periodo.anio': parseInt(anio)
        };

        const [expenses, invoices] = await Promise.all([
            Expense.find(filter).lean(),
            Receipt.find({ ...filter, categoria: 'factura', tipoMovimiento: 'GASTO' }).select('montoNeto').lean()
        ]);

        // Total gastado
        const totalGastos = sumMoney([...expenses.map(e => e.monto), ...invoices.map(r => r.montoNeto)]);

        // Agrupar por categoría
        const porCategoria = {};
        for (const e of expenses) {
            if (!porCategoria[e.categoria]) {
                porCategoria[e.categoria] = { categoria: e.categoria, total: 0, count: 0 };
            }
            porCategoria[e.categoria].total = sumMoney([porCategoria[e.categoria].total, e.monto]);
            porCategoria[e.categoria].count++;
        }

        if (invoices.length) porCategoria.facturas = { categoria: 'facturas', total: sumMoney(invoices.map(r => r.montoNeto)), count: invoices.length };

        res.json({
            success: true,
            data: {
                periodo: { mes: parseInt(mes), anio: parseInt(anio) },
                totalGastos,
                cantidadGastos: expenses.length + invoices.length,
                porCategoria: Object.values(porCategoria).sort((a, b) => b.total - a.total)
            }
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/expenses/:id
 * Obtener un gasto específico
 */
router.get('/weekly', async (req, res) => {
    try {
        const periodo = { mes: Number(req.query.mes), anio: Number(req.query.anio) };
        if (!validPeriod(periodo)) return res.status(400).json({ success: false, error: 'Elegí el mes y año para ver los gastos semanales.' });
        const { inicio, fin } = monthWindow(periodo);
        const datedOrUndated = field => ({ $or: [
            { [field]: { $gte: inicio, $lt: fin } },
            { [field]: null, 'periodo.mes': periodo.mes, 'periodo.anio': periodo.anio }
        ] });
        const [expenses, receipts] = await Promise.all([
            Expense.find(datedOrUndated('fecha')).select('fecha monto periodo').lean(),
            Receipt.find({ ...datedOrUndated('fechaAcreditacion'), categoria: 'factura', tipoMovimiento: 'GASTO' }).select('fechaAcreditacion montoNeto periodo categoria tipoMovimiento').lean()
        ]);
        res.json({ success: true, data: weeklyExpenses(expenses, receipts, periodo) });
    } catch (error) { sendError(res, error); }
});

router.get('/description-ranking', async (req, res) => {
    try {
        const periodo = { mes: Number(req.query.mes), anio: Number(req.query.anio) };
        if (!validPeriod(periodo)) return res.status(400).json({ success: false, error: 'Elegí el mes y año de la consulta.' });
        const filter = { 'periodo.mes': periodo.mes, 'periodo.anio': periodo.anio };
        const [expenses, receipts] = await Promise.all([
            Expense.find(filter).select('descripcion monto').lean(),
            Receipt.find({ ...filter, categoria: 'factura', tipoMovimiento: 'GASTO' }).select('categoria tipoMovimiento montoNeto items.descripcion empleador.nombre archivoOriginal').lean()
        ]);
        const data = rankDescriptions(expenses, receipts);
        res.json({ success: true, data: { periodo, ...data, ...await explainRanking(data, periodo) } });
    } catch (error) { sendError(res, error); }
});

router.get('/:id', async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id);

        if (!expense) {
            return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
        }

        res.json({ success: true, data: expense });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * POST /api/expenses
 * Crear un nuevo gasto
 */
router.post('/', async (req, res) => {
    try {
        const { monto, categoria, periodo, fecha, descripcion, medioPago } = req.body;

        if (!monto || !categoria || !periodo?.mes || !periodo?.anio) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren monto, categoria y periodo (mes, anio)'
            });
        }

        const expense = new Expense({
            monto,
            categoria,
            periodo: {
                mes: parseInt(periodo.mes),
                anio: parseInt(periodo.anio)
            },
            fecha: fecha ? new Date(fecha) : undefined,
            descripcion: descripcion || '',
            medioPago: medioPago || null
        });

        await expense.save();

        res.status(201).json({
            success: true,
            message: 'Gasto registrado correctamente',
            data: expense
        });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * PUT /api/expenses/:id
 * Actualizar un gasto
 */
router.put('/:id', async (req, res) => {
    try {
        const updates = pick(req.body, ['monto', 'categoria', 'periodo', 'fecha', 'descripcion', 'medioPago']);

        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        if (!expense) {
            return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
        }

        res.json({ success: true, data: expense });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * DELETE /api/expenses/:id
 * Eliminar un gasto
 */
router.delete('/:id', async (req, res) => {
    try {
        const expense = await Expense.findByIdAndDelete(req.params.id);

        if (!expense) {
            return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
        }

        res.json({ success: true, message: 'Gasto eliminado' });
    } catch (error) {
        sendError(res, error);
    }
});

export default router;
