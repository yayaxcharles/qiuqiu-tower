#!/usr/bin/env node
/*
 * 關主逐格動作實戰檢查（2026-10-01，使用者：「第一關 BOSS 機器狗還是原本的？爆炸應該很華麗」）。
 * 無頭 Chrome、獨立設定資料夾、只開本機網址。直接開打鐵爪機關貓或掃地機器人王，
 * 依序：待機 → 結束回合讓牠出招 →（鐵爪）打到第二階段、再讓牠出招 → 打死看倒下爆炸。
 * 每 80 毫秒取樣一次：魔物那一格有沒有掛逐格畫布、畫布內容有沒有在換格（像素雜湊）、靜態立繪是哪一張；
 * 各時刻截圖。輸出 <輸出夾>/<標籤>/timeline.json、summary.json、*.jpg。
 *
 *   node tools/perf/boss_motion_check.mjs <dist 資料夾> <輸出夾> <iron_claw|roomba_king|frog_daimyo|kappa> <fast|slow> [標籤]
 * slow＝0.8 Mbps／300 毫秒、冷快取（新的設定資料夾）；fast＝不限速。
 * 環境變數 BOSS_DWELL_MS：開局後先在地圖停多久才開打（模擬一路打上來，預設 0＝最差情況）。
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const DIST = resolve(process.argv[2] ?? 'dist');
const OUT_ROOT = resolve(process.argv[3] ?? 'tmp-boss');
const BOSS = process.argv[4] ?? 'iron_claw';
const NET = process.argv[5] ?? 'fast';
const TAG = process.argv[6] ?? `${BOSS}-${NET}`;
const DWELL = Number(process.env.BOSS_DWELL_MS ?? 0);
// 每次讓牠出招、打死之前，最多等這一段要用的逐格圖集下載完多久（預設 0＝不等，照手速打）
const ATLAS_WAIT = Number(process.env.BOSS_ATLAS_WAIT_MS ?? 0);
const OUT = join(OUT_ROOT, TAG);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = await startServer(DIST, 'qiuqiu-tower');
await loadPlaywright();
const c = await newContext('bossfx', `${TAG}-${process.pid}`.replace(/[^a-z0-9_-]/gi, '_'));
const { page } = c;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
if (NET === 'slow') {
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: (0.8e6) / 8, uploadThroughput: 750e3 / 8 });
}
const atlasLog = [];
const atlasById = new Map();
cdp.on('Network.requestWillBeSent', (e) => {
  if (!/motion\/side\//.test(e.request.url)) return;
  const r = { url: e.request.url.replace(/^.*motion\/side\//, '').replace(/-[A-Za-z0-9_-]{8}\.webp.*$/, ''), sent: Date.now(), done: 0 };
  atlasLog.push(r); atlasById.set(e.requestId, r);
});
cdp.on('Network.loadingFinished', (e) => { const r = atlasById.get(e.requestId); if (r) r.done = Date.now(); });
cdp.on('Network.loadingFailed', (e) => { const r = atlasById.get(e.requestId); if (r) r.done = -Date.now(); });
const atlasDone = (name) => atlasLog.some((r) => r.url === name && r.done > 0);
async function waitAtlases(names, label) {
  if (!ATLAS_WAIT) return;
  const start = Date.now();
  while (Date.now() - start < ATLAS_WAIT && !names.every(atlasDone)) await sleep(250);
  await mark(`${label}：圖集${names.every(atlasDone) ? '到齊' : '沒到齊'}（等了 ${((Date.now() - start) / 1000).toFixed(1)} 秒）`);
  await sleep(1200);   // 解碼
}

const CAN_ACT = () => {
  const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false;
  const b = document.querySelector('.end-turn'); if (!b || b.disabled || b.classList.contains('disabled')) return false;
  if (document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay, .slide-overlay')) return false;
  return !document.querySelector('.hand .card.flying');
};

const t0 = Date.now();
await page.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch { /* */ } });
await bootRun(page, server.url, 'ninja', `bossfx-${BOSS}`);
if (DWELL > 0) await sleep(DWELL);

