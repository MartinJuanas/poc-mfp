import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const state=vi.hoisted(()=>({content:''}));
vi.mock('../services/llmFactory.js',()=>({getLLM:()=>({invoke:async()=>({content:state.content})})}));
vi.mock('../models/Receipt.js',()=>({default:{find:()=>{throw new Error('Mongo unavailable');}}}));
import { parseReceipt } from '../services/pdfParser.js';
const pdf=readFileSync(new URL('./fixtures/salary.pdf',import.meta.url));
describe('Respuesta estructurada de IA',()=>{
 it('lee bloques LangChain, factura y decimales sin perder clasificación',async()=>{state.content=[{type:'text',text:'```json\n'+JSON.stringify({tipoDocumento:'FACTURA_RECIBIDA',categoria:'GASTO',numeroRecibo:'F-12',periodo:{mes:2,anio:2026},totales:{totalComprobante:'1.234,56',subtotal:1000,iva:234.56},emisor:{nombre:'Servicio'},items:[{descripcion:'Internet',importe:1234.56}]})+'\n```'}];const r=await parseReceipt(pdf);expect(r.extractionMethod).toBe('ai');expect(r.tipoMovimiento).toBe('GASTO');expect(r.montoNeto).toBe(1234.56);expect(r.items).toHaveLength(1);expect(r.periodo).toEqual({mes:2,anio:2026});});
 it('respuesta inválida utiliza fallback con aviso visible',async()=>{state.content='no es JSON';const r=await parseReceipt(pdf);expect(r.extractionMethod).toBe('fallback');expect(r.extractionWarning).toBeTruthy();});
 it('datos incompletos no fabrican período ni monto',async()=>{state.content='{}';const r=await parseReceipt(pdf);expect(r.periodo).toEqual({mes:null,anio:null});expect(r.montoNeto).toBeNull();});
});
