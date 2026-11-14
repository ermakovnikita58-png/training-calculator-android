const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const assets = path.resolve(__dirname, '../app/src/main/assets');
const origin = 'https://appassets.androidplatform.net';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  try {
    for (const width of [320, 360, 390, 412]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const errors = [];
      const network = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        const dispatch = result => queueMicrotask(() => window.ForgeNative.onmessage?.({ data: JSON.stringify(result) }));
        let payload = null;
        window.ForgeNative = {
          postMessage(raw) {
            const message = JSON.parse(raw);
            switch (message.action) {
              case 'diagnostics': dispatch({ kind: 'diagnostics', details: { FORGE: 'test', 'Резервная копия Room': 'проверка' } }); break;
              case 'preferences': dispatch({ kind: 'preferences', healthAvailable: true }); break;
              case 'healthRead': dispatch({ kind: 'health', ok: true, weight: { kg: 74, date: '2025-01-01', id: 'hc-test' }, steps: 70000, sessions: 3, minutes: 150 }); break;
              case 'healthDisconnect': dispatch({ kind: 'healthDisconnected' }); break;
              case 'checkpoint': payload = message.payload; dispatch({ kind: 'saved', ok: true }); break;
              case 'readCheckpoint': dispatch({ kind: 'checkpoint', payload }); break;
              case 'deleteCheckpoint': payload = null; dispatch({ kind: 'deleted', ok: true }); break;
            }
          }
        };
      });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) {
          network.push(url.origin);
          return route.abort();
        }
        return route.fulfill({ path: path.join(assets, url.pathname.replace(/^\/assets\//, '')) });
      });
      try {
        await page.goto(origin + '/assets/index.html');
        await page.evaluate(() => {
          state.profile.name = 'Снимок';
          save();
          showPage('profile');
        });
        await page.getByText('Диагностика FORGE', { exact: true }).waitFor();
        await page.getByText('FORGE: test · Резервная копия Room: проверка', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Сделать копию на устройстве' }).click();
        await page.getByText('Копия сохранена на устройстве', { exact: true }).waitFor();
        await page.evaluate(() => { state.profile.name = 'Изменение'; save(); });
        page.once('dialog', dialog => dialog.dismiss());
        await page.getByRole('button', { name: 'Восстановить копию' }).click();
        assert.equal(await page.evaluate(() => state.profile.name), 'Изменение');
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Восстановить копию' }).click();
        await page.waitForFunction(() => state.profile.name === 'Снимок');
        await page.reload();
        assert.equal(await page.evaluate(() => state.profile.name), 'Снимок');
        const history = await page.evaluate(() => ({ workouts: state.workouts.length, weights: state.weights.length }));
        await page.getByRole('button', { name: 'Разрешить и прочитать' }).click();
        await page.getByText(/Шаги за 7 дней: 70000/).waitFor();
        assert.equal(await page.evaluate(() => state.weights.length), history.weights);
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Добавить измерение массы' }).click();
        await page.getByText('Измерение массы добавлено', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Добавить измерение массы' }).click();
        await page.getByText('На эту дату уже есть запись массы', { exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => [state.workouts.length, state.weights.length]), [history.workouts, history.weights + 1]);
        await page.getByRole('button', { name: 'Отключить', exact: true }).click();
        await page.getByText(/Чтение отключено/).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.deepEqual(errors, []);
        assert.deepEqual(network, []);
        console.log(`PASS device settings and offline restore at ${width}px (mock bridge)`);
      } catch (error) {
        await fs.mkdir('test-results', { recursive: true });
        await page.screenshot({ path: `test-results/device-settings-${width}.png` }).catch(() => {});
        throw error;
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
