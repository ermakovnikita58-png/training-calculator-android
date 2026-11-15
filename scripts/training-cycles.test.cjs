const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/src/main/assets/training-cycles-core.js');

function plan() {
  return M.createCycle({
    id: 'program', name: 'Cycle',
    days: [
      { day: 'ПН', name: 'Upper', exercises: ['Bench', 'My exercise'],
        exerciseConfig: { Bench: { weight: 33.3, sets: 4, reps: 8, rest: 90 }, 'My exercise': { weight: 12.5, sets: 2, reps: 12 } } },
      { day: 'ЧТ', name: 'Lower', exercises: [
        { name: 'Renamed bench', exerciseId: 'lift-1' }, { name: 'Other grip', exerciseId: 'lift-2' },
        { name: 'Bench', exerciseId: 'lift-1' }, 'Bench',
      ] },
    ],
  }, '2026-11-16', 'cycle');
}

const basis = (value = 40, type = 'fiveRM') => ({ value, type, source: 'known', date: '2026-11-15' });

test('calculation rounds to the selected increment and rejects invalid inputs', () => {
  assert.deepEqual(M.calculate(40, 95, 2.5), { raw: 38, weight: 37.5 });
  assert.deepEqual(M.calculate(40, 95, 0.5), { raw: 38, weight: 38 });
  assert.deepEqual(M.calculate(1.005, 100, 0.01), { raw: 1.005, weight: 1.01 });
  for (const args of [[40, 95, 0], [40, 95, -1], [0, 95, 1], [40, 110, 1], [40, 95, NaN], ['', 95, 2.5]]) {
    assert.equal(M.calculate(...args), null);
  }
  assert.equal(M.num('12,75', 0, 100), 12.75);
  assert.equal(M.num('12.5', 1, 30, true), null);
  for (const value of [' ', '-1', '1e5', 'NaN', null, true, []]) assert.equal(M.num(value, 0, 1500), null);
  assert.equal(M.dateOK('2026-02-29'), false);
  assert.equal(M.dateOK('2028-02-29'), true);
});

test('original loads, shared IDs, independent occurrences, and measurement readiness', () => {
  const cycle = plan();
  const [first, custom] = cycle.days[0].rows;
  const [renamed, grip, same, byName] = cycle.days[1].rows;
  assert.equal(M.basisKey(renamed), M.basisKey(same));
  assert.notEqual(M.basisKey(renamed), M.basisKey(grip));
  assert.equal(M.basisKey(byName), M.basisKey(first));
  assert.deepEqual(M.plannedLoad(cycle, 7, custom), { weight: 12.5, sets: 2, reps: 12, basis: null, percent: null, raw: null });
  assert.equal(first.rest, 90);
  first.selected = byName.selected = true;
  assert.deepEqual(M.readiness(cycle), ['Bench']);
  cycle.bases[first.group] = basis();
  cycle.weeks[0].loads[first.id] = { percent: 95 };
  cycle.weeks[0].loads[byName.id] = { percent: 72 };
  assert.equal(M.plannedLoad(cycle, 0, first).weight, 37.5);
  assert.equal(M.plannedLoad(cycle, 0, byName).weight, 30);
  assert.deepEqual(M.readiness(cycle), []);
  byName.separate = true;
  assert.notEqual(M.basisKey(byName), M.basisKey(first));
  cycle.bases[byName.id] = basis(0.2);
  assert.deepEqual(M.readiness(cycle), ['Bench']); // Zero after rounding.
  cycle.bases[byName.id] = basis(35);
  assert.deepEqual(M.readiness(cycle), []);
  assert(M.validCycle(cycle));
});

test('8-week templates distinguish TM, 5RM and actual or estimated 1RM', () => {
  const cycle = plan(), row = cycle.days[0].rows[0];
  row.selected = true;
  for (const [type, expected] of Object.entries({
    trainingMax: [65, 72, 80, 65, 87, 92, 95, 100],
    fiveRM: [60, 67, 74, 60, 83, 90, 95, 100],
    oneRM: [50, 55, 62, 50, 70, 75, 80, 85],
    estimatedOneRM: [50, 55, 62, 50, 70, 75, 80, 85],
  })) {
    cycle.bases[row.group] = basis(80, type);
    const loads = cycle.weeks.map((_, index) => M.plannedLoad(cycle, index, row));
    assert.deepEqual(loads.map(load => load.percent), expected);
    assert.deepEqual(loads.map(({ sets, reps }) => [sets, reps]), [[3, 15], [3, 12], [4, 10], [2, 8], [4, 6], [4, 4], [4, 3], [5, 2]]);
  }
  cycle.weeks[5].kind = 'heavy';
  cycle.weeks[7].kind = 'taper';
  assert.equal(M.plannedLoad(cycle, 5, row).reps, 2);
  assert.equal(M.plannedLoad(cycle, 7, row).sets, 2);
  assert(M.plannedLoad(cycle, 7, row).weight < M.plannedLoad(cycle, 5, row).weight);
});

