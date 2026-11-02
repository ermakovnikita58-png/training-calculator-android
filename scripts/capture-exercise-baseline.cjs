// Manual, reproducible BEFORE screenshots from the immutable Performance UI base.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets'),out=path.join(root,'docs/exercise-screenshots');
 const base='f83d306f6c8f4b8e2de473abffc985789fb54549',cache=new Map(),browser=await chromium.launch({headless:true,...(process.env.FORGE_CHROMIUM?{executablePath:process.env.FORGE_CHROMIUM}:{})});
 fs.mkdirSync(out,{recursive:true});
 try{for(const viewport of [{width:360,height:800},{width:390,height:844},{width:412,height:915}]){
  const ctx=await browser.newContext({viewport}),page=await ctx.newPage();
  await ctx.route('**/*',route=>{const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname.slice(8)),file=path.resolve(assets,relative);
   if(url.origin!=='https://appassets.androidplatform.net'||!file.startsWith(assets+path.sep))return route.abort();
   if(!cache.has(relative)){try{cache.set(relative,cp.execFileSync('git',['show',base+':app/src/main/assets/'+relative],{cwd:root,maxBuffer:12*1024*1024,stdio:['ignore','pipe','ignore']}));}catch{return route.abort();}}
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}[path.extname(relative)]||'application/octet-stream';
   return route.fulfill({body:cache.get(relative),contentType:mime});
  });
  await page.goto('https://appassets.androidplatform.net/assets/index.html');
  await page.evaluate(()=>{showPage('home');showPage('plan');showPage('library');y8RenderGroups();scrollTo(0,0);document.activeElement?.blur()});await page.waitForTimeout(250);
  await page.screenshot({path:path.join(out,`groups-before-${viewport.width}.png`)});
  await page.evaluate(()=>{y8OpenGroup(encodeURIComponent('Плечи'));scrollTo(0,0);document.activeElement?.blur()});await page.waitForTimeout(200);
  await page.screenshot({path:path.join(out,`list-before-${viewport.width}.png`)});
  await page.evaluate(()=>y8OpenCard(encodeURIComponent('Жим штанги стоя'),'library'));await page.waitForTimeout(200);await page.evaluate(()=>document.activeElement?.blur());
  await page.screenshot({path:path.join(out,`detail-before-${viewport.width}.png`)});await ctx.close();
 }}finally{await browser.close()}
 console.log('PASS: 9 BEFORE screenshots captured from '+base+' (no working-tree HTML substituted).');
})().catch(e=>{console.error(e);process.exit(1)});
