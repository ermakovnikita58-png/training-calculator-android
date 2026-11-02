const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets'),context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(assets,'exercise-visual-data.js'),'utf8'),context);vm.runInNewContext(fs.readFileSync(path.join(assets,'anatomy-model.js'),'utf8'),context);
const data=context.window.ForgeExerciseVisualData,base=JSON.parse(fs.readFileSync(path.join(root,'artwork/original-catalog.json'))),reviews=JSON.parse(fs.readFileSync(path.join(root,'artwork/visual-review-register.json'))),resources=JSON.parse(fs.readFileSync(path.join(root,'artwork/visual-resource-register.json')));
assert.equal(Object.keys(data.exercises).length,556);assert.equal(reviews.length,556);
const norm=s=>s.toLowerCase().replaceAll('ё','е');
for(const [name,group] of base){const x=data.exercises[norm(name)];assert.ok(x,name);assert.equal(x.name,name);assert.equal(x.group,group);assert.equal(x.reviewStatus,'requires-specialist-review');assert.ok(x.image.originalFrames.length===2);assert.ok(x.image.frames.length===2||x.image.status==='missing-specific');if(x.technique){for(const k of ['setup','alignment','breathing','finish'])assert.ok(x.technique[k].length>20,name+' '+k);assert.ok(x.technique.sequence.length&&x.technique.mistakes.length&&x.technique.cues.length);}else assert.equal(x.contentStatus,'needs-authoring');for(const f of x.image.frames){assert.ok(!f.includes('..')&&!path.isAbsolute(f)&&!f.includes(':')&&fs.existsSync(path.join(assets,f)),f);}if(x.image.kind==='vector')assert.match(x.image.credit,/CC BY-SA 4.0/);}
for(const r of resources){const b=fs.readFileSync(path.join(assets,r.file));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),r.sha256);assert.equal(r.pathChecked,true);assert.equal(r.expertVerified,false);}
assert.equal(Object.keys(data.muscleFiles).length,14);for(const file of Object.values(data.muscleFiles)){const svg=fs.readFileSync(path.join(assets,file),'utf8');assert.ok(svg.includes('Оригинальная условная схема FORGE'));assert.ok(!svg.includes('NaN')&&!svg.includes('undefined'));}
const get=n=>data.exercises[norm(n)];
assert.notEqual(get('Румынская тяга').technique.sequence[0],get('Становая тяга').technique.sequence[0]);
assert.notDeepEqual(get('Разведение гантелей в стороны').technique.sequence,get('Жим штанги стоя').technique.sequence);
assert.notDeepEqual(get('Подъём ног в висе').technique.sequence,get('Скручивания').technique.sequence);
assert.notEqual(get('Велотренажёр').family,get('Гребной тренажёр').family);
assert.equal(get('Мёртвый жук').family,'deadbug');assert.equal(get('Вакуум живота').contentStatus,'needs-authoring');
assert.equal(get('Подъём EZ-штанги на скамье Скотта').image.frames[0],'exercise-art/ek-0239-relaxation.svg');
assert.equal(get('Тяга гантелей грудью на наклонной скамье').image.frames.length,0);assert.equal(get('Скручивания с гантелью на груди').image.frames.length,0);
assert.ok(fs.existsSync(path.join(assets,'exercise-art/LICENSE-CC-BY-SA-4.0.md')));
const placeholderCount=Object.values(data.exercises).filter(x=>!x.image.frames.length).length;assert.equal(placeholderCount,2,'No mass replacement with placeholders');
const duplicates=JSON.parse(fs.readFileSync(path.join(root,'artwork/visual-duplicates-register.json')));
for(const name of duplicates.identicalPhasePairs)assert.equal(get(name).image.phaseStatus,'identical-source-frames',name+' must not pretend to have two distinct poses');
for(const r of duplicates.files){const bytes=fs.readFileSync(path.join(assets,r.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),r.sha256);}
assert.equal(duplicates.renderedExercisePhaseFiles,902);assert.equal(duplicates.renderedGroupMaps,14);assert.equal(duplicates.expertVerified,false);
console.log(`PASS: 556 catalogue records unchanged; ${resources.length} image hashes/paths; 14 common-model maps; 74 movement families; targeted corrections and 2 honest placeholders; licences preserved. No expert certification claimed.`);