test('journal uses stable identity where available and reuse of estimator is explicit', () => {
  const cycle = plan();
  const row = cycle.days[1].rows[0];
  const records = [{ date: '2026-11-14T08:00:00Z', sets: [
    { exercise: 'Renamed bench', exerciseId: 'lift-2', weight: 100, reps: 1 },
    { exercise: 'Bench', exerciseId: 'lift-1', weight: 30, reps: 10 },
    { exercise: 'Renamed bench', weight: 31, reps: 5 },
    { exercise: 'Bench', exerciseId: 'lift-1', weight: 40, reps: 20 },
  ] }];
  const entries = M.journalSets(records, row, row.group, cycle.id);
  assert.deepEqual(entries.map(entry => [entry.weight, entry.reps]), [[30, 10], [31, 5]]);
  const seen = [];
  const estimate = (w, r) => { seen.push([w, r]); return w * (1 + r / 30); };
  assert.deepEqual(M.basisFromSet('journal', entries[0].date, 30, 10, estimate),
    { type: 'estimatedOneRM', value: 40, source: 'journal', date: '2026-11-14', weight: 30, reps: 10 });
  assert.equal(M.basisFromSet('measurement', entries[0].date, 44, 1, estimate).type, 'oneRM');
  assert.equal(M.basisFromSet('measurement', entries[0].date, 44, 0, estimate), null);
  assert.deepEqual(seen, [[30, 10]]);
});

test('rescheduling leaves competition and session snapshots intact', () => {
  const cycle = plan(), row = cycle.days[0].rows[0];
  cycle.competition = '2027-01-15';
  row.selected = true;
  cycle.bases[row.group] = basis();
  const original = M.sessions(cycle);
  assert.equal(original[1].date, '2026-11-19');
  const snapshot = M.snapshot(cycle, original[0]);
  const workout = { id: 'record', trainingCycle: snapshot, sets: [] };
  cycle.start = '2026-11-14';
  cycle.end = M.addDays(cycle.start, 55);
  cycle.bases[row.group] = basis(55);
  cycle.schedule['0:d1'] = { date: '2026-11-22', skipped: true };
  const future = M.sessions(cycle, [workout]);
  assert.equal(future[0].snapshot.rows[0].weight, 25);
  assert.equal(future[0].date, '2026-11-16');
  assert.equal(future.find(item => item.key === '0:d1').state, 'skipped');
  assert.equal(future.find(item => item.key === '0:d1').date, '2026-11-22');
  assert.equal(cycle.competition, '2027-01-15');
  assert.doesNotThrow(() => M.validateArchive({ trainingCycles: [cycle], workouts: [workout] }));
});

test('only matched, fulfilled sessions can propose a future increase', () => {
  const cycle = plan(), row = cycle.days[0].rows[0];
  cycle.mode = 'flexible';
  cycle.increase = 5;
  cycle.step = 0.5;
  row.selected = true;
  cycle.bases[row.group] = basis();
  const snapshot = M.snapshot(cycle, M.sessions(cycle)[0]);
  const workout = { id: 'x', trainingCycle: snapshot, sets: snapshot.rows.flatMap(item =>
    Array.from({ length: item.sets }, () => ({ cycleRowId: item.rowId, weight: item.weight, reps: item.reps, rir: 4 }))) };
  const pending = M.sessions(cycle, [workout]);
  const suggestion = M.progress(cycle, workout, pending, '2026-11-16')[0];
  assert.equal(suggestion.base.value, 40);
  assert.equal(suggestion.base.adjustedValue, 42);
  assert(suggestion.previews.every(item => item.to > item.from));
  assert.deepEqual(M.progress(cycle, { ...workout, sets: workout.sets.slice(1) }, pending, '2026-11-16'), []);
  assert.deepEqual(M.progress(cycle, { ...workout, sets: workout.sets.map(set => ({ ...set, rir: 2 })) }, pending, '2026-11-16'), []);
  assert.equal(M.progress(cycle, { ...workout, sets: workout.sets.map(set => ({ ...set, rir: undefined, reps: set.reps + 1 })) }, pending, '2026-11-16').length, 1);
  cycle.bases[row.group] = basis(60);
  assert.deepEqual(M.progress(cycle, workout, pending, '2026-11-16'), []);
  cycle.mode = 'fixed';
  cycle.bases[row.group] = basis();
  assert.deepEqual(M.progress(cycle, workout, pending, '2026-11-16'), []);
});

test('archive rejects duplicate sessions and invalid rows anywhere in the cycle', () => {
  const cycle = plan();
  const active = { id: 'x', trainingCycle: M.snapshot(cycle, M.sessions(cycle)[0]), exercises: [] };
  assert.doesNotThrow(() => M.validateArchive({ workouts: [] }));
  assert.doesNotThrow(() => M.validateArchive({ trainingCycles: [cycle], workouts: [], active }));
  assert.throws(() => M.validateArchive({ trainingCycles: [cycle, cycle], workouts: [] }), /план/);
  assert.throws(() => M.validateArchive({ trainingCycles: [cycle], workouts: [active], active }), /Повторяющееся/);
  active.trainingCycle.rows[1].sets = 0;
  assert.throws(() => M.validateArchive({ trainingCycles: [cycle], workouts: [], active }), /снимок/);
  cycle.weeks.at(-1).loads.e0 = { percent: 101 };
  assert.throws(() => M.validateArchive({ trainingCycles: [cycle], workouts: [] }), /план/);
});

