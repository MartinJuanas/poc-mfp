import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import './SalarySimulator.css';

// ══════════════════════════════════════════════════
//  Configuración Ganancias Simplificada 2026 S1
//   Orientativo — No es cálculo fiscal oficial
// ══════════════════════════════════════════════════
const CONFIG = {
    periodo: '2026 — 1er Semestre',
    perfil: 'Soltero/a sin hijos • Relación de dependencia',
    minimoNoImponibleNeto: 2488922,
    brutoEquivalente: 2998725,
    alicuotaEstimada: 0.27,
};

const DEFAULT_CONCEPTOS = [
    { id: 'jubilacion', nombre: 'Jubilación', porcentaje: 0.11, activo: true, color: '#6366f1' },
    { id: 'obra_social', nombre: 'Obra Social', porcentaje: 0.03, activo: true, color: '#8b5cf6' },
    { id: 'ley19032', nombre: 'Ley 19.032', porcentaje: 0.03, activo: true, color: '#a78bfa' },
];

const GANANCIAS_COLOR = '#f59e0b';
const NETO_COLOR = '#22c55e';

const SLIDER_MIN = 500000;
const SLIDER_MAX = 8000000;
const SLIDER_STEP = 50000;

const CustomTooltip = ({ active, payload }) => {
        if (active && payload?.length) {
            const d = payload[0];
            return (
                <div className="sim-tooltip">
                    <span style={{ color: d.payload.color }}>{d.name}</span>
                    <strong>{new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(d.value)}</strong>
                </div>
            );
        }
        return null;
    };

