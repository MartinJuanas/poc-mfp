// Full UI smoke test on disposable MongoDB, with explicitly synthetic data.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
// Deterministic test quotes; no external APIs or API keys are needed.
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>String(url).includes('dolarapi.com') ? Promise.resolve(Response.json([{casa:'oficial',compra:1500,venta:1540},{casa:'blue',compra:1520,venta:1560},{casa:'mayorista',compra:1480,venta:1520}])) : String(url).includes('criptoya.com') ? Promise.resolve(Response.json({binancep2p:{ask:1560,bid:1540}})) : originalFetch(url,options);
process.env.CORS_ORIGINS='http://127.0.0.1:5173';
const storage=await mkdtemp(path.join(os.tmpdir(),'finance-ui-'));
process.env.BULK_STORAGE_DIR=storage;
const root=path.resolve(import.meta.dirname,'../..');
const screenshots=path.join(root,'docs/screenshots');
await mkdir(screenshots,{recursive:true});
let mongo,api,vite,browser;
try {
 mongo=await MongoMemoryServer.create({binary:{version:'7.0.14'},instance:{args:['--nounixsocket']}});
 await mongoose.connect(mongo.getUri());
 const [{app},{default:Receipt},{default:Expense},{default:Goal}]=await Promise.all([import('../src/index.js'),import('../src/models/Receipt.js'),import('../src/models/Expense.js'),import('../src/models/Goal.js')]);
 for(let m=1;m<=9;m++) {
  await Receipt.create({numeroRecibo:`DEMO-${m}`,periodo:{mes:m,anio:2026},montoNeto:1200000+m*35000,totalHaberes:1600000+m*38000,totalRetenciones:400000+m*3000,empleador:{nombre:'Empresa de ejemplo',cuit:'00-00000000-0'},empleado:{nombre:'Persona de ejemplo',legajo:'001'},categoria:'recibo',tipoMovimiento:'INGRESO',haberes:[{codigo:'001',descripcion:'Sueldo básico',haberesConAporte:1600000+m*38000}],retenciones:[{codigo:'101',descripcion:'Aportes',importe:400000+m*3000}]});
  for(const [categoria,monto,descripcion] of [['alquiler',470000,'Alquiler del departamento'],['supermercado',220000+m*4000,'Supermercado'],['transporte',45000,'Transporte'],['servicios',95000,'Servicios del mes']])await Expense.create({categoria,monto,descripcion,periodo:{mes:m,anio:2026},fecha:`2026-${String(m).padStart(2,'0')}-15`});
 }
 await Goal.create({nombre:'Próximo viaje',tipo:'ahorro',moneda:'ARS',montoActual:650000,montoObjetivo:1000000,aportes:[{monto:650000,descripcion:'Saldo inicial'}]});
 await Goal.create({nombre:'Fondo de tranquilidad',tipo:'ahorro',moneda:'USD',montoActual:1200,montoObjetivo:3000,aportes:[{monto:1200,descripcion:'Saldo inicial'}]});
 api=app.listen(3001,'127.0.0.1');await new Promise(r=>api.once('listening',r));
 vite=await createServer({root:path.join(root,'frontend'),server:{host:'127.0.0.1',port:5173,strictPort:true}});await vite.listen();
 const options={headless:true};
 if(process.env.CHROMIUM_EXECUTABLE)options.executablePath=process.env.CHROMIUM_EXECUTABLE;
 if(process.env.CHROMIUM_PACKAGED==='1'){const {default:packaged}=await import('@sparticuz/chromium');options.executablePath=await packaged.executablePath();options.args=packaged.args;}
 browser=await chromium.launch(options);
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'es-AR'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5173');await page.getByText('BALANCE REGISTRADO').waitFor();await page.waitForTimeout(1000);await page.screenshot({path:path.join(screenshots,'01-resumen-desktop.png'),fullPage:true});
 await page.goto('http://127.0.0.1:5173/#movements');await page.getByLabel('Buscar movimientos').waitFor();await page.getByLabel('Buscar movimientos').fill('Supermercado');await page.getByText('9 movimientos encontrados').waitFor();await page.screenshot({path:path.join(screenshots,'02-movimientos-desktop.png'),fullPage:true});
 await page.getByLabel('Editar Supermercado').first().click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByLabel('Monto en ARS').fill('240000');await page.getByRole('dialog').getByRole('button',{name:'Guardar cambios'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await Expense.findOne({descripcion:'Supermercado',periodo:{mes:9,anio:2026}}))?.monto,240000);
 await page.goto('http://127.0.0.1:5173/#savings');await page.getByText('Ver detalle y proyección').first().waitFor();await page.screenshot({path:path.join(screenshots,'03-metas-desktop.png'),fullPage:true});await page.getByTitle('Sumar Dinero').first().click();await page.getByRole('dialog').getByRole('spinbutton').fill('1000');await page.getByRole('button',{name:'Registrar aporte'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.goto('http://127.0.0.1:5173/#list');await page.getByLabel('Seleccionar recibo o factura en PDF').waitFor();await page.locator('.pdf-uploader input[type=file]').setInputFiles(path.join(root,'backend/src/tests/fixtures/salary.pdf'));await page.getByRole('button',{name:'Analizar documento'}).click();await page.getByRole('dialog').waitFor({timeout:30000});await page.screenshot({path:path.join(screenshots,'04-revision-pdf.png'),fullPage:true});await page.getByRole('button',{name:'Confirmar y guardar'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await Receipt.countDocuments(),10);
 await page.goto('http://127.0.0.1:5173/#bulk');await page.getByRole('button',{name:/Seleccionar Archivos/}).waitFor();await page.locator('input[type=file]').first().setInputFiles(path.join(root,'backend/src/tests/fixtures/unknown.pdf'));await page.getByRole('button',{name:/Procesar Lote/}).click();await page.getByText('Asignar Fecha').waitFor({timeout:30000});await page.screenshot({path:path.join(screenshots,'05-carga-masiva.png'),fullPage:true});await page.getByRole('button',{name:/Asignar Fecha/}).click();await page.getByRole('dialog').getByLabel('Año:').fill('2026');await page.getByRole('dialog').getByLabel('Mes:').selectOption('3');await page.getByRole('dialog').getByRole('button',{name:'Guardar y Confirmar'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await Receipt.countDocuments(),11);
 // Theme persists across a full reload; assistant works without any API key.
 await page.goto('http://127.0.0.1:5173/#dashboard');await page.getByRole('button',{name:'Activar modo oscuro'}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');await page.reload();await page.getByRole('button',{name:'Activar modo claro'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('misfinanzas-theme')),'dark');await page.getByText('BALANCE REGISTRADO').waitFor();await page.waitForTimeout(300);await page.screenshot({path:path.join(screenshots,'06-resumen-oscuro.png'),fullPage:true});
 await page.goto('http://127.0.0.1:5173/#assistant');await page.getByRole('button',{name:'Cargar ejemplo'}).click();await page.getByLabel('Mes del resumen de gastos').selectOption('9');await page.getByRole('button',{name:'Preparar borrador'}).click();await page.getByLabel('Importe de Compra de teléfono / iPhone').waitFor();assert.equal(await page.getByLabel('Importe de Compra de teléfono / iPhone').inputValue(),'2000000');assert.equal(await page.getByLabel('Categoría de Vacaciones').inputValue(),'viajes');assert.equal(await page.getByLabel('Incluir Transferencias a cuentas propias').isDisabled(),true);assert.equal(await Expense.countDocuments(),36);await page.screenshot({path:path.join(screenshots,'07-asistente-oscuro.png'),fullPage:true});
 await page.getByLabel('Aclarar o corregir').fill('1.8m del iPhone. 1.4m de vacaciones.');await page.getByRole('button',{name:'Enviar aclaración'}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Importe de Compra de teléfono / iPhone"]')?.value==='1800000');assert.equal(await page.getByLabel('Importe de Vacaciones').inputValue(),'1400000');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:path.join(screenshots,'assistant-dark-mobile.png'),fullPage:true});await page.getByRole('button',{name:'Confirmar y guardar gastos'}).click();await page.getByText('14 gastos guardados.',{exact:false}).waitFor();assert.equal(await Expense.countDocuments({source:'assistant'}),14);assert.equal(await Expense.countDocuments(),50);
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:5173/#assistant');await page.getByRole('button',{name:'Preparar otro resumen'}).click();await page.getByRole('button',{name:'Cargar ejemplo'}).click();await page.getByLabel('Mes del resumen de gastos').selectOption('9');await page.getByRole('button',{name:'Preparar borrador'}).click();await page.getByRole('heading',{name:'Resumen registrado'}).waitFor();assert.equal(await Expense.countDocuments(),50);
 for(const view of ['dashboard','movements','expenses','savings','list','bulk','compare','simulator','assistant']){await page.goto(`http://127.0.0.1:5173/#${view}`);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,`Dark overflow: ${view}`);}
 await page.getByRole('button',{name:'Activar modo claro'}).click();
 for(const view of ['dashboard','movements','expenses','savings','list','bulk','compare','simulator','assistant']){
  await page.setViewportSize({width:390,height:844});await page.goto(`http://127.0.0.1:5173/#${view}`);await page.waitForTimeout(800);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);if(overflow){await page.screenshot({path:path.join(screenshots,`overflow-${view}.png`),fullPage:true});console.log(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,15)));}assert.equal(overflow,false,`Horizontal overflow: ${view}`);if(view==='dashboard'){await page.locator('.product-chart').scrollIntoViewIfNeeded();await page.waitForTimeout(300);assert.ok(await page.locator('.product-chart .recharts-area-curve').count()>=2,'Income/expense chart rendered');await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});}if(['dashboard','movements','savings'].includes(view))await page.screenshot({path:path.join(screenshots,`${view}-mobile.png`),fullPage:true});
 }
 await page.goto('http://127.0.0.1:5173/#assistant');
 await page.getByLabel('Mes del resumen de gastos').selectOption('9');await page.getByLabel('Resumen o gasto',{exact:true}).fill('Gasté 500k en supermercado con tarjeta de crédito el 03/09/2026');await page.getByRole('button',{name:'Preparar borrador'}).click();
 await page.getByLabel('Categoría de Supermercado',{exact:true}).waitFor();assert.equal(await page.getByLabel('Categoría de Supermercado',{exact:true}).inputValue(),'supermercado');assert.equal(await page.getByLabel('Categoría de Supermercado',{exact:true}).locator('option').count(),21);
 assert.equal(await page.getByLabel('Medio de pago de Supermercado',{exact:true}).inputValue(),'Tarjeta de crédito');assert.equal(await page.getByLabel('Fecha de Supermercado',{exact:true}).inputValue(),'2026-09-03');assert.equal(await page.getByLabel('Incluir Supermercado',{exact:true}).isChecked(),true);
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:path.join(screenshots,'08-categoria-medio-pago.png'),fullPage:true});
 await page.getByRole('button',{name:'Confirmar y guardar gastos'}).click();await page.getByText('1 gasto guardado.',{exact:false}).waitFor();const cardExpense=await Expense.findOne({source:'assistant',monto:500000});assert.equal(cardExpense.medioPago,'Tarjeta de crédito');assert.equal(cardExpense.categoria,'supermercado');assert.equal(cardExpense.fecha.toISOString(),'2026-09-03T00:00:00.000Z');
 assert.deepEqual(errors,[]);console.log('UI smoke passed: desktop/mobile, ledger edit, contribution, PDF analyze/save, bulk review, 9 screens, dark/light theme, assistant review/chat/save and duplicate protection.');
} finally {
 await browser?.close();await vite?.close();if(api)await new Promise(r=>api.close(r));await mongoose.disconnect();await mongo?.stop();await rm(storage,{recursive:true,force:true});const {closeCurrencyCache}=await import('../src/services/dolarApi.js');await closeCurrencyCache();
}
