#!/usr/bin/env node
/*
 * 環境光新舊對照（2026-09-29）：舊版（dist_old，CSS 五層）與新版（dist，一張畫布）同一場戰鬥、同一張地圖、封面各截一張，
 * 拼成左右對照圖給人看。無頭 Chrome，不在桌面上跳視窗。
 *
 *   node tools/perf/ambient_compare.mjs <輸出夾>
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? 'tmp-perf');
mkdirSync(OUT, { recursive: true });
await loadPlaywright();
const CAN_ACT = () => { const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false; const b = document.querySelector('.end-turn'); return !!b && !b.disabled && !document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay'); };
for (const [tag, dir] of [['舊', 'dist_old'], ['新', 'dist']]) {
  const server = await startServer(resolve(dir), 'qiuqiu-tower');
  const c = await newContext('perf', 'amb-' + (tag === '舊' ? 'old' : 'new'));
  const { page } = c;
  await bootRun(page, server.url, 'ninja', 'perf-amb');
  await page.evaluate(() => { const app = window.__app; const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; app.startFight('cucumber_yarn'); });
  await waitScreen(page, 'combat', 60000);
  await page.waitForFunction(CAN_ACT, null, { timeout: 60000 });
  await page.mouse.move(640, 60);
  await sleep(2500);
  for (let i = 0; i < 3; i++) { await page.screenshot({ path: join(OUT, `combat_${tag}_${i}.png`) }); await sleep(1300); }
  await page.evaluate(() => window.__app.show('map'));
  await sleep(2500);
  await page.screenshot({ path: join(OUT, `map_${tag}.png`) });
  await c.close();
  server.close?.();
}
process.exit(0);
