import { useState } from 'react';
import useResource from '../hooks/useResource';
import { money, months } from '../utils/finance';
import { Empty, Notice, Skeleton } from './UI';

export default function ExpenseRanking({ month, year, revision }) {
  const [active, setActive] = useState(false);
  const result = useResource(active ? `/expenses/description-ranking?mes=${month}&anio=${year}` : null, revision);
  return <section className="panel expense-ranking" style={{ marginTop: 24 }}>
    <div className="panel-heading"><h2>Consultá tus gastos</h2><span className="badge">{months[month - 1]} {year}</span></div>
    <button disabled={active && result.loading} onClick={() => { if (active) result.reload(); else setActive(true); }}>¿En qué descripciones gasté más?</button>
    <p className="data-footnote">Gastos guardados del período y facturas de gasto contadas una sola vez. No incluye sueldos. Las facturas se agrupan por sus conceptos y aportan su total una vez.</p>
    {active && result.loading && <Skeleton rows={2}/>}
    {active && result.error && <Notice error>{result.error}<button onClick={result.reload}>Reintentar</button></Notice>}
    {active && !result.loading && result.data && <div aria-live="polite">
      <p>{result.data.explanation}</p>
      <p className="data-footnote">{result.data.method === 'ai' ? 'Comentario generado por IA · ' : ''}Ranking calculado · {result.data.cantidad} registros · Total {money(result.data.total)}</p>
      {!result.data.ranking.length ? <Empty title="Sin gastos en este período">Elegí otro mes o registrá un gasto.</Empty> : <div style={{ overflowX: 'auto' }}><table className="ledger-table"><thead><tr><th>Puesto</th><th>Descripción</th><th>Importe acumulado · ARS</th><th>Repeticiones</th></tr></thead><tbody>{result.data.ranking.map((row, index) => <tr key={row.descripcion}><td>#{index + 1}</td><td style={{ overflowWrap: 'anywhere' }}>{row.descripcion}</td><td>{money(row.total)}</td><td>{row.repeticiones} {row.repeticiones === 1 ? 'vez' : 'veces'}</td></tr>)}</tbody></table></div>}
    </div>}
  </section>;
}
