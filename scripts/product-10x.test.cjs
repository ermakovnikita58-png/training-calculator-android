const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/src/main/assets/quick-diary-core.js');
const progression = require('../app/src/main/assets/progression-core.js');
const cycle = require('../app/src/main/assets/training-cycles-core.js');
const weekly = require('../app/src/main/assets/weekly-checkin-core.js');

test('prefill uses compatible recorded sets and preserves the original plan', () => {
  const workout = { date: '2026-11-21', programId: 'plan', exercises: [
    { name: 'Жим', exerciseId: 'press', sets: [{ weight: 62.5, reps: 8, done: false }] },
    { name: 'Удержание', unit: 'seconds', sets: [{ weight: 10, seconds: 20, done: false }] }
  ] };
  const history = [{ date: '2026-11-20', programId: 'plan', sets: [
    { exercise: 'Жим', exerciseId: 'other', weight: 90, reps: 9 },
    { exercise: 'Жим', exerciseId: 'press', weight: 95, reps: 9, done: false },
    { exercise: 'Жим', exerciseId: 'press', weight: 20, reps: 9, type: 'warmup' },
    { exercise: 'Жим', exerciseId: 'press', weight: 60, reps: 10, done: true },
    { exercise: 'Удержание', weight: 90, reps: 4 }
  ] }, { date: '2026-11-22', programId: 'plan', sets: [{ exercise: 'Жим', weight: 100, reps: 8 }] }];
  const result = M.prefillWorkout(workout, history);
  assert.deepEqual(result.exercises[0].planned, { weight: 62.5, reps: 8, sets: 1 });
  assert.deepEqual(result.exercises[0].sets[0], { weight: 60, reps: 10, done: false });
  assert.deepEqual(result.exercises[1].sets[0], { weight: 10, seconds: 20, done: false });
  assert.equal(workout.exercises[0].sets[0].weight, 62.5);
  const cycle = { ...workout, trainingCycle: { cycleId: 'cycle' } };
  assert.equal(M.prefillWorkout(cycle, history), cycle);
});

test('prefill preserves a new workout plan even when no previous data exists', () => {
  const workout = { date: '2026-11-21', exercises: [{ name: 'Жим', sets: [{ weight: 0, reps: 8 }] }] };
  assert.deepEqual(M.prefillWorkout(workout, []).exercises[0].planned, { weight: 0, reps: 8, sets: 1 });
  for (const weight of [null, '', undefined, NaN, Infinity, -1, 1501]) {
    assert.equal(M.setValues({ weight, reps: 10 }, 'reps'), null);
  }
});

test('portions stay in their original unit and invalid values cannot be logged', () => {
  const milk = { name: 'Молоко', unit: 'ml', cal: 50, p: 3, f: 2.5, c: 4, code: '123' };
  const record = M.foodPortion(milk, 150, 'Завтрак', '2026-11-20', 'a');
  assert.equal(record.milliliters, 150);
  assert.equal(record.grams, undefined);
  assert.deepEqual([record.cal, record.protein, record.fat, record.carbs], [75, 4.5, 3.8, 6]);
  const resized = M.copyFood(record, 75, 'Обед', '2026-11-21', 'b');
  assert.deepEqual([resized.milliliters, resized.cal, resized.barcode, resized.id], [75, 37.5, '123', 'b']);
  assert.equal(record.id, 'a');
  assert.equal(M.copyFood(record, 0, 'Обед', '2026-11-21', 'x'), null);
  assert.equal(M.foodPortion({ ...milk, c: Infinity }, 100, 'Завтрак', '2026-11-21', 'x'), null);
  assert.equal(M.foodPortion({ ...milk, c: null }, 100, 'Завтрак', '2026-11-21', 'x'), null);
  assert.equal(M.foodPortion(milk, 100, 'Invalid', '2026-11-21', 'x'), null);
});

test('yesterday and previous meal select only the matching meal and exclude today', () => {
  const record = (date, meal, id) => ({ date, meal, id, name: 'Каша', cal: 150, protein: 4, fat: 2, carbs: 28 });
  const foods = [record('2026-11-19', 'Завтрак', 'a'), record('2026-11-20', 'Ужин', 'b'),
    record('2026-11-21', 'Завтрак', 'c'), record('2026-11-22', 'Завтрак', 'd')];
  assert.deepEqual(M.previousMeal(foods, 'Завтрак', '2026-11-21', true), []);
  assert.deepEqual(M.previousMeal(foods, 'Завтрак', '2026-11-21').map(row => row.id), ['a']);
  assert.equal(M.foodHistory(foods, '2026-11-21').frequent[0].count, 3);
});

const press = 'Жим штанги лёжа';
const pressDay = { day: 'ПН', exercises: [press], exerciseConfig: { [press]: { weight: 60, sets: 3, reps: 8 } } };
const program = { id: 'p', name: 'Сила', days: [pressDay, { ...pressDay, day: 'ПТ' }],
  progression: { enabled: true, step: 2.5, stepKg: 2.5 } };

