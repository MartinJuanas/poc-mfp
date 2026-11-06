import { cents } from './finance.js';

const dayKey = date => date.toISOString().slice(0, 10);
const dayMs = 86400000;
export function monthWindow({ mes, anio }) {
  return { inicio: new Date(Date.UTC(anio, mes - 1, 1)), fin: new Date(Date.UTC(anio, mes, 1)) };
}

export function weeklyExpenses(expenses, receipts, periodo) {
  const { inicio, fin } = monthWindow(periodo);
  const semanas = [];
  let cursor = new Date(inicio);
  while (cursor < fin) {
    const hasta = new Date(Math.min(cursor.getTime() + (6 - (cursor.getUTCDay() + 6) % 7) * dayMs, fin.getTime() - dayMs));
    semanas.push({ desde: dayKey(cursor), hasta: dayKey(hasta), total: 0, cantidad: 0 });
    cursor = new Date(hasta.getTime() + dayMs);
  }
  const entries = [
    ...expenses.map(e => ({ fecha: e.fecha, monto: e.monto, periodo: e.periodo })),
    ...receipts.filter(r => r.categoria === 'factura' && r.tipoMovimiento === 'GASTO').map(r => ({ fecha: r.fechaAcreditacion, monto: r.montoNeto, periodo: r.periodo }))
  ];
  const sinFecha = { cantidad: 0, total: 0 };
  for (const entry of entries) {
    const date = entry.fecha ? new Date(entry.fecha) : null;
    if (!date || !Number.isFinite(date.getTime())) {
      if (Number(entry.periodo?.mes) === periodo.mes && Number(entry.periodo?.anio) === periodo.anio) {
        sinFecha.cantidad++;
        sinFecha.total += cents(entry.monto);
      }
      continue;
    }
    if (date < inicio || date >= fin) continue;
    const key = dayKey(date);
    const week = semanas.find(w => key >= w.desde && key <= w.hasta);
    week.total += cents(entry.monto);
    week.cantidad++;
  }
  return {
    periodo,
    total: semanas.reduce((sum, week) => sum + week.total, 0) / 100,
    cantidad: semanas.reduce((sum, week) => sum + week.cantidad, 0),
    semanas: semanas.map(week => ({ ...week, total: week.total / 100 })),
    sinFecha: { ...sinFecha, total: sinFecha.total / 100 }
  };
}
