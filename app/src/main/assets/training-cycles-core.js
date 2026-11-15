(function (root, factory) {
  const model = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.ForgeCycleModel = model;
})(globalThis, function () {
  'use strict';

  const DAY = 86_400_000;
  const weekdays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
  const kinds = ['work', 'deload', 'heavy', 'taper'];
  const types = ['trainingMax', 'fiveRM', 'oneRM', 'estimatedOneRM', 'hold'];
  const sources = ['known', 'journal', 'measurement'];
  // Percentages refer directly to the selected base. 1RM has its own progression.
  const templates = {
    trainingMax: [65, 72, 80, 65, 87, 92, 95, 100],
    fiveRM: [60, 67, 74, 60, 83, 90, 95, 100],
    oneRM: [50, 55, 62, 50, 70, 75, 80, 85],
    hold: [55, 60, 65, 55, 70, 75, 80, 85],
  };
  const volume = [[3, 15], [3, 12], [4, 10], [2, 8], [4, 6], [4, 4], [4, 3], [5, 2]];
  const progressionWeeks = [0, 1, 2, 4, 5, 6, 7];
  const limits = Object.freeze({ weeks: 52, sets: 30, reps: 100, seconds: 1800, weight: 1500, step: 100, days: 28, rows: 160 });
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

  function weekCount(start, end) {
    if (!dateOK(start) || !dateOK(end) || end < start) return 0;
    const weeks = Math.floor((dayNumber(end) - dayNumber(start)) / 7) + 1;
    return weeks <= limits.weeks ? weeks : 0;
  }

  function endDate(cycle) {
    return cycle.end ?? addDays(cycle.start, cycle.weeks.length * 7 - 1);
  }

  function durationKey(exercise) {
    return exercise.unit === 'seconds' ? 'seconds' : 'reps';
  }

  function validLoad(load) {
    if (!record(load) || !(load.unit === undefined || load.unit === 'seconds')) return false;
    const duration = durationKey(load);
    return (load.sets === null || integer(load.sets, 1, limits.sets)) &&
      (load[duration] === null || integer(load[duration], 1, limits[duration])) &&
      (load.weight === null || range(load.weight, 0, limits.weight));
  }

  function basisKey(row) { return row.separate ? row.id : row.group; }

  function includesProgram(cycle, id) {
    return cycle.programs ? cycle.programs.some(program => program.id === id) : cycle.programId === id;
  }

  function createCycle(selection, start, id, end = dateOK(start) ? addDays(start, 55) : '') {
    const programs = Array.isArray(selection) ? selection : [selection];
    const count = weekCount(start, end);
    if (!count) throw Error('Укажи корректные даты цикла до 52 недель');
    if (!programs.length || programs.some(program => !text(program?.id) || !text(program?.name) ||
        !program.days?.some(day => day.exercises?.length))) throw Error('Выбери хотя бы одну программу с упражнениями');
    const groups = new Map();
    let sequence = 0;
    let dayIndex = 0;
    const days = programs.flatMap(program => program.days.flatMap(day => {
      const rows = (day.exercises || []).map((exercise, index) => {
        const name = typeof exercise === 'string' ? exercise : exercise.name;
        if (!text(name)) throw Error('У каждого упражнения должно быть название');
        const saved = Object.hasOwn(day.exerciseConfig || {}, name) ? day.exerciseConfig[name] : {};
        const config = { ...(typeof exercise === 'object' ? exercise : {}), ...saved };
        const exerciseId = [day.exerciseRefs?.[index]?.exerciseId, config.exerciseId, config.id].find(value => text(value));
        const duration = durationKey(config);
        const identity = duration + '/' + (exerciseId ? 'id:' + exerciseId : 'name:' + name.normalize('NFC').trim().toLocaleLowerCase('ru'));
        if (!groups.has(identity)) groups.set(identity, 'b' + groups.size);
        const unit = duration === 'seconds' ? { unit: 'seconds' } : {};
        return {
          id: 'e' + sequence++, group: groups.get(identity), name, ...(exerciseId ? { exerciseId } : {}),
          ...unit, selected: false, separate: false,
          original: {
            ...unit,
            sets: config.sets === null ? null : num(config.sets, 1, limits.sets, true) ?? (day.importSource ? null : 3),
            [duration]: config[duration] === null ? null : num(config[duration], 1, limits[duration], true) ?? (day.importSource ? null : 10),
            weight: config.weight === null ? null : num(config.weight, 0, limits.weight) ?? (day.importSource ? null : 20),
          },
          rest: num(config.rest, 10, 1800, true) ?? null,
        };
      });
      if (!rows.length) return [];
      return [{ id: 'd' + dayIndex++, programId: program.id, weekday: weekdays.indexOf(day.day), name: day.name || 'Тренировка', rows }];
    }));
    if (!days.length) throw Error('Сначала добавь упражнения в программу');
    if (days.length > limits.days || sequence > limits.rows) throw Error('Слишком много дней или упражнений для одного цикла');
    const cycle = {
      version: 1, id, programId: programs[0].id, programs: programs.map(({ id, name }) => ({ id, name })),
      name: programs.map(program => program.name).join(' + ').slice(0, 200), start, end, competition: '', days,
      status: 'draft', stage: 0, week: 0, mode: 'fixed', step: 2.5, targetRir: 2, extraReps: 1,
      increase: num(programs[0].progression?.step, 0.5, 10) ?? 2.5,
      weeks: Array.from({ length: count }, () => ({ kind: null, loads: {} })),
      bases: {}, schedule: {},
    };
    if (!validCycle(cycle)) throw Error('Некорректные данные программы');
    return cycle;
  }

  function automaticDeload(count) {
    return count < 5 ? -1 : Math.round((count - 1) * 3 / 7);
  }

  function weekKind(cycle, index) {
    const count = cycle.weeks.length;
    return cycle.weeks[index].kind || (index === count - 1 && count > 1 ? 'heavy' :
      index === automaticDeload(count) ? 'deload' : 'work');
  }

  function defaultVolume(cycle, index, type) {
    const kind = weekKind(cycle, index);
    const percentages = templates[type === 'estimatedOneRM' ? 'oneRM' : type || 'trainingMax'];
    if (kind === 'taper') return { sets: 2, reps: 3, percent: percentages[0] };
    if (kind === 'heavy') return { sets: 5, reps: 2, percent: percentages.at(-1) };
    const count = cycle.weeks.length;
    const deload = automaticDeload(count);
    const workingCount = count - Number(deload >= 0);
    const phase = Math.max(0, index - Number(deload >= 0 && index >= deload)) / Math.max(1, workingCount - 1) * 6;
    const low = progressionWeeks[Math.floor(phase)];
    const high = progressionWeeks[Math.ceil(phase)];
    const percent = Math.round(percentages[low] + (percentages[high] - percentages[low]) * (phase % 1));
    if (kind === 'deload') return { sets: 2, reps: 8, percent: Math.min(percentages[3], percent) };
    const [sets, reps] = volume[progressionWeeks[Math.round(phase)]];
    return { sets, reps, percent };
  }

  function calculate(base, percent, step) {
    if (!range(base, 0.001, limits.weight) || !range(percent, 1, 100) || !range(step, 0.01, limits.step)) return null;
    const raw = tidy(base * percent / 100);
    const weight = tidy(Math.round((base * percent / 100) / step + 1e-10) * step);
    return range(weight, 0, limits.weight) ? { raw, weight } : null;
  }

  function plannedLoad(cycle, index, row) {
    const savedBase = row.selected ? cycle.bases[basisKey(row)] : null;
    const seconds = durationKey(row) === 'seconds';
    const base = savedBase && (savedBase.type === 'hold') === seconds ? savedBase : null;
    const saved = cycle.weeks[index].loads[row.id] || {};
    const field = durationKey(row);
    if (!row.selected) return { ...row.original, sets: saved.sets ?? row.original.sets,
      [field]: saved[field] ?? row.original[field], weight: saved.weight ?? row.original.weight, percent: null, raw: null, basis: null };
    const plan = defaultVolume(cycle, index, base?.type || (seconds ? 'hold' : 'trainingMax'));
    const percent = saved.percent ?? plan.percent;
    const result = { sets: saved.sets ?? plan.sets, percent, ...(seconds
      ? { unit: 'seconds', seconds: saved.seconds ?? base?.seconds ?? null }
      : { reps: saved.reps ?? plan.reps }) };
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

  function holdBasis(source, date, weight, seconds) {
    const value = num(weight, 0.001, limits.weight);
    const duration = num(seconds, 1, limits.seconds, true);
    return value !== null && duration !== null && dateOK(date) && sources.includes(source)
      ? { type: 'hold', value, seconds: duration, source, date } : null;
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
        const countKey = durationKey(row);
        if (durationKey(set) !== countKey) continue;
        const count = num(set[countKey], 1, countKey === 'seconds' ? limits.seconds : 15, true);
        if (weight !== null && count !== null) pool.push({ date, weight, [countKey]: count, name: set.exercise });
      }
    }
    return pool.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }

  function sessionKey(week, dayId) { return week + ':' + dayId; }

  function scheduledDays(cycle, week) {
    const remaining = dayNumber(endDate(cycle)) - dayNumber(cycle.start) - week * 7 + 1;
    const from = ((dayNumber(cycle.start) + 3) % 7 + 7) % 7; // Thursday, January 1, 1970.
    const days = cycle.days.map((day, index) => ({ day, offset: day.weekday < 0 ? Math.min(index, 6) : (day.weekday - from + 7) % 7 }));
    if (remaining >= 7) return days;
    const available = days.filter(item => item.offset < remaining);
    // A short final week still schedules one day per selected program.
    for (const program of cycle.programs || [{ id: cycle.programId }]) {
      if (available.some(item => (item.day.programId || cycle.programId) === program.id)) continue;
      const next = days.filter(item => (item.day.programId || cycle.programId) === program.id).sort((a, b) => a.offset - b.offset)[0];
      if (next) available.push({ ...next, offset: remaining - 1 });
    }
    return available;
  }

  function sessions(cycle, workouts = [], active = null) {
    const completed = new Map();
    for (const work of workouts) {
      const snap = work.trainingCycle;
      if (snap?.cycleId === cycle.id) completed.set(sessionKey(snap.week, snap.dayId), work);
    }
    const live = active?.trainingCycle;
    const activeKey = live?.cycleId === cycle.id ? sessionKey(live.week, live.dayId) : null;
    return cycle.weeks.flatMap((_, week) => {
      const scheduled = scheduledDays(cycle, week);
      for (const day of cycle.days) {
        const key = sessionKey(week, day.id);
        if (scheduled.some(item => item.day === day)) continue;
        if (completed.has(key) || activeKey === key || cycle.schedule[key]?.date) scheduled.push({ day, offset: 0 });
      }
      return scheduled.map(({ day, offset }) => {
        const key = sessionKey(week, day.id);
        const entry = cycle.schedule[key];
        const workout = completed.get(key);
        const snapshot = workout?.trainingCycle || (activeKey === key ? live : null);
        return {
          key, week, day, date: snapshot?.date || entry?.date || addDays(cycle.start, week * 7 + offset),
          state: workout ? 'done' : activeKey === key ? 'started' : entry?.skipped ? 'skipped' : 'pending',
          snapshot, workout,
        };
      });
    }).sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);
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
      version: 1, cycleId: cycle.id, programId: session.day.programId || cycle.programId, name: cycle.name,
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
    const checked = snapshot.rows.filter(plan => plan.sets !== null && plan[durationKey(plan)] !== null && plan.weight !== null).map(plan => ({
      plan,
      sets: (workout.sets || []).filter(set => set.cycleRowId === plan.rowId).slice(0, plan.sets),
    }));
    if (checked.some(({ plan, sets }) => sets.length !== plan.sets || sets.some(set =>
      !range(set.weight, plan.weight, limits.weight) ||
      !integer(set[durationKey(plan)], plan[durationKey(plan)], limits[durationKey(plan)])))) return [];
    const byBasis = new Map();
    for (const item of checked) {
      const key = item.plan.basisKey;
      if (!key || item.plan.unit === 'seconds') continue;
      if (!byBasis.has(key)) byBasis.set(key, []);
      byBasis.get(key).push(item);
    }
    const changes = [];
    for (const [key, rows] of byBasis) {
      if (!rows.every(({ plan, sets }) => sets.every(set =>
        (integer(set.rir, 0, 10) && set.rir > cycle.targetRir) || set.reps >= plan.reps + cycle.extraReps))) continue;
      const base = cycle.bases[key];
      if (!base) continue;
      if (rows.some(({ plan }) => JSON.stringify(plan.basis) !== JSON.stringify(base))) continue;
      const currentBase = base.adjustedValue ?? base.value;
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
    if (base.type === 'hold') return integer(base.seconds, 1, limits.seconds);
    if (base.source === 'known' ? base.type === 'estimatedOneRM' :
      (!range(base.weight, 0.001, limits.weight) || !integer(base.reps, 1, 15) ||
      base.type !== (base.reps === 1 ? 'oneRM' : 'estimatedOneRM'))) return false;
    return base.adjustedValue === undefined
      ? base.adjustedOn === undefined
      : range(base.adjustedValue, 0.001, limits.weight) && dateOK(base.adjustedOn);
  }

  function validCycle(cycle) {
    if (!record(cycle) || cycle.version !== 1 || !text(cycle.id) || !text(cycle.programId) || !text(cycle.name) ||
      !dateOK(cycle.start) || !(cycle.competition === '' || dateOK(cycle.competition) && cycle.competition >= cycle.start) ||
      !['draft', 'active'].includes(cycle.status) || !integer(cycle.stage, 0, 2) ||
      !['fixed', 'flexible'].includes(cycle.mode) || !range(cycle.step, 0.01, limits.step) ||
      !integer(cycle.targetRir, 0, 10) || !integer(cycle.extraReps, 1, 10) || !range(cycle.increase, 0.5, 10) ||
      !Array.isArray(cycle.days) || !integer(cycle.days.length, 1, limits.days) ||
      !Array.isArray(cycle.weeks) || !integer(cycle.weeks.length, 1, limits.weeks) || !integer(cycle.week, 0, cycle.weeks.length - 1) ||
      !record(cycle.bases) || !record(cycle.schedule)) return false;
    if (cycle.end !== undefined && weekCount(cycle.start, cycle.end) !== cycle.weeks.length) return false;
    if (cycle.programs !== undefined && (!Array.isArray(cycle.programs) || !cycle.programs.every(program =>
      record(program) && text(program.id) && text(program.name)) || cycle.programs[0]?.id !== cycle.programId ||
      new Set(cycle.programs.map(program => program.id)).size !== cycle.programs.length)) return false;
    const rows = new Map();
    const groups = new Set();
    const days = new Set();
    for (const day of cycle.days) {
      if (!record(day) || !/^d\d+$/.test(day.id) || days.has(day.id) || !text(day.name) ||
          (day.programId !== undefined && !includesProgram(cycle, day.programId)) ||
          !integer(day.weekday, -1, 6) || !Array.isArray(day.rows) || !day.rows.length) return false;
      days.add(day.id);
      for (const row of day.rows) {
        if (!record(row) || !/^e\d+$/.test(row.id) || rows.has(row.id) || !/^b\d+$/.test(row.group) ||
          !text(row.name) || (row.exerciseId !== undefined && !text(row.exerciseId)) ||
          typeof row.selected !== 'boolean' || typeof row.separate !== 'boolean' ||
          !validLoad(row.original) || row.unit !== row.original.unit || !(row.rest === null || integer(row.rest, 10, 1800))) return false;
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
          if (field === durationKey(rows.get(key))) return integer(value, 1, limits[field]);
          if (field === 'percent') return range(value, 1, 100);
          if (field === 'weight') return range(value, 0, limits.weight);
          return false;
        })))) return false;
    return Object.entries(cycle.schedule).every(([key, entry]) => {
      const [, week, day] = /^(\d+):(d\d+)$/.exec(key) || [];
      return week !== undefined && String(Number(week)) === week && integer(Number(week), 0, cycle.weeks.length - 1) &&
        days.has(day) && record(entry) && (entry.skipped === undefined || typeof entry.skipped === 'boolean') &&
        (entry.date === undefined || dateOK(entry.date) && entry.date >= cycle.start && (cycle.end === undefined || entry.date <= cycle.end));
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
      if (!/^[be]\d+$/.test(row.basisKey) || !validBasis(row.basis) ||
          (row.basis.type === 'hold') !== (row.unit === 'seconds')) return false;
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

  return Object.freeze({ limits, weekdays, kinds, types, dayNumber, dateOK, addDays, num, tidy, createCycle, weekCount, endDate,
    durationKey, includesProgram, holdBasis, sessionKey,
    basisKey, weekKind, calculate, plannedLoad, basisFromSet, journalSets, sessions, readiness, snapshot, progress,
    validBasis, validCycle, validateArchive });
});
