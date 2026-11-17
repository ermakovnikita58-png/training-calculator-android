(() => {
  const key = 'forge_v2';
  const arraySections = [
    'plans', 'workouts', 'foods', 'weights', 'programs', 'customExercises', 'mealTemplates',
    'trainingCycles', 'n10Recipes', 'forgeCustomFoods', 'forgeFavorites', 'forgeRecent'
  ];
  const objectSection = value => value && typeof value === 'object' && !Array.isArray(value);
  let persisted;
  let recovery = false;

  function load(defaults) {
    const blank = structuredClone(defaults);
    try {
      if (persisted === undefined) persisted = localStorage.getItem(key);
      if (persisted === null) return blank;
      const data = JSON.parse(persisted);
      if (!objectSection(data) ||
          arraySections.some(section => data[section] !== undefined && !Array.isArray(data[section])) ||
          ['profile', 'goals'].some(section => data[section] != null && !objectSection(data[section])) ||
          (data.profile?.name != null && typeof data.profile.name !== 'string')) {
        throw Error('Дневник повреждён');
      }
      return { ...blank, ...data, profile: { ...blank.profile, ...data.profile }, goals: { ...blank.goals, ...data.goals } };
    } catch {
      recovery = true;
      return blank;
    }
  }

  function write(diary, replaceUnreadable = false) {
    if (recovery && !replaceUnreadable) {
      throw Error('Дневник требует восстановления. Экспортируй исходный JSON или загрузи проверенную копию.');
    }
    const serialized = JSON.stringify(diary);
    localStorage.setItem(key, serialized);
    persisted = serialized;
    const recovered = recovery;
    recovery = false;
    if (recovered) window.dispatchEvent(new Event('forge:diary-recovered'));
  }

  window.ForgeDiaryStorage = {
    load, write,
    needsRecovery: () => recovery,
    hasSavedDiary: () => typeof persisted === 'string',
    unreadableBackup: () => recovery ? persisted : null
  };
})();
