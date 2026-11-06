export const money = (value, currency = 'ARS') => value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
export const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const localDateInput = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const periodLabel = p => p?.mes && p?.anio ? `${months[p.mes - 1]} ${p.anio}` : 'Sin período';
export function cashPeriod(receipt) {
  if (receipt.tipoMovimiento !== 'GASTO' && receipt.fechaAcreditacion) {
    const date = new Date(receipt.fechaAcreditacion);
    if (Number.isFinite(date.getTime())) return { mes: date.getUTCMonth() + 1, anio: date.getUTCFullYear() };
  }
  return receipt.periodo;
}
export const parseAmount = value => {
  if (value === '' || value == null) return 0;
  const n = Number(typeof value === 'string' && value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value);
  return Number.isFinite(n) ? n : NaN;
};
export const total = values => values.reduce((s, value) => s + Math.round(parseAmount(value || 0) * 100), 0) / 100;
export function calculate(data) {
  if (data.categoria !== 'recibo') return { montoNeto: total((data.items || []).map(i => i.importe)) };
  const totalHaberes = total((data.haberes || []).flatMap(h => [h.haberesConAporte, h.haberesSinAporte]));
  const totalRetenciones = total((data.retenciones || []).map(r => r.importe));
  return { totalHaberes, totalRetenciones, montoNeto: Math.round((totalHaberes - totalRetenciones) * 100) / 100 };
}
