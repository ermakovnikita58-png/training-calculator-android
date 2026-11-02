const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FORGE_CHROMIUM?{executablePath:process.env.FORGE_CHROMIUM}:{})});
 const assets=path.resolve(__dirname,'../app/src/main/assets'),url='https://appassets.androidplatform.net/assets/index.html';
 try {
 for(const viewport of [{width:360,height:800},{width:390,height:844},{width:412,height:915}]){
  const ctx=await browser.newContext({viewport}),page=await ctx.newPage(),errors=[];let accept=true;
  await ctx.route('**/*',route=>{const u=new URL(route.request().url()),f=path.resolve(assets,decodeURIComponent(u.pathname.slice(8)));if(u.origin===new URL(url).origin&&f.startsWith(assets+path.sep)&&fs.existsSync(f))return route.fulfill({path:f});return route.abort();});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept():d.dismiss());
  await page.goto(url);await page.waitForTimeout(120);
  const screen=()=>page.evaluate(()=>document.querySelector('.page.active').id);
  const back=async()=>{const result=await page.evaluate(()=>f6HandleAndroidBack());await page.waitForTimeout(80);return result};
  const go=async id=>{await page.evaluate(id=>showPage(id),id);await page.waitForTimeout(100)};
  await go('plan');await go('library');
  assert.ok(await page.locator('#library').evaluate(el=>el.getBoundingClientRect().top<120),'library follows header');
  assert.ok(await page.evaluate(()=>document.getElementById('library').contains(document.activeElement)),'new screen receives accessible focus');
  await back();assert.equal(await screen(),'plan');await back();assert.equal(await screen(),'home');
  console.log(`PASS ${viewport.width}: A home/programs/library/back chain; no viewport spacer`);
  await go('library');await page.evaluate(()=>{y8Search='жим';y8OpenGroup(encodeURIComponent('Плечи'))});
  const lib=await page.locator('#y8LibRoot').innerText();
  await page.evaluate(()=>y8OpenCard(encodeURIComponent('Жим штанги стоя'),'library'));
  await back();assert.equal(await page.locator('#y8DetailBack').evaluate(e=>e.classList.contains('show')),false);
  assert.equal(await screen(),'library');assert.equal(await page.locator('#y8LibRoot').innerText(),lib);
  assert.ok(await page.evaluate(()=>document.getElementById('library').contains(document.activeElement)),'closing card restores screen focus');
  console.log(`PASS ${viewport.width}: B exercise card closes; search/group retained`);
  await go('nutrition');await page.evaluate(()=>ForgeCoach.open());await back();assert.equal(await screen(),'nutrition');
  await page.evaluate(()=>openModal('weight'));await back();assert.equal(await page.locator('#modalback').evaluate(e=>e.classList.contains('show')),false);assert.equal(await screen(),'nutrition');
  await page.evaluate(()=>{openModal('weight');ForgeNavigation.persist()});await page.reload();await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>ForgeNavigation.inspect().overlay),'modalback');await back();
  await page.evaluate(()=>startWorkout(0));const draft=await page.evaluate(()=>{const d=structuredClone(state.active);d.exercises[0].sets[0].weight=87.5;return d});await page.locator('.n8-setgrid input').first().fill('87.5');await back();assert.deepEqual(await page.evaluate(()=>state.active),draft);
  console.log(`PASS ${viewport.width}: C/D/E Coach, modal Back and workout preservation`);
  await go('library');await page.evaluate(()=>{y8Search='';y8RenderGroups();scrollTo(0,600)});await page.waitForTimeout(100);const y=await page.evaluate(()=>scrollY);
  await go('nutrition');assert.equal(await page.evaluate(()=>scrollY),0);await back();assert.equal(await screen(),'library');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y)<4,'scroll restored');
  console.log(`PASS ${viewport.width}: F/G new-screen top; Back restores scroll`);
  await go('home');await go('plan');await go('library');await page.evaluate(()=>history.back());await page.waitForTimeout(150);assert.equal(await screen(),'plan');await page.evaluate(()=>history.back());await page.waitForTimeout(150);assert.equal(await screen(),'home');
  await go('home');await page.evaluate(()=>y8OpenCard(encodeURIComponent('Жим штанги стоя'),'library'));await back();assert.equal(await screen(),'home');assert.equal(await back(),'exit');
  console.log(`PASS ${viewport.width}: browser Back matches internal Back; home card never exits`);
  const ids=['home','plan','workout','progress','nutrition','foodcatalog','meals','cycles','library','profile','account'];
  for(let round=0;round<2;round++)for(const id of ids){await go(id);assert.equal(await screen(),id);assert.equal(await page.locator('.page.active').count(),1);assert.ok(await page.locator('#'+id).evaluate(e=>e.getBoundingClientRect().top<120),id+' starts under header');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' no horizontal overflow');}
  await go('library');await page.evaluate(()=>{y8Search='';y8RenderGroups();scrollTo(0,400);ForgeNavigation.persist()});await page.reload();await page.waitForTimeout(180);assert.equal(await screen(),'library');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-400)<4);
  // Activity recreation reloads the trusted local document; same persisted cache.
  await go('plan');await page.evaluate(()=>n8NewProgram());await page.locator('#n8ProgName').fill('Черновик навигации');await page.evaluate(()=>ForgeNavigation.persist());await page.reload();await page.waitForTimeout(150);
  assert.equal(await page.locator('#n8ProgName').inputValue(),'Черновик навигации');assert.equal(await page.locator('#n8-program').evaluate(e=>e.classList.contains('show')),true);
  accept=false;await back();assert.equal(await page.locator('#n8-program').evaluate(e=>e.classList.contains('show')),true);accept=true;await back();assert.equal(await screen(),'plan');
  await page.evaluate(()=>{n8NewProgram();n8EditProgramDay(-1);n8OpenPicker()});await back();assert.equal(await page.evaluate(()=>ForgeNavigation.inspect().overlay),'n8-day');await back();assert.equal(await page.evaluate(()=>ForgeNavigation.inspect().overlay),'n8-program');await back();assert.equal(await screen(),'plan');
  await go('progress');await page.evaluate(()=>{n8StatsSelect('weight');n8StatsRange(84);ForgeNavigation.persist()});await page.reload();await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>{const s=ForgeScreenNavigation.snapshot();return [s.statsTab,s.statsPeriod]}),['weight',84]);
  assert.ok(await page.evaluate(()=>ForgeNavigation.inspect().depth<=40));
  console.log(`PASS ${viewport.width}: H/J screen audit, restart, editor draft and cancelled discard`);
  await go('library');await page.setViewportSize({width:viewport.height,height:viewport.width});await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.setViewportSize(viewport);await page.addStyleTag({content:'body{font-size:20px!important} .page button,.page input,.page select,.page p{font-size:20px!important}'});
  for(const id of ['library','nutrition','profile','plan']){await go(id);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' enlarged text');}
  console.log(`PASS ${viewport.width}: I landscape + enlarged web text (not Android system font)`);
  assert.deepEqual(errors,[]);
  if(process.env.FORGE_SCREENSHOT_DIR&&viewport.width===390){await page.reload();await go('library');fs.mkdirSync(process.env.FORGE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.FORGE_SCREENSHOT_DIR,'navigation-library-after.png')});await go('nutrition');await page.evaluate(()=>ForgeCoach.open());await page.screenshot({path:path.join(process.env.FORGE_SCREENSHOT_DIR,'navigation-coach-after.png')});}
  await ctx.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
