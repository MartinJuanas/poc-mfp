import { Modal, Notice, Skeleton, Icon } from './UI';

import { useState, useEffect, useMemo } from 'react';
import {
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import api from '../services/api';
import './SavingsView.css';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];

    const formatDateShort = (date) => {
        const d = new Date(date);
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${months[d.getMonth()]} '${d.getFullYear().toString().slice(2)}`;
    };

const calculateAssetSimulation = (asset, monthsToProject = 0) => {
        // Simulamos la evolución mes a mes desde el inicio de los aportes
        const aportes = asset.aportes || [];
        const sortedAportes = [...aportes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        // Si no hay historial, usaremos la fecha de creación o hoy
        let startDate = sortedAportes.length > 0 ? new Date(sortedAportes[0].fecha) : new Date();
        const now = new Date();
        const tasaMensual = (asset.rendimientoMensual || 0) / 100;

        let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        let simulation = [];
        let acumuladoCapital = 0;
        let acumuladoTotal = 0;

        // Limite de simulación (hoy + meses a proyectar)
        const limitDate = new Date(now.getFullYear(), now.getMonth() + monthsToProject, 1);

        // Si no hay aportes y es un activo nuevo con monto inicial manual (que no está en aportes)
        // en esta POC asumimos que montoActual viene de aportes.
        // Si no, forzamos un aporte inicial virtual si hay montoActual pero no aportes.
        if (sortedAportes.length === 0 && asset.montoActual > 0) {
            // "Aporte inicial virtual" hoy
            acumuladoCapital = asset.montoActual;
            acumuladoTotal = asset.montoActual;
            simulation.push({
                fecha: formatDateShort(now),
                capital: acumuladoCapital,
                ganancia: 0,
                total: acumuladoTotal,
                isProjected: false
            });
            // Ajustamos current date para empezar loop de proyección si hace falta
            currentDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        }

        // Iterar mes a mes
        while (currentDate <= limitDate) {
            const mesStr = currentDate.toISOString().slice(0, 7); // YYYY-MM
            const isFuture = currentDate > now;

            // Sumar aportes de este mes (solo si no es futuro)
            let sumaAportes = 0;
            if (!isFuture) {
                const aportesDelMes = sortedAportes.filter(a => a.fecha.startsWith(mesStr));
                sumaAportes = aportesDelMes.reduce((acc, curr) => acc + curr.monto, 0);
            }

            acumuladoCapital += sumaAportes;

            // Interés compuesto: (SaldoAnterior + AportesNuevos) * (1 + Tasa)
            // Asumimos aportes entran antes del rendimiento del mes
            acumuladoTotal = (acumuladoTotal + sumaAportes) * (1 + tasaMensual);

            // Si es futuro y no hay capital, paramos (no tiene sentido proyectar 0)
            if (isFuture && acumuladoCapital === 0) break;

            simulation.push({
                fecha: formatDateShort(currentDate),
                capital: Math.round(acumuladoCapital),
                ganancia: Math.round(acumuladoTotal > acumuladoCapital ? acumuladoTotal - acumuladoCapital : 0),
                total: Math.round(acumuladoTotal),
                isProjected: isFuture
            });

            // Avanzar mes
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        return simulation;
    };


export default function SavingsView({ onChange }) {
    const [goals, setGoals] = useState([]);
    const [evolutionData, setEvolutionData] = useState([]);
    const [currencyRates, setCurrencyRates] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [contributing, setContributing] = useState(null);
    const [contribution, setContribution] = useState('');
    const [deleting, setDeleting] = useState(null);
    const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'analytics'
    const [showForm, setShowForm] = useState(false);

    // States for Editing
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);

    // Estado para el detalle del activo
    const [selectedAsset, setSelectedAsset] = useState(null);

    const [projectionMonths, setProjectionMonths] = useState(0);
    const assetHistory=useMemo(()=>selectedAsset?calculateAssetSimulation(selectedAsset,projectionMonths):[],[selectedAsset,projectionMonths]); // 0 = solo historia, 12 = +1 año, etc.

    // Form state
    const [newGoal, setNewGoal] = useState({
        nombre: '',
        tipo: 'ahorro',
        montoActual: '',
        montoObjetivo: '',
        moneda: 'ARS',
        subtipo: '',
        rendimientoMensual: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [goalsRes, evolutionRes, ratesRes] = await Promise.all([
                api.getGoals(),
                api.request('/dashboard/savings-evolution').catch(() => ({data:[]})),
                api.getCurrencyRates().catch(() => ({data:null}))
            ]);

            setGoals(goalsRes.data || []);
            setEvolutionData(evolutionRes.data || []);
            setCurrencyRates(ratesRes.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setNewGoal({ nombre: '', tipo: 'ahorro', montoActual: '', montoObjetivo: '', moneda: 'ARS', subtipo: '', rendimientoMensual: '' });
        setIsEditing(false);
        setEditId(null);
        setShowForm(false);
    };

    const startEditing = (goal) => {
        setNewGoal({
            nombre: goal.nombre,
            tipo: goal.tipo,
            montoActual: goal.montoActual, // Esto usualmente no se edita directo, calculado, pero lo dejamos por si acaso correccion manual
            montoObjetivo: goal.montoObjetivo || '',
            moneda: goal.moneda,
            subtipo: goal.subtipo || '',
            rendimientoMensual: goal.rendimientoMensual || ''
        });
        setEditId(goal._id);
        setIsEditing(true);
        setShowForm(true);
        // Si estamos en modal, cerrarlo o mantenerlo? Mejor cerrar modal para ir al form
        setSelectedAsset(null);
        setActiveTab('categories');
    };

    const handleCreateOrUpdateGoal = async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try {
            const payload = {
                ...newGoal,
                montoActual: parseFloat(newGoal.montoActual) || 0,
                montoObjetivo: newGoal.montoObjetivo ? parseFloat(newGoal.montoObjetivo) : 0,
                rendimientoMensual: newGoal.rendimientoMensual ? parseFloat(newGoal.rendimientoMensual) : 0
            };

            if (isEditing) {
                await api.updateGoal(editId, payload);
            } else {
                await api.createGoal(payload);
            }

            resetForm();
            fetchData(); onChange?.(); setNotice('La meta se guardó correctamente.');
        } catch (err) { setError(err.message); } finally { setBusy(false); }
    };

    const handleAddContribution = (goalId, e) => {
        e?.stopPropagation(); setError(''); setContributing(goals.find(g=>g._id===goalId)); setContribution('');
    };
    const saveContribution = async e => {
        e.preventDefault(); setError(''); setBusy(true);
        try { await api.addContribution(contributing._id, Number(contribution), 'Aporte manual'); setContributing(null); await fetchData(); onChange?.(); setNotice('El aporte se registró correctamente.'); }
        catch(err) { setError(err.message); } finally { setBusy(false); }
    };
    const handleDelete = (id,e) => { e?.stopPropagation(); setError(''); setDeleting(goals.find(g=>g._id===id)); };
    const confirmDelete = async () => {
        setBusy(true);setError('');
        try { await api.deleteGoal(deleting._id); if(selectedAsset?._id===deleting._id) setSelectedAsset(null);setDeleting(null);await fetchData();onChange?.();setNotice('La meta se eliminó.'); }
        catch(err) { setError(err.message); } finally { setBusy(false); }
    };

    const formatMoney = (amount, currency = 'ARS') => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const formatMonthLabel = (periodo) => {
        if (!periodo) return '';
        // Detectar si es YYYY-MM
        if (periodo.includes('-')) {
            const [year, month] = periodo.split('-');
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return `${months[parseInt(month) - 1]} '${year.slice(2)}`;
        }
        return periodo;
    };

    const totalARS = goals.filter(g => g.moneda === 'ARS').reduce((acc, g) => acc + g.montoActual, 0);
    const totalUSD = goals.filter(g => g.moneda === 'USD').reduce((acc, g) => acc + g.montoActual, 0);

    const pieData = goals.map(g => {
        let valueInArs = g.montoActual;

        if (g.moneda === 'USD') {
            // Convertir solo con una cotización disponible.
            const rate = currencyRates?.blue?.venta;
            if (!(rate > 0)) return null;
            valueInArs = g.montoActual * rate;
        }

        return {
            name: g.nombre,
            value: valueInArs,
            originalValue: g.montoActual,
            moneda: g.moneda
        };
    }).filter(d => d && d.value > 0);

    if (loading) return <Skeleton/>;

    return (
        <div className="savings-view">
            {error && <Notice error>{error}<button onClick={fetchData}>Reintentar</button></Notice>}
            {notice && <Notice>{notice}</Notice>}
            <header className="savings-header">
                <div>
                    <h2> Mis Reservas e Inversiones</h2>
                    <p className="subtitle">Patrimonio y rendimiento de tus activos</p>
                </div>
                <div className="savings-summary">
                    {totalARS > 0 && <div className="summary-badge ars"> Total: {formatMoney(totalARS, 'ARS')}</div>}
                    {totalUSD > 0 && <div className="summary-badge usd"> Total: {formatMoney(totalUSD, 'USD')}</div>}
                </div>
            </header>

            <div className="savings-tabs">
                <button className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
                     Mis Activos
                </button>
                <button className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                     Rendimiento Global
                </button>
            </div>

            {activeTab === 'categories' && (
                <div className="categories-section">
                    <div className="actions-bar">
                        <button className="new-goal-btn" onClick={() => { resetForm(); setShowForm(!showForm); }}>
                            {showForm ? ' Cancelar' : '+ Nueva Reserva / Inversión'}
                        </button>
                    </div>

                    {showForm && (
                        <div className="goal-form-container">
                            <h3>{isEditing ? 'Editar Activo' : 'Registrar Nuevo Activo'}</h3>
                            <form className="goal-form" onSubmit={handleCreateOrUpdateGoal}>
                                <div className="form-group">
                                    <label>Nombre</label>
                                    <input aria-label="Nombre de la meta" type="text" value={newGoal.nombre} onChange={e => setNewGoal({ ...newGoal, nombre: e.target.value })} required placeholder="Ej. Plazo Fijo" />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <select aria-label="Tipo de meta" value={newGoal.tipo} onChange={e => setNewGoal({ ...newGoal, tipo: e.target.value })}>
                                            <option value="ahorro">Ahorro</option>
                                            <option value="inversion">Inversión</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <select aria-label="Moneda de la meta" value={newGoal.moneda} onChange={e => setNewGoal({ ...newGoal, moneda: e.target.value })}>
                                            <option value="ARS">ARS</option>
                                            <option value="USD">USD</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Monto Actual</label>
                                        <input aria-label="Monto actual" min="0" step="0.01" type="number" value={newGoal.montoActual} onChange={e => setNewGoal({ ...newGoal, montoActual: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Meta (Opcional)</label>
                                        <input aria-label="Monto objetivo" min="0" step="0.01" type="number" value={newGoal.montoObjetivo} onChange={e => setNewGoal({ ...newGoal, montoObjetivo: e.target.value })} />
                                    </div>
                                </div>
                                {newGoal.tipo === 'inversion' && (
                                    <div className="investment-fields">
                                        <div className="form-group">
                                            <label>Instrumento</label>
                                            <input aria-label="Instrumento de inversión" type="text" value={newGoal.subtipo} onChange={e => setNewGoal({ ...newGoal, subtipo: e.target.value })} placeholder="FCI / Bonos" />
                                        </div>
                                        <div className="form-group">
                                            <label>Rendimiento Mensual %</label>
                                            <input aria-label="Rendimiento mensual estimado" type="number" step="0.01" value={newGoal.rendimientoMensual} onChange={e => setNewGoal({ ...newGoal, rendimientoMensual: e.target.value })} />
                                        </div>
                                    </div>
                                )}
                                <div className="form-actions">
                                    <button type="submit" disabled={busy} className="submit-btn">{isEditing ? 'Guardar Cambios' : 'Crear Activo'}</button>
                                    {isEditing && <button type="button" className="cancel-btn" onClick={resetForm}>Cancelar Edición</button>}
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="goals-grid">
                        {goals.length === 0 ? (
                            <div className="empty-state">No tenés reservas registradas.</div>
                        ) : (
                            goals.map(goal => (
                                <div
                                    key={goal._id}
                                    className={`goal-card ${goal.tipo} clickable`}
                                    role="group" aria-label={goal.nombre}
                                    onClick={() => setSelectedAsset(goal)}
                                >
                                    <div className="goal-icon">
                                        <Icon name="goals"/>
                                    </div>
                                    <div className="goal-details">
                                        <h3>
                                            {goal.nombre}
                                            {goal.subtipo && <span className="goal-badge">{goal.subtipo}</span>}
                                        </h3>

                                        <div className="goal-balance">
                                            <span className="current">{formatMoney(goal.montoActual, goal.moneda)}</span>
                                        </div>

                                        {goal.rendimientoMensual > 0 ? (
                                            <div className="mini-trend positive">
                                                +{goal.rendimientoMensual}% mensual
                                            </div>
                                        ) : null}
                                    </div>
                                    {goal.montoObjetivo > 0 && <div className="goal-progress"><div><span>Objetivo {formatMoney(goal.montoObjetivo,goal.moneda)}</span><strong>{Math.round(goal.montoActual/goal.montoObjetivo*100)}%</strong></div><progress max="100" value={Math.min(100,goal.montoActual/goal.montoObjetivo*100)} aria-label={`Progreso de ${goal.nombre}`}/><p>Faltan {formatMoney(Math.max(0,goal.montoObjetivo-goal.montoActual),goal.moneda)}</p></div>}
                                    <button className="text-action" onClick={(e)=>{e.stopPropagation();setSelectedAsset(goal);}}>Ver detalle y proyección</button>
                                    <div className="goal-actions-mini">
                                        <button onClick={(e) => { e.stopPropagation(); startEditing(goal); }} title="Editar" className="edit-btn" aria-label={`Editar ${goal.nombre}`}><Icon name="edit" size={16}/></button>
                                        <button onClick={(e) => handleAddContribution(goal._id, e)} title="Sumar Dinero" aria-label={`Aportar a ${goal.nombre}`}><Icon name="plus" size={16}/></button>
                                        <button onClick={(e) => handleDelete(goal._id, e)} title="Eliminar" className="delete-btn" aria-label={`Eliminar ${goal.nombre}`}><Icon name="trash" size={16}/></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* MODAL DETALLE ACTIVO */}
            {selectedAsset && (
                <Modal title={selectedAsset.nombre} wide onClose={() => setSelectedAsset(null)}>
                    <div className="asset-modal">


                        <div className="modal-header">
                            <span className="asset-icon">{selectedAsset.tipo === 'ahorro' ? '' : ''}</span>
                            <div>
                                <h2>{selectedAsset.nombre}</h2>
                                <p className="asset-meta">{selectedAsset.subtipo} • {selectedAsset.moneda}</p>
                            </div>
                            <div className="asset-main-value">
                                {formatMoney(selectedAsset.montoActual, selectedAsset.moneda)}
                                {selectedAsset.rendimientoMensual > 0 && (
                                    <span className="yield-badge">+{selectedAsset.rendimientoMensual}% / mes</span>
                                )}
                            </div>
                            <button className="edit-btn-header" onClick={() => startEditing(selectedAsset)}> Editar</button>
                        </div>

                        <div className="modal-content">
                            <div className="chart-section">
                                <div className="chart-header-row">
                                    <h3> Proyección de Rendimiento</h3>
                                    <div className="projection-controls">
                                        <small>Proyectar:</small>
                                        <button className={projectionMonths === 0 ? 'active' : ''} onClick={() => setProjectionMonths(0)}>Hoy</button>
                                        <button className={projectionMonths === 12 ? 'active' : ''} onClick={() => setProjectionMonths(12)}>+1 Año</button>
                                        <button className={projectionMonths === 60 ? 'active' : ''} onClick={() => setProjectionMonths(60)}>+5 Años</button>
                                    </div>
                                </div>

                                <div className="chart-container-large">
                                    <ResponsiveContainer width="100%" height={300}>
                                        <AreaChart data={assetHistory}>
                                            <defs>
                                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e1e8dc" />
                                            <XAxis dataKey="fecha" stroke="var(--muted)" />
                                            <YAxis tickFormatter={(v) => formatMoney(v, selectedAsset.moneda)} stroke="var(--muted)" width={80} />
                                            <Tooltip
                                                formatter={(value) => formatMoney(value, selectedAsset.moneda)}
                                                contentStyle={{ background: 'var(--surface)' , border: 'none', borderRadius: '8px' }}
                                                labelFormatter={(label, payload) => {
                                                    if (payload && payload[0] && payload[0].payload.isProjected) {
                                                        return `${label} (Proyectado)`;
                                                    }
                                                    return label;
                                                }}
                                            />
                                            <Legend />
                                            <Area isAnimationActive={false}
                                                type="monotone"
                                                dataKey="total"
                                                name="Valor Total"
                                                stroke="#8b5cf6"
                                                fillOpacity={1}
                                                fill="url(#colorTotal)"
                                            />
                                            <Area isAnimationActive={false}
                                                type="monotone"
                                                dataKey="capital"
                                                name="Capital Invertido"
                                                stroke="#22c55e"
                                                fillOpacity={1}
                                                fill="url(#colorCapital)"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                <p className="chart-hint">
                                    Estimación, no rendimiento acreditado. Simulación basada en tasa mensual de {selectedAsset.rendimientoMensual}% aplicando interés compuesto mensual.
                                </p>
                            </div>

                            <div className="history-section">
                                <h3> Historial de Aportes</h3>
                                <div className="history-list">
                                    {selectedAsset.aportes && selectedAsset.aportes.length > 0 ? (
                                        [...selectedAsset.aportes].reverse().map((aporte, idx) => (
                                            <div key={idx} className="history-item">
                                                <span className="date">{new Date(aporte.fecha).toLocaleDateString()}</span>
                                                <span className="desc">{aporte.descripcion || 'Aporte manual'}</span>
                                                <span className="amount positive">+{formatMoney(aporte.monto, selectedAsset.moneda)}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="no-history">Sin movimientos registrados.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {activeTab === 'analytics' && (
                <div className="analytics-section">
                    <div className="chart-card">
                        <h3> Comparativa Ingresos vs Ahorro</h3>
                        <div className="chart-container-large">
                            {evolutionData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={400}>
                                    <LineChart data={evolutionData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e1e8dc" />
                                        <XAxis dataKey="periodo" tickFormatter={formatMonthLabel} stroke="var(--muted)" />
                                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} stroke="var(--muted)" />
                                        <Tooltip formatter={(value) => formatMoney(value)} contentStyle={{ background: 'var(--surface)' , border: 'none', borderRadius: '8px' }} />
                                        <Legend />
                                        <Line isAnimationActive={false} type="monotone" dataKey="ingreso" name="Ingreso Neto" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} />
                                        <Line isAnimationActive={false} type="monotone" dataKey="ahorro" name="Aportes a Reservas" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="no-data">Faltan datos para generar el gráfico.</div>
                            )}
                        </div>
                    </div>

                    <div className="chart-card">
                        <h3>Distribución de portafolio en ARS</h3>{goals.some(g=>g.moneda==='USD') && !currencyRates?.blue?.venta && <Notice error>No hay cotización disponible. Los activos en USD se muestran en el resumen por moneda y se excluyen de este gráfico.</Notice>}
                        <div className="chart-container-large">
                            {pieData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie isAnimationActive={false} data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value, name, props) => {
                                                const original = props.payload.originalValue;
                                                const currency = props.payload.moneda;
                                                // Si es ARS, mostrar normal. Si es USD, mostrar ambos.
                                                if (currency === 'USD') {
                                                    return [`${formatMoney(original, 'USD')} (~ ${formatMoney(value, 'ARS')})`, name];
                                                }
                                                return [formatMoney(value, 'ARS'), name];
                                            }}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="no-data">No hay activos para mostrar.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {contributing && <Modal title={`Aportar a ${contributing.nombre}`} onClose={()=>!busy&&setContributing(null)}><form className="expense-form" onSubmit={saveContribution}><label>Monto en {contributing.moneda}<input type="number" min="0.01" step="0.01" value={contribution} required onChange={e=>setContribution(e.target.value)} autoFocus/></label>{error && <Notice error>{error}</Notice>}<div className="form-actions"><button type="button" disabled={busy} onClick={()=>setContributing(null)}>Cancelar</button><button className="btn-primary" disabled={busy}>{busy?'Guardando…':'Registrar aporte'}</button></div></form></Modal>}
            {deleting && <Modal title="Eliminar meta" onClose={()=>!busy&&setDeleting(null)}><p>Se eliminará «{deleting.nombre}» con su historial de aportes.</p>{error && <Notice error>{error}</Notice>}<div className="form-actions"><button disabled={busy} onClick={()=>setDeleting(null)}>Cancelar</button><button disabled={busy} onClick={confirmDelete}>{busy?'Eliminando…':'Eliminar'}</button></div></Modal>}
        </div>
    );
}
