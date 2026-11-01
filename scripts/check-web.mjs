import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const html = readFileSync(new URL('../app/src/main/assets/index.html', import.meta.url), 'utf8');
let count = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  const src=match[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  if(src){
    const root=fileURLToPath(new URL('../app/src/main/assets/',import.meta.url));
    const target=resolve(root,src);
    if(/^[a-z]+:/i.test(src)||relative(root,target).startsWith('..'))throw new Error('Script must be bundled locally: '+src);
    new Script(readFileSync(target,'utf8'),{filename:src});
    console.log('PASS: local script '+src);continue;
  }
  if (/\btype\s*=\s*["']application\/(?:ld\+)?json/i.test(match[1])) continue;
  new Script(match[2], { filename: `index.html:script-${++count}` });
}
if (!count) throw new Error('No JavaScript found');
console.log(`PASS: syntax of ${count} inline JavaScript blocks (not a browser runtime test)`);
