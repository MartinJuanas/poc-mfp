import { sendError } from '../middleware/errors.js';
import express from 'express';
import Receipt from '../models/Receipt.js';
import Goal from '../models/Goal.js';
import Expense from '../models/Expense.js';

import { summarize, monthlyTotals, isIncome, cashPeriod, inCashYear } from '../services/finance.js';
const router = express.Router();

/**
 * GET /api/dashboard/years
 * Obtener años disponibles en los recibos
 */
router.get('/years', async (req, res) => {
    try {
        const [receipts, expenseYears] = await Promise.all([Receipt.find().select('periodo fechaAcreditacion tipoMovimiento').lean(), Expense.distinct('periodo.anio')]);
        const receiptYears = receipts.map(r => cashPeriod(r)?.anio);
        const years = [...new Set([...receiptYears, ...expenseYears])];
        // Filtrar nulos y ordenar descendente
        const validYears = years.filter(y => y != null).sort((a, b) => b - a);
        res.json({ success: true, data: validYears });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/dashboard/summary
 * Resumen general del dashboard
 */
router.get('/summary', async (req, res) => {
    try {
        const { year } = req.query;
        const receipts = (await Receipt.find().lean()).filter(r => inCashYear(r, year));

        // Filtro para gastos (misma lógica de período)
        const expenseFilter = {};
        if (year && year !== 'historical') {
            expenseFilter['periodo.anio'] = parseInt(year);
        }
        const expenses = await Expense.find(expenseFilter).lean();

        res.json({ success: true, data: summarize(receipts, expenses) });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/dashboard/monthly
 * Ingresos mensuales para gráfico de curva
 */
router.get('/monthly', async (req, res) => {
    try {
        const { year } = req.query;
        const receipts = (await Receipt.find().lean()).filter(r => inCashYear(r, year));

        // Filtro para gastos
        const expenseFilter = {
            'periodo.mes': { $ne: null },
            'periodo.anio': { $ne: null }
        };
        if (year && year !== 'historical') {
            expenseFilter['periodo.anio'] = parseInt(year);
        }
        const expenses = await Expense.find(expenseFilter).lean();

        res.json({ success: true, data: monthlyTotals(receipts, expenses) });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/dashboard/retenciones
 * Desglose de retenciones por concepto
 */
router.get('/retenciones', async (req, res) => {
    try {
        const { year } = req.query;
        const filter = { tipoMovimiento: { $ne: 'GASTO' }, retenciones: { $exists: true, $ne: [] } };

        const receipts = (await Receipt.find(filter).lean()).filter(r => inCashYear(r, year));

        // Agrupar retenciones por descripción
        const retencionesAgrupadas = {};

        for (const r of receipts) {
            if (r.retenciones) {
                for (const ret of r.retenciones) {
                    const key = ret.descripcion || ret.codigo || 'Otro';
                    if (!retencionesAgrupadas[key]) {
                        retencionesAgrupadas[key] = {
                            concepto: key,
                            total: 0,
                            count: 0
                        };
                    }
                    retencionesAgrupadas[key].total += ret.importe || 0;
                    retencionesAgrupadas[key].count++;
                }
            }
        }

        const data = Object.values(retencionesAgrupadas)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10); // Top 10

        res.json({ success: true, data });
    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/dashboard/by-employer
 * Ingresos agrupados por empleador
 */
router.get('/by-employer', async (req, res) => {
    try {
        const { year } = req.query;
        const receipts = (await Receipt.find().lean()).filter(r => inCashYear(r, year));

        const byEmployer = {};

        for (const r of receipts.filter(isIncome)) {
            const employer = r.empleador?.nombre || r.tipoRecibo || 'Desconocido';
            if (!byEmployer[employer]) {
                byEmployer[employer] = {
                    empleador: employer,
                    totalNeto: 0,
                    totalBruto: 0,
                    count: 0
                };
            }
            byEmployer[employer].totalNeto += r.montoNeto || 0;
            byEmployer[employer].totalBruto += r.totalHaberes || 0;
            byEmployer[employer].count++;
        }

        const data = Object.values(byEmployer).sort((a, b) => b.totalNeto - a.totalNeto);

        res.json({ success: true, data });
    } catch (error) {
        sendError(res, error);
    }
});



/**
 * GET /api/dashboard/savings-evolution
 * Evolución de Ahorros vs Ingresos mes a mes
 */
router.get('/savings-evolution', async (req, res) => {
    try {
        const filter = req.query.year && req.query.year !== 'historical' ? { 'periodo.anio': Number(req.query.year) } : {};
        const [receipts, goals, expenses] = await Promise.all([Receipt.find().lean(), Goal.find().lean(), Expense.find(filter).lean()]);
        const evolution = Object.fromEntries(monthlyTotals(receipts.filter(r => inCashYear(r, req.query.year)), expenses).map(m => [m.periodo, { periodo: m.periodo, ingreso: m.neto, gastos: m.gastos, ahorro: 0, ahorroUSD: 0 }]));
        for (const g of goals) {
            const contributions = g.aportes?.length ? g.aportes : g.montoActual > 0 ? [{ monto: g.montoActual, fecha: g.fechaInicio || g.createdAt }] : [];
            for (const a of contributions) {
                const date = new Date(a.fecha); if (!Number.isFinite(date.getTime())) continue;
                const key = date.toISOString().slice(0, 7);
                if (req.query.year && req.query.year !== 'historical' && !key.startsWith(req.query.year + '-')) continue;
                evolution[key] ||= { periodo: key, ingreso: 0, gastos: 0, ahorro: 0, ahorroUSD: 0 };
                const field = g.moneda === 'USD' ? 'ahorroUSD' : 'ahorro';
                evolution[key][field] = Math.round((evolution[key][field] + a.monto) * 100) / 100;
            }
        }
        res.json({ success: true, data: Object.values(evolution).sort((a, b) => a.periodo.localeCompare(b.periodo)) });
    } catch (error) {
        sendError(res, error);
    }
});

export default router;
