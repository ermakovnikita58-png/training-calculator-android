const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, openPage, scene } = require('./ux-v2-fixture.cjs');

const assets = path.resolve('app/src/main/assets');
const screenshots = path.resolve('test-results/product-10x/screenshots');
const stored = (page, expression) => page.evaluate(fn =>
  Function('diary', 'return (' + fn + ')')(JSON.parse(localStorage.getItem('forge_v2'))), expression);
const action = (page, kind, value) => page.locator('[data-' + kind + '="' + value + '"]');
const back = page => page.evaluate(() => f6HandleAndroidBack());

async function layout(page, selector) {
  const geometry = await page.locator(selector).evaluate(el => {
    const box = el.getBoundingClientRect();
    return { width: el.clientWidth, content: el.scrollWidth, left: box.left, right: box.right, viewport: window.innerWidth };
  });
  assert(geometry.width > 0 && geometry.content <= geometry.width + 2 && geometry.left >= -1 && geometry.right <= geometry.viewport + 1,
    selector + ' horizontal overflow: ' + JSON.stringify(geometry));
}

async function quickLog(page, width) {
  await page.evaluate(() => {
    const name = state.plans[0].exercises[0];
    const history = state.workouts.map(item => ({ ...item, sets: item.sets.map(set => set.exercise === name ? { ...set, reps: 9 } : set) }));
    forgeCommitDiary({ ...state, workouts: history });
    startWorkout(0);
  });
  assert.deepEqual(await stored(page, 'diary.active.exercises[0].planned'), { weight: 62.5, reps: 8, sets: 3 });
  assert.deepEqual(await stored(page, 'diary.active.exercises[0].sets.map(set => [set.weight, set.reps])'),
    [[60, 9], [60, 9], [60, 9]]);
  const repeat = action(page, 'quick-log', 'record');
  await repeat.focus();
  await page.keyboard.press('Enter');
  await repeat.click();
  assert.deepEqual(await stored(page, 'diary.active.exercises[0].sets.map(set => set.done)'), [true, false, false]);
  await page.reload();
  await action(page, 'quick-log', 'undo').waitFor();
  if (width === 390) await page.screenshot({ path: path.join(screenshots, 'quick-log-390.png'), animations: 'disabled' });
  await action(page, 'quick-log', 'undo').click();
  assert.equal(await stored(page, 'diary.active.exercises[0].sets[0].done'), false);
  await repeat.click();
  await page.evaluate(() => showPage('nutrition'));
  await back(page);
  assert.deepEqual(await stored(page, 'diary.active.exercises[0].sets.map(set => set.done)'), [true, false, false]);
  assert.equal(await stored(page, 'diary.workouts.length'), 1);
  await layout(page, '#workout');
}

async function quickFood(page, width) {
  await scene(page, 'nutrition');
  const open = page.locator('#nutrition [data-quick-food="open"]');
  await open.click();
  if (width === 390) await page.screenshot({ path: path.join(screenshots, 'quick-food-390.png'), animations: 'disabled' });
  await layout(page, '#forgeQuickFood');
  await action(page, 'quick-food', 'template').click();
  assert.equal(await stored(page, 'diary.foods.length'), 2);
  await page.reload();
  await page.locator('#nutrition [data-quick-food="undo"]').click();
  assert.equal(await stored(page, 'diary.foods.length'), 1);
  await page.evaluate(() => {
    const dated = { ...state.foods[0], id: 'meal-yesterday', date: '2026-11-15', name: 'Вчерашний завтрак' };
    forgeCommitDiary({ ...state, foods: [...state.foods, dated,
      { ...dated, id: 'last-dinner', date: '2026-11-14', name: 'Последний ужин', meal: 'Ужин' }] });
    renderAll();
  });
  await open.click();
  await action(page, 'quick-food', 'breakfast').click();
  assert.deepEqual(await stored(page, 'diary.foods.slice(-1).map(food => [food.date, food.meal, food.name])'),
    [['2026-11-16', 'Завтрак', 'Вчерашний завтрак']]);
  await open.click();
  await page.locator('#quickFoodMeal').selectOption({ label: 'Ужин' });
  await action(page, 'quick-food', 'previous').click();
  assert.deepEqual(await stored(page, 'diary.foods.slice(-1).map(food => [food.date, food.meal, food.name])'),
    [['2026-11-16', 'Ужин', 'Последний ужин']]);
  await open.click();
  await page.getByText('Недавно добавленные', { exact: true }).click();
  const panel = page.locator('#forgeQuickFood details').first();
  await panel.getByLabel('Выбрать Овсяная каша').check();
  await panel.getByLabel('Порция Овсяная каша, г').fill('100');
  await panel.getByLabel('Выбрать Последний ужин').check();
  await action(page, 'quick-food', 'batch').click();
  assert.equal(await stored(page, 'diary.foods.length'), 7);
  assert.equal(await stored(page, 'diary.foods.findLast(item=>item.name==="Овсяная каша").cal'), 153);
  await page.locator('#nutrition [data-quick-food="undo"]').click();
  assert.equal(await stored(page, 'diary.foods.length'), 5);
  await open.click();
  await back(page);
  assert.equal(await page.locator('#modalback').evaluate(el => el.classList.contains('show')), false);
}

