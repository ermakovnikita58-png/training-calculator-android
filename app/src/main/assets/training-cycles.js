(() => {
  'use strict';
  const M = ForgeCycleModel;
  const $ = id => document.getElementById(id);
  const format = value => Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
  const labels = { trainingMax: 'тренировочный максимум', fiveRM: '5ПМ', oneRM: '1ПМ', estimatedOneRM: 'расчётный 1ПМ' };
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
    render();
    dialog.scrollTop = scroll;
    heading.focus({ preventScroll: true });
  }

  function close() {
    remember(null);
    const wasOpen = dialog.open;
    view = null;
    editor = null;
    if (wasOpen) dialog.close();
    if (origin?.isConnected) origin.focus({ preventScroll: true });
    if (wasOpen && $('n8-program')?.classList.contains('show')) window.ForgeCycleWorkout.repaintProgram();
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
    if (!M.validCycle(cycle)) {
      toast('Проверь настройки тренировочного цикла.');
      return false;
    }
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
    const cycle = cycles().find(item => item.programId === program.id);
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
    let cycle = !newCycle && cycles().find(item => item.programId === programId);
    if (!cycle) {
      try {
        cycle = M.createCycle(state.programs?.find(program => program.id === programId), today(), uid());
        if (!put(cycle)) return;
      } catch (error) { return toast(error.message); }
    }
    remember(cycle.id);
    show({ type: 'cycle', id: cycle.id });
  }

  function stage(index) {
    if (!update(cycle => { cycle.stage = index; })) return;
    show(view);
  }

  function back() {
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
        (M.weekdays[day.weekday] || 'День программы') + '</small>' +
        day.rows.map(row => '<div class="fc-choice"><label><input type="checkbox" data-select="' + row.id + '"' +
          (row.selected ? ' checked' : '') + '><span>' + esc(row.name) + '<small>' +
          row.original.sets + '×' + row.original.reps + ' · ' + format(row.original.weight) + ' кг в программе</small></span></label>' +
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
    const actual = base.weight === undefined ? '' : ' · ' + format(base.weight) + ' кг × ' + base.reps;
    const adapted = base.adjustedValue === undefined ? '' : ' · рабочая база ' + format(base.adjustedValue) + ' кг';
    return labels[base.type] + ' · ' + format(base.value) + ' кг · ' + sourceLabels[base.source] + ' · ' + base.date + actual + adapted;
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
    let inputs;
    if (source === 'journal') {
      editor.entries = M.journalSets(state.workouts, group.row, editor.key, cycle.id);
      inputs = editor.entries.length ? '<label class="fc-field"><span>Подход из журнала</span><select name="entry">' + option('', true, 'Выбери подход') +
        editor.entries.map((set, index) => option(String(index), false, set.name + ' · ' + set.date + ' · ' + format(set.weight) + ' кг × ' + set.reps)).join('') +
        '</select></label>' : '<p class="fc-warning">Нет подходов для оценки (1–15 повторов с положительным весом).</p>';
    } else {
      const previous = base?.source === source ? base : null;
      inputs = source === 'known' ? '<label class="fc-field"><span>Тип максимума</span><select name="type">' +
        M.types.filter(type => type !== 'estimatedOneRM').map(type => option(type, type === previous?.type, labels[type])).join('') +
        '</select></label>' : number('Фактические повторы', 'reps', previous?.reps, true);
      inputs += number(source === 'known' ? 'Известный вес, кг' : 'Фактический вес, кг', 'weight',
        source === 'known' ? previous?.value : previous?.weight, false) +
        field('Дата результата', 'date', 'date', previous?.date || today(), 'max="' + today() + '"');
    }
    return '<div class="fc-base-form">' + panel(...[['journal', 'Взять из журнала'], ['known', 'Ввести известный максимум'],
      ['measurement', 'Записать замер']].map(([key, label]) => button(label, 'base-source',
      'aria-pressed="' + (source === key) + '" data-source="' + key + '"', source === key))) +
      inputs + '<p data-base-preview class="fc-base" aria-live="polite"></p>' +
      panel(button('Подтвердить базу', 'base-save', 'disabled', true), button('Отмена', 'base-cancel')) + '</div>';
  }

  function previewBasis() {
    const form = body.querySelector('.fc-base-form');
    if (!form || !editor) return null;
    const value = name => form.querySelector('[name="' + name + '"]')?.value;
    const estimate = window.ForgeCycleWorkout.estimate;
    const source = editor.source;
    let base;
    if (source === 'journal') {
      const entry = value('entry');
      const set = entry && editor.entries[Number(entry)];
      base = set && M.basisFromSet(source, set.date, set.weight, set.reps, estimate);
    } else if (source === 'measurement') {
      base = M.basisFromSet(source, value('date'), value('weight'), value('reps'), estimate);
    } else {
      base = { type: value('type'), date: value('date'), source, value: M.num(value('weight'), 0.001, M.limits.weight) };
    }
    if (!base || base.date > today() || !M.validBasis(base)) base = null;
    form.querySelector('[data-fc="base-save"]').disabled = !base;
    form.querySelector('[data-base-preview]').textContent = base ? summary(base) +
      (base.type === 'estimatedOneRM' ? ' · оценка FORGE по формуле Эпли' : '') : 'Выбери или введи корректный результат.';
    return base;
  }

  function loadText(load) {
    if (load.percent === null) return format(load.weight) + ' кг · задано вручную';
    if (!load.basis) return 'Подтверди стартовый замер';
    if (!(load.weight > 0)) return 'Уменьши шаг округления или проверь базу';
    const kg = load.basis.adjustedValue ?? load.basis.value;
    return format(load.percent) + '% от ' + labels[load.basis.type] + ' · ' + format(kg) + ' кг → ' +
      format(load.raw) + ' кг до округления → ' + format(load.weight) + ' кг';
  }

  function dateText(value) {
    return value.split('-').reverse().join('.');
  }

  function settings(cycle) {
    return '<details class="fc-card fc-settings"><summary>Настройки цикла</summary>' +
      '<div class="fc-grid fc-settings-grid">' +
      field('Начало цикла', 'start', 'date', cycle.start) +
      field('Дата соревнований', 'competition', 'date', cycle.competition) +
      number('Количество недель', 'length', cycle.weeks.length, true) +
      number('Шаг веса, кг', 'step', cycle.step, false, 'min="0.01" max="100"') +
      '<label class="fc-field"><span>Режим прогрессии</span><select name="mode">' +
      option('fixed', cycle.mode === 'fixed', 'Фиксированный') +
      option('flexible', cycle.mode === 'flexible', 'Гибкий') + '</select></label></div>' +
      '<div class="fc-flex-options"' + (cycle.mode === 'fixed' ? ' hidden' : '') + '>' +
      '<p class="fc-muted">Если все рабочие подходы выполнены, FORGE может предложить увеличить будущие веса. Для упражнения в каждом подходе нужен запас выше указанной цели или достаточно дополнительных повторов.</p>' +
      '<div class="fc-grid fc-settings-grid">' +
      number('Целевой запас (RIR)', 'targetRir', cycle.targetRir, true) +
      number('Доп. повторы в подходе', 'extraReps', cycle.extraReps, true) +
      number('Увеличение базы, %', 'increase', cycle.increase, false) + '</div></div>' +
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
      dateText(date) + '</small></div><span class="fc-tag">' + captions[status] + '</span></div>' +
      (snapshot ? snapshot.rows.map(row => '<div class="fc-load"><strong>' + esc(row.name) + '</strong><p class="fc-muted">' +
        row.sets + '×' + row.reps + ' · ' + esc(loadText(row)) + '</p></div>').join('') : day.rows.map(row => {
        const load = M.plannedLoad(cycle, week, row);
        return '<div class="fc-load" data-load="' + row.id + '"><strong>' + esc(row.name) + '</strong><div class="fc-grid">' +
          number('Подходы', 'sets', load.sets, true, 'min="1" max="30" data-load-field') +
          number('Повторы', 'reps', load.reps, true, 'min="1" max="100" data-load-field') +
          (row.selected ? number('От базы, %', 'percent', load.percent, false, 'min="1" max="100" data-load-field')
            : number('Вес, кг', 'weight', load.weight, false, 'min="0" max="1500" data-load-field')) +
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
      '<p class="fc-warning" data-readiness role="status"' + (blocked.length ? '' : ' hidden') +
      '>Проверь базу и рассчитанный вес: ' + esc(blocked.join(', ')) + '</p>' +
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
    if (view?.type === 'workout') return renderJournal(view.workoutId);
    const cycle = cycleById(view?.id);
    if (!cycle) return close();
    if (view.type === 'move') {
      const item = sessions(cycle).find(session => session.key === view.key);
      if (!item || item.state !== 'pending') return show(view.returnTo);
      heading.textContent = 'Перенести тренировку';
      body.innerHTML = card('<h3>' + esc(item.day.name) + '</h3>' +
        field('Новая дата', 'move-date', 'date', item.date, 'min="' + cycle.start + '"') +
        '<p class="fc-muted">Дата соревнований и номер недели останутся прежними.</p>' +
        panel(button('Сохранить дату', 'save-move', '', true), button('Отмена', 'back')));
      return;
    }
    heading.textContent = stages[cycle.stage];
    body.innerHTML = '<p class="fc-step">' + esc(cycle.name) + ' · Шаг ' + (cycle.stage + 1) + ' из 3</p>' +
      [selection, measurements, planning][cycle.stage](cycle) +
      (cycle.stage !== 2 ? panel(button('Далее', 'next', '', true), button('Сохранить черновик', 'close')) : '');
    previewBasis();
  }

  function saveSettings() {
    const settings = body.querySelector('.fc-settings');
    const read = name => settings.querySelector('[name="' + name + '"]').value;
    const start = read('start'), competition = read('competition');
    const length = M.num(read('length'), 1, M.limits.weeks, true);
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
    if (!M.dateOK(start) || start > '9998-12-31' ||
      (competition && (!M.dateOK(competition) || competition < start))) {
      return report('Проверь дату старта и выбери дату соревнований не раньше неё.');
    }
    if ([length, step, targetRir, extraReps, increase].includes(null)) {
      return report('Недели: 1–52. Шаг веса: 0,01–100 кг. Запас: 0–10. Дополнительные повторы: 1–10. Повышение: 0,5–10%.');
    }
    const shortened = sessions(cycle).some(item => item.week >= length && ['started', 'done'].includes(item.state));
    if (shortened) return report('Эти недели уже содержат начатые или завершённые тренировки.');
    if (length < cycle.weeks.length && !confirm('Удалить настройки последних недель?')) return;
    if (!update(draft => {
      Object.assign(draft, { start, competition, step, mode, targetRir, extraReps, increase });
      draft.weeks = Array.from({ length }, (_, i) => draft.weeks[i] || { kind: null, loads: {} });
      draft.week = Math.min(draft.week, length - 1);
      for (const [key, entry] of Object.entries(draft.schedule)) {
        if (Number(key.split(':')[0]) >= length) delete draft.schedule[key];
        else if (entry.date && entry.date < start) delete entry.date;
      }
    })) return;
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
          loads[row.id] = { sets: plan.sets, reps: plan.reps,
            ...(row.selected ? { percent: plan.percent } : { weight: plan.weight }) };
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
      '<ul class="fc-facts">' + sets.map(set => '<li>' + format(set.weight) + ' кг × ' + set.reps +
        (set.rir === undefined ? '' : ' · запас ' + set.rir) + '</li>').join('') + '</ul>' : '<p>' + noSets + '</p>';
    const extra = workout.sets.filter(set => !plan.rows.some(row => row.rowId === set.cycleRowId));
    const proposals = adjustments(cycle, workout);
    const result = workout.cycleAdjustment === 'accepted' ? 'Изменение применено к будущим занятиям.' :
      workout.cycleAdjustment === 'declined' ? 'Предложение отклонено. Будущие веса остались прежними.' : '';
    body.innerHTML = '<p class="fc-step">' + esc(plan.name) + ' · Неделя ' + (plan.week + 1) + '</p>' +
      card('<h3>' + esc(plan.dayName) + '</h3><p>План · ' + dateText(plan.date) +
        '<br>Фактически · ' + dateText(workout.date.slice(0, 10)) + '</p>') +
      plan.rows.map(row => card('<h3>' + esc(row.name) + '</h3><div class="fc-compare"><div><b>План</b><p>' +
        row.sets + '×' + row.reps + ' · ' + esc(loadText(row)) + '</p></div><div><b>Факт</b>' +
        facts(workout.sets.filter(set => set.cycleRowId === row.rowId)) + '</div></div>')).join('') +
      (extra.length ? card('<h3>Дополнительные упражнения</h3>' + extra.map(set => '<p>' + esc(set.exercise) + ' · ' +
        format(set.weight) + ' кг × ' + set.reps + '</p>').join('')) : '') +
      (result ? card('<p>' + result + '</p>') : '') +
      (proposals.length ? card('<h3>Предложение гибкого режима</h3><p>Рабочие подходы выполнены с нужным запасом или дополнительными повторами. Посмотри, как изменятся веса следующих занятий.</p>' +
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
          ...(item.day.rows[index].rest ? { rest: item.day.rows[index].rest } : {}),
          sets: Array.from({ length: row.sets }, () => ({ weight: row.weight, reps: row.reps, done: false })),
        })),
      };
      if (!commit({ ...state, active, activeNote: '' })) return;
      window.ForgeCycleWorkout.reset();
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
      const max = { weight: M.limits.weight, reps: M.limits.reps, rir: 10 }[key];
      const parsed = M.num(value, 0, max, key !== 'weight');
      if (parsed === null) return toast('Проверь значение в подходе');
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
    const next = M.num(input.value, Number(input.min), Number(input.max), input.step === '1');
    if (next === null) {
      toast('Допустимое значение: ' + input.min + '–' + input.max);
      input.value = original[input.name];
      return;
    }
    if (next === original[input.name]) return;
    if (!update(draft => {
      const loads = draft.weeks[draft.week].loads;
      loads[row.id] = { ...loads[row.id], [input.name]: next };
    })) {
      input.value = original[input.name];
      return;
    }
    const saved = cycleById(view.id);
    container.querySelector('[data-load-summary]').textContent = loadText(M.plannedLoad(saved, saved.week, row));
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
    if (action === 'open' || action === 'new') return openCycle(program, action === 'new');
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
        if (!M.dateOK(date) || date < cycle.start) return toast('Укажи корректную дату внутри цикла или позже.');
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
  body.addEventListener('input', ({ target }) => { if (target.closest('.fc-base-form')) previewBasis(); });
  window.addEventListener('keydown', event => {
    if (!dialog.open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) back();
  }, { capture: true });
  dialog.addEventListener('cancel', event => { event.preventDefault(); back(); });
  const prevBack = window.f6HandleAndroidBack;
  window.f6HandleAndroidBack = () => dialog.open ? (back(), 'handled') : prevBack();

  function restored() {
    const cycle = cycleById(localStorage.getItem(pointer));
    if (cycle) {
      if (!state.active) showPage('plan');
      n8OpenProgram(cycle.programId);
      show({ type: 'cycle', id: cycle.id });
    } else remember(null);
  }

  // Older cycle results remain accessible beyond the existing journal's 12 recent entries.
  function journalOlder(workouts) {
    const older = workouts.slice(12).filter(workout => workout.trainingCycle);
    return older.length ? '<details class="fc-card"><summary>Предыдущие занятия циклов</summary>' +
      older.map(workout => '<div class="fc-load"><p>' + esc(workout.name) + ' · ' +
      dateText(workout.date.slice(0, 10)) + '</p>' + journalButton(workout) + '</div>').join('') + '</details>' : '';
  }

  window.ForgeCycles = { programBlock, journalButton, journalOlder, finish, editSet, restored, close };
  renderAll();
  restored();
})();
