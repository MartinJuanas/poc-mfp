import { validPeriod } from '../services/finance.js';
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return false;
  const day = new Date(value.slice(0, 10));
  return Number.isFinite(new Date(value).getTime()) && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
};
const forbidden = obj => obj && typeof obj === 'object' && Object.entries(obj).some(([k, v]) => k.startsWith('$') || k.includes('.') || ['__proto__', 'constructor', 'prototype'].includes(k) || forbidden(v));
export function validateRequest(req, res, next) {
  if (forbidden(req.body)) return res.status(400).json({ success: false, error: 'La solicitud contiene campos inválidos.' });
  for (const [key, value] of Object.entries(req.query)) {
    if (['year', 'anio'].includes(key) && value !== 'historical' && (!/^\d{4}$/.test(String(value)) || Number(value) < 1900 || Number(value) > 2100)) return res.status(400).json({ success: false, error: 'Elegí un año válido.' });
    if (key === 'mes' && (!/^\d{1,2}$/.test(String(value)) || Number(value) < 1 || Number(value) > 12)) return res.status(400).json({ success: false, error: 'Elegí un mes válido.' });
  }
  if (!['POST', 'PUT'].includes(req.method) || req.is('multipart/form-data')) return next();
  const body = req.body || {};
  for (const field of ['fecha','fechaAcreditacion','fechaObjetivo']) if (body[field] && !validDate(body[field])) return res.status(400).json({success:false,error:'Revisá la fecha ingresada.'});
  if (body.periodo && !validPeriod(body.periodo)) return res.status(400).json({ success: false, error: 'Revisá el mes y el año del período.' });
  for (const field of ['monto', 'montoActual', 'montoObjetivo', 'montoNeto', 'totalHaberes', 'totalRetenciones', 'bruto', 'amount']) {
    if (body[field] !== undefined && body[field] !== null && (typeof body[field] === 'boolean' || body[field] === '' || !Number.isFinite(Number(body[field])) || Number(body[field]) < 0)) return res.status(400).json({ success: false, error: `Ingresá un valor válido para ${field}.` });
  }
  if (/\/review$/.test(req.path) && !validPeriod({ mes: body.month, anio: body.year })) return res.status(400).json({ success: false, error: 'Elegí un mes y año válidos.' });
  next();
}
export function pick(data, fields) { return Object.fromEntries(fields.filter(k => data[k] !== undefined).map(k => [k, data[k]])); }
