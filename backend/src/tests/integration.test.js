import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const state=vi.hoisted(()=>({active:0,max:0,calls:0,mode:'ok'}));
vi.mock('../services/llmFactory.js',()=>({getLLM:()=>{throw new Error('Test: IA sin conexión');}}));
vi.mock('../services/dolarApi.js',()=>({getDolarRates:async()=>{throw new Error('Currency unavailable');},convertToUSD:async()=>({})}));
vi.mock('../services/pdfParser.js',()=>({parseReceipt:async buffer=>{state.calls++;state.active++;state.max=Math.max(state.max,state.active);await new Promise(r=>setTimeout(r,25));state.active--;if(state.mode==='error')throw new Error('LLM exploded');return {numeroRecibo:state.mode==='sameNumber'?'SAME':`R-${buffer.length}`,periodo:state.mode==='review'?{}:{mes:1,anio:2026},montoNeto:1500000,totalHaberes:1800000,totalRetenciones:300000,categoria:'recibo',tipoMovimiento:'INGRESO'};},parseMultipleReceipts:async()=>[]}));
import { app } from '../index.js';
import Receipt from '../models/Receipt.js';
import Expense, { migrateLegacyExpenseCategories } from '../models/Expense.js';
import Goal from '../models/Goal.js';
import ExpenseImport from '../models/ExpenseImport.js';
import ExpenseBudget from '../models/ExpenseBudget.js';
import BulkImport from '../models/BulkImport.js';
import { storeBuffers, readBuffer } from '../services/bulkStorage.js';
import bulkService, { batchCounts } from '../services/bulkService.js';
let mongo,server,base,storage;
const pdf=readFileSync(new URL('./fixtures/salary.pdf',import.meta.url));
const file=(buffer=pdf,name='recibo.pdf')=>({buffer,originalname:name,mimetype:'application/pdf'});
const request=async(route,method='GET',body)=>{const response=await fetch(base+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return{status:response.status,...await response.json()};};
beforeAll(async()=>{mongo=await MongoMemoryServer.create({binary:{version:"7.0.14"},instance:{args:process.platform==='win32'?[]:["--nounixsocket"]}});await mongoose.connect(mongo.getUri());await Promise.all([Receipt.init(),Expense.init(),Goal.init(),BulkImport.init(),ExpenseImport.init(),ExpenseBudget.init()]);storage=await mkdtemp(path.join(os.tmpdir(),'finance-bulk-'));process.env.BULK_STORAGE_DIR=storage;server=app.listen(0);await new Promise(r=>server.once('listening',r));base=`http://localhost:${server.address().port}/api`;},120000);
afterAll(async()=>{if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();await mongo?.stop();if(storage)await rm(storage,{recursive:true,force:true});});
beforeEach(async()=>{await Promise.all([Receipt.deleteMany({}),Expense.deleteMany({}),Goal.deleteMany({}),BulkImport.deleteMany({}),ExpenseImport.deleteMany({}),ExpenseBudget.deleteMany({})]);Object.assign(state,{active:0,max:0,calls:0,mode:'ok'});});
describe('API + MongoDB: regresiones críticas',()=>{
 it('guarda un presupuesto por mes/categoría, calcula excedentes y permite quitar el límite',async()=>{
  const periodo={mes:11,anio:2026};
  const route='/expenses/budgets/salida';
  expect((await request(route,'PUT',{periodo,limite:100})).status).toBe(200);
  await request(route,'PUT',{periodo,limite:150});
  expect(await ExpenseBudget.countDocuments()).toBe(1);
  await Expense.create([{categoria:'salida',monto:100,periodo},{categoria:'salida',monto:60,periodo},{categoria:'salida',monto:999,periodo:{mes:10,anio:2026}},{categoria:'comida',monto:900,periodo}]);
  await Receipt.create({numeroRecibo:'B-F',categoria:'factura',tipoMovimiento:'GASTO',montoNeto:200,periodo});
  expect((await request('/expenses/budgets?mes=11&anio=2026')).data).toEqual([{categoria:'salida',limite:150,gastado:160,porcentaje:107,excedido:true,disponible:-10}]);
  expect((await request('/expenses/budgets?mes=10&anio=2026')).data).toEqual([]);
  await request(route,'PUT',{periodo,limite:200});
  expect((await request('/expenses/budgets?mes=11&anio=2026')).data[0]).toMatchObject({porcentaje:80,excedido:false,disponible:40});
  await request(route+'?mes=11&anio=2026','DELETE');
  expect(await ExpenseBudget.countDocuments()).toBe(0);expect(await Expense.countDocuments()).toBe(4);
 });
 it('rechaza presupuestos inválidos y no mezcla facturas con categorías manuales',async()=>{
  const periodo={mes:11,anio:2026};
  for(const limite of [0,-1,1.001,'100',null])expect((await request('/expenses/budgets/comida','PUT',{periodo,limite})).status).toBe(400);
  expect((await request('/expenses/budgets/no-existe','PUT',{periodo,limite:10})).status).toBe(400);
  expect((await request('/expenses/budgets')).status).toBe(400);
  expect((await request('/expenses/budgets/comida?mes=13&anio=2026','DELETE')).status).toBe(400);
  await Expense.create({categoria:'comida',monto:.3,periodo});
  await Receipt.create([{numeroRecibo:'B-F1',categoria:'factura',tipoMovimiento:'GASTO',montoNeto:100,periodo,items:[{importe:100}]},{numeroRecibo:'B-S1',categoria:'recibo',tipoMovimiento:'INGRESO',montoNeto:1000,periodo}]);
  const summary=(await request('/expenses/summary?mes=11&anio=2026')).data;
  expect(summary).toMatchObject({totalGastos:100.3,cantidadGastos:2});
  expect(summary.porCategoria).toEqual([{categoria:'facturas',total:100,count:1},{categoria:'comida',total:.3,count:1}]);
 });
 it('consulta gastos semanales por fecha y actualiza el total al editar y borrar',async()=>{
  const periodo={mes:11,anio:2026};
  const saved=await request('/expenses','POST',{monto:50,categoria:'salida',periodo:{mes:10,anio:2026},fecha:'2026-11-05'});
  expect(saved.status).toBe(201);
  await Expense.create([{monto:20,categoria:'otros',periodo},{monto:999,categoria:'otros',periodo,fecha:'2026-10-31'},{monto:888,categoria:'otros',periodo:{mes:10,anio:2026}}]);
  await Receipt.create([
   {numeroRecibo:'W-F',categoria:'factura',tipoMovimiento:'GASTO',montoNeto:100,fechaAcreditacion:'2026-11-05',periodo,items:[{importe:100}]},
   {numeroRecibo:'W-U',categoria:'factura',tipoMovimiento:'GASTO',montoNeto:10,periodo},
   {numeroRecibo:'W-S',categoria:'recibo',tipoMovimiento:'INGRESO',montoNeto:9999,fechaAcreditacion:'2026-11-05',periodo}
  ]);
  const url='/expenses/weekly?mes=11&anio=2026';
  const result=await request(url);
  expect(result.status).toBe(200);expect(result.data).toMatchObject({total:150,cantidad:2,sinFecha:{cantidad:2,total:30}});
  expect(result.data.semanas[1]).toMatchObject({desde:'2026-11-02',hasta:'2026-11-08',total:150});
  await request(`/expenses/${saved.data._id}`,'PUT',{fecha:'2026-11-09'});
  const edited=await request(url);expect(edited.data.semanas[1].total).toBe(100);expect(edited.data.semanas[2].total).toBe(50);
  await request(`/expenses/${saved.data._id}`,'DELETE');expect((await request(url)).data.total).toBe(100);
  expect((await request('/expenses/weekly')).status).toBe(400);
  expect((await request('/expenses/weekly?mes=13&anio=2026')).status).toBe(400);
 });
 it('consulta descripciones del período, incluye factura una vez y excluye sueldos',async()=>{
  const periodo={mes:9,anio:2026};
  expect((await request('/expenses','POST',{monto:20.1,descripcion:'Salida al cine',categoria:'salida',periodo})).status).toBe(201);
  await Expense.create([{monto:10.2,descripcion:' salida al CINE ',categoria:'salida',periodo},{monto:999,descripcion:'Otro mes',categoria:'otros',periodo:{mes:8,anio:2026}}]);
  await Receipt.create([{numeroRecibo:'FACT',categoria:'factura',tipoMovimiento:'GASTO',montoNeto:50,periodo,items:[{descripcion:'Internet',importe:50}]},{numeroRecibo:'SUELDO',categoria:'recibo',tipoMovimiento:'INGRESO',montoNeto:1000,periodo}]);
  const r=await request('/expenses/description-ranking?mes=9&anio=2026');
  expect(r.status).toBe(200);expect(r.data.method).toBe('calculated');expect(r.data.total).toBe(80.3);expect(r.data.cantidad).toBe(3);
  expect(r.data.ranking).toEqual([{descripcion:'Internet',total:50,repeticiones:1},{descripcion:'Salida al cine',total:30.3,repeticiones:2}]);
  expect((await request('/expenses/description-ranking')).status).toBe(400);
  expect((await request('/expenses/description-ranking?mes=10&anio=2026')).data.ranking).toEqual([]);
 });
 it('dashboard usa el año y mes de cobro para resumen, gráficos y ahorro',async()=>{
  await Receipt.create({numeroRecibo:'COBRO',categoria:'recibo',tipoMovimiento:'INGRESO',montoNeto:100,totalHaberes:120,totalRetenciones:20,periodo:{mes:12,anio:2025},fechaAcreditacion:'2026-01-05',empleador:{nombre:'Empresa'},retenciones:[{descripcion:'Aporte',importe:20}]});
  expect((await request('/dashboard/years')).data).toEqual([2026]);
  expect((await request('/dashboard/summary?year=2025')).data.totalNeto).toBe(0);
  expect((await request('/dashboard/summary?year=2026')).data.totalNeto).toBe(100);
  expect((await request('/dashboard/monthly?year=2026')).data[0]).toMatchObject({periodo:'2026-01',neto:100});
  expect((await request('/dashboard/savings-evolution?year=2026')).data[0]).toMatchObject({periodo:'2026-01',ingreso:100});
  expect((await request('/dashboard/by-employer?year=2026')).data[0].totalNeto).toBe(100);
  expect((await request('/dashboard/retenciones?year=2026')).data[0].total).toBe(20);
  const saved=await Receipt.findOne().lean();expect(saved.periodo).toEqual({mes:12,anio:2025});
 });
 it('crea factura con ítems sin perderlos, resume correctamente',async()=>{const r=await request('/receipts','POST',{numeroRecibo:'F-1',periodo:{mes:1,anio:2026},categoria:'factura',tipoMovimiento:'GASTO',montoNeto:100,subtotal:90,iva:10,items:[{descripcion:'Servicio',importe:100}]});expect(r.status).toBe(201);expect(r.data.items[0].descripcion).toBe('Servicio');const s=await request('/dashboard/summary?year=2026');expect(s.data.totalNeto).toBe(0);expect(s.data.balance).toBe(-100);});
 it('rechaza datos financieros, fechas e identificadores inválidos',async()=>{expect((await request('/expenses','POST',{monto:-1,categoria:'comida',periodo:{mes:1,anio:2026}})).status).toBe(400);expect((await request('/expenses','POST',{monto:1,categoria:'comida',periodo:{mes:13,anio:2026}})).status).toBe(400);expect((await request('/expenses','POST',{monto:1,categoria:'comida',periodo:{mes:2,anio:2026},fecha:'2026-02-31'})).status).toBe(400);expect((await request('/receipts/bad-id')).status).toBe(400);expect((await request('/dashboard/summary?year=banana')).status).toBe(400);expect((await request('/receipts','POST',{$set:{montoNeto:99}})).status).toBe(400);});
 it('hace aportes concurrentes sin perder saldo y no completa meta sin objetivo',async()=>{const r=await request('/goals','POST',{nombre:'Reserva',tipo:'ahorro',montoActual:10,montoObjetivo:0});const results=await Promise.all(Array.from({length:12},()=>request(`/goals/${r.data._id}/aportes`,'POST',{monto:'10',descripcion:'Test'})));expect(results.every(r=>r.status===200)).toBe(true);const g=await Goal.findById(r.data._id);expect(g.montoActual).toBe(130);expect(g.aportes).toHaveLength(13);expect(g.completada).toBe(false);});
 it('procesa archivo válido y deduplica por hash antes de llamar IA otra vez',async()=>{const b=await bulkService.createBulkImport([file(),file()],['2026/01/recibo.pdf','2026/02/recibo.pdf']);await bulkService.processBulkImport(b._id,[pdf,pdf]);const result=await bulkService.getBulkImportStatus(b._id);expect(result.files.map(f=>f.status)).toEqual(['saved','duplicate']);expect(state.calls).toBe(1);expect(await Receipt.countDocuments()).toBe(1);expect(result.processedFiles).toBe(2);});
 it('mismo número queda duplicate sin renumerar',async()=>{state.mode='sameNumber';const b=await bulkService.createBulkImport([file(),file(Buffer.concat([pdf,Buffer.from('\n')]),'other.pdf')]);await bulkService.processBulkImport(b._id,[pdf,Buffer.concat([pdf,Buffer.from('\n')])]);const r=await bulkService.getBulkImportStatus(b._id);expect(r.duplicateFiles).toBe(1);expect(await Receipt.countDocuments()).toBe(1);expect((await Receipt.findOne()).numeroRecibo).toBe('SAME');});
 it('revisa período y monto faltantes, guarda recibo y rechaza período inválido',async()=>{state.mode='review';const b=await bulkService.createBulkImport([file()],['desconocido.pdf']);await bulkService.processBulkImport(b._id,[pdf]);expect((await bulkService.getBulkImportStatus(b._id)).files[0].status).toBe('needs_review');expect((await request(`/receipts/bulk/${b._id}/files/0/review`,'POST',{year:2026,month:13})).status).toBe(400);const r=await request(`/receipts/bulk/${b._id}/files/0/review`,'POST',{year:2026,month:3,montoNeto:1500000});expect(r.status).toBe(200);expect(r.data.files[0].status).toBe('saved');});
 it('retry de archivo fallido funciona y rechaza archivo diferente',async()=>{state.mode='error';const b=await bulkService.createBulkImport([file()]);await bulkService.processBulkImport(b._id,[pdf]);expect((await bulkService.getBulkImportStatus(b._id)).failedFiles).toBe(1);state.mode='ok';await bulkService.retryFile(b._id,0,Buffer.concat([pdf,Buffer.from('\n')]));expect((await bulkService.getBulkImportStatus(b._id)).files[0].status).toBe('failed');const r=await bulkService.retryFile(b._id,0,pdf);expect(r.files[0].status).toBe('saved');});
 it('respeta concurrencia global entre lotes',async()=>{const buffers=[0,1,2,3].map(i=>Buffer.concat([pdf,Buffer.from('\n'.repeat(i+1))]));const a=await bulkService.createBulkImport(buffers.slice(0,2).map((b,i)=>file(b,`a${i}.pdf`)));const b=await bulkService.createBulkImport(buffers.slice(2).map((b,i)=>file(b,`b${i}.pdf`)));await Promise.all([bulkService.processBulkImport(a._id,buffers.slice(0,2)),bulkService.processBulkImport(b._id,buffers.slice(2))]);expect(state.max).toBeLessThanOrEqual(2);expect(await Receipt.countDocuments()).toBe(4);});
 it('SHA único evita carrera de persistencia',async()=>{const data={numeroRecibo:'a',fileHash:'f'.repeat(64),montoNeto:1};await Receipt.create(data);await expect(Receipt.create({...data,numeroRecibo:'b'})).rejects.toMatchObject({code:11000});});
 it('progreso cuenta solo estados terminales',()=>expect(batchCounts([{status:'pending'},{status:'extracting'},{status:'saved'},{status:'needs_review'}]).processedFiles).toBe(2));
 it('mantiene endpoints de carga masiva y configuración',async()=>{const r=await request('/receipts/bulk/config');expect(r.data.maxBulkFiles).toBe(100);const body=new FormData();body.append('pdfs',new Blob([pdf],{type:'application/pdf'}),'recibo.pdf');const response=await fetch(base+'/receipts/bulk',{method:'POST',body});expect(response.status).toBe(202);const created=(await response.json()).data;let result;for(let i=0;i<50;i++){result=await request('/receipts/bulk/'+created._id);if(!['processing','created'].includes(result.data.status))break;await new Promise(r=>setTimeout(r,30));}expect(result.data.files[0].status).toBe('saved');expect((await request('/receipts/bulk/'+created._id,'DELETE')).status).toBe(200);});
 it('retry HTTP individual y del lote recuperan el PDF persistido',async()=>{state.mode='error';const b=await bulkService.createBulkImport([file()]);await storeBuffers(b._id,[file()]);await bulkService.processBulkImport(b._id,[]);state.mode='ok';const body=new FormData();body.append('pdf',new Blob([pdf],{type:'application/pdf'}),'recibo.pdf');const single=await fetch(base+`/receipts/bulk/${b._id}/files/0/retry`,{method:'POST',body});expect(single.status).toBe(200);expect((await single.json()).data.files[0].status).toBe('saved');await Receipt.deleteMany({});state.mode='error';const next=await bulkService.createBulkImport([file()]);await storeBuffers(next._id,[file()]);await bulkService.processBulkImport(next._id,[]);state.mode='ok';const all=await request(`/receipts/bulk/${next._id}/retry`,'POST',{});expect(all.status).toBe(200);expect(all.data.files[0].status).toBe('saved');await request(`/receipts/bulk/${next._id}`,'DELETE');await expect(readBuffer(next._id,0)).rejects.toThrow();});
 it('respeta límite configurable de cantidad sin crear un lote',async()=>{const previous=process.env.MAX_BULK_FILES;process.env.MAX_BULK_FILES='1';try{const body=new FormData();body.append('pdfs',new Blob([pdf],{type:'application/pdf'}),'a.pdf');body.append('pdfs',new Blob([pdf],{type:'application/pdf'}),'b.pdf');expect((await fetch(base+'/receipts/bulk',{method:'POST',body})).status).toBe(400);expect(await BulkImport.countDocuments()).toBe(0);}finally{if(previous)process.env.MAX_BULK_FILES=previous;else delete process.env.MAX_BULK_FILES;}});
 it('fallo Mongo responde seguro sin exponer datos internos',async()=>{const spy=vi.spyOn(Expense,'find').mockImplementationOnce(()=>{throw new Error('DATABASE_CONNECTION_FAILED: internal connection details');});try{const r=await request('/expenses');expect(r.status).toBe(500);expect(r.error).not.toMatch(/DATABASE_CONNECTION_FAILED|internal connection details/);}finally{spy.mockRestore();}});
 it('meta completa puede volver a activa si aumenta el objetivo',async()=>{const r=await request('/goals','POST',{nombre:'Meta',tipo:'ahorro',montoActual:100,montoObjetivo:100});expect(r.data.completada).toBe(true);const updated=await request(`/goals/${r.data._id}`,'PUT',{montoObjetivo:200});expect(updated.data.completada).toBe(false);});

 it('asistente prepara sin escribir y confirma resumen sin duplicar ni incluir cuentas propias',async()=>{const text='Pendiente de categoría\n$ 3.233.186\nTransferencias a cuentas propias\n$ 702.001\nSupermercado\n$ 304.556,14';const r=await request('/expenses/assistant/analyze','POST',{text,instructions:'2m del iPhone y 1.2 de vacaciones',periodo:{mes:9,anio:2026}});expect(r.status).toBe(200);expect(await Expense.countDocuments()).toBe(0);expect(r.data.rows.find(row=>row.descripcion.includes('remanente')).monto).toBe(33186);const rows=r.data.rows.map(row=>({...row,include:row.locked?true:row.include}));const saved=await request(`/expenses/assistant/${r.data.id}/commit`,'POST',{rows,periodo:r.data.periodo});expect(saved.status).toBe(200);expect(saved.data.count).toBe(4);expect(await Expense.countDocuments()).toBe(4);const repeat=await request(`/expenses/assistant/${r.data.id}/commit`,'POST',{rows,periodo:r.data.periodo});expect(repeat.data.alreadySaved).toBe(true);expect(await Expense.countDocuments()).toBe(4);const pastedAgain=await request('/expenses/assistant/analyze','POST',{text,periodo:{mes:9,anio:2026}});expect(pastedAgain.data.status).toBe('committed');expect(pastedAgain.data.id).toBe(r.data.id);});
 it('asistente rechaza modificar total y moneda, sin guardar filas',async()=>{expect((await request('/expenses/assistant/analyze','POST',{text:'Gasté US$ 20 en comida',periodo:{mes:9,anio:2026}})).status).toBe(400);const draft=await request('/expenses/assistant/analyze','POST',{text:'Supermercado\n$ 100',periodo:{mes:9,anio:2026}});const rows=draft.data.rows.map(row=>({...row,monto:200}));expect((await request(`/expenses/assistant/${draft.data.id}/commit`,'POST',{rows,periodo:draft.data.periodo})).status).toBe(400);expect(await Expense.countDocuments()).toBe(0);});
 it('guardado parcial recupera borrador congelado y retry completa sin duplicados',async()=>{const draft=await request('/expenses/assistant/analyze','POST',{text:'Supermercado\n$ 100\nTransporte\n$ 50',periodo:{mes:9,anio:2026}});const body={rows:draft.data.rows,periodo:draft.data.periodo};const real=Expense.bulkWrite.bind(Expense);const spy=vi.spyOn(Expense,'bulkWrite').mockImplementationOnce(async operations=>{await real(operations.slice(0,1));throw new Error('Mongo interruption');});const failed=await request(`/expenses/assistant/${draft.data.id}/commit`,'POST',body);spy.mockRestore();expect(failed.status).toBe(500);expect(await Expense.countDocuments()).toBe(1);const recovered=await request('/expenses/assistant/analyze','POST',{importId:draft.data.id,instructions:'',periodo:body.periodo});expect(recovered.data.frozen).toBe(true);expect(recovered.data.rows).toHaveLength(2);const retry=await request(`/expenses/assistant/${draft.data.id}/commit`,'POST',body);expect(retry.status).toBe(200);expect(await Expense.countDocuments()).toBe(2);});
 it('dos confirmaciones concurrentes no duplican gastos',async()=>{const draft=await request('/expenses/assistant/analyze','POST',{text:'Supermercado\n$ 100\nTransporte\n$ 50',periodo:{mes:9,anio:2026}});const body={rows:draft.data.rows,periodo:draft.data.periodo};const r=await Promise.all([request(`/expenses/assistant/${draft.data.id}/commit`,'POST',body),request(`/expenses/assistant/${draft.data.id}/commit`,'POST',body)]);expect(r.some(v=>v.status===200)).toBe(true);expect(r.every(v=>[200,409].includes(v.status))).toBe(true);expect(await Expense.countDocuments()).toBe(2);});
 it('gastos individuales iguales pueden ocurrir dos veces sin perder el segundo',async()=>{const payload={text:'Gasté 15 mil en supermercado',periodo:{mes:9,anio:2026}};const a=await request('/expenses/assistant/analyze','POST',payload);const b=await request('/expenses/assistant/analyze','POST',payload);expect(a.data.id).not.toBe(b.data.id);});

});

describe('Categorías y medios de pago: persistencia real',()=>{
 it('analiza y guarda una compra con tarjeta, con categoría y fecha independientes',async()=>{
  const draft=await request('/expenses/assistant/analyze','POST',{text:'Gasté 500k en supermercado con tarjeta de crédito el 03/09/2026',periodo:{mes:9,anio:2026}});
  expect(draft.status).toBe(200);expect(draft.data.rows[0]).toMatchObject({categoria:'supermercado',medioPago:'Tarjeta de crédito',fecha:'2026-09-03',include:true});
  expect((await request(`/expenses/assistant/${draft.data.id}/commit`,'POST',{rows:draft.data.rows,periodo:draft.data.periodo})).status).toBe(200);
  const saved=await Expense.findOne().lean();expect(saved).toMatchObject({monto:500000,categoria:'supermercado',medioPago:'Tarjeta de crédito'});expect(saved.fecha.toISOString()).toBe('2026-09-03T00:00:00.000Z');
  const summary=await request('/expenses/summary?mes=9&anio=2026');expect(summary.data.porCategoria[0]).toMatchObject({categoria:'supermercado',total:500000});
 });
 it('permite editar, borrar datos opcionales y rechaza categorías ajenas',async()=>{
  const created=await request('/expenses','POST',{monto:50,categoria:'tecnologia',descripcion:'Celular',medioPago:'Débito',fecha:'2026-09-03',periodo:{mes:9,anio:2026}});expect(created.status).toBe(201);
  const updated=await request(`/expenses/${created.data._id}`,'PUT',{categoria:'regalos',medioPago:null,fecha:null});expect(updated.data).toMatchObject({categoria:'regalos',medioPago:null,fecha:null});
  for(const categoria of ['Ocio','ocio','Tarjeta de crédito','Alimentación','super','impuestos y tasas'])expect((await request('/expenses','POST',{monto:1,categoria,periodo:{mes:9,anio:2026}})).status).toBe(400);
  expect((await request('/expenses/categorias')).data).toHaveLength(22);
 });
 it('renombra Ocio sin perder gastos históricos, importes ni claves de deduplicación',async()=>{
  const id=new mongoose.Types.ObjectId();await Expense.collection.insertOne({_id:id,monto:200,categoria:'ocio',descripcion:'Cine',importKey:'legacy-1',periodo:{mes:9,anio:2026}});
  await migrateLegacyExpenseCategories();await migrateLegacyExpenseCategories();expect(await Expense.countDocuments()).toBe(1);expect(await Expense.findById(id).lean()).toMatchObject({monto:200,categoria:'entretenimiento',importKey:'legacy-1'});
 });
});

describe('Compatibilidad de resúmenes al actualizar',()=>{
 it('los metadatos explícitos distinguen resúmenes iguales de fechas diferentes',async()=>{
  const one=await request('/expenses/assistant/analyze','POST',{text:'Supermercado el 03/09/2026\n$ 100\nTransporte\n$ 50',periodo:{mes:9,anio:2026}});
  const two=await request('/expenses/assistant/analyze','POST',{text:'Supermercado el 04/09/2026\n$ 100\nTransporte\n$ 50',periodo:{mes:9,anio:2026}});
  expect(one.status).toBe(200);expect(two.status).toBe(200);expect(two.data.id).not.toBe(one.data.id);
 });
 it('reintenta un borrador antiguo congelado sin permitir cambiar período ni duplicar gastos',async()=>{
  const source={id:'s0',label:'Cine',monto:100,kind:'expense',pending:false};
  const row={id:'s0-base',sourceId:'s0',monto:100,descripcion:'Cine',categoria:'ocio',include:true};
  const selected={id:row.id,sourceId:row.sourceId,monto:100,categoria:'ocio',descripcion:'Cine'};
  const draft=await ExpenseImport.create({text:'Cine\n$ 100',sources:[source],rows:[row],periodo:{mes:9,anio:2026},fingerprint:'legacy-test',commitHash:'legacy-hash',commitRows:[selected]});
  const recovered=await request('/expenses/assistant/analyze','POST',{importId:String(draft._id),periodo:{mes:9,anio:2026}});expect(recovered.data.rows[0].categoria).toBe('entretenimiento');
  const body={rows:recovered.data.rows,periodo:recovered.data.periodo};expect((await request(`/expenses/assistant/${draft._id}/commit`,'POST',{...body,periodo:{mes:10,anio:2026}})).status).toBe(409);
  expect((await request(`/expenses/assistant/${draft._id}/commit`,'POST',body)).status).toBe(200);expect((await Expense.findOne()).categoria).toBe('entretenimiento');
  expect((await request(`/expenses/assistant/${draft._id}/commit`,'POST',body)).data.alreadySaved).toBe(true);expect(await Expense.countDocuments()).toBe(1);
 });
});
