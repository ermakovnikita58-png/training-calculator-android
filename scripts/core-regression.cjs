const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FORGE_CHROMIUM?{executablePath:process.env.FORGE_CHROMIUM}:{})});
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage(),errors=[];
 const assets=path.resolve(__dirname,'../app/src/main/assets');
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin==='https://appassets.androidplatform.net'&&u.pathname.startsWith('/assets/')){const f=path.resolve(assets,decodeURIComponent(u.pathname.slice(8)));if(f.startsWith(assets+path.sep)&&fs.existsSync(f))return route.fulfill({path:f});}return route.abort();});
 page.on('pageerror',e=>errors.push(e.message));let accept=true;page.on('dialog',d=>accept?d.accept():d.dismiss());
 const passed=[];const test=async(name,fn)=>{await fn();passed.push(name);console.log('PASS: '+name)};
 const snap=()=>page.evaluate(()=>JSON.parse(JSON.stringify(state)));
 const restore=async(data)=>{await page.evaluate(data=>{window.auditImportEvent={target:{files:[new File([typeof data==='string'?data:JSON.stringify(data)],'backup.json',{type:'application/json'})],value:'pending'}};importData(auditImportEvent)},data);await page.waitForFunction(()=>auditImportEvent.target.value==='');};
 try{
 await page.goto('https://appassets.androidplatform.net/assets/index.html');
 await test('Offline startup and 556 catalog entries',async()=>assert.equal(await page.evaluate(()=>forgeRefreshCatalog().length),556));
 await test('Create, edit and activate program',async()=>{
 await page.evaluate(()=>{n8NewProgram();document.getElementById('n8ProgName').value='Audit program';n8EditProgramDay(-1);n8DayField('name','Audit day');n8OpenPicker()});
 await page.locator('#n8-picker [data-picker-query]').fill('Жим штанги лёжа');
 await page.locator('#n8-picker [data-picker-add="Жим штанги лёжа"]').click();
 await page.evaluate(()=>{n8UpdateEx(0,'sets',2);n8UpdateEx(0,'weight',60);n8UpdateEx(0,'reps',5);n8DaySave();n8SaveProgram();activateProgram(state.programs.at(-1).id)});
 const s=await snap();assert.equal(s.programs.at(-1).name,'Audit program');assert.equal(s.plans[0].exerciseConfig['Жим штанги лёжа'].weight,60);
 });
 await test('Start workout using program configuration; log set and RPE',async()=>{await page.evaluate(()=>{startWorkout(0);n8EditSet(0,0,'weight',65);n8EditSet(0,0,'reps',6);state.active.exercises[0].sets[0].rpe=8;n8LogSet(0,0)});const s=await snap();assert.equal(s.active.exercises[0].sets.length,2);assert.equal(s.active.exercises[0].sets[0].done,true);assert.equal(s.active.exercises[0].sets[0].weight,65)});
 await test('Active workout survives reload',async()=>{await page.reload();assert.equal((await snap()).active.exercises[0].sets[0].rpe,8)});
 await test('Finish workout, history and completed volume',async()=>{await page.evaluate(()=>n8FinishWorkout());const s=await snap();assert.equal(s.active,null);assert.equal(s.workouts[0].sets.length,1);assert.equal(s.workouts[0].sets.reduce((a,s)=>a+s.weight*s.reps,0),390)});
 await test('5RM estimate, explicit 1RM and invalid input',async()=>{const r=await page.evaluate(()=>{const k=PL_KEYS[0];plUpdateNumber('five',k,100);plSetMode('five');let estimated=plEstimated1(k);plUpdateNumber('one',k,140);plSetMode('one');let actual=plBase(k);plUpdateNumber('one',k,-5);return {estimated,actual,retained:pl().one[k]}});assert.equal(r.estimated,116.5);assert.equal(r.actual,140);assert.equal(r.retained,140)});
 await test('Nutrition portion math and nonpositive portion rejection',async()=>{await page.evaluate(()=>{forgeOpenFoodModal({name:'Audit food',cal:200,p:10,f:5,c:25,source:'test'});document.getElementById('forgeFoodGrams').value='150';forgeAddFood()});let s=await snap();assert.equal(s.foods.at(-1).cal,300);assert.equal(s.foods.at(-1).protein,15);assert.equal(s.foods.at(-1).fat,7.5);assert.equal(s.foods.at(-1).carbs,37.5);const count=s.foods.length;await page.evaluate(()=>{forgeOpenFoodModal({name:'Invalid',cal:200,p:10,f:5,c:25});document.getElementById('forgeFoodGrams').value='-10';forgeAddFood()});assert.equal((await snap()).foods.length,count)});
 await test('Recipe creation and per-serving macros',async()=>{await page.evaluate(()=>n10EditRecipe());await page.locator('#n10RecipeName').fill('Audit recipe');await page.locator('#n10RecipeServings').fill('2');for(const [k,v] of Object.entries({name:'Ingredient',grams:'200',cal:'100',protein:'10',fat:'4',carbs:'6'}))await page.locator('#n10Ingredient0 [data-k="'+k+'"]').fill(v);await page.evaluate(()=>{n10SaveRecipe();n10AddRecipe(state.n10Recipes.length-1)});assert.equal((await snap()).foods.at(-1).cal,100)});
 await test('Nutrition and recipes survive reload',async()=>{await page.reload();assert.equal((await snap()).foods.at(-1).name,'Audit recipe');assert.equal((await snap()).n10Recipes.at(-1).name,'Audit recipe')});
 let backup;
 await test('JSON export contains diary, programs and recipes',async()=>{await page.evaluate(()=>{window.AndroidBridge={saveBlob:(name,base64,mime)=>window.auditExport={name,base64,mime}};exportData()});const e=await page.evaluate(()=>auditExport);backup=JSON.parse(Buffer.from(e.base64,'base64').toString('utf8'));assert.equal(backup.workouts.length,(await snap()).workouts.length);assert.equal(backup.n10Recipes.at(-1).name,'Audit recipe')});
 await test('Cancelled import leaves memory and storage unchanged',async()=>{const before=await snap();accept=false;await restore({...backup,foods:[]});accept=true;assert.deepEqual(await snap(),before)});
 await test('Malformed JSON leaves diary unchanged',async()=>{const before=await snap();await restore('{broken');assert.deepEqual(await snap(),before)});
 await test('JSON round trip restores records',async()=>{await page.evaluate(()=>{state.foods=[];save()});await restore(backup);assert.deepEqual((await snap()).foods,backup.foods);await page.reload();assert.deepEqual((await snap()).workouts,backup.workouts)});
 await test('Quota failure during import rolls back memory and storage',async()=>{const before=await snap();await page.evaluate(()=>{window.auditSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='forge_v2')throw new DOMException('quota','QuotaExceededError');return auditSetItem.call(this,k,v)}});await restore({...backup,foods:[]});await page.evaluate(()=>Storage.prototype.setItem=auditSetItem);assert.deepEqual(await snap(),before);await page.reload();assert.deepEqual((await snap()).foods,before.foods)});
 await test('CSV export escapes spreadsheet formulas',async()=>{await page.evaluate(()=>{window.AndroidBridge={saveBlob:(name,base64,mime)=>window.auditExport={name,base64,mime}};state.foods.push({name:'=1+1',date:today(),cal:1});n9ExportFoodsCSV()});await page.waitForFunction(()=>window.auditExport);const e=await page.evaluate(()=>auditExport);assert.ok(Buffer.from(e.base64,'base64').toString('utf8').includes("'=1+1"));await page.evaluate(()=>{state.foods.pop();save()})});
 await test('Malformed record beyond index 50 is rejected',async()=>{const before=await snap(),bad=structuredClone(backup);bad.foods=Array.from({length:51},()=>({...backup.foods[0]}));bad.foods.push(null);await restore(bad);assert.deepEqual(await snap(),before)});
 await test('Invalid programs, recipes and set values rejected',async()=>{for(const patch of [{programs:[{name:'bad',days:null}]},{n10Recipes:[{name:'bad',items:[null]}]},{workouts:[{sets:[{exercise:'Test',weight:-1,reps:5}]}]}]){const before=await snap();await restore({...backup,...patch});assert.deepEqual(await snap(),before)}});
 await test('Large valid history (1000 foods) persists through restore',async()=>{const data=structuredClone(backup);data.foods=Array.from({length:1000},(_,i)=>({...backup.foods[0],id:'food-'+i}));await restore(data);await page.reload();assert.equal((await snap()).foods.length,1000);await restore(backup)});
 assert.deepEqual(errors,[]);console.log('PASS: no uncaught browser errors; '+passed.length+' scenarios.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

