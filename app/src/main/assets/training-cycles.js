(() => {
  'use strict';
  const M = ForgeCycleModel;
  const ARM_PROGRAM_TEMPLATES=[
   {id:'arm-luch',name:'Луч',day:'ПН',exercises:[
    'Пронатор в блоке через кисть',
    'Пронатор в блоке',
    'Подъём на луч',
    'Подтягивания',
    {name:'Статическое удержание на луч',unit:'seconds'},
    'Подъём через отведение',
    'Луч в блоке',
    'Сгибание с конусной ручкой',
    {name:'Разведение рук в стороны с гантелями стоя',catalogName:'Разведение гантелей в стороны стоя'},
    {name:'Разгибание на трицепс вниз на блоке используя канатную рукоять',catalogName:'Разгибание рук на блоке с канатом'},
   ]},
   {id:'arm-bok',name:'Бок',day:'СР',exercises:[
    'Бок с верхнего блока',
    'Бок с нижнего блока',
    {name:'Статика на бок в блоке',unit:'seconds'},
    'Отведение',
    'Подъём штанги на бицепс',
    'Пальцы в блоке с радиусной ручкой',
    'Тяга гантели в наклоне',
    'Жим штанги лёжа средним хватом',
    {name:'Разгибание на трицепс вниз на блоке используя канатную рукоять',catalogName:'Разгибание рук на блоке с канатом'},
    {name:'Разведение рук в стороны с гантелями стоя',catalogName:'Разведение гантелей в стороны стоя'},
   ]},
   {id:'arm-kist',name:'Кисть',day:'ПТ',exercises:['Сгибание с конусной ручкой']},
  ].map(template=>({...template,exercises:template.exercises.map(value=>typeof value==='string'?{name:value}:value)}));
  const $ = id => document.getElementById(id);
  const format = value => Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
  const labels = { trainingMax: 'тренировочный максимум', fiveRM: '5ПМ', oneRM: '1ПМ', estimatedOneRM: 'расчётный 1ПМ', hold: 'контрольное удержание' };
  const sourceLabels = { known: 'известный максимум', journal: 'журнал', measurement: 'стартовый замер' };
  const weekLabels = { work: 'Рабочая', deload: 'Разгрузка', heavy: 'Тяжёлая', taper: 'Подводка' };
  const stages = ['Выбрать упражнения', 'Стартовые замеры', 'План по неделям'];
  const pointer = 'forge_cycle_open_v1';
  const cycles = () => Array.isArray(state.trainingCycles) ? state.trainingCycles : [];
  const cycleById = id => cycles().find(cycle => cycle.id === id);
  const sessions = cycle => M.sessions(cycle, state.workouts, state.active);
  const nextSession = cycle => {
    const all = sessions(cycle);
    return all.find(item => item.state === 'started') || all.find(item => item.state === 'pending');
  };

  const dialog = document.createElement('dialog');
  dialog.id = 'forge-cycle';
  dialog.className = 'fc-dialog';
  dialog.setAttribute('aria-labelledby', 'fc-heading');
  dialog.innerHTML = '<div class="fc-panel"><header class="fc-header"><button type="button" class="btn secondary small" data-fc="back" aria-label="Назад">←</button><h2 id="fc-heading" tabindex="-1"></h2><button type="button" class="btn secondary small" data-fc="close" aria-label="Закрыть">×</button></header><div id="fc-body"></div></div>';
  document.body.append(dialog);
  const heading = $('fc-heading');
  const body = $('fc-body');
  let view = null;
  let origin = null;
  let editor = null;
  let settingsDraft = null;

  const button = (label, action, props = '', primary = false) =>
    '<button type="button" data-fc="' + action + '" ' + props + ' class="btn ' + (primary ? 'primary' : 'secondary') + '">' + label + '</button>';
  const card = content => '<section class="fc-card">' + content + '</section>';
  const option = (value, selected, label) =>
    '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  const field = (label, name, type, value, attrs = '') =>
    '<label class="fc-field"><span>' + label + '</span><input name="' + name + '" ' + attrs + ' type="' + type + '" value="' + esc(value ?? '') + '"></label>';
  const number = (label, name, value, integer, attrs = '') =>
    field(label, name, 'number', value, 'inputmode="' + (integer ? 'numeric' : 'decimal') + '" step="' + (integer ? '1' : 'any') + '" ' + attrs);
  const panel = (...items) => '<div class="fc-actions">' + items.join('') + '</div>';
  const pos = () => dialog.scrollTop;

  function remember(id) {
    try {
      if (id) localStorage.setItem(pointer, id);
      else localStorage.removeItem(pointer);
    } catch { /* The saved diary does not depend on this pointer. */ }
  }

  function show(page, scroll = 0) {
    if (!dialog.open) {
      origin = document.activeElement;
      dialog.showModal();
    }
    view = page;
    editor = null;
    settingsDraft = null;
    render();
    dialog.scrollTop = scroll;
    heading.focus({ preventScroll: true });
    window.ForgeNavigation?.notify();
  }

  function close() {
    remember(null);
    const wasOpen = dialog.open;
    view = null;
    editor = null;
    settingsDraft = null;
    if (wasOpen) dialog.close();
    if (origin?.isConnected) origin.focus({ preventScroll: true });
    if (wasOpen && $('n8-program')?.classList.contains('show')) window.ForgeCycleWorkout.repaintProgram();
    window.ForgeNavigation?.notify();
  }

  function commit(next, repaint = true) {
    try {
      forgeCommitDiary(next);
    } catch {
      toast('Не удалось сохранить изменения. Проверь свободное место на устройстве.');
      return false;
    }
    if (repaint) renderAll();
    return true;
  }

  function put(cycle) {
    if (!M.validCycle(cycle)) return false;
    const all = cycles().slice();
    const index = all.findIndex(item => item.id === cycle.id);
    if (index < 0) all.unshift(cycle);
    else all[index] = cycle;
    return commit({ ...state, trainingCycles: all });
  }

  function update(mutate) {
    const current = cycleById(view.id);
    if (!current) return false;
    const draft = structuredClone(current);
    mutate(draft);
    return put(draft);
  }

  function status(cycle) {
    const item = nextSession(cycle);
    return item ? 'Неделя ' + (item.week + 1) + ' из ' + cycle.weeks.length + ' · ' + item.date + ' · ' + item.day.name
      : 'Цикл завершён';
  }

  function programBlock(program, summaryOnly = false) {
    if (!program || program._new) return '';
    const cycle = cycles().find(item => M.includesProgram(item, program.id));
    if (summaryOnly) return cycle?.status === 'active' ? '<small class="fc-program-status">' + esc(status(cycle)) + '</small>' : '';
    const props = 'data-program="' + esc(program.id) + '"';
    if (!cycle) return program.days?.some(day => day.exercises?.length)
      ? card(button('Создать цикл', 'open', props, true)) : '';
    const nearest = cycle.status === 'active' && nextSession(cycle);
    return card('<strong>' + esc(cycle.status === 'draft' ? 'Черновик цикла' : status(cycle)) + '</strong>' +
      panel(nearest ? button('Начать тренировку', 'nearest', 'data-cycle="' + esc(cycle.id) + '"', true) : '',
        button(cycle.status === 'draft' ? 'Продолжить настройку' : 'Открыть цикл', 'open', props),
        cycle.status === 'active' && !nearest ? button('Создать цикл', 'new', props) : ''));
  }

  function openCycle(programId, newCycle = false) {
    if (window.ForgeNavigation?.allowCloseEditor() === false) return;
    const cycle = !newCycle && cycles().find(item => M.includesProgram(item, programId));
    if (!cycle) return show({ type: 'setup', programId, start: today(), end: M.addDays(today(), 55) });
    remember(cycle.id);
    show({ type: 'cycle', id: cycle.id });
  }

  function templateCards() {
    return ARM_PROGRAM_TEMPLATES.map((template, index) => card(
      '<h3>' + esc(template.name) + '</h3><p class="fc-muted">Армрестлинг · ' + template.exercises.length + ' упражнений</p>' +
      button('Открыть шаблон', 'template', 'data-index="' + index + '"'))).join('');
  }

  function templateRows(template) {
    const catalog = new Map(forgeRefreshCatalog().map(entry => [forgeClean(entry.name), entry.name]));
    return template.exercises.map(row => ({ ...row,
      matched: catalog.get(forgeClean(row.name)) || catalog.get(forgeClean(row.catalogName || '')),
    }));
  }

  function renderTemplate(index) {
    const template = ARM_PROGRAM_TEMPLATES[index];
    heading.textContent = template.name;
    const previous = state.programs.some(program => program.templateSource === template.id);
    body.innerHTML = card('<h3>День 1 · ' + template.day + '</h3><ol class="fc-facts">' +
      templateRows(template).map(row => '<li>' + esc(row.name) +
        (row.unit ? ' · удержание' : '') + (!row.matched ? ' · своё упражнение' : '') + '</li>').join('') + '</ol>' +
      '<p class="fc-muted">Подходы, нагрузка и повторы или секунды задаются в программе либо в плане цикла.</p>' +
      button(previous ? 'Открыть мою копию' : 'Добавить в мои программы', 'template-save', '', true));
  }

  function saveTemplate(index) {
    const template = ARM_PROGRAM_TEMPLATES[index];
    const previous = state.programs.find(program => program.templateSource === template.id);
    if (previous) { close(); return n8OpenProgram(previous.id); }
    const rows = templateRows(template);
    const customExercises = state.customExercises.slice();
    const customExerciseDetails = { ...state.customExerciseDetails };
    for (const row of rows) {
      if (!row.matched && !customExercises.includes(row.name)) {
        customExercises.push(row.name);
        customExerciseDetails[row.name] = {id: 'custom-' + uid(), group: 'Предплечья', equipment: 'Другое'};
      }
    }
    const exercises = rows.map(row => row.matched || row.name);
    const exerciseConfig = Object.fromEntries(rows.map((row, i) => [exercises[i],
      {sets:null, weight:null, ...(row.unit ? {unit:'seconds', seconds:null} : {reps:null})}]));
    const exerciseRefs = exercises.map(name => ({ exerciseId: customExerciseDetails[name]?.id || forgeExerciseId(name), sourceName: name }));
    const program = { id: uid(), name: template.name, templateSource: template.id,
      days: [{day: template.day, name: template.name, focus:'Армрестлинг', exercises, exerciseConfig, exerciseRefs}],
      progression: {enabled:false, step:2.5} };
    if (!commit({...state, customExercises, customExerciseDetails, programs:[...state.programs, program]})) return;
    window.ForgeAnalytics?.('program_created');
    close();
    n8OpenProgram(program.id);
  }
  function calendarBlock() {
    const entries = cycles().map(cycle => card('<strong>' + esc(cycle.name) + '</strong>' +
      '<p class="fc-muted">' + dateText(cycle.start) + ' – ' + dateText(M.endDate(cycle)) +
      ' · ' + (cycle.status === 'draft' ? 'Черновик' : esc(status(cycle))) + '</p>' +
      button('Открыть цикл', 'open-id', 'data-cycle="' + esc(cycle.id) + '"'))).join('');
    return '<section class="n8-surface"><div class="n8-row"><b class="n8-grow">Тренировочные циклы</b>' +
      button('Создать цикл', 'new', '', true) + '</div>' + entries + '</section>';
  }

  function nextAction() {
    return cycles().filter(cycle => cycle.status === 'active')
      .map(cycle => ({ cycle, session: nextSession(cycle) }))
      .filter(item => item.session).sort((a, b) => a.session.date.localeCompare(b.session.date))[0] || null;
  }

  function renderSetup() {
    const available = (state.programs || []).filter(program => program.days?.some(day => day.exercises?.length));
    heading.textContent = 'Создать цикл';
    body.innerHTML = card('<div class="fc-grid fc-settings-grid">' +
      field('Начало цикла', 'start', 'date', view.start) + field('Конец цикла', 'end', 'date', view.end) + '</div>' +
      '<p class="fc-muted" data-length aria-live="polite"></p>') +
      card('<label class="fc-field"><span>Модель нагрузки</span><select name="preset">' +
        Object.entries(M.presets).map(([id, preset]) => option(id, id === 'general', preset.label)).join('') +
        '</select></label><p class="fc-muted" data-preset-explanation aria-live="polite"></p>') +
      card('<h3>Программы</h3><p class="fc-muted">Выбери одну или несколько программ.</p>' +
        (available.length ? available.map(program => '<div class="fc-choice"><label><input type="checkbox" name="program" value="' +
          esc(program.id) + '"' + (program.id === view.programId ? ' checked' : '') + '><span>' + esc(program.name) +
          '<small>' + program.days.filter(day => day.exercises?.length).map(day => esc(day.day || day.name)).join(' · ') +
          '</small></span></label></div>').join('') : '<p class="fc-warning">Сначала добавь готовую программу или создай свою.</p>')) +
      '<p data-setup-error class="fc-warning" role="status"></p>' +
      panel(button('Далее', 'create', '', true), button('Отмена', 'close'));
    updateSetup();
  }

  function updateSetup() {
    const start = body.querySelector('[name="start"]').value;
    const end = body.querySelector('[name="end"]').value;
    const count = M.weekCount(start, end);
    body.querySelector('[data-length]').textContent = count ? 'Недель в плане: ' + count : 'Выбери период от одного дня до 52 недель.';
    body.querySelector('[data-preset-explanation]').textContent = M.presets[body.querySelector('[name="preset"]').value].description;
    body.querySelector('[data-fc="create"]').disabled = !count || !body.querySelector('[name="program"]:checked');
  }

  function create() {
    const selected = new Set([...body.querySelectorAll('[name="program"]:checked')].map(input => input.value));
    try {
      const cycle = M.createCycle(state.programs.filter(program => selected.has(program.id)),
        body.querySelector('[name="start"]').value, uid(), body.querySelector('[name="end"]').value,
        body.querySelector('[name="preset"]').value);
      if (!put(cycle)) return;
      remember(cycle.id);
      show({ type: 'cycle', id: cycle.id });
    } catch (error) { body.querySelector('[data-setup-error]').textContent = error.message; }
  }

  function stage(index) {
    if (!update(cycle => { cycle.stage = index; })) return;
    show(view);
  }

  function back() {
    if (!dialog.open) return false;
    if (editor) {
      editor = null;
      renderAt(pos());
    } else if (view?.returnTo) {
      show(view.returnTo);
    } else if (view?.type === 'cycle' && cycleById(view.id)?.stage > 0) {
      stage(cycleById(view.id).stage - 1);
    } else {
      close();
    }
    return true;
  }

  function selection(cycle) {
    return '<p class="fc-muted">Отметь упражнения с нагрузкой в процентах. Для остальных перенесём подходы, повторы и вес из программы.</p>' +
      cycle.days.map(day => card('<h3>' + esc(day.name) + '</h3><small class="fc-muted">' +
        esc([programName(cycle, day), M.weekdays[day.weekday]].filter(Boolean).join(' · ')) + '</small>' +
        day.rows.map(row => '<div class="fc-choice"><label><input type="checkbox" data-select="' + row.id + '"' +
          (row.selected ? ' checked' : '') + '><span>' + esc(row.name) + '<small>' +
          esc([volumeText(row.original), weightText(row.original.weight)].join(' · ')) + '</small></span></label>' +
          (row.selected ? '<label class="fc-separate"><input type="checkbox" data-separate="' + row.id +
            '"' + (row.separate ? ' checked' : '') + '> Независимый замер для этого дня или стороны</label>' : '') + '</div>').join(''))).join('');
  }

  function groups(cycle) {
    const bases = new Map();
    for (const day of cycle.days) {
      for (const row of day.rows) {
        if (!row.selected) continue;
        const key = M.basisKey(row);
        if (!bases.has(key)) bases.set(key, { row, days: [] });
        bases.get(key).days.push(day.name);
      }
    }
    return bases;
  }

  function summary(base) {
    const actual = base.type === 'hold' ? ' · ' + base.seconds + ' с' :
      base.weight === undefined ? '' : ' · ' + format(base.weight) + ' кг × ' + base.reps;
    const adapted = base.adjustedValue === undefined ? '' : ' · рабочая база ' + format(base.adjustedValue) + ' кг';
    const derived = base.origin ? ' · ' + format(base.origin.percent) + '% от ' + format(base.origin.value) +
      ' кг (' + labels[base.origin.type] + ')' : '';
    return labels[base.type] + ' · ' + format(base.value) + ' кг · ' + sourceLabels[base.source] + ' · ' + base.date + actual + derived + adapted;
  }

  function measurements(cycle) {
    const all = groups(cycle);
    if (!all.size) return card('<p>Все упражнения выполняются с обычным рабочим весом.</p>');
    return '<p class="fc-muted">Подтверди базу каждого выбранного упражнения.</p>' + [...all].map(([key, group]) => {
      const base = cycle.bases[key];
      return card('<h3>' + esc(group.row.name) + '</h3><p class="fc-muted">' + esc(group.days.join(' · ')) + '</p>' +
        '<p class="' + (base ? 'fc-base' : 'fc-warning') + '">' + (base ? esc(summary(base)) : 'Нужен подтверждённый замер') + '</p>' +
        (editor?.key === key ? baseForm(cycle, group, base) : button(base ? 'Изменить базу' : 'Задать базу', 'base-open', 'data-key="' + key + '"', !base)));
    }).join('');
  }

  function baseForm(cycle, group, base) {
    const source = editor.source;
    const hold = group.row.unit === 'seconds';
    const duration = M.durationKey(group.row);
    let inputs;
    if (source === 'journal') {
      editor.entries = M.journalSets(state.workouts, group.row, editor.key, cycle.id);
      inputs = editor.entries.length ? '<label class="fc-field"><span>Подход из журнала</span><select name="entry">' + option('', true, 'Выбери подход') +
        editor.entries.map((set, index) => option(String(index), false, set.name + ' · ' + set.date + ' · ' + format(set.weight) + ' кг × ' +
          set[duration] + (hold ? ' с' : ''))).join('') +
        '</select></label>' : '<p class="fc-warning">' + (hold ? 'Нет записанных удержаний с весом.' : 'Нет подходов для оценки (1–15 повторов с положительным весом).') + '</p>';
    } else {
      const previous = base?.source === source ? base : null;
      inputs = hold ? number('Контрольное удержание, с', 'seconds', previous?.seconds, true) :
        source === 'known' ? '<label class="fc-field"><span>Тип максимума</span><select name="type">' +
        M.types.filter(type => !['estimatedOneRM', 'hold'].includes(type)).map(type =>
          option(type, type === (previous?.origin?.type || previous?.type), labels[type])).join('') +
        '</select></label>' : number('Фактические повторы', 'reps', previous?.reps, true);
      inputs += number(source === 'known' ? 'Известный вес, кг' : 'Фактический вес, кг', 'weight',
        source === 'known' || hold ? previous?.origin?.value ?? previous?.value : previous?.weight, false) +
        field('Дата результата', 'date', 'date', previous?.date || today(), 'max="' + today() + '"');
    }
    return '<div class="fc-base-form">' + panel(...[['journal', 'Взять из журнала'], ['known', 'Ввести известный максимум'],
      ['measurement', 'Записать замер']].map(([key, label]) => button(label, 'base-source',
      'aria-pressed="' + (source === key) + '" data-source="' + key + '"', source === key))) +
      inputs + (hold ? '' : '<div class="fc-choice"><label><input type="checkbox" name="derive-tm"' +
        (base?.origin && base.source === source ? ' checked' : '') + '><span>Рассчитать тренировочный максимум от 1ПМ</span></label></div>' +
        number('Доля 1ПМ для тренировочного максимума, %', 'tm-percent', base?.origin?.percent || 90)) +
      '<p data-base-preview class="fc-base" aria-live="polite"></p>' +
      panel(button('Подтвердить базу', 'base-save', 'disabled', true), button('Отмена', 'base-cancel')) + '</div>';
  }

  function previewBasis() {
    const form = body.querySelector('.fc-base-form');
    if (!form || !editor) return null;
    const value = name => form.querySelector('[name="' + name + '"]')?.value;
    const estimate = window.ForgeCycleWorkout.estimate;
    const source = editor.source;
    const hold = groups(cycleById(view.id)).get(editor.key).row.unit === 'seconds';
    let base;
    if (source === 'journal') {
      const entry = value('entry');
      const set = entry && editor.entries[Number(entry)];
      base = set && (hold ? M.holdBasis(source, set.date, set.weight, set.seconds)
        : M.basisFromSet(source, set.date, set.weight, set.reps, estimate));
    } else if (hold) {
      base = M.holdBasis(source, value('date'), value('weight'), value('seconds'));
    } else if (source === 'measurement') {
      base = M.basisFromSet(source, value('date'), value('weight'), value('reps'), estimate);
    } else {
      base = { type: value('type'), date: value('date'), source, value: M.num(value('weight'), 0.001, M.limits.weight) };
    }
    const derive = form.querySelector('[name="derive-tm"]')?.checked;
    const percent = form.querySelector('[name="tm-percent"]');
    if (percent) percent.disabled = !derive;
    if (derive) base = M.trainingMaxFrom(base, value('tm-percent'));
    if (!base || base.date > today() || !M.validBasis(base)) base = null;
    form.querySelector('[data-fc="base-save"]').disabled = !base;
    form.querySelector('[data-base-preview]').textContent = base ? summary(base) +
      (base.type === 'estimatedOneRM' || base.origin?.type === 'estimatedOneRM' ? ' · оценка FORGE по формуле Эпли' : '') :
      derive ? 'Для расчёта нужны известный или оценочный 1ПМ и доля от 70 до 95%.' : 'Выбери или введи корректный результат.';
    return base;
  }

  function loadText(load) {
    if (load.percent === null) return weightText(load.weight);
    if (!load.basis) return 'Подтверди стартовый замер';
    if (!(load.weight > 0)) return 'Уменьши шаг округления или проверь базу';
    const kg = load.basis.adjustedValue ?? load.basis.value;
    return format(load.percent) + '% от ' + labels[load.basis.type] + ' · ' + format(kg) + ' кг → ' +
      format(load.raw) + ' кг до округления → ' + format(load.weight) + ' кг';
  }

  function dateText(value) {
    return value.split('-').reverse().join('.');
  }

  function weightText(weight) {
    return weight === null ? 'Вес не задан' : format(weight) + ' кг';
  }

  function durationText(set) {
    const key = M.durationKey(set);
    const amount = set[key];
    return amount === null || amount === undefined ? 'не задано' : amount + (key === 'seconds' ? ' с' : ' повт.');
  }

  function volumeText(load) {
    const count = load.sets === null ? 'Подходы не заданы' : load.sets + ' подх.';
    return count + ' × ' + durationText(load);
  }

  function programName(cycle, day) {
    return cycle.programs?.length > 1 ? cycle.programs.find(program => program.id === day.programId)?.name : '';
  }

  function settings(cycle) {
    const draft = settingsDraft || { ...cycle, end: M.endDate(cycle) };
    return '<details class="fc-card fc-settings"><summary>Настройки цикла</summary>' +
      '<div class="fc-grid fc-settings-grid">' +
      field('Начало цикла', 'start', 'date', draft.start) +
      field('Конец цикла', 'end', 'date', draft.end) +
      field('Дата соревнований', 'competition', 'date', draft.competition) +
      number('Шаг веса, кг', 'step', draft.step, false, 'min="0.01" max="100"') +
      '<label class="fc-field"><span>Режим прогрессии</span><select name="mode">' +
      option('fixed', draft.mode === 'fixed', 'Фиксированный') +
      option('flexible', draft.mode === 'flexible', 'Гибкий') + '</select></label></div>' +
      '<p class="fc-muted">Чтобы оставить время до соревнований, выбери более раннюю тяжёлую неделю и подводку в конце.</p>' +
      '<div class="fc-flex-options"' + (draft.mode === 'fixed' ? ' hidden' : '') + '>' +
      '<p class="fc-muted">Если все рабочие подходы выполнены, FORGE может предложить увеличить будущие веса. Для упражнения в каждом подходе нужен запас выше указанной цели или достаточно дополнительных повторов.</p>' +
      '<div class="fc-grid fc-settings-grid">' +
      number('Целевой запас (RIR)', 'targetRir', draft.targetRir, true) +
      number('Доп. повторы в подходе', 'extraReps', draft.extraReps, true) +
      number('Увеличение базы, %', 'increase', draft.increase, false) + '</div></div>' +
      '<p class="fc-warning" data-settings-error hidden role="status"></p>' +
      panel(button('Сохранить настройки', 'save-settings', '', true)) + '</details>';
  }

  function dayPlan(cycle, session) {
    const { day, week, key, date, snapshot, state: status, workout } = session;
    const captions = { pending: 'По плану', skipped: 'Пропущено', started: 'В процессе', done: 'Завершено' };
    const props = 'data-session="' + key + '"';
    const actions = {
      pending: (cycle.status === 'active' ? button('Начать тренировку', 'session-start', props, true) : '') +
        button('Перенести', 'session-move', props) + button('Отметить пропуск', 'session-skip', props),
      skipped: button('Вернуть в расписание', 'session-unskip', props),
      started: button('Продолжить тренировку', 'session-start', props, true),
      done: journalButton(workout),
    };
    return card('<div class="fc-day-title"><div><h3>' + esc(day.name) + '</h3><small class="fc-muted">' +
      esc([dateText(date), programName(cycle, day)].filter(Boolean).join(' · ')) + '</small></div><span class="fc-tag">' + captions[status] + '</span></div>' +
      (snapshot ? snapshot.rows.map(row => '<div class="fc-load"><strong>' + esc(row.name) + '</strong><p class="fc-muted">' +
        esc(volumeText(row)) + ' · ' + esc(loadText(row)) + '</p></div>').join('') : day.rows.map(row => {
        const load = M.plannedLoad(cycle, week, row);
        const duration = M.durationKey(row);
        return '<div class="fc-load" data-load="' + row.id + '"><strong>' + esc(row.name) + '</strong><div class="fc-grid">' +
          number('Подходы', 'sets', load.sets, true, 'min="1" max="30" placeholder="—" data-load-field') +
          number(duration === 'seconds' ? 'Удержание, с' : 'Повторы', duration, load[duration], true,
            'min="1" max="' + M.limits[duration] + '" placeholder="—" data-load-field') +
          (row.selected ? number('От базы, %', 'percent', load.percent, false, 'min="1" max="100" data-load-field')
            : number('Вес, кг', 'weight', load.weight, false, 'min="0" max="1500" placeholder="—" data-load-field')) +
          '</div><p class="fc-muted" data-load-summary>' + esc(loadText(load)) + '</p></div>';
      }).join('')) + panel(actions[status]));
  }

  function planning(cycle) {
    const plan = sessions(cycle);
    const week = cycle.week;
    const nearest = nextSession(cycle);
    const missing = M.readiness(cycle, plan);
    const missingBases = [...groups(cycle)].filter(([key]) => !cycle.bases[key]).map(([, group]) => group.row.name);
    const blocked = [...new Set([...missingBases, ...missing])];
    const weeks = Array.from({ length: cycle.weeks.length }, (_, index) => index);
    return (cycle.status === 'active' ? '<p class="fc-base">' + esc(status(cycle)) + '</p>' :
      '<p class="fc-muted">Подстрой пример под свою программу. Изменения сохраняются в черновике.</p>') +
      settings(cycle) + (cycle.competition ? '<p class="fc-muted">Соревнования · ' + dateText(cycle.competition) + '</p>' : '') +
      card('<div class="fc-week">' + button('←', 'week-prev', 'aria-label="Предыдущая неделя"' + (week === 0 ? ' disabled' : '')) +
        '<label class="fc-field"><span>Неделя плана</span><select name="week">' +
        weeks.map(index => option(String(index), index === week, 'Неделя ' + (index + 1) + ' из ' + weeks.length)).join('') + '</select></label>' +
        button('→', 'week-next', 'aria-label="Следующая неделя"' + (week === weeks.length - 1 ? ' disabled' : '')) + '</div>' +
        '<label class="fc-field"><span>Тип недели</span><select name="kind">' + option('', cycle.weeks[week].kind === null, 'По шаблону · ' + weekLabels[M.weekKind(cycle, week)]) +
        M.kinds.map(kind => option(kind, kind === cycle.weeks[week].kind, weekLabels[kind])).join('') + '</select></label>' +
        (weeks.length > 1 ? '<div class="fc-copy"><label class="fc-field"><span>Скопировать настройки в</span><select name="copy-to">' +
          weeks.filter(index => index !== week).map(index => option(String(index), index === week + 1, 'Неделя ' + (index + 1))).join('') +
          '</select></label>' + button('Копировать', 'copy-week') + '</div>' : '')) +
      plan.filter(item => item.week === week).map(item => dayPlan(cycle, item)).join('') +
      '<p class="fc-warning" data-readiness' + (blocked.length ? '' : ' hidden') + '>Проверь базу и рассчитанный вес: ' + esc(blocked.join(', ')) + '</p>' +
      panel(cycle.status === 'draft' ? button('Запустить цикл', 'activate', blocked.length || !nearest ? 'disabled' : '', true)
        : nearest ? button('Начать ближайшую тренировку', 'session-start', 'data-session="' + nearest.key + '"', true) : '',
      button(cycle.status === 'draft' ? 'Сохранить черновик' : 'Готово', 'close'));
  }

  function renderAt(scroll = pos()) {
    const settingsOpen = body.querySelector('.fc-settings')?.open;
    render();
    if (settingsOpen && body.querySelector('.fc-settings')) body.querySelector('.fc-settings').open = true;
    dialog.scrollTop = scroll;
  }

  function render() {
    if (view?.type === 'setup') return renderSetup();
    if (view?.type === 'workout') return renderJournal(view.workoutId);
    if (view?.type === 'template') return renderTemplate(view.index);
    const cycle = cycleById(view?.id);
    if (!cycle) return close();
    if (view.type === 'move') {
      const item = sessions(cycle).find(session => session.key === view.key);
      if (!item || item.state !== 'pending') return show(view.returnTo);
      heading.textContent = 'Перенести тренировку';
      body.innerHTML = card('<h3>' + esc(item.day.name) + '</h3>' +
        field('Новая дата', 'move-date', 'date', item.date, 'min="' + cycle.start + '" max="' + M.endDate(cycle) + '"') +
        '<p class="fc-muted">Дата соревнований и номер недели останутся прежними.</p>' +
        panel(button('Сохранить дату', 'save-move', '', true), button('Отмена', 'back')));
      return;
    }
    heading.textContent = stages[cycle.stage];
    body.innerHTML = '<p class="fc-step">' + esc(cycle.name) + ' · ' + dateText(cycle.start) + ' – ' + dateText(M.endDate(cycle)) +
      ' · Шаг ' + (cycle.stage + 1) + ' из 3</p>' +
      (cycle.preset ? '<p class="fc-muted"><b>' + M.presets[cycle.preset].label + '</b> · ' + M.presets[cycle.preset].description + '</p>' : '') +
      [selection, measurements, planning][cycle.stage](cycle) +
      (cycle.stage !== 2 ? panel(button('Далее', 'next', '', true), button('Сохранить черновик', 'close')) : '');
    previewBasis();
  }

  function saveSettings() {
    const settings = body.querySelector('.fc-settings');
    const read = name => settings.querySelector('[name="' + name + '"]').value;
    const start = read('start'), end = read('end'), competition = read('competition');
    const length = M.weekCount(start, end);
    const step = M.num(read('step'), 0.01, M.limits.step);
    const mode = read('mode');
    const targetRir = M.num(read('targetRir'), 0, 10, true);
    const extraReps = M.num(read('extraReps'), 1, 10, true);
    const increase = M.num(read('increase'), 0.5, 10);
    const cycle = cycleById(view.id);
    const report = message => {
      const target = settings.querySelector('[data-settings-error]');
      target.hidden = false;
      target.textContent = message;
    };
    if (!length ||
      (competition && (!M.dateOK(competition) || competition < start))) {
      return report('Выбери период до 52 недель и укажи дату соревнований не раньше старта.');
    }
    if ([step, targetRir, extraReps, increase].includes(null)) {
      return report('Шаг веса: 0,01–100 кг. Запас: 0–10. Дополнительные повторы: 1–10. Повышение: 0,5–10%.');
    }
    const shortened = sessions(cycle).some(item => ['started', 'done'].includes(item.state) &&
      (item.week >= length || item.date < start || item.date > end));
    if (shortened) return report('Сохрани в диапазоне уже начатые и завершённые занятия.');
    if (length < cycle.weeks.length && !confirm('Удалить настройки последних недель?')) return;
    if (!update(draft => {
      Object.assign(draft, { start, end, competition, step, mode, targetRir, extraReps, increase });
      draft.weeks = Array.from({ length }, (_, i) => draft.weeks[i] || { kind: null, loads: {} });
      draft.week = Math.min(draft.week, length - 1);
      for (const [key, entry] of Object.entries(draft.schedule)) {
        if (Number(key.split(':')[0]) >= length) delete draft.schedule[key];
        else if (entry.date && (entry.date < start || entry.date > end)) delete entry.date;
      }
    })) return;
    renderAt();
    settingsDraft = null;
    renderAt();
    body.querySelector('.fc-settings').open = false;
    toast('Настройки цикла сохранены');
  }

  function copyWeek(cycle) {
    const target = Number(body.querySelector('[name="copy-to"]').value);
    if (target === cycle.week || !cycle.weeks[target]) return;
    if (sessions(cycle).some(item => item.week === target && ['started', 'done'].includes(item.state))) {
      return toast('На выбранной неделе уже есть начатые занятия. Будущие дни можно отредактировать отдельно.');
    }
    if (!confirm('Скопировать план в неделю ' + (target + 1) + ' с заменой её настроек?')) return;
    if (update(draft => {
      const loads = {};
      for (const day of cycle.days) {
        for (const row of day.rows) {
          const plan = M.plannedLoad(cycle, cycle.week, row);
          const duration = M.durationKey(row);
          const fields = ['sets', duration, row.selected ? 'percent' : 'weight'];
          loads[row.id] = Object.fromEntries(fields.filter(key => plan[key] !== null).map(key => [key, plan[key]]));
        }
      }
      draft.weeks[target] = { kind: M.weekKind(cycle, cycle.week), loads };
      draft.week = target;
    })) renderAt();
  }

  function findWorkout(id) {
    return state.workouts.find(workout => workout.id === id && workout.trainingCycle);
  }

  function journalButton(workout) {
    return workout?.trainingCycle ? button('План и факт', 'journal', 'data-workout="' + esc(workout.id) + '"') : '';
  }

  function adjustments(cycle, workout) {
    if (!cycle || workout.cycleAdjustment) return [];
    const plan = sessions(cycle);
    const date = workout.date.slice(0, 10);
    // Once a later session has started, an older result cannot trigger another increase.
    if (plan.some(item => item.snapshot && item.key !== M.sessionKey(workout.trainingCycle.week, workout.trainingCycle.dayId) &&
      (item.workout?.start ?? state.active?.start ?? 0) > workout.start)) return [];
    return M.progress(cycle, workout, plan, date);
  }

  function renderJournal(id) {
    const workout = findWorkout(id);
    if (!workout) return close();
    const plan = workout.trainingCycle;
    const cycle = cycleById(plan.cycleId);
    heading.textContent = 'План и факт';
    const facts = (sets, noSets = 'Подходы не отмечены') => sets.length ?
      '<ul class="fc-facts">' + sets.map(set => '<li>' + esc(weightText(set.weight) + ' × ' + durationText(set)) +
        (set.rir === undefined ? '' : ' · запас ' + set.rir) + '</li>').join('') + '</ul>' : '<p>' + noSets + '</p>';
    const extra = workout.sets.filter(set => !plan.rows.some(row => row.rowId === set.cycleRowId));
    const proposals = adjustments(cycle, workout);
    const result = workout.cycleAdjustment === 'accepted' ? 'Изменение применено к будущим занятиям.' :
      workout.cycleAdjustment === 'declined' ? 'Предложение отклонено. Будущие веса остались прежними.' : '';
    body.innerHTML = '<p class="fc-step">' + esc(plan.name) + ' · Неделя ' + (plan.week + 1) + '</p>' +
      card('<h3>' + esc(plan.dayName) + '</h3><p>План · ' + dateText(plan.date) +
        '<br>Фактически · ' + dateText(workout.date.slice(0, 10)) + '</p>') +
      plan.rows.map(row => card('<h3>' + esc(row.name) + '</h3><div class="fc-compare"><div><b>План</b><p>' +
        esc(volumeText(row) + ' · ' + loadText(row)) + '</p></div><div><b>Факт</b>' +
        facts(workout.sets.filter(set => set.cycleRowId === row.rowId)) + '</div></div>')).join('') +
      (extra.length ? card('<h3>Дополнительные упражнения</h3>' + extra.map(set => '<p>' + esc(set.exercise) + ' · ' +
        esc(weightText(set.weight) + ' × ' + durationText(set)) + '</p>').join('')) : '') +
      (result ? card('<p>' + result + '</p>') : '') +
      (proposals.length ? card('<h3>Предложение гибкого режима</h3><p>' + (cycle.preset ?
        'Текущие подходы выполнены с нужным запасом, и есть сопоставимый результат в журнале цикла.' :
        'Рабочие подходы выполнены с нужным запасом или дополнительными повторами.') +
        ' Посмотри, как изменятся веса следующих занятий.</p>' +
        proposals.map(change => '<details><summary>' + esc(change.name) + ' · база ' + format(change.before) + ' → ' +
          format(change.base.adjustedValue) + ' кг</summary><ul class="fc-facts">' + change.previews.map(item =>
            '<li>' + dateText(item.date) + ' · ' + esc(item.name) + ' · ' + format(item.from) + ' → ' + format(item.to) + ' кг</li>').join('') +
          '</ul></details>').join('') + panel(button('Применить к будущим занятиям', 'adjust-yes', '', true),
          button('Оставить текущий план', 'adjust-no'))) : '') +
      panel(button('Готово', 'back'));
  }

  function adjust(accept) {
    const workout = findWorkout(view.workoutId);
    const cycle = cycleById(workout?.trainingCycle.cycleId);
    const changes = workout ? adjustments(cycle, workout) : [];
    if (!changes.length) return renderAt();
    const next = {
      ...state,
      workouts: state.workouts.map(item => item === workout ? { ...item, cycleAdjustment: accept ? 'accepted' : 'declined' } : item),
    };
    if (accept) next.trainingCycles = cycles().map(item => item === cycle ? {
      ...item, bases: { ...cycle.bases, ...Object.fromEntries(changes.map(change => [change.key, change.base])) },
    } : item);
    if (commit(next)) renderAt();
  }

  function startSession(cycle, item) {
    if (!item || !['pending', 'started'].includes(item.state) || cycle.status !== 'active') return;
    if (item.state === 'pending') {
      if (state.active) return toast('Сначала заверши текущую тренировку.');
      const missing = M.readiness(cycle, [item]);
      if (missing.length) return toast('Проверь базу и вес: ' + missing.join(', '));
      const snapshot = M.snapshot(cycle, item);
      const active = {
        id: uid(), name: item.day.name, date: today(), start: Date.now(), sets: [], trainingCycle: snapshot,
        exercises: snapshot.rows.map((row, index) => ({
          name: row.name, cycleRowId: row.rowId, ...(row.exerciseId ? { exerciseId: row.exerciseId } : {}),
          ...(row.unit ? { unit: row.unit } : {}),
          ...(item.day.rows[index].rest ? { rest: item.day.rows[index].rest } : {}),
          sets: Array.from({ length: row.sets ?? 1 }, () => ({
            weight: row.weight, [M.durationKey(row)]: row[M.durationKey(row)],
            ...(row.unit ? { unit: row.unit, reps: 0 } : {}), done: false })),
        })),
      };
      if (!commit({ ...state, active, activeNote: '' })) return;
      window.ForgeCycleWorkout.reset();
      window.ForgeAnalytics?.('workout_started');
    }
    close();
    n8CloseOverlay();
    showPage('workout');
    window.scrollTo(0, 0);
  }

  function finish(active) {
    const workout = forgeWorkoutRecord(active);
    delete workout.cycleRestUntil;
    if (!commit({ ...state, active: null, activeNote: '', workouts: [workout, ...state.workouts] })) return;
    window.ForgeCycleWorkout.reset();
    window.ForgeAnalytics?.('workout_completed');
    showPage('progress');
    window.scrollTo(0, 0);
    show({ type: 'workout', workoutId: workout.id });
  }

  function editSet(ei, si, key, value) {
    const active = structuredClone(state.active);
    const set = active?.exercises[ei]?.sets[si];
    if (!set) return;
    if (key === 'rir' && value === '') delete set.rir;
    else {
      const max = { weight: M.limits.weight, reps: M.limits.reps, seconds: M.limits.seconds, rir: 10 }[key];
      const parsed = M.num(value, 0, max, key !== 'weight');
      if (value !== '' && parsed === null) return toast('Проверь значение в подходе');
      if (value === '' && set.done) {
        toast('Сними отметку подхода, чтобы очистить значение.');
        return false;
      }
      set[key] = parsed;
    }
    return commit({ ...state, active }, false);
  }

  function selectWeek(index) {
    if (update(cycle => { cycle.week = index; })) renderAt();
  }

  function updateLoad(input) {
    const container = input.closest('[data-load]');
    const cycle = cycleById(view.id);
    const row = cycle.days.flatMap(day => day.rows).find(item => item.id === container.dataset.load);
    const original = M.plannedLoad(cycle, cycle.week, row);
    const clear = input.value === '' && input.name !== 'percent';
    const next = M.num(input.value, Number(input.min), Number(input.max), input.step === '1');
    if (next === null && !clear) {
      toast('Допустимое значение: ' + input.min + '–' + input.max);
      input.value = original[input.name];
      return;
    }
    if (next === original[input.name]) return;
    if (!update(draft => {
      const loads = draft.weeks[draft.week].loads;
      const change = { ...loads[row.id] };
      if (clear) delete change[input.name];
      else change[input.name] = next;
      loads[row.id] = change;
    })) {
      input.value = original[input.name];
      return;
    }
    const saved = cycleById(view.id);
    const plan = M.plannedLoad(saved, saved.week, row);
    input.value = plan[input.name] ?? '';
    container.querySelector('[data-load-summary]').textContent = loadText(plan);
    const blocked = M.readiness(saved, sessions(saved));
    const warning = body.querySelector('[data-readiness]');
    warning.hidden = !blocked.length;
    warning.textContent = blocked.length ? 'Проверь базу и рассчитанный вес: ' + blocked.join(', ') : '';
    const activate = body.querySelector('[data-fc="activate"]');
    if (activate) activate.disabled = blocked.length > 0 || !nextSession(saved);
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-fc]');
    if (!control) return;
    const { fc: action, program, cycle: id, workout, key, source, session } = control.dataset;
    if (action === 'template') return show({type:'template', index:Number(control.dataset.index)});
    if (action === 'template-save' && view?.type === 'template') return saveTemplate(view.index);
    if (action === 'open' || action === 'new') return openCycle(program, action === 'new');
    if (action === 'open-id' && cycleById(id)) {
      remember(id);
      return show({ type: 'cycle', id });
    }
    if (action === 'journal') {
      const returnTo = dialog.open ? view : null;
      return show({ type: 'workout', workoutId: workout, returnTo });
    }
    if (action === 'nearest') {
      const selected = cycleById(id);
      if (selected) startSession(selected, nextSession(selected));
      return;
    }
    if (!dialog.open || !dialog.contains(control)) return;
    if (action === 'back') return back();
    if (action === 'close') return close();
    if (action === 'create' && view.type === 'setup') return create();
    if (action === 'adjust-yes' || action === 'adjust-no') return adjust(action === 'adjust-yes');
    const cycle = cycleById(view.id);
    if (!cycle) return;
    switch (action) {
      case 'next': return stage(cycle.stage + 1);
      case 'base-open':
        editor = { key, source: cycle.bases[key]?.source || (M.journalSets(state.workouts, groups(cycle).get(key).row, key, cycle.id).length ? 'journal' : 'known') };
        renderAt();
        return;
      case 'base-source':
        editor.source = source;
        return renderAt();
      case 'base-cancel':
        editor = null;
        return renderAt();
      case 'base-save': {
        const base = previewBasis();
        if (base && update(draft => { draft.bases[editor.key] = base; })) {
          editor = null;
          renderAt();
        }
        return;
      }
      case 'save-settings': return saveSettings();
      case 'week-prev': return selectWeek(cycle.week - 1);
      case 'week-next': return selectWeek(cycle.week + 1);
      case 'copy-week': return copyWeek(cycle);
      case 'activate':
        if ([...groups(cycle).keys()].some(key => !cycle.bases[key]) || M.readiness(cycle, sessions(cycle)).length) return;
        if (update(draft => { draft.status = 'active'; })) {
          // Refresh the program overlay, which holds its own unsaved program editor.
          window.ForgeCycleWorkout.repaintProgram();
          show(view);
          toast('Цикл запущен');
        }
        return;
      case 'session-start': return startSession(cycle, sessions(cycle).find(item => item.key === session));
      case 'session-move': return show({ type: 'move', id: cycle.id, key: session, returnTo: view });
      case 'save-move': {
        const date = body.querySelector('[name="move-date"]').value;
        if (!M.dateOK(date) || date < cycle.start || date > M.endDate(cycle)) return toast('Укажи дату внутри цикла.');
        if (update(draft => { draft.schedule[view.key] = { date }; })) show(view.returnTo);
        return;
      }
      case 'session-skip':
      case 'session-unskip':
        if (action === 'session-skip' && !confirm('Отметить занятие пропущенным?')) return;
        if (update(draft => { draft.schedule[session] = { ...draft.schedule[session], skipped: action === 'session-skip' }; })) renderAt();
    }
  });

  body.addEventListener('change', ({ target }) => {
    if (view?.type === 'setup') return updateSetup();
    if (target.matches('[data-select], [data-separate]')) {
      const id = target.dataset.select || target.dataset.separate;
      const key = target.dataset.select ? 'selected' : 'separate';
      const saved = update(cycle => {
        const row = cycle.days.flatMap(day => day.rows).find(item => item.id === id);
        row[key] = target.checked;
      });
      if (saved) {
        renderAt();
        body.querySelector('[data-' + (key === 'selected' ? 'select' : 'separate') + '="' + id + '"]').focus({ preventScroll: true });
      } else target.checked = !target.checked;
      return;
    }
    if (target.matches('[data-load-field]')) return updateLoad(target);
    if (target.name === 'week') return selectWeek(Number(target.value));
    if (target.name === 'kind' && update(cycle => { cycle.weeks[cycle.week].kind = target.value || null; })) renderAt();
    if (target.name === 'mode') body.querySelector('.fc-flex-options').hidden = target.value !== 'flexible';
    if (target.closest('.fc-base-form')) previewBasis();
  });
  body.addEventListener('input', ({ target }) => {
    if (view?.type === 'setup') updateSetup();
    if (target.closest('.fc-base-form')) previewBasis();
    const settings = target.closest('.fc-settings');
    if (settings && target.name) settingsDraft = Object.fromEntries([...settings.querySelectorAll('[name]')].map(control => [control.name, control.value]));
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); back(); });

  function restored() {
    const cycle = cycleById(localStorage.getItem(pointer));
    if (cycle) {
      showPage('plan');
      show({ type: 'cycle', id: cycle.id });
    } else remember(null);
  }

  window.ForgeCycles = { calendarBlock, nextAction, templateCards, programBlock, journalButton, finish, editSet, close,
    back, isOpen: () => dialog.open };
  renderAll();
  restored();
})();
