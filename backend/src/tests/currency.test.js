import { describe, it, expect, vi, afterAll } from 'vitest';
vi.mock('ioredis',()=>({default:class {status='ready';on(){} async get(){throw new Error('Redis down');} async setex(){throw new Error('Redis down');} async quit(){} disconnect(){}}}));
import { getDolarRates, convertToUSD, closeCurrencyCache } from '../services/dolarApi.js';
afterAll(async()=>{vi.unstubAllGlobals();vi.restoreAllMocks();await closeCurrencyCache();});
describe('Cotizaciones con Redis fuera de servicio',()=>{
 it('obtiene y conserva cotizaciones, coalesce requests y convierte con redondeo',async()=>{const fetchMock=vi.fn(async url=>({ok:true,json:async()=>url.includes('dolarapi')?[{casa:'oficial',compra:990,venta:1000},{casa:'blue',compra:1100,venta:1200}]:{binancep2p:{ask:1210,bid:1200}}}));vi.stubGlobal('fetch',fetchMock);const [a,b]=await Promise.all([getDolarRates(true),getDolarRates(true)]);expect(a).toEqual(b);expect(fetchMock).toHaveBeenCalledTimes(2);expect((await convertToUSD(1234.56)).usdAmount).toBe(1.23);expect(fetchMock).toHaveBeenCalledTimes(2);});
 it('rechaza moneda sin cotización y no inventa valores ante falla externa',async()=>{await expect(convertToUSD(100,'mayorista')).rejects.toThrow('Cotización no disponible');vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('Offline');}));const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+360000);await expect(getDolarRates(true)).rejects.toThrow('cotización');});
});
