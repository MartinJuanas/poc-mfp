import { useState } from 'react';
import api from '../services/api';
import useResource from '../hooks/useResource';
import { money, months } from '../utils/finance';
import { categories } from '../utils/categories';
import CategoryBadge from './CategoryBadge';
import { Empty, Icon, Modal, Notice, Skeleton } from './UI';

export default function ExpenseBudgets({ month, year, revision }) {
  const result=useResource(`/expenses/budgets?mes=${month}&anio=${year}`,revision);
  const [editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const open=budget=>{setError('');setEditing(budget||{categoria:'comida',limite:''});};
  async function save(event) {
    event.preventDefault();setBusy(true);setError('');
    try {await api.request(`/expenses/budgets/${editing.categoria}`,{method:'PUT',body:JSON.stringify({limite:Number(editing.limite),periodo:{mes:month,anio:year}})});setEditing(null);result.reload();}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  async function remove() {
    setBusy(true);setError('');
    try{await api.request(`/expenses/budgets/${editing.categoria}?mes=${month}&anio=${year}`,{method:'DELETE'});setEditing(null);result.reload();}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  const exceeded=(result.data||[]).filter(b=>b.excedido);
  return <section className="panel expense-budgets" aria-label="Presupuestos por categoría">
    <div className="panel-heading"><div><span className="eyebrow">PONÉ UN LÍMITE, GANÁ TRANQUILIDAD</span><h2>Presupuestos del mes</h2></div><button onClick={()=>open()}><Icon name="plus" size={18}/>Definir presupuesto</button></div>
    {result.loading?<Skeleton rows={1}/>:result.error?<Notice error>{result.error}<button onClick={result.reload}>Reintentar presupuestos</button></Notice>:!result.data?.length?<Empty title="Cada categoría puede tener un plan" action={<button onClick={()=>open()}>Crear mi primer presupuesto</button>}>Elegí cuánto querés gastar. Te avisaremos al llegar al 80% y al superar tu límite.</Empty>:<>
      {exceeded.length>0&&<div className="budget-alert" role="alert"><Icon name="expenses"/><span>{exceeded.length} {exceeded.length===1?'presupuesto superado':'presupuestos superados'}. Revisá los límites o ajustá los próximos gastos.</span></div>}
      <div className="budget-grid">{result.data.map(b=>{
        const status=b.excedido?'exceeded':b.porcentaje>=80?'near':'within';
        return <article className={`budget-item ${status}`} key={b.categoria}>
          <div className="budget-heading"><CategoryBadge category={b.categoria}/><button className="icon-button" aria-label={`Editar presupuesto ${categories[b.categoria]}`} onClick={()=>open({...b,saved:true})}><Icon name="edit" size={18}/></button></div>
          <div className="budget-amounts"><strong>{money(b.gastado)}</strong><span>de {money(b.limite)}</span></div>
          <progress value={Math.min(100,b.porcentaje)} max={100} aria-label={`Presupuesto ${categories[b.categoria]}: ${b.porcentaje}% utilizado`}/>
          <p className="budget-state"><Icon name={b.excedido?'up':b.porcentaje>=80?'expenses':'check'} size={16}/>{b.porcentaje}% · {b.excedido?`${money(-b.disponible)} por encima`:b.porcentaje>=80?`Cerca del límite · quedan ${money(b.disponible)}`:`Disponibles ${money(b.disponible)}`}</p>
        </article>;
      })}</div>
    </>}
    <p className="data-footnote">Límites para {months[month-1].toLowerCase()} {year}. Se comparan con gastos manuales y del asistente; las facturas conservan su grupo propio y no se asignan a un presupuesto automáticamente.</p>
    {editing&&<Modal title="Presupuesto por categoría" onClose={()=>!busy&&setEditing(null)}><form className="budget-form" onSubmit={save}><p>{months[month-1]} {year} · ARS</p><label>Categoría del presupuesto<select disabled={busy||editing.saved} value={editing.categoria} onChange={e=>setEditing({...editing,categoria:e.target.value})}>{Object.entries(categories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Límite mensual en ARS<input type="number" min="0.01" max="999999999999" step="0.01" required value={editing.limite} onChange={e=>setEditing({...editing,limite:e.target.value})}/></label>{error&&<Notice error>{error}</Notice>}<div className="form-actions">{editing.saved&&<button className="danger" type="button" disabled={busy} onClick={remove}>Eliminar límite</button>}<button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar presupuesto'}</button></div></form></Modal>}
  </section>;
}
