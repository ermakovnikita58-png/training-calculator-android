const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, openPage, scene } = require('./ux-v2-fixture.cjs');

(async () => {
  const assets = path.resolve(process.env.FORGE_UX_ASSETS || 'app/src/main/assets');
  const stage = process.env.FORGE_UX_STAGE || 'after';
  const output = path.resolve('docs/ux-v2', stage);
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  const results = [];
  try {
    for (const width of [320, 360, 390, 412]) {
      const { context, page } = await openPage(browser, { width, height: 844 }, assets);
      const scenes = width === 390 ? ['home', 'products', 'categories', 'workout', 'new-program', 'program', 'cycle', 'exercise', 'statistics'] : ['products'];
      for (const name of scenes) {
        await scene(page, name);
        await page.screenshot({ path: path.join(output, name + '-' + width + '.png'), animations: 'disabled' });
        results.push(await page.evaluate(({ width, name }) => {
          const box = selector => {
            const element = document.querySelector(selector);
            if (!element) return null;
            return { height: Math.round(element.getBoundingClientRect().height), top: Math.round(element.getBoundingClientRect().top) };
          };
          return { width, name, header: box('.top'), firstResult: box('.food-catalog-result'),
            sourceButtons: [...document.querySelectorAll('[data-food-tab]')].map(button => ({
              text: button.textContent, width: button.clientWidth, content: button.scrollWidth
            })) };
        }, { width, name }));
      }
      await context.close();
    }
    await fs.writeFile(path.join(output, 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
    console.log('PASS actual application screenshots saved in ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