export default function SalarySimulator() {
    const [bruto, setBruto] = useState(3000000);
    const [conceptos, setConceptos] = useState(DEFAULT_CONCEPTOS);
    const [gananciaActiva, setGananciaActiva] = useState(true);

    // ── Cálculo en tiempo real ──
    const resultado = useMemo(() => {
        // 1. Aportes activos
        const aportes = conceptos
            .filter(c => c.activo)
            .map(c => ({ ...c, monto: Math.round(bruto * c.porcentaje) }));

        const totalAportes = aportes.reduce((s, a) => s + a.monto, 0);
        const netoPreGanancias = bruto - totalAportes;

        // 2. Ganancias
        let gananciasMonto = 0;
        let alcanzado = false;

        if (gananciaActiva && netoPreGanancias > CONFIG.minimoNoImponibleNeto) {
            alcanzado = true;
            const excedente = netoPreGanancias - CONFIG.minimoNoImponibleNeto;
            gananciasMonto = Math.round(excedente * CONFIG.alicuotaEstimada);
        }

        const netoFinal = netoPreGanancias - gananciasMonto;
        const pctRetencion = bruto > 0 ? ((bruto - netoFinal) / bruto * 100) : 0;

        // 3. Composición para PieChart
        const composicion = aportes.map(a => ({
            name: a.nombre,
            value: a.monto,
            color: a.color
        }));

        if (gananciasMonto > 0) {
            composicion.push({ name: 'Ganancias (est.)', value: gananciasMonto, color: GANANCIAS_COLOR });
        }

        composicion.push({ name: 'Neto en mano', value: netoFinal, color: NETO_COLOR });

        return {
            bruto,
            aportes,
            totalAportes,
            netoPreGanancias,
            gananciasMonto,
            alcanzado,
            netoFinal,
            pctRetencion,
            composicion
        };
    }, [bruto, conceptos, gananciaActiva]);

    // ── Formatters ──
    const fmt = (val) => new Intl.NumberFormat('es-AR', {
        style: 'currency', currency: 'ARS', maximumFractionDigits: 0
    }).format(val);

    const toggleConcepto = (id) => {
        setConceptos(prev => prev.map(c =>
            c.id === id ? { ...c, activo: !c.activo } : c
        ));
    };

    // ── Custom tooltip for PieChart ──

    return (
        <div className="sim-view">
            {/* Header */}
            <div className="sim-header">
                <div className="sim-header-left">
                    <h2> Simulador de Sueldo</h2>
                    <span className="sim-disclaimer">
                        Cálculo orientativo • {CONFIG.periodo} • {CONFIG.perfil}
                    </span>
                </div>
                <div className={`sim-ganancias-badge ${resultado.alcanzado ? 'sim-badge-yes' : 'sim-badge-no'}`}>
                    {resultado.alcanzado ? ' Alcanzado por Ganancias' : ' No alcanzado por Ganancias'}
                </div>
            </div>

            {/* Input Section */}
            <div className="sim-input-card">
                <div className="sim-input-row">
                    <label>Sueldo Bruto Mensual</label>
                    <div className="sim-bruto-display">
                        <span className="sim-bruto-value">{fmt(bruto)}</span>
                    </div>
                </div>
                <input
                    type="range"
                    aria-label="Sueldo bruto mensual"
                    className="sim-slider"
                    min={SLIDER_MIN}
                    max={SLIDER_MAX}
                    step={SLIDER_STEP}
                    value={bruto}
                    onChange={(e) => setBruto(Number(e.target.value))}
                />
                <div className="sim-slider-labels">
                    <span>{fmt(SLIDER_MIN)}</span>
                    <span className="sim-mni-label">MNI ≈ {fmt(CONFIG.brutoEquivalente)}</span>
                    <span>{fmt(SLIDER_MAX)}</span>
                </div>
            </div>

            {/* Main Grid: Results + Chart */}
            <div className="sim-grid">
                {/* Left: Breakdown */}
                <div className="sim-breakdown">
                    {/* Result Cards */}
                    <div className="sim-result-cards">
                        <div className="sim-result-card sim-card-bruto">
                            <span className="sim-rc-label">Bruto</span>
                            <span className="sim-rc-value">{fmt(bruto)}</span>
                        </div>
                        <div className="sim-result-arrow">→</div>
                        <div className="sim-result-card sim-card-neto">
                            <span className="sim-rc-label">Neto en mano</span>
                            <span className="sim-rc-value">{fmt(resultado.netoFinal)}</span>
                            <span className="sim-rc-sub">Retención total: {resultado.pctRetencion.toFixed(1)}%</span>
                        </div>
                    </div>

                    {/* Conceptos / Toggles */}
                    <div className="sim-conceptos">
                        <h3>Aportes del trabajador</h3>
                        {conceptos.map(c => (
                            <div key={c.id} className={`sim-concepto-row ${c.activo ? '' : 'sim-disabled'}`}>
                                <label className="sim-toggle">
                                    <input
                                        type="checkbox"
                                        checked={c.activo}
                                        onChange={() => toggleConcepto(c.id)}
                                    />
                                    <span className="sim-toggle-slider"></span>
                                </label>
                                <div className="sim-concepto-info">
                                    <span className="sim-concepto-name">
                                        <span className="sim-color-dot" style={{ background: c.color }}></span>
                                        {c.nombre}
                                    </span>
                                    <span className="sim-concepto-pct">{(c.porcentaje * 100).toFixed(0)}%</span>
                                </div>
                                <span className="sim-concepto-monto">
                                    {c.activo ? fmt(resultado.aportes.find(a => a.id === c.id)?.monto || 0) : '—'}
                                </span>
                            </div>
                        ))}

                        {/* Ganancias row */}
                        <div className="sim-concepto-divider"></div>
                        <h3>Impuestos</h3>
                        <div className={`sim-concepto-row ${gananciaActiva ? '' : 'sim-disabled'}`}>
                            <label className="sim-toggle">
                                <input
                                    type="checkbox"
                                    checked={gananciaActiva}
                                    onChange={() => setGananciaActiva(!gananciaActiva)}
                                />
                                <span className="sim-toggle-slider"></span>
                            </label>
                            <div className="sim-concepto-info">
                                <span className="sim-concepto-name">
                                    <span className="sim-color-dot" style={{ background: GANANCIAS_COLOR }}></span>
                                    Ganancias (simplificada)
                                </span>
                                <span className="sim-concepto-pct">{(CONFIG.alicuotaEstimada * 100).toFixed(0)}% s/excedente</span>
                            </div>
                            <span className={`sim-concepto-monto ${resultado.alcanzado ? 'sim-monto-warn' : ''}`}>
                                {gananciaActiva ? fmt(resultado.gananciasMonto) : '—'}
                            </span>
                        </div>

                        {/* MNI info */}
                        {gananciaActiva && (
                            <div className="sim-mni-info">
                                <span>Mínimo no imponible (neto): {fmt(CONFIG.minimoNoImponibleNeto)}</span>
                                {resultado.alcanzado && (
                                    <span className="sim-excedente">
                                        Excedente gravado: {fmt(resultado.netoPreGanancias - CONFIG.minimoNoImponibleNeto)}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: PieChart */}
                <div className="sim-chart-card">
                    <h3>Composición del sueldo</h3>
                    <div className="sim-chart-container">
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie isAnimationActive={false}
                                    data={resultado.composicion}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={110}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {resultado.composicion.map((entry, i) => (
                                        <Cell key={`cell-${i}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="sim-chart-legend">
                        {resultado.composicion.map((item, i) => (
                            <div key={i} className="sim-legend-item">
                                <span className="sim-legend-dot" style={{ background: item.color }}></span>
                                <span className="sim-legend-label">{item.name}</span>
                                <span className="sim-legend-value">{fmt(item.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer disclaimer */}
            <div className="sim-footer">
                 Este simulador es orientativo y no reemplaza el cálculo oficial de AFIP/ARCA.
                Basado en valores publicados para {CONFIG.periodo}, perfil {CONFIG.perfil.toLowerCase()}.
                La alícuota estimada ({(CONFIG.alicuotaEstimada * 100)}%) es una simplificación de la escala progresiva real.
            </div>
        </div>
    );
}
