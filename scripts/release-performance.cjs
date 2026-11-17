const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const dir = path.resolve(__dirname, '../app/src/main/assets');
const origin = 'https://appassets.androidplatform.net';
const url = origin + '/assets/index.html';

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => {
      const request = new URL(route.request().url());
      return request.origin === origin
        ? route.fulfill({ path: path.join(dir, request.pathname.replace(/^\/assets\//, '')) })
        : route.abort();
    });
    const metrics = {};
    const measure = async (name, action) => {
      const start = performance.now();
      await action();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      metrics[name] = Math.round(performance.now() - start);
    };
    await measure('cleanStart', () => page.goto(url));
    await page.evaluate(() => {
      const exercise = 'Жим штанги лёжа';
      const date = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
      const workouts = Array.from({ length: 1200 }, (_, i) => ({
        id: 'bench-workout-' + i, date: date(i), name: 'Аудит тренировки', duration: 40,
        sets: Array.from({ length: 12 }, () => ({ exercise, weight: 62.5, reps: 8, done: true }))
      }));
      const foods = Array.from({ length: 3500 }, (_, i) => ({
        id: 'bench-food-' + i, date: date(Math.floor(i / 6)), name: 'Аудит питания',
        meal: 'Завтрак', grams: 100, cal: 120, protein: 10, fat: 4, carbs: 11
      }));
      const program = { id: 'bench-program', name: 'Аудит программы', days: structuredClone(state.plans) };
      const active = { id: 'bench-active', name: 'Аудит подхода', date: today(), start: Date.now(),
        exercises: [{ name: exercise, sets: [{ weight: 62.5, reps: 8, done: false }] }] };
      forgeCommitDiary({ ...state, workouts, foods, programs: [program], active });
    });
    await measure('loadedStart', () => page.reload());
    await measure('catalogOpen', () => page.evaluate(() => showPage('library')));
    await measure('exerciseSearch', () => page.evaluate(() => { y8Search = 'жим'; y8RenderGroups(); }));
    await measure('programOpen', () => page.evaluate(() => { showPage('plan'); n8OpenProgram('bench-program'); }));
    await page.evaluate(() => { n8CloseOverlay(); showPage('workout'); });
    await measure('setSave', () => page.evaluate(() => n8LogSet(0, 0)));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forge_v2')).active.exercises[0].sets[0].done), true);
    await measure('historyOpen', () => page.evaluate(() => showPage('progress')));
    await measure('statisticsOpen', () => page.evaluate(() => n8StatsSelect('strength')));
    await page.evaluate(() => showPage('foodcatalog'));
    await measure('foodSearch', () => page.locator('#foodSearch').fill('творог'));
    let exportFile;
    await measure('jsonExport', async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportData())]);
      exportFile = await fs.readFile(await download.path());
    });
    await measure('jsonRestore', async () => {
      await page.locator('#importFile').setInputFiles({ name: 'benchmark.json', mimeType: 'application/json', buffer: exportFile });
      await page.locator('#toast').filter({ hasText: 'Резервная копия восстановлена' }).waitFor();
    });
    const actual = await page.evaluate(() => [state.workouts.length, state.foods.length]);
    assert.deepEqual(actual, [1200, 3500]);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const heap = (await cdp.send('Performance.getMetrics')).metrics.find(item => item.name === 'JSHeapUsedSize').value;
    const report = { browser: browser.version(), fixture: { workouts: 1200, sets: 14400, foods: 3500 },
      viewport: [390, 844], timesMs: metrics, exportBytes: exportFile.length, jsHeapBytes: heap };
    const output = path.resolve('test-results');
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'large-diary-performance.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
