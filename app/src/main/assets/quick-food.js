(() => {
  'use strict';
  const M = window.ForgeProductCore;
  let destination = null;
  let options = [];
  let lastWrite = null;

  const button = (action, label, index) =>
    `<button type="button" class="fp-btn" data-quick-food="${action}"${index === undefined ? '' : ` data-index="${index}"`}>${esc(label)}</button>`;
  const mealSelect = meal => M.meals.map(name => `<option${name === meal ? ' selected' : ''}>${name}</option>`).join('');
  const quantity = food => food.milliliters || food.grams || '';
  const unit = food => food.milliliters ? 'мл' : 'г';
  const macroText = food => Math.round(Number(food.cal)) + ' ккал' + (quantity(food) ? ' · ' + quantity(food) + ' ' + unit(food) : '');
  const saveError = () => toast('Не удалось сохранить питание. Дневник остался без изменений.');

  function commit(entries, recent = []) {
    if (!entries.length || entries.some(entry => !entry)) return false;
    const fingerprint = JSON.stringify(entries.map(({ id, ...row }) => row));
    const now = performance.now();
    if (lastWrite?.fingerprint === fingerprint && now - lastWrite.at < 650 && lastAddition()) return false;
    const recentFoods = recent.reduce((items, food) => [food, ...items.filter(item =>
      forgeFoodKey(item) !== forgeFoodKey(food))], state.forgeRecent || []).slice(0, 50);
    const next = { ...state, foods: [...state.foods, ...entries], forgeRecent: recentFoods,
      quickFoodUndo: { date: today(), ids: entries.map(entry => entry.id) } };
    try { forgeCommitDiary(next); }
    catch { saveError(); return false; }
    lastWrite = { fingerprint, at: now };
    return true;
  }

  function lastAddition() {
    const receipt = state.quickFoodUndo;
    if (receipt?.date !== today() || !Array.isArray(receipt.ids) || !receipt.ids.length ||
      receipt.ids.some(id => typeof id !== 'string')) return null;
    const ids = new Set(receipt.ids);
    const rows = state.foods.filter(food => ids.has(food.id) && food.date === receipt.date);
    return rows.length === ids.size ? { ids, rows } : null;
  }

  function updateUndo() {
    const last = lastAddition();
    for (const container of document.querySelectorAll('[data-quick-food-undo]')) {
      container.hidden = !last;
      container.innerHTML = last
        ? button('undo', 'Отменить последнее добавление · ' + last.rows.length)
        : '';
    }
  }

  function undo() {
    const last = lastAddition();
    if (!last) return;
    const next = { ...state, foods: state.foods.filter(food => !last.rows.includes(food)) };
    delete next.quickFoodUndo;
    try { forgeCommitDiary(next); }
    catch { return saveError(); }
    lastWrite = null;
    renderAll();
    updateUndo();
    toast('Последнее добавление отменено');
  }

  function copy(entries, meal, keepMeals = false) {
    return commit(entries.map(entry => M.copyFood(entry, null,
      keepMeals && M.meals.includes(entry.meal) ? entry.meal : meal, today(), uid())));
  }

  function afterAdd(message, close = true) {
    if (close) {
      window.ForgeNavigation?.markSaved('modalback');
      closeModal();
    }
    renderAll();
    updateUndo();
    window.ForgeAnalytics?.('food_added');
    toast(message);
  }

  function open(meal = 'Завтрак') {
    if (!M.meals.includes(meal)) meal = M.meals[0];
    const { recent, frequent } = M.foodHistory(state.foods, today());
    options = [];
    const breakfast = M.previousMeal(state.foods, 'Завтрак', today(), true);
    const section = (label, rows) => rows.length
      ? `<details><summary>${label}</summary>${rows.map(({ food }) => {
        const id = options.push(food) - 1;
        return `<div class="fp-quick-food-row"><label>
          <input type="checkbox" data-food-choice="${id}" aria-label="Выбрать ${esc(food.name)}">
          <span><strong>${esc(food.name)}</strong><small>${esc(macroText(food))}</small></span>
        </label>${quantity(food) ? `<label><span class="fp-sr">Порция ${esc(food.name)}, ${unit(food)}</span><input type="number" inputmode="decimal" min="0.1" max="100000" step="any" data-food-amount="${id}" value="${esc(quantity(food))}"></label>` : ''}</div>`;
      }).join('')}</details>` : '';
    $('modalTitle').textContent = 'Быстро добавить еду';
    $('modalBody').innerHTML = `<div class="fp-quick-food" id="forgeQuickFood">
      <div class="fp-actions">${button('search', 'Поиск продуктов')}${button('scan', 'Штрихкод')}</div>
      <label class="field"><span>Приём пищи</span><select id="quickFoodMeal">${mealSelect(meal)}</select></label>
      <div class="fp-actions">
        ${breakfast.length ? button('breakfast', 'Повторить вчерашний завтрак · ' + breakfast.length) : ''}
        ${button('previous', 'Повторить предыдущий приём пищи')}
      </div>
      ${state.mealTemplates.length ? `<h3>Рационы</h3><div class="fp-actions">
        ${state.mealTemplates.map((item, i) => button('template', 'Добавить «' + item.name + '» · ' + item.items.length, i)).join('')}
      </div>` : ''}
      ${section('Недавно добавленные', recent)}${section('Часто используемые', frequent)}
      ${recent.length ? '<button type="button" class="btn primary full" data-quick-food="batch">Добавить выбранные продукты</button>' : ''}
      <div data-quick-food-undo hidden></div>
    </div>`;
    $('modalback').classList.add('show');
    updateUndo();
  }

  function addProduct(food, amount, meal) {
    const row = M.foodPortion(food, amount, meal, today(), uid());
    if (!row) return toast('Проверь размер порции и КБЖУ продукта');
    if (!commit([row], [food])) return;
    afterAdd('Добавлено: ' + food.name);
    return true;
  }

  function addPortionOptions() {
    const input = $('forgeFoodGrams');
    if (!input || $('forgePortionPresets')) return;
    input.insertAdjacentHTML('afterend', `<div id="forgePortionPresets" class="fp-actions" aria-label="Быстрый выбор порции">
      ${button('portion', '50', 50)}${button('portion', '100', 100)}${button('portion', '150', 150)}
    </div>`);
    if (destination) {
      $('forgeFoodMeal').value = destination;
      destination = null;
    }
  }

  function batch(panel, meal) {
    const selected = [...panel.querySelectorAll('[data-food-choice]:checked')]
      .map(input => Number(input.dataset.foodChoice));
    // One instance of each source row in the same batch, even if listed in both groups.
    const foods = new Set();
    const entries = [];
    for (const index of selected) {
      const food = options[index];
      if (foods.has(food)) continue;
      foods.add(food);
      const amount = panel.querySelector('[data-food-amount="' + index + '"]');
      entries.push(M.copyFood(food, amount ? amount.value : null, meal, today(), uid()));
    }
    if (!entries.length) return toast('Выбери продукты для добавления');
    if (entries.some(entry => !entry)) return toast('Проверь размер порции');
    if (commit(entries)) afterAdd('Добавлено продуктов: ' + entries.length);
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-quick-food]');
    if (!target || target.closest('[inert]')) return;
    const action = target.dataset.quickFood;
    if (event.detail > 1 && action !== 'portion') return;
    if (action === 'open') {
      window.ForgePerformance?.showToday();
      return window.forgeOpenQuickFood(target.dataset.meal);
    }
    if (action === 'undo') return undo();
    if (action === 'portion') {
      if ($('forgeFoodGrams')) {
        $('forgeFoodGrams').value = target.dataset.index;
        forgeUpdateFoodPreview();
      }
      return;
    }
    const panel = target.closest('#forgeQuickFood');
    if (!panel || !$('modalback').classList.contains('show')) return;
    const meal = $('quickFoodMeal').value;
    if (action === 'search' || action === 'scan') {
      destination = meal;
      window.ForgeNavigation?.markSaved('modalback');
      closeModal();
      if (action === 'search') showPage('foodcatalog');
      else openFoodScanner();
      return;
    }
    if (action === 'batch') return batch(panel, meal);
    if (action === 'template') {
      const template = state.mealTemplates[Number(target.dataset.index)];
      if (template && copy(template.items, meal, true)) afterAdd('Рацион добавлен');
      return;
    }
    const sourceMeal = action === 'breakfast' ? 'Завтрак' : meal;
    const items = M.previousMeal(state.foods, sourceMeal, today(), action === 'breakfast');
    if (!items.length) return toast('Нет предыдущих записей для этого приёма пищи');
    if (copy(items, sourceMeal)) afterAdd('Приём пищи добавлен · ' + items.length);
  });

  window.forgeOpenQuickFood = open;
  window.ForgeQuickFood = { open, addPortionOptions, addProduct, commit, copy, afterAdd, updateUndo, setDestination: meal => { destination = M.meals.includes(meal) ? meal : null; }, clearDestination: () => { destination = null; } };
})();
