(function (root, factory) {
  const model = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.ForgeProductCore = model;
})(globalThis, function () {
  'use strict';

  const meals = Object.freeze(['Завтрак', 'Обед', 'Ужин', 'Перекус']);
  const macroKeys = ['cal', 'protein', 'fat', 'carbs'];
  const normalized = name => String(name ?? '').normalize('NFC').trim().toLocaleLowerCase('ru');
  const date = value => String(value ?? '').slice(0, 10);
  const rounded = value => Math.round(value * 10) / 10;
  const unitOf = value => value.unit === 'seconds' || Number(value.seconds) > 0 ? 'seconds' : 'reps';
  const numeric = value => {
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    if (typeof value === 'string' && !value.trim()) return NaN;
    const result = Number(value);
    return Number.isFinite(result) ? result : NaN;
  };
  const exerciseMatches = (exercise, set) => unitOf(exercise) === unitOf(set) &&
    (exercise.exerciseId && set.exerciseId
      ? exercise.exerciseId === set.exerciseId
      : normalized(exercise.name) === normalized(set.exercise ?? set.name));

  function setValues(set, unit) {
    if (!set || (set.unit && unitOf(set) !== unit)) return null;
    const weight = numeric(set.weight);
    const repeats = numeric(set[unit]);
    const limit = unit === 'seconds' ? 1800 : 100;
    if (!(weight >= 0 && weight <= 1500 && Number.isInteger(repeats) && repeats > 0 && repeats <= limit)) {
      return null;
    }
    return { weight, [unit]: repeats };
  }

  function comparableSet(history, workout, exercise, index) {
    if (!exercise?.name) return null;
    const unit = unitOf(exercise);
    // Search earlier sets in this exercise before looking through the diary.
    for (let i = index - 1; i >= 0; i--) {
      const set = exercise.sets[i];
      const values = set?.done && setValues(set, unit);
      if (values) return { values, date: date(workout.date), current: true };
    }
    const matchesIn = entry => (entry.sets || [])
      .filter(set => set && set.done !== false && set.type !== 'warmup' && exerciseMatches(exercise, set))
      .map(set => setValues(set, unit)).filter(Boolean);
    const past = (history || []).filter(entry => entry && date(entry.date) <= date(workout.date))
      .slice().sort((left, right) => {
        const samePlan = entry => Number(!!workout.programId && entry.programId === workout.programId);
        return samePlan(right) - samePlan(left) || date(right.date).localeCompare(date(left.date));
      });
    for (const entry of past) {
      const sets = matchesIn(entry);
      if (sets.length) return { values: sets[Math.min(index, sets.length - 1)], date: date(entry.date), current: false };
    }
    return null;
  }

  function prefillWorkout(workout, history) {
    if (workout.trainingCycle || workout.cycleMeta) return workout;
    const exercises = workout.exercises.map(exercise => {
      const unit = unitOf(exercise);
      const first = setValues(exercise.sets[0], unit);
      const sets = exercise.sets.map((set, index) => {
        if (set.done) return set;
        const prior = comparableSet(history, workout, exercise, index);
        return prior ? { ...set, ...prior.values } : set;
      });
      return { ...exercise, sets, ...(first ? { planned: { ...first, sets: sets.length } } : {}) };
    });
    return { ...workout, exercises };
  }

  function foodPortion(food, amount, meal, when, id) {
    const size = numeric(amount);
    if (!food?.name || !(size > 0 && size <= 100000) || !meals.includes(meal)) return null;
    const per100 = [food.cal, food.p, food.f, food.c].map(numeric);
    if (per100.some(value => !(value >= 0))) return null;
    return {
      id, date: when, name: food.name, meal,
      ...(food.unit === 'ml' ? { milliliters: size } : { grams: size }),
      cal: Math.round(per100[0] * size / 100), protein: rounded(per100[1] * size / 100),
      fat: rounded(per100[2] * size / 100), carbs: rounded(per100[3] * size / 100),
      foodSource: food.source || '', barcode: food.code || ''
    };
  }

  function copyFood(record, amount, meal, when, id) {
    if (!record?.name || !meals.includes(meal)) return null;
    const values = macroKeys.map(key => numeric(record[key]));
    if (values.some(value => !(value >= 0))) return null;
    const unit = Number(record.milliliters) > 0 ? 'milliliters' : 'grams';
    const previousAmount = numeric(record[unit]);
    const size = amount === null ? previousAmount : numeric(amount);
    if (amount !== null && !(previousAmount > 0 && size > 0 && size <= 100000)) return null;
    const scale = previousAmount > 0 ? size / previousAmount : 1;
    const result = { ...record, id, date: when, meal };
    if (Number.isFinite(size) && size > 0) result[unit] = size;
    macroKeys.forEach((key, index) => { result[key] = rounded(values[index] * scale); });
    return result;
  }

  function previousMeal(foods, meal, today, yesterdayOnly = false) {
    if (!meals.includes(meal)) return [];
    const dates = foods.filter(food => food.meal === meal && date(food.date) < today)
      .map(food => date(food.date)).sort();
    const before = yesterdayOnly ? new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) : dates.at(-1);
    return foods.filter(food => food.meal === meal && date(food.date) === before);
  }

  function foodHistory(foods, today) {
    const oldest = new Date(Date.parse(today + 'T00:00:00Z') - 89 * 86400000).toISOString().slice(0, 10);
    const ranked = new Map();
    for (const food of foods.filter(item => date(item.date) >= oldest && date(item.date) <= today)) {
      if (!food.name || macroKeys.some(key => !(numeric(food[key]) >= 0))) continue;
      const key = (food.barcode || normalized(food.name)) + (food.milliliters ? '/ml' : '/g');
      const seen = ranked.get(key);
      ranked.set(key, { count: (seen?.count || 0) + 1, food: !seen || food.date >= seen.food.date ? food : seen.food });
    }
    const entries = [...ranked.values()].reverse();
    return {
      recent: entries.slice().sort((a, b) => b.food.date.localeCompare(a.food.date)).slice(0, 8),
      frequent: entries.filter(item => item.count >= 2).sort((a, b) => b.count - a.count).slice(0, 8)
    };
  }

  return { meals, unitOf, setValues, exerciseMatches, comparableSet, prefillWorkout, foodPortion, copyFood, previousMeal, foodHistory };
});
