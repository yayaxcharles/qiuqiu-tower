#!/usr/bin/env node
/*
 * 慢網路下「沒聲音、卡頓、地圖黑」的量測（2026-09-30，只量不改）。
 *
 *   npx vite build && npx vite build --config tools/perf/vite.instr.config.ts     # 先打兩份包
 *   node tools/perf/audio_trace.mjs <輸出夾> <標籤> [設定...]
 *
 * 環境變數：
 *   PERF_DIST   dist-instr（預設，帶記錄）或 dist（乾淨版，只量時間）
 *   PERF_HERO   ninja（預設）或 feifei
 *   PERF_MBPS / PERF_RTT / PERF_CPU  網路與處理器放慢（預設 1.6 Mbps／150 毫秒／4 倍；PERF_MBPS=0 不限速）
 *   PERF_WARM=1 同一個設定資料夾、同一個瀏覽器，跑完冷的再開新分頁跑一次熱的（只有 HTTP 快取；服務工作者被擋，正式站另有圖片離線快取）
 *   PERF_TITLE_WAIT / PERF_SELECT_WAIT / PERF_MAP_WAIT  每一步停多久（毫秒，模擬看畫面的時間；預設 3000／2500／3000）
 *   PERF_FIGHTS 打幾場（預設 2）
 *
 * 全程用**真的滑鼠點擊**（不走 __app.newRun 之類），這樣音訊環境才會在第一次點擊時真的建立。
 * 只開本機網址；瀏覽器用畫面比對閘門那一套（獨立設定資料夾）。
 */
import { createServer } from 'node:http';
import { createSecureServer } from 'node:http2';
import { readFileSync } from 'node:fs';
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { extname, join, normalize, resolve } from 'node:path';
import { loadPlaywright, realClick, POINT_FN, PROFILE_ROOT, assertLocal, killOwnChrome } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const OUT = resolve(process.argv[2] ?? 'tmp-audio');
const LABEL = process.argv[3] ?? 'run';
mkdirSync(OUT, { recursive: true });
const DIST = resolve(process.env.PERF_DIST ?? 'dist-instr');
const HERO = process.env.PERF_HERO ?? 'ninja';
const MBPS = Number(process.env.PERF_MBPS ?? 1.6);
const RTT = Number(process.env.PERF_RTT ?? 150);
const CPU = Number(process.env.PERF_CPU ?? 4);
const WARM = process.env.PERF_WARM === '1';
const T_TITLE = Number(process.env.PERF_TITLE_WAIT ?? 3000);
const T_SELECT = Number(process.env.PERF_SELECT_WAIT ?? 2500);
const T_MAP = Number(process.env.PERF_MAP_WAIT ?? 3000);
const FIGHTS = Number(process.env.PERF_FIGHTS ?? 2);
const GAP = Number(process.env.PERF_CLICK_GAP ?? 1400);   // 序章每一下點擊的間隔（毫秒）；急性子 800（連點保護 700 毫秒）
const SHOTS = process.env.PERF_SHOTS === '1';
// PERF_H2=1：本機改用 HTTP/2（正式站 GitHub Pages 是 HTTP/2；HTTP/1.1 一個主機最多 6 條連線，請求會排隊）。憑證放 PERF_CERT_DIR（key.pem＋cert.pem，自簽、不進倉庫）
const WHATIF = process.env.PERF_WHATIF ?? '';   // 「假如這樣預載」的模擬（不改遊戲程式，從頁面外面替它先要檔案）：monsters／tierA／both，在按下「出發」那一刻插隊要
const H2 = process.env.PERF_H2 === '1';
const CERT_DIR = process.env.PERF_CERT_DIR ?? '';
const SEED = 'perfaudio';
// PERF_CONTINUE=1（2026-10-01 netload 審查 中-2）：先在另一頁開一局、存檔，清掉瀏覽器快取，再開封面、停 PERF_TITLE_WAIT 毫秒按「續玩」，量到地圖為止
const CONTINUE = process.env.PERF_CONTINUE === '1';
const NET = { offline: false, latency: RTT, downloadThroughput: (MBPS * 1e6) / 8, uploadThroughput: 750e3 / 8 };

