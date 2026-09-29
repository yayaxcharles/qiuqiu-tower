#!/usr/bin/env node
/*
 * 合成負擔（無頭、不跳視窗；2026-09-29）：關掉顯示晶片讓畫面合成全部落到處理器上，
 * 錄 4 秒 Chrome 追蹤，把「合成＋畫到螢幕」那段工作（viz 顯示合成器）的總耗時加起來。
 * 每秒花在合成的毫秒數越少越省力；弱顯示晶片上它就是卡不卡的主因。
 *
 *   npm run build && node tools/perf/composite.mjs [dist 資料夾] [封面,地圖,戰鬥]
 */
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, bootRun, waitScreen } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const DIST = resolve(process.argv[2] ?? 'dist');
const ONLY = (process.argv[3] ?? '封面,地圖,戰鬥').split(',');
const server = await startServer(DIST, 'qiuqiu-tower');
const chromium = await loadPlaywright();
const dir = 'C:/pwsw/perf-composite';
rmSync(dir, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(dir, {
  channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block',
  args: ['--mute-audio', '--disable-gpu', '--disable-gpu-compositing', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.addInitScript(() => { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.tutorial', 'done'); } catch (e) { /* */ } } });
const CAN_ACT = () => { const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false; const b = document.querySelector('.end-turn'); return !!b && !b.disabled && !document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay'); };

async function trace(label, secs = 4) {
  if (process.env.PERF_CSS) { await page.evaluate((css) => { const st = document.createElement('style'); st.id = '__perfcss'; st.textContent = css; document.head.append(st); }, process.env.PERF_CSS); await sleep(500); }
  const cdp = await page.context().newCDPSession(page);
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
  const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
  await cdp.send('Tracing.start', { categories: 'viz,cc,gpu,benchmark,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await sleep(secs * 1000);
  await cdp.send('Tracing.end');
  await done;
  await cdp.detach();
  const tot = new Map();
  for (const e of events) if (e.ph === 'X' && e.dur) tot.set(e.name, (tot.get(e.name) ?? 0) + e.dur);
  const pick = (re) => [...tot.entries()].filter(([n]) => re.test(n)).reduce((s, [, d]) => s + d, 0) / 1000 / secs;
  const draw = pick(/^Display::DrawAndSwap$/);
  const frames = events.filter((e) => e.name === 'Display::DrawAndSwap' && e.ph === 'X').length / secs;
  const top = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, d]) => `${n} ${(d / 1000 / secs).toFixed(0)}`).join('｜');
  console.log(`${label}：合成 ${draw.toFixed(0)} 毫秒／秒、${frames.toFixed(0)} 次／秒、每次 ${(draw / Math.max(frames, 1)).toFixed(1)} 毫秒｜${top}`);
}

if (ONLY.includes('封面')) { await page.goto(server.url + '?debug'); await waitScreen(page, 'title', 60000); await sleep(3000); await trace('封面'); }
if (ONLY.includes('地圖') || ONLY.includes('戰鬥')) { await bootRun(page, server.url, 'feifei', 'perf-comp'); }
if (ONLY.includes('地圖')) { await page.evaluate(() => window.__app.show('map')); await sleep(3000); await trace('地圖'); }
if (ONLY.includes('戰鬥')) {
  await page.evaluate(() => { const app = window.__app; const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; app.startFight('nekomata'); });
  await waitScreen(page, 'combat', 60000); await page.waitForFunction(CAN_ACT, null, { timeout: 60000 }); await sleep(3000); await page.mouse.move(900, 230);
  await trace('戰鬥');
}
await ctx.close();
server.close?.();
process.exit(0);