test('progression uses fulfilled planned work, reserve, compatible history and equipment increments', () => {
  const work = { weight: 60, reps: 10, rir: 2, done: true };
  const workout = { id: 'now', programId: 'p', programDay: 'ПН', date: '2026-11-21', exercises: [
    { name: press, exerciseId: 'press', planned: { weight: 60, sets: 3, reps: 8 }, sets: [work, work, work] }
  ] };
  const history = [{ id: 'before', programId: 'p', date: '2026-11-14',
    sets: [{ exercise: press, exerciseId: 'press', weight: 60, reps: 8, done: true }] }];
  const result = progression.suggest(workout, program, history);
  assert.equal(result.length, 1);
  assert.deepEqual([result[0].old, result[0].next, result[0].actual, result[0].step], [60, 62.5, 10, 2.5]);
  assert.equal(progression.apply(program, result).days[0].exerciseConfig[press].weight, 62.5);
  assert.equal(progression.apply(program, result).days[1].exerciseConfig[press].weight, 60);
  assert.equal(program.days[0].exerciseConfig[press].weight, 60);
  assert.equal(workout.exercises[0].sets[0].weight, 60);
  assert.deepEqual(progression.suggest(workout, program, []), []);
  assert.deepEqual(progression.suggest(workout, program, [{ ...history[0], programId: 'unrelated' }]), []);
  assert.deepEqual(progression.suggest({ ...workout, trainingCycle: {} }, program, history), []);
  const changed = structuredClone(workout);
  changed.exercises[0].sets[0] = { weight: 60, reps: 10, rpe: 9, done: true };
  assert.deepEqual(progression.suggest(changed, program, history), []);
  const unavailable = { ...program, progression: { enabled: true, stepKg: 5 } };
  assert.deepEqual(progression.suggest(workout, unavailable, history), []);
});

test('cycle presets distinguish lifts and holds, support TM derivation and keep old plans readable', () => {
  const hold = 'Удержание кисти';
  const arm = { id: 'arm', name: 'Кисть', days: [{ day: 'СР', name: 'Кисть', exercises: [hold],
    exerciseConfig: { [hold]: { weight: 12, sets: 3, unit: 'seconds', seconds: 20 } } }] };
  const measured = { type: 'oneRM', value: 100, date: '2026-11-20', source: 'known' };
  const max = cycle.trainingMaxFrom(measured, '90');
  assert.deepEqual([max.value, max.type, max.origin.percent], [90, 'trainingMax', 90]);
  assert(cycle.validBasis(max));
  assert.equal(cycle.trainingMaxFrom({ ...measured, type: 'fiveRM' }, 90), null);
  assert.equal(cycle.trainingMaxFrom(measured, 99), null);
  for (const name of Object.keys(cycle.presets)) {
    const plan = cycle.createCycle([program, arm], '2026-11-23', 'example', '2027-01-17', name);
    const upper = plan.days[0].rows[0], held = plan.days.at(-1).rows[0];
    upper.selected = true;
    held.selected = true;
    plan.bases[upper.group] = measured;
    plan.bases[held.group] = cycle.holdBasis('known', '2026-11-20', 12, 20);
    assert(cycle.validCycle(JSON.parse(JSON.stringify(plan))));
    assert(cycle.plannedLoad(plan, 7, upper).weight <= 85);
    assert.equal(cycle.plannedLoad(plan, 7, held).seconds, 20);
    if (name === 'power') assert.equal(cycle.plannedLoad(plan, 0, upper).reps, 6);
    if (name === 'arm') assert.equal(cycle.plannedLoad(plan, 0, upper).reps, 8);
    if (name === 'custom') assert.equal(cycle.plannedLoad(plan, 0, upper).reps, 8);
  }
  assert.throws(() => cycle.createCycle(program, '2026-11-23', 'a', '2026-12-06', 'invalid'));
});

test('weekly review excludes incomplete days and today from trends and never writes to the diary', () => {
  const today = '2026-11-21';
  const days = Array.from({ length: 15 }, (_, i) => cycle.addDays(today, i - 14));
  const data = {
    weights: days.map((date, i) => ({ date, weight: i < 7 ? 76 : i < 14 ? 75 : 120 })),
    foods: days.map((date, i) => ({ date, cal: i % 7 < 5 ? 2000 : 9999, protein: 150, fat: 70, carbs: 195 })),
    nutritionCoach: { daily: Object.fromEntries(days.map((date, i) => [date, { complete: i % 7 < 5 }])) },
    currentProgram: 'p', plans: [pressDay],
    workouts: [0, 1].map(i => ({ date: days[i * 7], programId: 'p', programDay: 'ПН', sets: [
      { exercise: press, exerciseId: 'press', weight: 60 + i * 2.5, reps: 8, done: true, rpe: 8 },
      { exercise: press, exerciseId: 'press', weight: 90, seconds: 10, done: true },
      { exercise: press, exerciseId: 'press', weight: 120, reps: 8, done: false }
    ] }))
  };
  const before = JSON.stringify(data);
  const review = weekly.analyze(data, today);
  assert.equal(review.ready, true);
  assert.deepEqual([review.weightChange, review.after.nutrition.cal, review.after.complete, review.after.programDays], [-1, 2000, 5, 1]);
  assert.deepEqual(review.strength.map(item => [item.before, item.after]), [[60, 62.5]]);
  assert.equal(review.after.effort, 8);
  assert.equal(JSON.stringify(data), before);
  assert.equal(weekly.analyze({ ...data, weights: [data.weights[0]] }, today).weightChange, null);
  assert.equal(weekly.analyze({ ...data, nutritionCoach: {} }, today).ready, false);
});
