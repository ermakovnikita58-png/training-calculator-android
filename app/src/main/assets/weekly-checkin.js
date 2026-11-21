(() => {
  'use strict';
  const fmt = (value, digits = 1) => Number.isFinite(value)
    ? Number(value.toFixed(digits)).toLocaleString('ru-RU') : '—';
  const dayName = date => new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
  const dateLabel = (from, through) => dayName(from) + ' — ' + dayName(through);
  const pair = (before, after, suffix = '', digits = 1) => fmt(before, digits) + ' → ' + fmt(after, digits) + suffix;
  const section = (title, body) => `<section class="fp-card"><h3>${title}</h3>${body}</section>`;

  function open() {
    const result = window.ForgeWeeklyModel.analyze(state, today());
    if (!result) return;
    const { before, after, strength, weightChange } = result;
    const now = dateLabel(after.start, result.through), earlier = dateLabel(before.start, ForgeCycleModel.addDays(after.start, -1));
    const change = weightChange === null ? 'Нужно минимум по три отдельных дня с измерениями в каждой неделе.' :
      'Разница средних: ' + (weightChange > 0 ? '+' : '') + fmt(weightChange) + ' кг. Колебания массы включают воду и другие факторы.';
    const nutrition = after.complete || before.complete ? `<p>Среднее за подтверждённые дни: ${pair(before.nutrition.cal, after.nutrition.cal, ' ккал', 0)}.</p>
      <p>Белки ${pair(before.nutrition.protein, after.nutrition.protein, ' г')}. Жиры ${pair(before.nutrition.fat, after.nutrition.fat, ' г')}.
      Углеводы ${pair(before.nutrition.carbs, after.nutrition.carbs, ' г')}.</p>` : '';
    const strengthText = strength.length ? `<details><summary>Сопоставимые подходы · ${strength.length}</summary><p>Максимальный рабочий вес при одинаковом числе повторений.</p>
      <ul>${strength.map(row => `<li>${esc(row.name)} × ${row.reps} · ${pair(row.before, row.after, ' кг')}</li>`).join('')}</ul></details>` :
      '<p>Для изменения рабочих весов нужны записи одного упражнения с одинаковыми повторениями в обеих неделях.</p>';
    const verdict = result.ready
      ? 'Массу и питание уже можно сравнить за две недели. Проверь тренировочные записи и открой анализ Nutrition Coach для оценки цели.'
      : 'Недостаточно данных для корректировки. Нужны по три дня с замерами массы и по пять полных дней питания за каждую из двух недель.';
    const planned = after.planned ? `<p>Дни текущей программы на прошлой и этой неделях: ${before.programDays} → ${after.programDays} из ${after.planned}.
      Сравнение по текущему расписанию. Тренировки без связи с программой посчитаны отдельно.</p>` :
      '<p>Для сравнения с программой назначь её в разделе «Программы».</p>';
    $('modalTitle').textContent = 'Недельный обзор';
    $('modalBody').innerHTML = `<div id="forgeWeekly" class="fp-product-panel">
      <p>${esc(earlier)} → ${esc(now)}. Учитываются только завершённые дни.</p>
      ${section('Масса тела', `<p>Средние: ${pair(before.weight, after.weight, ' кг')} · дней с замерами: ${before.weights} → ${after.weights}.</p><p>${esc(change)}</p>`)}
      ${section('Питание', `<p>Подтверждённые дни: ${before.complete} → ${after.complete} из 7. Дни с записями: ${before.logged} → ${after.logged} из 7.</p>${nutrition}`)}
      ${section('Тренировки', `<p>Занятий с записанными подходами: ${before.workouts} → ${after.workouts}.</p>${planned}
        <p>Среднее усилие по RPE: ${pair(before.effort, after.effort)} · тренировок с оценками ${before.effortWorkouts} → ${after.effortWorkouts}.</p>${strengthText}`)}
      ${section('Следующий шаг', `<p role="status">${esc(verdict)}</p>
        <button class="fp-btn" type="button" id="forgeWeeklyCoach">Подтвердить дни и открыть анализ Nutrition Coach</button>`)}
    </div>`;
    $('modalback').classList.add('show');
    $('forgeWeeklyCoach').onclick = () => { closeModal(); ForgeCoach.open(5); };
  }

  document.addEventListener('click', ({ target }) => {
    if (target.closest('[data-forge-weekly]') && !target.closest('[inert]')) window.forgeOpenWeeklyCheckIn();
  });
  window.forgeOpenWeeklyCheckIn = open;
})();
