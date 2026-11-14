const assert=require('assert/strict');
const {chromium}=require('playwright');
const {pathToFileURL}=require('url'),path=require('path');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FORGE_CHROMIUM?{executablePath:process.env.FORGE_CHROMIUM}:{})});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../app/src/main/assets/index.html')).href);
 await page.waitForTimeout(500);
 await page.evaluate(()=>{state.active={name:'Проверка',date:new Date().toISOString(),exercises:[]};forgeOpenExercisePicker('workout')});
 
 await page.evaluate(()=>x7OpenGroup(encodeURIComponent('Плечи')));
 
 await page.locator('[onclick="x7ShowGroups()"]').click();
 await page.evaluate(()=>{x7OpenGroup(encodeURIComponent('Плечи'));x7OpenDetail(encodeURIComponent('Разведение гантелей в стороны'),true)});
 
 await page.locator('[onclick="x7AddFromDetail()"]').click();
 assert.equal(await page.evaluate(()=>state.active.exercises[0].name),'Разведение гантелей в стороны');
 await page.reload();
 assert.equal(await page.evaluate(()=>state.active.exercises[0].name),'Разведение гантелей в стороны');
 await page.evaluate(()=>{forgeDraft={name:'Тест',day:'Понедельник',focus:'Плечи',exercises:[]};forgeOpenExercisePicker('day');x7OpenGroup(encodeURIComponent('Плечи'))});
 await page.locator('.x7row').filter({hasText:'Жим штанги стоя'}).first().click();
 assert.equal(await page.evaluate(()=>forgeDraft.exercises[0].name),'Жим штанги стоя');
 assert.equal(await page.evaluate(()=>state.active.exercises.length),1);
 const catalog=await page.evaluate(()=>forgeRefreshCatalog().map(x=>[x.name,x.group]));
 const original=JSON.parse(require('fs').readFileSync(path.resolve(__dirname,'../artwork/original-catalog.json')));
 assert.deepEqual(catalog,original.map(x=>x.slice(0,2)));
 const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>i.offsetParent&&(!i.complete||i.naturalWidth===0)).map(i=>i.src));
 assert.deepEqual(broken,[]);assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('PASS: offline mobile browser, group menu, detail/add, workout persistence after reload, program target, unchanged 556-entry catalog, no broken visible images or JS errors.');
 await exerciseCycle(browser);
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

