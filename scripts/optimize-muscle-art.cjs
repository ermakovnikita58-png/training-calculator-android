// ImageGen creates the content; this step only resizes/encodes that output for APK delivery.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets'),jobFile=process.argv[2]||path.resolve(root,'../build-tools/art-reference/image-jobs.json'),jobs=JSON.parse(fs.readFileSync(jobFile,'utf8'));
 const out=path.join(assets,'anatomy/reference-v3');fs.mkdirSync(out,{recursive:true});const rawDir=path.resolve(root,'../build-tools/art-reference/originals');fs.mkdirSync(rawDir,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.FORGE_CHROMIUM?{executablePath:process.env.FORGE_CHROMIUM}:{})}),page=await browser.newPage(),entries=[];
 const old=[['Грудь',0],['Спина',1],['Плечи',2],['Бицепс',3],['Трицепс',4]];
 for(const [group,i] of old){const file=`anatomy/muscle-${i}.webp`,bytes=fs.readFileSync(path.join(assets,file));entries.push({group,type:'MUSCLE_GROUP_ART',file,status:'ready-style',origin:'restored-project-ImageGen',rightsBasis:'Original project synthetic generation; historical provenance in artwork/README.md',historicalPromptAvailable:false,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,expertVerified:false,visualReview:'matches-owner-anatomy-reference',highlight:'orange'});}
 try{for(const job of jobs){
  const png=fs.readFileSync(job.sourceLocalPath);fs.copyFileSync(job.sourceLocalPath,path.join(rawDir,job.key+'.png'));
  const url=await page.evaluate(async data=>{const im=new Image();im.src=data;await im.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=480;const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0,480,480);return canvas.toDataURL('image/webp',.68)},'data:image/png;base64,'+png.toString('base64'));
  const bytes=Buffer.from(url.split(',')[1],'base64'),file='anatomy/reference-v3/'+job.key+'.webp';fs.writeFileSync(path.join(assets,file),bytes);
  entries.push({group:job.group,type:'MUSCLE_GROUP_ART',file,status:'ready-style',origin:'ImageGen-2026-11-02',rightsBasis:'New original project generation using project-owned synthetic style references; no stock image imported',prompt:job.prompt,referenceFiles:job.refs,originalOutputFilename:path.basename(job.sourceLocalPath),originalOutputSHA256:crypto.createHash('sha256').update(png).digest('hex'),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,encoding:{width:480,height:480,format:'webp',quality:.68},expertVerified:false,visualReview:'generated-output-and-contact-sheet-review-required',highlight:['cardio','mobility'].includes(job.key)?'none-non-muscle-category':'orange'});
 }}finally{await browser.close()}
 fs.writeFileSync(path.join(root,'artwork/muscle-art-sources.json'),JSON.stringify(entries,null,2)+'\n');console.log('Prepared',entries.length,'realistic anatomical group assets; restored originals left byte-identical; original PNGs preserved outside APK.');
})().catch(e=>{console.error(e);process.exit(1)});
