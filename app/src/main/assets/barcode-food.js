(function (root) {
  'use strict';
  function normalizeCode(value, format) {
    const code = String(value || '').trim();
    if (!/^(?:\d{8}|\d{12}|\d{13})$/.test(code)) return null;
    const valid = digits => {
      const sum = [...digits.slice(0, -1)].reverse().reduce((n, digit, i) => n + Number(digit) * (i % 2 ? 1 : 3), 0);
      return (10 - sum % 10) % 10 === Number(digits.at(-1));
    };
    if (format !== 'upc_e' && valid(code)) return code;
    if (format && format !== 'upc_e' || !/^[01]\d{7}$/.test(code)) return null;
    const [n, a, b, c, d, e, f, check] = code;
    const middle = f <= '2' ? a+b+f+'0000'+c+d+e :
      f === '3' ? a+b+c+'00000'+d+e :
      f === '4' ? a+b+c+d+'00000'+e : a+b+c+d+e+'0000'+f;
    const expanded = n + middle + check;
    return valid(expanded) ? expanded : null;
  }

  function amount(value) {
    const match = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|ml|cl|dl|g|l)\b/i.exec(String(value || ''));
    if (!match) return null;
    const numeric = Number(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    const multiplier = { kg: 1000, l: 1000, dl: 100, cl: 10 }[unit] || 1;
    return { value: numeric * multiplier, unit: unit === 'kg' || unit === 'g' ? 'g' : 'ml' };
  }

  function productFromOpen(product) {
    const name = String(product?.product_name_ru || product?.product_name || product?.generic_name_ru || product?.generic_name || '').trim();
    const packageSize = amount(product?.quantity) || amount(`${product?.product_quantity ?? ''} ${product?.product_quantity_unit ?? ''}`);
    const serving = amount(product?.serving_size);
    const unit = packageSize?.unit || serving?.unit;
    const n = product?.nutriments;
    if (!name || !unit || !n || (packageSize && serving && packageSize.unit !== serving.unit)) return null;
    function nutrient(key) {
      const raw = n[key];
      return raw == null || String(raw).trim() === '' ? NaN : Number(raw);
    }
    const kcal = nutrient('energy-kcal_100g');
    const cal = Number.isFinite(kcal) ? kcal : nutrient('energy-kj_100g') / 4.184;
    const p = nutrient('proteins_100g'), c = nutrient('carbohydrates_100g'), f = nutrient('fat_100g');
    if (![cal, p, c, f].every(x => Number.isFinite(x) && x >= 0) || cal > 950 ||
        [p, c, f].some(x => x > 100) || p + c + f > 105) return null;
    return {
      name: name.slice(0, 150), cal: Math.round(cal * 10) / 10, p, c, f,
      cat: 'Товары с упаковкой', brand: String(product.brands || '').slice(0, 90),
      code: String(product.code || ''), source: 'Open Food Facts', unit,
      packageSize: packageSize?.value, serving: serving?.value
    };
  }

  const api = { normalizeCode, productFromOpen };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.ForgeBarcode = api;

  let stream = null, interval = null, generation = 0, lookup = null;
  const modal = document.getElementById('modalback');
  const input = () => document.getElementById('manualBarcode');

  function stopCamera() {
    generation++;
    clearInterval(interval);
    interval = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  }

  async function scanWeb() {
    if (!root.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) return toast('Камера недоступна. Введи код вручную');
    stopCamera();
    const token = generation;
    try {
      const video = document.getElementById('scanVideo');
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const capture = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (token !== generation || !video?.isConnected) {
        capture.getTracks().forEach(track => track.stop());
        return;
      }
      stream = capture;
      video.hidden = false;
      video.srcObject = stream;
      await video.play();
      let busy = false;
      interval = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          const codes = await detector.detect(video);
          if (token !== generation || !video.isConnected) return;
          const match = codes.find(item => normalizeCode(item.rawValue, item.format));
          if (match) scanned(match.rawValue, match.format);
        } catch {} finally { busy = false; }
      }, 220);
    } catch {
      if (token === generation) { stopCamera(); toast('Камера недоступна. Введи код вручную'); }
    }
  }

  function open() {
    stopCamera();
    lookup?.abort();
    $('modalTitle').textContent = 'Сканирование штрихкода';
    $('modalBody').innerHTML = `
      <p class="muted">Поиск начинается в локальном каталоге. Для неизвестного кода FORGE запрашивает Open Food Facts.</p>
      <video id="scanVideo" autoplay playsinline hidden style="width:100%"></video>
      <button class="btn secondary full" type="button" id="forge-scan-camera">Открыть камеру</button>
      <div class="field"><label for="manualBarcode">Штрихкод EAN или UPC</label>
        <input id="manualBarcode" inputmode="numeric" maxlength="13" placeholder="4006381333931"></div>
      <button class="btn primary full" type="button" id="forge-scan-find">Найти продукт</button>
      <button class="btn ghost full" type="button" id="forge-scan-manual">Создать свой продукт</button>`;
    $('forge-scan-camera').onclick = () => root.AndroidBridge?.scanBarcode ? AndroidBridge.scanBarcode() : scanWeb();
    $('forge-scan-find').onclick = () => find(input()?.value);
    $('forge-scan-manual').onclick = () => { stopCamera(); lookup?.abort(); forgeNewCustomFood(); };
    modal.classList.add('show');
  }

  function scanned(code, format) {
    if (!input() || !modal.classList.contains('show')) return;
    stopCamera();
    window.ForgeAnalytics?.('barcode_scanned');
    input().value = code;
    return find(code, format);
  }

  async function find(raw, format) {
    const code = normalizeCode(raw, format);
    if (!code) return toast('Проверь цифры и контрольную цифру штрихкода');
    const anchor = input();
    if (!anchor) return;
    lookup?.abort();
    const controller = new AbortController();
    lookup = controller;
    const matches = (value) => {
      const normalized = normalizeCode(value);
      return normalized != null && normalized.padStart(13, '0') === code.padStart(13, '0');
    };
    const local = [state.forgeCustomFoods, state.forgeFavorites, state.forgeRecent, forgeOfflineFoods]
      .flatMap(rows => Array.isArray(rows) ? rows : []).find(food => matches(food.code || food.barcode));
    if (local) { forgeOpenFoodModal(local); return; }
    toast('Ищем продукт по штрихкоду…');
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const url = new URL('https://world.openfoodfacts.org/api/v2/product/' + code + '.json');
      url.searchParams.set('fields', 'code,product_name_ru,product_name,generic_name_ru,generic_name,brands,nutriments,quantity,product_quantity,product_quantity_unit,serving_size');
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw Error('product');
      const { product } = await response.json();
      const food = productFromOpen(product);
      if (!food || !matches(food.code)) throw Error('incomplete');
      if (lookup === controller && input() === anchor && modal.classList.contains('show')) forgeOpenFoodModal(food);
    } catch {
      if (lookup === controller && input() === anchor && modal.classList.contains('show')) {
        toast('Нет проверенных данных по коду. Можно добавить продукт вручную');
      }
    } finally { clearTimeout(timer); if (lookup === controller) lookup = null; }
  }

  new MutationObserver(() => {
    if (!modal.classList.contains('show') || !input()) { stopCamera(); lookup?.abort(); }
  }).observe(modal, { attributes: true, attributeFilter: ['class'], subtree: false });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
  root.openFoodScanner = open;
  root.closeScanner = () => { stopCamera(); lookup?.abort(); closeModal(); };
  root.lookupBarcode = find;
  api.scanned = scanned;
})(typeof window === 'undefined' ? globalThis : window);
