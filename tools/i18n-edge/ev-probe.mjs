import { openPage, bootRun, sleep, shotPath, scan, waitScreen } from './lib.mjs';
import { readFileSync } from 'node:fs';
const lang = process.argv[2] ?? 'en', vp = process.argv[3] ?? 'desk', hero = process.argv[4] ?? 'ninja';
const ids = JSON.parse(readFileSync('tools/i18n/source/event_ids.json', 'utf-8'));
console.log(ids.length, ids.slice(0, 8));
const c = await openPage(lang, vp, 'evp');
const { page } = c;
await bootRun(page, hero, 'evp');
await page.evaluate(() => { window.__app.run.players[0].fish = 500; });
const id = process.argv[5] ?? ids[0];
await page.evaluate((i) => window.__app.enterEvent(i), id);
await waitScreen(page, 'event', 20000);
await sleep(1500);
const opt = process.argv[6];
if (opt !== undefined) { await page.evaluate((k) => { const bs = [...document.querySelectorAll('#stage .scene-actions .btn')].filter((b) => !b.disabled); bs[k]?.click(); }, Number(opt)); await sleep(1200); }
await page.screenshot({ path: shotPath(`_evp_${id}_${opt ?? 'open'}_${lang}_${vp}_${hero}.png`) });
console.log(await page.evaluate(() => {
  const q = (s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return `${s}:${e.className} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; });
  return [...q('#stage .scene'), ...q('#stage .scene-box'), ...q('#stage .scene-actions'), ...q('#stage .scene-actions .btn'), ...q('#stage .scene-art'), ...q('#stage .event-note')].join('\n');
}));
console.log(JSON.stringify(await scan(page)).slice(0, 800));
await c.close();