// ── 本機伺服器：同 measure.mjs（GitHub Pages 的做法：文字檔 gzip、其餘原樣、快取十分鐘；本機是 HTTP/1.1，一個主機最多 6 條連線） ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const GZ = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest']);
function startServer(dist, site) {
  const prefix = `/${site}/`;
  const handler = (req, res) => {
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
  };
  const server = H2 ? createSecureServer({ key: readFileSync(join(CERT_DIR, 'key.pem')), cert: readFileSync(join(CERT_DIR, 'cert.pem')), allowHTTP1: true }, handler) : createServer(handler);
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `${H2 ? 'https' : 'http'}://127.0.0.1:${server.address().port}${prefix}`, close: () => { server.closeAllConnections?.(); server.close(); } })));
}

// ── 頁面裡的追蹤（每頁最早執行）──
function traceInit() {
  if (location.hostname !== '127.0.0.1') return;
  const L = (window.__L = []);
  const now = () => performance.timeOrigin + performance.now();
  window.__au = (tag, name, info) => L.push({ t: now(), tag, name, ...(info || {}) });
  try { performance.setResourceTimingBufferSize(20000); } catch (e) { /* 舊瀏覽器 */ }
  try { localStorage.setItem('qiuqiu.tutorial', 'done'); } catch (e) { /* 略 */ }
  // 網路請求（fetch 的：音效、語音、查表、素材清單）
  const of = window.fetch; let seq = 0;
  window.fetch = function (input) {
    const url = typeof input === 'string' ? input : input.url; const id = ++seq;
    L.push({ t: now(), tag: 'fetch.start', name: url, id });
    return of.apply(this, arguments).then((r) => { L.push({ t: now(), tag: 'fetch.head', name: url, id, status: r.status }); return r; }, (e) => { L.push({ t: now(), tag: 'fetch.err', name: url, id }); throw e; });
  };
  const oab = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = function () {
    const u = this.url;
    return oab.call(this).then((ab) => { try { ab.__url = u; } catch (e) { /* 略 */ } L.push({ t: now(), tag: 'fetch.body', name: u, bytes: ab.byteLength }); return ab; });
  };
  // 解碼
  const ode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (ab) {
    const url = ab && ab.__url; const t0 = now();
    const p = ode.apply(this, arguments);
    return p.then((buf) => { try { buf.__url = url; } catch (e) { /* 略 */ } L.push({ t: now(), tag: 'decode.done', name: url, ms: Math.round(now() - t0), dur: buf.duration }); return buf; });
  };
  // 音訊環境
  const AC = window.AudioContext;
  window.AudioContext = class extends AC {
    constructor(...a) {
      super(...a); window.__ac = this;
      L.push({ t: now(), tag: 'ctx.new', name: this.state });
      this.addEventListener('statechange', () => L.push({ t: now(), tag: 'ctx.state', name: this.state }));
    }
  };
  // 實際播出
  const os = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function () {
    L.push({ t: now(), tag: 'abs.start', name: (this.buffer && this.buffer.__url) || '?', dur: this.buffer ? this.buffer.duration : null });
    return os.apply(this, arguments);
  };
  // 使用者輸入
  window.addEventListener('mousedown', (e) => { const el = e.target; L.push({ t: now(), tag: 'mousedown', name: (el && (el.className && el.className.baseVal === undefined ? el.className : el.tagName)) + '' }); }, true);
  // 畫面狀態變化（每 40 毫秒看一次）
  let last = '';
  setInterval(() => {
    const s = document.querySelector('#stage'); if (!s) return;
    const h = document.querySelector('.map-hint');
    // 地圖底圖到了沒、節點圖示還缺幾張；戰鬥畫面上魔物圖與手牌圖還缺幾張
    let extra = '';
    const bgEl = document.querySelector('.map-bg');
    if (bgEl) {
      const mm = /url\("?([^")]+)"?\)/.exec(getComputedStyle(bgEl).backgroundImage);
      const en = mm ? performance.getEntriesByName(mm[1]) : [];
      const ic = [...document.querySelectorAll('.map-node img')];
      const miss = ic.filter((i) => !(i.complete && i.naturalWidth > 0));
      extra += 'mapbg:' + (en.length && en[en.length - 1].responseEnd > 0 ? 'ok' : 'WAIT') + '/icons缺' + miss.length + 'of' + ic.length;
      const ms = miss.map((i) => (i.getAttribute('src') || '').split('/').pop()).join(',');
      if (ms !== window.__lastMiss) { window.__lastMiss = ms; L.push({ t: now(), tag: 'mapmissing', name: ms }); }
    }
    const un = [...document.querySelectorAll('.unit img')];
    if (un.length) extra += 'units缺' + un.filter((i) => !(i.complete && i.naturalWidth > 0)).length + 'of' + un.length;
    // 2026-09-30 netload：缺的是誰（主角 player／魔物 enemy）哪一張，另記一筆，才分得出「主角空白」與「魔物空白」
    const um = un.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => (i.closest('.unit.player') ? 'player:' : 'enemy:') + (i.getAttribute('src') || '').replace(/^.*\/assets\//, '')).join(',');
    if (um !== (window.__lastUnitMiss ?? '')) { window.__lastUnitMiss = um; L.push({ t: now(), tag: 'unitmissing', name: um }); }
    const hd = [...document.querySelectorAll('.hand .card img.card-art')];
    if (hd.length) extra += '/hand缺' + hd.filter((i) => !(i.complete && i.naturalWidth > 0)).length + 'of' + hd.length;
    // 慢網路修正（2026-09-30 netload）加的條件式進度條：出現就記「BAR:<文字>」（修正前的版本永遠不會有）
    const bar = document.querySelector('.net-progress');
    const key = [s.dataset.screen, s.classList.contains('fight-pending') ? 'PENDING' : '', h ? h.textContent : '', bar ? 'BAR:' + bar.textContent : '', document.querySelector('.net-gate') ? 'GATE' : '', document.querySelector('.slide-overlay') ? 'slide' : '',
      document.querySelector('.dialogue-overlay') ? 'dlg' : '', document.querySelector('.screen-loading') ? 'LOADING' : '', document.querySelector('.map-node.choice.picked') ? 'picked' : '', extra].join('|');
    if (key !== last) { last = key; L.push({ t: now(), tag: 'ui', name: key }); }
  }, 40);
}

