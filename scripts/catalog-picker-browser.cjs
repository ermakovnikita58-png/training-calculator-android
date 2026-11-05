const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const assets = path.resolve(__dirname, '../app/src/main/assets');
const origin = 'https://appassets.androidplatform.net';
const screenshots = process.env.FORGE_CATALOG_SCREENSHOTS;
const groups = require('../artwork/muscle-art-sources.json');
const widths = [320, 360, 390, 412];

async function capture(page, name, width) {
  if (!screenshots) return;
  fs.mkdirSync(screenshots, {recursive:true});
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({path:path.join(screenshots, `${name}-after-${width}.png`), animations:'disabled'});
}

async function checkFit(page, selector) {
  assert.ok(await page.locator(selector).evaluate(el =>
    el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1
  ), selector + ' has no horizontal overflow');
}

async function checkImages(root) {
  const images = await root.locator('img[data-art-type="MUSCLE_GROUP_ART"]').evaluateAll(async nodes =>
    Promise.all(nodes.map(async image => {
      image.loading = 'eager';
      await image.decode();
      return {id:image.dataset.muscleId, file:image.getAttribute('src'), size:image.naturalWidth, filter:getComputedStyle(image).filter};
    }))
  );
  assert.equal(images.length, 14);
  const expected = new Map(groups.map(g => [g.id, g.file]));
  assert.equal(new Set(images.map(i => i.id)).size, 14);
  for (const image of images) {
    assert.equal(image.file, expected.get(image.id));
    assert.ok(image.size > 0);
    assert.equal(image.filter, 'none');
  }
}

async function back(page) {
  assert.equal(await page.evaluate(() => f6HandleAndroidBack()), 'handled');
}

async function checkProducts(page, width) {
  await page.evaluate(() => showPage('nutrition'));
  await page.locator('#nutrition [data-fp-action="go"][data-fp-params=\'["foodcatalog"]\']').click();
  const catalog = page.locator('#foodcatalog.active');
  await catalog.waitFor();
  await checkFit(page, '#foodcatalog.active');
  await capture(page, 'products', width);

  for (const source of ['favorites', 'recent', 'my', 'catalog']) {
    const tab = catalog.locator(`[data-food-tab="${source}"]`);
    await tab.click();
    assert.ok(await tab.evaluate(el => el.classList.contains('active')));
  }
  const chips = catalog.locator('#forgeFoodCats [data-food-category]');
  const categories = await chips.evaluateAll(nodes => nodes.map(el => el.dataset.foodCategory));
  const expected = await page.evaluate(() => ['Все', ...new Set(forgeOfflineFoods.map(forgeFoodCategoryLabel))]);
  assert.deepEqual([...categories].sort(), expected.sort());
  assert.ok(await chips.evaluateAll(nodes => nodes.every(el => el.scrollWidth <= el.clientWidth + 1)));
  for (const category of categories) {
    await catalog.locator('#forgeFoodCats').getByRole('button', {name:category, exact:true}).click();
    assert.equal(await catalog.locator('#forgeFoodCats [aria-pressed="true"]').getAttribute('data-food-category'), category);
    const count = await page.evaluate(category => forgeOfflineFoods.filter(food => category === 'Все' || forgeFoodCategoryLabel(food) === category).length, category);
    assert.match(await catalog.locator('#forgeFoodResultCount').innerText(), new RegExp(`\\b${count}\\b`));
  }
  await catalog.locator('#forgeFoodCategoryButton').click();
  const sheet = page.locator('#forgeFoodCategorySheet');
  assert.equal(await sheet.locator('[data-food-category]').count(), categories.length);
  await back(page);
  assert.equal(await page.locator('#modalback.show').count(), 0);
  await catalog.locator('#forgeFoodCategoryButton').click();
  await sheet.locator('[data-food-category="Все"]').click();

  const search = catalog.locator('#foodSearch');
  await search.fill('не найдено форж');
  await catalog.locator('#forgeFoodSearchClear').click();
  assert.equal(await search.inputValue(), '');
  await search.fill('Куриная грудка сырая');
  const results = catalog.locator('#foodSearchResults');
  assert.match(await results.innerText(), /Куриная грудка сырая/);
  await results.locator('.forge-star').first().click();
  await catalog.locator('[data-food-tab="favorites"]').click();
  assert.match(await results.innerText(), /Куриная грудка сырая/);
  await results.locator('.forge-plus').first().click();
  await page.locator('#forgeFoodGrams').fill('150');
  assert.match(await page.locator('#forgeFoodPreview').innerText(), /150 г/);
  await page.locator('#modalback [onclick="forgeAddFood()"]').click();
  assert.equal(await page.evaluate(() => state.foods.at(-1)?.grams), 150);
  await catalog.locator('[data-food-tab="recent"]').click();
  assert.match(await results.innerText(), /Куриная грудка сырая/);
  await back(page);
  await page.locator('#nutrition.active').waitFor();
}

