#!/usr/bin/env node
/*
 * 畫面繪製負擔（2026-09-29 效能量測第二支）：手機慢多半不是程式算太多，而是「每秒要重畫多大的面積、疊了幾層」。
 * 在封面、地圖、戰鬥（閒著、出牌中）各停 5 秒，錄一段 Chrome 追蹤：
 *   重畫（Paint）幾次、共幾毫秒、重畫面積；排版（Layout）與樣式重算次數；
 *   合成層（每層都要占顯示記憶體）幾層、總面積；還在跑的動畫幾個（其中無限循環幾個）；套了濾鏡（filter，手機很貴）的元素幾個。
 *
 *   npm run build && node tools/perf/render.mjs <輸出夾>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, openGame, bootRun, waitScreen, realClick, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? 'tmp-perf');
mkdirSync(OUT, { recursive: true });
const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
const R = {};

const DOM_STATS = () => {
  const anims = document.getAnimations();
  const running = anims.filter((a) => a.playState === 'running');
  const infinite = running.filter((a) => a.effect?.getTiming?.().iterations === Infinity);
  const byName = {};
  for (const a of infinite) { const t = a.effect?.target; const k = (a.animationName || a.constructor.name) + ' @' + (t?.className?.baseVal ?? t?.className ?? '').toString().split(' ')[0]; byName[k] = (byName[k] ?? 0) + 1; }
  let filters = 0, bigFilters = [], willChange = 0, blur = 0;
  for (const el of document.querySelectorAll('#stage *')) {
    const st = getComputedStyle(el);
    if (st.filter !== 'none') { filters++; const r = el.getBoundingClientRect(); if (r.width * r.height > 40000) bigFilters.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(r.width)}×${Math.round(r.height)} ${st.filter.slice(0, 60)}`); }
    if (st.backdropFilter && st.backdropFilter !== 'none') blur++;
    if (st.willChange !== 'auto') willChange++;
  }
  return { nodes: document.querySelectorAll('*').length, imgs: document.images.length, running: running.length, infinite: infinite.length, infiniteBy: Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 12), filters, bigFilters: bigFilters.slice(0, 12), backdropBlur: blur, willChange };
};

async function traceScene(page, label, act = async () => { await sleep(5000); }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('LayerTree.enable');
  let layers = [];
  cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = e.layers; });
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
  const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,cc,viz', transferMode: 'ReportEvents' });
  const t0 = Date.now();
  await act();
  const secs = (Date.now() - t0) / 1000;
  await cdp.send('Tracing.end');
  await done;
  const sum = (name) => { const ev = events.filter((e) => e.name === name && e.ph === 'X'); return { n: ev.length, ms: Math.round(ev.reduce((s, e) => s + (e.dur ?? 0), 0) / 1000) }; };
  const paints = events.filter((e) => e.name === 'Paint' && e.ph === 'X');
  const area = paints.reduce((s, e) => { const c = e.args?.data?.clip; if (!c || c.length < 8) return s; const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; return s + (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); }, 0);
  const frames = events.filter((e) => e.name === 'DrawFrame' || e.name === 'Graphics.Pipeline').length;
  const dom = await page.evaluate(`(${DOM_STATS})()`);
  const drawn = layers.filter((l) => l.drawsContent);
  const layerArea = drawn.reduce((s, l) => s + l.width * l.height, 0);
  R[label] = {
    seconds: secs,
    paint: { ...sum('Paint'), perSecond: Math.round(paints.length / secs), screensPerSecond: Math.round(area / (1280 * 720) / secs * 10) / 10 },
    raster: sum('RasterTask'), layout: sum('Layout'), style: sum('UpdateLayoutTree'), script: sum('FunctionCall'), decode: sum('ImageDecodeTask'),
    gpuLayers: drawn.length, gpuLayerScreens: Math.round(layerArea / (1280 * 720) * 10) / 10, gpuMemMB: Math.round(layerArea * 4 / 1e6),
    frames, dom,
  };
  console.log(label, JSON.stringify(R[label]).slice(0, 700));
  await cdp.detach().catch(() => {});
}

const CAN_ACT = () => { const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false; const b = document.querySelector('.end-turn'); return !!b && !b.disabled && !document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay'); };

try {
  const c = await newContext('perf', 'render');
  const { page } = c;
  await openGame(page, server.url);
  await sleep(3000);
  await traceScene(page, '封面');
  await bootRun(page, server.url, 'feifei', 'perf-render');
  await page.evaluate(() => window.__app.show('map'));
  await sleep(2500);
  await traceScene(page, '地圖');
  await page.evaluate(() => {
    const app = window.__app; const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true;
    const orig = app.show.bind(app); let done = false;
    app.show = (nm, ...x) => { if (nm === 'combat' && app.cs && !done) { done = true; for (const e of app.cs.enemies) { e.maxHp *= 5; e.hp = e.maxHp; } } return orig(nm, ...x); };
    app.startFight('nekomata');
  });
  await waitScreen(page, 'combat', 60000);
  await page.waitForFunction(CAN_ACT, null, { timeout: 60000 });
  await sleep(2500);
  await page.mouse.move(900, 230);
  await traceScene(page, '戰鬥閒著');
  await traceScene(page, '戰鬥出牌', async () => {
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { window.__app.cs.players[0].energy = 9; });
      const pt = await page.evaluate(({ POINT_FN }) => { const f = eval(POINT_FN); const n = document.querySelector('.hand .card.clickable'); return n ? f(n) : null; }, { POINT_FN });
      if (pt) {
        await page.mouse.click(pt.x, pt.y); await sleep(150);
        if (await page.evaluate(() => !!document.querySelector('.target-catcher'))) {
          const tp = await page.evaluate(({ POINT_FN }) => { const f = eval(POINT_FN); const e = window.__app.cs.enemies.find((x) => !x.dead); const n = document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`); return n ? f(n) : null; }, { POINT_FN });
          if (tp) await page.mouse.click(tp.x, tp.y);
        }
      }
      await sleep(1700);
    }
  });
  await c.close();
} finally {
  writeFileSync(join(OUT, 'render.json'), JSON.stringify(R, null, 1));
  server.close?.();
}
process.exit(0);
