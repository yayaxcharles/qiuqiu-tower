import { openPage, bootRun, sleep, shotPath, waitScreen } from './lib.mjs';
const lang = process.argv[2] ?? 'en', vp = process.argv[3] ?? 'desk', hero = process.argv[4] ?? 'fengfeng', id = process.argv[5] ?? 'cell_bandit', opt = process.argv[6] ?? '0';
const c = await openPage(lang, vp, 'lootp');
const { page } = c;
await bootRun(page, hero, 'lootp');
await page.evaluate(() => { window.__app.run.players[0].fish = 500; });
await page.evaluate((i) => window.__app.enterEvent(i), id);
await waitScreen(page, 'event', 20000);
await sleep(1200);
await page.evaluate((k) => { const bs = [...document.querySelectorAll('#stage .scene-actions .btn')].filter((b) => !b.disabled); bs[k]?.click(); }, Number(opt));
await sleep(1500);
console.log(await page.evaluate(() => {
  const st = document.querySelector('#stage').getBoundingClientRect(); const k = st.width / 1280;
  const b = document.querySelector('#stage .scene-art .showcase.icons');
  const arts = [...document.querySelectorAll('#stage .scene-art')].map((a) => a.outerHTML.slice(0, 400));
  return JSON.stringify({ found: !!b, cls: b?.className, top: b ? (b.getBoundingClientRect().top - st.top) / k : null, arts });
}));
await page.screenshot({ path: shotPath(`_lootp_${id}_${opt}_${lang}_${vp}_${hero}.png`) });
await c.close();