const server = await startServer(DIST, 'qiuqiu-tower');
const chromium = await loadPlaywright();
const kb = (b) => Math.round(b / 1024);

/** 網路記帳（CDP）：時間一律換算成 epoch 毫秒，跟頁面裡的記錄同一把尺 */
function netLog(cdp) {
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { if (e.redirectResponse) return; reqs.set(e.requestId, { url: e.request.url, t0: e.wallTime * 1000, mono0: e.timestamp, type: e.type, prio: e.request.initialPriority }); });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.head = r.t0 + (e.timestamp - r.mono0) * 1000; r.fromCache = !!(e.response.fromDiskCache || e.response.fromPrefetchCache); r.status = e.response.status; r.proto = e.response.protocol; } });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.t1 = r.t0 + (e.timestamp - r.mono0) * 1000; } });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.failed = true; r.t1 = r.t0 + (e.timestamp - r.mono0) * 1000; } });
  return { reqs };
}
async function throttle(cdp) {
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  if (MBPS > 0) await cdp.send('Network.emulateNetworkConditions', NET);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
}

const CAN_ACT = () => {
  const cs = window.__app && window.__app.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false;
  const b = document.querySelector('.end-turn'); if (!b || b.disabled || b.classList.contains('disabled')) return false;
  if (document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay, .slide-overlay')) return false;
  if (document.querySelector('.hand .card.flying')) return false;
  return true;
};
const screenOf = (page) => page.evaluate(() => document.querySelector('#stage')?.dataset.screen ?? null);
async function waitFor(page, fn, arg, timeout, label) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { console.log('  ⚠ 逾時：' + label); return false; }
}
const M = (page, name) => page.evaluate((n) => window.__au('mark', n), name);

