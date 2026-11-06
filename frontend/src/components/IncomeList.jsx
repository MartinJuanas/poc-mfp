import { Notice, Modal, Icon } from './UI';
import { useState, useEffect } from 'react';
import api from '../services/api';
import ReceiptForm from './ReceiptForm';
import './IncomeList.css';

export default function IncomeList({ refreshTrigger, onReceiptClick, onChange }) {
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [filter, setFilter] = useState('all');
    const [error,setError] = useState('');
    const [search,setSearch] = useState(''); // 'all' | 'recibo' | 'factura'

    // State for editing
    const [editingReceipt, setEditingReceipt] = useState(null);

    useEffect(() => {
        fetchData();
    }, [refreshTrigger]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [receiptsRes, statsRes] = await Promise.all([
                api.getReceipts(),
                api.getReceiptStats().catch(()=>({data:null}))
            ]);
            setReceipts(receiptsRes.data || []);
            setStats(statsRes.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatMoney = (amount, currency = 'ARS') => {
        if (amount == null) return '-';
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency
        }).format(amount);
    };

    const getMonthName = (month) => {
        const months = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        return months[month - 1] || '';
    };

    const handleDelete = async (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        const confirmed = window.confirm('¿Eliminar este documento?');
        if (confirmed) {
            try {
                await api.deleteReceipt(id);
                fetchData(); onChange?.();
            } catch (err) {
                setError(err.message);
            }
        }
    };

    // Helper para obtener blue de forma segura
    const getUSDBlue = (receipt) => {
        if (receipt.montoEnDolares?.blue) return receipt.montoEnDolares.blue;
        if (receipt.cotizacionDolar?.blue && receipt.montoNeto) {
            return receipt.montoNeto / receipt.cotizacionDolar.blue;
        }
        return null;
    };

    const handleEditClick = (e, receipt) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingReceipt(receipt);
    };

    const handleUpdate = async (updatedData) => {
        await api.updateReceipt(editingReceipt._id, updatedData);
        setEditingReceipt(null);
        fetchData(); onChange?.();
    };

    const filteredReceipts = receipts.filter(r => {
        if (!`${r.empleador?.nombre||''} ${r.numeroRecibo||''} ${r.archivoOriginal||''}`.toLowerCase().includes(search.toLowerCase())) return false;
        if (filter === 'all') return true;
        // Si no tiene categoría, asumimos que es 'recibo' (legacy)
        const currentCategory = r.categoria || 'recibo';
        return currentCategory === filter;
    });

    if (loading) {
        return <div className="income-list loading">Cargando documentos...</div>;
    }

    return (
        <div className="income-list">{error && <Notice error>{error}<button onClick={fetchData}>Reintentar</button></Notice>}
            <div className="income-header"><input aria-label="Buscar documentos" value={search} placeholder="Buscar documento…" onChange={e=>setSearch(e.target.value)}/>
                <h3> Documentos</h3>
                <div className="filter-buttons">
                    <button
                        className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        Todos ({receipts.length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'recibo' ? 'active' : ''}`}
                        onClick={() => setFilter('recibo')}
                    >
                        Recibos ({receipts.filter(r => r.categoria !== 'factura').length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'factura' ? 'active' : ''}`}
                        onClick={() => setFilter('factura')}
                    >
                        Facturas ({receipts.filter(r => r.categoria === 'factura').length})
                    </button>
                </div>
            </div>

            {stats && stats.totalIngresos > 0 && (
                <div className="income-stats">
                    <span className="stat-total">
                        Total: {formatMoney(stats.totalIngresos)}
                    </span>
                    {stats.totalEnDolarBlue && (
                        <span className="stat-usd">
                            ≈ USD {stats.totalEnDolarBlue.toFixed(2)} (blue)
                        </span>
                    )}
                    {stats.totalEnDolarCripto && (
                        <span className="stat-usd cripto">
                            ≈ USDT {stats.totalEnDolarCripto.toFixed(2)} (cripto)
                        </span>
                    )}
                </div>
            )}

            {filteredReceipts.length === 0 ? (
                <div className="no-receipts">
                    <p>No hay documentos</p>
                    <p className="hint">Subí tu primer recibo o factura arriba </p>
                </div>
            ) : (
                <div className="receipts-table">
                    <div className="table-header">
                        <span>Tipo</span>
                        <span>Período</span>
                        <span>Empleador</span>
                        <span>Neto</span>
                        <span>USD Blue</span>
                        <span>Acciones</span>
                    </div>

                    {filteredReceipts.map((receipt) => (
                        <div
                            key={receipt._id}
                            role="group" aria-label={receipt.numeroRecibo}
                            className="receipt-row clickable"
                            onClick={() => onReceiptClick && onReceiptClick(receipt)}
                        >
                            <span className={`category-badge ${receipt.categoria || 'recibo'}`}>
                                <Icon name="document" size={18}/>
                            </span>
                            <button className="text-action period" onClick={e=>{e.stopPropagation();onReceiptClick?.(receipt);}}>
                                {receipt.periodo?.mes && receipt.periodo?.anio
                                    ? `${getMonthName(receipt.periodo.mes)} ${receipt.periodo.anio}`
                                    : receipt.archivoOriginal?.slice(0, 15) || '-'}
                            </button>
                            <span className="employer">
                                {receipt.empleador?.nombre || receipt.tipoRecibo || '-'}
                            </span>
                            <span className="amount-ars">
                                {formatMoney(receipt.montoNeto)}
                            </span>
                            <span className="amount-usd">
                                ${getUSDBlue(receipt)?.toFixed(2) || '-'}
                            </span>
                            <div className="actions-cell">
                                <button
                                    className="btn-icon edit"
                                    onClick={(e) => handleEditClick(e, receipt)}
                                    title="Editar" aria-label={`Editar ${receipt.numeroRecibo}`}
                                >
                                    <Icon name="edit" size={17}/>
                                </button>
                                <button
                                    className="btn-icon delete"
                                    onClick={(e) => handleDelete(e, receipt._id)}
                                    title="Eliminar" aria-label={`Eliminar ${receipt.numeroRecibo}`}
                                >
                                    <Icon name="trash" size={17}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {stats && stats.totalRecibos > 0 && (
                <div className="income-footer">
                    <div className="avg-badge">
                        Promedio mensual: {formatMoney(stats.promedioMensual)}
                    </div>
                </div>
            )}

            {/* Modal de Edición */}
            {editingReceipt && (
                <Modal title="Editar documento" wide onClose={()=>setEditingReceipt(null)}><div>
                        <ReceiptForm
                            initialData={editingReceipt}
                            onSubmit={handleUpdate}
                            onCancel={() => setEditingReceipt(null)}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
}
