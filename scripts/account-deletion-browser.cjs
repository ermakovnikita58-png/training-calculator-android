const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { chromium } = require('playwright');

const origin = 'https://forge.example.test';
const address = origin + '/account-deletion.html';
const project = 'https://evwvbozhfsprcabrfefe.supabase.co';
const web = path.resolve(__dirname, '../docs/pages');
const session = { access_token: 'synthetic.access.token', user: { id: 'synthetic-account', email: 'test@example.test' } };

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const deletes = [];
    let challenge;
    let pkceExchanged = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) return route.fulfill({ path: path.join(web, url.pathname.slice(1)) });
      if (url.origin !== project) return route.abort();
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'apikey, authorization, content-type' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname === '/auth/v1/authorize') {
        assert.equal(url.searchParams.get('redirect_to'), address);
        assert.equal(url.searchParams.get('provider'), 'google');
        assert.equal(url.searchParams.get('code_challenge_method'), 's256');
        challenge = url.searchParams.get('code_challenge');
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body:
          '<!doctype html><a href="' + address + '?code=synthetic-code">Тестовый аккаунт Google</a>' });
      }
      if (url.pathname === '/auth/v1/token') {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'password') {
          assert.deepEqual(request.postDataJSON(), { email: session.user.email, password: 'synthetic passphrase' });
        } else {
          assert.equal(grant, 'pkce');
          const { auth_code: code, code_verifier: verifier } = request.postDataJSON();
          assert.equal(code, 'synthetic-code');
          assert.equal(createHash('sha256').update(verifier).digest('base64url'), challenge);
          pkceExchanged = true;
        }
        return route.fulfill({ json: session, headers });
      }
      if (url.pathname === '/functions/v1/delete-account') {
        deletes.push(request.postDataJSON());
        assert.equal(request.headers().authorization, 'Bearer ' + session.access_token);
        if (deletes.length === 1) return route.fulfill({ status: 503, json: { error: 'temporary' }, headers });
        return route.fulfill({ json: { deleted: true }, headers });
      }
      return route.abort();
    });
    await page.goto(address);
    await page.getByLabel('Электронная почта').fill(session.user.email);
    await page.getByLabel('Пароль FORGE').fill('synthetic passphrase');
    await page.getByRole('button', { name: 'Войти по почте' }).click();
    await page.getByText(session.user.email, { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Удалить аккаунт' }).click();
    assert.equal(deletes.length, 0);
    await page.getByLabel(/Подтверждаю удаление/).check();
    await page.getByRole('button', { name: 'Удалить аккаунт' }).click();
    await page.getByText(/Сервер не подтвердил запрос/).waitFor();
    await page.getByRole('button', { name: 'Удалить аккаунт' }).click();
    await page.getByText('Аккаунт и облачная копия удалены.').waitFor();
    assert.deepEqual(deletes, [{ confirm: true }, { confirm: true }]);

    await page.getByRole('button', { name: 'Войти через Google' }).click();
    await page.getByRole('link', { name: 'Тестовый аккаунт Google' }).click();
    await page.getByText(session.user.email, { exact: false }).waitFor();
    assert.equal(page.url(), address);
    assert.equal(pkceExchanged, true);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    await page.getByRole('button', { name: 'Выйти' }).click();
    await page.getByText('Сеанс закрыт.').waitFor();
    assert.equal(deletes.length, 2);
    assert.deepEqual(errors, []);
    console.log('PASS public deletion page: password, Google PKCE, explicit confirmation, temporary error/retry and session cleanup');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
