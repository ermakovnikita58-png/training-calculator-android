(function (root, factory) {
  const model = factory(typeof module !== 'undefined' && module.exports
    ? require('./quick-diary-core.js') : root.ForgeProductCore);
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.ForgeProgressionModel = model;
})(globalThis, function (M) {
  'use strict';
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const work = set => !!set && set.done !== false && set.type !== 'warmup';
  const reserve = set => {
    if (number(set.rir) && set.rir >= 0 && set.rir <= 10) return set.rir;
    return number(set.rpe) && set.rpe >= 1 && set.rpe <= 10 ? 10 - set.rpe : null;
  };
  const trim = value => Number(value.toFixed(3));

  function suggest(workout, program, history) {
    if (!workout || workout.trainingCycle || workout.cycleMeta || workout.programId !== program?.id ||
        !program.progression?.enabled || !workout.programDay) return [];
    const day = program.days.find(row => row.day === workout.programDay);
    if (!day) return [];
    const result = [];
    for (const exercise of workout.exercises || []) {
      const planned = exercise.planned;
      if (M.unitOf(exercise) !== 'reps' || !planned?.weight || !day.exercises.includes(exercise.name)) continue;
      const config = Object.hasOwn(day.exerciseConfig || {}, exercise.name) ? day.exerciseConfig[exercise.name] : null;
      if (!config || Number(config.weight) !== planned.weight || Number(config.reps) !== planned.reps ||
          Number(config.sets || 3) !== planned.sets) continue;
      const sets = exercise.sets.filter(set => set.type !== 'warmup');
      if (sets.length !== planned.sets || sets.some(set => !set.done || !M.setValues(set, 'reps') ||
          set.weight < planned.weight || set.reps < planned.reps + 1 ||
          reserve(set) === null || reserve(set) < 2)) continue;
      const hasComparable = history.some(entry => entry.id !== workout.id && entry.date < workout.date &&
        (!entry.programId || entry.programId === workout.programId) && (entry.sets || []).some(set =>
          work(set) && M.exerciseMatches(exercise, set) && set.weight === planned.weight &&
          M.setValues(set, 'reps') && set.reps >= planned.reps && set.reps <= planned.reps + 4 &&
          (reserve(set) === null || reserve(set) >= 1)));
      if (!hasComparable) continue;
      const equipmentStep = Number(config.stepKg ?? program.progression.stepKg);
      const percentage = Math.min(5, Math.max(0, Number(program.progression.step) || 2.5));
      const increase = equipmentStep > 0 && equipmentStep <= 20
        ? equipmentStep : Math.floor(planned.weight * percentage / 100 * 4) / 4;
      if (increase <= 0 || increase > planned.weight * .05 + 1e-8 || planned.weight + increase > 1500) continue;
      result.push({ name: exercise.name, day: day.day, old: planned.weight, next: trim(planned.weight + increase),
        repetitions: planned.reps, actual: Math.min(...sets.map(set => set.reps)), sets: sets.length,
        rir: Math.min(...sets.map(reserve)), step: trim(increase) });
    }
    return result.filter((candidate, index) => result.findIndex(row => row.name === candidate.name) === index);
  }

  function apply(program, advice) {
    const map = new Map(advice.map(item => [item.name, item]));
    if (!advice.length) return program;
    return { ...program,
      days: program.days.map(day => {
        const entries = Object.entries(day.exerciseConfig || {});
        const changed = entries.some(([name, config]) => map.get(name)?.day === day.day &&
          Number(config.weight) === map.get(name).old);
        if (!changed) return day;
        const exerciseConfig = Object.fromEntries(entries.map(([name, config]) => {
          const recommendation = map.get(name);
          return [name, recommendation?.day === day.day && Number(config.weight) === recommendation.old
            ? { ...config, weight: recommendation.next } : config];
        }));
        return { ...day, exerciseConfig };
      })
    };
  }
  return { suggest, apply };
});
