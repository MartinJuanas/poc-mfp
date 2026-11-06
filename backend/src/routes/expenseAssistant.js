import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import Expense from '../models/Expense.js';
import ExpenseImport from '../models/ExpenseImport.js';
import { parseSources, summaryNotes, analyzeExpenses, validateRows, draftTotals } from '../services/expenseAssistant.js';
import { validPeriod } from '../services/finance.js';
import { sendError, inputError } from '../middleware/errors.js';
const router=express.Router();
const respondError=(res,error)=>[400,409].includes(error.status) ? res.status(error.status).json({success:false,error:error.message}) : sendError(res,error);
router.param('id',(req,res,next,id)=>/^[a-f\d]{24}$/i.test(id)?next():res.status(400).json({success:false,error:'El borrador seleccionado no es válido.'}));
const currentCategory=row=>({...row,categoria:row.categoria==='ocio'?'entretenimiento':row.categoria});
const selection=row=>({id:row.id,sourceId:row.sourceId,monto:row.monto,categoria:currentCategory(row).categoria,descripcion:row.descripcion,...(row.medioPago?{medioPago:row.medioPago}:{}),...(row.fecha?{fecha:row.fecha}:{})});
function view(draft,message=''){return {id:draft._id,rows:draft.rows.map(currentCategory),sources:draft.sources,periodo:draft.periodo,method:draft.method,instructions:draft.instructions,warnings:draft.warnings,status:draft.status,frozen:Boolean(draft.commitHash),totals:draftTotals(draft.rows),message};}
router.post('/analyze',async(req,res)=>{
 try{
  const {text,instructions='',periodo,importId}=req.body;
  if(typeof instructions!=='string'||instructions.length>8000||!validPeriod(periodo))throw inputError('Elegí el período y revisá el texto del resumen.');
  let original;
  if(importId){if(!/^[a-f\d]{24}$/i.test(importId))throw inputError('Borrador inválido.');original=await ExpenseImport.findById(importId);if(!original)throw Object.assign(new Error('Borrador no encontrado'),{status:404});if(original.commitHash)return res.json({success:true,data:view(original,'Este borrador ya inició el guardado. Conservamos las filas para reintentar sin duplicarlas.')});}
  const input=original?.text??text;
  if(typeof input!=='string'||!input.trim()||input.length>16000)throw inputError('Pegá un resumen de hasta 16.000 caracteres.');
  const sources=original?.sources??parseSources(input);
  const allInstructions=instructions || original?.instructions || summaryNotes(input);
  const singleNonce=sources.length===1&&!sources[0].pending ? original?.singleNonce||randomUUID() : undefined;
  const fingerprint=createHash('sha256').update(JSON.stringify({sources:sources.map(s=>({label:s.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),monto:s.monto,...(s.medioPago?{medioPago:s.medioPago}:{}),...(s.fecha?{fecha:s.fecha}:{})})).sort((a,b)=>a.label.localeCompare(b.label)||a.monto-b.monto||(a.fecha||'').localeCompare(b.fecha||'')||(a.medioPago||'').localeCompare(b.medioPago||'')),nonce:singleNonce,periodo:{mes:Number(periodo.mes),anio:Number(periodo.anio)}})).digest('hex');
  if(!original)original=await ExpenseImport.findOne({fingerprint});
  if(original?.status==='committed')return res.json({success:true,data:view(original,'Este resumen ya fue registrado en este período. No lo volvimos a guardar.')});
  if(original?.commitHash)return res.json({success:true,data:view(original,'Conservamos el borrador confirmado. Reintentá el guardado para completar los registros que falten, sin duplicarlos.')});
  const result=await analyzeExpenses(sources,allInstructions);
  const data={text:input,instructions:allInstructions,singleNonce,fingerprint,sources,rows:result.rows,periodo:{mes:Number(periodo.mes),anio:Number(periodo.anio)},method:result.method,warnings:result.warnings};
  let draft;
  if(original){draft=await ExpenseImport.findOneAndUpdate({_id:original._id,status:'draft',commitHash:{$exists:false}},{$set:data},{new:true});if(!draft)throw Object.assign(new Error('Borrador confirmado durante análisis'),{status:409});}
  else draft=await ExpenseImport.create(data);
  res.json({success:true,data:view(draft,result.message)});
 }catch(error){respondError(res,error);}
});
router.post('/:id/commit',async(req,res)=>{
 let claimed=false;
 try{
  const draft=await ExpenseImport.findById(req.params.id);
  if(!draft)throw Object.assign(new Error('Borrador no encontrado'),{status:404});
  // Replay succeeds without new writes, including after a lost HTTP response.
  if(draft.status==='committed')return res.json({success:true,data:{id:draft._id,count:draft.expenseIds.length,expenseIds:draft.expenseIds,alreadySaved:true}});
  const periodo=req.body.periodo;
  if(!validPeriod(periodo))throw inputError('Elegí el mes y año antes de guardar.');
  const rows=validateRows(req.body.rows,draft.sources);
  if(!rows.some(r=>r.include))throw inputError('Seleccioná al menos un gasto para guardar.');
  const selected=rows.filter(r=>r.include).map(selection);
  const finalPeriod={mes:Number(periodo.mes),anio:Number(periodo.anio)};
  const hash=createHash('sha256').update(JSON.stringify({selected,periodo:finalPeriod})).digest('hex');
  const sameLegacyPlan=JSON.stringify(draft.commitRows.map(selection))===JSON.stringify(selected)&&Number(draft.periodo.mes)===finalPeriod.mes&&Number(draft.periodo.anio)===finalPeriod.anio;
  if(draft.commitHash&&draft.commitHash!==hash&&!sameLegacyPlan)throw Object.assign(new Error('Se inició el guardado con otra selección. Reintentá sin editar las filas.'),{status:409});
  const acquired=await ExpenseImport.findOneAndUpdate({_id:draft._id,status:'draft'},{$set:{status:'saving',rows,commitHash:hash,commitRows:selected,periodo:finalPeriod}},{new:true});
  if(!acquired)throw Object.assign(new Error('El guardado sigue en curso.'),{status:409});
  claimed=true;
  await Expense.init(); // unique idempotency key, also in standalone MongoDB
  await Expense.bulkWrite(selected.map(row=>({updateOne:{filter:{importKey:`${draft._id}:${row.id}`},update:{$setOnInsert:{monto:row.monto,categoria:row.categoria,descripcion:row.descripcion,medioPago:row.medioPago,fecha:row.fecha?new Date(row.fecha):null,periodo:finalPeriod,importKey:`${draft._id}:${row.id}`,source:'assistant',expenseImportId:draft._id}},upsert:true}})),{ordered:true});
  const saved=await Expense.find({expenseImportId:draft._id}).select('_id');
  await ExpenseImport.updateOne({_id:draft._id},{$set:{status:'committed',rows,expenseIds:saved.map(r=>r._id),savedAt:new Date()}});
  res.json({success:true,data:{id:draft._id,count:saved.length,expenseIds:saved.map(r=>r._id),alreadySaved:false}});
 }catch(error){if(claimed)await ExpenseImport.updateOne({_id:req.params.id,status:'saving'},{$set:{status:'draft'}}).catch(()=>{});respondError(res,error);}
});
export async function recoverExpenseImports(){await ExpenseImport.updateMany({status:'saving'},{$set:{status:'draft'}});}
export default router;
