export function variation(current, previous) {
  if (previous == null) return { percent:null, direction:'flat', label:'Sin datos del mes anterior' };
  if (previous === 0 && current !== 0) return { percent:null, direction:'flat', label:'Mes anterior sin importe comparable' };
  const percent = previous === 0 ? 0 : (current-previous)/Math.abs(previous)*100;
  return { percent, direction:percent>0?'up':percent<0?'down':'flat', label:`${percent>0?'+':''}${percent.toLocaleString('es-AR',{maximumFractionDigits:1})}%` };
}
export function topCategories(rows, limit=5) {
  const sorted=[...rows].sort((a,b)=>b.total-a.total);
  return sorted.length<=limit?sorted:[...sorted.slice(0,limit),{categoria:'agrupadas',total:sorted.slice(limit).reduce((s,r)=>s+Math.round(r.total*100),0)/100,count:sorted.slice(limit).reduce((s,r)=>s+r.count,0)}];
}
