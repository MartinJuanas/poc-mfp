import { useState } from 'react';
import api from '../services/api';
import { Notice } from './UI';
import { categories } from '../utils/categories';
import { localDateInput } from '../utils/finance';
import './ExpenseForm.css';
export default function ExpenseForm({ initialData, period, onSaved, onCancel }) {
  const [data, setData] = useState(initialData ? { ...initialData, fecha: initialData.fecha?.slice(0,10) || '' } : { monto: '', categoria: 'comida', descripcion: '', fecha: '', medioPago: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = e => setData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setError('');
    if (!Number.isFinite(Number(data.monto)) || Number(data.monto) <= 0) { setError('Ingresá un monto mayor a cero.'); return; }
    setBusy(true);
    try {
      const payload = { monto: Number(data.monto), categoria: data.categoria, descripcion: data.descripcion, fecha: data.fecha || null, medioPago: data.medioPago || null, periodo: period || data.periodo };
      if (initialData) await api.updateExpense(initialData._id, payload); else await api.createExpense(payload);
      if (!initialData) setData({ monto: '', categoria: 'comida', descripcion: '', fecha: '', medioPago: '' });
      onSaved?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <form className="expense-form" onSubmit={submit}><div className="form-row"><label>Monto en ARS<input name="monto" autoFocus value={data.monto} onChange={set} type="number" inputMode="decimal" min="0.01" step="0.01" required placeholder="Ej. 15000" aria-describedby={error ? 'expense-error' : undefined}/></label><label>Categoría<select name="categoria" value={data.categoria} onChange={set}>{Object.entries(categories).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label></div><label>Descripción<input name="descripcion" value={data.descripcion || ''} onChange={set} maxLength={250} placeholder="Ej. Compra del supermercado"/></label><details className="expense-optional"><summary>Fecha y medio de pago (opcional)</summary><label>Medio de pago (opcional)<select name="medioPago" value={data.medioPago || ''} onChange={set}><option value="">Sin informar</option>{['Efectivo','Tarjeta de crédito','Débito','Transferencia','Mercado Pago'].map(value=><option key={value}>{value}</option>)}</select></label><div className="expense-date-control"><label>Fecha del gasto (opcional)<input name="fecha" type="date" value={data.fecha} onChange={set}/></label><button type="button" disabled={busy} title="Completar con la fecha de hoy" onClick={()=>setData(prev=>({...prev,fecha:localDateInput()}))}>Hoy</button></div></details>{error && <div id="expense-error"><Notice error>{error}</Notice></div>}<div className="form-actions">{onCancel && <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>}<button className="primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : initialData ? 'Guardar cambios' : 'Registrar gasto'}</button></div></form>;
}
