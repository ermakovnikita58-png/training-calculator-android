(() => {
  'use strict';
  const M = window.ForgeProgressionModel;

  function open(workoutId) {
    const workout = state.workouts.find(item => item.id === workoutId);
    const program = state.programs.find(item => item.id === workout?.programId);
    const advice = M.suggest(workout, program, state.workouts);
    if (!advice.length) return;
    $('modalTitle').textContent = 'Следующая тренировка';
    $('modalBody').innerHTML = `<div class="fp-product-panel" id="forgeProgressionAdvice">
      <p>Сравнили записанные рабочие подходы с планом и предыдущей тренировкой. Выбери, какие веса повысить.</p>
      ${advice.map((item, i) => `<label class="fp-card fp-product-choice"><input type="checkbox" data-progression-row="${i}">
        <span><strong>${esc(item.name)} · ${esc(item.day)}</strong><br>
        ${item.old} → ${item.next} кг · шаг ${item.step} кг<br>
        <small>План ${item.sets} × ${item.repetitions}, факт не меньше ${item.actual} повторений в каждом подходе, запас от ${item.rir}.</small></span>
      </label>`).join('')}
      <button class="btn primary full" type="button" id="forgeAcceptProgression">Применить выбранные веса</button>
      <button class="btn secondary full" type="button" id="forgeDeclineProgression">Оставить текущие веса</button>
    </div>`;
    $('modalback').classList.add('show');

    const dismiss = () => {
      window.ForgeNavigation?.markSaved('modalback');
      closeModal();
    };
    $('forgeDeclineProgression').onclick = dismiss;
    $('forgeAcceptProgression').onclick = () => {
      const selected = new Set([...$('forgeProgressionAdvice').querySelectorAll('input:checked')]
        .map(input => advice[Number(input.dataset.progressionRow)]?.name));
      if (!selected.size) return toast('Выбери упражнения для изменения');
      const current = state.programs.find(item => item.id === program.id);
      const updates = M.suggest(workout, current, state.workouts).filter(item => selected.has(item.name) &&
        advice.some(old => old.name === item.name && old.old === item.old && old.next === item.next));
      if (updates.length !== selected.size) return toast('План уже изменился. Проверь рабочие веса в программе');
      const updated = M.apply(current, updates);
      const plans = state.currentProgram === current.id ? M.apply({ days: state.plans }, updates).days : state.plans;
      try { forgeCommitDiary({ ...state, programs: state.programs.map(item => item.id === current.id ? updated : item), plans }); }
      catch { return toast('Не удалось сохранить рабочие веса'); }
      dismiss();
      renderAll();
      toast('Обновлены рабочие веса следующих тренировок');
    };
  }

  window.forgeOpenProgressionAdvice = open;
})();
