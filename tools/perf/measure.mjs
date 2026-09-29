#!/usr/bin/env node
/*
 * 效能量測（2026-09-29，使用者：「可以更有效能嗎？」第一步＝只量不改）。
 * 只開本機網址（沿用畫面比對閘門的獨立 Chrome 設定資料夾）；本機伺服器照 GitHub Pages 的做法把文字檔 gzip 壓縮再送。
 * 模擬中階手機：處理器放慢 4 倍、網路 1.6 Mbps／來回 150 毫秒（Lighthouse 手機預設）。
 *
 *   npm run build && node tools/perf/measure.mjs <輸出夾> [load,combat,memory]
 *
 * 量四件：
 *   load   第一次開遊戲到封面、封面圖到齊、背景下載停下來各要幾秒、下載多少（依種類分）；按「新的一局」到選角畫面圖到齊
 *   entry  從地圖進戰鬥到能出牌要多久（慢網路、快取是冷的）
 *   combat 戰鬥中出牌、魔物行動時的每一格間隔（掉幀）、長任務（卡住主執行緒超過 50 毫秒的工作），外加一份 CPU 剖析取最花時間的函式
 *   memory 連打 8 場，每場後強制回收記憶體再量：JS 記憶體、畫面節點數、事件監聽數
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { extname, join, normalize, resolve } from 'node:path';
import { loadPlaywright, newContext, openGame, bootRun, realClick, waitScreen, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? 'tmp-perf');
const ONLY = process.argv[3] ? process.argv[3].split(',') : ['load', 'entry', 'combat', 'memory'];
mkdirSync(OUT, { recursive: true });
const CPU = Number(process.env.PERF_CPU ?? 4);
const NET = { offline: false, latency: 150, downloadThroughput: (1.6e6) / 8, uploadThroughput: (750e3) / 8 };

// ── 本機伺服器：跟 GitHub Pages 一樣壓縮文字檔 ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const GZ = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest']);
function startServer(dist, site) {
  const prefix = `/${site}/`;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (!p.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
    p = p.slice(prefix.length) || 'index.html';
    const file = normalize(join(dist, p));
    if (!file.startsWith(normalize(dist)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const ext = extname(file).toLowerCase();
    const size = statSync(file).size;
    const h = { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'max-age=600' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const s = range[1] ? Number(range[1]) : 0; const e = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { ...h, 'content-range': `bytes ${s}-${e}/${size}`, 'content-length': e - s + 1 });
      createReadStream(file, { start: s, end: e }).pipe(res); return;
    }
    if (GZ.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
      res.writeHead(200, { ...h, 'content-encoding': 'gzip' });
      createReadStream(file).pipe(createGzip({ level: 6 })).pipe(res); return;
    }
    res.writeHead(200, { ...h, 'content-length': size });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}${prefix}`, close: () => server.close() })));
}

const server = await startServer(resolve('dist'), 'qiuqiu-tower');
await loadPlaywright();
const R = { cpu: CPU, net: NET };
const kb = (b) => Math.round(b / 1024);

/** 網路記帳：每個請求的種類、大小、開始與結束時間 */
function netLog(cdp) {
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t0: e.timestamp, type: e.type }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.t1 = e.timestamp; } });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.failed = true; r.t1 = e.timestamp; } });
  return {
    reqs,
    pending: () => [...reqs.values()].filter((r) => r.t1 === undefined).length,
    summary(fromTs = 0, toTs = Infinity) {
      const by = {};
      let n = 0, bytes = 0;
      for (const r of reqs.values()) {
        if (r.t0 < fromTs || r.t0 > toTs) continue;
        const ext = (r.url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? 'html').toLowerCase();
        by[ext] ??= { n: 0, kb: 0 };
        by[ext].n++; by[ext].kb += kb(r.bytes ?? 0);
        n++; bytes += r.bytes ?? 0;
      }
      return { requests: n, kb: kb(bytes), by };
    },
  };
}
async function throttle(cdp, net = true) {
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  if (net) await cdp.send('Network.emulateNetworkConditions', NET);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
}
async function netIdle(page, log, quietMs = 3000, maxMs = 180000) {
  const t0 = Date.now(); let quietSince = Date.now(); let lastN = log.reqs.size;
  while (Date.now() - t0 < maxMs) {
    await sleep(250);
    if (log.pending() > 0 || log.reqs.size !== lastN) { quietSince = Date.now(); lastN = log.reqs.size; }
    else if (Date.now() - quietSince >= quietMs) return (quietSince - t0) / 1000;
  }
  return null;
}
const now = (page) => page.evaluate(() => performance.now() / 1000);
const imgsDone = (sel) => `(() => { const a = [...document.querySelectorAll(${JSON.stringify(sel)})]; return a.length > 0 && a.every((i) => i.complete && i.naturalWidth > 0); })()`;

