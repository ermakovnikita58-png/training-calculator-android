const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const assets = path.resolve(__dirname, '../app/src/main/assets');
const origin = 'https://appassets.androidplatform.net';
const address = origin + '/assets/index.html';

async function serve(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin
      ? route.fulfill({ path: path.join(assets, url.pathname.replace(/^\/assets\//, '')) })
      : route.abort();
  });
}

async function uploadJson(page, text) {
  await page.locator('#importFile').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await serve(page);
    await page.goto(address);
    const fixture = await page.evaluate(() => {
      const name = "Подъём O'Брайена <контур> & штанга";
      const draft = { id: 'fixture-active', name, date: today(), start: Date.now(),
        exercises: [{ name, sets: [{ weight: 30, reps: 5, done: false }] }] };
      const next = { ...state, customExercises: [name], active: draft,
        weights: [{ date: today(), weight: 74, note: 'Замер <утром> & после отдыха' }], foods: [
        { id: "еда' & 1", date: today(), name: 'Тестовый продукт', cal: 70, protein: 2, carbs: 10, fat: 2 }
      ], n9UserPhotos: { [name]: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/s9sAAAAASUVORK5CYII=' } };
      forgeCommitDiary(next);
      return localStorage.getItem('forge_v2');
    });
    await page.reload();
    assert.equal(await page.evaluate(() => state.active.exercises[0].sets[0].weight), 30);
    assert.equal(await page.locator('#weightHistory .pill').textContent(), 'Замер <утром> & после отдыха');

    const failed = await page.evaluate(() => {
      const previous = localStorage.getItem('forge_v2');
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'forge_v2') throw new DOMException('simulated full disk', 'QuotaExceededError');
        return setItem.call(this, key, value);
      };
      try {
        n8LogSet(0, 0);
        const setStatus = document.getElementById('toast').textContent;
        removeFood("еда' & 1");
        const foodStatus = document.getElementById('toast').textContent;
        return { saved: localStorage.getItem('forge_v2') === previous, done: state.active.exercises[0].sets[0].done,
          foods: state.foods.length, setStatus, foodStatus };
      } finally { Storage.prototype.setItem = setItem; }
    });
    assert.deepEqual([failed.saved, failed.done, failed.foods], [true, false, 1]);
    assert.match(failed.setStatus, /Не удалось сохранить/);
    assert.match(failed.foodStatus, /Не удалось сохранить/);

    await uploadJson(page, '{"profile":');
    await page.getByText(/Импорт не выполнен/).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('forge_v2')), fixture);
    const invalid = JSON.parse(fixture);
    invalid.active.exercises[0].sets = [null];
    await uploadJson(page, JSON.stringify(invalid));
    await page.getByText(/Повреждён черновик тренировки/).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('forge_v2')), fixture);

    const ui = await page.evaluate(() => {
      const name = state.customExercises[0];
      const prepared = uiArg(name);
      const quoted = inlineArgument(name);
      const hold = { exercise: name, unit: 'seconds', seconds: 20, weight: 40, reps: 6 };
      const before = state.workouts;
      state.workouts = [{ date: today(), name, duration: 1, sets: [hold] }];
      showPage('progress');
      const excludesHold = document.getElementById('n9ProgressExtras')?.textContent.includes('Добавь подходы с весом и повторениями');
      state.workouts = before;
      return { name, prepared, quoted, excludesHold };
    });
    assert.equal(decodeURIComponent(ui.prepared), ui.name);
    assert.equal(ui.prepared.includes("'"), false);
    assert.match(ui.quoted, /&lt;контур&gt;/);
    assert.equal(ui.excludesHold, true);

    const corrupted = '{"profile":{"name":"Тест восстановления"}';
    await page.evaluate(raw => localStorage.setItem('forge_v2', raw), corrupted);
    await page.reload();
    assert.equal(await page.evaluate(() => ForgeDiaryStorage.needsRecovery()), true);
    assert.equal(await page.evaluate(() => save()), false);
    await page.evaluate(() => n10CloudUploadClicked());
    await page.locator('#toast').filter({ hasText: 'Восстанови локальный дневник перед отправкой в облако.' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('forge_v2')), corrupted);
    const exported = page.waitForEvent('download');
    await page.evaluate(() => exportData());
    assert.equal(await fs.readFile(await (await exported).path(), 'utf8'), corrupted);
    page.once('dialog', dialog => dialog.accept());
    await uploadJson(page, fixture);
    await page.getByText('Резервная копия восстановлена').waitFor();
    assert.equal(await page.evaluate(() => ForgeDiaryStorage.needsRecovery()), false);
    assert.equal(await page.evaluate(() => state.foods[0].name), 'Тестовый продукт');
    assert.equal(await page.evaluate(() => Object.keys(state.n9UserPhotos).length), 1);
    const restored = await page.evaluate(() => localStorage.getItem('forge_v2'));
    await page.locator('#toast').evaluate(element => { element.textContent = ''; });
    page.once('dialog', dialog => dialog.accept());
    await uploadJson(page, fixture);
    await page.getByText('Резервная копия восстановлена').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('forge_v2')), restored);
    assert.deepEqual(errors, []);
    console.log('PASS quota rollback, damaged storage preservation/export, invalid-archive rejection, offline restore, photo and hold handling');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
