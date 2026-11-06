import useResource from '../hooks/useResource';
import { Notice } from './UI';
import './DashboardCharts.css'; // Reutilizamos estilos por ahora

export default function DashboardStats({ year }) {
    const {data:summary,loading,error,reload}=useResource(`/dashboard/summary${year==='historical'?'':`?year=${year}`}`);
    const formatMoney = (value) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0
        }).format(value);
    };

    if (loading) return <div className="dashboard-stats loading">Cargando...</div>;
    if(error)return <Notice error>{error}<button onClick={reload}>Reintentar</button></Notice>;
    if (!summary) return null;

    return (
        <div className="summary-cards">
            <div className="summary-card">
                <span className="card-icon"></span>
                <div className="card-content">
                    <span className="card-value">{summary.totalDocumentos}</span>
                    <span className="card-label">Documentos</span>
                </div>
            </div>
            <div className="summary-card bruto">
                <span className="card-icon"></span>
                <div className="card-content">
                    <span className="card-value">{formatMoney(summary.totalBruto)}</span>
                    <span className="card-label">Total Bruto</span>
                </div>
            </div>
            <div className="summary-card neto">
                <span className="card-icon"></span>
                <div className="card-content">
                    <span className="card-value">{formatMoney(summary.totalNeto)}</span>
                    <span className="card-label">Total Neto</span>
                </div>
            </div>
            <div className="summary-card retenciones">
                <span className="card-icon"></span>
                <div className="card-content">
                    <span className="card-value">{formatMoney(summary.totalRetenciones)}</span>
                    <span className="card-label">Total Retenciones</span>
                </div>
            </div>
            {summary.totalGastos != null && (
                <div className="summary-card gastos">
                    <span className="card-icon"></span>
                    <div className="card-content">
                        <span className="card-value">{formatMoney(summary.totalGastos)}</span>
                        <span className="card-label">Total Gastos</span>
                    </div>
                </div>
            )}
            {summary.balance != null && (
                <div className={`summary-card ${summary.balance >= 0 ? 'neto' : 'retenciones'}`}>
                    <span className="card-icon">{summary.balance >= 0 ? '' : ''}</span>
                    <div className="card-content">
                        <span className="card-value">{formatMoney(summary.balance)}</span>
                        <span className="card-label">Balance (Neto − Gastos)</span>
                    </div>
                </div>
            )}
        </div>
    );
}
