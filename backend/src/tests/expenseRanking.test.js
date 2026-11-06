import { describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ mode: 'offline' }));
vi.mock('../services/llmFactory.js', () => ({ getLLM: () => ({ invoke: async () => {
  if (state.mode === 'offline') throw new Error('Offline');
  return { content: 'La mayor suma corresponde a Café.' };
} }) }));
import { rankDescriptions, explainRanking } from '../services/expenseRanking.js';

describe('Consulta de gastos guardados por descripción', () => {
  it('normaliza tildes, espacios y mayúsculas, acumula centavos y cuenta repeticiones', () => {
    expect(rankDescriptions([{ descripcion: ' Café ', monto: .1 }, { descripcion: 'cafe', monto: .2 }, { descripcion: 'Taxi', monto: 10 }], []).ranking).toEqual([
      { descripcion: 'Taxi', total: 10, repeticiones: 1 }, { descripcion: 'Café', total: .3, repeticiones: 2 }
    ]);
  });
  it('cuenta el total de factura una sola vez sin sumar ítems ni sueldos', () => {
    const data = rankDescriptions([], [
      { categoria: 'factura', tipoMovimiento: 'GASTO', montoNeto: 120, items: [{ descripcion: 'Internet', importe: 100 }, { descripcion: 'IVA', importe: 20 }] },
      { categoria: 'recibo', tipoMovimiento: 'INGRESO', montoNeto: 1000 },
      { categoria: 'recibo', tipoMovimiento: 'GASTO', montoNeto: 200 },
      { categoria: 'factura', tipoMovimiento: 'INGRESO', montoNeto: 500 }
    ]);
    expect(data).toEqual({ ranking: [{ descripcion: 'Internet / IVA', total: 120, repeticiones: 1 }], total: 120, cantidad: 1 });
  });
  it('mantiene el ranking calculado con y sin IA y responde sin datos', async () => {
    const data = rankDescriptions([{ descripcion: 'Café', monto: 100 }], []);
    state.mode = 'offline';
    expect((await explainRanking(data, { mes: 1, anio: 2026 })).method).toBe('calculated');
    state.mode = 'online';
    expect((await explainRanking(data, { mes: 1, anio: 2026 })).method).toBe('ai');
    expect(data.ranking[0].total).toBe(100);
    expect((await explainRanking(rankDescriptions([], []), {})).method).toBe('calculated');
  });
});
