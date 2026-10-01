#!/usr/bin/env node
/*
 * 師父（tower_master）三階段逐格＋走火入魔特效＋戰敗：本機打一場完整師父戰、整畫面連拍（2026-10-01）。
 * 無頭 Chrome、獨立設定資料夾（visual-gate/lib/browser.mjs）、只開本機網址；截圖整個畫面、不帶縮放。
 *
 *   node tools/perf/daxia_check.mjs <dist 資料夾> <輸出夾> <fast|slow> [標籤]
 * slow＝0.8 Mbps／300 毫秒、冷快取（新的設定資料夾）。
 * 環境變數：
 *   DAXIA_DWELL_MS     先在「第三關的地圖」停多久才開打（進第三關的背景下載在這段時間跑；預設 fast 3000、slow 0）
 *   DAXIA_ATLAS_WAIT_MS 每一段之前最多等那一段要用的圖集多久（預設 fast 20000、slow 0＝照手速打，看退回）
 *   DAXIA_SHOTS=0      不截圖（只量時間）
 *
 * 流程：開局 → 改成第三關、畫一次地圖（觸發進第三關的背景下載）→ 停 DWELL → 開打師父 →
 *   第一階段出五招（鐵頭功、拆招、金鐘罩、獅吼功、沾衣十八跌）→ 打到第二階段（變身＋黑氣爆發＋震動）→ 閉關那一回合 →
 *   第二階段五招（十二連環、穿心掌、狂風連掌、金鐘罩、醉拳）→ 打到第三階段 → 閉關 →
 *   第三階段五招（亡命一擊、破功、狂風連掌、氣沉丹田、看破）→ 打死（戰敗）→ 等勝利畫面。
 * 每 80 毫秒記：師父那一格有沒有掛逐格畫布、畫布在換格嗎（像素雜湊）、靜態立繪是哪一張、框裡的特效畫布（幾張、不透明度、寬）、
 * 階段、閉關（invulnIn）、主角那一格有沒有逐格。輸出 <輸出夾>/<標籤>/timeline.json、summary.json、shots/*.jpg。
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const DIST = resolve(process.argv[2] ?? 'dist');
const OUT_ROOT = resolve(process.argv[3] ?? 'tmp-daxia');
const NET = process.argv[4] ?? 'fast';
const TAG = process.argv[5] ?? `daxia-${NET}`;
const DWELL = Number(process.env.DAXIA_DWELL_MS ?? (NET === 'slow' ? 0 : 3000));
const ATLAS_WAIT = Number(process.env.DAXIA_ATLAS_WAIT_MS ?? (NET === 'slow' ? 0 : 20000));
const SHOTS = process.env.DAXIA_SHOTS !== '0';
const OUT = join(OUT_ROOT, TAG);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'shots'), { recursive: true });

const server = await startServer(DIST, 'qiuqiu-tower');
await loadPlaywright();
const c = await newContext('daxia', `${TAG}-${process.pid}`.replace(/[^a-z0-9_-]/gi, '_'));
const { page } = c;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
if (NET === 'slow') {
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: (0.8e6) / 8, uploadThroughput: 750e3 / 8 });
}
// 大圖集的下載紀錄：師父的（side/daxia_*、fx/daxia_*）、主角的（motion/qiuqiu、companion）、其他魔物的
const atlasLog = [];
const byId = new Map();
cdp.on('Network.requestWillBeSent', (e) => {
  const m = /motion\/(side|fx|qiuqiu|companion[^/]*)\/([^?]+?)(?:-[A-Za-z0-9_-]{8})?\.webp/.exec(e.request.url);
  if (!m) return;
  const r = { url: `${m[1]}/${m[2]}`, sent: Date.now(), done: 0 };
  atlasLog.push(r); byId.set(e.requestId, r);
});
cdp.on('Network.loadingFinished', (e) => { const r = byId.get(e.requestId); if (r) r.done = Date.now(); });
cdp.on('Network.loadingFailed', (e) => { const r = byId.get(e.requestId); if (r) r.done = -Date.now(); });
const atlasDone = (name) => atlasLog.some((r) => r.url === name && r.done > 0);

const t0 = Date.now();
const sec = (t) => ((t - t0) / 1000).toFixed(1) + 's';
await bootRun(page, server.url, 'ninja', 'daxia-check');
// 第三關：改關數、重畫一次地圖（地圖畫出來時 netload-run.ts 的 preloadNextFights 會排師父的背景下載）
await page.evaluate(() => { const app = window.__app; app.run.act = 3; app.run.floor = 14; app.show('map'); });
const mapAt = Date.now();
if (DWELL > 0) await sleep(DWELL);

await page.evaluate(() => {
  window.__dx = { samples: [], marks: [] };
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
    const e = cs.enemies.find((x) => x.enemyId === 'tower_master'); if (!e) return;
    const unit = document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`);
    const box = unit?.querySelector('.sprite-box');
    const cv = box?.querySelector('canvas.enemy-motion');
    const img = box?.querySelector('img.sprite');
    const fx = [...(box?.querySelectorAll('canvas.fx-layer') ?? [])].map((f) => ({
      back: f.classList.contains('fx-back'), w: Math.round(parseFloat(f.style.width)), op: Number(getComputedStyle(f).opacity).toFixed(2),
      z: f.style.zIndex, pe: f.style.pointerEvents }));
    const r = box?.getBoundingClientRect();
    const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.5) : null;
    window.__dx.samples.push({
      t: Date.now(), hp: e.hp, phase: e.phase, dead: e.dead, invuln: e.invulnIn, csPhase: cs.phase,
      motion: !!box?.classList.contains('has-enemy-motion'), canvas: !!cv && cv.isConnected, hash: cv ? hashCanvas(cv) : 0,
      cw: cv ? Math.round(parseFloat(cv.style.width)) : 0,
      img: img ? (img.getAttribute('src') || '').replace(/^.*\//, '').replace(/-[A-Za-z0-9_-]{8}\.webp.*$/, '') : null,
      cls: unit ? [...unit.classList].filter((k) => /master|phase|seclud|dead|motion|fall/.test(k)).join(' ') : 'gone',
      shaken: !!document.querySelector('.combat.shaken'), flash: !!document.querySelector('.combat.phase-flash'),
      fx, hitSelf: !!(hit && unit && unit.contains(hit)),
      heroMotion: !!document.querySelector('.unit.player[data-seat="0"] .sprite-box.has-qiuqiu-motion'),
    });
  }, 80);
});
// 換階段的閃白、震動：類別只掛不到一秒，取樣可能剛好錯過，另外用 MutationObserver 記每一次掛上去的時間
await page.evaluate(() => {
  window.__dx.fxClass = [];
  new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target;
      if (!(el instanceof HTMLElement) || !el.classList.contains('combat')) continue;
      for (const k of ['shaken', 'phase-flash']) if (el.classList.contains(k)) window.__dx.fxClass.push({ t: Date.now(), k });
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
});
const mark = (what) => page.evaluate((w) => window.__dx.marks.push({ t: Date.now(), what: w }), what);
let shotNo = 0;
const shot = async (name) => {
  if (!SHOTS) return;
  shotNo += 1;
  await page.screenshot({ path: join(OUT, 'shots', `${String(shotNo).padStart(3, '0')}_${name}.jpg`), type: 'jpeg', quality: 82 }).catch(() => {});
};
const burst = async (name, n, gap) => { for (let i = 0; i < n; i++) { await sleep(gap); await shot(`${name}_${String(i).padStart(2, '0')}`); } };
async function waitAtlases(names, label) {
  if (!ATLAS_WAIT) return;
  const start = Date.now();
  while (Date.now() - start < ATLAS_WAIT && !names.every(atlasDone)) await sleep(250);
  await mark(`${label}：圖集${names.every(atlasDone) ? '到齊' : '沒到齊'}（等了 ${((Date.now() - start) / 1000).toFixed(1)} 秒）`);
  await sleep(1500);   // 解碼
}

await page.evaluate(() => {
  const app = window.__app; const orig = app.show.bind(app); let done = false;
  app.show = (nm, ...r) => {
    if (nm === 'combat' && app.cs && !done) {
      done = true; const p = app.cs.players[0]; let u = 88001;
      p.hand.splice(0, p.hand.length, ...['sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo'].map((id) => ({ uid: u++, cardId: id, upgraded: false })));
      p.drawPile.splice(0, p.drawPile.length, ...Array.from({ length: 40 }, () => ({ uid: u++, cardId: 'sanjo', upgraded: false })));
      p.energy = 9; p.maxHp = 999; p.hp = 999;
    }
    return orig(nm, ...r);
  };
  app.run.flags['tut:combat'] = true;
  app.startFight('tower_master', false);   // 不播關主開場劇情（直接進戰鬥）；勝利後的流程照塔主池走
});
await mark('開打');
const fightAt = Date.now();
await waitScreen(page, 'combat', 180000);
const CAN_ACT = () => {
  const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false;
  const b = document.querySelector('.end-turn'); if (!b || b.disabled || b.classList.contains('disabled')) return false;
  if (document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay, .slide-overlay')) return false;
  return !document.querySelector('.hand .card.flying');
};
// 塔主開場對話：點掉
for (let i = 0; i < 40; i++) {
  if (await page.evaluate(CAN_ACT)) break;
  await page.mouse.click(640, 600).catch(() => {});
  await sleep(500);
}
await page.waitForFunction(CAN_ACT, null, { timeout: 120000 });
await mark('待機（第一階段）');
await sleep(1500);
await shot('p1_待機');

const P1 = ['side/daxia_p1-guard', 'side/daxia_p1-headbutt', 'side/daxia_p1-palm', 'side/daxia_p1-shout', 'side/daxia_p1-to_p2', 'fx/daxia_black_qi'];
const P2 = ['side/daxia_p2-palm', 'side/daxia_p2-combo', 'side/daxia_p2-guard', 'side/daxia_p2-flurry', 'side/daxia_p2-to_p3', 'fx/daxia_seclude_aura'];
const P3 = ['side/daxia_p3-lunge', 'side/daxia_p3-doublepalm', 'side/daxia_p3-flurry', 'side/daxia_p3-meditate', 'side/daxia_p3-defeat'];

async function endTurn(label, shots = 12, gap = 160) {
  await page.evaluate(() => { const p = window.__app.cs.players[0]; p.hp = 999; p.energy = 9; });
  const move = await page.evaluate(() => window.__app.cs.enemies.find((x) => x.enemyId === 'tower_master')?.move?.label ?? '');
  await mark(`${label}（${move}）`);
  await page.click('.end-turn');
  await burst(`${label}_${move}`, shots, gap);
  await page.waitForFunction(CAN_ACT, null, { timeout: 90000 }).catch(() => {});
  await mark(`${label}完`);
  await sleep(500);
}
async function hit(label) {
  await page.evaluate(() => { window.__app.cs.players[0].energy = 9; });
  const pt = await page.evaluate(({ POINT_FN }) => { const f = eval(POINT_FN); const n = document.querySelector('.hand .card'); return n ? f(n) : null; }, { POINT_FN });
  await mark(label);
  if (!pt) { await mark('沒有牌可出'); return; }
  await page.mouse.click(pt.x, pt.y); await sleep(200);
  const tp = await page.evaluate(({ POINT_FN }) => {
    const f = eval(POINT_FN); const e = window.__app.cs.enemies.find((x) => x.enemyId === 'tower_master');
    const node = document.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite-box`); return node ? f(node) : null;
  }, { POINT_FN });
  if (tp) await page.mouse.click(tp.x, tp.y);
  await page.mouse.move(640, 60);
}
const setBoss = (patch) => page.evaluate((p) => {
  const e = window.__app.cs.enemies.find((x) => x.enemyId === 'tower_master'); Object.assign(e, p);
  if (e.statuses) for (const k of Object.keys(e.statuses)) if (k === '反彈' || k === '隱身') delete e.statuses[k];
}, patch);

// ---- 第一階段 ----
await waitAtlases(P1, '第一階段出招前');
for (let i = 1; i <= 5; i++) await endTurn(`p1_出招${i}`);
// ---- 換第二階段 ----
await waitAtlases([...P1, ...P2], '換第二階段前');
await setBoss({ hp: 3, block: 0 });
await hit('換第二階段');
await burst('p1_to_p2', 22, 110);
await page.waitForFunction(CAN_ACT, null, { timeout: 90000 }).catch(() => {});
await sleep(600);
await shot('p2_閉關待機');
await endTurn('p2_閉關回合', 10, 200);
await shot('p2_待機');
for (let i = 1; i <= 5; i++) await endTurn(`p2_出招${i}`);
// ---- 換第三階段 ----
await waitAtlases([...P2, ...P3], '換第三階段前');
await setBoss({ hp: 3, block: 0 });
await hit('換第三階段');
await burst('p2_to_p3', 22, 110);
await page.waitForFunction(CAN_ACT, null, { timeout: 90000 }).catch(() => {});
await sleep(600);
await shot('p3_閉關待機');
await endTurn('p3_閉關回合', 10, 200);
await shot('p3_待機');
for (let i = 1; i <= 5; i++) await endTurn(`p3_出招${i}`);
// ---- 打死 ----
await waitAtlases(P3, '打死前');
await setBoss({ hp: 1, block: 0 });
await hit('打死');
await burst('p3_戰敗', 34, 140);
await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen !== 'combat', null, { timeout: 30000 }).catch(() => {});
await mark('離開戰鬥畫面');
await sleep(800);
await shot('戰後');

const { samples, marks, fxClass } = await page.evaluate(() => window.__dx);
const segs = [];
for (let i = 0; i < marks.length; i++) {
  const a = marks[i].t, b = marks[i + 1]?.t ?? Infinity;
  const ss = samples.filter((s) => s.t >= a && s.t < b);
  let changes = 0; for (let k = 1; k < ss.length; k++) if (ss[k].canvas && ss[k].hash !== ss[k - 1].hash) changes++;
  const fxMax = Math.max(0, ...ss.map((s) => s.fx.length));
  segs.push({ seg: marks[i].what, at: sec(a), dur: ((Math.min(b, ss.at(-1)?.t ?? a) - a) / 1000).toFixed(1), samples: ss.length,
    canvasPct: ss.length ? Math.round(100 * ss.filter((s) => s.canvas).length / ss.length) : 0, frameChanges: changes,
    canvasW: [...new Set(ss.filter((s) => s.canvas).map((s) => s.cw))].join(','),
    imgs: [...new Set(ss.map((s) => s.img))].join(','), cls: [...new Set(ss.map((s) => s.cls))].join('|'),
    phase: [...new Set(ss.map((s) => s.phase))].join(','), invuln: [...new Set(ss.map((s) => s.invuln))].join(','),
    fxMax, fxOpacities: [...new Set(ss.flatMap((s) => s.fx.map((f) => `${f.back ? 'b' : 'f'}${f.w}@${f.op}`)))].slice(0, 12).join(' '),
    fxZ: [...new Set(ss.flatMap((s) => s.fx.map((f) => `${f.z}/${f.pe}`)))].join(','),
    shaken: ss.some((s) => s.shaken), hitSelfPct: ss.length ? Math.round(100 * ss.filter((s) => s.hitSelf || s.dead).length / ss.length) : 0 });
}
const daxia = atlasLog.filter((r) => /daxia/.test(r.url));
const summary = {
  net: NET, dist: DIST, dwellMs: DWELL, atlasWaitMs: ATLAS_WAIT, mapAt: sec(mapAt), fightAt: sec(fightAt), shots: shotNo, segs,
  shakeFlash: [...new Set(fxClass.map((x) => `${x.k}@${sec(x.t)}`))],
  daxiaAtlases: daxia.map((x) => `${x.url} 送出 ${sec(x.sent)} 到齊 ${x.done > 0 ? sec(x.done) : x.done < 0 ? '失敗' : '沒到'}`),
  heroAtlases: atlasLog.filter((r) => /^(qiuqiu|companion)/.test(r.url)).map((x) => `${x.url} 送出 ${sec(x.sent)} 到齊 ${x.done > 0 ? sec(x.done) : x.done < 0 ? '失敗' : '沒到'}`),
  otherAtlases: atlasLog.filter((r) => /^(side|fx)\//.test(r.url) && !/daxia/.test(r.url)).map((x) => `${x.url} 送出 ${sec(x.sent)} 到齊 ${x.done > 0 ? sec(x.done) : x.done < 0 ? '失敗' : '沒到'}`),
  logs: c.logs.slice(0, 30),
};
writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ marks, samples }, null, 1));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, segs: summary.segs.map((s) => `${s.at} ${s.seg} 畫布${s.canvasPct}% 換格${s.frameChanges} 立繪[${s.imgs}] 特效${s.fxMax}[${s.fxOpacities}] 階段${s.phase} 閉關${s.invuln}${s.shaken ? ' 震' : ''}`) }, null, 1));
await c.close();
server.close?.();
process.exit(0);
