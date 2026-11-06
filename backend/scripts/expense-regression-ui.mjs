// Browser regression using synthetic API responses; never writes to the live API.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const queries = [];
  const receipt = { _id: '123456789012345678901234', numeroRecibo: 'DEMO-COBRO', categoria: 'recibo', tipoMovimiento: 'INGRESO', montoNeto: 1000, periodo: { mes: 12, anio: 2025 }, fechaAcreditacion: '2026-01-05T00:00:00.000Z', empleador: { nombre: 'Empresa de prueba' } };
  await page.route('**/api/**', async route => {
    assert.equal(route.request().method(), 'GET', 'This test must not write to an API');
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname.endsWith('/years')) data = [2026];
    if (url.pathname.endsWith('/receipts')) data = [receipt];
    if (url.pathname.endsWith('/summary')) data = { porCategoria: [] };
    if (url.pathname.endsWith('/description-ranking')) {
      queries.push(url.searchParams.toString());
      data = { method: 'calculated', explanation: 'IA no disponible. Este ranking se calculó con los gastos guardados.', ranking: [{ descripcion: 'Salida al cine', total: 500, repeticiones: 2 }], cantidad: 2, total: 500 };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('http://localhost:5173/#expenses');
  await page.getByLabel('Mes de gastos').selectOption('9');
  await page.getByLabel('Año de gastos').selectOption('2026');
  await page.locator('select[name="categoria"]').selectOption('salida');
  await page.getByRole('button', { name: '¿En qué descripciones gasté más?' }).click();
  await page.getByRole('cell', { name: 'Salida al cine', exact: true }).waitFor();
  assert.equal(queries.at(-1), 'mes=9&anio=2026');
  assert.equal(await page.getByRole('cell', { name: '2 veces', exact: true }).count(), 1);
  await page.getByLabel('Mes de gastos').selectOption('10');
  assert.equal(await page.getByRole('cell', { name: 'Salida al cine', exact: true }).count(), 0);
  await page.getByRole('button', { name: '¿En qué descripciones gasté más?' }).click();
  await page.getByRole('cell', { name: 'Salida al cine', exact: true }).waitFor();
  assert.equal(queries.at(-1), 'mes=10&anio=2026');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500); // Allow the existing sidebar resize transition to finish.
  await page.screenshot({ path: '../docs/screenshots/09-ranking-descripciones-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto('http://localhost:5173/#movements');
  await page.getByText('Cobro: 5/1/2026', { exact: false }).waitFor();
  await page.getByLabel('Filtrar por período').selectOption('2026-01');
  await page.getByText('1 movimientos encontrados').waitFor();
  await page.getByRole('button', { name: 'Editar Empresa de prueba' }).click();
  await page.getByLabel('Fecha de cobro / acreditación').waitFor();
  assert.equal(await page.getByLabel('Fecha de cobro / acreditación').inputValue(), '2026-01-05');
  assert.equal(await page.getByLabel('Mes del comprobante').inputValue(), '12');
  assert.equal(await page.getByLabel('Año del comprobante').inputValue(), '2025');
  assert.deepEqual(errors, []);
  console.log('UI OK: Salida, ranking, cambio de período, móvil y edición de fecha de cobro. API simulada, sin escrituras.');
} finally { await browser.close(); }
