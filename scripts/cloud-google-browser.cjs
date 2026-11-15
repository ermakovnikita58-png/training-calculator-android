const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const assets = path.resolve(__dirname, '../app/src/main/assets');
const android = 'https://appassets.androidplatform.net';
const web = 'https://forge.example.test';
const cloud = 'https://evwvbozhfsprcabrfefe.supabase.co';
const fixtureProject = 'https://forge-ci-fixture.supabase.co';
const accountA = { id: 'fixture-a', email: 'a@example.test' };
const accountB = { id: 'fixture-b', email: 'b@example.test' };

function session(user, expiry = 3600) {
  return {
    access_token: 'access-' + user.id, refresh_token: 'refresh-' + user.id, expires_in: expiry, user
  };
}

function serveAsset(route, url) {
  return route.fulfill({ path: path.join(assets, url.pathname.replace(/^\/(assets\/)?/, '')) });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const messages = [];
  const requests = [];
  const errors = [];
  let vault = null;
  let cloudDiary = null;

  function signInMessages() { return messages.filter(message => message.action === 'googleSignIn'); }

  function reply(status, request = signInMessages().at(-1), payload) {
    return page.evaluate(message => window.ForgeNative.emit(message), {
      kind: 'cloudGoogle', requestId: request.requestId, status, session: payload
    });
  }

  async function expectStatus(text) {
    await page.locator('#n10CloudStatus').filter({ hasText: text }).waitFor();
  }

  async function googleButton() { await page.locator('#n10GoogleButton').click(); }

  await page.exposeBinding('nativeCall', (_, message) => {
    messages.push(message);
    if (message.action === 'readCloudSession') return { kind: 'cloudSession', session: vault };
    if (message.action === 'storeCloudSession') {
      vault = message.session;
      return { kind: 'cloudStored', ok: true };
    }
    return null;
  });
  await page.addInitScript(({ url, userId }) => {
    if (!localStorage.getItem('forge10_sync_meta')) {
      localStorage.setItem('forge10_sync_meta', JSON.stringify({
        auto: true, scope: url + '|' + userId, lastRemoteRevision: 9,
        lastRemoteAt: '2026-11-14T00:00:00Z', lastLocalAt: '2026-11-15T00:00:00Z'
      }));
    }
    window.ForgeNative = {
      postMessage(data) {
        nativeCall(JSON.parse(data)).then(result => { if (result) this.emit(result); });
      },
      emit(result) { this.onmessage({ data: JSON.stringify(result) }); }
    };
  }, { url: cloud, userId: accountA.id });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === android) return serveAsset(route, url);
    if (url.origin !== cloud) return route.abort();
    const request = route.request();
    requests.push({ method: request.method(), url, authorization: request.headers().authorization, body: request.postDataJSON() });
    if (url.searchParams.get('grant_type') === 'refresh_token') return route.fulfill({ json: session(accountA) });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    assert.equal(url.pathname, '/rest/v1/forge_snapshots');
    assert.equal(request.method(), 'GET', 'Sign-in must never write the diary');
    const account = [accountA, accountB].find(user => request.headers().authorization === 'Bearer access-' + user.id);
    assert.ok(account);
    assert.equal(url.searchParams.get('user_id'), 'eq.' + account.id);
    return route.fulfill({ json: [{ payload: cloudDiary, revision: 9, updated_at: '2026-11-15T00:00:00Z' }] });
  });

  try {
    await page.goto(android + '/assets/index.html');
    await page.evaluate(() => showPage('profile'));
    await page.locator('#profileGoogleSignIn').click();
    await expectStatus('Подключаем вход Google');
    assert.equal(await page.locator('#n10SupaUrl').inputValue(), cloud);
    assert.equal(await page.locator('#n10GoogleClientId').count(), 0);
    assert.equal(signInMessages().length, 1);
    await reply('client_not_configured');
    await expectStatus('Вход через Google ещё настраивается');

    await page.context().setOffline(true);
    await googleButton();
    await expectStatus('подключись к интернету');
    assert.equal(signInMessages().length, 1);
    await page.context().setOffline(false);

    await googleButton();
    await expectStatus('Подключаем вход Google');
    assert.equal(await page.locator('#n10GoogleButton').isDisabled(), true);
    assert.equal(await page.locator('#n10EmailButton').isDisabled(), true);
    await page.evaluate(() => n10GoogleSignIn());
    assert.equal(signInMessages().length, 2);
    assert.deepEqual(Object.keys(signInMessages()[1]).sort(), ['action', 'clientId', 'key', 'requestId', 'url']);
    assert.equal(signInMessages()[1].clientId, '');
    await reply('cancelled');
    await expectStatus('отменён');

    await googleButton();
    await expectStatus('Подключаем вход Google');
    await reply('provider_disabled');
    await expectStatus('нужно включить провайдер Google');
    assert.equal(await page.locator('#n10GoogleButton').isEnabled(), true);

    // A resumed backup from an earlier sign-in must require direction again on interactive login.
    const diaryBefore = await page.evaluate(() => {
      forgeCommitDiary({ ...state, foods: [...state.foods, { date: today(), name: 'Локальная запись', cal: 100 }] });
      return localStorage.getItem('forge_v2');
    });
    assert.equal(await page.evaluate(() => ForgeCloudStatus()['Автообмен']), 'включён');
    cloudDiary = JSON.parse(diaryBefore);
    await googleButton();
    await expectStatus('Подключаем вход Google');
    const cancelledRequest = signInMessages().at(-1);
    await reply('cancelled', cancelledRequest);
    await expectStatus('отменён');
    await googleButton();
    await expectStatus('Подключаем вход Google');
    await reply('ok', cancelledRequest, session(accountB));
    assert.equal(await page.locator('#n10GoogleButton').isDisabled(), true);
    await reply('ok', undefined, { ...session(accountA, 30), id_token: 'unused-google-id-token' });
    await expectStatus('Вход через Google выполнен');
    assert.equal(vault.session.user.id, accountA.id);
    assert.equal(Object.hasOwn(vault.session, 'id_token'), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('forge10_auth_session')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('forge_v2')), diaryBefore);
    assert.equal(await page.locator('.n10-cloud-checkbox input').isChecked(), false);
    assert.equal(requests.length, 0);

    await page.reload();
    await page.evaluate(() => showPage('account'));
    await page.getByText('Вход выполнен: ' + accountA.email, { exact: false }).first().waitFor();
    page.once('dialog', dialog => dialog.dismiss());
    await page.evaluate(() => n10CloudDownloadClicked());
    assert.equal(requests[0].url.searchParams.get('grant_type'), 'refresh_token');
    assert.deepEqual(requests[0].body, { refresh_token: 'refresh-fixture-a' });
    assert.equal(requests[1].url.searchParams.get('user_id'), 'eq.fixture-a');
    assert.equal(await page.evaluate(() => localStorage.getItem('forge_v2')), diaryBefore);

    await page.context().setOffline(true);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
    await expectStatus('Выход выполнен');
    assert.equal(vault, null);
    assert.ok(messages.some(message => message.action === 'clearGoogleCredential'));
    assert.equal(requests.length, 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('forge_v2')), diaryBefore);
    await page.context().setOffline(false);

    await googleButton();
    await expectStatus('Подключаем вход Google');
    await reply('ok', undefined, session(accountB));
    await expectStatus('Вход через Google выполнен');
    assert.equal(requests.length, 2);
    page.once('dialog', dialog => dialog.dismiss());
    await page.evaluate(() => n10CloudUploadClicked());
    assert.equal(requests[2].url.searchParams.get('user_id'), 'eq.fixture-b');
    assert.equal(await page.evaluate(() => localStorage.getItem('forge_v2')), diaryBefore);
    assert.deepEqual(errors, []);

    const browserPage = await browser.newPage();
    await browserPage.addInitScript(project => {
      localStorage.setItem('forge10_public_cloud_config', JSON.stringify({ url: project, key: 'sb_publishable_fixture_no_real_key' }));
    }, fixtureProject);
    await browserPage.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === web) return serveAsset(route, url);
      if (url.origin === fixtureProject && url.pathname === '/auth/v1/authorize') return route.fulfill({ body: 'mock Google redirect' });
      return route.abort();
    });
    await browserPage.goto(web + '/index.html');
    await browserPage.evaluate(() => showPage('account'));
    await Promise.all([
      browserPage.waitForURL(url => url.origin === fixtureProject && url.pathname === '/auth/v1/authorize'),
      browserPage.locator('#n10GoogleButton').click()
    ]);
    const redirect = new URL(browserPage.url());
    assert.equal(redirect.searchParams.get('provider'), 'google');
    assert.equal(redirect.searchParams.get('redirect_to'), web + '/index.html');
    console.log('PASS Google bridge state, cancellation, offline, restore, refresh, logout, user scope and web OAuth redirect (mock providers)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