const MELEE = 'sanjo';
const CAN_ACT = () => {
  const cs = window.__app && window.__app.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false;
  const b = document.querySelector('.end-turn'); if (!b || b.disabled || b.classList.contains('disabled')) return false;
  if (document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay, .slide-overlay')) return false;
  if (document.querySelector('.hand .card.flying')) return false;
  return true;
};
const waitCanAct = (page, t = 60000) => page.waitForFunction(CAN_ACT, null, { timeout: t, polling: 60 });
async function playFirst(page, pred = 'attack') {
  const pt = await page.evaluate(({ POINT_FN, pred }) => {
    const f = eval(POINT_FN);
    const cards = [...document.querySelectorAll('.hand .card.clickable')];
    const n = cards.find((c) => pred !== 'attack' || /攻/.test(c.className + c.textContent)) ?? cards[0];
    return n ? f(n) : null;
  }, { POINT_FN, pred });
  if (!pt) return false;
  await page.mouse.move(pt.x, pt.y, { steps: 4 });
  await sleep(120);
  await page.mouse.click(pt.x, pt.y);
  await sleep(120);
  if (await page.evaluate(() => !!document.querySelector('.target-catcher'))) {
    const tp = await page.evaluate(({ POINT_FN }) => {
      const f = eval(POINT_FN); const e = window.__app.cs.enemies.find((x) => !x.dead && x.hp > 0);
      if (!e) return null;
      const n = document.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite-box`) || document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`);
      return n ? f(n) : null;
    }, { POINT_FN });
    if (tp) { await page.mouse.move(tp.x, tp.y, { steps: 6 }); await sleep(80); await page.mouse.click(tp.x, tp.y); }
  }
  await page.mouse.move(900, 230, { steps: 3 });
  return true;
}
/** 進一場戰鬥（手牌固定成近戰牌、飯糰 9、魔物血加厚以免太快打完） */
async function enterFight(page, enc, { hpMul = 4, cards = [MELEE, MELEE, MELEE, MELEE, MELEE] } = {}) {
  await page.evaluate(({ cards, enc, hpMul }) => {
    const app = window.__app; const orig = app.__origShow ?? app.show.bind(app); app.__origShow = orig; let done = false;
    app.show = (nm, ...r) => {
      if (nm === 'combat' && app.cs && !done) {
        done = true;
        const p = app.cs.players[0]; let u = 97501 + Math.floor(Math.random() * 1e5);
        p.hand.splice(0, p.hand.length, ...cards.map((id) => ({ uid: u++, cardId: id, upgraded: false })));
        p.drawPile.splice(0, p.drawPile.length, ...cards.concat(cards).map((id) => ({ uid: u++, cardId: id, upgraded: false })));
        p.discardPile.splice(0, p.discardPile.length);
        p.energy = 9;
        for (const e of app.cs.enemies) { e.maxHp *= hpMul; e.hp = e.maxHp; }
      }
      return orig(nm, ...r);
    };
    const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true;
    app.startFight(enc);
  }, { cards, enc, hpMul });
}

