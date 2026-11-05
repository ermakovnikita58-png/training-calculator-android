// The product catalog uses the same diary, favorites and portion dialog as the nutrition page.
const forgeFoodCategoryAliases = {
  'Мясо': 'Мясо и птица',
  'Рыба': 'Рыба и морепродукты',
  'Крупы': 'Крупы и макароны',
  'Овощи': 'Овощи и зелень',
  'Фрукты': 'Фрукты и ягоды',
  'Хлеб': 'Хлеб и выпечка',
  'Орехи': 'Бобовые, орехи и семена',
  'Масла': 'Масла, соусы и сладкое'
};
const forgeFoodTabs = ['catalog', 'favorites', 'recent', 'my', 'online'];
const forgeFoodBatchSize = 24;
let forgeFoodTab = 'catalog';
let forgeFoodCategory = 'Все';
let forgeFoodShown = [];
let forgeFoodLimit = forgeFoodBatchSize;
let forgeOnlineFoods = [];
let forgeOnlineQuery = '';
let forgeOnlineStatus = '';
let forgeOnlineTimer;
let forgeOnlineInFlight = 0;

function forgeFoodCategoryLabel(food) {
  if (food.cat === 'Яйца и молочные') {
    return /^(?:яйц|белок яйца|желток яйца)/.test(forgeClean(food.name)) ? 'Яйца' : 'Молочные продукты';
  }
  return forgeFoodCategoryAliases[food.cat] || food.cat || '';
}

const forgeFoodCategoryList = [...new Set([
  'Все', 'Мясо и птица', 'Рыба и морепродукты', 'Молочные продукты',
  'Крупы и макароны', 'Овощи и зелень', 'Фрукты и ягоды',
  ...forgeOfflineFoods.map(forgeFoodCategoryLabel)
])];

function forgeFoodCategoryButtons(fromSheet) {
  return forgeFoodCategoryList.map((category, index) => {
    const action = fromSheet ? 'forgeChooseFoodCategory' : 'forgeSetFoodCategory';
    return `<button type="button" data-food-category="${esc(category)}" aria-pressed="${forgeFoodCategory === category}" onclick="${action}(${index})">${esc(category)}</button>`;
  }).join('');
}

function forgeSetFoodCategory(index) {
  forgeFoodCategory = forgeFoodCategoryList[index] || 'Все';
  forgeFoodLimit = forgeFoodBatchSize;
  for (const button of $('forgeFoodCats').querySelectorAll('[data-food-category]')) {
    button.setAttribute('aria-pressed', button.dataset.foodCategory === forgeFoodCategory);
  }
  searchFoodDB();
}

function forgeOpenFoodCategories() {
  $('modalTitle').textContent = 'Категории продуктов';
  $('modalBody').innerHTML = `<div id="forgeFoodCategorySheet" role="group" aria-label="Категории продуктов">${forgeFoodCategoryButtons(true)}</div>`;
  $('modalback').classList.add('show');
}

function forgeChooseFoodCategory(index) {
  forgeSetFoodCategory(index);
  closeModal();
  const strip = $('forgeFoodCats');
  const selected = strip.querySelector('[aria-pressed="true"]');
  if (selected) {
    const left = selected.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollLeft += left - 2;
  }
  $('forgeFoodCategoryButton').focus({preventScroll: true});
}

function forgeSetFoodTab(tab) {
  if (!forgeFoodTabs.includes(tab)) return;
  if (forgeFoodTab === 'online' && tab !== 'online') {
    clearTimeout(forgeOnlineTimer);
    forgeOnlineInFlight++;
  }
  forgeFoodTab = tab;
  forgeFoodLimit = forgeFoodBatchSize;
  const source = tab === 'online' ? 'catalog' : tab;
  for (const button of document.querySelectorAll('[data-food-tab]')) {
    const active = button.dataset.foodTab === source;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  }
  $('forgeFoodCategoryControls').hidden = tab !== 'catalog';
  $('forgeFoodOnlineEntry').hidden = tab !== 'catalog';
  $('forgeFoodOnlineControls').hidden = tab !== 'online';
  searchFoodDB();
}

function forgeFoodKey(food) {
  return food.code ? 'barcode:' + food.code : 'name:' + forgeClean(food.name);
}

function forgeFavoriteFood(index) {
  const food = forgeFoodShown[index];
  if (!food) return;
  const favorite = state.forgeFavorites.findIndex(item => forgeFoodKey(item) === forgeFoodKey(food));
  if (favorite >= 0) state.forgeFavorites.splice(favorite, 1);
  else state.forgeFavorites.unshift(food);
  save();
  toast(favorite >= 0 ? 'Удалено из избранного' : 'Добавлено в избранное');
}

function forgeFoodRow(food, index) {
  const favorite = state.forgeFavorites.some(item => forgeFoodKey(item) === forgeFoodKey(food));
  const macros = `Б ${+Number(food.p).toFixed(1)} · Ж ${+Number(food.f).toFixed(1)} · У ${+Number(food.c).toFixed(1)} г`;
  return `<article class="food-catalog-result">
    <div>
      <h2>${esc(food.name)}</h2>
      <p>Порция 100 г · ${Math.round(food.cal)} ккал</p>
      <p>${macros}</p>
      <p>${[food.brand || forgeFoodCategoryLabel(food), food.source].filter(Boolean).map(esc).join(' · ')}</p>
    </div>
    <button type="button" class="forge-star" aria-label="Избранное: ${esc(food.name)}" aria-pressed="${favorite}" onclick="forgeFavoriteFood(${index})">${favorite ? '★' : '☆'}</button>
    <button type="button" class="forge-plus" aria-label="Добавить продукт: ${esc(food.name)}" onclick="forgePickFood(${index})">＋</button>
  </article>`;
}