async function playCards(page) {
  // 點一張能出的牌（要目標的再點第一隻活著的魔物）；回傳有沒有出成
  const pt = await page.evaluate(({ POINT_FN }) => {
    const f = eval(POINT_FN);
    const cards = [...document.querySelectorAll('.hand .card.clickable')];
    const n = cards.find((c) => /攻/.test(c.className + c.textContent)) ?? cards[0];
    return n ? f(n) : null;
  }, { POINT_FN });
  if (!pt) return false;
  await page.mouse.move(pt.x, pt.y, { steps: 4 });
  await sleep(150);
  await page.mouse.click(pt.x, pt.y);
  await sleep(150);
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

/** 打完一場：出牌、結束回合，直到離開戰鬥畫面 */
async function fightThrough(page, tag) {
  const t0 = Date.now();
  let turn = 0;
  while (Date.now() - t0 < 300000) {
    if ((await screenOf(page)) !== 'combat') break;
    if (!(await page.evaluate(CAN_ACT))) { await sleep(200); continue; }
    await waitFor(page, () => document.querySelectorAll('.hand .card').length > 0, null, 30000, tag + ' 等手牌');
    await sleep(600);
    turn++;
    let plays = 0;
    for (let i = 0; i < 8; i++) {
      if ((await screenOf(page)) !== 'combat') break;
      const ok = await playCards(page);
      if (!ok) break;
      plays++;
      await sleep(1000);
      await page.waitForFunction((fn) => document.querySelector('#stage')?.dataset.screen !== 'combat' || eval('(' + fn + ')')(), CAN_ACT.toString(), { timeout: 15000, polling: 50 }).catch(() => console.log('  ⚠ 逾時：' + tag + ' 等出牌後可再動'));
    }
    if ((await screenOf(page)) !== 'combat') break;
    await M(page, `${tag}.turn${turn}.end`);
    await realClick(page, '.end-turn');
    await sleep(1500);
    await waitFor(page, () => { const cs = window.__app.cs; return !cs || cs.phase !== 'enemy' && !cs.enemyActing || document.querySelector('#stage')?.dataset.screen !== 'combat'; }, null, 60000, tag + ' 等魔物行動完');
  }
  await M(page, `${tag}.fightEnd`);
}

/** 打完後：獎勵畫面拿第一張牌／按繼續，回到地圖 */
async function takeReward(page, tag) {
  await waitFor(page, () => ['reward', 'map', 'actclear', 'result'].includes(document.querySelector('#stage')?.dataset.screen), null, 60000, tag + ' 等獎勵畫面');
  for (let i = 0; i < 12; i++) {
    const s = await screenOf(page);
    if (s === 'map') return true;
    if (s === 'reward') {
      await sleep(1200);
      await M(page, tag + '.reward.click');
      if (await realClick(page, '.reward-cards .card')) { await sleep(800); continue; }
      if (await realClick(page, 'button.primary')) { await sleep(800); continue; }
      await sleep(500);
    } else { await sleep(500); }
  }
  return (await screenOf(page)) === 'map';
}

/** 點地圖上一格能走的戰鬥格 */
async function clickCombatNode(page, tag) {
  const info = await page.evaluate(() => [...document.querySelectorAll('.map-node.choice')].map((n) => n.className));
  console.log('  可選節點：' + JSON.stringify(info));
  const idx = info.findIndex((c) => /t-戰鬥/.test(c));
  await M(page, tag + '.beforeNodeClick');
  const ok = await realClick(page, '.map-node.choice', { index: idx >= 0 ? idx : 0 });
  return { ok, cls: info[idx >= 0 ? idx : 0] };
}

/** 走完一整段流程（頁面已經開好，新的一頁） */
async function flow(page, url, tag) {
  const res = { tag };
  assertLocal(url);
  const t0 = Date.now();
  await page.goto(url + '?debug', { waitUntil: 'commit' });
  await waitFor(page, () => document.querySelector('#stage')?.dataset.screen === 'title', null, 180000, '封面');
  await M(page, 'title.shown');
  await waitFor(page, () => { const a = [...document.querySelectorAll('.title-cat')]; return a.length > 0 && a.every((i) => i.complete && i.naturalWidth > 0); }, null, 180000, '封面圖');
  await M(page, 'title.artReady');
  await sleep(T_TITLE);
  if (CONTINUE) {
    await M(page, 'click.continue');
    const clickAt = Date.now();
    if (!(await realClick(page, 'button', { textRe: '^續玩$' }))) console.log('  ⚠ 找不到「續玩」');
    await waitFor(page, () => document.querySelector('#stage')?.dataset.screen === 'map', null, 60000, '續玩進地圖');
    res.continueToMapSec = (Date.now() - clickAt) / 1000;
    await M(page, 'map.shown');
    await sleep(5000);
    res.totalSec = (Date.now() - t0) / 1000;
    res.netSpeed = await page.evaluate(() => document.documentElement.dataset.netSpeed ?? null);
    console.log(`  續玩到地圖 ${res.continueToMapSec}s`);
    return res;
  }
  // 種子（本局代碼）：讓每次的地圖一樣
  await page.evaluate((s) => { const i = document.querySelector('input.seed'); if (i) { i.value = s; i.dispatchEvent(new Event('input', { bubbles: true })); } }, SEED);
  await M(page, 'click.newgame');
  await realClick(page, 'button.primary', { index: 0 });   // 第一次真的點擊＝音訊環境在這一刻建立
  await waitFor(page, () => document.querySelector('#stage')?.dataset.screen === 'heroselect', null, 60000, '選角畫面');
  await M(page, 'heroselect.shown');
  await sleep(T_SELECT);
  await realClick(page, `.hero-card[data-hero="${HERO}"]`);
  await sleep(500);
  await M(page, 'click.go');
  await realClick(page, 'button.primary', { index: 0 });
  if (WHATIF) {
    // 用逗號串起來的項目：mapbg（地圖底圖＋節點圖示，圖片高優先）、sfx（28 個音效）、voicecode（配音程式＋查表）、monsters（第一層三格的魔物立繪）、
    // poses（主角靜態姿勢＋起手牌面）、barks（這位主角全部戰鬥吐槽）、barks_start（只有開戰那句）
    const lists = JSON.parse(readFileSync(new URL('./out_audio/minset_urls.json', import.meta.url), 'utf8'))[HERO];
    const w = new Set(WHATIF.split(','));
    if (w.has('staged')) {
      // 分段：A 層（地圖圖＋音效＋配音程式＋戰鬥程式）全到齊 → B 層（魔物立繪＋起手牌面＋開戰吐槽語音）全到齊 → 其餘主角姿勢用普通優先權慢慢補
      await page.evaluate(({ L, base }) => {
        const img = (u, pri) => new Promise((ok) => { const i = new Image(); if (pri) i.fetchPriority = pri; i.src = base + u; (window.__keep ??= []).push(i); i.decode().then(ok, ok); });
        const get = (u) => fetch(base + u, { priority: 'high' }).then((r) => r.arrayBuffer()).catch(() => {});
        (async () => {
          const t0 = performance.now(); const mark = (n) => window.__au('whatif.stage', n, { sec: Math.round(performance.now() - t0) / 1000 });
          await Promise.all([...L.mapBg.map((u) => img(u, 'high')), ...L.sfx.map(get), ...L.voiceCode.map(get), ...L.combatCode.map(get)]); mark('A完成');
          await Promise.all([...L.monstersFloor1.map((u) => img(u, 'high')), ...L.heroStarter.map((u) => img(u, 'high')), ...L.barksStart.map(get)]); mark('B完成');
          await Promise.all(L.heroPoses.map((u) => img(u))); mark('姿勢完成');
        })();
      }, { L: lists, base: url });
    } else {
    const imgs = [...(w.has('mapbg') ? lists.mapBg : []), ...(w.has('monsters') ? lists.monstersFloor1 : []), ...(w.has('poses') ? lists.heroStatic : [])];
    const files = [...(w.has('sfx') ? lists.sfx : []), ...(w.has('voicecode') ? lists.voiceCode : []), ...(w.has('combatcode') ? lists.combatCode : []), ...(w.has('barks') ? lists.barks : []), ...(w.has('barks_start') ? lists.barksStart : [])];
    await page.evaluate(({ imgs, files, base }) => {
      window.__keep = [];
      // 順序＝重要度；圖片用圖片高優先（同一張之後遊戲自己再要就直接拿記憶體裡的），音效與配音用 fetch 高優先（進 HTTP 快取）
      for (const u of imgs) { const i = new Image(); i.fetchPriority = 'high'; i.src = base + u; i.decode().catch(() => {}); window.__keep.push(i); }
      for (const u of files) fetch(base + u, { priority: 'high' }).then((r) => r.arrayBuffer()).catch(() => {});
    }, { imgs, files, base: url });
    }
    await M(page, 'whatif.injected:' + WHATIF);
  }
  // 序章：一路點下去（每 1.4 秒點一次，模擬邊看邊點），直到地圖或祝福畫面
  await M(page, 'prologue.start');
  const pt0 = Date.now();
  let clicks = 0;
  while (Date.now() - pt0 < 240000) {
    const s = await screenOf(page);
    if (s === 'map' || s === 'blessing') break;
    const has = await page.evaluate(() => !!document.querySelector('.slide-overlay, .dialogue-overlay'));
    if (has) { await realClick(page, '.slide-overlay, .dialogue-overlay'); clicks++; }
    await sleep(GAP);
  }
  await M(page, 'prologue.end');
  res.prologueClicks = clicks;
  // 祝福：選第一張（可能要再選一張牌）
  if ((await screenOf(page)) === 'blessing') {
    await sleep(1500);
    await M(page, 'blessing.pick');
    for (let i = 0; i < 8 && (await screenOf(page)) === 'blessing'; i++) {
      if (await realClick(page, '.bless-card:not(.sold)')) { await sleep(1200); }
      if (await realClick(page, '.reward-cards .card')) { await sleep(1200); }
      if ((await screenOf(page)) === 'blessing') { await realClick(page, 'button.primary'); await sleep(1000); }
    }
  }
  // 地圖
  await waitFor(page, () => document.querySelector('#stage')?.dataset.screen === 'map', null, 60000, '地圖');
  await M(page, 'map.shown');
  // 地圖上還有序章／祝福收尾的對白就先點掉
  for (let i = 0; i < 6; i++) { if (await page.evaluate(() => !!document.querySelector('.slide-overlay, .dialogue-overlay'))) { await realClick(page, '.slide-overlay, .dialogue-overlay'); await sleep(GAP); } else break; }
  if (SHOTS) {
    // 地圖一出現連拍幾張（0、0.5、1、2、3 秒），看有沒有一片黑／缺底圖
    const t00 = Date.now();
    res.mapShots = [];
    for (const at of [0, 500, 1000, 2000, 3000]) {
      const w = at - (Date.now() - t00); if (w > 0) await sleep(w);
      const st = await page.evaluate(() => ({ bg: !!document.querySelector('.map-bg'), nodes: document.querySelectorAll('.map-node').length }));
      const f = join(OUT, `shot_${LABEL}_${tag}_map_${at}.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: 45 });
      res.mapShots.push({ at, afterMs: Date.now() - t00, file: `shot_${LABEL}_${tag}_map_${at}.jpg`, ...st });
    }
  } else await sleep(T_MAP);
  res.fights = [];
  for (let f = 1; f <= FIGHTS; f++) {
    const ftag = 'fight' + f;
    const node = await clickCombatNode(page, ftag);
    const clickAt = Date.now();
    await waitFor(page, () => document.querySelector('#stage')?.dataset.screen === 'combat', null, 120000, ftag + ' 進戰鬥畫面');
    const toCombat = (Date.now() - clickAt) / 1000;
    await M(page, ftag + '.combatShown');
    await waitFor(page, CAN_ACT, null, 120000, ftag + ' 能出牌');
    const toAct = (Date.now() - clickAt) / 1000;
    await M(page, ftag + '.canAct');
    const enc = await page.evaluate(() => window.__app.cs?.enemies.map((e) => e.enemyId ?? e.defId ?? e.id).join('+'));
    res.fights.push({ node: node.cls, enc, clickToCombatSec: toCombat, clickToCanActSec: toAct });
    console.log(`  ${tag} 第 ${f} 場 ${enc}：點到戰鬥畫面 ${toCombat}s、能出牌 ${toAct}s`);
    await fightThrough(page, ftag);
    if (f < FIGHTS) { const ok = await takeReward(page, ftag); if (!ok) { console.log('  ⚠ 沒回到地圖'); break; } await sleep(T_MAP); }
  }
  await sleep(2000);
  res.totalSec = (Date.now() - t0) / 1000;
  res.netSpeed = await page.evaluate(() => document.documentElement.dataset.netSpeed ?? null);
  return res;
}

async function collect(page, net, tag, res) {
  const L = await page.evaluate(() => window.__L ?? []);
  const rt = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => ({ name: e.name, start: performance.timeOrigin + e.startTime, end: performance.timeOrigin + e.responseEnd, size: e.encodedBodySize, transfer: e.transferSize, init: e.initiatorType, prio: e.renderBlockingStatus })));
  const nav = await page.evaluate(() => performance.timeOrigin);
  const reqs = [...net.reqs.values()].map((r) => ({ url: r.url, t0: r.t0, head: r.head ?? null, t1: r.t1 ?? null, bytes: r.bytes ?? null, type: r.type, prio: r.prio, fromCache: !!r.fromCache, failed: !!r.failed, proto: r.proto }));
  const ac = await page.evaluate(() => (window.__ac ? window.__ac.state : null));
  writeFileSync(join(OUT, `trace_${LABEL}_${tag}.json`), JSON.stringify({ label: LABEL, tag, config: { DIST, HERO, MBPS, RTT, CPU, T_TITLE, T_SELECT, T_MAP, FIGHTS, GAP, H2, WHATIF }, res, ac, timeOrigin: nav, L, reqs, rt }));
  console.log(`  寫好 trace_${LABEL}_${tag}.json（記錄 ${L.length} 筆、請求 ${reqs.length} 筆、音訊環境 ${ac}）`);
}

// ── 主流程 ──
const PROFILE = `${PROFILE_ROOT}/audiotrace-${LABEL}`;
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: true, ignoreHTTPSErrors: H2, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block',
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
try {
  await ctx.addInitScript(traceInit);
  const passes = WARM ? ['cold', 'warm'] : ['cold'];
  for (const tag of passes) {
    console.log(`── ${LABEL} ${tag}（${HERO}，${MBPS} Mbps／${RTT} ms／CPU×${CPU}，${DIST}）──`);
    if (CONTINUE) {
      // 先開一局、存檔（只寫本機網址的儲存），再關掉這一頁
      const prep = await ctx.newPage();
      assertLocal(server.url);
      await prep.goto(server.url + '?debug', { waitUntil: 'commit' });
      await waitFor(prep, () => !!window.__app && document.querySelector('#stage')?.dataset.screen === 'title', null, 180000, '存檔用那頁的封面');
      await prep.evaluate(({ seed, hero }) => { const a = window.__app; a.newRun(seed, 1, hero); for (const p of a.run.players) delete p.bless; a.save(); }, { seed: SEED, hero: HERO });
      await sleep(500);
      await prep.close();
    }
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const cdp = await ctx.newCDPSession(page);
    const net = netLog(cdp);
    await throttle(cdp);
    if (CONTINUE) await cdp.send('Network.clearBrowserCache');   // 清快取：續玩這一頁是冷的
    if (tag === 'warm') {
      // 同一個瀏覽器的 HTTP 快取還在；存檔與設定清掉（只動本機網址的儲存）
      await page.goto(server.url + 'nettest.html', { waitUntil: 'commit' }).catch(() => {});
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* 略 */ } }).catch(() => {});
    }
    const res = await flow(page, server.url, tag);
    res.pageErrors = errs;
    await collect(page, net, tag, res);
    console.log('  ' + JSON.stringify({ ...res, fights: undefined }));
    await page.close();
    // 冷的那一頁關掉後，等一下讓快取落盤
    await sleep(1500);
  }
} finally {
  try { await ctx.close(); } catch { killOwnChrome(`audiotrace-${LABEL}`); }
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* 略 */ }
  server.close();
}
process.exit(0);
