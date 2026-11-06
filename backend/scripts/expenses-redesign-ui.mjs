// All API traffic is simulated. Never writes to real financial data.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const amounts=[['alquiler',420000],['supermercado',230000],['salida',85000],['comida',50000],['transporte',35000],['servicios',27000],['otros',13000]];
const periodo={mes:11,anio:2026};
const expenses=amounts.map(([categoria,monto],i)=>({_id:String(i+1).padStart(24,'0'),categoria,monto,descripcion:`Gasto de ${categoria}`,periodo,fecha:'2026-11-04T00:00:00Z',createdAt:'2026-11-04T00:00:00Z'}));
let budgets=[{categoria:'salida',limite:80000},{categoria:'supermercado',limite:280000},{categoria:'comida',limite:150000}];
const total=()=>expenses.reduce((s,e)=>s+e.monto,0);
const contrast=async page=>page.evaluate(()=>{
  const rgba=v=>(v.match(/[\d.]+/g)||[]).map(Number);
  const lum=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const background=el=>{
    const stack=[];
    for(let n=el;n;n=n.parentElement){const rgb=rgba(getComputedStyle(n).backgroundColor);if(rgb.length>=3)stack.unshift(rgb);}
    return stack.reduce((bg,c)=>{const a=c[3]??1;return c.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));},[255,255,255]);
  };
  const fails=[];
  for(const el of document.querySelectorAll('.expense-workspace *, .product-dialog[open] *, .sidebar nav a, .nav-caption, .workspace-bar *')){
    if(!el.getClientRects().length||el.closest('[hidden]')||el.closest('svg')||el.matches(':disabled'))continue;
    if(![...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()))continue;
    const style=getComputedStyle(el);if(style.visibility==='hidden')continue;
    const fg=rgba(style.color);if(fg.length<3)continue;
    const bg=background(el);const r=ratio(fg,bg);const size=parseFloat(style.fontSize),bold=Number(style.fontWeight)>=700;
    if(r<(size>=24||size>=18.66&&bold?3:4.5))fails.push({text:el.textContent.trim().slice(0,65),ratio:r.toFixed(2),fg:style.color,bg,size});
  }
  for(const el of document.querySelectorAll('.expense-workspace input, .expense-workspace select, .product-dialog[open] input, .product-dialog[open] select')){
    if(!el.getClientRects().length||el.matches(':disabled'))continue;
    const bg=background(el),style=getComputedStyle(el);
    const fg=rgba(style.color);
    if(ratio(fg,bg)<4.5)fails.push({field:el.name||el.id,issue:'field text contrast'});
    if(el.placeholder&&ratio(rgba(getComputedStyle(el,'::placeholder').color),bg)<4.5)fails.push({placeholder:el.placeholder,issue:'placeholder contrast'});
    if(style.borderTopStyle!=='none'&&ratio(rgba(style.borderTopColor),bg)<3)fails.push({field:el.name||el.id,issue:'field boundary contrast'});
  }
  for(const el of document.querySelectorAll('.expense-workspace .search-field')){
    if(el.getClientRects().length&&ratio(rgba(getComputedStyle(el).borderTopColor),background(el))<3)fails.push({issue:'search boundary contrast'});
  }
  return fails;
});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},timezoneId:'America/Argentina/Buenos_Aires',locale:'es-AR'});
 const page=await context.newPage();await page.clock.install({time:new Date('2026-11-05T15:00:00Z')});
 await page.addInitScript(()=>localStorage.setItem('misfinanzas-theme','dark'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());let data=[];
  const selected=url.searchParams.get('mes')||'11';
  if(req.method()!=='GET'){
   if(url.pathname.startsWith('/api/expenses/budgets/')){
    const categoria=url.pathname.split('/').at(-1);
    if(req.method()==='DELETE')budgets=budgets.filter(b=>b.categoria!==categoria);
    else{const body=req.postDataJSON();assert.deepEqual(body.periodo,periodo);budgets=budgets.filter(b=>b.categoria!==categoria);budgets.push({categoria,limite:body.limite});}
   }else if(url.pathname==='/api/expenses'&&req.method()==='POST'){
    const body=req.postDataJSON();assert.equal(body.fecha,'2026-11-05');expenses.push({...body,_id:'999999999999999999999999'});
   }else throw new Error(`Unexpected write: ${req.method()} ${url.pathname}`);
   return route.fulfill({json:{success:true,data:{}}});
  }
  if(url.pathname.endsWith('/years'))data=[2026,2025];
  if(url.pathname==='/api/expenses')data=expenses;
  if(url.pathname==='/api/receipts')data=[{_id:'888888888888888888888888',categoria:'factura',tipoMovimiento:'GASTO',montoNeto:40000,periodo,archivoOriginal:'Factura de internet',items:[{descripcion:'Internet',importe:40000}]}];
  if(url.pathname.endsWith('/monthly'))data=[{mes:10,anio:2026,neto:1200000,gastos:800000,balance:400000},{mes:11,anio:2026,neto:1500000,gastos:total()+40000,balance:1500000-total()-40000},{mes:12,anio:2025,neto:100,gastos:50,balance:50}];
  if(url.pathname.endsWith('/summary'))data={porCategoria:selected==='11'?[...amounts.map(([categoria])=>({categoria,total:expenses.filter(e=>e.categoria===categoria).reduce((s,e)=>s+e.monto,0),count:1})),{categoria:'facturas',total:40000,count:1}]:[]};
  if(url.pathname.endsWith('/weekly'))data={total:selected==='11'?total()+40000:0,cantidad:selected==='11'?8:0,sinFecha:{cantidad:1,total:10000},semanas:[[1,1],[2,8],[9,15],[16,22],[23,29],[30,30]].map(([a,b],i)=>({desde:`2026-11-${String(a).padStart(2,'0')}`,hasta:`2026-11-${String(b).padStart(2,'0')}`,total:selected==='11'?[60000,280000+total()-860000,180000,230000,100000,50000][i]:0,cantidad:1}))};
  if(url.pathname.endsWith('/budgets'))data=selected==='11'?budgets.map(b=>{const gastado=expenses.filter(e=>e.categoria===b.categoria).reduce((s,e)=>s+e.monto,0);return{...b,gastado,porcentaje:Math.round(gastado/b.limite*100),excedido:gastado>b.limite,disponible:b.limite-gastado};}):[];
  if(url.pathname.endsWith('/description-ranking'))data={ranking:[],cantidad:0,total:0,method:'calculated',explanation:'Sin gastos.'};
  await route.fulfill({json:{success:true,data}});
 });
 await page.goto('http://localhost:5173/#expenses');
 await page.getByText('1 presupuesto superado.',{exact:false}).waitFor();
 assert.equal(await page.locator('.expense-kpis article').count(),3);
 assert.ok(await page.locator('.expense-kpis').getByText('+25%',{exact:true}).count());
 assert.equal(await page.locator('.category-bars li').count(),6);
 await page.getByRole('button',{name:'Ver las 8 categorías'}).click();assert.equal(await page.locator('.category-bars li').count(),8);
 await page.getByRole('button',{name:'Ver top 5 + otras'}).click();
 await page.getByRole('region',{name:'Gasto semanal'}).getByText(/Promedio/).first().waitFor();
 assert.ok(await page.locator('.recharts-reference-line').count());
 await page.getByLabel('Buscar movimientos').fill('supermercado');await page.getByText('1 movimientos encontrados',{exact:true}).waitFor();
 await page.getByLabel('Buscar movimientos').fill('');
 await page.getByLabel('Filtrar por categoría').selectOption('facturas');await page.getByText('1 movimientos encontrados',{exact:true}).waitFor();
 await page.getByLabel('Filtrar por categoría').selectOption('all');
 await page.getByRole('button',{name:'Registrar gasto',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.equal(await dialog.getByLabel('Fecha del gasto (opcional)').isVisible(),false);
 await dialog.getByLabel('Monto en ARS').fill('5000');
 await dialog.locator('select[name="categoria"]').selectOption('salida');
 await dialog.getByLabel('Descripción',{exact:true}).fill('Café de prueba');
 await dialog.locator('summary').click();await dialog.getByRole('button',{name:'Hoy',exact:true}).click();
 assert.equal(await dialog.getByLabel('Fecha del gasto (opcional)').inputValue(),'2026-11-05');
 assert.deepEqual(await contrast(page),[],'Dark dialog contrast');
 await dialog.getByRole('button',{name:'Registrar gasto',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.getByText('Gasto registrado. Tus gráficos y presupuestos están actualizados.').waitFor();
 await page.getByRole('button',{name:'Definir presupuesto'}).click();
 await page.getByLabel('Categoría del presupuesto').selectOption('transporte');await page.getByLabel('Límite mensual en ARS').fill('30000');
 await page.getByRole('button',{name:'Guardar presupuesto'}).click();await page.getByRole('button',{name:'Editar presupuesto Transporte'}).waitFor();
 await page.getByRole('button',{name:'Editar presupuesto Transporte'}).click();await page.getByLabel('Límite mensual en ARS').fill('40000');await page.getByRole('button',{name:'Guardar presupuesto'}).click();
 await page.getByRole('button',{name:'Editar presupuesto Transporte'}).click();await page.getByRole('button',{name:'Eliminar límite'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.deepEqual(await contrast(page),[],'Dark text contrast');
 await page.locator('.expenses-period h2').click();await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'../docs/screenshots/12-expenses-redesign-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile overflow');
 assert.equal(await page.locator('.expense-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'../docs/screenshots/13-expenses-redesign-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Registrar gasto',exact:true}).click();await page.getByRole('dialog').waitFor();
 await page.getByRole('dialog').screenshot({path:'../docs/screenshots/14-expense-modal-mobile.png'});
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Activar modo claro'}).click();
 assert.deepEqual(await contrast(page),[],'Light text contrast');
 await page.getByLabel('Mes de gastos').selectOption('9');await page.getByText('Dale forma a tu mes').waitFor();await page.getByText('Cada categoría puede tener un plan').waitFor();
 assert.deepEqual(errors,[]);
 console.log('UI OK: layout, comparación mensual, categorías, promedio semanal, filtros, modal/Hoy, presupuestos, alertas, vacío, móvil y contraste AA de textos visibles en ambos temas. API simulada.');
}finally{await browser.close();}
