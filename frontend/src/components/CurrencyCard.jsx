import { useState } from 'react';
import useResource from '../hooks/useResource';
import api from '../services/api';
import { Icon, Notice } from './UI';
import './CurrencyCard.css';

export default function CurrencyCard() {
    const { data, loading, error, reload } = useResource('/currency');
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState('');
    async function refresh() {
        setRefreshing(true); setRefreshError('');
        try { await api.refreshCurrencyRates(); reload(); }
        catch (err) { setRefreshError(err.message); }
        finally { setRefreshing(false); }
    }
    return <div className="currency-card" aria-busy={loading || refreshing}>
        <div className="currency-header"><h3>Cotización dólar</h3>
            <button className="refresh-btn" aria-label="Actualizar cotizaciones" onClick={refresh} disabled={loading || refreshing}><Icon name="refresh" size={16}/></button>
        </div>
        {loading && <p className="data-footnote" role="status">Consultando cotizaciones…</p>}
        {(error || refreshError) && <Notice error>{error || refreshError} <button onClick={reload}>Reintentar</button></Notice>}
        <div className="rates-grid">{[['oficial','Oficial'],['blue','Blue'],['mayorista','Mayorista']].map(([key,label])=>data?.[key] && <div className={`rate-item ${key}`} key={key}>
            <span className="rate-label">{label}</span><span className="rate-value">{Number(data[key].venta).toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2})}</span>
        </div>)}</div>
        {data?.fechaActualizacion && <div className="rate-time">Actualizado: {new Date(data.fechaActualizacion).toLocaleTimeString('es-AR')}</div>}
        <p className="data-footnote">Referencia por USD. Las metas mantienen su moneda original.</p>
    </div>;
}
