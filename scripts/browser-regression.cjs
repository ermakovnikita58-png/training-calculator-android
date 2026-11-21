const assert=require('assert/strict');
const {chromium}=require('playwright');
const {pathToFileURL}=require('url'),path=require('path');
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
 
 await page.locator('#x7DetailBack [data-vs-action="add"]').click();
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
 await page.close();
 const cycle=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true,offline:true});
 const cycleErrors=[];
 cycle.on('pageerror',error=>cycleErrors.push(error.message));
 await cycle.goto(pathToFileURL(path.resolve(__dirname,'../app/src/main/assets/index.html')).href);
 try { await checkCycle(cycle); }
 catch (error) {
   if (process.env.FORGE_CYCLE_SCREENSHOTS) await cycle.screenshot({path:path.join(process.env.FORGE_CYCLE_SCREENSHOTS,'failure.png')});
   if (cycleErrors.length) console.error(cycleErrors);
   throw error;
 }
 assert.deepEqual(cycleErrors,[]);
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

async function checkCycle(page) {
 const context=page.context();
 await context.setOffline(true);
 page.setDefaultTimeout(8000);
 page.setDefaultNavigationTimeout(30000);
 page.on('dialog',dialog=>dialog.accept());
 await page.evaluate(()=>{
  closeModal();
  state.active=null;
  state.programs=[];
  state.currentProgram=null;
  state.trainingCycles=[];
  save();
  showPage('plan');
 });
 const fs=require('node:fs/promises');
 const screenshots=process.env.FORGE_CYCLE_SCREENSHOTS;
 if(screenshots)await fs.mkdir(screenshots,{recursive:true});
 const shot=async(name)=>{if(screenshots)await page.screenshot({path:path.join(screenshots,name+'.png')});};
 for(const [index,name,size] of [[0,'Луч',10],[1,'Бок',10],[2,'Кисть',1]]){
  await page.locator('#plan [data-fc=template][data-index="'+index+'"]').click();
  assert.equal(await page.locator('#fc-heading').textContent(),name);
  assert.equal(await page.locator('#fc-body li').count(),size);
  await shot('template-'+index);
  await page.getByRole('button',{name:'Добавить в мои программы',exact:true}).click();
  await page.locator('#n8-program .n8-overlay-head button').first().click();
 }
 await page.locator('#plan [data-fc=template][data-index="2"]').click();
 await page.getByRole('button',{name:'Открыть мою копию',exact:true}).click();
 assert.equal(await page.evaluate(()=>state.programs.length),3);
 assert.equal(await page.evaluate(()=>state.customExercises.filter(item=>item==='Сгибание с конусной ручкой').length),1);
 await page.locator('#n8-program .n8-overlay-head button').first().click();
 await page.evaluate(()=>showPage('plan'));
 const fc=page.locator('#forge-cycle');
 const action=(name,root=fc)=>root.locator('[data-fc="'+name+'"]');
 await action('new',page.locator('#plan')).click();
 const [start,end]=await page.evaluate(()=>{
  const monday=ForgeCycleModel.addDays(today(),(8-new Date().getDay())%7);
  return [monday,ForgeCycleModel.addDays(monday,50)];
 });
 await fc.locator('[name="start"]').fill(start);
 await fc.locator('[name="end"]').fill(dayBefore(start));
 await fc.locator('[name="program"]').nth(0).check();
 await fc.locator('[name="program"]').nth(1).check();
 assert.equal(await action('create').isDisabled(),true);
 await fc.locator('[name="end"]').fill(end);
 await action('create').click();
 assert.equal(await fc.locator('[data-select]').count(),20);
 const chosen=fc.locator('.fc-choice').filter({hasText:'Статическое удержание на луч'});
 const firstExercise=fc.locator('[data-select]').first();
 const selectedRow=await firstExercise.getAttribute('data-select');
 await firstExercise.check();
 await chosen.locator('[data-select]').check();
 await shot('exercise-selection');
 await action('next').click();
 await page.keyboard.press('Escape');
 await fc.getByRole('heading',{name:'Выбрать упражнения',exact:true}).waitFor();
 await action('next').click();
 assert.equal(await action('base-open').count(),2);
 await action('base-open').first().click();
 await fc.locator('[name="type"]').selectOption('fiveRM');
 await fc.locator('[name="weight"]').fill('40');
 await action('base-save').click();
 await action('base-open').last().click();
 await fc.locator('[name="seconds"]').fill('20');
 await fc.locator('[name="weight"]').fill('20');
 await action('base-save').click();
 await page.reload();
 await fc.getByRole('heading',{name:'Стартовые замеры',exact:true}).waitFor();
 await action('next').click();
 assert.equal(await fc.locator('[name="week"] option').count(),8);
 await fc.locator('[name="week"]').selectOption('6');
 assert.match(await fc.locator('[data-load="'+selectedRow+'"] [data-load-summary]').textContent(),/95%.*38 кг до округления/);
 for(const [width,height] of [[360,800],[390,844],[412,915],[844,390]]){
  await page.setViewportSize({width,height});
  assert.equal(await fc.evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth+1 && dialog.getBoundingClientRect().bottom<=innerHeight),true);
 }
 await page.setViewportSize({width:390,height:844});
 await shot('week-plan');
 await fc.locator('[name="week"]').selectOption('0');
 await action('activate').click();
 const card=fc.locator('.fc-card').filter({has:page.getByRole('heading',{name:'Луч',exact:true})});
 await action('session-start',card).click();
 assert.equal(await page.locator('#workout').isVisible(),true);
 await page.locator('#workout details summary').filter({hasText:'Упражнения'}).click();
 await page.locator('#workout .n8-exchip').filter({hasText:'Статическое удержание на луч'}).click();
 assert.equal(await page.getByRole('spinbutton',{name:'Секунды подхода 1',exact:true}).inputValue(),'20');
 await page.getByRole('spinbutton',{name:'Секунды подхода 1',exact:true}).fill('23');
 await page.getByRole('button',{name:'Записать подход 1',exact:true}).click();
 await page.reload();
 assert.equal(await page.evaluate(()=>state.active.exercises.find(item=>item.unit==='seconds').sets[0].seconds),23);
 assert.equal(await page.evaluate(()=>state.active.exercises.find(item=>item.unit==='seconds').sets[0].done),true);
 await page.evaluate(()=>showPage('workout'));
 await page.getByRole('button',{name:'Завершить ↗',exact:true}).click();
 await fc.getByRole('heading',{name:'План и факт',exact:true}).waitFor();
 assert.match(await fc.innerText(),/20 с/);
 assert.match(await fc.innerText(),/23 с/);
 await fc.getByRole('heading',{name:'Статическое удержание на луч',exact:true}).evaluate(
  heading=>heading.closest('section').scrollIntoView({block:'center'}));
 await shot('plan-and-actual');
 await action('close').first().click();
 const [download]=await Promise.all([
  page.waitForEvent('download'),page.getByRole('button',{name:'Экспорт',exact:true}).click(),
 ]);
 const valid=await fs.readFile(await download.path());
 const upload=page.locator('#importFile');
 const archived=JSON.parse(valid);
 assert.equal(archived.programs.filter(p=>p.templateSource?.startsWith('arm-')).length,3);
 assert.equal(archived.workouts[0].sets.find(set=>set.unit==='seconds').seconds,23);
 assert.equal(archived.trainingCycles[0].programs.length,2);
 const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('forge_v2')));
 const broken={...archived,trainingCycles:[{id:'invalid'}]};
 const restore=async(value, message)=>{
  await upload.setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value))});
  await page.locator('#toast').filter({hasText:message}).waitFor();
 };
 await restore(broken,'Импорт не выполнен: Некорректный план тренировочного цикла');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('forge_v2'))),original);
 const corruptHistory={...archived,workouts:[...archived.workouts, ...Array(60).fill(archived.workouts[0]), {sets:[null]}]};
 await restore(corruptHistory,'Импорт не выполнен');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('forge_v2'))),original);
 await restore(valid,'Резервная копия восстановлена');
 await restore(valid,'Резервная копия восстановлена');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('forge_v2'))),original);
 const legacy=await page.evaluate(()=>{
  const backup=structuredClone(defaults);
  delete backup.trainingCycles;
  return backup;
 });
 await restore(legacy,'Резервная копия восстановлена');
 assert.equal(await page.evaluate(()=>state.trainingCycles?.length??0),0);
 await checkFlexibleCycle(page);
 console.log('PASS: templates, multi-program dates, percentages and holds, offline resume, plan/actual, rescheduling, flexible progression, JSON compatibility.');
}

