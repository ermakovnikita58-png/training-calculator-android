(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const model = factory(common ? require('./quick-diary-core.js') : root.ForgeProductCore,
    common ? require('./nutrition-coach-core.js') : root.ForgeNutrition);
  if (common) module.exports = model;
  else root.ForgeWeeklyModel = model;
})(globalThis, function (M, Coach) {
  'use strict';
  const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const keys = ['cal', 'protein', 'fat', 'carbs'];
  const date = value => String(value || '').slice(0, 10);
  const day = (to, offset) => new Date((to + offset) * 86400000).toISOString().slice(0, 10);
  const numeric = value => value != null && String(value).trim() && Number.isFinite(Number(value)) && Number(value) >= 0;
  const actual = set => set && set.done !== false && set.type !== 'warmup' && M.setValues(set, M.unitOf(set));

  function week(data, start, end) {
    const within = value => date(value) >= start && date(value) < end;
    const daily = data.nutritionCoach?.daily || {};
    const weighIns = new Map();
    for (const row of data.weights || []) {
      if (within(row.date) && numeric(row.weight) && Number(row.weight) > 0) weighIns.set(date(row.date), Number(row.weight));
    }
    const foods = (data.foods || []).filter(item => within(item.date));
    const entered = Object.entries(daily).filter(([when, entry]) => within(when) && entry?.complete === true);
    const complete = entered.flatMap(([when]) => {
      const items = foods.filter(item => date(item.date) === when);
      if (!items.length || items.some(item => !keys.every(key => numeric(item[key])))) return [];
      return [Object.fromEntries(keys.map(key => [key, items.reduce((sum, item) => sum + Number(item[key]), 0)]))];
    });
    const workouts = (data.workouts || []).filter(row => within(row.date) && row.sets?.some(actual));
    const effort = [], strength = new Map();
    for (const workout of workouts) {
      const recorded = workout.sets.filter(actual);
      const ratings = recorded.map(set => Number.isInteger(set.rir) && set.rir >= 0 && set.rir <= 10
        ? 10 - set.rir : typeof set.rpe === 'number' && set.rpe >= 1 && set.rpe <= 10 ? set.rpe : null)
        .filter(value => value !== null);
      if (ratings.length) effort.push(mean(ratings));
      for (const set of recorded) {
        if (typeof set.exercise !== 'string' || !set.exercise.trim() || M.unitOf(set) !== 'reps' || Number(set.weight) <= 0 || Number(set.reps) > 30) continue;
        const identity = set.exerciseId || set.exercise.normalize('NFC').trim().toLocaleLowerCase('ru');
        const key = identity + '/' + set.reps;
        const selected = strength.get(key);
        if (!selected || Number(set.weight) > selected.weight) strength.set(key,
          { name: set.exercise, reps: Number(set.reps), weight: Number(set.weight) });
      }
    }
    const scheduled = new Set((data.plans || []).filter(plan => plan.exercises?.length).map(plan => plan.day));
    const current = new Set(workouts.filter(workout => data.currentProgram && workout.programId === data.currentProgram &&
      scheduled.has(workout.programDay)).map(workout => workout.programDay));
    const identified = workouts.filter(workout => workout.programId).length;
    return { start, end, weights: weighIns.size, weight: mean([...weighIns.values()]),
      complete: complete.length, logged: new Set(foods.map(food => date(food.date))).size,
      nutrition: Object.fromEntries(keys.map(key => [key, mean(complete.map(row => row[key]))])),
      workouts: workouts.length, planned: data.currentProgram ? scheduled.size : 0,
      programDays: current.size, identified, strength, effort: mean(effort), effortWorkouts: effort.length };
  }

  function analyze(data, today) {
    const current = Coach.dayNumber(today);
    if (!Number.isFinite(current)) return null;
    const before = week(data, day(current, -14), day(current, -7));
    const after = week(data, day(current, -7), today);
    const strength = [];
    for (const [id, row] of after.strength) {
      const earlier = before.strength.get(id);
      if (earlier) strength.push({ name: row.name, reps: row.reps, before: earlier.weight, after: row.weight });
    }
    strength.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.reps - b.reps);
    const haveWeight = before.weights >= 3 && after.weights >= 3;
    const haveNutrition = before.complete >= 5 && after.complete >= 5;
    return { before, after, through: day(current, -1), strength,
      weightChange: haveWeight ? after.weight - before.weight : null,
      haveWeight, haveNutrition, ready: haveWeight && haveNutrition };
  }
  return { analyze };
});