async function checkPicker(page, width) {
  await page.evaluate(() => {showPage('plan'); showPage('library'); ForgeExerciseLibrary.showGroups()});
  await checkImages(page.locator('.vs-group-list'));
  await page.evaluate(() => showPage('plan'));
  await page.locator('#plan').getByRole('button', {name:'Создать программу', exact:true}).click();
  await page.locator('#n8ProgName').fill('Проверка редактора');
  await page.locator('#n8-program [onclick="n8EditProgramDay(-1)"]').click();
  const day = page.locator('#n8-day');
  const dayName = day.getByLabel('Название тренировки');
  await dayName.fill('Первый день');
  const openPicker = day.locator('[onclick="n8OpenPicker()"]');
  await openPicker.click();
  const picker = page.locator('#n8-picker.show');
  await checkImages(picker);
  await checkFit(page, '#n8-picker.show');
  await capture(page, 'picker', width);

  const cards = picker.locator('[data-picker-group]');
  const heights = await cards.evaluateAll(nodes => nodes.map(n => n.offsetHeight));
  assert.equal(new Set(heights).size, 1, 'group cards have a uniform height');
  for (const {id, file} of groups) {
    await picker.locator(`[data-picker-group="${id}"]`).click();
    await picker.locator('[data-picker-detail]').first().click();
    const detail = page.locator('#x7DetailBack.show');
    const art = detail.locator('img[data-art-type="MUSCLE_GROUP_ART"]');
    assert.equal(await art.getAttribute('src'), file);
    const contour = detail.locator('.forge-art-frames img').first();
    assert.ok(await contour.evaluate(async el => {await el.decode();return el.naturalWidth > 0 && el.src.endsWith('.svg')}));
    await back(page);
    await picker.locator('[data-picker-detail]').first().waitFor();
    await back(page);
    await picker.locator(`[data-picker-group="${id}"]`).waitFor();
  }
  await picker.locator('[data-picker-group="shoulders"]').click();
  const equipment = picker.locator('[data-picker-equipment]');
  await equipment.selectOption('Гантели');
  const query = picker.locator('[data-picker-query]');
  await query.fill('гантел');
  assert.ok(await picker.locator('.forge-picker-item-text small').evaluateAll(nodes => nodes.length > 0 && nodes.every(el => el.textContent.includes('Гантели'))));
  const openDetail = picker.locator('[data-picker-detail]').first();
  const scroll = await picker.evaluate(el => {el.scrollTop = 150; return el.scrollTop});
  const first = await openDetail.getAttribute('data-picker-detail');
  await picker.evaluate((el, name) => [...el.querySelectorAll('[data-picker-detail]')].find(button => button.dataset.pickerDetail === name).click(), first);
  await back(page);
  assert.equal(await query.inputValue(), 'гантел');
  assert.equal(await equipment.inputValue(), 'Гантели');
  assert.equal(await picker.evaluate(el => el.scrollTop), scroll);
  await openDetail.click();
  await page.locator('#x7DetailBack [data-vs-action="add"]').click();
  assert.equal(await dayName.inputValue(), 'Первый день');
  assert.deepEqual(await page.evaluate(() => ForgeEditorNavigation.snapshot().day.exercises), [first]);
  await openPicker.click();
  await picker.locator('[data-picker-query]').fill(first);
  assert.equal(await picker.locator('[data-picker-add]').first().isDisabled(), true);
  await back(page);
  await back(page);
  await day.getByRole('button', {name:/Сохранить день/}).click();
  await page.locator('#n8-program').getByRole('button', {name:/Сохранить программу/}).click();
  assert.ok(await page.evaluate(name => state.programs.some(p => p.name === 'Проверка редактора' && p.days.some(d => d.name === 'Первый день' && d.exercises.includes(name))), first));

  await page.evaluate(() => {
    state.active = {id:'catalog-test', date:today(), name:'Проверка тренировки', exercises:[]};
    forgeOpenExercisePicker('workout');
  });
  const workoutPicker = page.locator('#x7BrowserBack.show');
  await checkImages(workoutPicker);
  await back(page);
  await page.evaluate(() => {
    state.customExercises = Array.from({length:7}, (_, i) => 'Своё тестовое ' + i);
    forgeOpenExercisePicker('workout');
  });
  assert.match(await workoutPicker.locator('header').innerText(), /556 базовых.*7 своих/s);
  assert.equal(await page.evaluate(() => forgeRefreshCatalog().length), 563);
}

(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.FORGE_CHROMIUM ? {executablePath:process.env.FORGE_CHROMIUM} : {})});
  try {
    for (const width of widths) {
      const context = await browser.newContext({viewport:{width,height:844}, offline:true});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        const file = path.resolve(assets, decodeURIComponent(url.pathname.slice('/assets/'.length)));
        return url.origin === origin && url.pathname.startsWith('/assets/') && file.startsWith(assets+path.sep) && fs.existsSync(file)
          ? route.fulfill({path:file}) : route.abort();
      });
      await page.goto(origin+'/assets/index.html');
      await checkProducts(page, width);
      await checkPicker(page, width);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${width}px: offline products, categories, portion, program editor and all 14 muscle assets across library, program and workout`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1});
