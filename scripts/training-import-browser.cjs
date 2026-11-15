const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const assets = path.resolve(__dirname, '../app/src/main/assets');
const source = process.env.FORGE_TRAINING_SOURCE;
const files = source ? [{name:'source.json', mimeType:'application/json', buffer:fs.readFileSync(source)}] : [
  {name:'programs.txt', mimeType:'text/plain', buffer:Buffer.from('Программа проверки\n1. День #1\nОтдых\n   1. Тестовое упражнение')},
  {name:'workouts.txt', mimeType:'text/plain', buffer:Buffer.from('03.08.2025, 13:29\nТренировка проверки\n00:30:15 • 0.13 т • 1 / 2 / 10\n1. Тестовое упражнение\n02:00/03:00/02:00\n0.13 т • 2 / 10 • 00:20\n   1. 12,5кг • 10x • 5 8\n   2. 4кг • 0x')}
];

(async () => {
  const browser = await chromium.launch(process.env.FORGE_CHROMIUM ? {executablePath:process.env.FORGE_CHROMIUM} : {});
  try {
    const page = await browser.newPage({viewport:{width:360,height:844}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      const file = path.resolve(assets, decodeURIComponent(url.pathname.slice(8)));
      return url.origin === 'https://appassets.androidplatform.net' && url.pathname.startsWith('/assets/') &&
        file.startsWith(assets+path.sep) && fs.existsSync(file) ? route.fulfill({path:file}) : route.abort();
    });
    await page.goto('https://appassets.androidplatform.net/assets/index.html');
    await page.evaluate(() => {
      state.foods.push({id:'keep-food',name:'Существующая еда',date:today(),cal:123});
      state.n9UserPhotos = {'Жим штанги лёжа':'data:image/png;base64,existing'};
      state.n8ExerciseNotes = {'Жим штанги лёжа':'Существующая заметка'};
      save();
      showPage('profile');
      window.AndroidBridge = {saveTrainingImportBackup(name, data, id) {window.auditBackup = {name,data,id};}};
    });
    const snapshot = () => page.evaluate(() => ({live:JSON.stringify(state),disk:localStorage.getItem('forge_v2')}));
    const baseline = await snapshot();
    const entry = page.locator('#forgeTrainingImportEntry');
    const input = page.locator('#forgeTrainingImportFiles');
    const apply = page.locator('#forgeTrainingImportApply');
    const backup = page.locator('#forgeTrainingImportBackup');
    const preview = page.locator('#forgeTrainingImportPreview');
    const start = async () => {
      await entry.click();
      await input.setInputFiles(files);
      await preview.getByText('Предварительный просмотр').waitFor();
    };
    const completeBackup = success => page.evaluate(saved => ForgeTrainingImport.onBackupResult(auditBackup.id,saved),success);
    await start();
    assert.equal(await apply.isDisabled(),true);
    await backup.click();
    const encoded = await page.evaluate(() => auditBackup.data);
    assert.equal(Buffer.from(encoded,'base64').toString(),baseline.live);
    await completeBackup(false);
    assert.equal(await apply.isDisabled(),true);
    await page.locator('#forgeTrainingImportCancel').click();
    assert.deepEqual(await snapshot(),baseline);
    await start();
    await backup.click();
    await completeBackup(true);
    await page.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key,value) {
        if (key === 'forge_v2') throw new DOMException('quota','QuotaExceededError');
        return originalSetItem.call(this,key,value);
      };
    });
    await apply.click();
    assert.deepEqual(await snapshot(),baseline);
    await page.evaluate(() => {Storage.prototype.setItem = originalSetItem});
    await apply.click();
    const applied = JSON.parse((await snapshot()).disk);
    const prior = JSON.parse(baseline.live);
    for (const key of ['currentProgram','plans','foods','n9UserPhotos','n8ExerciseNotes']) assert.deepEqual(applied[key],prior[key]);
    const programs = applied.programs.filter(p => p.importSource);
    const workouts = applied.workouts.filter(w => w.importSource);
    assert.equal(programs.length,source?9:1);
    assert.equal(workouts.reduce((sum,w) => sum+w.sets.length,0),source?59:2);
    assert.ok(programs.every(p => p.days.every(d => d.day===null)));
    await page.evaluate(id => {
      if (activateProgram(id)) throw Error('Unassigned days must block activation');
      showPage('plan');
      n8OpenProgram(id);
    },programs[0].id);
    assert.match(await page.locator('#n8-program').innerText(),/Не назначен/);
    await page.locator('#n8-program [onclick="n8EditProgramDay(0)"]').click();
    assert.equal(await page.locator('#n8-day select').first().inputValue(),'');
    assert.ok(await page.locator('#n8-day input[placeholder="Не задано"]').evaluateAll(nodes => nodes.length>0 && nodes.every(input=>input.value==='')));
    await page.reload();
    await page.evaluate(() => showPage('progress'));
    await page.locator('.training-import-history summary').first().click();
    assert.match(await page.locator('.training-import-history[open]').innerText(), /Таймеры из экспорта/);
    await page.evaluate(() => showPage('profile'));
    await start();
    assert.equal(await apply.count(),0);
    assert.match(await preview.innerText(),/Повторы программ/);
    assert.deepEqual(errors,[]);
    console.log('PASS: preview, backup cancel, quota rollback, atomic merge, unassigned days, history and duplicate import' + (source?' (owner source)':''));
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1});
