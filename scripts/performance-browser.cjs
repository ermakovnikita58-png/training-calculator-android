const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{checkScreen}=require('./visual-checks.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FORGE_CHROMIUM?{executablePath:process.env.FORGE_CHROMIUM}:{})});
 const assets=path.resolve(__dirname,'../app/src/main/assets'),url='https://appassets.androidplatform.net/assets/index.html';
 const screenshotDir=process.env.FORGE_SCREENSHOT_DIR||path.resolve(__dirname,'../docs/design-screenshots');fs.mkdirSync(screenshotDir,{recursive:true});
 try{
 for(const width of [320,360,390,412]){
  const ctx=await browser.newContext({viewport:{width,height:844}}),page=await ctx.newPage(),errors=[];let accept=true;
  await ctx.route('**/*',route=>{const u=new URL(route.request().url()),f=path.resolve(assets,decodeURIComponent(u.pathname.slice(8)));if(u.origin===new URL(url).origin&&f.startsWith(assets+path.sep)&&fs.existsSync(f))return route.fulfill({path:f});return route.abort();});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept():d.dismiss());
  await page.goto(url);
  // Synthetic fixture only in the disposable test profile; production has no samples.
  await page.evaluate(()=>{const yesterday=new Date((ForgeNutrition.dayNumber(today())-1)*86400000).toISOString().slice(0,10);state.profile.name='Алексей';state.waterDate=today();state.foods=[{id:'today-food',date:today(),name:'Овсяная каша',meal:'Завтрак',grams:250,cal:310,protein:12,fat:8,carbs:48},{id:'yesterday-food',date:yesterday,name:'Творог',meal:'Перекус',cal:200,protein:28,fat:6,carbs:8}];state.weights=[{date:yesterday,weight:74.2},{date:today(),weight:74}];state.workouts=[{id:'ui-w1',date:yesterday,name:'Сила верха',duration:45,sets:[{exercise:'Жим штанги лёжа',weight:60,reps:8,done:true},{exercise:'Тяга верхнего блока',weight:55,reps:10,done:true}]}];state.n10Recipes=[{id:'ui-r1',name:'Омлет',servings:1,items:[{name:'Яйцо',grams:120,cal:140,protein:12,fat:10,carbs:1}]}];save();showPage('home')});
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('forge_v2')));
  const go=async id=>{if(await page.locator('body.fp-active-workout').count())await page.locator('#fp-workout-dock [data-fp-action="go"]').click();await page.locator(`.tab[data-page="${id}"]`).click();await page.waitForTimeout(200);assert.equal(await page.locator('.page.active').getAttribute('id'),id);assert.equal(await page.locator('.tab[aria-current="page"]').getAttribute('data-page'),id);};
  const checkWidth=async name=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${name}: no horizontal overflow`);
  const shot=async name=>{if([360,390].includes(width)){await page.waitForTimeout(220);const png=await page.screenshot({path:path.join(screenshotDir,`${name}-${width}.png`)});if(['home','workout','nutrition','plan','progress'].includes(name))await checkScreen(page,png,width);}};
  for(const id of ['home','workout','nutrition','plan','progress']){await go(id);await checkWidth(id);assert.equal(await page.locator('.tab').count(),5);assert.ok(await page.locator('.tabbar').isVisible());await shot(id);}
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('forge_v2'))),original,'viewing screens must preserve the diary');
  console.log(`PASS ${width}: five tabs, live overview, offline startup and unchanged diary`);
  await go('nutrition');assert.match(await page.locator('#caloriesEaten').innerText(),/310/);await page.locator('[data-fp-action="dateShift"]').first().click();assert.match(await page.locator('#caloriesEaten').innerText(),/200/);await page.reload();assert.match(await page.locator('#caloriesEaten').innerText(),/200/);assert.equal(await page.evaluate(()=>state.foods.length),2);
  await page.locator('#nc-entry').click();assert.equal(await page.locator('[data-nc-step="1"]').isVisible(),true);await shot('coach');await page.evaluate(()=>f6HandleAndroidBack());assert.equal(await page.locator('.page.active').getAttribute('id'),'nutrition');
  await page.evaluate(()=>openModal('weight'));assert.ok(await page.locator('.modal').evaluate(e=>e.getBoundingClientRect().height<innerHeight*.9),'weight uses compact sheet');await shot('sheet');await page.evaluate(()=>f6HandleAndroidBack());
  await page.evaluate(()=>n10EditRecipe());await page.locator('#n10RecipeName').fill('Несохранённый рецепт');accept=false;await page.locator('#n9Modal .n9-back').click();assert.ok(await page.locator('#n9Modal.show').count());accept=true;await page.evaluate(()=>f6HandleAndroidBack());
  console.log(`PASS ${width}: nutrition totals/history/restart, Coach Back and compact weight sheet`);
  await go('progress');for(const tab of ['strength','weight','volume','muscles','nutrition']){await page.locator(`[data-fp-action="stats"][data-fp-params='["${tab}"]']`).click();await checkWidth('stats '+tab);if(await page.locator('[data-fp-chart-range]').count()){const range=page.locator('[data-fp-chart-range]').first();await range.focus();await range.press('Home');assert.ok(await range.getAttribute('aria-valuetext'));}}
  assert.match(await page.locator('.page.active').innerText(),/Среднее|Средние|калорийность/);
  await go('workout');await page.locator('#workout .n8-log').first().click();assert.ok(await page.locator('.n8-setgrid input').count());const before=await page.evaluate(()=>state.active.exercises[0].sets.length);
  await page.evaluate(()=>n8AddSet());await page.locator('[data-fp-action="removeSet"]').click();assert.equal(await page.evaluate(()=>state.active.exercises[0].sets.length),before);
  await page.locator('[data-fp-action="replaceExercise"]').click();await page.evaluate(()=>forgeChooseNamedExercise('Жим гантелей лёжа'));assert.equal(await page.evaluate(()=>state.active.exercises[0].name),'Жим гантелей лёжа');
  await page.evaluate(()=>{document.getElementById('x7BrowserBack')?.classList.remove('show');showPage('workout')});
  const namesBefore=await page.evaluate(()=>state.active.exercises.map(e=>e.name));await page.locator('[data-fp-action="replaceExercise"]').click();await page.evaluate(()=>f6HandleAndroidBack());await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>state.active.exercises.map(e=>e.name)),namesBefore);await page.evaluate(()=>forgeChooseNamedExercise('Становая тяга'));assert.equal(await page.evaluate(()=>state.active.exercises.length),namesBefore.length+1);assert.equal(await page.evaluate(()=>state.active.exercises[0].name),namesBefore[0]);
  await page.locator('.n8-setgrid input').first().fill('72.5');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('forge_v2')).active.exercises[0].sets[0].weight),72.5);await go('nutrition');await go('workout');assert.equal(await page.evaluate(()=>state.active.exercises[0].sets[0].weight),72.5);
  const active=await page.evaluate(()=>JSON.parse(JSON.stringify(state.active)));await page.evaluate(()=>n8StartRest());const until=await page.evaluate(()=>ForgePerformanceViews.rest.snapshot().until);await page.reload();assert.deepEqual(await page.evaluate(()=>state.active),active);assert.equal(await page.evaluate(()=>ForgePerformanceViews.rest.snapshot().until),until);await checkWidth('active workout');await shot('active-workout');
  await page.evaluate(()=>{n8NewProgram();document.getElementById('n8ProgName').value='Не сохранять';document.getElementById('n8ProgName').dispatchEvent(new Event('input',{bubbles:true}))});accept=false;await page.evaluate(()=>f6HandleAndroidBack());assert.ok(await page.locator('#n8-program.show').count());accept=true;await page.evaluate(()=>f6HandleAndroidBack());
  console.log(`PASS ${width}: five analytics tabs, chart access, set add/remove, replacement, draft/rest restart, cancelled editor exit`);
  await page.evaluate(()=>{showPage('plan');showPage('library')});await page.waitForTimeout(180);await checkWidth('library');await shot('library');await page.evaluate(()=>f6HandleAndroidBack());assert.equal(await page.locator('.page.active').getAttribute('id'),'plan');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.page.active').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.addStyleTag({content:'html{font-size:22.4px!important}'});for(const id of ['home','nutrition','plan','progress','workout']){await go(id);await checkWidth('large text '+id);}
  assert.deepEqual(errors,[]);await ctx.close();
 }
 }finally{await browser.close()}
 console.log('PASS: Performance UI on 320/360/390/412; screenshots 360/390. Physical Android gestures/IME/TalkBack not tested.');
})().catch(e=>{console.error(e);process.exit(1)});
