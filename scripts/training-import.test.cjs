const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const core = require('../app/src/main/assets/training-import-core.js');
const catalog = Object.values(require('../artwork/art-registry.json').exercises);

const programs = 'Тестовая программа\n1. День #1\nОтдых\n   1. Скручивания\n   2. Движение тестовое\n   3. Движение тестовое\n+ примечание';
const workouts = '03.08.2025, 13:29\nТестовая тренировка\n00:30:15 • 0.13 т • 1 / 2 / 10\n1. Движение тестовое\n02:00/03:00/02:00\n0.13 т • 2 / 10 • 00:20\n   1. 12,5кг • 10x • 5 8\n   2. 4кг • 0x\n2. Скручивания\n0 / 0';
const fixture = [{name:'programs.txt',text:programs},{name:'workouts.txt',text:workouts}];

test('merges plans and recorded sets without changing existing data or guessing values', () => {
  const existing = {currentProgram:'existing', plans:[{day:'ПН'}], foods:[{name:'Сохранить'}],
    workouts:[{id:'old'}], programs:[{id:'existing'}], customExercises:[], customExerciseDetails:{}};
  const before = structuredClone(existing);
  const parsed = core.parseFiles(fixture);
  const plan = core.plan(parsed, existing, catalog);
  assert.deepEqual(existing, before);
  assert.equal(plan.nextState.currentProgram, 'existing');
  assert.deepEqual(plan.nextState.plans, before.plans);
  assert.deepEqual(plan.nextState.foods, before.foods);
  assert.equal(plan.counts.customExercises, 1);
  const imported = plan.nextState.programs.at(-1);
  assert.deepEqual(imported.importSource.notes, ['+ примечание']);
  const day = imported.days[0];
  assert.equal(day.name, 'Отдых');
  assert.equal(day.day, null);
  assert.deepEqual(day.exerciseConfig, {});
  assert.equal(day.exercises.length, 3);
  const history = plan.nextState.workouts.at(-1);
  assert.equal(history.date, '2025-08-03');
  assert.equal(history.importSource.timeZone, 'not_provided');
  assert.equal(history.importSource.durationSeconds, 1815);
  assert.equal(history.sets.length, 2);
  assert.equal(history.exercises[0].exerciseId, day.exerciseRefs[1].exerciseId);
  assert.equal(history.exercises[1].sets.length, 0);
  assert.equal(history.sets[0].weight, 12.5);
  assert.equal(history.sets[0].importSource.trailingRaw, '• 5 8');
  assert.deepEqual([history.sets[1].weight,history.sets[1].reps], [4,0]);
  assert.equal(history.sets.reduce((sum,s) => sum+s.weight*s.reps, 0), 125);
  const repeated = core.plan(parsed, plan.nextState, catalog);
  assert.equal(repeated.canApply, false);
  assert.equal(repeated.counts.duplicatePrograms, 1);
  assert.equal(repeated.counts.duplicateWorkouts, 1);
});

test('reuses a user exercise and respects an explicit catalog correction', () => {
  const parsed = core.parseFiles(fixture);
  const state = {customExercises:['Движение тестовое'],customExerciseDetails:{'Движение тестовое':{description:'Сохранить'}}};
  const reused = core.plan(parsed,state,catalog);
  assert.equal(reused.counts.customExercises, 0);
  assert.equal(reused.nextState.customExerciseDetails['Движение тестовое'].description, 'Сохранить');
  const target = catalog.find(x => x.name === 'Скручивания');
  const corrected = core.plan(parsed,{},catalog,{'Движение тестовое':target.id});
  assert.equal(corrected.counts.customExercises, 0);
  assert.equal(corrected.nextState.workouts[0].sets[0].exercise, target.name);
  assert.equal(core.plan(parsed,{},catalog,{'Движение тестовое':'unknown'}).canApply,false);
});

test('rejects replacement backups, malformed training data and occupied deterministic IDs', () => {
  assert.throws(() => core.parse('{"profile":{}}'));
  assert.throws(() => core.parse(workouts.replace('03.08.2025','31.02.2025')));
  assert.throws(() => core.parse(programs.replace('Движение тестовое','__proto__')));
  const parsed = core.parseFiles(fixture);
  const first = core.plan(parsed,{},catalog);
  const conflict = core.plan(parsed,{programs:[{id:first.nextState.programs[0].id}]},catalog);
  assert.equal(conflict.canApply,false);
});

test('owner source totals and cross-format deduplication', {skip:!process.env.FORGE_TRAINING_SOURCE}, () => {
  const raw = fs.readFileSync(process.env.FORGE_TRAINING_SOURCE,'utf8');
  const parsed = core.parse(raw);
  const first = core.plan(parsed,{},catalog);
  assert.deepEqual([first.counts.programs, first.counts.days, first.counts.plannedExercises, first.counts.workouts, first.counts.workoutExercises, first.counts.sets], [9,13,83,2,20,59]);
  assert.deepEqual(first.nextState.workouts.map(w => w.sets.reduce((a,s) => a+s.weight*s.reps,0)), [3925.5,4849.5]);
  const txt = core.parseFiles(Object.entries(parsed.sourceFiles).map(([name, value]) => ({name,text:value.text})));
  const repeat = core.plan(txt,first.nextState,catalog);
  assert.equal(repeat.canApply,false);
  assert.deepEqual([repeat.counts.duplicatePrograms,repeat.counts.duplicateWorkouts],[9,2]);
  assert.equal(first.nextState.programs.find(p => p.days.length === 5).days[2].name, 'Отдых');
});
