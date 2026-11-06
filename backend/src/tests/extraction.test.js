import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../services/llmFactory.js',()=>({getLLM:()=>{throw new Error('Provider unavailable');}}));
vi.mock('../models/Receipt.js',()=>({default:{find:()=>{throw new Error('Mongo unavailable');}}}));
import { parseReceipt, parseNumericValue, parseReceiptFallback } from '../services/pdfParser.js';
import { validateFile, validateBatch } from '../services/fileValidator.js';
const fixture = name => readFileSync(new URL(`./fixtures/${name}.pdf`,import.meta.url));
describe('Extracción y validación real de PDF',()=>{
 it('usa fallback si falla IA y Mongo, mantiene período y neto',async()=>{const data=await parseReceipt(fixture('salary'));expect(data.extractionMethod).toBe('fallback');expect(data.periodo).toEqual({mes:1,anio:2026});expect(data.montoNeto).toBe(1500000);expect(data.extractionWarning).toBeTruthy();});
 it('preserva punto decimal estándar',()=>expect(parseNumericValue('1234.56')).toBe(1234.56));
 it('marca campos incompletos sin inventar período',()=>{const data=parseReceiptFallback('Documento sin valores');expect(data.montoNeto).toBe(null);expect(data.periodo).toEqual({mes:null,anio:null});});
 it('rechaza PDF vacío, corrupto, no PDF y extensión falsa',async()=>{for(const [buffer,name] of [[fixture('empty'),'empty.pdf'],[Buffer.from('%PDF-corrupt'),'broken.pdf'],[Buffer.from('hello'),'text.pdf'],[fixture('salary'),'fake.exe']]){expect((await validateFile({buffer,originalname:name,mimetype:'application/pdf'})).valid).toBe(false);}});
 it('valida tamaño configurable',async()=>{const previous=process.env.MAX_FILE_SIZE_MB;process.env.MAX_FILE_SIZE_MB='1';expect((await validateFile({buffer:Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(1024*1024)]),originalname:'large.pdf'})).errorCode).toBe('FILE_TOO_LARGE');if(previous)process.env.MAX_FILE_SIZE_MB=previous;else delete process.env.MAX_FILE_SIZE_MB;});
 it('acepta mismo nombre en distintas carpetas y deja decidir al hash',()=>expect(validateBatch([{originalname:'recibo.pdf'},{originalname:'recibo.pdf'}]).valid).toBe(true));
});
