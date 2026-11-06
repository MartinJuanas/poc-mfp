// Synthetic API only: exercise Today, form submission and weekly refresh safely.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR' });
  const page = await context.newPage();
  // UTC is November 5; Argentina is still November 4. Today must use November 4.
  await page.clock.install({ time: new Date('2026-11-05T02:30:00Z') });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const writes = [];
  const queries = [];
  let failOctober = true;
  const weekly = month => {
    const ranges = month === 11 ? [[1,1],[2,8],[9,15],[16,22],[23,29],[30,30]] : [[1,4],[5,11],[12,18],[19,25],[26,31]];
    const key = day => `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const total = month === 11 ? 150 + (writes.length ? 400 : 0) : 0;
    return { total, cantidad: month === 11 ? 2 + writes.length : 0, sinFecha: { cantidad: month === 11 ? 1 : 0, total: 30 }, semanas: ranges.map(([desde,hasta], i) => ({ desde: key(desde), hasta: key(hasta), total: i === 1 ? total : 0, cantidad: i === 1 && total ? 2 + writes.length : 0 })) };
  };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') {
      assert.equal(request.method(), 'POST');
      assert.equal(url.pathname, '/api/expenses');
      writes.push(request.postDataJSON());
      return route.fulfill({ status: 201, json: { success: true, data: { _id: 'synthetic', ...writes.at(-1) } } });
    }
    let data = [];
    if (url.pathname.endsWith('/years')) data = [2026];
    if (url.pathname.endsWith('/summary')) data = { porCategoria: [] };
    if (url.pathname.endsWith('/weekly')) {
      queries.push(url.search);
      const month = Number(url.searchParams.get('mes'));
      if (month === 10 && failOctober) { failOctober = false; return route.fulfill({ status: 500, json: { success: false, error: 'Error semanal simulado' } }); }
      data = weekly(month);
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('http://localhost:5173/#expenses');
  const panel = page.getByRole('region', { name: 'Gasto semanal' });
  await panel.getByText('Esta semana', { exact: true }).waitFor();
  assert.equal(await panel.locator('li').count(), 6);
  await panel.getByText(/1 gasto sin fecha/).waitFor();
  await page.getByLabel('Fecha del gasto (opcional)').fill('2026-11-01');
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  assert.equal(await page.getByLabel('Fecha del gasto (opcional)').inputValue(), '2026-11-04');
  assert.equal(writes.length, 0, 'Today must not submit the form');
  await page.getByLabel('Monto en ARS').fill('400');
  await page.locator('select[name="categoria"]').selectOption('salida');
  await page.getByLabel('Descripción', { exact: true }).fill('Prueba sintética');
  await page.getByRole('button', { name: 'Registrar gasto', exact: true }).click();
  await page.getByText('El gasto se registró y tu balance se actualizó.').waitFor();
  await panel.getByText('3 gastos', { exact: true }).waitFor();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { monto: 400, categoria: 'salida', descripcion: 'Prueba sintética', fecha: '2026-11-04', medioPago: null, periodo: { mes: 11, anio: 2026 } });
  await panel.screenshot({ path: '../docs/screenshots/10-weekly-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await panel.screenshot({ path: '../docs/screenshots/11-weekly-mobile.png' });
  await page.getByLabel('Mes de gastos').selectOption('10');
  await panel.getByText('Error semanal simulado').waitFor();
  await panel.getByRole('button', { name: 'Reintentar' }).click();
  await panel.getByText('Todavía no hay gastos con fecha en este mes.').waitFor();
  assert.equal(await panel.locator('li').count(), 5);
  assert.ok(queries.at(-1).includes('mes=10&anio=2026'));
  assert.deepEqual(errors, []);
  console.log('UI OK: Hoy con fecha argentina, guardado simulado, actualización semanal, semanas, sin fecha, móvil, mes vacío y reintento. Sin escrituras reales.');
} finally { await browser.close(); }