async function wizard(page, width) {
  await scene(page, 'plan');
  await page.locator('#plan [data-program-wizard="open"]').first().click();
  await action(page, 'program-wizard', 'goal').click();
  await page.getByLabel('Набрать мышцы').check();
  await action(page, 'program-wizard', 'days').click();
  await back(page);
  await page.getByRole('heading', { name: '1. Какая у тебя цель?' }).waitFor();
  await action(page, 'program-wizard', 'days').click();
  await page.getByLabel('Тренировок в неделю').selectOption('1');
  await action(page, 'program-wizard', 'exercises').click();
  await page.locator('#forgeProgramWizard').getByRole('searchbox', { name: 'Найти упражнение' }).fill('жим штанги лёжа');
  await action(page, 'program-wizard', 'add').first().click();
  await action(page, 'program-wizard', 'review').click();
  await page.locator('#forgeProgramWizard').getByLabel('Название программы').fill('Мастер · контрольная');
  await layout(page, '#forgeProgramWizard');
  if (width === 390) await page.screenshot({ path: path.join(screenshots, 'program-wizard-390.png'), animations: 'disabled' });
  await action(page, 'program-wizard', 'save').click();
  await page.locator('#n8-program.show').waitFor();
  const program = await stored(page, 'diary.programs.at(-1)');
  assert.equal(program.name, 'Мастер · контрольная');
  assert.equal(program.days[0].exerciseConfig[program.days[0].exercises[0]].reps, 10);
  assert.equal(await stored(page, 'diary.currentProgram'), 'ux-program');
  await back(page);
}

async function cycle(page, width) {
  await scene(page, 'plan');
  await page.locator('#plan [data-fc="new"]').click();
  await page.locator('#forge-cycle [name="preset"]').selectOption('power');
  await page.locator('#forge-cycle [name="program"]').first().check();
  if (width === 390) await page.screenshot({ path: path.join(screenshots, 'cycle-preset-390.png'), animations: 'disabled' });
  await page.locator('#forge-cycle [data-fc="create"]').click();
  assert.equal(await stored(page, 'diary.trainingCycles.at(-1).preset'), 'power');
  await page.locator('#forge-cycle [data-select]').first().check();
  await page.locator('#forge-cycle [data-fc="next"]').click();
  await page.locator('#forge-cycle [data-fc="base-open"]').first().click();
  await page.locator('#forge-cycle [data-fc="base-source"][data-source="known"]').click();
  await page.locator('#forge-cycle [name="type"]').selectOption('oneRM');
  await page.locator('#forge-cycle [name="weight"]').fill('100');
  await page.locator('#forge-cycle [name="derive-tm"]').check();
  await page.locator('#forge-cycle [data-fc="base-save"]').click();
  const basis = await stored(page, 'Object.values(diary.trainingCycles.at(-1).bases)[0]');
  assert.deepEqual([basis.type, basis.value, basis.origin.percent], ['trainingMax', 90, 90]);
  await back(page);
  await page.evaluate(() => ForgeCycles.close());
}

