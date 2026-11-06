import { useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import useResource from '../hooks/useResource';
import './ReceiptComparison.css';

export default function ReceiptComparison() {
    const receiptResource = useResource('/receipts');
    const receipts = receiptResource.data || [];
    const [selectedA, setIdA] = useState('');
    const [selectedB, setIdB] = useState('');
    const idA = selectedA || receipts[1]?._id || '';
    const idB = selectedB || receipts[0]?._id || '';
    const comparison = useResource(idA && idB && idA !== idB ? `/receipts/compare?idA=${idA}&idB=${idB}` : null);
    const comparisonData = comparison.data;
    const loading = receiptResource.loading || comparison.loading;
    const error = receiptResource.error || comparison.error;

    // --- Formatters ---
    const fmt = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
    const fmtDelta = (val) => `${val > 0 ? '+' : ''}${fmt(val)}`;
    const fmtPct = (a, b) => {
        if (!a || a === 0) return b > 0 ? 'Nuevo' : '—';
        const pct = ((b - a) / Math.abs(a)) * 100;
        return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
    };

    const getPeriodLabel = (r) => {
        if (!r) return 'Seleccionar...';
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const p = r.periodo;
        if (!p) return `Recibo #${r.numeroRecibo}`;
        return `${months[p.mes - 1]} ${p.anio}`;
    };

    const getPeriodShort = (period) => {
        if (!period) return '?';
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${months[period.mes - 1]} ${period.anio}`;
    };

    const deltaColor = (val, inverse = false) => {
        if (val === 0) return 'neutral';
        if (inverse) return val > 0 ? 'negative' : 'positive';
        return val > 0 ? 'positive' : 'negative';
    };

    // --- Derived data ---
    const haberes = comparisonData?.items.filter(i => i.tipo === 'haber') || [];
    const descuentos = comparisonData?.items.filter(i => i.tipo === 'descuento') || [];

    const chartData = comparisonData?.items
        .filter(i => i.delta !== 0)
        .slice(0, 6)
        .map(i => ({
            name: i.descripcion?.length > 18 ? i.descripcion.substring(0, 18) + '…' : i.descripcion,
            delta: i.delta,
        })) || [];

    const periodA = comparisonData ? getPeriodShort(comparisonData.receiptA.period) : 'Base';
    const periodB = comparisonData ? getPeriodShort(comparisonData.receiptB.period) : 'Comparar';

    // --- Render helpers ---
    const renderStatCard = (title, icon, valB, delta, inverse = false) => {
        const color = deltaColor(delta, inverse);
        return (
            <div className={`cmp-stat-card cmp-stat-${color}`}>
                <div className="cmp-stat-icon">{icon}</div>
                <div className="cmp-stat-info">
                    <span className="cmp-stat-label">{title}</span>
                    <span className="cmp-stat-value">{fmt(valB)}</span>
                </div>
                <div className={`cmp-stat-badge cmp-badge-${color}`}>
                    {delta !== 0 ? fmtDelta(delta) : 'Sin cambio'}
                </div>
            </div>
        );
    };

    const renderItemRow = (item, isDescuento = false) => {
        const status = item.isNew ? 'new' : item.isRemoved ? 'removed' : item.delta !== 0 ? 'changed' : 'same';
        const color = deltaColor(item.delta, isDescuento);

        return (
            <tr key={item.codigo} className={`cmp-row cmp-row-${status}`}>
                <td className="cmp-cell-concept">
                    <span className="cmp-concept-name">{item.descripcion}</span>
                    {item.isNew && <span className="cmp-tag cmp-tag-new">Nuevo</span>}
                    {item.isRemoved && <span className="cmp-tag cmp-tag-removed">Ya no aplica</span>}
                </td>
                <td className="cmp-cell-num">{item.montoA > 0 ? fmt(item.montoA) : '—'}</td>
                <td className="cmp-cell-num">{item.montoB > 0 ? fmt(item.montoB) : '—'}</td>
                <td className={`cmp-cell-num cmp-cell-delta cmp-delta-${color}`}>
                    {item.delta !== 0 ? fmtDelta(item.delta) : '—'}
                </td>
                <td className={`cmp-cell-num cmp-cell-pct cmp-delta-${color}`}>
                    {item.delta !== 0 ? fmtPct(item.montoA, item.montoB) : '—'}
                </td>
            </tr>
        );
    };

    const renderSection = (title, icon, items, isDescuento = false) => {
        if (!items.length) return null;
        const totalA = items.reduce((s, i) => s + i.montoA, 0);
        const totalB = items.reduce((s, i) => s + i.montoB, 0);
        const totalDelta = totalB - totalA;

        return (
            <div className="cmp-section">
                <div className="cmp-section-header">
                    <h3>{icon} {title}</h3>
                    <div className={`cmp-section-total cmp-delta-${deltaColor(totalDelta, isDescuento)}`}>
                        {totalDelta !== 0 ? fmtDelta(totalDelta) : 'Sin cambio'}
                    </div>
                </div>
                <div className="cmp-table-wrap">
                    <table className="cmp-table">
                        <thead>
                            <tr>
                                <th>Concepto</th>
                                <th className="cmp-cell-num">{periodA}</th>
                                <th className="cmp-cell-num">{periodB}</th>
                                <th className="cmp-cell-num">Diferencia</th>
                                <th className="cmp-cell-num">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => renderItemRow(item, isDescuento))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- Main render ---
    if (!receipts.length && !loading && !error) return <div className="cmp-empty">No hay recibos para comparar.</div>;

    return (
        <div className="cmp-view">
            {/* Header with selectors */}
            <div className="cmp-header">
                <h2> Comparador de Recibos</h2>
                <div className="cmp-selectors">
                    <div className="cmp-sel-group">
                        <label> Recibo anterior</label>
                        <select id="compare-base" value={idA} onChange={(e) => setIdA(e.target.value)}>
                            {receipts.map(r => (
                                <option key={r._id} value={r._id}>{getPeriodLabel(r)} — {fmt(r.montoNeto)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="cmp-arrow">→</div>
                    <div className="cmp-sel-group">
                        <label htmlFor="compare-target">Recibo actual</label>
                        <select id="compare-target" value={idB} onChange={(e) => setIdB(e.target.value)}>
                            {receipts.map(r => (
                                <option key={r._id} value={r._id}>{getPeriodLabel(r)} — {fmt(r.montoNeto)}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {error && <div className="cmp-error">{error}</div>}

            {loading ? (
                <div className="cmp-loading">
                    <div className="cmp-spinner"></div>
                    Comparando recibos...
                </div>
            ) : comparisonData ? (
                <>
                    {/* Summary cards */}
                    <div className="cmp-stats-row">
                        {renderStatCard('Haberes Bruto', '', comparisonData.globalStats.bruto.B, comparisonData.globalStats.bruto.delta)}
                        {renderStatCard('Retenciones', '', comparisonData.globalStats.retenciones.B, comparisonData.globalStats.retenciones.delta, true)}
                        {renderStatCard('Neto en mano', '', comparisonData.globalStats.neto.B, comparisonData.globalStats.neto.delta)}
                    </div>

                    {/* Chart — full width */}
                    {chartData.length > 0 && (
                        <div className="cmp-chart-card">
                            <h3> Mayores variaciones entre períodos</h3>
                            <div className="cmp-chart-container">
                                <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 45)}>
                                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e1e8dc" horizontal={false} />
                                        <XAxis type="number" stroke="var(--muted)" tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                                        <YAxis type="category" dataKey="name" stroke="var(--muted)" width={150} tick={{ fontSize: 12 }} />
                                        <Tooltip
                                            formatter={(val) => fmt(val)}
                                            contentStyle={{ background: 'var(--surface)' , border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9' }}
                                            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                        />
                                        <ReferenceLine x={0} stroke="#475569" strokeWidth={1} />
                                        <Bar isAnimationActive={false} dataKey="delta" radius={[0, 6, 6, 0]} barSize={24}>
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.delta > 0 ? '#22c55e' : '#ef4444'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Detail sections */}
                    {renderSection('Haberes', '', haberes, false)}
                    {renderSection('Retenciones / Descuentos', '', descuentos, true)}
                </>
            ) : (
                <div className="cmp-empty">Seleccioná dos recibos distintos para comparar.</div>
            )}
        </div>
    );
}