// 取樣器：每 80 毫秒記一次魔物那一格的樣子
await page.evaluate((BOSS) => {
  window.__bx = { samples: [], marks: [], boss: BOSS };
  const hashCanvas = (cv) => {
    try {
      const g = cv.getContext('2d'); const w = cv.width, h = cv.height; if (!w || !h) return 0;
      const d = g.getImageData(0, 0, w, h).data; let s = 0;
      for (let i = 0; i < d.length; i += 4 * 37) s = (s * 31 + d[i] + d[i + 1] * 3 + d[i + 3] * 7) >>> 0;
      return s;
    } catch { return -1; }
  };
  setInterval(() => {
    const cs = window.__app?.cs; if (!cs) return;
    const e = cs.enemies.find((x) => x.enemyId === BOSS); if (!e) return;
    const unit = document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`);
    const box = unit?.querySelector('.sprite-box');
    const cv = box?.querySelector('canvas.enemy-motion');
    const img = box?.querySelector('img.sprite');
    window.__bx.samples.push({
      t: Date.now(), hp: e.hp, phase: e.phase, dead: e.dead, csPhase: cs.phase, acting: !!cs.enemyActing,
      motion: !!box?.classList.contains('has-enemy-motion'), canvas: !!cv, hash: cv ? hashCanvas(cv) : 0,
      img: img ? (img.getAttribute('src') || '').replace(/^.*\//, '').replace(/\?.*$/, '') : null,
      imgVis: img ? getComputedStyle(img).visibility + '/' + getComputedStyle(img).opacity : null,
      cls: unit ? [...unit.classList].filter((k) => /dead|motion|falling|dying/.test(k)).join(' ') : 'gone',
      atlases: performance.getEntriesByType('resource').filter((r) => /motion\/side\//.test(r.name)).map((r) => r.name.replace(/^.*motion\/side\//, '').replace(/\?.*$/, '') + '@' + Math.round(r.responseEnd)),
    });
  }, 80);
}, BOSS);
const mark = (what) => page.evaluate((w) => window.__bx.marks.push({ t: Date.now(), what: w }), what);
const shot = async (name) => {
  const clip = await page.evaluate((BOSS) => {
    const e = window.__app.cs.enemies.find((x) => x.enemyId === BOSS);
    const n = document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`) || document.querySelector('.enemies');
    const r = n.getBoundingClientRect();
    return { x: Math.max(0, r.left - 160), y: Math.max(0, r.top - 120), width: r.width + 320, height: r.height + 220 };
  }, BOSS).catch(() => null);
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 80, ...(clip ? { clip: { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.min(1280 - Math.round(clip.x), Math.round(clip.width)), height: Math.min(720 - Math.round(clip.y), Math.round(clip.height)) } } : {}) });
};

await page.evaluate(({ BOSS }) => {
  const app = window.__app; const orig = app.show.bind(app); let done = false;
  app.show = (nm, ...r) => {
    if (nm === 'combat' && app.cs && !done) {
      done = true; const p = app.cs.players[0]; let u = 88001;
      const hand = ['sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo'];
      p.hand.splice(0, p.hand.length, ...hand.map((id) => ({ uid: u++, cardId: id, upgraded: false })));
      p.drawPile.splice(0, p.drawPile.length, ...Array.from({ length: 20 }, () => ({ uid: u++, cardId: 'sanjo', upgraded: false })));
      p.energy = 9; p.maxHp = 999; p.hp = 999;
    }
    return orig(nm, ...r);
  };
  const r = app.run; r.act = BOSS === 'roomba_king' || BOSS === 'kappa' ? 2 : BOSS === 'frog_daimyo' ? 3 : 1; r.floor = 9; r.flags['tut:combat'] = true;
  app.startFight(BOSS, false);
}, { BOSS });
await mark('開打');
await waitScreen(page, 'combat', 120000);
await mark('進戰鬥畫面');
await page.waitForFunction(CAN_ACT, null, { timeout: 120000 });
await sleep(1500);
await mark('待機');
await shot('01_待機');

