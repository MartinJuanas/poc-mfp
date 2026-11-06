/** Monetary math: operate in integer cents; never mix currencies. */
export function amount(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\s/g, '').replace(/^\$/, '') : value;
  const n = typeof normalized === 'string' && normalized.includes(',')
    ? Number(normalized.replace(/\./g, '').replace(',', '.')) : Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}
export const cents = value => Math.round(amount(value) * 100);
export const sumMoney = values => values.reduce((sum, value) => sum + cents(value), 0) / 100;
export const isIncome = receipt => receipt.tipoMovimiento !== 'GASTO';
// Preserve the document's period; only cash-flow reporting uses the payment date.
export function cashPeriod(receipt) {
  if (isIncome(receipt) && receipt.fechaAcreditacion) {
    const date = new Date(receipt.fechaAcreditacion);
    if (Number.isFinite(date.getTime())) return { mes: date.getUTCMonth() + 1, anio: date.getUTCFullYear() };
  }
  return receipt.periodo;
}
export const inCashYear = (receipt, year) => !year || year === 'historical' || Number(cashPeriod(receipt)?.anio) === Number(year);
export const validPeriod = p => Number.isInteger(Number(p?.mes)) && Number(p.mes) >= 1 && Number(p.mes) <= 12 && Number.isInteger(Number(p.anio)) && Number(p.anio) >= 1900 && Number(p.anio) <= 2100;
export function summarize(receipts, expenses) {
  const incomes = receipts.filter(isIncome);
  const totalNeto = sumMoney(incomes.map(r => r.montoNeto));
  const totalGastos = sumMoney([...expenses.map(e => e.monto), ...receipts.filter(r => !isIncome(r)).map(r => r.montoNeto)]);
  const months = new Set(incomes.map(cashPeriod).filter(validPeriod).map(p => `${p.anio}-${p.mes}`));
  return {
    totalDocumentos: receipts.length,
    countRecibos: receipts.filter(r => r.categoria !== 'factura').length,
    countFacturas: receipts.filter(r => r.categoria === 'factura').length,
    totalBruto: sumMoney(incomes.map(r => r.totalHaberes)),
    totalRetenciones: sumMoney(incomes.map(r => r.totalRetenciones)), totalNeto, totalGastos,
    balance: (cents(totalNeto) - cents(totalGastos)) / 100,
    promedioNeto: months.size ? Math.round(cents(totalNeto) / months.size) / 100 : 0,
    porcentajeAhorro: totalNeto > 0 ? Math.round((totalNeto - totalGastos) / totalNeto * 1000) / 10 : null,
    moneda: 'ARS'
  };
}
export function monthlyTotals(receipts, expenses) {
  const groups = new Map();
  const row = p => {
    if (!validPeriod(p)) return null;
    const key = `${p.anio}-${String(p.mes).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, { periodo: key, mes: Number(p.mes), anio: Number(p.anio), bruto: 0, neto: 0, retenciones: 0, gastos: 0, count: 0 });
    return groups.get(key);
  };
  for (const r of receipts) {
    const m = row(cashPeriod(r)); if (!m) continue;
    if (isIncome(r)) { m.neto += cents(r.montoNeto); m.bruto += cents(r.totalHaberes); m.retenciones += cents(r.totalRetenciones); m.count++; }
    else m.gastos += cents(r.montoNeto);
  }
  for (const e of expenses) { const m = row(e.periodo); if (m) m.gastos += cents(e.monto); }
  return [...groups.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)).map(m => ({ ...m, bruto: m.bruto / 100, neto: m.neto / 100, retenciones: m.retenciones / 100, gastos: m.gastos / 100, balance: (m.neto - m.gastos) / 100 }));
}
export function calculateReceipt({ categoria, haberes = [], retenciones = [], items = [] }) {
  if (categoria !== 'recibo') return { montoNeto: sumMoney(items.map(i => i.importe)) };
  const totalHaberes = sumMoney(haberes.flatMap(h => [h.haberesConAporte, h.haberesSinAporte]));
  const totalRetenciones = sumMoney(retenciones.map(r => r.importe));
  return { totalHaberes, totalRetenciones, montoNeto: (cents(totalHaberes) - cents(totalRetenciones)) / 100 };
}
