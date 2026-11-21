(() => {
  'use strict';
  const goals = {
    strength: { label: 'Стать сильнее', reps: 5, picks: ['Приседания со штангой', 'Жим штанги лёжа', 'Тяга верхнего блока', 'Становая тяга'] },
    muscle: { label: 'Набрать мышцы', reps: 10, picks: ['Жим гантелей сидя', 'Жим ногами', 'Тяга верхнего блока', 'Подъём гантелей на бицепс'] },
    fitness: { label: 'Тренироваться регулярно', reps: 10, picks: ['Приседания с гантелями', 'Отжимания от пола', 'Тяга верхнего блока', 'Жим ногами'] }
  };
  const weekdayOrder = [['ПН'], ['ПН', 'ЧТ'], ['ПН', 'СР', 'ПТ'], ['ПН', 'ВТ', 'ЧТ', 'СБ'], ['ПН', 'ВТ', 'СР', 'ПТ', 'СБ'], ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'], ForgeCycleModel.weekdays];
  const button = (action, label, primary = false, value = '') =>
    `<button type="button" class="fp-btn ${primary ? 'primary' : ''}" data-program-wizard="${action}" data-value="${esc(value)}">${esc(label)}</button>`;
  let draft;

  function close() {
    window.ForgeNavigation?.markSaved('modalback');
    closeModal();
    draft = null;
  }

  function open() {
    draft = { step: 'entry', goal: 'strength', count: 3, days: [], day: 0, name: 'Моя программа' };
    render(true);
  }

  function render(first = false) {
    const goal = goals[draft.goal];
    const start = `<p>Выбери, с чего начать. Рабочие веса и порядок упражнений можно менять в редакторе программы.</p>
      <div class="fp-actions">${button('goal', 'Мастер по шагам', true)}${button('empty', 'Пустая программа')}
      ${button('templates', 'Готовый шаблон')}${button('import', 'Импортировать программу')}</div>`;
    const content = {
      entry: () => start,
      goal: () => `<h3>1. Какая у тебя цель?</h3>
        ${Object.entries(goals).map(([id, item]) => `<label class="fp-card fp-product-choice">
          <input type="radio" name="forgeWizardGoal" value="${id}" ${draft.goal === id ? 'checked' : ''}><span>${esc(item.label)}</span></label>`).join('')}
        ${button('days', 'Далее', true)}`,
      days: () => `<h3>2. Сколько дней тренироваться?</h3>
        <label class="field"><span>Тренировок в неделю</span><select id="forgeWizardCount">
          ${weekdayOrder.map((_, i) => `<option value="${i + 1}" ${draft.count === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}
        </select></label>
        ${button('exercises', 'Далее', true)}`,
      exercises: () => {
        const selected = draft.days[draft.day];
        return `<h3>3. Упражнения по дням</h3>
          <label class="field"><span>День</span><select id="forgeWizardDay">
            ${draft.days.map((day, i) => `<option value="${i}" ${draft.day === i ? 'selected' : ''}>${esc(day.day)} · ${day.exercises.length} упр.</option>`).join('')}
          </select></label>
          <label class="field"><span>Найти упражнение</span><input type="search" autocomplete="off" id="forgeWizardSearch"></label>
          <div id="forgeWizardExercises" class="fp-product-panel"></div>
          <div id="forgeWizardSelected" class="fp-product-panel">${selection(selected)}</div>
          ${button(draft.day + 1 === draft.count ? 'review' : 'nextDay', draft.day + 1 === draft.count ? 'Проверить программу' : 'Следующий день', true)}`;
      },
      review: () => `<h3>4. Проверь программу</h3>
        <label class="field"><span>Название программы</span><input id="forgeWizardName" maxlength="90" value="${esc(draft.name)}"></label>
        <p>Начальный план: по 3 подхода, по ${goal.reps} повторений. Рабочий вес укажи по своим возможностям перед первым подходом.</p>
        ${draft.days.map(day => `<div class="fp-card"><strong>${esc(day.day)} · ${esc(day.name)}</strong>
          <p>${day.exercises.map(esc).join(' · ')}</p></div>`).join('')}
        ${button('save', 'Сохранить программу', true)}`,
      templates: () => `<h3>Готовые программы</h3>
        <p>Шаблон создаст отдельную программу. Затем её можно настроить.</p>
        <div class="fp-product-panel">${ForgePerformanceViews.templates.map((item, i) => button('use', item.name, false, i)).join('')}</div>`
    };
    $('modalTitle').textContent = 'Создать программу';
    $('modalBody').innerHTML = `<div id="forgeProgramWizard" class="fp-product-panel">${content[draft.step]()}
      ${draft.step !== 'entry' ? button('back', 'Назад') : ''}</div>`;
    $('modalback').classList.add('show');
    if (draft.step === 'exercises') drawExercises();
    if (!first) {
      $('modalback').querySelector('.modal')?.scrollTo(0, 0);
      const heading = $('forgeProgramWizard').querySelector('h3');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
  }

  function selection(day) {
    return day.exercises.map(name => `<div class="fp-product-choice"><span>${esc(name)}</span>
      ${button('remove', 'Убрать', false, name).replace('type="button"', 'type="button" aria-label="Убрать ' + esc(name) + '"')}</div>`).join('');
  }

  function drawExercises() {
    const term = $('forgeWizardSearch').value.trim().toLocaleLowerCase('ru');
    const chosen = draft.days[draft.day].exercises;
    const all = forgeRefreshCatalog().map(item => item.name);
    const candidates = term ? all.filter(name => name.toLocaleLowerCase('ru').includes(term)) : goals[draft.goal].picks.filter(name => all.includes(name));
    const available = [...new Set(candidates)].filter(name => !chosen.includes(name)).slice(0, 12);
    $('forgeWizardExercises').innerHTML = available.length ? available.map(name => button('add', '+ ' + name, false, name)).join('')
      : '<p class="fp-caption">Подходящих упражнений нет. Попробуй изменить поиск.</p>';
    $('forgeWizardSelected').innerHTML = selection(draft.days[draft.day]);
  }

  function back() {
    if (!$('forgeProgramWizard') || !$('modalback').classList.contains('show') || !draft || draft.step === 'entry') return false;
    if (draft.step === 'exercises' && draft.day > 0) draft.day--;
    else draft.step = { goal: 'entry', days: 'goal', exercises: 'days', review: 'exercises', templates: 'entry' }[draft.step];
    render();
    return true;
  }

  function save() {
    const { goal, days, name } = draft;
    const program = { id: uid(), name: name.trim().slice(0, 90), wizardGoal: goal,
      days: days.map(day => ({ ...day, focus: goals[goal].label,
        exerciseConfig: Object.fromEntries(day.exercises.map(exercise => [exercise, { sets: 3, reps: goals[goal].reps, weight: 0 }])) })),
      progression: { enabled: false, step: 2.5 } };
    if (!program.name) return toast('Введи название программы');
    try { forgeCommitDiary({ ...state, programs: [...state.programs, program] }); }
    catch { return toast('Не удалось сохранить программу'); }
    close();
    renderAll();
    n8OpenProgram(program.id);
    window.ForgeAnalytics?.('program_created');
    toast('Программа сохранена. Назначь её на неделю из редактора.');
  }

  document.addEventListener('input', ({ target }) => {
    if (!draft || !target.closest('#forgeProgramWizard')) return;
    if (target.id === 'forgeWizardSearch') drawExercises();
    if (target.id === 'forgeWizardName') draft.name = target.value;
  });
  document.addEventListener('change', ({ target }) => {
    if (!draft || !target.closest('#forgeProgramWizard')) return;
    if (target.name === 'forgeWizardGoal' && Object.hasOwn(goals, target.value)) draft.goal = target.value;
    if (target.id === 'forgeWizardCount') draft.count = Number(target.value);
    if (target.id === 'forgeWizardDay') { draft.day = Number(target.value); render(); }
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-program-wizard]');
    if (!target || target.closest('[inert]') || event.detail > 1) return;
    const { programWizard: action, value } = target.dataset;
    if (action === 'open') return open();
    if (!draft || !target.closest('#forgeProgramWizard')) return;
    if (action === 'back') return back();
    if (action === 'empty') { close(); return n8NewProgram(); }
    if (action === 'import') { close(); return ForgeTrainingImport.open(); }
    if (action === 'use') { close(); return n8UseTemplate(Number(value)); }
    if (action === 'save') return save();
    if (action === 'add' || action === 'remove') {
      const exercise = draft.days[draft.day].exercises;
      if (action === 'remove') draft.days[draft.day].exercises = exercise.filter(name => name !== value);
      else if (!exercise.includes(value) && exercise.length < 20) exercise.push(value);
      else return toast('В одном дне можно выбрать до 20 упражнений');
      drawExercises();
      return;
    }
    if (action === 'exercises') {
      draft.days = weekdayOrder[draft.count - 1].map((day, i) => ({ day, name: 'Тренировка ' + (i + 1), exercises: draft.days[i]?.exercises || [] }));
      draft.day = Math.min(draft.day, draft.count - 1);
    }
    if (action === 'nextDay') { draft.day++; return render(); }
    if (action === 'review' && draft.days.some(day => !day.exercises.length)) {
      draft.day = draft.days.findIndex(day => !day.exercises.length);
      render();
      return toast('Добавь хотя бы одно упражнение в каждый день');
    }
    draft.step = action;
    render();
  });
  window.ForgeProgramWizard = { open, back };
})();
