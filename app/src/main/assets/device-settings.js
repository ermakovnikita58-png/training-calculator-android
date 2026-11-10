(() => {
  const bridge = window.AndroidBridge;
  const settings = document.getElementById('profile');
  if (!settings) return;

  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="cardtitle">Диагностика FORGE</h2>
    <p class="muted" id="forge-device-report"></p>
    <button class="btn secondary small" type="button" data-device="copy">Скопировать технический отчёт</button>
    <h2 class="cardtitle">Конфиденциальность и данные</h2>
    <p class="muted">Дневник хранится на устройстве. Облачная копия настраивается отдельно в разделе «Аккаунт». JSON можно сохранить для переноса на другой телефон.</p>
    <div id="forge-privacy-options" hidden>
      <p class="muted" id="forge-device-permissions"></p>
      <label class="setting"><span>Уведомлять о завершении отдыха</span><input type="checkbox" data-pref="notifications"></label>
      <label class="setting"><span>Отправлять события использования</span><input type="checkbox" data-pref="analytics"></label>
      <label class="setting"><span>Отправлять отчёты об ошибках</span><input type="checkbox" data-pref="crash"></label>
      <p class="muted">Дополнительные отчёты выключены по умолчанию. Аналитика считает только действия и не получает содержимое дневника. Для синхронизации используется отдельное согласие в разделе «Аккаунт».</p>
      <button class="btn secondary small" type="button" data-device="test-report" hidden>Отправить тест ошибки</button>
    </div>
    <div id="forge-health-options" hidden>
      <h2 class="cardtitle">Health Connect</h2>
      <p class="muted">Просмотр массы тела, шагов и активности за 7 дней. Тренировки и калории в FORGE остаются прежними. Массу можно отдельно добавить в дневник.</p>
      <p class="muted" id="forge-health-report" aria-live="polite"></p>
      <button class="btn secondary small" type="button" data-device="health-read">Разрешить и прочитать</button>
      <button class="btn secondary small" type="button" data-device="health-disconnect">Отключить</button>
      <button class="btn secondary small" type="button" data-device="health-weight" hidden>Добавить измерение массы</button>
    </div>
    <div class="grid2" id="forge-checkpoint-actions" hidden>
      <button class="btn secondary small" type="button" data-device="save">Сделать копию на устройстве</button>
      <button class="btn secondary small" type="button" data-device="restore">Восстановить копию</button>
      <button class="btn secondary small" type="button" data-device="delete">Удалить копию</button>
    </div>`;
  settings.append(card);

  let healthWeight = null;
  const healthReport = card.querySelector('#forge-health-report');
  const healthWeightButton = card.querySelector('[data-device="health-weight"]');
  let technicalReport = 'FORGE Training\nСреда: браузер\nДневник: локальное хранилище браузера';
  const report = card.querySelector('#forge-device-report');
  function showReport() { report.textContent = technicalReport.replaceAll('\n', ' · '); }
  showReport();

  window.ForgeDevice = {
    receive(result) {
      if (result.kind === 'preferences') {
        card.querySelector('#forge-device-permissions').textContent = 'Камера: ' + (result.camera ? 'разрешена' : 'разрешение не выдано');
        for (const field of card.querySelectorAll('[data-pref]')) {
          field.checked = result[field.dataset.pref];
          field.disabled = result[field.dataset.pref + 'Available'] === false;
        }
        card.querySelector('#forge-health-options').hidden = !result.healthAvailable;
        card.querySelector('[data-device="test-report"]').hidden = !(result.testReport && result.crash);
        if (result.notifications) window.ForgePerformance?.persist();
      } else if (result.kind === 'health' || result.kind === 'healthDisconnected') {
        healthWeight = result.ok ? result.weight ?? null : null;
        healthWeightButton.hidden = !healthWeight;
        const lines = [];
        if (healthWeight) lines.push(healthWeight.date + ' · ' + healthWeight.kg.toFixed(1) + ' кг');
        if (Number.isFinite(result.steps)) lines.push('Шаги за 7 дней: ' + result.steps);
        if (Number.isFinite(result.sessions)) lines.push('Периоды тренировок: ' + result.sessions + ' · ' + result.minutes + ' мин');
        if (result.truncated) lines.push('Показаны данные первой страницы');
        healthReport.textContent = lines.join(' · ') || (result.kind === 'healthDisconnected'
          ? 'Чтение отключено. Android отзовёт разрешения после выхода из приложения.'
          : 'Нет доступных данных. Проверь разрешения Health Connect и наличие записей.');
      } else if (result.kind === 'diagnostics') {
        technicalReport = Object.entries(result.details).map(([key, value]) => key + ': ' + value).join('\n');
        showReport();
      } else if (result.kind === 'saved') {
        toast(result.ok ? 'Копия сохранена на устройстве' : 'Не удалось сохранить копию');
      } else if (result.kind === 'deleted') {
        toast(result.ok ? 'Локальная копия удалена' : 'Не удалось удалить копию');
      } else if (result.kind === 'checkpoint') {
        if (!result.payload) return toast('Нет доступной проверенной копии');
        if (!confirm('Заменить текущий дневник локальной копией? Сначала экспортируй текущие данные в JSON.')) return;
        const file = new File([result.payload], 'forge-local.json', { type: 'application/json' });
        importData({ target: { files: [file], value: '' }, forgeRestoreConfirmed: true });
      }
    }
  };

  card.querySelector('#forge-privacy-options').hidden = !bridge?.preferences;
  const consent = { notifications: 'notificationConsent', analytics: 'analyticsConsent', crash: 'crashConsent' };
  card.addEventListener('change', event => {
    const key = consent[event.target.dataset.pref];
    if (key) bridge[key](event.target.checked);
  });
  card.querySelector('#forge-checkpoint-actions').hidden = !bridge?.checkpoint;
  card.addEventListener('click', async event => {
    switch (event.target.dataset.device) {
      case 'health-read': bridge.healthRead(); break;
      case 'health-disconnect': bridge.healthDisconnect(); break;
      case 'health-weight': {
        const item = healthWeight;
        if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || item.date > today() ||
            !Number.isFinite(item.kg) || item.kg <= 0 || item.kg > 700 || !item.id) break;
        if (state.weights.some(weight => weight.healthConnectId === item.id || weight.date === item.date)) {
          toast('На эту дату уже есть запись массы');
          break;
        }
        if (!confirm('Добавить в дневник ' + item.kg.toFixed(1) + ' кг за ' + item.date + '?')) break;
        const next = { ...state, weights: [...state.weights, { date: item.date, weight: item.kg, healthConnectId: item.id }] };
        try { localStorage.setItem('forge_v2', JSON.stringify(next)); }
        catch { toast('Не удалось сохранить массу'); break; }
        state = next;
        renderAll();
        toast('Измерение массы добавлено');
        break;
      }
      case 'test-report': bridge.diagnosticEvent('test_non_fatal'); break;
      case 'copy':
        try {
          await navigator.clipboard.writeText(technicalReport);
          toast('Технический отчёт скопирован');
        } catch { toast('Браузер не разрешил копирование') }
        break;
      case 'save': {
        const payload = localStorage.getItem('forge_v2');
        if (!payload) return toast('Сначала сохрани запись в дневнике');
        bridge.checkpoint(payload);
        break;
      }
      case 'restore': bridge.readCheckpoint(); break;
      case 'delete':
        if (confirm('Удалить резервную копию с этого устройства? Текущий дневник сохранится.')) bridge.deleteCheckpoint();
        break;
    }
  });
  bridge?.diagnostics?.();
  bridge?.preferences?.();
})();
