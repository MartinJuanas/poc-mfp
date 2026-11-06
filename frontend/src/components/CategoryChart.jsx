import { useState } from 'react';
import { money } from '../utils/finance';
import { topCategories } from '../utils/expensePresentation';
import CategoryBadge from './CategoryBadge';
import { categoryStyle } from '../utils/categoryPresentation';
import { Empty, Icon } from './UI';
export default function CategoryChart({ rows, onAdd }) {
  const [expanded,setExpanded]=useState(false);
  const data=expanded?[...rows].sort((a,b)=>b.total-a.total):topCategories(rows);
  const max=Math.max(1,...data.map(r=>r.total));
  return <section className="panel category-chart" aria-label="Gastos por categoría"><div className="panel-heading"><div><span className="eyebrow">DISTRIBUCIÓN DEL MES</span><h2>¿En qué gastaste?</h2></div><Icon name="expenses"/></div>
    {!rows.length?<Empty title="Dale forma a tu mes" action={<button onClick={onAdd}><Icon name="plus"/>Registrar mi primer gasto</button>}>Tu primer gasto va a aparecer acá. Después podrás descubrir qué categorías pesan más.</Empty>:<><ul className="category-bars">{data.map(row=><li key={row.categoria}><div className="category-bar-heading">{row.categoria==='agrupadas'?<span className="category-chip tone-neutral">Otras categorías</span>:<CategoryBadge category={row.categoria}/>}<strong>{money(row.total)}</strong></div><div className="category-bar-track" aria-hidden="true"><span className={`tone-${categoryStyle(row.categoria)[1]}`} style={{width:`${row.total/max*100}%`}}/></div></li>)}</ul>{rows.length>5&&<button className="text-action" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Ver top 5 + otras':`Ver las ${rows.length} categorías`}</button>}<p className="data-footnote">Importes en ARS, de mayor a menor. Incluye facturas de gasto una sola vez.</p></>}
  </section>;
}
