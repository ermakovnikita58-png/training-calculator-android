const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const assets = path.resolve(__dirname, '../app/src/main/assets');
const origin = 'https://appassets.androidplatform.net';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  let requests = 0;
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.fulfill({ path: path.join(assets, url.pathname.replace(/^\/assets\//, '')) });
    if (url.hostname !== 'world.openfoodfacts.org') return route.abort();
    requests++;
    if (!url.pathname.includes('4006381333931')) return route.abort();
    return route.fulfill({ json: { product: {
      code: '4006381333931', product_name: 'Проверочный напиток', quantity: '1 l', serving_size: '250 ml',
      nutriments: { 'energy-kcal_100g': 40, proteins_100g: 0, fat_100g: 0, carbohydrates_100g: 10 }
    } } });
  });
  try {
    await page.goto(origin + '/assets/index.html');
    await page.evaluate(() => {
      showPage('nutrition');
      state.forgeCustomFoods.push({ name: 'Локальный продукт', code: '96385074', cal: 100, p: 5, f: 5, c: 9 });
      openFoodScanner();
    });
    const code = page.locator('#manualBarcode');
    const lookup = page.locator('#forge-scan-find');
    const start = await page.evaluate(() => state.foods.length);
    await code.fill('4006381333930');
    await lookup.click();
    assert.equal(requests, 0);
    await code.fill('96385074');
    await lookup.click();
    await page.locator('#modalBody').getByText('Локальный продукт').waitFor();
    assert.equal(requests, 0);
    assert.equal(await page.evaluate(() => state.foods.length), start);
    await page.evaluate(() => { closeModal(); openFoodScanner(); });
    await code.fill('4006381333931');
    await lookup.click();
    await page.locator('#modalBody').getByText('Проверочный напиток').waitFor();
    assert.match(await page.locator('#forgeFoodPreview').innerText(), /250 мл · 100 ккал/);
    assert.equal(await page.evaluate(() => state.foods.length), start);
    await page.locator('#modalBody').getByRole('button', { name: /Добавить в дневник/ }).click();
    assert.deepEqual(await page.evaluate(() => {
      const item = state.foods.at(-1);
      return [item.barcode, item.milliliters, item.grams ?? null, item.cal, item.carbs];
    }), ['4006381333931', 250, null, 100, 25]);
    await page.evaluate(() => openFoodScanner());
    await code.fill('4006381333931');
    await lookup.click();
    await page.locator('#modalBody').getByText('Проверочный напиток').waitFor();
    assert.equal(requests, 1);
    await page.evaluate(() => { closeModal(); openFoodScanner(); });
    await code.fill('036000291452');
    await lookup.click();
    await page.getByText('Нет проверенных данных по коду. Можно добавить продукт вручную').waitFor();
    await page.locator('#forge-scan-manual').click();
    await page.getByText('Свой продукт', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => state.foods.length), start + 1);
    assert.deepEqual(errors, []);
    console.log('PASS barcode checksum, offline catalog, mock OFF, milliliters, confirmation, cache and network fallback');
  } catch (err) {
    await fs.mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/barcode-failure.png' }).catch(() => {});
    throw err;
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