async function weekly(page, width) {
  await scene(page, 'home');
  await page.locator('[data-forge-weekly]').last().click();
  await page.getByText(/Недостаточно данных для корректировки/).waitFor();
  if (width === 390) await page.screenshot({ path: path.join(screenshots, 'weekly-checkin-390.png'), animations: 'disabled' });
  await layout(page, '#forgeWeekly');
  const goals = await stored(page, 'diary.goals');
  await page.locator('#forgeWeeklyCoach').click();
  await page.locator('#nutritionCoach.active [data-nc-step="5"]:not([hidden])').waitFor();
  assert.deepEqual(await stored(page, 'diary.goals'), goals);
  for (let step = 5; step > 0; step--) await back(page);
  await page.locator('#home.active').waitFor();
}

async function adaptive(page) {
  async function prepare() {
    await scene(page, 'plan');
    await page.evaluate(() => {
      const name = state.plans[0].exercises[0];
      const programs = state.programs.map(item => item.id === state.currentProgram
        ? { ...item, progression: { enabled: true, stepKg: 2.5 } } : item);
      const previous = { id: 'adaptive-before', date: '2026-11-14', programId: state.currentProgram,
        sets: [{ exercise: name, weight: 62.5, reps: 8, done: true }] };
      const workout = { id: uid(), name: state.plans[0].name, date: today(), start: Date.now(),
        programId: state.currentProgram, programDay: 'ПН', exercises: [{
          name, planned: { weight: 62.5, reps: 8, sets: 3 },
          sets: Array.from({ length: 3 }, () => ({ weight: 62.5, reps: 10, rir: 2, done: true }))
        }] };
      forgeCommitDiary({ ...state, active: workout, programs, workouts: [...state.workouts, previous] });
      showPage('workout');
    });
    await page.locator('#workout [onclick="n8FinishWorkout()"]').click();
    await page.locator('#forgeProgressionAdvice').waitFor();
  }
  const weight = 'diary.programs.find(item=>item.id===diary.currentProgram).days[0].exerciseConfig["Жим штанги лёжа"].weight';
  await prepare();
  await page.locator('#forgeDeclineProgression').click();
  assert.equal(await stored(page, weight), 62.5);
  await prepare();
  assert.equal(await stored(page, weight), 62.5);
  await page.locator('#forgeProgressionAdvice input[type="checkbox"]').check();
  await page.locator('#forgeAcceptProgression').click();
  assert.equal(await stored(page, weight), 65);
  assert.deepEqual(await stored(page, 'diary.workouts[0].sets.map(set=>[set.weight,set.reps])'),
    [[62.5, 10], [62.5, 10], [62.5, 10]]);
}

async function zoomAndLandscape(page) {
  await scene(page, 'nutrition');
  await page.evaluate(() => {
    const { mealTemplates, ...previousFormat } = state;
    forgeCommitDiary(previousFormat);
    renderAll();
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addStyleTag({ content: 'html { font-size: 32px !important }' });
  await page.locator('#nutrition [data-quick-food="open"]').click();
  assert.equal(await page.locator('#forgeQuickFood [data-quick-food="template"]').count(), 0);
  await layout(page, '#forgeQuickFood');
  await page.setViewportSize({ width: 844, height: 390 });
  await layout(page, '#forgeQuickFood');
  await page.getByRole('button', { name: 'Добавить выбранные продукты' }).scrollIntoViewIfNeeded();
  assert(await page.getByRole('button', { name: 'Добавить выбранные продукты' }).isVisible());
  await back(page);
}

(async () => {
  await fs.mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  try {
    for (const width of [320, 360, 390, 412, 430]) {
      const { page, context, errors } = await openPage(browser, { width, height: 844 }, assets);
      try {
        await quickLog(page, width);
        await quickFood(page, width);
        await wizard(page, width);
        await cycle(page, width);
        await weekly(page, width);
        if (width === 390) {
          await adaptive(page);
          await zoomAndLandscape(page);
        }
        assert.deepEqual(errors, []);
        console.log('PASS ' + width + 'px: one-tap log, duplicate guard, restart/undo, meals, wizard, cycle TM, weekly/Coach and Back');
      } catch (error) {
        await page.screenshot({ path: path.join(screenshots, 'failure-' + width + '.png') }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
