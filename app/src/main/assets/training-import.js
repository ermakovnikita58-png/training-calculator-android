(function () {
  'use strict';

  const storageKey = 'forge_v2';
  const spaceProbeKey = 'forge_training_import_space_probe';
  const maxFileBytes = 8 * 1024 * 1024;
  const labels = {
    EXISTING_SYSTEM: 'Из каталога FORGE',
    EXISTING_CUSTOM: 'Моё упражнение',
    MATCHED_ALIAS: 'Подтверждённое соответствие',
    CREATED_CUSTOM: 'Создать моё упражнение',
    NEEDS_REVIEW: 'Нужно уточнить'
  };
  let session = null;
  let backupSequence = 0;

  const byId = id => document.getElementById(id);
  const isOpen = current => current === session &&
    byId('modalback').classList.contains('show') && !!byId('forgeTrainingImportRoot');

  function showMessage(message, error = false) {
    const el = byId('forgeTrainingImportStatus');
    if (el) {
      el.textContent = message;
      el.classList.toggle('training-import-error', error);
    }
  }

  function open() {
    const core = window.ForgeTrainingImportCore;
    if (!core) return toast('Импорт тренировок недоступен в этой сборке');
    session = {
      core,
      files: 0,
      parsed: null,
      plan: null,
      overrides: Object.create(null),
      editing: null,
      backup: 'none',
      backupId: 0
    };
    byId('modalTitle').textContent = 'Программы и тренировки';
    byId('modalBody').innerHTML = `<div id="forgeTrainingImportRoot" class="training-import">
      <label class="field training-import-file" for="forgeTrainingImportFiles">
        <span>Выбери файлы экспорта</span>
        <input id="forgeTrainingImportFiles" type="file" accept=".txt,.json,text/plain,application/json" multiple>
      </label>
      <p class="fp-caption">Подойдут TXT программ и истории или исходный JSON-пакет. Сопоставление и сохранение выполняются на устройстве.</p>
      <p id="forgeTrainingImportStatus" class="training-import-status" role="status"></p>
      <div id="forgeTrainingImportPreview" class="training-import-preview"></div>
      <button type="button" id="forgeTrainingImportCancel" class="fp-btn">Закрыть</button>
    </div>`;
    const root = byId('forgeTrainingImportRoot');
    root.addEventListener('input', event => event.stopPropagation());
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    byId('modalback').classList.add('show');
  }

  function cancel() {
    session = null;
    window.ForgeNavigation?.markSaved('modalback');
    closeModal();
  }

  async function readFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    try {
      return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
      return new TextDecoder('windows-1251').decode(bytes);
    }
  }

  async function readSelection(files) {
    const current = session;
    const generation = ++current.files;
    current.parsed = current.plan = null;
    current.editing = null;
    current.overrides = Object.create(null);
    current.backup = 'none';
    current.backupId = 0;
    drawPreview();
    if (!files.length) return showMessage('');
    if (files.length > 3 || files.reduce((sum, file) => sum + file.size, 0) > maxFileBytes) {
      return showMessage('Выбери до трёх файлов общим размером до 8 МБ.', true);
    }
    showMessage('Читаем выбранные файлы…');
    try {
      const inputs = await Promise.all(files.map(async file => ({
        name: file.name,
        text: await readFile(file)
      })));
      if (!isOpen(current) || current.files !== generation) return;
      current.parsed = current.core.parseFiles(inputs);
      current.original = JSON.stringify(state);
      current.persisted = localStorage.getItem(storageKey);
      current.catalog = Object.values(ForgeArtStandards.registry.exercises);
      refreshPlan(current);
      showMessage('');
    } catch (error) {
      if (isOpen(current) && current.files === generation) {
        current.parsed = current.plan = null;
        showMessage(error.message || 'Не удалось прочитать файлы.', true);
      }
    }
  }

  function refreshPlan(current) {
    current.plan = current.core.plan(current.parsed, JSON.parse(current.original), current.catalog, current.overrides);
    current.backup = 'none';
    current.backupId = 0;
    drawPreview();
  }

  function countRows(plan) {
    const byStatus = status => plan.mappings.filter(mapping => mapping.resolutionStatus === status).length;
    const counts = plan.counts;
    return [
      ['Программы', counts.programs],
      ['Тренировочные дни', counts.days],
      ['Упражнения в программах', counts.plannedExercises],
      ['Тренировки в истории', counts.workouts],
      ['Позиции в истории', counts.workoutExercises],
      ['Записанные подходы', counts.sets],
      ['Найдено в каталоге FORGE', byStatus('EXISTING_SYSTEM') + byStatus('MATCHED_ALIAS')],
      ['Найдено среди моих упражнений', byStatus('EXISTING_CUSTOM')],
      ['Новые мои упражнения', counts.customExercises],
      ['Нужно сверить', plan.unresolved.length],
      ['Повторы программ', counts.duplicatePrograms],
      ['Повторы тренировок', counts.duplicateWorkouts]
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value ?? 0}</dd></div>`).join('');
  }

  function mappingEditor(current, mapping) {
    const selected = Object.hasOwn(current.overrides, mapping.sourceName)
      ? current.overrides[mapping.sourceName] === null ? 'custom' : 'id:' + current.overrides[mapping.sourceName]
      : 'auto';
    const details = JSON.parse(current.original).customExerciseDetails || {};
    const candidates = current.plan.targets || [
      ...current.catalog,
      ...Object.entries(details).filter(([, detail]) => detail?.id).map(([name, detail]) => ({
        name, id: detail.id, group: 'Мои упражнения'
      }))
    ];
    const options = [
      {value: 'auto', label: 'Автоматическое сопоставление'},
      {value: 'custom', label: 'Сохранить как моё упражнение'},
      ...candidates.filter(item => item.id && item.name).slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(item => ({
        value: 'id:' + item.id,
        label: item.name + (item.group ? ' · ' + item.group : '')
      }))
    ];
    return `<label class="field" for="forgeTrainingImportOverride">
      <span>Соответствие для «${esc(mapping.sourceName)}»</span>
      <select id="forgeTrainingImportOverride">${options.map(option => `<option value="${esc(option.value)}"${option.value === selected ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select>
    </label>`;
  }

  function drawPreview() {
    const current = session;
    const host = byId('forgeTrainingImportPreview');
    if (!host || !current) return;
    const plan = current.plan;
    if (!plan) {
      host.replaceChildren();
      return;
    }
    const mappingOpen = !!host.querySelector('details')?.open || current.editing !== null;
    const warnings = [...current.parsed.warnings, ...plan.conflicts];
    const messages = warnings.map(warning =>
      `<li>${esc(typeof warning === 'string' ? warning : warning.message || warning.sourceName || 'Нужно уточнить соответствие')}</li>`).join('');
    const backupReady = current.backup === 'ready';
    const backupBusy = current.backup === 'saving';
    host.innerHTML = `<section class="fp-card training-import-summary">
      <h2>Предварительный просмотр</h2>
      <dl>${countRows(plan)}</dl>
      ${messages ? `<ul class="training-import-warnings">${messages}</ul>` : ''}
    </section>
    <details class="fp-card training-import-mapping" id="forgeTrainingImportMapping"${mappingOpen ? ' open' : ''}>
      <summary>Сопоставление упражнений</summary>
      <div class="training-import-list">${plan.mappings.map((mapping, index) => `<div class="training-import-match">
        <div class="training-import-match-row">
          <div><strong>${esc(mapping.sourceName)}</strong>
            <p class="fp-caption">${esc(labels[mapping.resolutionStatus] || 'Нужно уточнить')}${mapping.name && mapping.name !== mapping.sourceName ? ' · ' + esc(mapping.name) : ''}${mapping.needsReview ? ' · Техника требует уточнения' : ''}</p>
          </div>
          <button type="button" class="fp-btn" data-training-import-edit="${index}" aria-label="Изменить соответствие: ${esc(mapping.sourceName)}">Изменить</button>
        </div>
        ${mapping.sourceName === current.editing ? mappingEditor(current, mapping) : ''}
      </div>`).join('')}</div>
    </details>
    ${plan.canApply ? `<div class="training-import-actions">
      <button type="button" id="forgeTrainingImportBackup" class="fp-btn"${backupBusy ? ' disabled' : ''}>${backupBusy ? 'Сохраняем копию…' : 'Сохранить резервную копию'}</button>
      ${current.backup === 'downloaded' ? '<label class="training-import-confirm"><input id="forgeTrainingImportConfirm" type="checkbox"> Резервная копия сохранена</label>' : ''}
      ${backupReady ? '<p class="fp-caption">Резервная копия подготовлена для текущих данных.</p>' : ''}
      <button type="button" id="forgeTrainingImportApply" class="fp-btn primary"${backupReady ? '' : ' disabled'}>Импортировать</button>
    </div>` : '<p class="fp-caption">Проверь замечания или выбери другой экспорт. Уже импортированные записи пропускаются.</p>'}`;
  }

  function onChange(event) {
    if (event.target.id === 'forgeTrainingImportFiles') {
      readSelection([...event.target.files]);
    } else if (event.target.id === 'forgeTrainingImportOverride') {
      const value = event.target.value;
      if (value === 'auto') delete session.overrides[session.editing];
      else session.overrides[session.editing] = value === 'custom' ? null : value.slice(3);
      session.editing = null;
      try {
        refreshPlan(session);
        showMessage('');
      } catch (error) {
        session.plan = null;
        drawPreview();
        showMessage(error.message || 'Не удалось проверить соответствие.', true);
      }
    } else if (event.target.id === 'forgeTrainingImportConfirm') {
      if (session.backup === 'downloaded' && event.target.checked) {
        session.backup = 'ready';
        drawPreview();
      }
    }
  }

  function onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'forgeTrainingImportCancel') cancel();
    if (button.id === 'forgeTrainingImportBackup') prepareBackup();
    if (button.id === 'forgeTrainingImportApply') applyImport();
    if (button.dataset.trainingImportEdit !== undefined) {
      session.editing = session.plan.mappings[Number(button.dataset.trainingImportEdit)].sourceName;
      drawPreview();
      byId('forgeTrainingImportOverride').focus();
    }
  }

  function requireUnchanged(current) {
    if (JSON.stringify(state) !== current.original || localStorage.getItem(storageKey) !== current.persisted) {
      throw Error('Данные FORGE изменились. Выбери файлы заново и проверь обновлённый план.');
    }
  }

  function checkSpace(current) {
    const delta = JSON.stringify(current.plan.nextState).length - (current.persisted?.length || 0);
    if (delta <= 0) return;
    // Probe only the additional code units. The final write still handles quota failure atomically.
    try {
      localStorage.setItem(spaceProbeKey, ' '.repeat(delta + (current.persisted === null ? storageKey.length : 0)));
    } finally {
      localStorage.removeItem(spaceProbeKey);
    }
  }

  function prepareBackup() {
    const current = session;
    if (!current?.plan?.canApply || current.backup === 'saving') return;
    current.backup = 'none';
    showMessage('');
    try {
      requireUnchanged(current);
      checkSpace(current);
      const content = current.original;
      const filename = 'forge-before-training-import-' + today() + '.json';
      if (typeof window.AndroidBridge?.saveTrainingImportBackup === 'function') {
        const bytes = new TextEncoder().encode(content);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        }
        current.backup = 'saving';
        current.backupId = ++backupSequence;
        window.AndroidBridge.saveTrainingImportBackup(filename, btoa(binary), current.backupId);
      } else {
        const url = URL.createObjectURL(new Blob([content], {type: 'application/json'}));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        current.backup = 'downloaded';
        showMessage('Подтверди сохранение файла перед импортом.');
      }
    } catch (error) {
      current.backup = 'none';
      showMessage(error.name === 'QuotaExceededError'
        ? 'В локальном хранилище недостаточно места для импорта.'
        : error.message || 'Не удалось подготовить резервную копию.', true);
    }
    drawPreview();
  }

  function onBackupResult(requestId, saved) {
    const current = session;
    if (!current || !isOpen(current) || current.backup !== 'saving' || current.backupId !== requestId) return;
    current.backup = saved ? 'ready' : 'none';
    showMessage(saved ? 'Резервная копия сохранена.' : 'Сохранение копии отменено или завершилось ошибкой.', !saved);
    drawPreview();
  }

  function applyImport() {
    const current = session;
    if (!current?.plan?.canApply || current.backup !== 'ready') return;
    try {
      requireUnchanged(current);
      localStorage.setItem(storageKey, JSON.stringify(current.plan.nextState));
    } catch (error) {
      showMessage(error.name === 'QuotaExceededError'
        ? 'В локальном хранилище недостаточно места. Импорт отменён.'
        : error.message || 'Импорт отменён.', true);
      return;
    }
    // A failed setItem leaves both the prior localStorage value and live state intact.
    state = current.plan.nextState;
    cancel();
    try {
      renderAll();
      toast('Программы и тренировки импортированы');
    } catch (error) {
      console.error('Training import refresh failed', error);
      toast('Импорт сохранён. Открой раздел заново.');
    }
  }

  new MutationObserver(() => {
    if (session && !isOpen(session)) session = null;
  }).observe(byId('modalback'), {attributes: true, attributeFilter: ['class'], childList: true, subtree: true});

  window.ForgeTrainingImport = {open, onBackupResult};
})();
