const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pixels } = require('./visual-checks.cjs');
const { chromium, openPage, scene } = require('./ux-v2-fixture.cjs');

(async () => {
  const update = process.env.FORGE_UX_REFERENCE_UPDATE === '1';
  const reference = path.resolve('docs/ux-v2/reference', process.platform);
  const output = path.resolve('test-results/ux-v2/visual');
  await fs.mkdir(output, { recursive: true });
  if (update) await fs.mkdir(reference, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  const result = [];
  try {
    for (const width of [320, 360, 390, 412]) {
      const { page, context } = await openPage(browser, { width, height: 844 }, path.resolve('app/src/main/assets'));
      const screens = width === 390 ? ['home', 'products', 'categories', 'workout', 'program', 'cycle', 'exercise', 'statistics'] : ['products'];
      for (const name of screens) {
        await scene(page, name);
        const filename = name + '-' + width + '.png';
        const actual = await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
        if (update) await fs.writeFile(path.join(reference, filename), actual);
        const before = pixels(await fs.readFile(path.join(reference, filename)));
        const after = pixels(actual);
        assert.deepEqual([before.width, before.height], [after.width, after.height]);
        let changed = 0;
        for (let y = 0; y < after.height; y++) {
          for (let x = 0; x < after.width; x++) {
            const a = before.at(x, y), b = after.at(x, y);
            if (a.some((value, index) => Math.abs(value - b[index]) > 24)) changed++;
          }
        }
        const fraction = changed / (after.width * after.height);
        result.push({ filename, fraction });
        assert.ok(fraction <= .012, filename + ' exceeded the 1.2% changed-pixel threshold: ' + fraction);
      }
      await context.close();
    }
    await fs.writeFile(path.join(output, 'comparison.json'), JSON.stringify({ browser: browser.version(), platform: process.platform, update, result }, null, 2) + '\n');
    console.log('PASS 11 rendered screenshots matched their ' + process.platform + ' reference images');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
