import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const assets=new URL('../app/src/main/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('../artwork/exercise-manifest.json',import.meta.url)));
const context={window:{},state:{n9UserPhotos:{}}};
runInNewContext(readFileSync(new URL('exercise-art.js',assets),'utf8'),context);
const art=context.window.ForgeArt;
assert.equal(manifest.length,556);
assert.equal(Object.keys(art.registry.exercises).length,556);
for(const item of manifest){
  const entry=art.entry(item.name);
  assert.ok(entry,`Missing exercise: ${item.name}`);
  assert.equal(entry.group,item.group);
  assert.equal(entry.frames.length,2);
  for(const file of entry.frames){
    assert.ok(!file.includes('..')&&!file.includes(':'),file);
    assert.ok(existsSync(new URL(file,assets)),file);
  }
}
for(const file of Object.values(art.registry.muscles))assert.ok(existsSync(new URL(file,assets)),file);
const shoulders=['Жим штанги стоя','Жим гантелей сидя','Разведение гантелей в стороны','Разведение гантелей в наклоне','Тяга штанги к подбородку','Подъём диска перед собой'];
assert.equal(new Set(shoulders.map(n=>art.source(n))).size,shoulders.length);
assert.equal(art.source('Неизвестное упражнение'),null);
assert.equal(art.source('Жим штанги лежа'),art.source('Жим штанги лёжа'));
context.state.n9UserPhotos[shoulders[0]]='data:image/png;base64,personal';
assert.equal(art.source(shoulders[0]),'data:image/png;base64,personal');
assert.ok(art.thumb('<script>').includes('&lt;script&gt;'));
console.log('PASS: 556 exact-name mappings, all local files, distinct shoulder motions, custom image priority, safe fallback.');
