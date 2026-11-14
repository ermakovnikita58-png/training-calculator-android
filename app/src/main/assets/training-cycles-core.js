(function (root, factory) {
  const model = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.ForgeCycleModel = model;
})(globalThis, function () {
  'use strict';

  const DAY = 86_400_000;
  const weekdays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
  const kinds = ['work', 'deload', 'heavy', 'taper'];
  const types = ['trainingMax', 'fiveRM', 'oneRM', 'estimatedOneRM'];
  const sources = ['known', 'journal', 'measurement'];
  // Percentages refer directly to the selected base. 1RM has its own progression.
  const templates = {
    trainingMax: [65, 72, 80, 65, 87, 92, 95, 100],
    fiveRM: [60, 67, 74, 60, 83, 90, 95, 100],
    oneRM: [50, 55, 62, 50, 70, 75, 80, 85],
  };
  const volume = [[3, 15], [3, 12], [4, 10], [2, 8], [4, 6], [4, 4], [4, 3], [5, 2]];
  const limits = Object.freeze({ weeks: 52, sets: 30, reps: 100, weight: 1500, step: 100, days: 28, rows: 160 });
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value, length = 200) => typeof value === 'string' && value.trim().length > 0 && value.length <= length;
  const range = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const integer = (value, min, max) => Number.isInteger(value) && range(value, min, max);
  const tidy = value => Number(value.toFixed(6));
  const sameName = (a, b) => a.normalize('NFC').trim().toLocaleLowerCase('ru') === b.normalize('NFC').trim().toLocaleLowerCase('ru');

  function dayNumber(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
    const time = Date.parse(date + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time / DAY : NaN;
  }

  function dateOK(date) {
    return range(dayNumber(date), dayNumber('1900-01-01'), dayNumber('9999-12-31'));
  }

  function addDays(date, count) {
    return new Date((dayNumber(date) + count) * DAY).toISOString().slice(0, 10);
  }

  function num(value, min, max, whole = false) {
    if (typeof value === 'string' && !/^\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
    if (!['string', 'number'].includes(typeof value)) return null;
    const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
    return (whole ? integer : range)(n, min, max) ? n : null;
  }

  function validLoad(load) {
    return record(load) && integer(load.sets, 1, limits.sets) && integer(load.reps, 1, limits.reps) &&
      range(load.weight, 0, limits.weight);
  }

  function basisKey(row) { return row.separate ? row.id : row.group; }

  function createCycle(program, start, id) {
    if (!text(program?.id) || !Array.isArray(program.days) || !dateOK(start)) throw Error('Нет доступной программы');
    const groups = new Map();
    let sequence = 0;
    const days = program.days.flatMap((day, i) => {
      const rows = (day.exercises || []).map(exercise => {
        const name = typeof exercise === 'string' ? exercise : exercise.name;
        if (!text(name)) throw Error('У каждого упражнения должно быть название');
        const saved = Object.hasOwn(day.exerciseConfig || {}, name) ? day.exerciseConfig[name] : {};
        const config = { ...(typeof exercise === 'object' ? exercise : {}), ...saved };
        const exerciseId = [config.exerciseId, config.id].find(value => text(value));
        const identity = exerciseId ? 'id:' + exerciseId : 'name:' + name.normalize('NFC').trim().toLocaleLowerCase('ru');
        if (!groups.has(identity)) groups.set(identity, 'b' + groups.size);
        return {
          id: 'e' + sequence++, group: groups.get(identity), name, ...(exerciseId ? { exerciseId } : {}),
          selected: false, separate: false,
          original: {
            sets: num(config.sets, 1, limits.sets, true) ?? 3,
            reps: num(config.reps, 1, limits.reps, true) ?? 10,
            weight: num(config.weight, 0, limits.weight) ?? 20,
          },
          rest: num(config.rest, 10, 1800, true) ?? null,
        };
      });
      if (!rows.length) return [];
      return [{ id: 'd' + i, weekday: weekdays.indexOf(day.day), name: day.name || 'Тренировка', rows }];
    });
    if (!days.length) throw Error('Сначала добавь упражнения в программу');
    if (days.length > limits.days || sequence > limits.rows) throw Error('Слишком много дней или упражнений для одного цикла');
    const cycle = {
      version: 1, id, programId: program.id, name: program.name, start, competition: '', days,
      status: 'draft', stage: 0, week: 0, mode: 'fixed', step: 2.5, targetRir: 2, extraReps: 1,
      increase: num(program.progression?.step, 0.5, 10) ?? 2.5,
      weeks: Array.from({ length: 8 }, () => ({ kind: null, loads: {} })),
      bases: {}, schedule: {},
    };
    if (!validCycle(cycle)) throw Error('Некорректные данные программы');
    return cycle;
  }

  function weekKind(cycle, index) {
    return cycle.weeks[index].kind || (index > 0 && index === cycle.weeks.length - 1 ? 'heavy' : index === 3 ? 'deload' : 'work');
  }

  function defaultVolume(cycle, index, type) {
    const kind = weekKind(cycle, index);
    if (kind === 'taper') return { sets: 2, reps: 3, percent: type === 'oneRM' || type === 'estimatedOneRM' ? 55 : 65 };
    const slot = kind === 'heavy' ? 7 : kind === 'deload' ? 3 : Math.min(6, index === 3 ? 4 : index);
    const [sets, reps] = volume[slot];
    return { sets, reps, percent: templates[type === 'estimatedOneRM' ? 'oneRM' : type || 'trainingMax'][slot] };
  }

  function calculate(base, percent, step) {
    if (!range(base, 0.001, limits.weight) || !range(percent, 1, 100) || !range(step, 0.01, limits.step)) return null;
    const raw = tidy(base * percent / 100);
    const weight = tidy(Math.round((base * percent / 100) / step + 1e-10) * step);
    return range(weight, 0, limits.weight) ? { raw, weight } : null;
  }

  function plannedLoad(cycle, index, row) {
    const base = row.selected ? cycle.bases[basisKey(row)] : null;
    const saved = cycle.weeks[index].loads[row.id] || {};
    if (!row.selected) return { ...row.original, ...saved, percent: null, raw: null, basis: null };
    const plan = defaultVolume(cycle, index, base?.type);
    const percent = saved.percent ?? plan.percent;
    const result = { sets: saved.sets ?? plan.sets, reps: saved.reps ?? plan.reps, percent };
    const calc = base && calculate(base.adjustedValue ?? base.value, percent, cycle.step);
    return { ...result, raw: calc?.raw ?? null, weight: calc?.weight ?? null, basis: base || null };
  }

  function basisFromSet(source, date, weight, reps, estimate) {
    const kg = num(weight, 0.001, limits.weight);
    const count = num(reps, 1, 15, true);
    if (!dateOK(date) || kg === null || count === null || !['measurement', 'journal'].includes(source)) return null;
    // A real single is an observed result. Repeated sets use the existing FORGE estimator.
    const value = count === 1 ? kg : tidy(estimate(kg, count));
    if (!range(value, 0.001, limits.weight)) return null;
    return { type: count === 1 ? 'oneRM' : 'estimatedOneRM', value, source, date, weight: kg, reps: count };
  }

  function matches(set, row) {
    if (typeof set.exerciseId === 'string' && row.exerciseId) return row.exerciseId === set.exerciseId;
    return text(set.exercise) && sameName(set.exercise, row.name);
  }

  function journalSets(workouts, row, key, cycleId) {
    const pool = [];
    for (const workout of workouts) {
      const date = typeof workout.date === 'string' ? workout.date.slice(0, 10) : '';
      if (!dateOK(date)) continue;
      const snapshot = workout.trainingCycle;
      for (const set of workout.sets || []) {
        const original = snapshot?.rows?.find(item => item.rowId === set.cycleRowId);
        if (!matches(set, row) || (snapshot?.cycleId === cycleId && original && original.basisKey !== key)) continue;
        const weight = num(set.weight, 0.001, limits.weight);
        const reps = num(set.reps, 1, 15, true);
        if (weight !== null && reps !== null) pool.push({ date, weight, reps, name: set.exercise });
      }
    }
    return pool.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }

  function sessionKey(week, dayId) { return week + ':' + dayId; }

  function sessions(cycle, workouts = [], active = null) {
    const from = ((dayNumber(cycle.start) + 3) % 7 + 7) % 7; // 1970-01-01 was Thursday.
    const completed = new Map();
    for (const work of workouts) {
      const snap = work.trainingCycle;
      if (snap?.cycleId === cycle.id) completed.set(sessionKey(snap.week, snap.dayId), work);
    }
    const live = active?.trainingCycle;
    const activeKey = live?.cycleId === cycle.id ? sessionKey(live.week, live.dayId) : null;
    return cycle.weeks.flatMap((_, week) => cycle.days.map((day, index) => {
      const key = sessionKey(week, day.id);
      const entry = cycle.schedule[key];
      const workout = completed.get(key);
      const snapshot = workout?.trainingCycle || (activeKey === key ? live : null);
      const offset = day.weekday < 0 ? Math.min(index, 6) : (day.weekday - from + 7) % 7;
      return {
        key, week, day, date: snapshot?.date || entry?.date || addDays(cycle.start, week * 7 + offset),
        state: workout ? 'done' : activeKey === key ? 'started' : entry?.skipped ? 'skipped' : 'pending',
        snapshot, workout,
      };
    })).sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);
  }

  function readiness(cycle, pending = sessions(cycle)) {
    const missing = new Set();
    for (const session of pending) {
      if (session.state !== 'pending') continue;
      for (const row of session.day.rows) {
        if (row.selected && !(plannedLoad(cycle, session.week, row).weight > 0)) missing.add(row.name);
      }
    }
    return [...missing];
  }

  function snapshot(cycle, session) {
    return {
      version: 1, cycleId: cycle.id, programId: cycle.programId, name: cycle.name,
      week: session.week, dayId: session.day.id, dayName: session.day.name, date: session.date,
      rows: session.day.rows.map(row => {
        const load = plannedLoad(cycle, session.week, row);
        return {
          rowId: row.id, name: row.name, ...(row.exerciseId ? { exerciseId: row.exerciseId } : {}),
          basisKey: row.selected ? basisKey(row) : null,
          ...load, ...(load.basis ? { basis: { ...load.basis }, step: cycle.step } : {}),
        };
      }),
    };
  }

  function progress(cycle, workout, pending, date) {
    const snapshot = workout.trainingCycle;
    if (cycle.mode !== 'flexible' || !snapshot) return [];
    const checked = snapshot.rows.map(plan => ({
      plan,
      sets: (workout.sets || []).filter(set => set.cycleRowId === plan.rowId).slice(0, plan.sets),
    }));
    if (checked.some(({ plan, sets }) => sets.length !== plan.sets ||
        sets.some(set => !range(set.weight, plan.weight, limits.weight) || !integer(set.reps, plan.reps, limits.reps)))) return [];
    const byBasis = new Map();
    for (const item of checked) {
      const key = item.plan.basisKey;
      if (!key) continue;
      if (!byBasis.has(key)) byBasis.set(key, []);
      byBasis.get(key).push(item);
    }
    const changes = [];
    for (const [key, rows] of byBasis) {
      if (!rows.every(({ plan, sets }) => sets.every(set =>
        (integer(set.rir, 0, 10) && set.rir > cycle.targetRir) || set.reps >= plan.reps + cycle.extraReps))) continue;
      const base = cycle.bases[key];
      if (!base) continue;
      const currentBase = base.adjustedValue ?? base.value;
      if (rows.some(({ plan }) => JSON.stringify(plan.basis) !== JSON.stringify(base))) continue;
      const value = tidy(currentBase * (1 + cycle.increase / 100));
      if (!range(value, 0.001, limits.weight)) continue;
      const previews = [];
      let valid = true;
      for (const session of pending) {
        if (session.state !== 'pending') continue;
        for (const row of session.day.rows) {
          if (!row.selected || basisKey(row) !== key) continue;
          const load = plannedLoad(cycle, session.week, row);
          const next = calculate(value, load.percent, cycle.step);
          if (!next || !(load.weight > 0)) valid = false;
          else if (next.weight > load.weight) previews.push({ name: session.day.name, date: session.date, from: load.weight, to: next.weight });
        }
      }
      if (valid && previews.length) changes.push({ key, name: rows[0].plan.name, before: currentBase,
        base: { ...base, adjustedValue: value, adjustedOn: date }, previews });
    }
    return changes;
  }

  function validBasis(base) {
    if (!record(base) || !types.includes(base.type) || !sources.includes(base.source) ||
        !dateOK(base.date) || !range(base.value, 0.001, limits.weight)) return false;
    if (base.source === 'known' ? base.type === 'estimatedOneRM' :
      (!range(base.weight, 0.001, limits.weight) || !integer(base.reps, 1, 15) ||
      base.type !== (base.reps === 1 ? 'oneRM' : 'estimatedOneRM'))) return false;
    return base.adjustedValue === undefined
      ? base.adjustedOn === undefined
      : range(base.adjustedValue, 0.001, limits.weight) && dateOK(base.adjustedOn);
  }

  function validCycle(cycle) {
    if (!record(cycle) || cycle.version !== 1 || !text(cycle.id) || !text(cycle.programId) || !text(cycle.name) ||
      !dateOK(cycle.start) || cycle.start > '9998-12-31' ||
      !(cycle.competition === '' || dateOK(cycle.competition) && cycle.competition >= cycle.start) ||
      !['draft', 'active'].includes(cycle.status) || !integer(cycle.stage, 0, 2) ||
      !['fixed', 'flexible'].includes(cycle.mode) || !range(cycle.step, 0.01, limits.step) ||
      !integer(cycle.targetRir, 0, 10) || !integer(cycle.extraReps, 1, 10) || !range(cycle.increase, 0.5, 10) ||
      !Array.isArray(cycle.days) || !integer(cycle.days.length, 1, limits.days) ||
      !Array.isArray(cycle.weeks) || !integer(cycle.weeks.length, 1, limits.weeks) || !integer(cycle.week, 0, cycle.weeks.length - 1) ||
      !record(cycle.bases) || !record(cycle.schedule)) return false;
    const rows = new Map();
    const groups = new Set();
    const days = new Set();
    for (const day of cycle.days) {
      if (!record(day) || !/^d\d+$/.test(day.id) || days.has(day.id) || !text(day.name) ||
          !integer(day.weekday, -1, 6) || !Array.isArray(day.rows) || !day.rows.length) return false;
      days.add(day.id);
      for (const row of day.rows) {
        if (!record(row) || !/^e\d+$/.test(row.id) || rows.has(row.id) || !/^b\d+$/.test(row.group) ||
          !text(row.name) || (row.exerciseId !== undefined && !text(row.exerciseId)) ||
          typeof row.selected !== 'boolean' || typeof row.separate !== 'boolean' ||
          !validLoad(row.original) || !(row.rest === null || integer(row.rest, 10, 1800))) return false;
        rows.set(row.id, row);
        groups.add(row.group);
      }
    }
    if (rows.size > limits.rows) return false;
    if (!Object.entries(cycle.bases).every(([key, base]) => (rows.has(key) || groups.has(key)) && validBasis(base))) return false;
    if (!cycle.weeks.every(week => record(week) && (week.kind === null || kinds.includes(week.kind)) &&
      record(week.loads) && Object.entries(week.loads).every(([key, update]) => rows.has(key) && record(update) &&
        Object.entries(update).every(([field, value]) => {
          if (field === 'sets') return integer(value, 1, limits.sets);
          if (field === 'reps') return integer(value, 1, limits.reps);
          if (field === 'percent') return range(value, 1, 100);
          if (field === 'weight') return range(value, 0, limits.weight);
          return false;
        })))) return false;
    return Object.entries(cycle.schedule).every(([key, entry]) => {
      const [, week, day] = /^(\d+):(d\d+)$/.exec(key) || [];
      return week !== undefined && String(Number(week)) === week && integer(Number(week), 0, cycle.weeks.length - 1) &&
        days.has(day) && record(entry) && (entry.skipped === undefined || typeof entry.skipped === 'boolean') &&
        (entry.date === undefined || dateOK(entry.date) && entry.date >= cycle.start);
    });
  }

  function validSnapshot(value) {
    if (!record(value) || value.version !== 1 || !text(value.cycleId) || !text(value.programId) ||
        !text(value.name) || !integer(value.week, 0, limits.weeks - 1) || !/^d\d+$/.test(value.dayId) ||
        !text(value.dayName) || !dateOK(value.date) || !Array.isArray(value.rows) ||
        !integer(value.rows.length, 1, limits.rows)) return false;
    const ids = new Set();
    return value.rows.every(row => {
      if (!validLoad(row) || !/^e\d+$/.test(row.rowId) || ids.has(row.rowId) || !text(row.name) ||
          (row.exerciseId !== undefined && !text(row.exerciseId))) return false;
      ids.add(row.rowId);
      if (row.basis === null) return row.basisKey === null && row.percent === null && row.raw === null;
      if (!/^[be]\d+$/.test(row.basisKey) || !validBasis(row.basis)) return false;
      const calculated = calculate(row.basis.adjustedValue ?? row.basis.value, row.percent, row.step);
      return calculated !== null && row.weight > 0 && row.weight === calculated.weight && row.raw === calculated.raw;
    });
  }

  function validateArchive(data) {
    const cycles = data.trainingCycles === undefined ? [] : data.trainingCycles;
    if (!Array.isArray(cycles) || !cycles.every(validCycle) || new Set(cycles.map(cycle => cycle.id)).size !== cycles.length) {
      throw Error('Некорректный план тренировочного цикла');
    }
    const ids = new Set();
    for (const workout of [...data.workouts, ...(data.active ? [data.active] : [])]) {
      if (workout.trainingCycle === undefined) continue;
      const value = workout.trainingCycle;
      if (!validSnapshot(value) || !text(workout.id)) throw Error('Некорректный снимок занятия цикла');
      const key = value.cycleId + '/' + sessionKey(value.week, value.dayId);
      if (ids.has(key)) throw Error('Повторяющееся занятие цикла');
      ids.add(key);
      if ([...(workout.sets || []), ...(workout.exercises || []).flatMap(item => item.sets)].some(set =>
        set.rir !== undefined && !integer(set.rir, 0, 10))) throw Error('Некорректный запас повторений');
    }
  }

  return Object.freeze({ limits, weekdays, kinds, types, dayNumber, dateOK, addDays, num, tidy, createCycle,
    basisKey, weekKind, calculate, plannedLoad, basisFromSet, journalSets, sessionKey, sessions, readiness, snapshot, progress,
    validBasis, validCycle, validateArchive });
});
