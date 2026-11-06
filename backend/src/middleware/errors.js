export function sendError(res, error) {
  const status = error.status || (error.code === 11000 ? 409 : ['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
  console.error(`[API] ${error.name || 'Error'} (${error.code || status})`);
  const message = status === 409 ? 'Este comprobante ya fue registrado.' : status === 400 ? 'Revisá los datos ingresados: hay valores inválidos.' : status === 404 ? 'No encontramos el registro solicitado.' : status === 403 ? 'Esta operación no está habilitada.' : 'No pudimos completar la operación. Intentá nuevamente.';
  return res.status(status).json({ success: false, error: message });
}
export const inputError = message => Object.assign(new Error(message), { status: 400 });
