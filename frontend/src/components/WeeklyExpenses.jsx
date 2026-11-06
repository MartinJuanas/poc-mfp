import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import useResource from '../hooks/useResource';
import { money, months, localDateInput } from '../utils/finance';
import { Empty, Icon, Notice, Skeleton } from './UI';
import './WeeklyExpenses.css';
const dayLabel=value=>new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
export default function WeeklyExpenses({ month, year, revision }) {
  const result=useResource(`/expenses/weekly?mes=${month}&anio=${year}`,revision);
  const today=localDateInput();
  const weeks=(result.data?.semanas||[]).map((w,i)=>({...w,name:`S${i+1}`,range:`${dayLabel(w.desde)} – ${dayLabel(w.hasta)}`}));
  const average=weeks.length?Math.round((result.data?.total||0)*100/weeks.length)/100:0;
  return <section className="panel weekly-expenses" aria-label="Gasto semanal"><div className="panel-heading"><div><span className="eyebrow">TU RITMO DE CONSUMO</span><h2>Gasto semanal</h2></div><Icon name="dashboard"/></div>
    {result.loading?<Skeleton rows={2}/>:result.error?<Notice error>{result.error}<button onClick={result.reload}>Reintentar</button></Notice>:result.data&&<>
      <div className="weekly-chart-summary"><strong>{money(result.data.total)}</strong><span>con fecha en {months[month-1].toLowerCase()}</span></div>
      {!result.data.cantidad?<Empty title="Tu semana empieza con un registro">Agregá la fecha a tus gastos para descubrir tu ritmo de consumo.</Empty>:<>
        <div className="weekly-chart" role="img" aria-label={`Gasto por semana. Promedio ${money(average)}. ${weeks.map(w=>`${w.name}, ${w.range}: ${money(w.total)}`).join('; ')}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={weeks} margin={{top:24,right:12,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5"/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fill:'var(--muted)',fontSize:14}}/><YAxis width={64} tickLine={false} axisLine={false} tick={{fill:'var(--muted)',fontSize:14}} tickFormatter={v=>new Intl.NumberFormat('es-AR',{notation:'compact'}).format(v)}/><Tooltip cursor={{fill:'var(--tint)'}} formatter={v=>[money(v),'Gasto']} labelFormatter={(_,payload)=>payload?.[0]?.payload.range||''} contentStyle={{background:'var(--surface)',color:'var(--ink)',border:'1px solid var(--field-border)',borderRadius:12,fontSize:14}}/><ReferenceLine y={average} stroke="var(--warning)" strokeWidth={2} strokeDasharray="6 4" ifOverflow="extendDomain"/><Bar dataKey="total" radius={[7,7,0,0]} maxBarSize={48} isAnimationActive={false}>{weeks.map(w=><Cell key={w.desde} fill={today>=w.desde&&today<=w.hasta?'var(--brand)':'var(--chart-bar)'}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <div className="weekly-legend"><span><i/>Gasto por semana</span><span><i className="average-line"/>Promedio {money(average)}</span></div>
        <details className="weekly-values"><summary>Ver fechas e importes por semana</summary><ul>{weeks.map(w=><li key={w.desde}><span>{w.name} · {w.range}</span><strong>{money(w.total)}</strong></li>)}</ul></details>
      </>}
      {result.data.sinFecha.cantidad>0&&<p className="inline-warning"><Icon name="document" size={18}/>{result.data.sinFecha.cantidad} sin fecha · {money(result.data.sinFecha.total)} fuera del gráfico.</p>}
      <p className="data-footnote">Lunes a domingo, solo días de este mes. El promedio incluye todas las semanas visibles, incluso sin consumo. Usa la fecha real; el resumen superior usa el período de registro.</p>
    </>}
  </section>;
}