async function endTurn(label, shots) {
  await page.evaluate(() => { const p = window.__app.cs.players[0]; p.hp = 999; });
  await mark(label);
  await page.click('.end-turn');
  for (let i = 0; i < shots; i++) { await sleep(250); await shot(`${label}_${String(i).padStart(2, '0')}`); }
  await page.waitForFunction(CAN_ACT, null, { timeout: 60000 }).catch(() => {});
  await mark(label + '完');
  await sleep(600);
}
async function hit(label) {
  await page.evaluate(() => { window.__app.cs.players[0].energy = 9; });
  const pt = await page.evaluate(({ POINT_FN }) => {
    const f = eval(POINT_FN); const n = document.querySelector('.hand .card'); return n ? f(n) : null;
  }, { POINT_FN });
  await mark(label);
  if (!pt) { await mark('沒有牌可出'); return; }
  await page.mouse.click(pt.x, pt.y); await sleep(200);
  const tp = await page.evaluate(({ POINT_FN, BOSS }) => {
    const f = eval(POINT_FN); const e = window.__app.cs.enemies.find((x) => x.enemyId === BOSS);
    const node = document.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite-box`); return node ? f(node) : null;
  }, { POINT_FN, BOSS });
  if (tp) await page.mouse.click(tp.x, tp.y);
}

if (BOSS === 'roomba_king') {
  await endTurn('出招1_召喚', 4);
  await waitAtlases(['roomba_king-drive', 'roomba_king-ram', 'roomba_king-down'], '出招前');
  await endTurn('出招2_滾刷', 8);
} else if (!['iron_claw', 'frog_daimyo'].includes(BOSS)) {
  await endTurn('出招1', 8);   // 抽查用（河童等）：出一次招就打死
} else {
  // 待機改畫立繪的不等走路那張（2026-10-01 起根本不抓）；只等出招那張
  if (BOSS === 'iron_claw') await waitAtlases(['iron_claw-swipe'], '出招前');
  await endTurn('出招1', 8);
  // 第一階段多打幾回合的樣子（環境變數 BOSS_P1_HOLD_MS，預設 0）：第二階段的圖集在這段時間先下載
  if (Number(process.env.BOSS_P1_HOLD_MS ?? 0) > 0) { await sleep(Number(process.env.BOSS_P1_HOLD_MS)); await mark('第一階段多打一陣子'); }
  // 打到第二階段：兩隻的門檻都是 55，血設 58、貓抓 6 → 52
  await page.evaluate((BOSS) => { const e = window.__app.cs.enemies.find((x) => x.enemyId === BOSS); e.hp = 58; e.block = 0; }, BOSS);
  await hit('換第二階段');
  for (let i = 0; i < 6; i++) { await sleep(300); await shot(`換階段_${String(i).padStart(2, '0')}`); }
  await page.waitForFunction(CAN_ACT, null, { timeout: 60000 }).catch(() => {});
  await sleep(800);
  await shot('03_第二階段待機');
  if (BOSS === 'iron_claw') await waitAtlases(['iron_claw-laser_p2', 'iron_claw-down_p2'], '第二階段出招前');
  await endTurn('出招2', 8);
}
// 打死：血設 1、清防禦與反彈
await page.evaluate((BOSS) => {
  const e = window.__app.cs.enemies.find((x) => x.enemyId === BOSS); e.hp = 1; e.block = 0;
  if (e.statuses) for (const k of Object.keys(e.statuses)) if (k === '反彈') delete e.statuses[k];
}, BOSS);
await hit('打死');
// 爆炸在倒下片段的頭 0.7 秒：前面拍密一點
for (let i = 0; i < 18; i++) { await sleep(i < 8 ? 60 : 250); await shot(`倒下_${String(i).padStart(2, '0')}`); }
await sleep(1500);
await mark('結束');

const { samples, marks } = await page.evaluate(() => window.__bx);
// 分段：每段（兩個標記之間）有幾成取樣掛著畫布、畫布換了幾次格
const segs = [];
for (let i = 0; i < marks.length; i++) {
  const a = marks[i].t, b = marks[i + 1]?.t ?? Infinity;
  const ss = samples.filter((s) => s.t >= a && s.t < b);
  let changes = 0; for (let k = 1; k < ss.length; k++) if (ss[k].canvas && ss[k].hash !== ss[k - 1].hash) changes++;
  segs.push({ seg: marks[i].what, at: ((a - t0) / 1000).toFixed(1) + 's', samples: ss.length, canvasPct: ss.length ? Math.round(100 * ss.filter((s) => s.canvas).length / ss.length) : 0, frameChanges: changes,
    imgs: [...new Set(ss.map((s) => s.img))].join(','), cls: [...new Set(ss.map((s) => s.cls))].join('|'), phase: [...new Set(ss.map((s) => s.phase))].join(',') });
}
const last = samples[samples.length - 1];
const sec = (t) => ((t - t0) / 1000).toFixed(1) + 's';
const summary = { boss: BOSS, net: NET, dist: DIST, dwellMs: DWELL, atlasWaitMs: ATLAS_WAIT, segs, atlasesLoaded: last?.atlases ?? [],
  atlasRequests: atlasLog.map((x) => `${x.url} 送出 ${sec(x.sent)} 到齊 ${x.done > 0 ? sec(x.done) : x.done < 0 ? '失敗' : '沒到'}`), logs: c.logs.slice(0, 20) };
writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ marks, samples }, null, 1));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
await c.close();
server.close?.();
process.exit(0);
