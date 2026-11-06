import { describe, it, expect } from 'vitest';
import { amount, sumMoney, summarize, monthlyTotals, calculateReceipt, cashPeriod, inCashYear } from '../services/finance.js';
const p = { mes: 1, anio: 2026 };
describe('Finanzas: ingresos, gastos, períodos y centavos', () => {
 it('imputa al mes de cobro cruzando año y conserva el período del recibo',()=>{
  const receipt={montoNeto:100,periodo:{mes:12,anio:2025},fechaAcreditacion:'2026-01-05'};
  expect(cashPeriod(receipt)).toEqual(p);
  expect(receipt.periodo).toEqual({mes:12,anio:2025});
  expect(inCashYear(receipt,2025)).toBe(false);
  expect(inCashYear(receipt,2026)).toBe(true);
  expect(monthlyTotals([receipt],[])[0].periodo).toBe('2026-01');
  expect(cashPeriod({...receipt,tipoMovimiento:'GASTO'})).toEqual(receipt.periodo);
  expect(cashPeriod({...receipt,fechaAcreditacion:null})).toEqual(receipt.periodo);
 });
 it('promedia los meses reales de cobro',()=>expect(summarize([{montoNeto:100,periodo:p,fechaAcreditacion:'2026-02-01'},{montoNeto:100,periodo:p,fechaAcreditacion:'2026-03-01'}],[]).promedioNeto).toBe(100));
 it('suma dinero en centavos y respeta separadores',()=>{expect(sumMoney([0.1,0.2])).toBe(.3);expect(amount('1.234,56')).toBe(1234.56);expect(amount('1234.56')).toBe(1234.56);expect(amount('texto',null)).toBe(null);});
 it('separa factura recibida de ingresos y calcula balance',()=>{const s=summarize([{montoNeto:1500000,periodo:p},{montoNeto:100000,tipoMovimiento:'GASTO',categoria:'factura',periodo:p}],[{monto:1000000,periodo:p}]);expect(s.totalNeto).toBe(1500000);expect(s.totalGastos).toBe(1100000);expect(s.balance).toBe(400000);expect(s.porcentajeAhorro).toBe(26.7);});
 it('calcula promedio por mes y no por cantidad de recibos',()=>{expect(summarize([{montoNeto:100,periodo:p},{montoNeto:50,periodo:p}],[]).promedioNeto).toBe(150);});
 it('no inventa ahorro cuando no hay ingresos',()=>expect(summarize([],[]).porcentajeAhorro).toBe(null));
 it('agrupa meses con gastos sin ingresos y excluye períodos inválidos',()=>{expect(monthlyTotals([{montoNeto:9,periodo:{mes:13,anio:2026}}],[{monto:10.1,periodo:p}])).toEqual([{periodo:'2026-01',mes:1,anio:2026,bruto:0,neto:0,retenciones:0,gastos:10.1,count:0,balance:-10.1}]);});
 it('recalcula haberes, retenciones y montos nulos',()=>{expect(calculateReceipt({categoria:'recibo',haberes:[{haberesConAporte:'1.200,50',haberesSinAporte:'100.25'}],retenciones:[{importe:200.5}]})).toEqual({totalHaberes:1300.75,totalRetenciones:200.5,montoNeto:1100.25});});
});