function searchFoodDB() {
  const query = forgeClean($('foodSearch').value);
  $('forgeFoodSearchClear').hidden = !$('foodSearch').value;
  const sources = {
    catalog: forgeOfflineFoods,
    recent: state.forgeRecent,
    favorites: state.forgeFavorites,
    my: state.forgeCustomFoods,
    online: forgeOnlineQuery === query ? forgeOnlineFoods : []
  };
  const results = sources[forgeFoodTab].filter(food => {
    const category = forgeFoodCategoryLabel(food);
    const inCategory = forgeFoodTab !== 'catalog' || forgeFoodCategory === 'Все' || category === forgeFoodCategory;
    return inCategory && (!query || forgeFoodTab === 'online' ||
      forgeClean([food.name, food.brand, food.cat, category].join(' ')).includes(query));
  });
  if (forgeFoodTab === 'catalog' && query) {
    const prefix = food => Number(forgeClean(food.name).startsWith(query));
    results.sort((a, b) => prefix(b) - prefix(a));
  }
  forgeFoodShown = results.slice(0, forgeFoodLimit);
  const status = forgeFoodTab === 'online'
    ? (forgeOnlineQuery === query ? forgeOnlineStatus : '') || 'Для онлайн-поиска введи название товара.'
    : 'Ничего не найдено. Попробуй другой запрос или категорию.';
  $('forgeFoodResultCount').textContent = `${results.length} найдено`;
  $('foodSearchResults').innerHTML = (forgeFoodShown.map(forgeFoodRow).join('') ||
    `<p class="empty">${esc(status)}</p>`) +
    (results.length > forgeFoodLimit ? '<button type="button" class="fp-btn" onclick="forgeMoreFood()">Показать ещё</button>' : '');
}

function forgeMoreFood() {
  forgeFoodLimit += forgeFoodBatchSize;
  searchFoodDB();
}

function forgeFoodChange() {
  forgeFoodLimit = forgeFoodBatchSize;
  if (forgeFoodTab === 'online') {
    clearTimeout(forgeOnlineTimer);
    forgeOnlineInFlight++;
    forgeOnlineQuery = '';
    if ($('foodSearch').value.trim().length >= 3) {
      forgeOnlineTimer = setTimeout(forgeSearchOnline, 950);
    }
  }
  searchFoodDB();
}

function forgeClearFoodSearch() {
  const input = $('foodSearch');
  input.value = '';
  forgeFoodChange();
  input.focus();
}

function forgeOpenOnlineFoods() {
  forgeSetFoodTab('online');
  if ($('foodSearch').value.trim().length >= 3) forgeSearchOnline();
  else $('foodSearch').focus();
}

function forgeFoodObjectFromOpen(product) {
  const nutrients = product.nutriments || {};
  const name = product.product_name_ru || product.product_name || product.generic_name_ru || product.generic_name;
  const energy = nutrients['energy-kcal_100g'];
  const vals = [
    energy === undefined || energy === null || energy === '' ? Number(nutrients.energy_100g) / 4.184 || 0 : Number(energy),
    Number(nutrients.proteins_100g || 0),
    Number(nutrients.carbohydrates_100g || 0),
    Number(nutrients.fat_100g || 0)
  ];
  if (!name || vals.some(value => !Number.isFinite(value) || value < 0 || value > 9000) ||
      vals.every(value => value === 0)) return null;
  return {
    name: String(name).slice(0, 150), cal: Math.round(vals[0] * 10) / 10, p: vals[1], c: vals[2], f: vals[3],
    cat: 'Товары с упаковкой', brand: String(product.brands || '').slice(0, 90),
    code: String(product.code || ''), source: 'Open Food Facts'
  };
}

async function forgeSearchOnline() {
  const query = $('foodSearch').value.trim();
  if (query.length < 3) {
    toast('Введи минимум 3 символа');
    return;
  }
  if (forgeFoodTab !== 'online') return;
  clearTimeout(forgeOnlineTimer);
  const sequence = ++forgeOnlineInFlight;
  forgeOnlineQuery = forgeClean(query);
  forgeOnlineFoods = [];
  forgeOnlineStatus = 'Ищем товары и бренды…';
  forgeFoodLimit = forgeFoodBatchSize;
  searchFoodDB();
  try {
    const params = new URLSearchParams({
      search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '45',
      fields: 'code,product_name,product_name_ru,brands,nutriments,generic_name_ru,generic_name'
    });
    const response = await fetch('https://world.openfoodfacts.org/cgi/search.pl?' + params, {
      headers: {Accept: 'application/json'}
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const data = await response.json();
    if (sequence !== forgeOnlineInFlight) return;
    const unique = new Map();
    for (const product of data.products || []) {
      const food = forgeFoodObjectFromOpen(product);
      if (food && !unique.has(forgeFoodKey(food))) unique.set(forgeFoodKey(food), food);
    }
    forgeOnlineFoods = [...unique.values()];
    forgeOnlineStatus = 'Товары по этому запросу не найдены.';
  } catch {
    if (sequence !== forgeOnlineInFlight) return;
    forgeOnlineStatus = 'Онлайн-поиск недоступен. Можно продолжить в локальном каталоге.';
  }
  searchFoodDB();
}

function forgePickFood(index) {
  const food = forgeFoodShown[index];
  if (food) forgeOpenFoodModal(food);
}

$('forgeFoodCats').innerHTML = forgeFoodCategoryButtons(false);
searchFoodDB();
