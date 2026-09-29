#!/usr/bin/env node
/*
 * 封面「介紹影片」按鈕實機檢查（2026-09-29）：本機建置版、獨立 Chrome 設定資料夾。
 * 點按鈕 → 影片真的在播（時間往前走、有畫面尺寸）→ 截圖 → 按「關閉」→ 疊層收掉、影片不再下載。
 *
 *   npm run build && node tools/trailer/check_title_trailer.mjs <截圖輸出夾>
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, openGame, realClick, waitScreen } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? 'tmp-trailer-check');
mkdirSync(OUT, { recursive: true });
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
let bad = 0;
for (const lang of ['zh', 'en', 'ja']) {
  const c = await newContext('trailer-check', lang);
  const page = c.page;
  await page.addInitScript((l) => { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.lang', l); } catch { /* */ } } }, lang);
  await openGame(page, server.url);
  await waitScreen(page, 'title');
  await sleep(800);
  await page.screenshot({ path: join(OUT, `title_${lang}.png`) });
  const label = await page.evaluate(() => [...document.querySelectorAll('.title-books .btn')].map((b) => b.textContent));
  const ok = await realClick(page, '.title-books .btn', { index: 0 });
  await sleep(2500);
  const s1 = await page.evaluate(() => { const v = document.querySelector('.trailer-overlay video'); return v ? { inert: document.querySelector('#screen')?.hasAttribute('inert') ?? false, t: v.currentTime, w: v.videoWidth, h: v.videoHeight, paused: v.paused, err: v.error?.code ?? null } : null; });
  await sleep(1500);
  const t2 = await page.evaluate(() => document.querySelector('.trailer-overlay video')?.currentTime ?? -1);
  await page.screenshot({ path: join(OUT, `playing_${lang}.png`) });
  await realClick(page, '.trailer-overlay .cine-skip');
  await sleep(300);
  const gone = await page.evaluate(() => !document.querySelector('.trailer-overlay') && !document.querySelector('#screen')?.hasAttribute('inert'));
  const pass = ok && s1 && s1.inert && s1.w === 1280 && s1.h === 720 && !s1.paused && t2 > s1.t && gone;
  if (!pass) bad++;
  console.log(lang, pass ? 'OK' : 'FAIL', JSON.stringify({ label, s1, t2, gone }));
  await c.close();
}
server.close?.();
console.log(bad ? `壞了 ${bad} 個` : '全部通過');
process.exit(bad ? 1 : 0);
