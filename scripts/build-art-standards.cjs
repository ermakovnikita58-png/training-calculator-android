// Two deliberately incompatible artwork classes. Never convert shaded mannequins into exercise art.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),norm=s=>s.toLowerCase().replaceAll('ё','е').trim(),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=read('artwork/exercise-manifest.json'),catalog=read('artwork/catalog-metadata.json'),upstream=read('artwork/upstream-workout-guide-manifest.json'),ever=read('artwork/everkinetic-reference.json').entries,corrections=read('artwork/visual-corrections.json'),groups=read('artwork/muscle-art-sources.json');
const decisions=read('artwork/art-visual-decisions.json');
const originals=fs.existsSync(path.join(root,'artwork/original-contour-register.json'))?read('artwork/original-contour-register.json'):[];
const licensed=fs.existsSync(path.join(root,'artwork/licensed-contour-additions.json'))?read('artwork/licensed-contour-additions.json'):[];
const aliases=read('artwork/verified-contour-aliases.json');
if(new Set(aliases.map(x=>x.name)).size!==aliases.length)throw Error('Duplicate verified alias name');
for(const alias of aliases){
 if(alias.name===alias.sourceName||!alias.reason||!originals.some(x=>x.name===alias.sourceName)||!manifest.some(x=>x.name===alias.name))throw Error('Invalid verified contour alias: '+alias.name);
}
const registry={version:3,types:['MUSCLE_GROUP_ART','EXERCISE_TECHNIQUE_ART'],resources:{},muscleGroups:{},exercises:{}};
const muscleIds=new Set();
for(const g of groups){
 const bytes=fs.readFileSync(path.join(assets,g.file));
 if(!/^[a-z]+(?:-[a-z]+)*$/.test(g.id)||muscleIds.has(g.id)||Object.hasOwn(registry.muscleGroups,g.group)||Object.hasOwn(registry.resources,g.file)||!g.file.endsWith('.webp')||hash(bytes)!==g.sha256)throw Error('Invalid group source '+g.group);
 muscleIds.add(g.id);
 registry.resources[g.file]={...g};
 registry.muscleGroups[g.group]={id:g.id,group:g.group,type:'MUSCLE_GROUP_ART',file:g.file,status:g.status,highlight:g.highlight};
}
fs.mkdirSync(path.join(assets,'exercise-contours'),{recursive:true});
function contour(file,source,credit){
 const bytes=fs.readFileSync(path.join(assets,file));let svg=bytes.toString('utf8');
 if(!/<svg\b/.test(svg)||/<(?:image|script|foreignObject)\b|Gradient|url\(#(?:silver|hot)\)|NaN|undefined/i.test(svg))throw Error('Not an original contour SVG: '+file);
 const colours=[...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map(x=>x[1].toLowerCase());
 if(colours.some(c=>!['none','#fff','#ffffff','#333','#333333'].includes(c)))throw Error('Unsupported contour palette '+file+' '+colours.join(','));
 let target=file,changes='Original light contour retained; no colour filter.';
 if(colours.some(c=>c==='#333'||c==='#333333')){
  target='exercise-contours/'+path.basename(file);
  const darkAt=svg.search(/<g\b[^>]*fill="#333(?:333)?"/i);
  svg=svg.replace(/<g\s+fill="#(?:fff|ffffff)"[^>]*>[\s\S]*?<\/g>/gi,(layer,offset)=>{
   if(darkAt<0||offset>darkAt||/<g\b/i.test(layer.slice(layer.indexOf('>')+1)))throw Error('Ambiguous white layer; manual review required: '+file);
   return ''; // A separate background layer preceding every dark contour, not figure geometry.
  });
  svg=svg.replace(/<path\b[^>]*fill="#(?:fff|ffffff)"[^>]*\/>/gi,(layer,offset)=>{
   const inkAt=svg.search(/<g\b[^>]*fill="#333(?:333)?"/i);if(inkAt<0||offset>inkAt)throw Error('Ambiguous foreground white path: '+file);return '';
  });
  svg=svg.replace(/#333333|#333\b/gi,'#eef2ef').replace(/<svg\b[^>]*>/,tag=>tag.replace(/\s(?:width|height)="[^"]*"/g,'').replace('<svg','<svg width="512" height="512"'));
  fs.writeFileSync(path.join(assets,target),svg);changes='Removed the separate white background layer preceding all dark contour paths. Retained original contour geometry and set its vector fill to #eef2ef; normalized viewport size. No CSS filter or shaded-body conversion.';
 }
 if(!registry.resources[target]){const b=fs.readFileSync(path.join(assets,target));registry.resources[target]={type:'EXERCISE_TECHNIQUE_ART',file:target,format:'svg',style:'light-contour-on-transparent',sourceFile:file,sourceSHA256:hash(bytes),sha256:hash(b),bytes:b.length,source,credit,license:'CC BY-SA 4.0',changes,expertVerified:false,styleReview:'contour-source-palette-checked; contact-sheet-review-required'};}
 return target;
}
const review=[];
for(const item of manifest){
 const row=catalog.find(x=>x.name===item.name),u=upstream.find(x=>x.slug===item.slug),id=item.slug.match(/^ek-(\d+)/)?.[1],e=ever.find(x=>x.id===id),fix=corrections.find(x=>x.name===item.name);
 const licensedMatch=licensed.find(x=>x.name===item.name);
 const source=licensedMatch?.source||(fix?.action==='replace'?{name:'Preacher Curl: Barbell',url:fix.source,equipment:'Barbell'}:u?{name:u.name,url:'https://github.com/bryllim/workout-guide/tree/main/packages/workout-guide/'+u.frames[0].path,equipment:u.equipment}:e?{name:e.title,url:'https://github.com/everkinetic/data/blob/main/dist/svg/'+e.id+'-relaxation.svg',equipment:e.equipment.join(', ')}:null);
 const reasons=[];let files=fix?.frames||item.files;
 const visual=decisions.find(x=>x.name===item.name);if(visual?.status==='not-ready')reasons.push(visual.reason);
 if(item.kind!=='vector')reasons.push('Объёмная цветная схема не соответствует EXERCISE_TECHNIQUE_ART; требуется оригинальная контурная иллюстрация.');
 if(files.some(f=>!f.endsWith('.svg')))reasons.push('В исходном соответствии есть PNG вместо подтверждённого контурного SVG; файл не выдаётся за векторную технику.');
 if(fix?.action==='placeholder')reasons.push(fix.reason);
 const n=norm(item.name),s=(source?.name||'').toLowerCase(),eq=(source?.equipment||'').toLowerCase();
 if(item.kind==='vector'&&source){
  const checks=[[/гантел/,/dumbbell/,'гантели'],[/гир/,/kettlebell/,'гиря'],[/резин|эспандер/,/band/,'резинка'],[/штанг|гриф/,/barbell|smith|machine/,'штанга']];
  for(const [a,b,label] of checks)if(a.test(n)&&!b.test(eq))reasons.push('Снаряд в названии ('+label+') не подтверждён метаданными источника ('+source.equipment+').');
  if(/скользящ.*диск/.test(n)&&/towel/.test(eq))reasons.push('Источник показывает полотенце, а не скользящие диски.');
  else if(/блин|диск/.test(n)&&!/plate|weight/.test(eq))reasons.push('Диск в названии не соответствует снаряду источника ('+source.equipment+').');
  if(/сидя/.test(n)&&/standing/.test(s))reasons.push('Название требует сидячей опоры, источник явно указывает standing.');
  if(/стоя/.test(n)&&/seated|sitting/.test(s))reasons.push('Название требует стойки, источник явно указывает seated.');
  if(/наклонной/.test(n)&&/flat bench/.test(eq))reasons.push('Название требует наклонной скамьи, источник указывает flat bench.');
 }
 const alias=aliases.find(x=>x.name===item.name);
 const authored=originals.find(x=>x.name===(alias?.sourceName||item.name));
 let frames=[];if(authored){
  if((!alias&&authored.group!==item.group)||authored.type!=='EXERCISE_TECHNIQUE_ART')throw Error('Invalid authored mapping: '+item.name);
  frames=authored.frames;
  for(const file of frames){const b=fs.readFileSync(path.join(assets,file)),h=hash(b);if(authored.files.find(x=>x.file===file)?.sha256!==h)throw Error('Stale authored SVG hash: '+file);registry.resources[file]={type:'EXERCISE_TECHNIQUE_ART',file,format:'svg',style:'light-contour-on-transparent',sourceFile:file,sourceSHA256:h,sha256:h,bytes:b.length,source:authored.source,credit:authored.credit,license:authored.license,changes:'Original authored FORGE contour geometry, not a conversion from a shaded model.',expertVerified:false,styleReview:authored.styleReview};}
 }else if(licensedMatch){
  frames=licensedMatch.files.map(file=>contour(file,source,licensedMatch.credit));
 }else if(!reasons.length)frames=files.map(f=>contour(f,source,fix?.action==='replace'?'Everkinetic / Greg Priday · CC BY-SA 4.0':item.credit));
 const status=frames.length?'ready-style-needs-biomechanics-review':'not-ready',samePhase=frames.length===2&&fs.readFileSync(path.join(assets,frames[0])).equals(fs.readFileSync(path.join(assets,frames[1])));
 registry.exercises[norm(item.name)]={id:'forge-ex-'+String(manifest.indexOf(item)+1).padStart(3,'0'),name:item.name,group:item.group,type:'EXERCISE_TECHNIQUE_ART',frames,status,source:authored?.source||source,credit:frames.length?registry.resources[frames[0]].credit:item.credit,missingReason:frames.length?'':reasons.join(' '),replacedSourceReason:(authored||licensedMatch)?reasons.join(' '):null,phaseStatus:authored?.phaseStatus||(licensedMatch?.static?'static-single-frame':samePhase?'identical-source-frames':frames.length?'two-source-frames':'not-available'),expertVerified:false,authoredSpec:authored?{equipment:authored.equipment,support:authored.support,grip:authored.grip,description:authored.description}:null,metadataReview:'equipment and explicit posture conflicts checked; not an expert pose approval'};
 if(alias)registry.exercises[norm(item.name)].verifiedAlias={sourceName:alias.sourceName,reason:alias.reason};
 review.push({...registry.exercises[norm(item.name)],originalFiles:item.files,equipment:row.equipment,requiredReplacement:frames.length?null:{type:'EXERCISE_TECHNIQUE_ART',style:'Thin white/light-gray anatomical contour, transparent SVG on #101912; no gradients, shaded models or coloured muscle fill',equipment:row.equipment,poses:'Source and final phase appropriate to the exact name; static holds must not invent movement',size:'512x512 viewBox, complete equipment visible',rights:'Original project vector or traceable CC BY-SA 4.0 source',doNotUse:'Unrelated exercise, 3D anatomy, photographs or CSS inversion'}});
}
fs.writeFileSync(path.join(root,'artwork/art-registry.json'),JSON.stringify(registry,null,2)+'\n');
fs.writeFileSync(path.join(root,'artwork/art-reference-review.json'),JSON.stringify(review,null,2)+'\n');
function installRegistry(registry) {
 'use strict';
 const norm = value => String(value || '').toLowerCase().replaceAll('ё','е').trim();
 const groups = new Map();
 for (const art of Object.values(registry.muscleGroups)) {
  groups.set(art.id, art);
  groups.set(norm(art.group), art);
 }
 for (const [label, id] of Object.entries({
  'Бицепсы':'biceps', 'Трицепсы':'triceps', 'Квадрицепсы':'quads',
  'Предплечье':'forearms', 'Задняя поверхность бедра':'hamstrings',
  'Разгибатели спины':'lower-back', 'Широчайшие':'back'
 })) groups.set(norm(label), groups.get(id));
 function resource(file, type) {
  const art = registry.resources[file];
  return art?.type === type ? art : null;
 }
 function exercise(name) {
  const art = registry.exercises[norm(name)];
  return art?.type === 'EXERCISE_TECHNIQUE_ART' ? art : null;
 }
 function muscleGroup(name) {
  const art = groups.get(norm(name));
  return art && resource(art.file, 'MUSCLE_GROUP_ART') ? art : null;
 }
 window.ForgeArtStandards = {
  registry, resource, exercise, muscleGroup,
  systemSource(name) {
   const file = exercise(name)?.frames[0];
   return resource(file, 'EXERCISE_TECHNIQUE_ART') ? file : null;
  },
  muscleSource: name => muscleGroup(name)?.file ?? null
 };
}
const runtime='/* Generated by scripts/build-art-standards.cjs. Personal photos are deliberately outside this registry. */\n('+installRegistry.toString()+')('+JSON.stringify(registry)+');\n';
fs.writeFileSync(path.join(assets,'art-registry.js'),runtime);
const ready=review.filter(x=>x.frames.length).length;console.log(JSON.stringify({groups:groups.length,restored:groups.filter(x=>x.origin.startsWith('restored')).length,newGroups:groups.filter(x=>!x.origin.startsWith('restored')).length,contourExercises:ready,notReady:review.length-ready,resources:Object.keys(registry.resources).length,derivedContourFiles:Object.keys(registry.resources).filter(f=>f.startsWith('exercise-contours/')).length},null,2));
