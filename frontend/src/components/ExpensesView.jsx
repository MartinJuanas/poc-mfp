import { useState } from 'react';
import useResource from '../hooks/useResource';
import { money, months } from '../utils/finance';
import { variation } from '../utils/expensePresentation';
import { Icon, Modal, Notice, Skeleton } from './UI';
import ExpenseForm from './ExpenseForm';
import Movements from './Movements';
import ExpenseRanking from './ExpenseRanking';
import WeeklyExpenses from './WeeklyExpenses';
import CategoryChart from './CategoryChart';
import ExpenseBudgets from './ExpenseBudgets';
import './ExpensesDashboard.css';

function Metric({ label, value, previous, loading, expense=false, icon }) {
  const change=variation(value,previous);
  const good=change.percent!=null&&change.percent!==0&&(expense?change.percent<0:change.percent>0);
  const tone=change.percent===0||change.percent==null?'muted':good?'positive':'negative';
  return <article className={`expense-metric ${expense?'spending':''}`}><div className="expense-metric-label"><span>{label}</span><Icon name={icon}/></div><strong className="expense-metric-value">{loading?'…':money(value)}</strong><div className={`metric-variation ${tone}`}><Icon name={change.direction==='up'?'up':change.direction==='down'?'down':'arrow'} size={18}/><span>{loading?'Calculando comparación…':change.label}</span></div><span className="metric-baseline">vs. mes anterior{previous!=null&&!loading?` · ${money(previous)}`:''}</span></article>;
}
export default function ExpensesView({ onChange }) {
  const now=new Date();
  const [month,setMonth]=useState(now.getMonth()+1),[year,setYear]=useState(now.getFullYear());
  const [revision,setRevision]=useState(0),[notice,setNotice]=useState(''),[register,setRegister]=useState(false);
  const years=useResource('/dashboard/years',revision);
  const summary=useResource(`/expenses/summary?mes=${month}&anio=${year}`,revision);
  const monthly=useResource('/dashboard/monthly?year=historical',revision);
  const yearOptions=[...new Set([now.getFullYear(),year,...(years.data||[])])].sort((a,b)=>b-a);
  const current=monthly.data?.find(r=>r.mes===month&&r.anio===year);
  const previous=monthly.data?.find(r=>r.mes===(month===1?12:month-1)&&r.anio===(month===1?year-1:year));
  const refresh=()=>{setRevision(v=>v+1);onChange?.();};
  const saved=()=>{setRegister(false);refresh();setNotice('Gasto registrado. Tus gráficos y presupuestos están actualizados.');};
  return <div className="expense-workspace">
    <div className="expenses-period"><div><span className="eyebrow">TU MES EN PERSPECTIVA</span><h2>{months[month-1]} {year}</h2></div><div className="expense-period-fields"><label>Mes<select aria-label="Mes de gastos" value={month} onChange={e=>setMonth(Number(e.target.value))}>{months.map((label,i)=><option key={label} value={i+1}>{label}</option>)}</select></label><label>Año<select aria-label="Año de gastos" value={year} onChange={e=>setYear(Number(e.target.value))}>{yearOptions.map(y=><option key={y}>{y}</option>)}</select></label></div></div>
    {notice&&<Notice>{notice}</Notice>}
    {monthly.error?<Notice error>{monthly.error}<button onClick={monthly.reload}>Reintentar resumen</button></Notice>:<div className="expense-kpis"><Metric label="Ingresos" icon="down" value={current?.neto||0} previous={previous?.neto} loading={monthly.loading}/><Metric label="Total gastado" icon="up" value={current?.gastos||0} previous={previous?.gastos} loading={monthly.loading} expense/><Metric label="Saldo del mes" icon="goals" value={current?.balance||0} previous={previous?.balance} loading={monthly.loading}/></div>}
    <div className="expenses-analytics-grid">{summary.loading?<Skeleton/>:summary.error?<Notice error>{summary.error}<button onClick={summary.reload}>Reintentar categorías</button></Notice>:<CategoryChart key={`${month}-${year}`} rows={summary.data?.porCategoria||[]} onAdd={()=>setRegister(true)}/>}<WeeklyExpenses month={month} year={year} revision={revision}/></div>
    <ExpenseBudgets key={`${month}-${year}`} month={month} year={year} revision={revision}/>
    <section className="expenses-ledger-section"><div className="section-intro"><div><span className="eyebrow">EL DETALLE, SIN VUELTAS</span><h2>Tus gastos</h2></div><span className="muted">{months[month-1]} {year}</span></div><Movements key={`${month}-${year}`} revision={revision} onChange={refresh} onlyExpenses selectedPeriod={{mes:month,anio:year}} onAdd={()=>setRegister(true)}/></section>
    <details className="expense-insights"><summary><Icon name="chat"/>Explorar mis gastos con IA</summary><ExpenseRanking key={`${month}-${year}`} month={month} year={year} revision={revision}/></details>
    <button className="expense-fab" aria-label="Registrar gasto" title="Registrar gasto" onClick={()=>setRegister(true)}><Icon name="plus" size={26}/><span>Registrar gasto</span></button>
    {register&&<Modal title="Registrar gasto" onClose={()=>setRegister(false)}><p className="data-footnote">Se registra en {months[month-1]} {year}.</p><ExpenseForm period={{mes:month,anio:year}} onSaved={saved} onCancel={()=>setRegister(false)}/></Modal>}
  </div>;
}