function dayBefore(date) {
 return new Date(new Date(date).getTime()-86400000).toISOString().slice(0,10);
}

async function checkFlexibleCycle(page) {
 await page.evaluate(()=>{
  state.programs=[{id:'flex',name:'Моя программа',days:[
   {day:'ПН',name:'Подготовка',exercises:['Мой подъём']},
  ]}];
  state.customExercises=['Мой подъём'];
  save();
  showPage('plan');
 });
 const fc=page.locator('#forge-cycle');
 const action=name=>fc.locator('[data-fc="'+name+'"]');
 await page.locator('#plan [data-fc="new"]').click();
 await fc.locator('[name="program"][value="flex"]').check();
 await action('create').click();
 await fc.locator('[data-select]').check();
 await action('next').click();
 await action('base-open').click();
 await fc.locator('[name="weight"]').fill('40');
 await action('base-save').click();
 await action('next').click();
 await fc.getByText('Настройки цикла',{exact:true}).click();
 await fc.locator('[name="step"]').fill('0.5');
 await fc.locator('[name="mode"]').selectOption('flexible');
 await action('save-settings').click();
 await action('session-move').click();
 const moved=await page.evaluate(()=>ForgeCycleModel.addDays(today(),2));
 await fc.locator('[name="move-date"]').fill(moved);
 await action('save-move').click();
 await action('session-skip').click();
 await fc.getByText('Пропущено',{exact:true}).waitFor();
 await action('session-unskip').click();
 await action('activate').click();
 // The first completed session supplies the comparable history. The next two
 // use the same initial load and reps to exercise decline and acceptance.
 for(const [week, answer] of [null,'adjust-no','adjust-yes'].entries()){
  await fc.locator('[name="week"]').selectOption(String(week));
  await fc.locator('[data-load-field][name="reps"]').fill('8');
  await fc.locator('[data-load-field][name="reps"]').dispatchEvent('change');
  await fc.locator('[data-load-field][name="percent"]').fill('65');
  await fc.locator('[data-load-field][name="percent"]').dispatchEvent('change');
  await action('session-start').first().click();
  assert.equal(await page.evaluate(()=>document.querySelector('.page.active')?.id),'workout',
   await page.locator('#toast').textContent());
  const fields=page.locator('#workout .fc-rir-row input');
  for(let index=0;index<await fields.count();index++){
   await fields.nth(index).fill('4');
   await page.getByRole('button',{name:'Записать подход '+(index+1),exact:true}).click();
  }
  await page.getByRole('button',{name:'Завершить ↗',exact:true}).click();
  if(answer){
   await action(answer).click();
   assert.equal(await page.evaluate(()=>state.workouts[0].cycleAdjustment),answer==='adjust-yes'?'accepted':'declined');
  }else{
   assert.equal(await action('adjust-yes').count(),0);
   const yesterday=dayBefore(await page.evaluate(()=>today()));
   await page.evaluate(date=>forgeCommitDiary({...state,workouts:[{...state.workouts[0],date},...state.workouts.slice(1)]}),yesterday);
  }
  assert.equal(await page.evaluate(()=>Object.values(state.trainingCycles[0].bases)[0].adjustedValue),answer==='adjust-yes'?41:undefined);
  assert.equal(await page.evaluate(()=>state.workouts[0].trainingCycle.rows[0].basis.value),40);
  await action('close').first().click();
  await page.evaluate(()=>showPage('plan'));
  await page.locator('#plan [data-fc="open-id"]').click();
 }
}
