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
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

