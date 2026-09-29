#!/usr/bin/env node
/*
 * 弱顯示晶片＋高解析螢幕（2026-09-29：使用者朋友的 MacBook i5 會卡）。
 * 無頭 Chrome 沒有顯示晶片，畫面是處理器一格一格畫（軟體繪製）；不鎖每秒 60 格，所以「每秒畫得出幾格」就是畫面負擔的量尺。
 * MacBook 螢幕是 2 倍密度（1440×900 的畫面實際要畫 2880×1800 個點），這裡比較 1 倍與 2 倍，
 * 再逐一關掉懷疑的效果（全畫面濾鏡、無限循環動畫、陰影濾鏡），看哪一個拿掉之後每秒格數跳最多。
 *
 *   npm run build && node tools/perf/gpu.mjs <輸出夾>
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, bootRun, waitScreen } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? 'tmp-perf');
mkdirSync(OUT, { recursive: true });
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
const chromium = await loadPlaywright();
const R = {};

const VARIANTS = {
  原樣: '',
  拿掉全畫面濾鏡: '.battle-bg, .screen-bg, .map-bg { filter: none !important; }',
  停掉無限循環動畫: '*, *::before, *::after { animation-play-state: paused !important; }',
  拿掉所有濾鏡: '*, *::before, *::after { filter: none !important; }',
  全部拿掉: '*, *::before, *::after { filter: none !important; animation-play-state: paused !important; box-shadow: none !important; text-shadow: none !important; }',
};
// 逐一找兇手（PERF_BISECT=1）：每次只停一種無限循環動畫
const P = 'animation-play-state: paused !important;';
const BISECT = {
  原樣: '',
  停浮塵: `.combat .motes, .combat .motes * , .combat .motes::before, .combat .motes::after { ${P} }`,
  停暖光層: `.battle-bg::after { ${P} }`,
  停戰鬥底圖亮度: `.battle-bg { ${P} }`,
  停手牌晃動: `.combat .hand .card { ${P} }`,
  停角色呼吸: `.combat .sprite, .combat .sprite * { ${P} }`,
  停花瓣: `.leaf, .sakura { ${P} }`,
  停封面貓上下: `.title-cat { ${P} }`,
  停封面天色: `.screen-bg { ${P} }`,
  拿掉封面貓陰影: `.title-cat { filter: none !important; }`,
  只留浮塵: `*, *::before, *::after { ${P} } .combat .motes, .combat .motes * , .combat .motes::before, .combat .motes::after { animation-play-state: running !important; }`,
  只留暖光層: `*, *::before, *::after { ${P} } .battle-bg::after { animation-play-state: running !important; }`,
  只留底圖亮度: `*, *::before, *::after { ${P} } .battle-bg { animation-play-state: running !important; }`,
  只留手牌晃動: `*, *::before, *::after { ${P} } .combat .hand .card { animation-play-state: running !important; }`,
  只留角色呼吸: `*, *::before, *::after { ${P} } .combat .sprite { animation-play-state: running !important; }`,
};

async function fps(page, ms = 4000) {
  return page.evaluate((ms) => new Promise((ok) => {
    const ft = []; let last = performance.now(); const end = last + ms;
    const loop = (t) => { ft.push(t - last); last = t; if (t < end) requestAnimationFrame(loop); else { const f = ft.slice(3); const tot = f.reduce((s, x) => s + x, 0); f.sort((a, b) => a - b); ok({ fps: Math.round(f.length / tot * 1000), p95: Math.round(f[Math.floor(f.length * 0.95)]) }); } };
    requestAnimationFrame(loop);
  }), ms);
}
const CAN_ACT = () => { const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false; const b = document.querySelector('.end-turn'); return !!b && !b.disabled && !document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay'); };

try {
  for (const dpr of (process.env.PERF_DPR ?? '1,2').split(',').map(Number)) {
    const dir = `C:/pwsw/perf-gpu-${dpr}`;
    rmSync(dir, { recursive: true, force: true });
    const ctx = await chromium.launchPersistentContext(dir, {
      channel: 'chrome', headless: process.env.PERF_HEADED !== '1', viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, serviceWorkers: 'block',
      args: ['--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        // 有畫面的 Chrome＋關掉顯示晶片＝合成與繪製全部落到處理器上、照螢幕每秒 60 格節奏跑：掉幾格就是負擔（當作弱內顯的代理量尺）
        // 預設無頭（不在使用者桌面上跳視窗，使用者 09-29 要求）；PERF_SOFT=1＝關掉顯示晶片、照每秒 60 格節奏，當弱內顯的代理量尺
        ...(process.env.PERF_SOFT === '1' || process.env.PERF_HEADED === '1' ? ['--disable-gpu', '--disable-gpu-compositing', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'] : ['--disable-gpu-vsync', '--disable-frame-rate-limit'])],
    });
    const page = ctx.pages()[0] ?? await ctx.newPage();
    await page.addInitScript(() => { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.tutorial', 'done'); } catch (e) { /* */ } } });
    const scenes = {
      封面: async () => { await page.goto(server.url + '?debug'); await waitScreen(page, 'title', 60000); await sleep(3000); },
      地圖: async () => { await bootRun(page, server.url, 'feifei', 'perf-gpu'); await page.evaluate(() => window.__app.show('map')); await sleep(3000); },
      戰鬥: async () => {
        await page.evaluate(() => { const app = window.__app; const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; app.startFight('nekomata'); });
        await waitScreen(page, 'combat', 60000); await page.waitForFunction(CAN_ACT, null, { timeout: 60000 }); await sleep(3000); await page.mouse.move(900, 230);
      },
    };
    for (const [scene, go] of Object.entries(scenes)) {
      await go();
      if (process.env.PERF_SCENES && !process.env.PERF_SCENES.split(',').includes(scene)) continue;
      for (const [name, css] of Object.entries(process.env.PERF_BISECT === '1' ? BISECT : VARIANTS)) {
        await page.evaluate((css) => { let s = document.getElementById('__perfcss'); if (!s) { s = document.createElement('style'); s.id = '__perfcss'; document.head.append(s); } s.textContent = css; }, css);
        await page.bringToFront();
        await sleep(600);
        const r = await fps(page);
        (R[`${dpr}倍`] ??= {})[scene] ??= {};
        R[`${dpr}倍`][scene][name] = r;
        console.log(`${dpr}倍 ${scene} ${name}: 每秒 ${r.fps} 格（最慢 5% 一格 ${r.p95} 毫秒）`);
      }
      await page.evaluate(() => document.getElementById('__perfcss')?.remove());
    }
    await ctx.close();
  }
} finally {
  writeFileSync(join(OUT, 'gpu.json'), JSON.stringify(R, null, 1));
  server.close?.();
}
process.exit(0);