test('an imported program keeps its catalog ID and unknown loads while making a plan', () => {
  const p = {id:'imported',name:'Imported',days:[{name:'Recorded day',day:null,importSource:{},exercises:['Imported bench'],
    exerciseRefs:[{exerciseId:'bench-press',sourceName:'Bench'}]}]};
  const cycle = M.createCycle(p, '2026-11-16', 'calendar');
  const row = cycle.days[0].rows[0];
  assert.equal(row.exerciseId,'bench-press');
  assert.deepEqual(row.original,{sets:null,reps:null,weight:null});
  assert.deepEqual(M.journalSets([{date:'2026-11-15',sets:[{exercise:'Bench',exerciseId:'bench-press',weight:40,reps:5}]}],
    row,M.basisKey(row),cycle.id).map(set=>set.weight),[40]);
});

test('existing undated 10.1 cycles retain their original weekly weights after upgrade', () => {
  const cycle = plan(), row = cycle.days[0].rows[0];
  delete cycle.end;
  delete cycle.programs;
  for (const day of cycle.days) delete day.programId;
  cycle.weeks = cycle.weeks.slice(0, 4);
  row.selected = true;
  cycle.bases[row.group] = basis(40);
  assert.equal(M.plannedLoad(cycle, 1, row).percent, 67);
  assert.equal(M.plannedLoad(cycle, 2, row).percent, 74);
  assert.equal(M.plannedLoad(cycle, 3, row).percent, 100);
  assert(M.validCycle(cycle));
});

test('multiple programs fit in the requested dates and the load advances across the whole period', () => {
  const make = (id, day) => ({ id, name: id, days: [{ day, name: id, exercises: ['Тяга'] }] });
  const cycle = M.createCycle([make('first', 'ПН'), make('second', 'ПТ')],
    '2027-02-01', 'multi', '2027-04-20');
  assert.equal(cycle.weeks.length, 12);
  const row = cycle.days[0].rows[0];
  assert.equal(row.group, cycle.days[1].rows[0].group);
  row.selected = true;
  cycle.bases[row.group] = basis();
  const plan = M.sessions(cycle);
  assert(plan.every(item => item.date >= cycle.start && item.date <= cycle.end));
  assert.deepEqual(plan.filter(item => item.week === 11).map(item => [item.day.programId, item.date]),
    [['first', '2027-04-19'], ['second', '2027-04-20']]);
  const loads = cycle.weeks.map((_, week) => M.plannedLoad(cycle, week, row));
  assert.equal(loads[0].percent, 60);
  assert.equal(loads.at(-1).percent, 100);
  assert(loads[7].percent < loads[10].percent);
  const single = M.createCycle([make('first', 'ПН'), make('second', 'ПТ')],
    '2028-02-29', 'single', '2028-02-29');
  assert.deepEqual(M.sessions(single).map(item => item.date), ['2028-02-29', '2028-02-29']);
  assert.equal(M.weekKind(single, 0), 'work');
  assert.equal(M.weekCount('2027-02-01', '2027-01-31'), 0);
});

test('holds use seconds, share only compatible bases and preserve unassigned fields', () => {
  const cycle = M.createCycle({ id: 'hold', name: 'Статика', days: [{ day: 'ПН', name: 'Статика', exercises: [
    { name: 'На луч', unit: 'seconds', weight: null, sets: null, seconds: null }, 'На луч',
  ] }] }, '2027-02-01', 'hold-cycle');
  const [hold, dynamic] = cycle.days[0].rows;
  assert.notEqual(hold.group, dynamic.group);
  assert.equal(M.plannedLoad(cycle, 0, hold).seconds, null);
  assert.equal(M.plannedLoad(cycle, 0, hold).weight, null);
  hold.selected = true;
  cycle.bases[hold.group] = M.holdBasis('measurement', '2026-11-14', 40, 20);
  const load = M.plannedLoad(cycle, 0, hold);
  assert.equal(load.seconds, 20);
  assert.equal(load.raw, 22);
  assert.equal(load.reps, undefined);
  const snapshot = M.snapshot(cycle, M.sessions(cycle)[0]);
  assert.doesNotThrow(() => M.validateArchive({ trainingCycles: [cycle], workouts: [{ id: 'x', trainingCycle: snapshot }] }));
  const pool = M.journalSets([{ date: '2026-11-14', sets: [
    { exercise: 'На луч', weight: 40, reps: 10 },
    { exercise: 'На луч', weight: 40, seconds: 20, unit: 'seconds' },
  ] }], hold, hold.group, cycle.id);
  assert.deepEqual(pool.map(item => item.seconds), [20]);
});
