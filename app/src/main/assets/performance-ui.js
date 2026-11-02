/* FORGE Performance UI. Presentation over the existing diary and calculation engines. */
(function () {
  'use strict';
  const V=ForgePerformanceViews, $=id=>document.getElementById(id), KEY='forge_performance_ui_v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d=0)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(Number(n)||0);
  const day=d=>String(d||'').slice(0,10), validDate=d=>Number.isFinite(ForgeNutrition.dayNumber(d));
  const shift=(d,n)=>new Date((ForgeNutrition.dayNumber(d)+n)*86400000).toISOString().slice(0,10);
  const label=d=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  const sum=(rows,key)=>rows.reduce((s,r)=>s+(Number(r[key])||0),0);
  let prefs={date:today(),exercise:'',historyLimit:20}, pendingMeal=null, replacement=null;
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.version===1){prefs={...prefs,...saved.prefs};if(state.active&&saved.workoutId===state.active.id)V.rest.restore(saved.rest);}}catch{}
  if(!validDate(prefs.date)||prefs.date>today())prefs.date=today();
  function persist(){try{localStorage.setItem(KEY,JSON.stringify({version:1,prefs,workoutId:state.active?.id,rest:V.rest.snapshot()}));}catch{}}
  const paths={home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',workout:'M3 8v8M6 5v14M18 5v14M21 8v8M6 12h12',nutrition:'M5 3v6c0 2 4 2 4 0V3M7 11v10M17 3c-4 4-4 9 0 9h2M19 3v18',plan:'M8 3h8v4H8zM8 5H5v16h14V5h-3M8 12h8M8 17h6',progress:'M4 20V4M4 20h17M7 15l4-5 4 2 5-7',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',settings:'m10 3-1 3-3 1-3 3 2 3-1 3 3 3 3-1 3 2 3-2 3 1 3-3-1-3 2-3-3-3-3-1-1-3zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',arrow:'M5 12h14M13 6l6 6-6 6',plus:'M12 4v16M4 12h16',weight:'M4 7h16l-2 14H6zM9 7a3 3 0 0 1 6 0M12 12v4',search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M15 15l6 6',book:'M4 3h12a4 4 0 0 1 4 4v14H7a3 3 0 0 1 0-6h13M4 3v15M8 7h8',check:'m4 12 5 5L20 6',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 6v6l4 2',back:'m15 5-7 7 7 7',close:'m6 6 12 12M18 6 6 18'};
  const icon=name=>`<svg class="fp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.arrow}"/></svg>`;
  const button=(action,text,params=[],kind='',ico='')=>`<button type="button" class="fp-btn ${kind}" data-fp-action="${action}" data-fp-params="${esc(JSON.stringify(params))}">${ico?icon(ico):''}${esc(text)}</button>`;
  const heading=(eyebrow,title,sub='')=>`<div class="fp-eyebrow">${esc(eyebrow)}</div><h1 class="n8-heading">${esc(title)}</h1>${sub?`<p class="n8-sub">${esc(sub)}</p>`:''}`;
  const section=(title,action='')=>`<div class="fp-section"><h2>${esc(title)}</h2>${action}</div>`;
  const card=html=>`<div class="fp-card">${html}</div>`;
  const metric=(name,value,unit='',caption='')=>card(`<div class="fp-label">${esc(name)}</div><div class="fp-value">${esc(value)} ${unit?`<small>${esc(unit)}</small>`:''}</div>${caption?`<p class="fp-caption">${esc(caption)}</p>`:''}`);
  const meter=(n,max)=>`<div class="fp-meter"><span style="width:${Math.min(100,Math.max(0,max>0?n/max*100:0))}%"></span></div>`;
  const empty=(title,text,action='',ico='progress')=>`<div class="fp-empty">${icon(ico)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  const root=(id,html)=>{$(id).querySelector('.n8-root').innerHTML=html;};
  const history=()=>[...(state.workouts||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const recent=(n)=>history().filter(w=>day(w.date)>=shift(today(),1-n)&&day(w.date)<=today());
  const training=d=>!!d?.exercises?.length;
  function foodTotals(date){const rows=(state.foods||[]).filter(f=>day(f.date)===date);return {rows,cal:sum(rows,'cal'),protein:sum(rows,'protein'),fat:sum(rows,'fat'),carbs:sum(rows,'carbs')};}
  function macro(name,value,target){return `<div><div class="fp-macro-label"><span>${esc(name)}</span><b>${fmt(value,1)} / ${fmt(target,1)} г</b></div>${meter(value,target)}</div>`;}
  function renderHome(){
    const ws=recent(7),tot=foodTotals(today()),last=history()[0],weights=[...(state.weights||[])].filter(w=>day(w.date)<=today()).sort((a,b)=>a.date.localeCompare(b.date));
    const wi=(new Date().getDay()+6)%7,plans=state.plans||[],index=training(plans[wi])?wi:plans.findIndex(training),plan=plans[index];
    const title=state.active?.name||plan?.name||'Свободная тренировка',goal=Number(state.profile.weeklyGoal)||4;
    root('home',`${heading(new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'}),`Привет, ${state.profile.name||'Атлет'}.`,'Твой план. Твой темп. Твой прогресс.')}
      <article class="fp-hero"><div class="fp-hero-top"><span class="fp-eyebrow">${state.active?'Тренировка сохранена':'Ближайшая тренировка'}</span><span class="fp-chip active">${state.active?'В процессе':index===wi?'Сегодня':'По плану'}</span></div><h2>${esc(title)}</h2><p>${esc(state.active?'Продолжи с того подхода, на котором остановился.':plan?.focus||'Начни с упражнений из своей программы.')}</p>${button('start',state.active?'Продолжить тренировку':'Начать тренировку',[],'primary','workout')}</article>
      <div class="fp-grid">${metric('Тренировки · 7 дней',`${ws.length} / ${goal}`,'','Недельная цель')}${metric('Объём · 7 дней',fmt(ws.reduce((s,w)=>s+V.volume(w),0)),'кг','Вес × повторения')}</div>
      ${section('Недельный ритм',button('go','Программы',['plan'],'quiet','arrow'))}${card(`${meter(ws.length,goal)}<div class="fp-week">${Array.from({length:7},(_,i)=>{const d=shift(today(),i-6),done=ws.some(w=>day(w.date)===d);return `<span class="${done?'done':''}"><span>${esc(new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'short'}))}</span><i aria-hidden="true"></i><span class="fp-sr">${done?'Есть завершённая тренировка':'Нет завершённой тренировки'}</span></span>`}).join('')}</div>`)}
      ${section('Питание сегодня',button('go','Дневник',['nutrition'],'quiet','arrow'))}${card(`<div class="fp-summary-row"><div><div class="fp-value">${fmt(tot.cal)} <small>ккал</small></div><p class="fp-caption">из ${fmt(state.goals.calories)} · ${tot.rows.length?'записано в дневник':'пока нет записей'}</p></div>${icon('nutrition')}</div><div class="fp-macros">${macro('Белки',tot.protein,state.goals.protein)}${macro('Жиры',tot.fat,state.goals.fat)}${macro('Углеводы',tot.carbs,state.goals.carbs)}</div>`)}
      ${section('Последний результат')}${last?card(`<div class="fp-label">${esc(label(day(last.date)))}</div><div class="fp-list-row"><div><b>${esc(last.name)}</b><p>${V.sets(last)} подходов · ${last.duration?fmt(last.duration)+' мин':'длительность не указана'}</p></div><strong>${fmt(V.volume(last))} кг</strong></div>${button('go','История тренировок',['progress'],'quiet','arrow')}`):empty('Первая запись впереди','После завершения тренировки здесь появится твой результат.',button('start','Начать',[],'','workout'))}
      ${section('Быстрые действия')}<div class="fp-actions">${button('food','Еда',[],'','plus')}${button('weight','Вес',[],'','weight')}${button('go','Программа',['plan'],'','plan')}</div>
      ${section('Коротко о прогрессе')}${card(`<div class="fp-summary-row"><div><div class="fp-label">Последняя масса</div><div class="fp-value">${weights.length?fmt(weights.at(-1).weight,1):'—'} <small>кг</small></div><p class="fp-caption">${weights.length?esc(label(weights.at(-1).date)):'Добавь измерение, чтобы видеть динамику'}</p></div>${button('stats','Смотреть',['weight'],'quiet','arrow')}</div>`)}`);
  }
  function programCard(p,templateIndex=null){
    const days=p.days||[],groups=[...new Set(days.map(d=>d.focus).filter(Boolean))].join(' · '),count=days.filter(training).length;
    return `<article class="fp-card fp-program ${state.currentProgram===p.id?'active':''}"><div class="fp-program-meta"><span class="fp-chip ${state.currentProgram===p.id?'active':''}">${templateIndex!==null?'Готовая программа':state.currentProgram===p.id?'Активная':'Моя программа'}</span><span class="fp-chip">${count||days.length} дн./нед.</span></div><h2>${esc(p.name)}</h2><p>${esc(groups||p.desc||'Собственная программа тренировок')}</p><div class="fp-caption">Продолжительность зависит от упражнений и отдыха.</div><div class="fp-actions">${templateIndex!==null?button('template','Добавить программу',[templateIndex],'','plus'):button('editProgram','Открыть',[p.id],'','plan')}${templateIndex===null&&state.currentProgram!==p.id?button('activate','Выбрать',[p.id],'quiet'):''}</div></article>`;
  }
  function renderPlan(){
    root('plan',`${heading('План / подготовка','Программы.','Готовая структура или собственный план — с твоими рабочими весами.')}
      <div class="fp-actions">${button('newProgram','Создать программу',[],'primary','plus')}${button('go','Каталог',['library'],'','book')}</div>
      ${section('Мои программы')}<div class="fp-stack">${state.programs?.length?state.programs.map(p=>programCard(p)).join(''):empty('Твой план начинается здесь','Выбери готовую программу ниже или создай свою.',button('newProgram','Создать',[],'','plus'),'plan')}</div>
      ${section('Неделя')}<div class="fp-card">${(state.plans||[]).map((d,i)=>`<div class="fp-day-row"><strong>${esc(d.day)}</strong><div><b>${esc(d.name)}</b><p>${esc(d.focus||'Восстановление')} · ${d.exercises?.length||0} упражнений</p></div><div class="fp-actions">${button('editDay','',[i],'', 'plan').replace('type="button"','type="button" aria-label="Редактировать '+esc(d.day)+'"')}${training(d)?button('chooseDay','',[i],'quiet','workout').replace('type="button"','type="button" aria-label="Начать '+esc(d.name)+'"'):''}</div></div>`).join('')}</div>
      ${section('Готовые программы')}<div class="fp-stack">${V.templates.map((p,i)=>programCard(p,i)).join('')}</div>
      ${section('Инструменты')}<div class="fp-actions">${button('go','Силовые циклы',['cycles'],'','progress')}${button('go','556 упражнений',['library'],'','book')}</div>`);
  }
  function enhanceWorkout(){
    V.workout();const a=state.active,container=$('workout').querySelector('.n8-root');if(!a)return;
    const chosen=a.exercises?.[V.index()];if(!chosen)return;
    const target=container.querySelector('.n8-surface'),prev=history().flatMap(w=>(w.sets||[]).filter(s=>s.exercise===chosen.name).map(s=>({...s,date:day(w.date)}))).slice(0,3);
    if(target){target.insertAdjacentHTML('afterbegin',`<div class="fp-caption" id="fp-previous-result">${prev.length?'Ранее: '+prev.map(s=>`${fmt(s.weight,1)} кг × ${fmt(s.reps)} (${label(s.date)})`).map(esc).join(' · '):'Первое выполнение в этом дневнике — предыдущих результатов пока нет.'}</div>`);target.insertAdjacentHTML('beforeend',`<div class="fp-actions" style="margin-top:16px">${button('replaceExercise','Заменить',[],'quiet')}${button('removeSet','Удалить последний подход',[],'quiet')}</div>`);}
    const titleRow=target?.querySelector('.n8-row');if(titleRow){titleRow.className='fp-current-heading';titleRow.innerHTML=`<img src="${esc(ForgeArt.source(chosen.name)||ForgeArt.missingData(chosen.name))}" alt="${esc(chosen.name)}"><div><div class="fp-eyebrow">${V.index()+1} / ${a.exercises.length}</div><h2>${esc(chosen.name)}</h2></div>${button('exerciseCard','',[chosen.name],'quiet','book').replace('type="button"','type="button" aria-label="Техника упражнения"')}`;}
    const strip=container.querySelector('.n8-exstrip'),section=container.querySelector('.n8-section');
    if(strip&&target){const details=document.createElement('details');details.className='fp-card';details.innerHTML=`<summary>Упражнения · ${a.exercises.length}</summary>`;a.exercises.forEach((ex,i)=>{const pic=strip.children[i]?.querySelector('.pic');if(pic)pic.innerHTML=`<img src="${esc(ForgeArt.source(ex.name)||ForgeArt.missingData(ex.name))}" alt="${esc(ex.name)}"><small>${ex.sets.filter(s=>s.done).length}/${ex.sets.length}</small>`;});details.append(strip);if(section)details.append(section);target.after(details);}
    const sub=container.querySelector('.n8-worktop .n8-sub');if(sub)sub.dataset.fpWorkoutClock='true';
    container.querySelectorAll('.n8-setgrid input').forEach(el=>el.inputMode='decimal');updateChrome();
  }
  function initNutrition(){
    if($('fp-nutrition-date'))return;
    $('nutrition').innerHTML=`${heading('Ежедневное восстановление','Питание.','Всё, что ты записал. Без догадок о пропущенных приёмах пищи.')}
      <div class="fp-datebar">${button('dateShift','',[-1],'','back').replace('type="button"','type="button" aria-label="Предыдущий день"')}<label class="fp-sr" for="fp-nutrition-date">День питания</label><input id="fp-nutrition-date" type="date" max="${today()}" aria-label="День питания">${button('dateShift','',[1],'','arrow').replace('type="button"','type="button" aria-label="Следующий день"')}</div>
      <div class="fp-card"><div class="fp-summary-row"><span class="fp-label" id="fp-nutrition-period">Сегодня</span>${button('coach','Настроить цель',[],'quiet')}</div><div class="fp-calories"><span id="caloriesEaten">0</span> <small>ккал</small></div><div class="fp-caption">Текущая цель: <span id="calorieGoal">0</span> ккал</div><p id="fp-calorie-remaining" class="fp-caption"></p><div class="progressbar" style="margin-top:16px"><span id="calorieBar"></span></div><div class="fp-macros">${[['protein','Белки'],['fat','Жиры'],['carb','Углеводы']].map(([id,name])=>`<div><div class="fp-macro-label"><span>${name}</span><b id="${id}Val"></b></div><div class="macro"><span id="${id}Bar"></span></div></div>`).join('')}</div></div>
      <div class="fp-actions">${button('food','Добавить еду',[],'primary','plus')}${button('favorites','Избранное',[],'','book')}</div>
      <button id="nc-entry" class="nc-entry" data-fp-action="coach"><span class="fp-eyebrow">Nutrition Coach</span><br>Персональная цель — по шагам →</button>
      <div class="fp-actions">${button('recipes','Рецепты',[],'','book')}${button('go','Рационы',['meals'],'','plan')}${button('go','Продукты / штрихкод',['foodcatalog'],'','search')}</div>
      ${section('Приёмы пищи')}<div class="fp-card" id="foodList"></div>
      <div class="fp-card" id="fp-water"><div class="fp-summary-row"><h2>Вода сегодня</h2><span class="fp-label" id="waterCupCount"></span></div><p class="fp-caption" id="waterVal"></p><div class="macro"><span id="waterBar"></span></div><div class="fp-actions" style="margin-top:16px"><button class="fp-btn" onclick="addWater(250)">+250 мл</button><button class="fp-btn" onclick="addWater(500)">+500 мл</button><button class="fp-btn quiet" onclick="addWater(-250)">−250 мл</button></div></div>`;
    $('fp-nutrition-date').onchange=e=>{if(validDate(e.target.value)&&e.target.value<=today()){prefs.date=e.target.value;persist();renderNutrition();}else e.target.value=prefs.date;};
  }
  const baseNutrition=renderNutrition;
  renderNutrition=function(){
    initNutrition();baseNutrition();const t=foodTotals(prefs.date);$('fp-nutrition-date').value=prefs.date;
    $('caloriesEaten').textContent=fmt(t.cal);$('fp-nutrition-period').textContent=prefs.date===today()?'Сегодня':label(prefs.date)+' · история';
    $('calorieBar').style.width=Math.min(100,t.cal/Math.max(1,state.goals.calories)*100)+'%';
    $('fp-calorie-remaining').textContent=prefs.date===today()?t.cal<=state.goals.calories?`До цели ${fmt(state.goals.calories-t.cal)} ккал`:`Выше цели на ${fmt(t.cal-state.goals.calories)} ккал`:'Сравнение с текущей целью; историческая цель могла отличаться.';
    for(const [id,key] of [['protein','protein'],['fat','fat'],['carb','carbs']]){$(id+'Val').textContent=`${fmt(t[key],1)} / ${fmt(state.goals[key],1)} г`;$(id+'Bar').style.width=Math.min(100,t[key]/Math.max(1,state.goals[key])*100)+'%';}
    $('fp-water').hidden=prefs.date!==today();
    const meals=['Завтрак','Обед','Ужин','Перекус'],classify=f=>meals.includes(f.meal)?f.meal:'Перекус';
    $('foodList').innerHTML=meals.map(meal=>{const rows=t.rows.filter(f=>classify(f)===meal);return `<section class="fp-meal"><div class="fp-section"><h2>${meal}</h2><span class="fp-label">${rows.length?fmt(sum(rows,'cal'))+' ккал':'Нет записей'}</span></div>${rows.map(f=>`<div class="fp-list-row"><div><b>${esc(f.name)}</b><p>${f.grams?fmt(f.grams,1)+' г · ':''}Б ${fmt(f.protein,1)} · Ж ${fmt(f.fat,1)} · У ${fmt(f.carbs,1)}</p></div><strong class="fp-number">${fmt(f.cal)}</strong>${button('removeFood','',[f.id],'quiet','close').replace('type="button"','type="button" aria-label="Удалить '+esc(f.name)+'"')}</div>`).join('')}${prefs.date===today()?button('food','Добавить',[meal],'quiet','plus'):''}</section>`;}).join('');
  };
  let chartCounter=0;
  function chart(points,unit,title){
    if(!points.length)return empty('Пока недостаточно данных','Добавь записи за выбранный период — здесь появится твоя динамика.');
    const id='fp-chart-'+(++chartCounter),lo=Math.min(...points.map(p=>p.v)),hi=Math.max(...points.map(p=>p.v)),spread=Math.max(1,hi-lo),coords=points.map((p,i)=>({x:28+i*288/Math.max(1,points.length-1),y:140-(p.v-lo)/spread*108}));
    return `<div class="fp-chart-widget" id="${id}" data-fp-points="${esc(JSON.stringify(points))}" data-fp-unit="${esc(unit)}"><svg class="fp-chart" viewBox="0 0 340 180" role="img" aria-label="${esc(title)}"><path class="fp-chart-grid" d="M28 32H316M28 86H316M28 140H316"/><text x="28" y="20">${esc(fmt(hi,1))} ${esc(unit)}</text><text x="28" y="165">${esc(label(points[0].date))}</text><text x="316" y="165" text-anchor="end">${esc(label(points.at(-1).date))}</text><polyline class="fp-chart-line" points="${coords.map(p=>p.x+','+p.y).join(' ')}"/>${coords.filter((_,i)=>points.length<32||i===points.length-1).map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3"/>`).join('')}</svg><div class="fp-chart-control"><label class="fp-sr" for="${id}-range">Выбрать точку графика</label><input id="${id}-range" type="range" min="0" max="${points.length-1}" value="${points.length-1}" step="1" data-fp-chart-range aria-valuetext="${esc(label(points.at(-1).date)+': '+fmt(points.at(-1).v,1)+' '+unit)}"></div><output class="fp-chart-output" aria-live="polite">${esc(label(points.at(-1).date))} · ${fmt(points.at(-1).v,1)} ${esc(unit)}</output><details class="fp-chart-table"><summary>Данные таблицей</summary><table><thead><tr><th>Дата</th><th>${esc(unit)}</th></tr></thead><tbody>${points.map(p=>`<tr><td>${esc(p.date)}</td><td>${fmt(p.v,1)}</td></tr>`).join('')}</tbody></table></details></div>`;
  }
  function renderProgress(){
    const {tab,days}=V.stats(),dates=Array.from({length:days},(_,i)=>shift(today(),i-days+1)),ws=recent(days),weights=(state.weights||[]).filter(w=>dates.includes(day(w.date))).slice().sort((a,b)=>a.date.localeCompare(b.date));let main='';
    if(tab==='volume'){const points=dates.map(date=>({date,v:ws.filter(w=>day(w.date)===date).reduce((s,w)=>s+V.volume(w),0)}));main=card(`<div class="fp-label">Объём за ${days} дней</div><div class="fp-value">${fmt(sum(points,'v'))} <small>кг</small></div>${ws.length?chart(points,'кг','Тренировочный объём'):empty('История начинается с тренировки','Завершённые подходы появятся здесь.',button('start','Начать тренировку',[],'','workout'))}`)+`<div class="fp-grid">${metric('Тренировок',ws.length)}${metric('Подходов',ws.reduce((s,w)=>s+V.sets(w),0))}</div>`;}
    if(tab==='weight')main=card(`<div class="fp-label">Масса тела</div><div class="fp-value">${weights.length?fmt(weights.at(-1).weight,1):'—'} <small>кг</small></div>${chart(weights.map(w=>({date:day(w.date),v:Number(w.weight)})),'кг','Динамика массы тела')}${button('weight','Записать вес',[],'','plus')}`);
    if(tab==='strength'){
      const names=[...new Set(ws.flatMap(w=>(w.sets||[]).map(s=>s.exercise)))].filter(Boolean);if(!names.includes(prefs.exercise))prefs.exercise=names[0]||'';
      const points=ws.slice().reverse().map(w=>({date:day(w.date),v:Math.max(0,...(w.sets||[]).filter(s=>s.exercise===prefs.exercise&&Number(s.reps)>0).map(s=>V.oneRM(Number(s.weight),Number(s.reps))))})).filter(p=>p.v>0),last=points.at(-1),first=points[0];
      main=card(`<div class="fp-label">Расчётный 1ПМ · существующая формула Эпли</div><p class="fp-caption">Ориентир по записанным подходам, а не измеренный максимум.</p>${names.length?`<label class="fp-field" style="margin-top:16px">Упражнение<select id="fp-strength-exercise">${names.map(n=>`<option ${n===prefs.exercise?'selected':''}>${esc(n)}</option>`).join('')}</select></label><div class="fp-value" style="margin-top:20px">${fmt(last?.v,1)} <small>кг</small></div><p class="fp-caption">${points.length>1?'Изменение за период: '+(last.v-first.v>=0?'+':'')+fmt(last.v-first.v,1)+' кг':'Нужно несколько тренировок для сравнения.'}</p>${chart(points,'кг','Изменение расчётного 1ПМ')}`:empty('Силовые результаты ещё впереди','Запиши подход с весом и повторениями в тренировке.')}${button('go','1ПМ / 5ПМ и циклы',['cycles'],'quiet','arrow')}`);
    }
    if(tab==='muscles'){
      const groups=new Map(forgeRefreshCatalog().map(x=>[x.name,x.group])),counts=new Map();for(const w of ws)for(const s of w.sets||[]){const g=groups.get(s.exercise)||'Другие';counts.set(g,(counts.get(g)||0)+1);}const rows=[...counts].sort((a,b)=>b[1]-a[1]),max=Math.max(1,...rows.map(x=>x[1]));
      main=card(`<div class="fp-label">Распределение записанных подходов</div><p class="fp-caption">Основная группа по каталогу. Это не измерение нагрузки на каждую мышцу.</p>${rows.map(([g,n])=>`<div class="fp-muscle-row"><b>${esc(g)}</b><strong>${n}</strong>${meter(n,max)}</div>`).join('')||empty('Пока нет подходов','После тренировок здесь появится распределение по группам.')}`);
    }
    if(tab==='nutrition'){
      const points=dates.map(date=>{const t=foodTotals(date);return {date,v:t.cal,...t};}).filter(p=>p.rows.length),n=points.length;
      main=card(`<div class="fp-label">Записанная калорийность</div><div class="fp-value">${n?fmt(sum(points,'cal')/n):'—'} <small>ккал / день</small></div><p class="fp-caption">Среднее по ${n} дням с записями. Полнота питания из наличия блюд не следует.</p>${chart(points.map(p=>({date:p.date,v:p.v})),'ккал','Калории по записанным дням')}${n?`<p class="fp-caption">Средние Б / Ж / У: ${fmt(sum(points,'protein')/n,1)} / ${fmt(sum(points,'fat')/n,1)} / ${fmt(sum(points,'carbs')/n,1)} г</p>`:''}${button('go','Открыть дневник',['nutrition'],'quiet','arrow')}`);
    }
    root('progress',`${heading('Данные / твой прогресс','Каждая запись важна.','Реальные результаты. Понятная динамика.')}<div class="fp-tabs" role="tablist" aria-label="Показатели прогресса">${[['strength','Сила'],['weight','Масса'],['volume','Объём'],['muscles','Мышцы'],['nutrition','Питание']].map(([id,name])=>`<button role="tab" aria-selected="${tab===id}" data-fp-action="stats" data-fp-params="${esc(JSON.stringify([id]))}">${name}</button>`).join('')}</div><label class="fp-field" style="margin:16px 0">Период<select id="fp-stats-range">${[[7,'Неделя'],[28,'4 недели'],[84,'12 недель']].map(([n,l])=>`<option value="${n}" ${days===n?'selected':''}>${l}</option>`).join('')}</select></label>${main}${section('История тренировок',button('export','Экспорт',[],'quiet'))}${history().length?card(history().slice(0,prefs.historyLimit).map(w=>`<div class="fp-list-row"><div><b>${esc(w.name)}</b><p>${esc(label(day(w.date)))} · ${V.sets(w)} подходов</p></div><strong>${fmt(V.volume(w))} кг</strong></div>`).join('')):empty('История пока пуста','Здесь будут твои завершённые тренировки.')}${history().length>prefs.historyLimit?button('moreHistory','Показать ещё',[],'fp-full'):''}`);
    $('fp-stats-range').onchange=e=>{n8StatsRange(Number(e.target.value));ForgeNavigation.persist();};
    if($('fp-strength-exercise'))$('fp-strength-exercise').onchange=e=>{prefs.exercise=e.target.value;persist();renderProgress();};
  }
  function addFood(meal=null){prefs.date=today();pendingMeal=meal;persist();renderNutrition();openModal('food');}
  const baseFood=forgeOpenFoodModal;forgeOpenFoodModal=function(...args){baseFood(...args);if(pendingMeal&&$('forgeFoodMeal'))$('forgeFoodMeal').value=pendingMeal;pendingMeal=null;};
  const baseChoose=forgeChooseNamedExercise;forgeChooseNamedExercise=function(name){
    if(replacement){const target=replacement,a=state.active;replacement=null;if(a?.id!==target.workoutId)return;const ex=a.exercises[target.index];if(!ex||ex.sets.some(s=>s.done))return toast('Записанные подходы сохранены. Добавь новое упражнение отдельно.');if(!forgeRefreshCatalog().some(e=>e.name===name))return;ex.name=name;save();closeModal();toast('Упражнение заменено');return;}
    return baseChoose(name);
  };
  const actions={
    go:id=>showPage(id),start:()=>n8QuickStart(),logSet:()=>n8LogNext(),exerciseCard:name=>n8ShowExerciseCard(encodeURIComponent(name)),weight:()=>openModal('weight'),food:addFood,coach:()=>ForgeCoach.open(),recipes:()=>n10OpenRecipes(),favorites:()=>{pendingMeal=null;openModal('food');forgeSetFoodTab('favorites');},
    newProgram:()=>n8NewProgram(),editProgram:id=>n8OpenProgram(id),editDay:i=>n8EditWeeklyDay(i),chooseDay:i=>n8ChooseDay(i),template:i=>n8UseTemplate(i),activate:id=>n8ActivateProgram(id),export:()=>exportData(),
    stats:tab=>{showPage('progress');n8StatsSelect(tab);ForgeNavigation.persist();},
    dateShift:n=>{const d=shift(prefs.date,n);if(d<=today()){prefs.date=d;persist();renderNutrition();}},
    removeFood:id=>{if(confirm('Удалить запись питания?'))removeFood(id);},moreHistory:()=>{prefs.historyLimit+=20;persist();renderProgress();},
    removeSet:()=>{const ex=state.active?.exercises?.[V.index()];if(!ex||ex.sets.length<2)return toast('Оставьте хотя бы один подход.');if(confirm('Удалить последний подход этого упражнения?')){ex.sets.pop();save();}},
    replaceExercise:()=>{const a=state.active,ex=a?.exercises?.[V.index()];if(!ex)return;if(ex.sets.some(s=>s.done))return toast('В упражнении есть результаты. Добавь замену отдельно, чтобы сохранить их.');if(!confirm('Заменить упражнение? Настройки подходов останутся.'))return;replacement={index:V.index(),workoutId:a.id};forgeOpenExercisePicker('workout');},
    settings:()=>{showPage('profile');const el=$('profile').querySelector('.setting');el?.scrollIntoView({block:'center'});}
  };
  document.addEventListener('click',e=>{const b=e.target.closest('[data-fp-action]');if(!b)return;let params=[];try{params=JSON.parse(b.dataset.fpParams||'[]');}catch{}const fn=actions[b.dataset.fpAction];if(fn){e.preventDefault();fn(...params);}});
  document.addEventListener('input',e=>{
    if(e.target.matches('#workout .n8-setgrid input')){const inputs=[...$('workout').querySelectorAll('.n8-setgrid input')],i=inputs.indexOf(e.target);if(i>=0)n8EditSet(V.index(),Math.floor(i/2),i%2?'reps':'weight',e.target.value);return;}
    if(!e.target.matches('[data-fp-chart-range]'))return;const widget=e.target.closest('.fp-chart-widget'),points=JSON.parse(widget.dataset.fpPoints),p=points[Number(e.target.value)],text=label(p.date)+' · '+fmt(p.v,1)+' '+widget.dataset.fpUnit;widget.querySelector('output').textContent=text;e.target.setAttribute('aria-valuetext',text);
  });
  function installChrome(){
    const brand=document.querySelector('.brand');brand.innerHTML=`<svg class="fp-logo" viewBox="0 0 32 36" aria-hidden="true"><path d="M4 3h25l-4 7H12v7h12l-4 7h-8v9H4z" fill="currentColor"/></svg><span>FORGE<small>PERFORMANCE</small></span>`;
    const tabs=[['home','Главная'],['workout','Тренировки'],['nutrition','Питание'],['plan','Программы'],['progress','Прогресс']];document.querySelector('.tabs').innerHTML=tabs.map(([id,name])=>`<button class="tab" data-page="${id}" onclick="showPage('${id}')"><span class="ico">${icon(id)}</span><span>${name}</span></button>`).join('');
    $('topAvatar').setAttribute('role','button');$('topAvatar').setAttribute('aria-label','Профиль');$('topAvatar').tabIndex=0;$('topAvatar').onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();showPage('profile');}};
    const timer=document.querySelector('.topright .iconbtn');if(timer){timer.innerHTML=icon('clock');timer.setAttribute('aria-label','Таймер отдыха');}
    if(!$('fp-settings')){const b=document.createElement('button');b.id='fp-settings';b.className='iconbtn';b.setAttribute('aria-label','Настройки');b.dataset.fpAction='settings';b.innerHTML=icon('settings');document.querySelector('.topright').insertBefore(b,$('topAvatar'));}
    $('profile').querySelector('h1').textContent='Профиль и настройки.';
    $('toast').setAttribute('role','status');$('toast').setAttribute('aria-live','polite');
  }
  function updateChrome(){
    const current=document.querySelector('.page.active')?.id,primary={nutritionCoach:'nutrition',foodcatalog:'nutrition',meals:'nutrition',library:'plan',cycles:'plan'}[current]||current;
    document.querySelectorAll('.tab').forEach(b=>{const selected=b.dataset.page===primary;b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    const activeWorkout=current==='workout'&&!!state.active?.exercises?.length;document.body.classList.toggle('fp-active-workout',activeWorkout);
    let dock=$('fp-workout-dock');if(!dock){dock=document.createElement('div');dock.id='fp-workout-dock';dock.className='fp-workout-dock';dock.innerHTML=button('go','Обзор',['home'],'','home')+button('logSet','Записать подход',[],'primary');document.body.append(dock);new ResizeObserver(()=>document.documentElement.style.setProperty('--fp-dock-height',dock.getBoundingClientRect().height+'px')).observe(dock);}
    if(activeWorkout){const ex=state.active.exercises[V.index()],s=ex?.sets.find(s=>!s.done)||ex?.sets.at(-1);dock.querySelector('[data-fp-action="logSet"]').textContent=s?`✓ ${fmt(s.weight,1)} кг × ${fmt(s.reps)}`:'Записать подход';}
  }
  function classifyDialog(){
    if(replacement&&!['modalback','x7BrowserBack','x7DetailBack'].some(id=>$(id)?.classList.contains('show')))replacement=null;
    const m=$('modalback');if(m){const full=!!m.querySelector('#foodSearch,#x7BrowserRoot,#forgeExerciseSearch,#f5Field_name');if(m.classList.contains('fp-fullscreen')!==full)m.classList.toggle('fp-fullscreen',full);}
    const n=$('n9Modal');if(n){const sheet=!!n.querySelector('#n9RestGlobal,#n9WorkoutNote,#n9PlateGoal')||n.querySelectorAll('input,select,textarea').length>0&&n.querySelectorAll('input,select,textarea').length<5&&!n.querySelector('#n10RecipeName');if(n.classList.contains('fp-sheet')!==sheet)n.classList.toggle('fp-sheet',sheet);}
  }
  V.install({home:renderHome,plan:renderPlan,workout:enhanceWorkout,progress:renderProgress});
  const previousRender=renderAll;renderAll=function(){previousRender();updateChrome();classifyDialog();};
  const observer=new MutationObserver(()=>{classifyDialog();updateChrome();});
  for(const id of ['modalback','n9Modal','x7BrowserBack','x7DetailBack'])if($(id))observer.observe($(id),{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  function updateSetView(){
    if(!$('workout').classList.contains('active')||!state.active?.exercises?.[V.index()])return false;
    const ex=state.active.exercises[V.index()],s=ex.sets.find(s=>!s.done)||ex.sets.at(-1);
    $('workout').querySelectorAll('.n8-setgrid input').forEach((el,i)=>{if(document.activeElement!==el)el.value=ex.sets[Math.floor(i/2)]?.[i%2?'reps':'weight']??'';});
    const numbers=$('workout').querySelectorAll('.n8-step b');if(s&&numbers.length===2){numbers[0].textContent=fmt(s.weight,1);numbers[1].textContent=fmt(s.reps);}updateChrome();return true;
  }
  window.ForgePerformance={persist,updateSetView,snapshot:()=>({...prefs}),render:()=>renderAll()};
  installChrome();renderAll();updateChrome();
  addEventListener('pagehide',persist);
  setInterval(()=>{const el=document.querySelector('[data-fp-workout-clock]');if(el&&state.active){const mins=Math.max(0,Math.floor((Date.now()-(state.active.start||Date.now()))/60000)),sets=state.active.exercises.flatMap(e=>e.sets);el.textContent=`${mins} мин · ${sets.filter(s=>s.done).length} из ${sets.length} подходов`;}},1000);
})();
