const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { chromium, openPage, scene } = require('./ux-v2-fixture.cjs');

const assets = path.resolve(process.env.FORGE_METRICS_ASSETS || 'app/src/main/assets');
const label = process.env.FORGE_METRICS_LABEL || 'candidate';
const count = Number(process.env.FORGE_METRICS_SAMPLES || 5);
const viewport = { width: 390, height: 844 };
const compact = (a, b) => a - b;

async function trial(browser, scenario) {
  const { page, context, errors } = await openPage(browser, viewport, assets);
  try {
    let actions = 0;
    const click = async locator => {
      await locator.click();
      actions++;
    };
    const fill = async (selector, value) => {
      await page.locator(selector).fill(value);
      actions++;
    };
    const mode = await page.evaluate(() => !!window.ForgeQuickLog);
    await scene(page, scenario.screen);
    if (scenario.key === 'set') {
      await page.evaluate(() => {
        const name = state.active.exercises[0].name;
        const previous = { id: 'lab-workout', name: 'Контрольная тренировка', date: '2026-11-15',
          sets: [{ exercise: name, weight: 60, reps: 9, done: true }] };
        forgeCommitDiary({ ...state, workouts: [previous] });
        showPage('workout');
      });
    }
    const start = performance.now();
    if (scenario.key === 'set') {
      if (mode) {
        await click(page.locator('[data-quick-log="record"]'));
      } else {
        await fill('#workout .n8-setgrid input[aria-label="Вес подхода 1"]', '60');
        await fill('#workout .n8-setgrid input[aria-label="Повторения подхода 1"]', '9');
        await click(page.locator('#fp-workout-dock [data-fp-action="logSet"]'));
      }
      const result = await page.evaluate(() => JSON.parse(localStorage.getItem('forge_v2')).active.exercises[0].sets.filter(set => set.done));
      assert.equal(result.length, 1);
      assert.deepEqual([result[0].weight, result[0].reps], [60, 9]);
    }
    if (scenario.key === 'meal') {
      if (mode) {
        await click(page.locator('#nutrition [data-quick-food="open"]'));
        await click(page.locator('#modalBody [data-quick-food="template"]').first());
      } else {
        await click(page.locator('#nutrition button').filter({ hasText: /^Рационы$/ }));
        await click(page.locator('#meals button[onclick="applyMealTemplate(0)"]'));
      }
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forge_v2')).foods.filter(food => food.name === 'Каша').length), 1);
    }
    if (scenario.key === 'program') {
      const initial = await page.evaluate(() => state.programs.length);
      await click(page.locator('#plan [data-fp-action="template"]').first());
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forge_v2')).programs.length), initial + 1);
    }
    if (scenario.key === 'cycle') {
      const initial = await page.evaluate(() => state.trainingCycles?.length || 0);
      await click(page.locator('#plan [data-fc="new"]'));
      await click(page.locator('#forge-cycle [name="program"]').first());
      await click(page.locator('#forge-cycle [data-fc="create"]'));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forge_v2')).trainingCycles.length), initial + 1);
    }
    if (scenario.key === 'food') {
      await click(page.locator('#forgeFoodMore summary'));
      await click(page.locator('#forgeFoodMore [onclick="forgeNewCustomFood()"]'));
      await fill('#forgeCustomName', 'Лабораторный продукт');
      await fill('#forgeCustomCal', '120');
      await fill('#forgeCustomP', '10');
      await fill('#forgeCustomF', '4');
      await fill('#forgeCustomC', '11');
      if (mode) {
        await click(page.locator('#modalBody [onclick="forgeSaveCustomFood(true)"]'));
      } else {
        await click(page.locator('#modalBody [onclick="forgeSaveCustomFood()"]'));
        await click(page.locator('.food-catalog-result').filter({ hasText: 'Лабораторный продукт' }).locator('.forge-plus'));
      }
      await click(page.locator('#modalBody [onclick="forgeAddFood()"]'));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forge_v2')).foods.filter(food => food.name === 'Лабораторный продукт').length), 1);
    }
    assert.deepEqual(errors, []);
    return { actions, durationMs: Math.round(performance.now() - start) };
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  const scenarios = [
    { key: 'set', screen: 'workout', task: 'Записать повтор предыдущих 60 кг × 9 при другом плане' },
    { key: 'meal', screen: 'nutrition', task: 'Добавить сохранённый рацион «Завтрак»' },
    { key: 'program', screen: 'plan', task: 'Создать рабочую программу из готового шаблона' },
    { key: 'cycle', screen: 'plan', task: 'Сохранить черновик цикла с одной программой и датами по умолчанию' },
    { key: 'food', screen: 'products', task: 'Создать неизвестный продукт из этикетки и записать 100 г' }
  ];
  const results = {};
  try {
    for (const scenario of scenarios) {
      const samples = [];
      for (let i = 0; i < count; i++) samples.push(await trial(browser, scenario));
      const median = values => values.sort(compact)[Math.floor(values.length / 2)];
      results[scenario.key] = { task: scenario.task, samples, actions: median(samples.map(s => s.actions)),
        medianMs: median(samples.map(s => s.durationMs)) };
      console.log(scenario.key, JSON.stringify(results[scenario.key]));
    }
    fs.mkdirSync('test-results/product-10x', { recursive: true });
    fs.writeFileSync(path.join('test-results/product-10x', label + '-metrics.json'), JSON.stringify({ label, viewport, results }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
