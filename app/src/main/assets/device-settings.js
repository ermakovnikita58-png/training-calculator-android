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
    <div class="grid2" id="forge-checkpoint-actions" hidden>
      <button class="btn secondary small" type="button" data-device="save">Сделать копию на устройстве</button>
      <button class="btn secondary small" type="button" data-device="restore">Восстановить копию</button>
      <button class="btn secondary small" type="button" data-device="delete">Удалить копию</button>
    </div>`;
  settings.append(card);

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
        card.querySelector('[data-device="test-report"]').hidden = !(result.testReport && result.crash);
        if (result.notifications) window.ForgePerformance?.persist();
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
