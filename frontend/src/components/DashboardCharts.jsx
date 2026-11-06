import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import useResource from '../hooks/useResource';
import { Notice } from './UI';
import './DashboardCharts.css';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function DashboardCharts({ year }) {
    const [activeTab, setActiveTab] = useState('monthly');
    const query = year !== 'historical' ? `?year=${year}` : '';
    const monthly = useResource(`/dashboard/monthly${query}`);
    const retenciones = useResource(`/dashboard/retenciones${query}`);
    const employer = useResource(`/dashboard/by-employer${query}`);
    const monthlyData = monthly.data || [];
    const retencionesData = retenciones.data || [];
    const employerData = employer.data || [];
    const loading = monthly.loading || retenciones.loading || employer.loading;
    const error = monthly.error || retenciones.error || employer.error;
    const formatMoney = (value) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0
        }).format(value);
    };

    const formatMonthLabel = (periodo) => {
        const [year, month] = periodo.split('-');
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
    };

    if (loading) {
        return <div className="dashboard-charts loading">Cargando gráficos...</div>;
    }

    return (
        <div className="dashboard-charts">{error && <Notice error>{error}<button onClick={()=>{monthly.reload();retenciones.reload();employer.reload();}}>Reintentar</button></Notice>}
            {/* Tab Navigation */}
            <div className="chart-tabs">
                <button
                    className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
                    onClick={() => setActiveTab('monthly')}
                >
                     Curva Mensual
                </button>
                <button
                    className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
                    onClick={() => setActiveTab('comparison')}
                >
                     Bruto vs Neto
                </button>
                <button
                    className={`tab-btn ${activeTab === 'retenciones' ? 'active' : ''}`}
                    onClick={() => setActiveTab('retenciones')}
                >
                     Retenciones
                </button>
                <button
                    className={`tab-btn ${activeTab === 'employer' ? 'active' : ''}`}
                    onClick={() => setActiveTab('employer')}
                >
                     Por Empleador
                </button>
            </div>

            {/* Charts */}
            <div className="chart-container">
                {activeTab === 'monthly' && monthlyData.length > 0 && (
                    <div className="chart-wrapper">
                        <h3>Evolución de Ingresos Mensuales</h3>
                        <ResponsiveContainer width="100%" height={350}>
                            <LineChart data={monthlyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e1e8dc" />
                                <XAxis
                                    dataKey="periodo"
                                    tickFormatter={formatMonthLabel}
                                    stroke="var(--muted)"
                                />
                                <YAxis
                                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                    stroke="var(--muted)"
                                />
                                <Tooltip
                                    formatter={(value) => formatMoney(value)}
                                    labelFormatter={formatMonthLabel}
                                    contentStyle={{ background: 'var(--surface)' , border: 'none', borderRadius: '8px' }}
                                />
                                <Legend />
                                <Line isAnimationActive={false}
                                    type="monotone"
                                    dataKey="neto"
                                    stroke="#22c55e"
                                    strokeWidth={3}
                                    name="Neto"
                                    dot={{ fill: '#22c55e', strokeWidth: 2 }}
                                />
                                <Line isAnimationActive={false}
                                    type="monotone"
                                    dataKey="gastos"
                                    stroke="#ef4444"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    name="Gastos"
                                    dot={{ fill: '#ef4444', strokeWidth: 2 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {activeTab === 'comparison' && monthlyData.length > 0 && (
                    <div className="chart-wrapper">
                        <h3>Comparación Bruto vs Neto</h3>
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart data={monthlyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e1e8dc" />
                                <XAxis
                                    dataKey="periodo"
                                    tickFormatter={formatMonthLabel}
                                    stroke="var(--muted)"
                                />
                                <YAxis
                                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                    stroke="var(--muted)"
                                />
                                <Tooltip
                                    formatter={(value) => formatMoney(value)}
                                    labelFormatter={formatMonthLabel}
                                    contentStyle={{ background: 'var(--surface)' , border: 'none', borderRadius: '8px' }}
                                />
                                <Legend />
                                <Bar isAnimationActive={false} dataKey="bruto" fill="#6366f1" name="Bruto" radius={[4, 4, 0, 0]} />
                                <Bar isAnimationActive={false} dataKey="neto" fill="#22c55e" name="Neto" radius={[4, 4, 0, 0]} />
                                <Bar isAnimationActive={false} dataKey="retenciones" fill="#ef4444" name="Retenciones" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {activeTab === 'retenciones' && retencionesData.length > 0 && (
                    <div className="chart-wrapper">
                        <h3>Distribución de Retenciones por Concepto</h3>
                        <div className="pie-chart-container">
                            <ResponsiveContainer width="100%" height={350}>
                                <PieChart>
                                    <Pie isAnimationActive={false}
                                        data={retencionesData}
                                        dataKey="total"
                                        nameKey="concepto"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={120}
                                        label={({ concepto, percent }) => `${concepto.slice(0, 15)}... ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {retencionesData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value) => formatMoney(value)}
                                        contentStyle={{ background: 'var(--surface)' , border: 'none', borderRadius: '8px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="retenciones-legend">
                                {retencionesData.map((ret, i) => (
                                    <div key={i} className="legend-item">
                                        <span className="legend-color" style={{ background: COLORS[i % COLORS.length] }}></span>
                                        <span className="legend-label">{ret.concepto}</span>
                                        <span className="legend-value">{formatMoney(ret.total)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'employer' && employerData.length > 0 && (
                    <div className="chart-wrapper">
                        <h3>Ingresos por Empleador</h3>
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart data={employerData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#e1e8dc" />
                                <XAxis
                                    type="number"
                                    tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                                    stroke="var(--muted)"
                                />
                                <YAxis
                                    type="category"
                                    dataKey="empleador"
                                    width={100}
                                    stroke="var(--muted)"
                                />
                                <Tooltip
                                    formatter={(value) => formatMoney(value)}
                                    contentStyle={{ background: 'var(--surface)' , border: 'none', borderRadius: '8px' }}
                                />
                                <Legend />
                                <Bar isAnimationActive={false} dataKey="totalNeto" fill="#22c55e" name="Total Neto" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {monthlyData.length === 0 && (
                    <div className="no-data">
                        <p>No hay datos suficientes para mostrar gráficos</p>
                        <p className="hint">Importá recibos para ver las estadísticas</p>
                    </div>
                )}
            </div>
        </div>
    );
}
