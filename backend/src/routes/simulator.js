import { sendError } from '../middleware/errors.js';
import express from 'express';

const router = express.Router();

// ══════════════════════════════════════════════════════
// Configuración de Ganancias Simplificada
// ⚠️ NO es cálculo fiscal real — es orientativo
// ══════════════════════════════════════════════════════

const GANANCIAS_CONFIG = {
    '2026-S1': {
        id: '2026-S1',
        label: '2026 — 1er Semestre',
        perfil: 'soltero_sin_hijos',
        perfilLabel: 'Soltero/a sin hijos',
        minimoNoImponibleNeto: 2488922,
        brutoEquivalente: 2998725,
        alicuotaEstimada: 0.27,
        conceptosBase: [
            { id: 'jubilacion', nombre: 'Jubilación', porcentaje: 0.11, tipo: 'aporte', activo: true },
            { id: 'obra_social', nombre: 'Obra Social', porcentaje: 0.03, tipo: 'aporte', activo: true },
            { id: 'salud', nombre: 'Ley 19.032', porcentaje: 0.03, tipo: 'aporte', activo: true },
        ]
    }
};

const PERIODO_ACTIVO = '2026-S1';

// Helper: calcular simulación
function calcularSimulacion(bruto, conceptos, config) {
    // 1. Calcular aportes (conceptos activos)
    const aportes = conceptos
        .filter(c => c.activo && c.tipo === 'aporte')
        .map(c => ({
            ...c,
            monto: Math.round(bruto * c.porcentaje)
        }));

    const totalAportes = aportes.reduce((sum, a) => sum + a.monto, 0);

    // 2. Neto pre-ganancias
    const netoPreGanancias = bruto - totalAportes;

    // 3. Ganancias simplificada
    let gananciasMonto = 0;
    let alcanzadoPorGanancias = false;

    if (netoPreGanancias > config.minimoNoImponibleNeto) {
        alcanzadoPorGanancias = true;
        const excedente = netoPreGanancias - config.minimoNoImponibleNeto;
        gananciasMonto = Math.round(excedente * config.alicuotaEstimada);
    }

    // 4. Neto final
    const netoFinal = netoPreGanancias - gananciasMonto;

    // 5. Composición para gráfico
    const composicion = [
        ...aportes.map(a => ({ nombre: a.nombre, monto: a.monto, color: 'aporte' })),
    ];

    if (gananciasMonto > 0) {
        composicion.push({ nombre: 'Ganancias (est.)', monto: gananciasMonto, color: 'ganancias' });
    }

    composicion.push({ nombre: 'Neto en mano', monto: netoFinal, color: 'neto' });

    return {
        bruto,
        totalAportes,
        netoPreGanancias,
        gananciasMonto,
        alcanzadoPorGanancias,
        netoFinal,
        aportes,
        composicion,
        porcentajeRetencion: bruto > 0 ? ((bruto - netoFinal) / bruto * 100).toFixed(1) : 0
    };
}

/**
 * GET /api/simulator/config
 * Retorna configuración activa del simulador
 */
router.get('/config', (req, res) => {
    const config = GANANCIAS_CONFIG[PERIODO_ACTIVO];

    res.json({
        success: true,
        data: {
            periodoActivo: PERIODO_ACTIVO,
            ...config
        }
    });
});

/**
 * POST /api/simulator/calculate
 * Calcular simulación con parámetros custom
 */
router.post('/calculate', (req, res) => {
    try {
        const { bruto, conceptos } = req.body;

        if (!bruto || bruto < 0) {
            return res.status(400).json({ success: false, error: 'Se requiere un monto bruto válido' });
        }

        const config = GANANCIAS_CONFIG[PERIODO_ACTIVO];
        const conceptosActivos = conceptos || config.conceptosBase;
        const resultado = calcularSimulacion(bruto, conceptosActivos, config);

        res.json({
            success: true,
            data: resultado
        });

    } catch (error) {
        sendError(res, error);
    }
});

/**
 * GET /api/simulator/periodos
 * Retorna períodos disponibles (para futura extensión)
 */
router.get('/periodos', (req, res) => {
    const periodos = Object.entries(GANANCIAS_CONFIG).map(([id, config]) => ({
        id,
        label: config.label,
        perfil: config.perfilLabel
    }));

    res.json({ success: true, data: periodos });
});

export default router;
