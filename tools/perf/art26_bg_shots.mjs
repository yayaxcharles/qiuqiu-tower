#!/usr/bin/env node
/*
 * 2026-10-06 背景線驗收截圖：每張新戰鬥背景有角色站著的戰鬥畫面、三關地圖（桌面 1280×720、手機 390×844），
 * 外加三條動效膠卷（霧、光束、燈，每 200 毫秒一格、兩秒）。本機 dist、無頭 Chrome（獨立設定資料夾），不連線上網址。
 *
 *   npm run build && node tools/perf/art26_bg_shots.mjs <輸出夾>
 * 輸出的是一張一張的圖；聯絡表用 tools/perf/art26_bg_sheet.py 拼。
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen, killOwnChrome } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? 'tmp-art26');
mkdirSync(OUT, { recursive: true });
await loadPlaywright();
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
// 樓層 → 新背景（screenbg.ts 的 tierBgKey：舊三張＋新三張，關內樓層取 6 的餘數，每關第 3～5 層是新的）
const FIGHTS = [[1, 3], [1, 4], [1, 5], [2, 18], [2, 19], [2, 20], [3, 33], [3, 34], [3, 35]];
const tag = 'art26bg';
const fight = async (page, act, floor) => {
  await page.evaluate(([a, f]) => { const app = window.__app; const r = app.run; r.act = a; r.floor = f; r.flags['tut:combat'] = true; app.startFight('wood_dummy'); }, [act, floor]);
  await waitScreen(page, 'combat', 60000);
  await page.waitForFunction(() => window.__app.cs?.phase === 'player' && !window.__app.cs.enemyActing, null, { timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.combat img')].every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
  await sleep(1800);
  return page.evaluate(() => getComputedStyle(document.querySelector('.battle-bg')).backgroundImage.match(/bg\/([a-z0-9_]+)-/)?.[1] ?? '?');
};
try {
  for (const [vp, w, h] of [['desk', 1280, 720], ['phone', 390, 844]]) {
    const c = await newContext(tag, vp, { viewport: { width: w, height: h } });
    const { page } = c;
    await bootRun(page, server.url, 'ninja', 'art26-shots');
    for (const act of [1, 2, 3]) {
      await page.evaluate((a) => { const r = window.__app.run; r.act = a; window.__app.show('map'); }, act);
      await waitScreen(page, 'map');
      await sleep(1500);
      await page.screenshot({ path: join(OUT, `${vp}_map_act${act}.png`) });
    }
    for (const [act, floor] of FIGHTS) {
      const key = await fight(page, act, floor);
      await page.screenshot({ path: join(OUT, `${vp}_combat_${key}.png`) });
      console.log(vp, act, floor, key);
    }
    if (vp === 'desk') {
      // 膠卷：霧與光束看第一關清晨練功房、燈看火把地牢；每 200 毫秒一格、十格
      for (const [name, floor] of [['fogbeam', 3], ['lamp', 4]]) {
        await fight(page, 1, floor);
        for (let i = 0; i < 10; i++) { await page.screenshot({ path: join(OUT, `film_${name}_${i}.png`) }); await sleep(200); }
      }
    }
    await c.close();
  }
} finally {
  killOwnChrome(tag);
  server.close?.();
}
process.exit(0);
