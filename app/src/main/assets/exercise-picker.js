(function () {
  'use strict';

  const sessions = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
  const groupInfo = value => ForgeArtStandards.muscleGroup(value);
  const groupKey = value => groupInfo(value)?.id || value;
  const groupLabels = {'Бицепс':'Бицепсы', 'Трицепс':'Трицепсы', 'Квадрицепс':'Квадрицепсы', 'Бицепс бедра':'Задняя поверхность бедра'};
  const groupLabel = value => {
    const name = groupInfo(value)?.group || value;
    return groupLabels[name] || name;
  };
  const pageSize = 40;

  function searchResults(session, items) {
    const query = normalize(session.query);
    return items.filter(item => (!session.group || groupKey(item.group) === session.group)
      && (!session.equipment || item.equipment === session.equipment)
      && (!query || normalize(item.name + ' ' + item.equipment + ' ' + groupLabel(item.group)).includes(query)));
  }

  function renderResults(session) {
    const items = forgeRefreshCatalog();
    const results = searchResults(session, items);
    const output = session.host.querySelector('[data-picker-results]');
    const count = session.host.querySelector('[data-picker-count]');
    const groupsButton = session.host.querySelector('[data-picker-groups]');
    groupsButton.hidden = !session.list;
    const equipment = session.host.querySelector('[data-picker-equipment]');
    equipment.classList.toggle('is-filtered', !!session.equipment);

    if (!session.list) {
      const groups = new Map(items.map(item => [groupKey(item.group), item.group]));
      const counts = new Map();
      for (const item of results) {
        const key = groupKey(item.group);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const ordered = [...groups].sort((a,b) => groupLabel(a[1]).localeCompare(groupLabel(b[1]),'ru'));
      count.textContent = 'Мышцы';
      output.innerHTML = '<div class="forge-picker-grid">' + ordered.map(([key, group]) => `
        <button type="button" class="forge-picker-group" data-picker-group="${escape(key)}">
          <span class="forge-picker-anatomy">${ForgeArt.muscle(group)}</span>
          <b>${escape(groupLabel(group))}</b>
          <small>${counts.get(key) || 0} упр.</small>
        </button>`).join('') + '</div>';
      return;
    }

    count.textContent = (session.group ? groupLabel(session.group) + ' · ' : '') + results.length + ' упр.';
    output.innerHTML = results.length ? `
      <div class="forge-picker-list">${results.slice(0,session.limit).map(item => {
        const source = ForgeArtStandards.systemSource(item.name);
        const customPhoto = item.custom && state.n9UserPhotos?.[item.name];
        const image = customPhoto || source;
        const selected = session.hasExercise?.(item.name);
        return `<div class="forge-picker-row x7row">
          <button type="button" class="forge-picker-item" data-picker-add="${escape(item.name)}" ${selected?'disabled':''}>
            <span class="forge-picker-thumbnail">${image
              ? `<img src="${escape(image)}" alt="" loading="lazy" ${source?'data-art-type="EXERCISE_TECHNIQUE_ART"':'data-picker-personal-photo'}>`
              : '<span aria-hidden="true">＋</span>'}</span>
            <span class="forge-picker-item-text"><b>${escape(item.name)}</b><small>${escape(groupLabel(item.group))} · ${escape(item.equipment)}</small></span>
            <span aria-label="${selected?'Уже добавлено':'Добавить'}">${selected?'✓':'＋'}</span>
          </button>
          <button type="button" class="fp-btn quiet" data-picker-detail="${escape(item.name)}" aria-label="Техника упражнения ${escape(item.name)}">ⓘ</button>
        </div>`;
      }).join('')}</div>
      ${results.length > session.limit ? '<button type="button" class="fp-btn forge-picker-more" data-picker-more>Показать ещё</button>' : ''}`
      : '<div class="fp-empty"><h3>Нет совпадений</h3><p>Измени запрос или сбрось фильтры.</p><button type="button" class="fp-btn quiet" data-picker-reset>Сбросить фильтры</button></div>';
  }

  function render(session) {
    const items = forgeRefreshCatalog();
    const custom = items.filter(item => item.custom).length;
    const equipment = [...new Set(items.map(item => item.equipment))].sort((a,b)=>a.localeCompare(b,'ru'));
    session.host.innerHTML = `<div class="forge-picker-shell">
      <header class="forge-picker-header">
        <button type="button" class="fp-btn quiet" data-picker-back aria-label="Назад">←</button>
        <div><h1>Выбрать упражнение</h1><small>${items.length-custom} базовых · ${custom} своих</small></div>
        <button type="button" class="fp-btn quiet" data-picker-create aria-label="Создать своё упражнение">＋</button>
      </header>
      <div class="forge-picker-controls">
        <input type="search" data-picker-query aria-label="Поиск упражнений" placeholder="Название или оборудование" autocomplete="off" value="${escape(session.query)}">
        <div class="forge-picker-filters">
          <button type="button" class="fp-btn quiet" data-picker-groups ${session.overlay.id==='x7BrowserBack'?'onclick="x7ShowGroups()"':''} hidden>← Мышцы</button>
          <label class="forge-picker-equipment">Оборудование
            <select data-picker-equipment aria-label="Оборудование">
              <option value="">Любое</option>
              ${equipment.map(value=>`<option ${session.equipment===value?'selected':''} value="${escape(value)}">${escape(value)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      <div class="forge-picker-body">
        <p class="forge-picker-count" data-picker-count role="status"></p>
        <div data-picker-results></div>
      </div>
    </div>`;
    renderResults(session);
  }

  function activeSession() {
    return [...sessions.values()].find(session => session.overlay.classList.contains('show'));
  }

  function open(overlay, callbacks, saved) {
    const host = overlay.querySelector('#n8-picker-content') || overlay;
    const group = saved?.group && saved.group !== 'Все' ? groupKey(saved.group) : '';
    const query = saved?.query || '';
    const equipment = saved?.equipment || saved?.equip || '';
    const session = {
      overlay, host, ...callbacks, group, query, equipment,
      list: saved?.list ?? !!(group || query.trim()),
      groupsY: saved?.groupsY || 0, limit: saved?.limit || pageSize
    };
    sessions.set(overlay.id, session);
    overlay.classList.add('forge-picker');
    render(session);
    overlay.scrollTop = saved?.y || 0;
    overlay.onscroll = () => {
      clearTimeout(session.scrollTimer);
      session.scrollTimer = setTimeout(() => window.ForgeNavigation?.persist(), 150);
    };
    host.oninput = event => {
      if (!event.target.matches('[data-picker-query]')) return;
      if (!session.list) session.groupsY = overlay.scrollTop;
      session.query = event.target.value;
      session.list = !!(session.group || session.query.trim());
      session.limit = pageSize;
      renderResults(session);
      overlay.scrollTop = 0;
    };
    host.onchange = event => {
      if (!event.target.matches('[data-picker-equipment]')) return;
      session.equipment = event.target.value;
      session.limit = pageSize;
      renderResults(session);
      overlay.scrollTop = 0;
    };
    host.onclick = event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-picker-back')) window.f6HandleAndroidBack();
      else if (button.hasAttribute('data-picker-create')) f5EditCustom('');
      else if (button.hasAttribute('data-picker-group')) openGroup(overlay.id, button.dataset.pickerGroup);
      else if (button.hasAttribute('data-picker-groups')) {
        if (!button.hasAttribute('onclick')) back(overlay.id);
      } else if (button.hasAttribute('data-picker-detail')) x7OpenDetail(encodeURIComponent(button.dataset.pickerDetail), true);
      else if (button.hasAttribute('data-picker-add')) add(session, button.dataset.pickerAdd);
      else if (button.hasAttribute('data-picker-more')) {
        session.limit += pageSize;
        renderResults(session);
      } else if (button.hasAttribute('data-picker-reset')) {
        session.query = session.equipment = '';
        session.list = !!session.group;
        session.limit = pageSize;
        render(session);
      }
    };
  }

  function openGroup(id, group) {
    const session = sessions.get(id);
    if (!session) return;
    if (!session.list) session.groupsY = session.overlay.scrollTop;
    session.group = groupKey(group);
    session.list = true;
    session.limit = pageSize;
    renderResults(session);
    session.overlay.scrollTop = 0;
    window.ForgeNavigation?.persist();
  }

  function back(id) {
    const session = sessions.get(id);
    if (!session?.list) return false;
    session.group = '';
    session.list = false;
    renderResults(session);
    session.overlay.scrollTop = session.groupsY;
    window.ForgeNavigation?.persist();
    return true;
  }

  function add(session, name) {
    if (!session.overlay.classList.contains('show') || session.hasExercise?.(name)) return;
    session.addExercise(name);
  }

  window.ForgeExercisePicker = {
    open, openGroup, back,
    snapshot(id) {
      const session = sessions.get(id);
      if (!session) return null;
      const {group, query, equipment, list, limit, groupsY, overlay} = session;
      return {group, query, equipment, list, limit, groupsY, y:overlay.scrollTop};
    },
    addFromDetail(name) {
      const session = activeSession();
      if (!session) return false;
      x7CloseDetail();
      add(session, name);
      return true;
    },
    exerciseSaved(name, isNew) {
      const session = activeSession();
      if (!session) return false;
      if (isNew) add(session, name);
      else render(session);
      return true;
    }
  };
})();
