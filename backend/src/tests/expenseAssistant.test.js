import { describe,it,expect,vi } from 'vitest';
const model=vi.hoisted(()=>({content:null,fail:true}));
vi.mock('../services/llmFactory.js',()=>({getLLM:()=>({invoke:async()=>{if(model.fail)throw new Error('Provider unavailable');return {content:model.content};}})}));
import { parseSources,basicDraft,validateRows,draftTotals,analyzeExpenses,summaryNotes,categoryFor } from '../services/expenseAssistant.js';
export const summary=`Pendiente de categoría\n$ 3.233.186\nTransferencias a cuentas propias\n$ 702.001\nSupermercado\n$ 304.556,14\nHogar\n$ 244.000\nEducación\n$ 215.000\nTarjeta de crédito\n$ 120.132,86\nShopping\n$ 78.220\nServicios profesionales\n$ 70.000\nComidas y bebidas\n$ 29.600\nTransporte\n$ 23.835,12\nSalud y cuidado personal\n$ 18.021,51\nIndumentaria\n$ 6.300\nElectrónica\n$ 5.100\nSuscripciones\n$ 3.490`;
describe('Asistente: resumen de Mercado Pago y conservación del dinero',()=>{
 it('parsea todos los importes argentinos y agrupa en categorías disponibles',()=>{const sources=parseSources(summary);expect(sources).toHaveLength(14);const {rows}=basicDraft(sources);expect(rows.find(r=>r.descripcion==='Supermercado').monto).toBe(304556.14);expect(rows.find(r=>r.descripcion==='Supermercado').categoria).toBe('supermercado');expect(rows.find(r=>r.descripcion==='Hogar').categoria).toBe('hogar');});
 it('reemplaza pendiente por iPhone, vacaciones y remanente sin duplicarlo',()=>{const sources=parseSources(summary);const {rows,warnings}=basicDraft(sources,'2m son de la compra de un teléfono iPhone. 1.2 de vacaciones.');expect(rows.find(r=>r.descripcion.includes('iPhone'))).toMatchObject({monto:2000000,categoria:'tecnologia'});expect(rows.find(r=>r.descripcion==='Vacaciones')).toMatchObject({monto:1200000,categoria:'viajes'});expect(rows.find(r=>r.descripcion.includes('remanente')).monto).toBe(33186);expect(warnings[0]).toContain('1.2');expect(validateRows(rows,sources)).toHaveLength(16);const totals=draftTotals(rows);expect(totals.total).toBe(5053442.63);expect(totals.excluded).toBe(822133.86);expect(totals.toSave).toBe(4231308.77);});
 it('separa transferencias propias y pago de tarjeta',()=>{const sources=parseSources(summary);const rows=basicDraft(sources).rows;expect(rows.find(r=>r.locked)).toMatchObject({monto:702001,include:false});const transfer=rows.find(r=>r.locked);transfer.include=true;expect(validateRows(rows,sources).find(r=>r.locked).include).toBe(false);expect(rows.find(r=>r.descripcion==='Tarjeta de crédito').include).toBe(false);});
 it('no aplica aclaraciones que exceden el bloque ni pierde el remanente',()=>{const sources=parseSources(summary);const draft=basicDraft(sources,'4m son del iPhone');expect(draft.warnings[0]).toContain('superan');expect(draft.rows.find(r=>r.descripcion==='Pendiente de categoría').monto).toBe(3233186);});
 it('reconoce un gasto natural, millones y dinero con miles',()=>{expect(parseSources('Gasté 15 mil en supermercado')[0]).toMatchObject({monto:15000,label:'supermercado'});expect(parseSources('Gasté $ 15.000 en supermercado')[0].monto).toBe(15000);expect(parseSources('Gasté 2 millones en vacaciones')[0].monto).toBe(2000000);expect(parseSources('Gasté 1 millón en vacaciones')[0].monto).toBe(1000000);});
 it('detecta aclaraciones pegadas debajo del resumen',()=>expect(summaryNotes(summary+'\n2m del iPhone\n1.2 de vacaciones')).toContain('2m del iPhone'));
 it('rechaza USD, texto sin importes, centavos inválidos y categorías inventadas',()=>{expect(()=>parseSources('Gasté US$ 20 en comida')).toThrow();expect(()=>parseSources('Hola')).toThrow();expect(()=>parseSources('Gasté -1500 en comida')).toThrow();expect(()=>parseSources('Supermercado\n$ 0')).toThrow();const sources=parseSources(summary);const rows=basicDraft(sources).rows;expect(()=>validateRows([{...rows[0],monto:.001},...rows.slice(1)],sources)).toThrow();expect(()=>validateRows([{...rows[0],categoria:'inventada'},...rows.slice(1)],sources)).toThrow();});
 it('rechaza doble contabilización y fuentes inexistentes',()=>{const sources=parseSources(summary);const rows=basicDraft(sources).rows;expect(()=>validateRows([...rows,{...rows[0],id:'duplicate'}],sources)).toThrow();expect(()=>validateRows([{...rows[0],sourceId:'inventada'},...rows.slice(1)],sources)).toThrow();});
 it('proveedor caído mantiene un borrador usable y nunca guarda gastos',async()=>{model.fail=true;const draft=await analyzeExpenses(parseSources(summary),'2m del iPhone y 1.2 de vacaciones');expect(draft.method).toBe('basic');expect(draft.totals.toSave).toBe(4231308.77);});
 it('valida respuesta IA por bloques y rechaza sus totales inventados',async()=>{const sources=parseSources(summary);const rows=basicDraft(sources).rows;model.fail=false;model.content=[{text:'```json\n'+JSON.stringify({rows})+'\n```'}];expect((await analyzeExpenses(sources)).method).toBe('ai');model.content=JSON.stringify({rows:[...rows,{...rows[0],id:'inflated'}]});expect((await analyzeExpenses(sources)).method).toBe('basic');model.fail=true;});
});

