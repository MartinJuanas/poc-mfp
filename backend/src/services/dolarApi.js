import Redis from 'ioredis';
const memory = new Map();
const ttl = 300;
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1, connectTimeout: 1500, retryStrategy: () => null });
redis.on('error', () => {});
async function cached(key) {
  try { if (redis.status === 'ready') { const raw = await redis.get(key); if (raw) return JSON.parse(raw); } } catch { /* memory remains usable */ }
  const entry = memory.get(key);
  return entry && entry.expiry > Date.now() ? entry.data : null;
}
async function cache(key, data) {
  memory.set(key, { data, expiry: Date.now() + ttl * 1000 });
  try { if (redis.status === 'ready') await redis.setex(key, ttl, JSON.stringify(data)); } catch { /* optional cache */ }
}
async function fetchJSON(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Cotización no disponible');
  return response.json();
}
async function criptoRate() {
  const key = 'cripto_rate';
  const existing = await cached(key); if (existing) return existing;
  try {
    const exchanges = await fetchJSON('https://criptoya.com/api/usdt/ars');
    const values = ['binancep2p', 'bybitp2p', 'bitgetp2p', 'okexp2p'].map(k => exchanges[k]).filter(v => v?.ask > 0 && v?.bid > 0);
    if (!values.length) return null;
    const rate = { compra: Math.round(values.reduce((s, v) => s + v.bid, 0) / values.length * 100) / 100, venta: Math.round(values.reduce((s, v) => s + v.ask, 0) / values.length * 100) / 100 };
    await cache(key, rate); return rate;
  } catch { return null; }
}
let inFlight;
export async function getDolarRates(forceRefresh = false) {
  if (!forceRefresh) { const existing = await cached('dolar_rates'); if (existing) return existing; }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const [result, cripto] = await Promise.allSettled([fetchJSON('https://dolarapi.com/v1/dolares'), criptoRate()]);
    const rates = { oficial: null, blue: null, mayorista: null, cripto: cripto.status === 'fulfilled' ? cripto.value : null, fechaActualizacion: null };
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      for (const rate of result.value) if (['oficial', 'blue', 'mayorista'].includes(rate.casa) && Number.isFinite(rate.venta) && rate.venta > 0) rates[rate.casa] = { compra: rate.compra, venta: rate.venta };
    }
    if (!rates.oficial && !rates.blue && !rates.cripto) throw new Error('No se pudo obtener la cotización del dólar');
    rates.fechaActualizacion = new Date().toISOString();
    await cache('dolar_rates', rates); return rates;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}
export async function convertToUSD(arsAmount, tipo = 'oficial') {
  const rates = await getDolarRates();
  const rate = rates[tipo];
  if (!rate || !(rate.venta > 0)) throw new Error('Cotización no disponible');
  return { arsAmount, usdAmount: Math.round(Number(arsAmount) / rate.venta * 100) / 100, tipoCotizacion: tipo, cotizacionUsada: rate.venta, fechaCotizacion: rates.fechaActualizacion };
}
export async function getHistoricalRates() { return []; }
export async function closeCurrencyCache() { await redis.quit().catch(() => redis.disconnect()); }
export default { getDolarRates, convertToUSD, getHistoricalRates };