async function exerciseCycle(browser) {
 const context=await browser.newContext({offline:true, viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
 const page=await context.newPage(), errors=[];
 page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.stack));
 await context.route(/^https?:/, route=>route.abort());
 page.on('dialog', incoming=>incoming.type()==='confirm' ? incoming.accept() : incoming.dismiss());
 const url=pathToFileURL(path.resolve(__dirname,'../app/src/main/assets/index.html')).href;
 const screenshots=process.env.FORGE_CYCLE_SCREENSHOTS || path.resolve(__dirname,'../test-results/training-cycles');
 await fs.mkdir(screenshots,{recursive:true});
 const dialog=page.locator('#forge-cycle');
 const action=(name,selector='')=>dialog.locator('[data-fc="'+name+'"]'+selector);
 const input=name=>dialog.locator('[name="'+name+'"]');
 const title=()=>dialog.locator('h2').innerText();
 const value=fn=>page.evaluate(fn);
 const back=async ()=>{
   await page.keyboard.press('Escape');
   assert(await dialog.isVisible());
 };
 const shot=async (name)=>{
   await dialog.evaluate(element=>{element.scrollTop=0});
   await page.screenshot({path:path.join(screenshots,name+'.png'), animations:'disabled'});
 };
 const edit=async (locator, newValue)=>{
   await locator.fill(String(newValue));
   await locator.press('Tab');
 };
 const choose=(name, newValue)=>input(name).selectOption(String(newValue));
 const open=()=>page.locator('#n8-program [data-fc="open"]').click();
 const cycle=()=>value(()=>state.trainingCycles[0]);
 const readiness=()=>action('activate').isEnabled();
 const importFile=async (contents, regex)=>{
   await value(()=>{$('toast').textContent=''});
   await page.locator('#importFile').setInputFiles({name:'forge-backup.json',mimeType:'application/json',buffer:Buffer.from(contents)});
   await page.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('#toast').textContent),regex.source);
 };
 try {
  await page.goto(url);
  const originals=await value(()=>{
    const date=today(), bench='Жим штанги лёжа', custom='Моя тяга с паузой', plank='Планка';
    state.customExercises.push(custom);
    state.customExerciseDetails[custom]={group:'Спина',equipment:'Гантели'};
    state.programs.push({id:'cycle-e2e',name:'Подготовка к старту',days:[
      {day:'ПН',name:'Техника и объём',focus:'Силовая',exercises:[bench,custom,plank],exerciseConfig:{
        [bench]:{sets:3,reps:10,weight:35},[custom]:{sets:2,reps:8,weight:25},[plank]:{sets:2,reps:30,weight:0}
      }},
      {day:'ЧТ',name:'Силовой день',focus:'Силовая',exercises:[bench],exerciseConfig:{[bench]:{sets:2,reps:8,weight:30}}}
    ]});
    state.workouts.push({id:'seed',date,name:'Прежняя тренировка',duration:22,sets:[{exercise:custom,weight:30,reps:10,done:true}]});
    state.foods.push({id:'seed-food',date,name:'Гречка',cal:180,protein:6,carbs:35,fat:2,grams:170});
    state.n10Recipes=[{id:'seed-recipe',name:'Каша',servings:2,items:[{name:'Гречка',cal:355,protein:12,carbs:70,fat:3,grams:80}]}];
    save();
    showPage('plan');
    return JSON.parse(JSON.stringify({programs:state.programs,foods:state.foods,n10Recipes:state.n10Recipes,workouts:state.workouts}));
  });
  await page.locator('#plan .n8-unit').filter({hasText:'Подготовка к старту'}).getByRole('button',{name:'Править'}).click();
  await open();
  assert.equal(await title(),'Выбрать упражнения');
  for (const id of ['e0','e1','e3']) await dialog.locator('[data-select="'+id+'"]').check();
  await shot('01-exercises');
  await action('next').click();
  assert.equal(await title(),'Стартовые замеры');
  await page.reload();
  assert.equal(await title(),'Стартовые замеры');
  await back();
  assert.equal(await title(),'Выбрать упражнения');
  await action('next').click();
  await action('next').click();
  assert.equal(await readiness(),false);
  await back();

  await action('base-open','[data-key="b0"]').click();
  await action('base-source','[data-source="known"]').click();
  await choose('type','fiveRM');
  for(const bad of [0,-1,'']) {
    await input('weight').fill(String(bad));
    assert.equal(await action('base-save').isEnabled(),false);
  }
  await input('weight').fill('40');
  await action('base-save').click();
  await action('base-open','[data-key="b1"]').click();
  await action('base-source','[data-source="measurement"]').click();
  await input('weight').fill('20.5');
  await input('reps').fill('6');
  assert.match(await dialog.locator('[data-base-preview]').innerText(),/расчётный 1ПМ · 24,6 кг · стартовый замер/);
  await action('base-save').click();
  await action('base-open','[data-key="b1"]').click();
  await action('base-source','[data-source="journal"]').click();
  await choose('entry',0);
  assert.match(await dialog.locator('[data-base-preview]').innerText(),/расчётный 1ПМ · 40 кг · журнал.*30 кг × 10/);
  await action('base-save').click();

  await action('next').click();
  assert.equal(await title(),'План по неделям');
  const load=(id,name)=>dialog.locator('[data-load="'+id+'"] [name="'+name+'"]');
  assert.equal(await load('e0','reps').inputValue(),'15');
  assert.equal(await load('e2','weight').inputValue(),'0');
  assert.equal(await load('e2','sets').inputValue(),'2');
  assert.equal(await load('e2','reps').inputValue(),'30');
  await choose('week',3);
  assert.match(await input('kind').locator('option').first().innerText(),/Разгрузка/);
  await choose('week',7);
  assert.equal(await load('e0','reps').inputValue(),'2');
  assert.equal(await load('e0','percent').inputValue(),'100');
  assert.equal(await load('e1','percent').inputValue(),'85');
  await choose('week',0);
  await edit(load('e0','percent'),95);
  await edit(load('e3','percent'),72);
  assert.match(await dialog.locator('[data-load="e0"] [data-load-summary]').innerText(),/95% от 5ПМ · 40 кг → 38 кг до округления → 37,5 кг/);
  await choose('copy-to',1);
  await action('copy-week').click();
  assert.equal(await input('week').inputValue(),'1');
  assert.equal(await load('e3','percent').inputValue(),'72');
  await edit(load('e2','weight'),4.25);
  assert.deepEqual((await cycle()).weeks[1].loads.e2,{weight:4.25,sets:2,reps:30});
  await choose('week',0);
  await dialog.locator('.fc-settings>summary').click();
  await edit(input('step'),0);
  await action('save-settings').click();
  assert.equal(await dialog.locator('[data-settings-error]').isVisible(),true);
  await edit(input('step'),0.5);
  await choose('mode','flexible');
  await edit(input('increase'),5);
  const competition=await value(()=>ForgeCycleModel.addDays(today(),75));
  await input('competition').fill(competition);
  await action('save-settings').click();
  assert.match(await dialog.locator('[data-load="e0"] [data-load-summary]').innerText(),/→ 38 кг$/);
  for(const view of [[360,800],[390,844],[412,915],[844,390]]) {
    await page.setViewportSize({width:view[0],height:view[1]});
    assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().bottom<=innerHeight));
  }
  await page.setViewportSize({width:390,height:844});
  await shot('02-week');
  await action('activate').click();
  assert.equal((await cycle()).status,'active');

  // Date overrides and skip flags never change competition day.
  await action('session-move','[data-session="0:d1"]').click();
  const moved=await value(()=>ForgeCycleModel.addDays(today(),9));
  await input('move-date').fill(moved);
  await action('save-move').click();
  await action('session-skip','[data-session="0:d1"]').click();
  assert.deepEqual((await cycle()).schedule['0:d1'],{date:moved,skipped:true});
  await action('session-unskip','[data-session="0:d1"]').click();
  assert.equal((await cycle()).competition,competition);

  // Program card and schedule share the same active session.
  await action('close','[aria-label]').click();
  assert.match(await page.locator('#n8-program .fc-card').innerText(),/Неделя 1 из 8/);
  await page.locator('#n8-program [data-fc="nearest"]').click();
  assert.equal(await value(()=>state.active.trainingCycle.rows[0].weight),38);
  await page.getByRole('spinbutton',{name:'Запас повторений подхода 1',exact:true}).first().fill('4');
  await page.locator('#workout .n8-setgrid .n8-check').first().click();
  assert.equal(await value(()=>state.active.exercises[0].sets[0].rir),4);
  const timer=await value(()=>state.active.cycleRestUntil);
  await page.reload();
  assert.equal(await value(()=>state.active.exercises[0].sets[0].done),true);
  assert.equal(await value(()=>state.active.cycleRestUntil),timer);
  assert.notEqual(await page.locator('#n8TimerDisplay').innerText(),'00:00');
  await page.locator('#workout [onclick="n8FinishWorkout()"]').click();
  assert.equal(await title(),'План и факт');
  assert.equal(await action('adjust-yes').count(),0);
  assert.match(await dialog.innerText(),/Факт.*38 кг × 15 · запас 4/s);
  await action('back').last().click();

  await value(()=>{showPage('plan');n8OpenProgram('cycle-e2e')});
  await open();
  const run=(week,day)=>action('session-start','[data-session="'+week+':'+day+'"]').first().click();
  const fillSets=async ()=>{
    const counts=await value(()=>state.active.exercises.map(exercise=>exercise.sets.length));
    for(let i=0;i<counts.length;i++){
      await page.locator('#workout .n8-exchip').nth(i).click();
      for(let j=1;j<=counts[i];j++){
        await edit(page.getByRole('spinbutton',{name:'Запас повторений подхода '+j,exact:true}),4);
        await page.locator('#workout .n8-setgrid').nth(j).locator('.n8-check').first().click();
      }
    }
    await page.locator('#workout [onclick="n8FinishWorkout()"]').click();
  };
  await run(0,'d1');
  await fillSets();
  assert.equal(await action('adjust-yes').count(),1);
  await action('adjust-no').click();
  assert.equal(await value(()=>state.workouts[0].cycleAdjustment),'declined');
  assert.equal((await cycle()).bases.b0.value,40);
  await action('back').last().click();
  await value(()=>{showPage('plan');n8OpenProgram('cycle-e2e')});
  await open();
  await choose('week',1);
  await run(1,'d1');
  await fillSets();
  assert.equal(await action('adjust-yes').count(),1);
  await dialog.locator('details summary').first().click();
  assert.match(await dialog.innerText(),/38 → 40 кг/);
  await action('adjust-yes').click();
  assert.equal((await cycle()).bases.b0.adjustedValue,42);
  assert.equal(await value(()=>state.workouts[0].trainingCycle.rows[0].weight),29);
  await shot('03-journal');

  await action('back').last().click();
  await value(()=>{showPage('plan');n8OpenProgram('cycle-e2e')});
  await open();
  await back();
  await action('base-open','[data-key="b0"]').click();
  await edit(input('weight'),50);
  await action('base-save').click();
  await action('next').click();
  assert.match(await dialog.locator('[data-load="e0"] [data-load-summary]').innerText(),/50 кг → 47,5 кг/);
  assert.equal(await value(()=>state.workouts.find(w=>w.trainingCycle?.dayId==='d0').trainingCycle.rows[0].weight),38);
  await action('close','[aria-label]').click();
  await value(()=>{n8CloseOverlay();showPage('progress')});
  const captured=page.waitForEvent('download');
  await page.locator('#progress .n8-root').getByRole('button',{name:'Экспорт',exact:true}).click();
  const download=await captured;
  const backup=await fs.readFile(await download.path(),'utf8');
  const data=JSON.parse(backup);
  assert.deepEqual(data.programs,originals.programs);
  assert.deepEqual(data.foods,originals.foods);
  assert.deepEqual(data.n10Recipes,originals.n10Recipes);
  assert.deepEqual(data.workouts.at(-1),originals.workouts[0]);
  const saved=()=>value(()=>JSON.parse(localStorage.getItem('forge_v2')));
  for(let i=0;i<2;i++){
    await importFile(backup,/Резервная копия восстановлена/);
    assert.deepEqual(await saved(),data);
  }
  await importFile('{broken',/Импорт не выполнен/);
  const invalid=structuredClone(data);
  invalid.workouts.push(...Array(60).fill(originals.workouts[0]), {...originals.workouts[0],sets:[null]});
  await importFile(JSON.stringify(invalid),/Некорректные тренировки/);
  const damaged=structuredClone(data);
  damaged.trainingCycles[0].weeks.at(-1).loads.e0={percent:125};
  await importFile(JSON.stringify(damaged),/Некорректный план/);
  const invalidProfile={...data,profile:{...data.profile,name:123}};
  await importFile(JSON.stringify(invalidProfile),/Некорректный профиль/);
  await value(()=>{
    window.testSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,...args){
      if(key==='forge_v2') throw new DOMException('Test quota','QuotaExceededError');
      return window.testSetItem.call(this,key,...args);
    };
  });
  const legacy={...data,workouts:originals.workouts};
  delete legacy.trainingCycles;
  await importFile(JSON.stringify(legacy),/Недостаточно памяти/);
  assert.deepEqual(await saved(),data);
  assert.equal(await value(()=>state.trainingCycles.length),1);
  await value(()=>{Storage.prototype.setItem=window.testSetItem});
  await importFile(JSON.stringify(legacy),/Резервная копия восстановлена/);
  assert.deepEqual((await saved()).trainingCycles,[]);
  assert.deepEqual((await saved()).foods,originals.foods);
  assert.deepEqual(errors,[]);
  console.log('PASS: offline cycle UI, 4 viewports, measurements, copied/edited weeks, rescheduling, restored timer/workout, stable journal, flex review, full JSON validation and legacy import.');
 } catch (error) {
  await page.screenshot({path:path.join(screenshots,'failure.png')});
  throw error;
 } finally {
  await context.close();
 }
}
