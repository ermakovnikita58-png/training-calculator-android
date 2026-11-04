// Vectorises the white ink of already inspected original FORGE line art.
// This does not edge-filter or recolour a shaded model. Inputs must be hollow contour artwork.
// Local raw PNGs/jobs stay outside the APK. Source hashes and complete prompts are published.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets'),catalog=JSON.parse(fs.readFileSync(path.join(root,'artwork/original-catalog.json'))),jobs=JSON.parse(fs.readFileSync(process.argv[2]||path.resolve(root,'../build-tools/contour-image-jobs.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const registerFile=path.join(root,'artwork/original-contour-register.json');
const previous=new Map((fs.existsSync(registerFile)?JSON.parse(fs.readFileSync(registerFile)):[]).map(entry=>[entry.name,entry]));
function simplify(points,epsilon=.5){
 const sq=epsilon*epsilon;function rdp(a,b,out){const p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],den=dx*dx+dy*dy;let max=sq,k=0;for(let i=a+1;i<b;i++){const z=points[i],t=den?Math.max(0,Math.min(1,((z[0]-p[0])*dx+(z[1]-p[1])*dy)/den)):0,d=(z[0]-p[0]-t*dx)**2+(z[1]-p[1]-t*dy)**2;if(d>max){max=d;k=i;}}if(k){rdp(a,k,out);out.push(points[k]);rdp(k,b,out);}}
 const out=[points[0]];rdp(0,points.length-1,out);out.push(points[points.length-1]);return out;
}
function trace(bits,w,h){
 const edges=new Map(),stride=w+1,key=(x,y)=>y*stride+x,edge=(a,b)=>{if(!edges.has(a))edges.set(a,[]);edges.get(a).push(b);},on=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&bits[y*w+x];let ink=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(on(x,y)){ink++;if(!on(x,y-1))edge(key(x,y),key(x+1,y));if(!on(x+1,y))edge(key(x+1,y),key(x+1,y+1));if(!on(x,y+1))edge(key(x+1,y+1),key(x,y+1));if(!on(x-1,y))edge(key(x,y+1),key(x,y));}
 if(ink/(w*h)>.15||ink/(w*h)<.002)throw Error('Input is not sparse contour line art: '+ink/(w*h));
 const paths=[];while(edges.size){const start=edges.keys().next().value;let current=start,points=[],guard=0;do{points.push([current%stride,Math.floor(current/stride)]);const list=edges.get(current);if(!list?.length)throw Error('Open trace boundary');const next=list.pop();if(!list.length)edges.delete(current);current=next;if(++guard>w*h*4)throw Error('Trace loop');}while(current!==start);if(points.length<5)continue;points.push(points[0]);const p=simplify(points);if(p.length>3)paths.push('M'+p.map(x=>x.join(',')).join('L')+'Z');}
 return {d:paths.join(''),inkRatio:ink/(w*h),loops:paths.length};
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FORGE_CHROMIUM?{executablePath:process.env.FORGE_CHROMIUM}:{})}),page=await browser.newPage();const entries=[],raw=path.resolve(root,'../build-tools/contour-originals');fs.mkdirSync(raw,{recursive:true});fs.mkdirSync(path.join(assets,'exercise-contours/original-v4'),{recursive:true});
 try{for(const job of jobs){if(job.review!=='approved-style-pose-preliminary')continue;const index=catalog.findIndex(([name])=>name===job.name);if(index<0)throw Error('Unknown exercise '+job.name);const id='forge-ex-'+String(index+1).padStart(3,'0'),bytes=fs.readFileSync(job.path),sourcePNG=id+'.png';fs.copyFileSync(job.path,path.join(raw,sourcePNG));
  const saved=previous.get(job.name);
  const creation=job.creation||'Original ImageGen hollow white contour';
  const author=job.creation?'FORGE · original hand-drawn SVG':'FORGE · original ImageGen contour';
  if(saved?.sourcePNG_SHA256===hash(bytes)&&saved.prompt===job.prompt&&saved.files.every(({file,sha256})=>fs.existsSync(path.join(assets,file))&&hash(fs.readFileSync(path.join(assets,file)))===sha256)){
   entries.push(saved);continue;
  }
  const data=await page.evaluate(async ({dataURL,isStatic,splitAxis,sceneryCrossesGap})=>{
   const im=new Image();im.src=dataURL;await im.decode();const width=im.naturalWidth,h=im.naturalHeight,full=document.createElement('canvas');full.width=width;full.height=h;const fc=full.getContext('2d');fc.drawImage(im,0,0);const rgba=fc.getImageData(0,0,width,h).data,cols=new Uint32Array(width),phases=[];
   for(let i=0;i<width*h;i++)if(rgba[i*4+3]>128&&Math.min(rgba[i*4],rgba[i*4+1],rgba[i*4+2])>110)cols[i%width]++;
   if(isStatic){
    const bits=[];for(let i=0;i<width*h;i++)bits.push(rgba[i*4+3]>128&&Math.min(rgba[i*4],rgba[i*4+1],rgba[i*4+2])>110?1:0);
    return {w:width,h,phases:[bits]};
   }
   if(splitAxis==='y'){
    const split=Math.floor(h/2),height=h-split;
    for(let k=0;k<2;k++){
     const bits=new Array(width*height).fill(0);
     for(let y=0;y<(k?height:split);y++)for(let x=0;x<width;x++){
      const i=((y+(k?split:0))*width+x)*4;
      bits[y*width+x]=rgba[i+3]>128&&Math.min(rgba[i],rgba[i+1],rgba[i+2])>110?1:0;
     }
     phases.push(bits);
    }
    return {w:width,h:height,phases};
   }
   let split=width/2,best=Infinity;for(let x=Math.floor(width*.40);x<width*.60;x++)if(cols[x]===0&&Math.abs(x-width/2)<best){best=Math.abs(x-width/2);split=x;}
   if(!Number.isFinite(best)&&!sceneryCrossesGap)throw Error('No clean gap between phase figures; needs manual layout review');
   split=Math.floor(split);
   const w=Math.max(split,width-split);for(let k=0;k<2;k++){const sx=k?split:0,sw=k?width-split:split,pad=Math.floor((w-sw)/2),bits=new Array(w*h).fill(0);for(let y=0;y<h;y++)for(let x=0;x<sw;x++){const i=(y*width+sx+x)*4;bits[y*w+pad+x]=rgba[i+3]>128&&Math.min(rgba[i],rgba[i+1],rgba[i+2])>110?1:0;}phases.push(bits);}
   return {w,h,split,phases};
  },{dataURL:'data:image/png;base64,'+bytes.toString('base64'),isStatic:!!job.static,splitAxis:job.splitAxis,sceneryCrossesGap:job.sceneryCrossesGap===true});
  const traced=data.phases.slice(0,job.static?1:2).map(bits=>trace(bits,data.w,data.h));let minX=data.w,minY=data.h,maxX=0,maxY=0;for(const bits of data.phases)for(let i=0;i<bits.length;i++)if(bits[i]){const x=i%data.w,y=Math.floor(i/data.w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}const edge=Math.max(maxX-minX,maxY-minY)+48,cx=(minX+maxX)/2,cy=(minY+maxY)/2,viewBox=[cx-edge/2,cy-edge/2,edge,edge].join(' '),frames=[];
  for(const [phase,t]of traced.entries()){const file=`exercise-contours/original-v4/${id}-${phase+1}.svg`;fs.writeFileSync(path.join(assets,file),`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${viewBox}" role="img" aria-labelledby="title desc"><title id="title">${esc(job.name)} — положение ${phase+1}</title><desc id="desc">${esc(creation)}, vector traced. ${esc(job.description||'')} Expert biomechanics approval pending.</desc><path fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round" fill-rule="evenodd" d="${t.d}"/></svg>\n`);frames.push(file);}
  entries.push({id,name:job.name,group:catalog[index][1],type:'EXERCISE_TECHNIQUE_ART',frames,phaseStatus:job.static?'static-single-frame':'two-authored-phases',equipment:job.equipment,support:job.support,grip:job.grip||'as-drawn',description:job.description||job.prompt,prompt:job.prompt,sourcePNG,sourcePNG_SHA256:hash(bytes),method:creation+'; white-ink boundary traced to SVG without embedded raster or colour filters',source:{name:author+', vector traced',url:'https://github.com/ermakovnikita58-png/training-calculator-android/blob/forge-11.2.3-complete-contours/artwork/original-contour-register.json',equipment:job.equipment},license:'Original project artwork; no third-party illustration copied',credit:author,expertVerified:false,styleReview:job.review,files:frames.map((file,i)=>({file,sha256:hash(fs.readFileSync(path.join(assets,file))),inkRatio:traced[i].inkRatio,loops:traced[i].loops}))});console.log('VECTOR:',id,job.name,frames.length,'phases');
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(root,'artwork/original-contour-register.json'),JSON.stringify(entries,null,2)+'\n');console.log('Real original vectors:',entries.length,'exercises; specialist review still required.');
})().catch(e=>{console.error(e);process.exit(1)});
