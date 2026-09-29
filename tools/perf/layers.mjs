#!/usr/bin/env node
/*
 * 列出戰鬥畫面（與封面、地圖）的合成層：每一層多大、為什麼被拆成獨立一層（2026-09-29 弱顯示晶片調查）。
 * 弱顯示晶片每畫一格都要把這些層疊一次，層數與面積就是負擔。
 *
 *   npm run build && node tools/perf/layers.mjs
 */
import { resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
const c = await newContext('perf', 'layers');
const { page } = c;
const CAN_ACT = () => { const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false; const b = document.querySelector('.end-turn'); return !!b && !b.disabled && !document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay'); };

async function dump(label) {
  const cdp = await page.context().newCDPSession(page);
  let layers = [];
  cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = e.layers; });
  await cdp.send('DOM.enable');
  await cdp.send('LayerTree.enable');
  await sleep(1200);
  const rows = [];
  for (const l of layers.filter((x) => x.drawsContent)) {
    let why = [];
    try { why = (await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId })).compositingReasonIds ?? []; } catch { /* */ }
    let who = '';
    if (l.backendNodeId) {
      try {
        const { node } = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId });
        const attrs = node.attributes ?? [];
        const cls = attrs[attrs.indexOf('class') + 1] ?? '';
        who = `${node.localName || node.nodeName}${cls && attrs.includes('class') ? '.' + cls.split(' ').slice(0, 3).join('.') : ''}`;
      } catch { /* */ }
    }
    rows.push({ area: l.width * l.height, s: `${String(l.width).padStart(5)}×${String(l.height).padEnd(5)} ${who.padEnd(46)} ${why.slice(0, 3).join(',')}` });
  }
  rows.sort((a, b) => b.area - a.area);
  const tot = rows.reduce((s, r) => s + r.area, 0);
  console.log(`\n== ${label}：${rows.length} 層、合計 ${(tot / (1280 * 720)).toFixed(1)} 個畫面大`);
  for (const r of rows.slice(0, 30)) console.log('  ' + r.s);
  await cdp.detach();
}

await page.goto(server.url + '?debug');
await waitScreen(page, 'title', 60000);
await sleep(2500);
await dump('封面');
await bootRun(page, server.url, 'feifei', 'perf-layers');
await page.evaluate(() => window.__app.show('map'));
await sleep(2500);
await dump('地圖');
await page.evaluate(() => { const app = window.__app; const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; app.startFight('nekomata'); });
await waitScreen(page, 'combat', 60000);
await page.waitForFunction(CAN_ACT, null, { timeout: 60000 });
await sleep(2500);
await page.mouse.move(900, 230);
await dump('戰鬥');
await c.close();
server.close?.();
process.exit(0);
