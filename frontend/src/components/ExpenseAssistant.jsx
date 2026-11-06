import { useState } from 'react';
import api from '../services/api';
import { Icon, Notice } from './UI';
import { money, months } from '../utils/finance';
import { categories } from '../utils/categories';
import './ExpenseAssistant.css';
const example=`Pendiente de categoría\n$ 3.233.186\nTransferencias a cuentas propias\n$ 702.001\nSupermercado\n$ 304.556,14\nHogar\n$ 244.000\nEducación\n$ 215.000\nTarjeta de crédito\n$ 120.132,86\nShopping\n$ 78.220\nServicios profesionales\n$ 70.000\nComidas y bebidas\n$ 29.600\nTransporte\n$ 23.835,12\nSalud y cuidado personal\n$ 18.021,51\nIndumentaria\n$ 6.300\nElectrónica\n$ 5.100\nSuscripciones\n$ 3.490`;
const sum=rows=>rows.reduce((total,row)=>total+Math.round(Number(row.monto||0)*100),0)/100;
export default function ExpenseAssistant({onChange}) {
 const now=new Date();
 const [text,setText]=useState('');const [instructions,setInstructions]=useState('');const [message,setMessage]=useState('');
 const [period,setPeriod]=useState({mes:now.getMonth()+1,anio:now.getFullYear()});
 const [draft,setDraft]=useState(null);const [chat,setChat]=useState([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');const [frozen,setFrozen]=useState(false);
 const rows=draft?.rows||[];const total=sum(rows.filter(r=>r.include));const excluded=sum(rows.filter(r=>!r.include));const count=rows.filter(r=>r.include).length;
 const committed=draft?.status==='committed';
 const unbalanced=(draft?.sources||[]).filter(source=>Math.round(sum(rows.filter(row=>row.sourceId===source.id))*100)!==Math.round(source.monto*100));
 async function analyze(e){
  e?.preventDefault();if(busy||frozen)return;
  const correction=draft?message.trim():'';if(draft&&!correction)return;
  const nextInstructions=draft?[instructions,correction].filter(Boolean).join('\n'):instructions;
  setBusy(true);setError('');setSuccess('');
  try {
   const response=await api.request('/expenses/assistant/analyze',{method:'POST',body:JSON.stringify({text,instructions:nextInstructions,periodo:period,importId:draft?.id})});
   setDraft(response.data);setFrozen(Boolean(response.data.frozen));setInstructions(response.data.instructions||nextInstructions);setMessage('');
   setChat(c=>[...c,{role:'user',text:correction||nextInstructions||'Prepará este resumen para revisar.'},{role:'assistant',text:response.data.message}]);
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 function update(id,key,value){setDraft(current=>({...current,rows:current.rows.map(r=>r.id===id?{...r,[key]:value}:r)}));}
 async function commit(){
  setBusy(true);setError('');setFrozen(true);
  try {const result=await api.request(`/expenses/assistant/${draft.id}/commit`,{method:'POST',body:JSON.stringify({rows,periodo:period})});setDraft(current=>({...current,status:'committed'}));setSuccess(result.data.alreadySaved?'Este resumen ya estaba registrado. No se duplicó.':`${result.data.count} ${result.data.count===1?'gasto guardado':'gastos guardados'}. Tu balance y los movimientos ya se actualizaron.`);onChange?.();}
  catch(err){if(err.status===400){setFrozen(false);setError(err.message);}else setError(err.message+' Podés reintentar el guardado sin cambiar las filas.');}finally{setBusy(false);}
 }
 function reset(){setDraft(null);setChat([]);setText('');setInstructions('');setMessage('');setError('');setSuccess('');setFrozen(false);}
 return <div className="expense-assistant">
  <section className="assistant-intro"><span className="assistant-mark"><Icon name="chat" size={26}/></span><div><h2>Contame en qué se fue tu plata.</h2><p>Pegá el resumen de Mercado Pago o escribí un gasto. Lo convertimos en una propuesta que vos confirmás.</p></div><span className="badge">ARS · revisión previa</span></section>
  {error&&<Notice error>{error}</Notice>}{success&&<Notice>{success}</Notice>}
  <div className="assistant-layout">
   <section className="panel assistant-chat"><div className="panel-heading"><h2>{draft?'Tu conversación':'Preparar gastos'}</h2><Icon name="chat"/></div>
    <div className="assistant-period"><label>Mes del resumen<select aria-label="Mes del resumen de gastos" value={period.mes} disabled={busy||committed||frozen} onChange={e=>setPeriod({...period,mes:Number(e.target.value)})}>{months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label><label>Año<input aria-label="Año del resumen de gastos" type="number" min="1900" max="2100" value={period.anio} disabled={busy||committed||frozen} onChange={e=>setPeriod({...period,anio:Number(e.target.value)})}/></label></div>
    {!draft?<form onSubmit={analyze}><label className="assistant-field">Resumen o gasto<textarea required value={text} onChange={e=>setText(e.target.value)} maxLength={16000} rows={10} placeholder={'Supermercado\n$ 304.556,14\n\nTambién: “Gasté 15 mil en supermercado”'}/></label><label className="assistant-field">Aclaraciones (opcional)<textarea value={instructions} onChange={e=>setInstructions(e.target.value)} maxLength={8000} rows={3} placeholder="Del pendiente: 2m son del iPhone y 1.2 millones de vacaciones."/></label><div className="assistant-actions"><button className="primary" disabled={busy||!text.trim()}>{busy?'Preparando…':'Preparar borrador'}<Icon name="arrow" size={16}/></button><button type="button" disabled={busy} onClick={()=>{setText(example);setInstructions('2m son de la compra de un teléfono iPhone. 1.2 de vacaciones.');}}>Cargar ejemplo</button></div><p className="data-footnote">El ejemplo completa el formulario; no guarda datos. Se utiliza tu proveedor de IA configurado. Sin IA, las reglas locales siguen disponibles.</p></form>:<>
     <div className="assistant-conversation" aria-live="polite">{chat.map((item,i)=><div key={i} className={`chat-message ${item.role}`}><span>{item.role==='user'?'Vos':'Asistente'}</span><p>{item.text}</p></div>)}</div>
     {!committed&&!frozen&&<form onSubmit={analyze}><label className="assistant-field">Aclarar o corregir<textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={2000} rows={3} placeholder="Por ejemplo: 2m del pendiente son del iPhone y 1.2 millones de vacaciones."/></label><button className="primary" disabled={busy||!message.trim()}>{busy?'Revisando…':'Enviar aclaración'}<Icon name="arrow" size={16}/></button><p className="data-footnote">Cada aclaración vuelve a preparar las filas. Hacé tus ajustes manuales después de conversar.</p></form>}
     <button className="text-action" disabled={busy} onClick={reset}>Preparar otro resumen</button>
    </>}
   </section>
   <section className="panel assistant-review" aria-busy={busy}>
    <div className="panel-heading"><div><span className="eyebrow">VOS TENÉS LA ÚLTIMA PALABRA</span><h2>{committed?'Resumen registrado':'Revisá la propuesta'}</h2></div>{draft&&<span className="badge">{draft.method==='ai'?'Con IA':'Reglas locales'}</span>}</div>
    {!draft?<div className="assistant-placeholder"><Icon name="document" size={38}/><h3>Primero entendemos, después guardamos.</h3><p>Acá vas a ver los importes y categorías propuestos. Podés editar cada fila y excluir lo que no sea un gasto.</p><ul><li>El iPhone va en Tecnología; vacaciones, en Viajes.</li><li>21 categorías principales, sin subcategorías.</li><li>Medio de pago y fecha quedan sin informar si faltan.</li><li>Dividir un pendiente conserva el total original.</li><li>Las transferencias propias no suman gastos.</li><li>Los pagos de tarjeta empiezan excluidos para evitar duplicar consumos.</li></ul></div>:<>
     <div className="assistant-totals"><div><span>{committed?'Registrado':'A guardar'}</span><strong>{money(total)}</strong><small>{count} {count===1?'registro':'registros'} · {months[period.mes-1]} {period.anio}</small></div><div><span>Excluido</span><strong>{money(excluded)}</strong><small>Sin impacto en el balance</small></div></div>
     {draft.warnings?.map((warning,i)=><div className="assistant-warning" role="status" key={i}>{warning}</div>)}
     <p className="data-footnote">Total del resumen: {money(sum(draft.sources))}. Los importes divididos reemplazan su bloque original. No se suman encima del pendiente.</p>
     <div className="assistant-rows">{rows.map(row=><div className={`assistant-row ${row.include?'included':'excluded'}`} key={row.id}>
      <div className="assistant-row-top"><label className="include-expense"><input type="checkbox" checked={row.include} disabled={row.locked||busy||committed||frozen} aria-label={`Incluir ${row.descripcion}`} onChange={e=>update(row.id,'include',e.target.checked)}/><span>{row.locked?'Transferencia propia':row.include?'Registrar gasto':'Excluido'}</span></label><span className="assistant-source">Origen: {draft.sources.find(s=>s.id===row.sourceId)?.label}</span></div>
      <div className="assistant-row-fields"><label>Descripción<input aria-label={`Descripción de ${row.descripcion}`} value={row.descripcion} maxLength={250} disabled={busy||committed||frozen} onChange={e=>update(row.id,'descripcion',e.target.value)}/></label><label>Categoría<select aria-label={`Categoría de ${row.descripcion}`} value={row.categoria} disabled={row.locked||busy||committed||frozen} onChange={e=>update(row.id,'categoria',e.target.value)}>{Object.entries(categories).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label>Importe ARS<input aria-label={`Importe de ${row.descripcion}`} value={row.monto} type="number" inputMode="decimal" min="0.01" step="0.01" disabled={row.locked||busy||committed||frozen} onChange={e=>update(row.id,'monto',Number(e.target.value))}/></label><label>Medio de pago<select aria-label={`Medio de pago de ${row.descripcion}`} value={row.medioPago || ''} disabled={busy||committed||frozen} onChange={e=>update(row.id,'medioPago',e.target.value||null)}><option value="">Sin informar</option>{['Efectivo','Tarjeta de crédito','Débito','Transferencia','Mercado Pago'].map(value=><option key={value}>{value}</option>)}</select></label><label>Fecha del gasto<input type="date" aria-label={`Fecha de ${row.descripcion}`} value={row.fecha || ''} disabled={busy||committed||frozen} onChange={e=>update(row.id,'fecha',e.target.value||null)}/></label></div>
      {row.reason&&<small className="assistant-row-reason">{row.reason}</small>}
     </div>)}</div>
     <div className="assistant-confirm">{unbalanced.length>0&&<Notice error>Las filas de {unbalanced.map(source=>`«${source.label}»`).join(', ')} deben conservar su total original. Ajustá también el remanente antes de guardar.</Notice>}<p>{committed?'Ya está en tus movimientos. Este borrador no vuelve a guardarse.':`${count===1?'Se registrará 1 gasto':'Se registrarán '+count+' gastos'} por ${money(total)} en ${months[period.mes-1]} ${period.anio}. Revisá que no estén cargados por otra vía.`}</p>{!committed&&<button className="primary" disabled={busy||!count||unbalanced.length>0} onClick={commit}>{busy?'Guardando…':frozen?'Reintentar guardado':'Confirmar y guardar gastos'}<Icon name="check" size={17}/></button>}</div>
    </>}
   </section>
  </div>
 </div>;
}
