(() => {
  'use strict';
  const model = window.ForgeProductCore;
  const index = () => ForgePerformanceViews.index();
  const fmt = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  const description = (values, unit) => fmt(values.weight) + ' кг × ' +
    fmt(values[unit]) + (unit === 'seconds' ? ' с' : ' повт.');
  let lastPress = null;

  function capture(active, exerciseIndex, setIndex, before) {
    active.quickLogUndo = {
      exerciseIndex, setIndex, before,
      after: { ...active.exercises[exerciseIndex].sets[setIndex] }
    };
  }

  function undoable(active) {
    const receipt = active?.quickLogUndo;
    if (!receipt || !Number.isInteger(receipt.exerciseIndex) || !Number.isInteger(receipt.setIndex)) return null;
    const exercise = active.exercises[receipt.exerciseIndex];
    const set = exercise?.sets[receipt.setIndex];
    return set?.done && receipt.before?.done === false &&
      JSON.stringify(set) === JSON.stringify(receipt.after) ? receipt : null;
  }

  function undo() {
    const receipt = undoable(state.active);
    if (!receipt) return toast('Эта запись уже изменилась');
    const active = structuredClone(state.active);
    active.exercises[receipt.exerciseIndex].sets[receipt.setIndex] = receipt.before;
    delete active.quickLogUndo;
    try { forgeCommitDiary({ ...state, active }); }
    catch { return toast('Не удалось отменить подход. Запись сохранена.'); }
    lastPress = null;
    renderWorkout();
    toast('Запись подхода отменена');
  }

  function repeat() {
    const exerciseIndex = index();
    const workout = state.active;
    const exercise = workout?.exercises[exerciseIndex];
    const setIndex = exercise?.sets.findIndex(set => !set.done) ?? -1;
    if (setIndex < 0) return;
    const prior = model.comparableSet(state.workouts, workout, exercise, setIndex);
    if (prior) n8LogSet(exerciseIndex, setIndex, { expected: false, values: prior.values });
  }

  function decorate(target, workout, exercise) {
    if (!target || !exercise) return;
    const setIndex = exercise.sets.findIndex(set => !set.done);
    const prior = setIndex >= 0 && model.comparableSet(state.workouts, workout, exercise, setIndex);
    const unit = model.unitOf(exercise);
    // Cycle targets already have a separate Plan and Fact readout.
    const plan = !workout.trainingCycle && exercise.planned;
    const pending = exercise.sets[setIndex];
    const showPlan = plan && pending && (plan.weight !== pending.weight || plan[unit] !== pending[unit]);
    const parts = [
      showPlan ? '<p class="fp-caption">План · ' + esc(description(plan, unit)) + '</p>' : '',
      prior ? '<button type="button" class="fp-btn" data-quick-log="record">' +
        '<span>Повторить подход</span><small>' + esc(description(prior.values, unit)) +
        '</small></button>' : '',
      undoable(workout) ? '<button type="button" class="fp-btn quiet" data-quick-log="undo">Отменить запись подхода</button>' : ''
    ].filter(Boolean);
    if (parts.length) {
      const header = target.querySelector('.fp-current-heading');
      (header || target).insertAdjacentHTML(header ? 'afterend' : 'afterbegin',
        '<div class="fp-quick-log">' + parts.join('') + '</div>');
    }
  }

  // One touch can generate two clicks against the next set after a live rerender.
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.closest('[inert]')) return;
    const recordsNext = button.matches('[data-fp-action="logSet"],[data-quick-log="record"],[onclick="n8LogNext()"]');
    const isSetToggle = button.matches('#workout .n8-setgrid button[onclick^="n8LogSet"]');
    if ((recordsNext || isSetToggle) && state.active) {
      const now = performance.now();
      const sameWorkout = lastPress?.id === state.active.id;
      const tooSoon = recordsNext && sameWorkout && now - lastPress.at < 550;
      if (event.detail > 1 || tooSoon) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      lastPress = { id: state.active.id, at: now };
    }
    if (button.dataset.quickLog === 'record') repeat();
    if (button.dataset.quickLog === 'undo') undo();
  }, true);

  window.ForgeQuickLog = {
    capture, decorate,
    prefill: workout => model.prefillWorkout(workout, state.workouts)
  };
})();
