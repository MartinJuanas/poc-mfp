import { describe, it, expect } from 'vitest';
import { weeklyExpenses } from '../services/weeklyExpenses.js';

const periodo = { mes: 11, anio: 2026 };
describe('Gastos semanales por fecha real', () => {
  it('usa lunes a domingo, recorta al mes e incluye semanas sin gastos', () => {
    const result = weeklyExpenses([], [], periodo);
    expect(result.semanas.map(w => [w.desde, w.hasta])).toEqual([
      ['2026-11-01', '2026-11-01'], ['2026-11-02', '2026-11-08'], ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'], ['2026-11-23', '2026-11-29'], ['2026-11-30', '2026-11-30']
    ]);
    expect(result.total).toBe(0);
  });
  it('respeta domingos, lunes, centavos, fechas fuera del mes y gastos sin fecha', () => {
    const result = weeklyExpenses([
      { fecha: '2026-11-01', monto: .1 }, { fecha: '2026-11-01', monto: .2 },
      { fecha: '2026-11-02', monto: 50, periodo: { mes: 10, anio: 2026 } },
      { fecha: '2026-12-01', monto: 999 }, { fecha: '2026-10-31', monto: 999 },
      { monto: 20, periodo }, { fecha: null, monto: 30, periodo },
      { monto: 999, periodo: { mes: 10, anio: 2026 } }
    ], [], periodo);
    expect(result).toMatchObject({ total: 50.3, cantidad: 3, sinFecha: { cantidad: 2, total: 50 } });
    expect(result.semanas[0]).toMatchObject({ total: .3, cantidad: 2 });
    expect(result.semanas[1]).toMatchObject({ total: 50, cantidad: 1 });
  });
  it('incluye cada factura de gasto una vez y excluye sueldos e ingresos', () => {
    const result = weeklyExpenses([], [
      { categoria: 'factura', tipoMovimiento: 'GASTO', fechaAcreditacion: '2026-11-05T00:00:00Z', montoNeto: 100, items: [{ importe: 100 }] },
      { categoria: 'factura', tipoMovimiento: 'GASTO', montoNeto: 15, periodo },
      { categoria: 'recibo', tipoMovimiento: 'INGRESO', fechaAcreditacion: '2026-11-05', montoNeto: 1000 },
      { categoria: 'factura', tipoMovimiento: 'INGRESO', fechaAcreditacion: '2026-11-05', montoNeto: 2000 }
    ], periodo);
    expect(result).toMatchObject({ total: 100, cantidad: 1, sinFecha: { cantidad: 1, total: 15 } });
    expect(result.semanas[1].total).toBe(100);
  });
  it('cubre febrero bisiesto y el cambio de año', () => {
    const leap = weeklyExpenses([{ monto: 10, fecha: '2024-02-29' }], [], { mes: 2, anio: 2024 });
    expect(leap.semanas.at(-1)).toMatchObject({ hasta: '2024-02-29', total: 10 });
    const january = weeklyExpenses([{ monto: 20, fecha: '2027-01-01' }, { monto: 30, fecha: '2026-12-31' }], [], { mes: 1, anio: 2027 });
    expect(january.total).toBe(20);
    expect(january.semanas[0]).toMatchObject({ desde: '2027-01-01', hasta: '2027-01-03' });
  });
});