// 頁面裡的每格計時器＋長任務記錄
const FRAME_PROBE = `(() => {
  window.__ft = []; window.__lt = []; let last = performance.now(); window.__ftOn = true;
  const loop = (t) => { if (!window.__ftOn) return; window.__ft.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false }); } catch (e) {}
})()`;
function frameStats(ft, lt) {
  const f = ft.slice(2).sort((a, b) => a - b);
  const q = (p) => Math.round(f[Math.min(f.length - 1, Math.floor(f.length * p))]);
  const total = ft.slice(2).reduce((s, x) => s + x, 0);
  return {
    frames: f.length, seconds: Math.round(total / 100) / 10, avgFps: Math.round((f.length / total) * 1000 * 10) / 10,
    p50ms: q(0.5), p95ms: q(0.95), p99ms: q(0.99), worstMs: Math.round(f.at(-1) ?? 0),
    over50ms: f.filter((x) => x > 50).length, over100ms: f.filter((x) => x > 100).length,
    longTasks: lt.length, longTaskMs: lt.reduce((s, x) => s + x, 0), longestTask: Math.max(0, ...lt),
  };
}

try {
  // ── 一、第一次開遊戲 ──
  if (ONLY.includes('load')) {
    const c = await newContext('perf', 'load');
    const { page } = c;
    const cdp = await page.context().newCDPSession(page);
    const log = netLog(cdp);
    await throttle(cdp);
    const t0 = Date.now();
    await page.goto(server.url + '?debug', { waitUntil: 'commit' });
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen === 'title', null, { timeout: 180000, polling: 50 });
    const title = (Date.now() - t0) / 1000;
    await page.waitForFunction(imgsDone('.title-cat'), null, { timeout: 180000, polling: 100 });
    const titleArt = (Date.now() - t0) / 1000;
    const titleTs = [...log.reqs.values()].reduce((m, r) => Math.max(m, r.t0), 0);
    const beforeTitle = log.summary(0, titleTs);
    const idle = await netIdle(page, log);
    R.load = { titleSeconds: title, titleArtSeconds: titleArt, networkQuietSeconds: idle === null ? '>180' : Math.round(((Date.now() - t0) / 1000 - 3) * 10) / 10,
      untilTitleArt: beforeTitle, total: log.summary() };
    // 停在封面、網路安靜為止抓過的每一個檔（相對第一個請求的秒數），給前後對照「背景到底抓了什麼」用（2026-09-29 分批載入）
    const firstTs = [...log.reqs.values()][0]?.t0 ?? 0;
    R.load.untilQuiet = [...log.reqs.values()].map((r) => ({ at: Math.round((r.t0 - firstTs) * 100) / 100, end: r.t1 === undefined ? null : Math.round((r.t1 - firstTs) * 100) / 100, kb: kb(r.bytes ?? 0), url: r.url.split('/qiuqiu-tower/')[1] ?? r.url }));
    // 按「新的一局」到選角畫面的圖到齊
    const t1 = Date.now();
    await realClick(page, 'button.primary', { index: 0 });
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen === 'heroselect', null, { timeout: 60000, polling: 50 });
    const hsScreen = (Date.now() - t1) / 1000;
    await page.waitForFunction(imgsDone('.hero-card img, .heroselect img'), null, { timeout: 120000, polling: 100 }).catch(() => {});
    R.load.heroSelect = { screenSeconds: hsScreen, artSeconds: (Date.now() - t1) / 1000 };
    // 選球球、出發 → 序章第一張圖出來
    const t2 = Date.now();
    await realClick(page, '.hero-card[data-hero="ninja"]');
    await sleep(300);
    const went = await realClick(page, 'button.primary', { index: 0 });
    let slide = null;
    if (went) {
      slide = await page.waitForFunction(() => { const i = [...document.querySelectorAll('.slide-overlay img')].find((x) => x.complete && x.naturalWidth > 0 && Number(getComputedStyle(x).opacity) > 0.5); return !!i; }, null, { timeout: 120000, polling: 100 })
        .then(() => (Date.now() - t2) / 1000).catch(() => 'timeout');
    }
    R.load.prologueFirstSlideSeconds = slide;
    R.load.jsFiles = [...log.reqs.values()].filter((r) => /\.js$/.test(r.url)).map((r) => ({ file: r.url.split('/').pop(), kb: kb(r.bytes ?? 0), at: Math.round((r.t0 - [...log.reqs.values()][0].t0) * 10) / 10 }));
    R.load.biggest = [...log.reqs.values()].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)).slice(0, 15).map((r) => ({ file: r.url.split('/').slice(-2).join('/'), kb: kb(r.bytes ?? 0) }));
    console.log('load', JSON.stringify({ title, titleArt, heroSelect: R.load.heroSelect, slide, quiet: R.load.networkQuietSeconds, beforeTitleKB: beforeTitle.kb, totalKB: R.load.total.kb }));
    await c.close();
  }

  // ── 一之二、實際玩法：開遊戲後過 N 秒（背景下載照跑）才進第一場戰鬥，慢網路全程開著 ──
  if (ONLY.includes('real')) {
    R.real = {};
    for (const wait of (process.env.PERF_WAITS ?? '6,20,45').split(',').map(Number)) {
      const c = await newContext('perf', 'real' + wait);
      const { page } = c;
      const cdp = await page.context().newCDPSession(page);
      const log = netLog(cdp);
      await throttle(cdp);
      await page.goto(server.url + '?debug', { waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen === 'title' && !!window.__app, null, { timeout: 180000, polling: 50 });
      await sleep(wait * 1000);
      await page.evaluate(() => window.__app.newRun('perf-real', 1, 'ninja'));
      await sleep(200);
      const run = await page.evaluate(() => JSON.stringify(window.__app.run));
      await page.reload({ waitUntil: 'commit' });   // 重新整理（檔案快取還在）跳過序章，跟閘門的 bootRun 一樣
      await page.waitForFunction(() => !!window.__app && document.querySelector('#stage')?.dataset.screen === 'title', null, { timeout: 180000, polling: 50 });
      await page.evaluate((r) => { const x = JSON.parse(r); x.flags.prologue = true; x.flags['tut:combat'] = true; for (const p of x.players) p.bless = undefined; window.__app.continueRun(x); }, run);
      await page.waitForFunction(() => ['map', 'blessing'].includes(document.querySelector('#stage')?.dataset.screen), null, { timeout: 120000 });
      await sleep(Number(process.env.PERF_MAPWAIT ?? 1.5) * 1000);   // 地圖上停多久才點（序章＋祝福大約 20 秒以上）
      const pt0 = await page.evaluate(() => performance.now());
      const enc = await page.evaluate(() => {
        const r = window.__app.run; const first = r.map.nodes.filter((n) => n.type === '戰鬥' || n.type === 'combat' || /fight|戰/.test(n.type));
        const start = r.map.nodes.find((n) => !r.map.nodes.some((p) => p.next.includes(n.id)) && (first.includes(n)));
        const n = start ?? first[0];
        if (!n) return null;
        window.__app.enterNode(n.id); return n.type;
      });
      const t0 = Date.now();
      await waitScreen(page, 'combat', 120000).catch(() => {});
      const screen = (Date.now() - t0) / 1000;
      await page.waitForFunction(imgsDone('.unit img'), null, { timeout: 120000, polling: 100 }).catch(() => {});
      const art = (Date.now() - t0) / 1000;
      await waitCanAct(page, 120000).catch(() => {});
      const res = await page.evaluate((t) => performance.getEntriesByType('resource').filter((e) => e.startTime >= t - 5).map((e) => `${Math.round(e.startTime - t)}→${Math.round(e.responseEnd - t)}ms ${Math.round(e.transferSize / 1024)}KB ${e.name.split('/').slice(-2).join('/')}`), pt0);
      R.real['files' + wait] = res;
      R.real['wait' + wait] = { nodeType: enc, encounter: await page.evaluate(() => window.__app.cs?.enemies.map((e) => e.defId ?? e.id).join('+')), screenSeconds: screen, unitArtSeconds: art, canActSeconds: (Date.now() - t0) / 1000,
        // 這一頁量到的網速判斷（`main.ts` 在 `?debug` 時寫上去；2026-09-29 之前的版本沒有，會是 null）
        netSpeed: await page.evaluate(() => document.documentElement.dataset.netSpeed ?? null) };
      console.log('real', wait, JSON.stringify(R.real['wait' + wait]));
      await c.close();
    }
  }

  // ── 二、從地圖進戰鬥（冷快取、慢網路） ──
  if (ONLY.includes('entry')) {
    R.entry = {};
    for (const [hero, enc] of [['ninja', 'cucumber_yarn'], ['fengfeng', 'nekomata']]) {
      const c = await newContext('perf', 'entry-' + hero);
      const { page } = c;
      await bootRun(page, server.url, hero, 'perf-' + hero);
      const cdp = await page.context().newCDPSession(page);
      const log = netLog(cdp);
      await cdp.send('Network.clearBrowserCache').catch(() => {});
      await throttle(cdp);
      const t0 = Date.now();
      await enterFight(page, enc, { hpMul: 1 });
      await waitScreen(page, 'combat', 120000);
      const screen = (Date.now() - t0) / 1000;
      await page.waitForFunction(imgsDone('.unit img'), null, { timeout: 120000, polling: 100 }).catch(() => {});
      const art = (Date.now() - t0) / 1000;
      await waitCanAct(page, 120000).catch(() => {});
      const act = (Date.now() - t0) / 1000;
      R.entry[hero + '_' + enc] = { screenSeconds: screen, unitArtSeconds: art, canActSeconds: act, downloaded: log.summary(),
        files: [...log.reqs.values()].map((r) => `${kb(r.bytes ?? 0)}KB ${Math.round((r.t0 - [...log.reqs.values()][0].t0) * 10) / 10}s ${r.url.split('/').slice(-2).join('/')}`) };
      console.log('entry', hero, enc, JSON.stringify(R.entry[hero + '_' + enc]).slice(0, 300));
      await c.close();
    }
  }

  // ── 三、戰鬥中的順暢度 ──
  if (ONLY.includes('combat')) {
    R.combat = {};
    for (const [hero, enc, cards] of [
      ['ninja', 'cucumber_yarn', ['sanjo', 'sanjo', 'maoqiudan', 'sanjo', 'tanding']],
      ['feifei', 'nekomata', ['feifei_feizhen', 'maoqiudan', 'feifei_feizhen', 'feifei_tuikai', 'feifei_feizhen']],
    ]) {
      const c = await newContext('perf', 'combat-' + hero);
      const { page } = c;
      await bootRun(page, server.url, hero, 'perf-c-' + hero);
      await enterFight(page, enc, { cards });
      await waitScreen(page, 'combat', 60000);
      await waitCanAct(page);
      await page.waitForFunction(imgsDone('.unit img'), null, { timeout: 30000 }).catch(() => {});
      await sleep(1500);
      const cdp = await page.context().newCDPSession(page);
      await throttle(cdp, false);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
      await page.evaluate(FRAME_PROBE);
      await cdp.send('Profiler.start');
      for (let turn = 0; turn < 2; turn++) {
        for (let i = 0; i < 4; i++) {
          await page.evaluate(() => { window.__app.cs.players[0].energy = 9; });
          await playFirst(page);
          await sleep(900);
          await waitCanAct(page).catch(() => {});
        }
        await realClick(page, '.end-turn');
        await sleep(1500);
        await waitCanAct(page, 90000).catch(() => {});
        await sleep(400);
      }
      const { profile } = await cdp.send('Profiler.stop');
      const { ft, lt } = await page.evaluate(() => { window.__ftOn = false; return { ft: window.__ft, lt: window.__lt }; });
      R.combat[hero] = frameStats(ft, lt);
      writeFileSync(join(OUT, `combat_${hero}.cpuprofile`), JSON.stringify(profile));
      // 最花時間的函式（自身時間）
      const self = new Map();
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const dt = profile.timeDeltas; const total = profile.endTime - profile.startTime;
      profile.samples.forEach((id, i) => { const n = byId.get(id); const cf = n.callFrame; const key = `${cf.functionName || '(匿名)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`; self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0)); });
      R.combat[hero].topSelf = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `${(us / 1000).toFixed(0)}ms ${(us / total * 100).toFixed(1)}% ${k}`);
      const m = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
      R.combat[hero].metrics = Object.fromEntries(m.metrics.filter((x) => /LayoutCount|RecalcStyleCount|LayoutDuration|RecalcStyleDuration|ScriptDuration|TaskDuration|Nodes|JSEventListeners|JSHeapUsedSize/.test(x.name)).map((x) => [x.name, Math.round(x.value * 1000) / 1000]));
      console.log('combat', hero, JSON.stringify({ ...R.combat[hero], topSelf: R.combat[hero].topSelf.slice(0, 6) }));
      await c.close();
    }
  }

  // ── 四、連打 8 場的記憶體 ──
  if (ONLY.includes('memory')) {
    const c = await newContext('perf', 'memory');
    const { page } = c;
    await bootRun(page, server.url, 'ninja', 'perf-mem');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const snap = async (label) => {
      await cdp.send('HeapProfiler.collectGarbage');
      await sleep(300);
      const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      return { label, heapMB: Math.round(m.JSHeapUsedSize / 1e5) / 10, nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, frames: m.Frames };
    };
    R.memory = [await snap('開局')];
    const encs = ['cucumber_yarn', 'nekomata', 'cucumber_yarn', 'nekomata', 'cucumber_yarn', 'nekomata', 'cucumber_yarn', 'nekomata'];
    for (let i = 0; i < encs.length; i++) {
      await enterFight(page, encs[i], { hpMul: 1 });
      await waitScreen(page, 'combat', 60000);
      await waitCanAct(page);
      await page.evaluate(() => { for (const e of window.__app.cs.enemies) e.hp = 1; });
      for (let k = 0; k < 8; k++) {
        const alive = await page.evaluate(() => window.__app.cs && window.__app.cs.enemies.some((e) => !e.dead && e.hp > 0) && document.querySelector('#stage')?.dataset.screen === 'combat');
        if (!alive) break;
        await page.evaluate(() => { window.__app.cs.players[0].energy = 9; });
        await playFirst(page);
        await sleep(900);
        await waitCanAct(page, 8000).catch(() => {});
      }
      await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen !== 'combat', null, { timeout: 30000 }).catch(() => {});
      await sleep(1500);
      await page.evaluate(() => { const a = window.__app; document.querySelectorAll('#overlay > *').forEach((n) => n.remove()); a.show('map'); });
      await sleep(800);
      R.memory.push(await snap(`第 ${i + 1} 場後（${await page.evaluate(() => document.querySelector('#stage')?.dataset.screen)}）`));
      console.log('memory', JSON.stringify(R.memory.at(-1)));
    }
    await c.close();
  }
} finally {
  writeFileSync(join(OUT, 'perf.json'), JSON.stringify(R, null, 1));
  server.close();
}
console.log('寫好了', join(OUT, 'perf.json'));
process.exit(0);
