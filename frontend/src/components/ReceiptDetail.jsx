import { Modal, Notice } from './UI';
import { useState } from 'react';
import api from '../services/api';
import './ReceiptDetail.css';

export default function ReceiptDetail({ receipt, onClose, onDelete }) {
    const [activeTab, setActiveTab] = useState('general');
    const [deleting, setDeleting] = useState(false);
    const [error,setError] = useState('');

    if (!receipt) return null;

    // Helper para obtener montos en dólares (guardados o calculados al vuelo)
    const getUSDValues = () => {
        if (receipt.montoEnDolares && Object.keys(receipt.montoEnDolares).length > 0) {
            return receipt.montoEnDolares;
        }
        // Fallback: calcular si tenemos cotización guardada
        if (receipt.cotizacionDolar && receipt.montoNeto) {
            const { oficial, blue, mayorista, cripto } = receipt.cotizacionDolar;
            return {
                oficial: oficial ? receipt.montoNeto / oficial : null,
                blue: blue ? receipt.montoNeto / blue : null,
                mayorista: mayorista ? receipt.montoNeto / mayorista : null,
                cripto: cripto ? receipt.montoNeto / cripto : null
            };
        }
        return null;
    };

    const usdValues = getUSDValues();

    const formatMoney = (value) => {
        if (value == null) return '-';
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS'
        }).format(value);
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('es-AR', { timeZone: 'UTC' });
    };

    const getMonthName = (month) => {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return months[month - 1] || '-';
    };

    const handleDelete = async () => {
        if (!window.confirm('¿Estás seguro de eliminar este documento?')) return;

        try {
            setDeleting(true);
            await api.deleteReceipt(receipt._id);
            if (onDelete) onDelete(receipt._id);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Modal title="Detalle del documento" wide onClose={onClose}><div className="receipt-detail-content">{error && <Notice error>{error}</Notice>}
                <header className="detail-header">
                    <div className="header-info">
                        <span className={`category-badge ${receipt.categoria || 'recibo'}`}>
                            {receipt.categoria === 'factura' ? ' Factura' : ' Recibo'}
                        </span>
                        <h2>
                            {receipt.periodo?.mes && receipt.periodo?.anio
                                ? `${getMonthName(receipt.periodo.mes)} ${receipt.periodo.anio}`
                                : receipt.archivoOriginal || 'Documento'}
                        </h2>
                        <span className="receipt-number">#{receipt.numeroRecibo}</span>
                    </div>
                    <div className="header-actions">
                        <button
                            className="delete-btn-detail"
                            onClick={handleDelete}
                            disabled={deleting}
                            title="Eliminar documento"
                        >
                            {deleting ? 'Eliminando…' : 'Eliminar'}
                        </button>

                    </div>
                </header>

                <div className="detail-tabs">
                    {receipt.categoria === 'factura' && <button className={`detail-tab ${activeTab === 'items' ? 'active' : ''}`} onClick={()=>setActiveTab('items')}>Ítems ({receipt.items?.length || 0})</button>}
                    <button
                        className={`detail-tab ${activeTab === 'general' ? 'active' : ''}`}
                        onClick={() => setActiveTab('general')}
                    >
                        General
                    </button>
                    <button
                        className={`detail-tab ${activeTab === 'haberes' ? 'active' : ''}`}
                        onClick={() => setActiveTab('haberes')}
                    >
                        Haberes ({receipt.haberes?.length || 0})
                    </button>
                    <button
                        className={`detail-tab ${activeTab === 'retenciones' ? 'active' : ''}`}
                        onClick={() => setActiveTab('retenciones')}
                    >
                        Retenciones ({receipt.retenciones?.length || 0})
                    </button>
                </div>

                <div className="detail-content">
                    {activeTab === 'items' && <div className="haberes-tab"><h3>Detalle de la factura</h3>{receipt.items?.length ? receipt.items.map((item,index)=><div className="info-row" key={index}><span>{item.descripcion} {item.cantidad ? `× ${item.cantidad}` : ''}</span><strong>{formatMoney(item.importe)}</strong></div>) : <p>No hay ítems registrados.</p>}<div className="info-row"><span>Subtotal</span><strong>{formatMoney(receipt.subtotal)}</strong></div><div className="info-row"><span>IVA</span><strong>{formatMoney(receipt.iva)}</strong></div></div>}
                    {activeTab === 'general' && (
                        <div className="general-tab">
                            <div className="money-summary">
                                <div className="money-box bruto">
                                    <span className="money-label">Total Bruto</span>
                                    <span className="money-value">{formatMoney(receipt.totalHaberes)}</span>
                                </div>
                                <div className="money-box retenciones">
                                    <span className="money-label">Retenciones</span>
                                    <span className="money-value">- {formatMoney(receipt.totalRetenciones)}</span>
                                </div>
                                <div className="money-box neto">
                                    <span className="money-label">{receipt.tipoMovimiento === 'GASTO' ? 'Total del gasto' : 'Neto a cobrar'}</span>
                                    <span className="money-value">{formatMoney(receipt.montoNeto)}</span>
                                </div>
                            </div>

                            <div className="info-grid">
                                <div className="info-section">
                                    <h4> Período</h4>
                                    <div className="info-row">
                                        <span>Mes/Año</span>
                                        <span>{receipt.periodo?.mes && receipt.periodo?.anio
                                            ? `${getMonthName(receipt.periodo.mes)} ${receipt.periodo.anio}`
                                            : '-'}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Días Trabajo</span>
                                        <span>{receipt.diasTrabajo || '-'}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Fecha Pago</span>
                                        <span>{formatDate(receipt.fechaAcreditacion)}</span>
                                    </div>
                                </div>

                                <div className="info-section">
                                    <h4> Empleado</h4>
                                    <div className="info-row">
                                        <span>Nombre</span>
                                        <span>{receipt.empleado?.nombre || '-'}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>CUIL</span>
                                        <span>{receipt.cuil || receipt.empleado?.cuil || '-'}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Legajo</span>
                                        <span>{receipt.empleado?.legajo || '-'}</span>
                                    </div>
                                </div>

                                <div className="info-section">
                                    <h4> Empleador</h4>
                                    <div className="info-row">
                                        <span>Empresa</span>
                                        <span>{receipt.empleador?.nombre || receipt.tipoRecibo || '-'}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>CUIT</span>
                                        <span>{receipt.empleador?.cuit || '-'}</span>
                                    </div>
                                </div>

                                <div className="info-section">
                                    <h4> Banco</h4>
                                    <div className="info-row">
                                        <span>Entidad</span>
                                        <span>{receipt.banco || '-'}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Cuenta</span>
                                        <span>{receipt.numeroCuenta || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            {usdValues && (
                                <div className="usd-section">
                                    <h4> Conversión USD (al momento de carga)</h4>
                                    <div className="usd-grid">
                                        <div className="usd-item">
                                            <span>Oficial</span>
                                            <span>${usdValues.oficial?.toFixed(2) || '-'}</span>
                                        </div>
                                        <div className="usd-item">
                                            <span>Blue</span>
                                            <span>${usdValues.blue?.toFixed(2) || '-'}</span>
                                        </div>
                                        <div className="usd-item">
                                            <span>Mayorista</span>
                                            <span>${usdValues.mayorista?.toFixed(2) || '-'}</span>
                                        </div>
                                        <div className="usd-item cripto">
                                            <span>Cripto (USDT)</span>
                                            <span>${usdValues.cripto?.toFixed(2) || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'haberes' && (
                        <div className="haberes-tab">
                            {receipt.haberes && receipt.haberes.length > 0 ? (
                                <table className="concepts-table">
                                    <thead>
                                        <tr>
                                            <th>Código</th>
                                            <th>Concepto</th>
                                            <th>Unidad</th>
                                            <th>Con Aporte</th>
                                            <th>Sin Aporte</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {receipt.haberes.map((h, i) => (
                                            <tr key={i}>
                                                <td>{h.codigo || '-'}</td>
                                                <td>{h.descripcion || '-'}</td>
                                                <td>{h.unidad || '-'}</td>
                                                <td className="amount">{formatMoney(h.haberesConAporte)}</td>
                                                <td className="amount">{formatMoney(h.haberesSinAporte)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="no-concepts">
                                    <p>No hay detalle de haberes disponible</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'retenciones' && (
                        <div className="retenciones-tab">
                            {receipt.retenciones && receipt.retenciones.length > 0 ? (
                                <table className="concepts-table">
                                    <thead>
                                        <tr>
                                            <th>Código</th>
                                            <th>Concepto</th>
                                            <th>%</th>
                                            <th>Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {receipt.retenciones.map((r, i) => (
                                            <tr key={i}>
                                                <td>{r.codigo || '-'}</td>
                                                <td>{r.descripcion || '-'}</td>
                                                <td>{r.porcentaje ? `${r.porcentaje}%` : '-'}</td>
                                                <td className="amount negative">{formatMoney(r.importe)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan="3"><strong>Total Retenciones</strong></td>
                                            <td className="amount negative">
                                                <strong>{formatMoney(receipt.totalRetenciones)}</strong>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            ) : (
                                <div className="no-concepts">
                                    <p>No hay detalle de retenciones disponible</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
