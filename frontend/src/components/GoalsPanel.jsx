import { useState, useEffect } from 'react';
import api from '../services/api';
import './GoalsPanel.css';

export default function GoalsPanel() {
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newGoal, setNewGoal] = useState({
        nombre: '',
        tipo: 'ahorro',
        montoObjetivo: '',
        fechaObjetivo: ''
    });

    useEffect(() => {
        fetchGoals();
    }, []);

    const fetchGoals = async () => {
        try {
            const response = await api.getGoals();
            setGoals(response.data || []);
        } catch (err) {
            console.error('Error cargando metas:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGoal = async (e) => {
        e.preventDefault();
        try {
            await api.createGoal({
                ...newGoal,
                montoObjetivo: parseFloat(newGoal.montoObjetivo)
            });
            setNewGoal({ nombre: '', tipo: 'ahorro', montoObjetivo: '', fechaObjetivo: '' });
            setShowForm(false);
            fetchGoals();
        } catch (err) {
            alert('Error creando meta: ' + err.message);
        }
    };

    const handleAddContribution = async (goalId) => {
        const monto = prompt('Monto del aporte:');
        if (monto && !isNaN(parseFloat(monto))) {
            try {
                await api.addContribution(goalId, parseFloat(monto), 'Aporte manual');
                fetchGoals();
            } catch {
                alert('Error agregando aporte');
            }
        }
    };

    const handleDelete = async (id) => {
        if (confirm('¿Eliminar esta meta?')) {
            try {
                await api.deleteGoal(id);
                fetchGoals();
            } catch {
                alert('Error eliminando meta');
            }
        }
    };

    const formatMoney = (amount) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS'
        }).format(amount);
    };

    if (loading) {
        return <div className="goals-panel loading">Cargando metas...</div>;
    }

    return (
        <div className="goals-panel">
            <div className="goals-header">
                <h3> Metas de Ahorro</h3>
                <button
                    className="add-goal-btn"
                    onClick={() => setShowForm(!showForm)}
                >
                    {showForm ? '' : '+ Nueva Meta'}
                </button>
            </div>

            {showForm && (
                <form className="goal-form" onSubmit={handleCreateGoal}>
                    <input
                        type="text"
                        placeholder="Nombre de la meta"
                        value={newGoal.nombre}
                        onChange={(e) => setNewGoal({ ...newGoal, nombre: e.target.value })}
                        required
                    />
                    <select
                        value={newGoal.tipo}
                        onChange={(e) => setNewGoal({ ...newGoal, tipo: e.target.value })}
                    >
                        <option value="ahorro">Ahorro</option>
                        <option value="inversion">Inversión</option>
                    </select>
                    <input
                        type="number"
                        placeholder="Monto objetivo"
                        value={newGoal.montoObjetivo}
                        onChange={(e) => setNewGoal({ ...newGoal, montoObjetivo: e.target.value })}
                        required
                    />
                    <input
                        type="date"
                        value={newGoal.fechaObjetivo}
                        onChange={(e) => setNewGoal({ ...newGoal, fechaObjetivo: e.target.value })}
                    />
                    <button type="submit" className="submit-btn">Crear Meta</button>
                </form>
            )}

            {goals.length === 0 ? (
                <div className="no-goals">
                    <p>No tenés metas configuradas</p>
                    <p className="hint">¡Creá tu primera meta de ahorro!</p>
                </div>
            ) : (
                <div className="goals-list">
                    {goals.map((goal) => (
                        <div key={goal._id} className={`goal-card ${goal.completada ? 'completed' : ''}`}>
                            <div className="goal-info">
                                <span className={`goal-type ${goal.tipo}`}>
                                    {goal.tipo === 'ahorro' ? '' : ''}
                                </span>
                                <div>
                                    <h4>{goal.nombre}</h4>
                                    <span className="goal-amounts">
                                        {formatMoney(goal.montoActual)} / {formatMoney(goal.montoObjetivo)}
                                    </span>
                                </div>
                            </div>

                            <div className="goal-progress">
                                <div
                                    className="progress-bar"
                                    style={{ width: `${goal.progreso || 0}%` }}
                                />
                            </div>

                            <div className="goal-actions">
                                <span className="progress-text">{Math.round(goal.progreso || 0)}%</span>
                                <button
                                    className="action-btn add"
                                    onClick={() => handleAddContribution(goal._id)}
                                    title="Agregar aporte"
                                >
                                    +
                                </button>
                                <button
                                    className="action-btn delete"
                                    onClick={() => handleDelete(goal._id)}
                                    title="Eliminar"
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
