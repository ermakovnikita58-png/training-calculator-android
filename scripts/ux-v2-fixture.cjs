const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const origin = 'https://appassets.androidplatform.net';
const address = origin + '/assets/index.html';
const date = new Date('2026-11-16T12:00:00Z');

async function openPage(browser, viewport, assets) {
  const context = await browser.newContext({ viewport, locale: 'ru-RU', timezoneId: 'Asia/Yekaterinburg', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(date);
  page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? dialog.defaultValue() : undefined));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const file = path.resolve(assets, decodeURIComponent(url.pathname.replace(/^\/assets\//, '')));
    return url.origin === origin && file.startsWith(assets + path.sep) && fs.existsSync(file)
      ? route.fulfill({ path: file })
      : route.abort();
  });
  await page.goto(address);
  if (errors.length) throw new Error('Application initialization: ' + errors.join('; '));
  await page.evaluate(() => {
    const exercise = 'Жим штанги лёжа';
    const day = { day: 'ПН', name: 'Верх тела', focus: 'Грудь · Спина · Плечи',
      exercises: [exercise, 'Тяга верхнего блока', 'Жим гантелей сидя'],
      exerciseConfig: { [exercise]: { sets: 3, reps: 8, weight: 62.5 } } };
    const next = { ...state, profile: { ...state.profile, name: 'Алексей' },
      programs: [{ id: 'ux-program', name: 'Сила и выносливость', days: [day] }],
      currentProgram: 'ux-program', plans: [day, ...state.plans.slice(1)], active: null,
      workouts: [{ id: 'ux-workout', name: 'Верх тела', date: '2026-11-15', duration: 42,
        sets: [{ exercise, weight: 60, reps: 8, done: true }, { exercise: 'Тяга верхнего блока', weight: 50, reps: 10, done: true }] }],
      foods: [{ id: 'ux-food', date: today(), name: 'Овсяная каша', meal: 'Завтрак', grams: 200,
        cal: 306, protein: 10, fat: 6, carbs: 53 }],
      weights: [{ date: '2026-11-10', weight: 74.2 }, { date: today(), weight: 74 }],
      n10Recipes: [{ id: 'ux-recipe', name: 'Омлет с овощами', servings: 1,
        items: [{ name: 'Яйцо', grams: 120, cal: 140, protein: 12, fat: 10, carbs: 1 }] }],
      mealTemplates: [{ id: 'ux-meal', name: 'Завтрак', items: [{ name: 'Каша', grams: 200, cal: 306, protein: 10, fat: 6, carbs: 53 }] }],
      customExercises: ['Удержание кисти на блоке'],
      n8ExerciseNotes: { [exercise]: 'Контрольная заметка для проверки интерфейса' }
    };
    forgeCommitDiary(next);
    renderAll();
    showPage('home');
  });
  return { context, page, errors };
}

async function resetSurfaces(page) {
  await page.evaluate(() => {
    ForgeCycles.close();
    for (let i = 0; i < 6 && ForgeNavigation.inspect().overlay; i++) f6HandleAndroidBack();
    showPage('home');
  });
}

async function scene(page, name) {
  await resetSurfaces(page);
  await page.evaluate(name => {
    switch (name) {
      case 'home': return showPage('home');
      case 'products': return showPage('foodcatalog');
      case 'categories': showPage('foodcatalog'); return forgeOpenFoodCategories();
      case 'workout':
        if (!state.active) forgeCommitDiary({ ...state, active: { id: 'ux-active', name: 'Верх тела', date: today(),
          start: Date.now(), exercises: [{ name: 'Жим штанги лёжа', rest: 120,
            sets: [{ weight: 62.5, reps: 8, done: false }, { weight: 62.5, reps: 8, done: false }] }] } });
        showPage('workout'); return;
      case 'program': showPage('plan'); return n8OpenProgram('ux-program');
      case 'new-program': showPage('plan'); return n8NewProgram();
      case 'cycle': {
        const cycle = ForgeCycleModel.createCycle(state.programs[0], '2026-11-16', 'ux-cycle', '2027-01-10');
        for (const row of cycle.days.flatMap(day => day.rows)) {
          row.selected = true;
          cycle.bases[ForgeCycleModel.basisKey(row)] = { type: 'fiveRM', source: 'known', date: '2026-11-15', value: 70 };
        }
        cycle.stage = 2;
        forgeCommitDiary({ ...state, trainingCycles: [cycle] });
        showPage('plan');
        document.querySelector('#plan [data-fc="open"][data-id="ux-cycle"]')?.click();
        if (!ForgeCycles.isOpen()) {
          n8OpenProgram('ux-program');
          document.querySelector('#n8-program [data-fc="open"]')?.click();
        }
        return;
      }
      case 'exercise': showPage('library'); return y8OpenCard(encodeURIComponent('Жим штанги лёжа'), 'library');
      case 'statistics': return showPage('progress');
      case 'plan': return showPage('plan');
      case 'nutrition': return showPage('nutrition');
      case 'library': showPage('library'); return ForgeExerciseLibrary.showGroups();
      case 'group': showPage('library'); return ForgeExerciseLibrary.openGroup('Плечи');
      case 'meals': return showPage('meals');
      case 'recipes': showPage('nutrition'); return n10OpenRecipes();
      case 'recipe': showPage('nutrition'); return n10EditRecipe(0);
      case 'coach': showPage('nutrition'); return ForgeCoach.open();
      case 'profile': return showPage('profile');
      case 'account': return showPage('account');
      case 'portion': showPage('foodcatalog'); return forgeOpenFoodModal(forgeOfflineFoods[0]);
      case 'day': showPage('plan'); n8OpenProgram('ux-program'); return n8EditProgramDay(0);
      case 'picker': showPage('plan'); n8OpenProgram('ux-program'); n8EditProgramDay(0); return n8OpenPicker();
      case 'maxima': return showPage('cycles');
      case 'weight': showPage('progress'); return openModal('weight');
      case 'custom-food': showPage('foodcatalog'); return forgeNewCustomFood();
      default: throw Error('Unknown UX scene ' + name);
    }
  }, name);
  await page.evaluate(() => {
    document.activeElement?.blur();
    scrollTo(0, 0);
    for (const root of document.querySelectorAll('.n8-overlay.show,.n9-modal.show,#y8DetailBack.show,dialog[open]')) root.scrollTop = 0;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator('img').evaluateAll(images => Promise.all(images.filter(image => {
    const rect = image.getBoundingClientRect();
    return rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0;
  }).map(async image => { image.loading = 'eager'; await image.decode(); })));
}

module.exports = { chromium, openPage, scene, address, origin };
