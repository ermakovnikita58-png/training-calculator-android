const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, openPage, scene } = require('./ux-v2-fixture.cjs');

async function inspect(page) {
  return page.evaluate(() => {
    const overlay = ForgeNavigation.inspect().overlay;
    const root = (overlay && document.getElementById(overlay)) || document.querySelector('.page.active');
    const visible = element => {
      const closed = element.closest('details:not([open])');
      return element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' &&
        !element.closest('[hidden],[inert]') &&
        (!closed || closed.querySelector(':scope > summary')?.contains(element));
    };
    const name = element => (element.getAttribute('aria-label') || element.textContent || element.id).trim().replace(/\s+/g, ' ').slice(0, 100);
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push({ type: 'page-overflow', width: document.documentElement.scrollWidth });
    const elements = [...root.querySelectorAll('button,input:not([type=hidden]),select,textarea,summary')].filter(visible);
    if (!overlay) elements.push(...[...document.querySelectorAll('.top button,.tab,.fp-workout-dock button')].filter(visible));
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1) issues.push({ type: 'outside-viewport', name: name(element), left: rect.left, right: rect.right });
      if (element.matches('button,summary') && element.textContent.trim() && element.scrollWidth > element.clientWidth + 1) {
        issues.push({ type: 'clipped-label', name: name(element), width: element.clientWidth, content: element.scrollWidth });
      }
      if (element.matches('button,summary') && (rect.width < 47 || rect.height < 47)) {
        issues.push({ type: 'small-target', name: name(element), width: rect.width, height: rect.height });
      }
    }
    for (let i = 0; i < elements.length; i++) {
      const a = elements[i], ra = a.getBoundingClientRect();
      if (ra.bottom <= 0 || ra.top >= innerHeight) continue;
      for (const b of elements.slice(i + 1)) {
        if (a.contains(b) || b.contains(a)) continue;
        // Scrollable content can pass behind fixed chrome. Reachability is
        // checked independently by scrolling and hit-testing the actual action.
        const chrome = element => !!element.closest('.tabbar,.top,.fp-workout-dock');
        if (chrome(a) !== chrome(b)) continue;
        const rb = b.getBoundingClientRect();
        const trailingAccessory = (input, bounds, accessory) => input.matches('input[type=text],input[type=search]') &&
          Number.parseFloat(getComputedStyle(input).paddingRight) >= accessory.width &&
          accessory.left >= bounds.right - Number.parseFloat(getComputedStyle(input).paddingRight) &&
          accessory.right <= bounds.right + 1;
        if (a.parentElement === b.parentElement &&
          (trailingAccessory(a, ra, rb) || trailingAccessory(b, rb, ra))) continue;
        if (Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 1 &&
            Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 1) {
          issues.push({ type: 'overlap', names: [name(a), name(b)] });
        }
      }
    }
    const labels = [...root.querySelectorAll('button,summary,h1,h2,label')].filter(visible);
    for (const element of labels) {
      if (element.closest('.fp-sr')) continue;
      const boundary = element.getBoundingClientRect();
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some(rect => rect.width > 0 && (rect.left < boundary.left - 1 || rect.right > boundary.right + 1))) {
          issues.push({ type: 'text-outside-control', name: name(element) });
          break;
        }
      }
    }
    return { page: root.id, issues };
  });
}

const screens = ['home', 'products', 'categories', 'workout', 'plan', 'program', 'day', 'picker', 'cycle',
  'library', 'group', 'exercise', 'nutrition', 'meals', 'recipes', 'recipe', 'coach', 'statistics',
  'profile', 'account', 'portion', 'maxima', 'weight', 'custom-food'];

async function lastActionIsReachable(page, id) {
  return page.evaluate(async id => {
    const root = document.getElementById(id);
    const controls = [...root.querySelectorAll('button,input:not([type=hidden]),select,textarea,summary')].filter(element => {
      const closed = element.closest('details:not([open])');
      return element.getClientRects().length && !element.closest('[hidden],[inert]') &&
        getComputedStyle(element).visibility !== 'hidden' &&
        (!closed || closed.querySelector(':scope > summary')?.contains(element));
    });
    const last = controls.at(-1);
    if (!last) return true;
    last.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const box = last.getBoundingClientRect();
    const center = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.top >= 0 && box.bottom <= innerHeight + 1 && (last === center || last.contains(center));
  }, id);
}

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.FORGE_CHROMIUM });
  const source = path.resolve(process.env.FORGE_UX_ASSETS || 'app/src/main/assets');
  const report = [];
  try {
    const sizes = process.env.FORGE_UX_QUICK ? [[320, 844, 1], [320, 844, 2]] :
      [...[320, 360, 375, 390, 412, 430, 480, 768].map(width => [width, 844, 1]),
        [844, 390, 1], ...[1.2, 1.5, 2].flatMap(scale => [[320, 844, scale], [390, 844, scale]])];
    for (const [width, height, scale] of sizes) {
      const { page, context, errors } = await openPage(browser, { width, height }, source);
      if (scale !== 1) await page.addStyleTag({ content: 'html{font-size:' + 16 * scale + 'px!important}' });
      for (const name of screens) {
        await scene(page, name);
        const result = await inspect(page);
        if (!await lastActionIsReachable(page, result.page)) result.issues.push({ type: 'last-action-covered' });
        if (result.issues.length) {
          const output = path.resolve('test-results/ux-v2');
          await fs.mkdir(output, { recursive: true });
          await page.screenshot({ path: path.join(output, name + '-' + width + '-' + scale + '-failure.png') });
        }
        report.push({ width, height, scale, screen: name, ...result });
      }
      report.push({ width, height, scale, screen: 'javascript', issues: errors });
      await context.close();
    }
    const output = path.resolve('test-results/ux-v2');
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'geometry.json'), JSON.stringify(report, null, 2) + '\n');
    const failures = report.filter(item => item.issues.length);
    console.log(JSON.stringify({ states: report.length, failures }, null, 2));
    if (!process.env.FORGE_UX_COLLECT) assert.deepEqual(failures, []);
  } finally { await browser.close(); }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { inspect };