describe('Categorías principales y datos explícitos',()=>{
 it.each([
  ['30k salida al cine','salida',30000],['50k salida a cenar','salida',50000],
  ['500k mercado','supermercado',500000],['400k supermercado','supermercado',400000],
  ['100k comida','comida',100000],['80k restaurante','comida',80000],
  ['100k impuestos','impuestos',100000],['50k ARCA','impuestos',50000],['30k patente','impuestos',30000],
  ['100k de luz','servicios',100000],['50k internet','servicios',50000],['200k facultad','educacion',200000],
  ['100k farmacia','salud',100000],['80k nafta','transporte',80000],['50k ropa','ropa',50000],
  ['30k Netflix','entretenimiento',30000],['20k gimnasio','deporte',20000],['500k alquiler','alquiler',500000],
  ['50k celular','tecnologia',50000],['100k regalo de cumpleaños','regalos',100000],
  ['10k concepto desconocido','otros',10000]
 ])('%s → %s', (text,categoria,monto)=>{
  const row=basicDraft(parseSources(text)).rows[0];expect(row).toMatchObject({categoria,monto,include:true,medioPago:null,fecha:null});
 });
 it.each([
  ['Gasté 500k en supermercado con tarjeta de crédito','supermercado',500000,'Tarjeta de crédito','supermercado'],
  ['Gasté 200k en facultad con débito','educacion',200000,'Débito','facultad'],
  ['Gasté 80k en nafta con efectivo','transporte',80000,'Efectivo','nafta'],
  ['Gasté 100k en farmacia por transferencia','salud',100000,'Transferencia','farmacia']
 ])('separa el medio de pago en %s',(text,categoria,monto,medioPago,descripcion)=>{
  const sources=parseSources(text);const row=validateRows(basicDraft(sources).rows,sources)[0];expect(row).toMatchObject({categoria,monto,medioPago,descripcion:descripcion.charAt(0).toUpperCase()+descripcion.slice(1),include:true});
 });
 it('solo hay 22 categorías y ambos catálogos coinciden',async()=>{
  const {categories,CATEGORIAS}=await import('../services/expenseCategories.js');
  const frontend=await import('../../../frontend/src/utils/categories.js');expect(frontend.categories).toEqual(categories);
  expect(CATEGORIAS).toHaveLength(22);expect(Object.values(categories)).toEqual(['Comida','Supermercado','Servicios','Alquiler','Transporte','Salud','Educación','Impuestos','Compras','Entretenimiento','Salida','Ropa','Deporte','Viajes','Mascotas','Familia','Hogar','Tecnología','Finanzas','Regalos','Trabajo','Otros']);
  for(const [key,label] of Object.entries(categories))expect(categoryFor(label)).toBe(key);
 });
 it('mantiene fechas explícitas sin confundirlas con importes',()=>{
  for(const text of ['El 2026-09-03 gasté 200k en facultad con débito','Gasté 200k en facultad con débito el 03/09/2026']){
   const row=basicDraft(parseSources(text)).rows[0];expect(row).toMatchObject({monto:200000,fecha:'2026-09-03',medioPago:'Débito',categoria:'educacion'});
  }
  expect(()=>parseSources('Gasté 200k en facultad el 31/02/2026')).toThrow();
 });
 it('rechaza fechas imposibles y métodos inválidos al confirmar',()=>{
  const sources=parseSources('200k facultad');const rows=basicDraft(sources).rows;
  expect(()=>validateRows([{...rows[0],fecha:'2026-02-31'}],sources)).toThrow();
  expect(()=>validateRows([{...rows[0],medioPago:'inventado'}],sources)).toThrow();
 });
 it('IA usa nombres exactos y jamás inventa fecha o medio de pago',async()=>{
  const sources=parseSources('500k mercado');const rows=basicDraft(sources).rows;model.fail=false;
  model.content=JSON.stringify({rows:[{...rows[0],categoria:'Supermercado',medioPago:'Débito',fecha:'2026-01-01'}]});
  expect((await analyzeExpenses(sources)).rows[0]).toMatchObject({categoria:'supermercado',medioPago:null,fecha:null});
  model.content=JSON.stringify({rows:[{...rows[0],categoria:'Comestibles'}]});expect((await analyzeExpenses(sources)).rows[0].categoria).toBe('otros');model.fail=true;
 });
});

it('una aclaración explícita incorpora medio y fecha sin fabricar datos',async()=>{
 model.fail=true;const draft=await analyzeExpenses(parseSources('200k facultad'),'Lo pagué con débito el 03/09/2026');expect(draft.rows[0]).toMatchObject({descripcion:'Facultad',medioPago:'Débito',fecha:'2026-09-03'});expect(draft.warnings).toEqual([]);
});

it('no inventa una marca cuando la aclaración solo dice celular',()=>{
 const draft=basicDraft(parseSources('Pendiente de categoría\n$ 100.000'),'50k de un celular');expect(draft.rows.find(row=>row.categoria==='tecnologia').descripcion).toBe('Compra de celular');expect(JSON.stringify(draft.rows)).not.toContain('iPhone');
});
