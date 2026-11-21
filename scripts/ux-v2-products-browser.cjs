const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, openPage, scene } = require('./ux-v2-fixture.cjs');
const { inspect } = require('./ux-v2-geometry.cjs');

async function readableAndReachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  const geometry = await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { width: box.width, height: box.height, left: box.left, right: box.right,
      viewport: innerWidth, fits: element.scrollWidth <= element.clientWidth + 1,
      reached: top === element || element.contains(top), top: top?.outerHTML.slice(0,160), y: box.top };
  });
  assert.ok(geometry.width >= 48 && geometry.height >= 48 && geometry.left >= 0 &&
    geometry.right <= geometry.viewport + 1 && geometry.fits && geometry.reached, JSON.stringify(geometry));
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  try {
    for (const width of [320, 360, 375, 390, 412, 430, 480, 768]) {
      const { context, page } = await openPage(browser, { width, height: 844 }, path.resolve('app/src/main/assets'));
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const original = await page.evaluate(() => JSON.parse(localStorage.getItem('forge_v2')));
      await page.evaluate(() => showPage('nutrition'));
      await page.locator('#nutrition [data-fp-action="go"][data-fp-params=\'["foodcatalog"]\']').click();
      for (const source of ['favorites', 'recent', 'my', 'catalog']) {
        const button = page.locator('[data-food-tab="' + source + '"]');
        await readableAndReachable(button);
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
      }
      await readableAndReachable(page.locator('#forgeFoodCategoryButton'));
      await page.locator('#forgeFoodCategoryButton').click();
      const selected = page.locator('#forgeFoodCategorySheet [data-food-category="Рыба и морепродукты"]');
      await readableAndReachable(selected);
      await selected.click();
      assert.equal(await page.locator('#forgeFoodCategoryValue').innerText(), 'Рыба и морепродукты');
      assert.equal(await page.evaluate(() => forgeFoodShown.every(food => forgeFoodCategoryLabel(food) === 'Рыба и морепродукты')), true);
      await readableAndReachable(page.locator('#forgeFoodCategoryButton'));
      await page.reload();
      assert.equal(await page.locator('#forgeFoodCategoryValue').innerText(), 'Рыба и морепродукты');
      await page.locator('#forgeFoodCategoryButton').click();
      await page.locator('#forgeFoodCategorySheet [data-food-category="Все"]').click();
      await page.locator('#foodSearch').fill('Куриная грудка сырая');
      const favorite = page.locator('.food-catalog-result').first().locator('.forge-star');
      await favorite.click();
      await page.locator('[data-food-tab="favorites"]').click();
      await page.locator('#foodSearchResults .forge-plus').first().click();
      await readableAndReachable(page.locator('#modalback [onclick="forgeAddFood()"]'));
      await page.locator('#forgeFoodGrams').fill('150');
      await page.evaluate(() => f6HandleAndroidBack());
      assert.equal(await page.locator('#foodSearch').inputValue(), 'Куриная грудка сырая');
      assert.equal(await page.locator('[data-food-tab="favorites"]').getAttribute('aria-pressed'), 'true');
      await page.locator('#foodSearchResults .forge-plus').first().click();
      await page.locator('#forgeFoodGrams').fill('150');
      await page.locator('#modalback [onclick="forgeAddFood()"]').click();
      assert.equal(await page.evaluate(() => state.foods.at(-1).grams), 150);
      await page.reload();
      assert.equal(await page.evaluate(() => state.foods.at(-1).grams), 150);
      assert.equal(await page.locator('#foodSearch').inputValue(), 'Куриная грудка сырая');
      assert.equal(await page.locator('.food-catalog-result h2').first().innerText(), 'Куриная грудка сырая');
      for (const key of ['programs', 'plans', 'workouts', 'weights', 'customExercises', 'n10Recipes', 'mealTemplates', 'n8ExerciseNotes']) {
        assert.deepEqual(await page.evaluate(key => state[key], key), original[key], key + ' stays unchanged');
      }
      await page.locator('#forgeFoodMore summary').click();
      await page.locator('#forgeFoodOnlineEntry').click();
      assert.equal(await page.locator('#forgeFoodOnlineControls').isVisible(), true);
      await page.getByRole('button', { name: 'Локальный каталог', exact: true }).click();
      assert.deepEqual((await inspect(page)).issues, []);

      await scene(page, 'meals');
      const templatesBefore = await page.evaluate(() => structuredClone(state.mealTemplates));
      const mealsBefore = await page.evaluate(() => state.foods.length);
      await page.locator('#meals [onclick="applyMealTemplate(0)"]').click();
      assert.equal(await page.evaluate(() => state.foods.length), mealsBefore + 1);
      assert.deepEqual(await page.evaluate(() => state.mealTemplates), templatesBefore);
      await page.evaluate(() => forgeCommitDiary({ ...state, foods: [...state.foods, {
        id: 'ux-yesterday', date: '2026-11-15', name: 'Вчерашний приём пищи',
        grams: 150, cal: 180, protein: 15, fat: 4, carbs: 21
      }] }));
      await page.getByRole('button', { name: 'Вчерашний рацион', exact: false }).click();
      const repeated = await page.evaluate(() => state.foods.filter(food => food.name === 'Вчерашний приём пищи'));
      assert.equal(repeated.length, 2);
      assert.notEqual(repeated[0].id, repeated[1].id);
      assert.equal(repeated[1].date, '2026-11-16');
      await page.getByRole('button', { name: 'Сохранить рацион', exact: false }).click();
      await page.locator('#forgeMealName').fill('Рацион UX');
      await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click();
      assert.equal(await page.evaluate(() => state.mealTemplates.length), templatesBefore.length + 1);
      await page.reload();
      assert.equal(await page.evaluate(() => state.mealTemplates.at(-1).name), 'Рацион UX');

      await scene(page, 'recipes');
      await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
      await page.locator('#n10RecipeName').fill('Омлет после проверки');
      await page.getByRole('button', { name: 'Сохранить рецепт', exact: false }).click();
      assert.equal(await page.evaluate(() => state.n10Recipes[0].name), 'Омлет после проверки');
      const dialogs = [];
      const recordDialog = dialog => dialogs.push(dialog.message());
      page.on('dialog', recordDialog);
      await page.evaluate(() => f6HandleAndroidBack());
      page.off('dialog', recordDialog);
      assert.deepEqual(dialogs, [], 'A saved recipe must not trigger an unsaved-changes warning');
      await scene(page, 'recipes');
      await page.getByRole('button', { name: 'В дневник', exact: false }).click();
      assert.equal(await page.evaluate(() => state.foods.at(-1).name), 'Омлет после проверки');
      assert.equal(await page.evaluate(() => state.foods.at(-1).cal), 168);
      await page.reload();
      assert.equal(await page.evaluate(() => state.foods.at(-1).name), 'Омлет после проверки');

      await scene(page, 'workout');
      await page.locator('#workout .n8-setgrid input').first().fill('63.5');
      await page.evaluate(() => ForgeViewport.keyboard(true));
      assert.equal(await page.locator('.fp-workout-dock').isVisible(), false);
      const inlineLog = page.locator('#workout .n8-log').filter({ hasText: 'Записать текущий подход' });
      assert.equal(await inlineLog.isVisible(), true);
      await readableAndReachable(inlineLog);
      await inlineLog.click();
      assert.equal(await page.evaluate(() => state.active.exercises[0].sets[0].done), true);
      assert.equal(await page.evaluate(() => state.active.exercises[0].sets[0].weight), 63.5);
      await page.evaluate(() => ForgeViewport.keyboard(false));
      assert.equal(await page.locator('.fp-workout-dock').isVisible(), true);
      assert.deepEqual(errors, []);
      await context.close();
      console.log('PASS ' + width + 'px: A/B/C products, portion, favorites, category, retained state and accessible set save');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
