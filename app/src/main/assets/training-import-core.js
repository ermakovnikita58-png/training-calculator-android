(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForgeTrainingImportCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const bundleKind = 'FORGE_CODEX_SOURCE_BUNDLE';
  const maxText = 2 * 1024 * 1024;
  const reservedNames = new Set(Object.getOwnPropertyNames(Object.prototype));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const normalize = value => value.normalize('NFC').toLowerCase().replaceAll('ё', 'е')
    .replace(/[«»„“”]/g, '"').trim().replace(/\s+/g, ' ');
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  // These entries were checked against the catalog's equipment and movement.
  const aliases = new Map(Object.entries({
    'Выпрямление ног в тренажере': 'forge-ex-211',
    'Разведение рук в стороны с гантелями стоя': 'forge-ex-130',
    'Попеременный подъём гантелей перед собой': 'forge-ex-421',
    'Разгибание на трицепс вниз на блоке используя канатную рукоять': 'forge-ex-179',
    'Жим гантелей лёжа на скамье с положительным наклоном': 'forge-ex-003',
    'Подъём гантелей на бицепс хватом «молоток»': 'forge-ex-026',
    'Подъём ягодиц со штангой, опираясь на скамью': 'forge-ex-250',
    'Румынская становая тяга': 'forge-ex-038',
    'Махи назад одной ногой с помощью троса нижнего блока': 'forge-ex-254',
    'Сведение рук в кроссовере': 'forge-ex-006',
    'Французский жим со штангой стоя': 'forge-ex-445',
    'Разгибание на трицепс на блоке стоя': 'forge-ex-028',
    'Сгибание рук на бицепс с EZ-штангой стоя': 'forge-ex-150',
    'Концентрированные сгибания на бицепс сидя': 'forge-ex-159',
    'Приседания в машине Смита': 'forge-ex-196'
  }).map(([name, id]) => [normalize(name), id]));

  function requireThat(condition, context) {
    if (!condition) throw new Error('Некорректные данные. ' + context);
  }

  function string(value, context, allowEmpty = false) {
    requireThat(typeof value === 'string' && value.length <= maxText &&
      (allowEmpty || value.trim().length > 0), context);
    return value;
  }

  function name(value, context) {
    string(value, context);
    // Old editor handlers interpolate exercise names into inline JavaScript.
    // Restrict incoming names to characters those handlers can safely receive.
    requireThat(value.trim().length <= 240 && !/[\u0000-\u001f\u007f<>'"\\]/.test(value) &&
      !reservedNames.has(value.trim()), context);
    return value;
  }

  function array(value, context, limit = 10000) {
    requireThat(Array.isArray(value) && value.length <= limit, context);
    return value;
  }

  function localDateTime(value, context) {
    const match = typeof value === 'string' &&
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    requireThat(match, context);
    const [, year, month, day, hour, minute, second = '00'] = match;
    const date = new Date(0);
    date.setUTCFullYear(+year, +month - 1, +day);
    requireThat(date.getUTCFullYear() === +year && date.getUTCMonth() === +month - 1 &&
      date.getUTCDate() === +day && +hour < 24 && +minute < 60 && +second < 60, context);
    return { date: year + '-' + month + '-' + day, time: hour + ':' + minute + ':' + second };
  }

  function checkPrograms(programs) {
    return array(programs, 'Раздел программ', 1000).map((program, i) => {
      const context = 'Программа ' + (i + 1);
      requireThat(record(program), context);
      name(program.name, context);
      array(program.notes, context + '. Заметки', 1000).forEach(note => string(note, context));
      array(program.days, context + '. Дни', 1000).forEach((day, j) => {
        const dayContext = context + ', день ' + (j + 1);
        requireThat(record(day) && Number.isInteger(day.day_number) &&
          day.day_number >= 1 && day.day_number <= 366, dayContext);
        name(day.source_day_name, dayContext);
        if (day.label !== null) name(day.label, dayContext);
        array(day.exercises, dayContext + '. Упражнения', 1000).forEach(value => name(value, dayContext));
      });
      return program;
    });
  }

  function checkSessions(sessions) {
    return array(sessions, 'Раздел тренировок').map((session, i) => {
      const context = 'Тренировка ' + (i + 1);
      requireThat(record(session), context);
      localDateTime(session.started_at_local, context + '. Дата и время');
      string(session.time_zone, context + '. Часовой пояс');
      name(session.source_title, context + '. Название');
      string(session.source_summary, context + '. Сводка', true);
      array(session.exercises, context + '. Упражнения', 1000).forEach((exercise, j) => {
        const exerciseContext = context + ', упражнение ' + (j + 1);
        requireThat(record(exercise), exerciseContext);
        name(exercise.name, exerciseContext);
        string(exercise.rest_source, exerciseContext + '. Таймеры', true);
        string(exercise.summary_source, exerciseContext + '. Сводка', true);
        array(exercise.sets, exerciseContext + '. Подходы', 1000).forEach(set => {
          requireThat(record(set) && Number.isInteger(set.index) && set.index >= 1 &&
            Number.isFinite(set.weight_kg) && set.weight_kg >= 0 &&
            Number.isInteger(set.repetitions) && set.repetitions >= 0, exerciseContext + '. Подход');
          string(set.trailing_raw, exerciseContext + '. Пометка', true);
          string(set.original, exerciseContext + '. Исходная строка', true);
        });
      });
      return session;
    });
  }

  function parseBundle(text) {
    let value;
    try { value = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON'); }
    requireThat(record(value) && value.kind === bundleKind && value.schema_version === 1 &&
      value.directly_importable_into_forge === false, 'Ожидается исходный пакет FORGE Codex версии 1');
    requireThat(record(value.source_files), 'Исходные файлы');
    const sourceFiles = {};
    for (const filename of ['programs.txt', 'workouts.txt']) {
      if (!own(value.source_files, filename)) continue;
      const source = value.source_files[filename];
      requireThat(record(source) && typeof source.sha256 === 'string' &&
        /^[a-f0-9]{64}$/i.test(source.sha256), filename);
      sourceFiles[filename] = { sha256: source.sha256, text: string(source.text, filename, true) };
    }
    return {
      kind: 'bundle',
      programs: checkPrograms(value.programs),
      completedSessions: checkSessions(value.completed_sessions),
      warnings: array(value.parsing_warnings, 'Предупреждения', 1000).map(w => string(w, 'Предупреждение')),
      sourceFiles
    };
  }

  const programDayLine = /^\d+\.\s+День\s+#?(\d+)(?:\s*[.:—-]\s*(.*))?$/iu;
  const dateLine = /^(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})(?::(\d{2}))?$/u;
  const setLine = /^\s+(\d+)\.\s+(\d+(?:[.,]\d+)?)\s*кг\s*[•·]\s*(\d+)\s*[xх×](?:\s*[•·]\s*(.*))?\s*$/iu;
  const headingLine = /^(\d+)\.\s+(.+)$/u;
  const summaryLine = /^(?:\d+(?:[.,]\d+)?\s+т\s*[•·]\s*)?\d+\s*\/\s*\d+/iu;

  function parsePrograms(text) {
    const programs = [];
    let program, day;
    for (const [index, raw] of text.split(/\r?\n/u).entries()) {
      const line = raw.trim();
      if (!line) continue;
      const context = 'Программы, строка ' + (index + 1);
      const dayMatch = programDayLine.exec(line);
      const exerciseMatch = /^\s+\d+\.\s+(.+)$/u.exec(raw);
      if (dayMatch && !exerciseMatch) {
        requireThat(program, context + '. Укажите название программы перед днём');
        day = { source_day_name: line, day_number: Number(dayMatch[1]), label: dayMatch[2] || null, exercises: [] };
        program.days.push(day);
      } else if (exerciseMatch) {
        requireThat(day, context + '. Укажите день перед упражнением');
        day.exercises.push(exerciseMatch[1].trim());
      } else if (line.startsWith('+')) {
        requireThat(program, context + '. Заметка без программы');
        program.notes.push(line);
      } else if (day && !day.exercises.length && day.label === null) {
        day.label = line;
      } else {
        requireThat(!headingLine.test(line) && (!program || program.days.length), context + '. Не распознан заголовок');
        program = { name: line, notes: [], days: [] };
        programs.push(program);
        day = null;
      }
    }
    requireThat(programs.length && programs.every(p => p.days.length), 'В TXT не найдено программ с днями');
    return {
      kind: 'programs', programs: checkPrograms(programs), completedSessions: [], warnings: [],
      sourceFiles: { 'programs.txt': { text } }
    };
  }

  function parseWorkouts(text) {
    const sessions = [];
    const warnings = [];
    let session, exercise;
    for (const [index, raw] of text.split(/\r?\n/u).entries()) {
      const line = raw.trim();
      if (!line) continue;
      const context = 'Тренировки, строка ' + (index + 1);
      const date = dateLine.exec(line);
      const set = setLine.exec(raw);
      const heading = headingLine.exec(line);
      if (date) {
        const [, day, month, year, hour, minute, second] = date;
        session = {
          started_at_local: year + '-' + month + '-' + day + 'T' + hour + ':' + minute + (second ? ':' + second : ''),
          time_zone: 'not_provided', source_title: '', source_summary: '', exercises: []
        };
        sessions.push(session);
        exercise = null;
      } else if (/^Внимание!\s*Экспорт/u.test(line)) {
        warnings.push(raw);
      } else if (set) {
        requireThat(exercise, context + '. Подход без упражнения');
        exercise.sets.push({
          index: Number(set[1]), weight_kg: Number(set[2].replace(',', '.')),
          repetitions: Number(set[3]), trailing_raw: set[4] ? '• ' + set[4].trim() : '', original: raw.trim()
        });
      } else if (heading && !/^\s/u.test(raw)) {
        requireThat(session?.source_title, context + '. Упражнение без тренировки');
        exercise = { name: heading[2], rest_source: '', summary_source: '', sets: [] };
        session.exercises.push(exercise);
      } else {
        requireThat(session, context + '. Не найдена дата тренировки');
        if (!session.source_title) session.source_title = line;
        else if (exercise && /^\d{2}:\d{2}(?:\s*\/\s*\d{2}:\d{2}){2}$/u.test(line) && !exercise.rest_source) exercise.rest_source = line;
        else if (exercise && summaryLine.test(line) && !exercise.summary_source) exercise.summary_source = line;
        else if (!exercise && !session.source_summary) session.source_summary = line;
        else requireThat(false, context + '. Не распознана строка отчёта');
      }
    }
    requireThat(sessions.length && sessions.every(s => s.exercises.length), 'В TXT не найдено тренировок с упражнениями');
    return {
      kind: 'workouts', programs: [], completedSessions: checkSessions(sessions), warnings,
      sourceFiles: { 'workouts.txt': { text } }
    };
  }

  function parse(input, options = {}) {
    const text = string(input, 'Пустой или слишком большой файл').replace(/^\uFEFF/u, '');
    const kind = options.kind ?? (/^\s*[{[]/u.test(text) ? 'bundle' :
      dateLine.test(text.split(/\r?\n/u).find(line => line.trim())?.trim() ?? '') ? 'workouts' : 'programs');
    if (kind === 'bundle') return parseBundle(text);
    if (kind === 'programs') return parsePrograms(text);
    if (kind === 'workouts') return parseWorkouts(text);
    throw new Error('Неизвестный формат источника');
  }

  function parseFiles(files) {
    requireThat(Array.isArray(files) && files.length > 0 && files.length <= 3, 'Выберите исходные файлы');
    const parsed = files.map(file => {
      requireThat(record(file), 'Исходный файл');
      const filename = String(file.name || '').toLowerCase();
      const kind = filename.endsWith('.json') ? 'bundle' :
        filename === 'programs.txt' ? 'programs' : filename === 'workouts.txt' ? 'workouts' : undefined;
      return parse(file.text, { kind });
    });
    if (parsed.length === 1) return parsed[0];
    return {
      kind: 'mixed', programs: parsed.flatMap(item => item.programs),
      completedSessions: parsed.flatMap(item => item.completedSessions),
      warnings: [...new Set(parsed.flatMap(item => item.warnings))],
      sourceFiles: Object.assign({}, ...parsed.map(item => item.sourceFiles))
    };
  }

  function fingerprint(value) {
    const text = JSON.stringify(value);
    let first = 2166136261, second = 0x9e3779b9;
    for (let i = 0; i < text.length; i++) {
      first = Math.imul(first ^ text.charCodeAt(i), 16777619);
      second = Math.imul(second ^ text.charCodeAt(i), 2246822519);
    }
    return [first, second].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function programFingerprint(program) {
    return fingerprint([normalize(program.name), program.notes.map(normalize),
      program.days.map(day => [day.day_number, normalize(day.source_day_name), normalize(day.label ?? ''), day.exercises.map(normalize)])]);
  }

  function workoutFingerprint(session) {
    const local = localDateTime(session.started_at_local, 'Дата тренировки');
    return fingerprint([local.date, local.time, session.time_zone, normalize(session.source_title),
      session.exercises.map(ex => [normalize(ex.name), ex.sets.map(set => [set.index, set.weight_kg, set.repetitions, normalize(set.trailing_raw.replace(/^\s*[•·]\s*/u, ''))])])]);
  }

  function plan(parsed, state, catalog, overrides = {}) {
    requireThat(record(parsed) && record(state) && Array.isArray(catalog) && record(overrides), 'Параметры предпросмотра');
    const programs = checkPrograms(parsed.programs);
    const completedSessions = checkSessions(parsed.completedSessions);
    const nextState = {
      ...state,
      programs: [...(state.programs ?? [])],
      workouts: [...(state.workouts ?? [])],
      customExercises: [...(state.customExercises ?? [])],
      customExerciseDetails: { ...(state.customExerciseDetails ?? {}) }
    };
    const byName = new Map(), byId = new Map();
    catalog.forEach((raw, index) => {
      const entry = Array.isArray(raw) ? { id: 'forge-ex-' + String(index + 1).padStart(3, '0'), name: raw[0] } : raw;
      if (!entry || entry.custom || typeof entry.id !== 'string' || typeof entry.name !== 'string') return;
      const item = { name: entry.name, exerciseId: entry.id, sourceType: 'system' };
      byName.set(normalize(item.name), item);
      byId.set(item.exerciseId, item);
    });
    const conflicts = [];
    const customByName = new Map();
    for (const customName of nextState.customExercises) {
      const details = nextState.customExerciseDetails[customName];
      const item = {
        name: customName,
        exerciseId: details?.id || 'forge-import-custom-' + fingerprint(normalize(customName)),
        sourceType: 'custom'
      };
      if (byId.has(item.exerciseId) && byId.get(item.exerciseId).name !== customName) {
        conflicts.push({kind:'identity', sourceName:customName, reason:'Идентификатор упражнения уже занят'});
      }
      customByName.set(normalize(customName), item);
      byId.set(item.exerciseId, item);
    }

    const mappings = new Map();
    const counts = {
      programs: 0, days: 0, plannedExercises: 0, workouts: 0, workoutExercises: 0, sets: 0,
      customExercises: 0, duplicatePrograms: 0, duplicateWorkouts: 0, unresolved: 0
    };
    const createdCustomIds = new Set();
    function resolution(sourceName) {
      if (mappings.has(sourceName)) return mappings.get(sourceName);
      const key = normalize(sourceName);
      const system = byName.get(key);
      const alias = byId.get(aliases.get(key));
      const custom = customByName.get(key);
      const manual = own(overrides, sourceName);
      const chosen = manual ? byId.get(overrides[sourceName]) : null;
      let item = chosen ?? system ?? custom ?? alias;
      let status = chosen ? (chosen.sourceType === 'custom' ? 'EXISTING_CUSTOM' : chosen === system ? 'EXISTING_SYSTEM' : 'MATCHED_ALIAS') :
        system ? 'EXISTING_SYSTEM' : custom ? 'EXISTING_CUSTOM' : alias ? 'MATCHED_ALIAS' : 'CREATED_CUSTOM';
      if (manual && overrides[sourceName] === null && !system) {
        item = custom;
        status = item ? 'EXISTING_CUSTOM' : 'CREATED_CUSTOM';
      } else if (manual && !chosen) {
        status = 'NEEDS_REVIEW';
        conflicts.push({
          kind: 'mapping', sourceName,
          reason: overrides[sourceName] === null ? 'В каталоге уже есть упражнение с таким названием' : 'Выбранное упражнение не найдено'
        });
      }
      if (!item) {
        item = {
          name: sourceName.trim(),
          exerciseId: 'forge-import-custom-' + fingerprint(key),
          sourceType: 'custom'
        };
        if (status === 'CREATED_CUSTOM') {
          if (byId.has(item.exerciseId)) conflicts.push({kind:'identity', sourceName, reason:'Идентификатор упражнения уже занят'});
          customByName.set(key, item);
          byId.set(item.exerciseId, item);
        }
      }
      const mapping = {
        ...item, sourceName, resolutionStatus: status, needsReview: status === 'NEEDS_REVIEW' ||
          (status === 'CREATED_CUSTOM' && !manual), programCount: 0, workoutCount: 0
      };
      mappings.set(sourceName, mapping);
      return mapping;
    }

    for (const program of programs) for (const day of program.days) for (const sourceName of day.exercises) resolution(sourceName).programCount++;
    for (const session of completedSessions) for (const exercise of session.exercises) resolution(exercise.name).workoutCount++;

    function exerciseRef(sourceName, used) {
      const mapping = resolution(sourceName);
      const { name: exerciseName, exerciseId, resolutionStatus } = mapping;
      if (used && mapping.sourceType === 'custom' && !createdCustomIds.has(exerciseId) &&
          !nextState.customExercises.includes(exerciseName)) {
        nextState.customExercises.push(exerciseName);
        nextState.customExerciseDetails[exerciseName] = {
          id: exerciseId, group: 'Мои упражнения', equipment: '', level: '',
          steps: '', mistakes: '', description: '',
          importSource: { sourceName, needsReview: mapping.needsReview }
        };
        createdCustomIds.add(exerciseId);
        counts.customExercises++;
      }
      if (used && mapping.sourceType === 'custom' && !nextState.customExerciseDetails[exerciseName]?.id) {
        nextState.customExerciseDetails[exerciseName] = {...nextState.customExerciseDetails[exerciseName], id:exerciseId};
      }
      return { exerciseName, exerciseId, sourceName, resolutionStatus };
    }

    const existingPrograms = new Map(nextState.programs.map(item => [item.id, item]));
    const existingWorkouts = new Map(nextState.workouts.map(item => [item.id, item]));
    function alreadyImported(existing, id, key, kind, sourceName) {
      if (!existing.has(id)) return false;
      if (existing.get(id)?.importSource?.fingerprint === key) counts[kind]++;
      else conflicts.push({ kind: 'identity', id, sourceName, reason: 'Идентификатор уже занят другой записью' });
      return true;
    }

    for (const program of programs) {
      const key = programFingerprint(program);
      const id = 'forge-import-program-' + key;
      if (alreadyImported(existingPrograms, id, key, 'duplicatePrograms', program.name)) continue;
      const days = program.days.map(day => {
        const refs = day.exercises.map(sourceName => exerciseRef(sourceName, true));
        counts.days++;
        counts.plannedExercises += refs.length;
        return {
          day: null, name: day.label?.trim() || day.source_day_name.trim(), focus: '', exerciseConfig: {},
          exercises: refs.map(ref => ref.exerciseName),
          exerciseRefs: refs.map(({ exerciseName, ...ref }) => ref),
          importSource: { dayNumber: day.day_number, sourceDayName: day.source_day_name, label: day.label }
        };
      });
      const item = {
        id, name: program.name.trim(), days,
        importSource: { format: parsed.kind, fingerprint: key, sourceName: program.name, notes: [...program.notes] }
      };
      nextState.programs.push(item);
      existingPrograms.set(id, item);
      counts.programs++;
    }

    for (const session of completedSessions) {
      const key = workoutFingerprint(session);
      const id = 'forge-import-workout-' + key;
      if (alreadyImported(existingWorkouts, id, key, 'duplicateWorkouts', session.source_title)) continue;
      const exercises = session.exercises.map(exercise => {
        const { exerciseName, ...ref } = exerciseRef(exercise.name, true);
        const sets = exercise.sets.map(set => ({
          weight: set.weight_kg, reps: set.repetitions, done: true,
          importSource: { index: set.index, trailingRaw: set.trailing_raw, original: set.original }
        }));
        counts.workoutExercises++;
        counts.sets += sets.length;
        return {
          name: exerciseName, ...ref, sets,
          importSource: { restSource: exercise.rest_source, summarySource: exercise.summary_source, hasRecordedSets: sets.length > 0 }
        };
      });
      const duration = /^(\d+):([0-5]\d):([0-5]\d)(?=\s*[•·]|$)/u.exec(session.source_summary.trim());
      const durationSeconds = duration ? +duration[1]*3600 + +duration[2]*60 + +duration[3] : null;
      const item = {
        id, name: session.source_title.trim(), date: localDateTime(session.started_at_local, 'Дата тренировки').date,
        ...(durationSeconds === null ? {} : {duration:durationSeconds/60}),
        exercises,
        sets: exercises.flatMap(exercise => exercise.sets.map(set => ({ ...set, exercise: exercise.name, exerciseId: exercise.exerciseId }))),
        importSource: {
          format: parsed.kind, fingerprint: key, startedAtLocal: session.started_at_local,
          timeZone: session.time_zone, sourceTitle: session.source_title, sourceSummary: session.source_summary,
          durationSeconds
        }
      };
      nextState.workouts.push(item);
      existingWorkouts.set(id, item);
      counts.workouts++;
    }

    const allMappings = [...mappings.values()];
    const unresolved = allMappings.filter(item => item.needsReview);
    counts.unresolved = unresolved.length;
    return {
      nextState, counts, mappings: allMappings, unresolved, conflicts,
      targets: [...byId.values()].filter(item => item.sourceType === 'system' || state.customExercises?.includes(item.name))
        .map(item => ({id:item.exerciseId, name:item.name})),
      canApply: !conflicts.length && (counts.programs > 0 || counts.workouts > 0)
    };
  }

  return { parse, parseFiles, plan };
});
