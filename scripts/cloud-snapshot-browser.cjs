const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const assets = path.resolve(__dirname, '../app/src/main/assets');
const origin = 'https://appassets.androidplatform.net';
const cloud = 'https://forge-ci-fixture.supabase.co';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let snapshot = null;
  let requests = [];
  let race = false;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.fulfill({ path: path.join(assets, url.pathname.replace(/^\/assets\//, '')) });
    if (url.origin !== cloud) return route.abort();
    const request = route.request();
    const method = request.method();
    requests.push({ method, path: url.pathname, search: url.search });
    if (url.pathname === '/auth/v1/token') return route.fulfill({
      json: { access_token: 'fake-test-session', refresh_token: 'fake-test-refresh', user: { id: 'test-account' }, expires_in: 3600 }
    });
    if (method === 'GET') return route.fulfill({ json: snapshot ? [snapshot] : [] });
    if (method === 'POST' && !snapshot) {
      snapshot = { payload: request.postDataJSON().payload, revision: 1, updated_at: new Date().toISOString() };
      return route.fulfill({ json: [snapshot] });
    }
    if (method === 'PATCH' && snapshot) {
      if (race) snapshot = { ...snapshot, revision: 2, payload: { fromAnotherDevice: true } };
      if (url.searchParams.get('revision') !== 'eq.' + snapshot.revision) return route.fulfill({ json: [] });
    }
    throw Error('Unexpected request ' + method + ' ' + url.pathname);
  });
  try {
    await page.goto(origin + '/assets/index.html');
    await page.evaluate(() => showPage('account'));
    await page.locator('#n10SupaUrl').fill(cloud);
    await page.locator('#n10SupaKey').fill('sb_publishable_ci_fixture_no_real_key');
    await page.evaluate(() => n10StoreConfig());
    await page.locator('#n10Email').fill('fixture@example.test');
    await page.locator('#n10Password').fill('fixture-password');
    await page.evaluate(() => n10SignIn());
    assert.equal(requests.length, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('forge10_auth_session')), null);
    page.once('dialog', dialog => dialog.dismiss());
    await page.evaluate(() => n10CloudUploadClicked());
    assert.equal(snapshot, null);
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => n10CloudUploadClicked());
    assert.equal(snapshot.revision, 1);
    assert.ok(requests.some(request => request.method === 'POST' && request.search.includes('on_conflict=user_id')));
    race = true;
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => n10CloudUploadClicked());
    assert.equal(snapshot.revision, 2);
    assert.deepEqual(snapshot.payload, { fromAnotherDevice: true });
    await page.getByText(/Автообмен остановлен/).first().waitFor();
    assert.ok(requests.some(request => request.method === 'PATCH' && request.search.includes('revision=eq.1')));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forge10_sync_meta')).auto), false);
    await page.reload();
    assert.equal(await page.evaluate(() => window.ForgeCloudStatus()['Облачный аккаунт']), 'нет сеанса');
    assert.deepEqual(errors, []);
    console.log('PASS cloud consent, session without plaintext storage, atomic conflict and offline diary (mock Supabase)');
  } catch (err) {
    await fs.mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/cloud-snapshot-failure.png' }).catch(() => {});
    throw err;
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
