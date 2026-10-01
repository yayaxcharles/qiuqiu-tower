#!/usr/bin/env node
/*
 * 招式對片段＋變身實戰連拍（2026-10-01）：無頭 Chrome、獨立設定資料夾（visual-gate/lib/browser.mjs）、只開本機網址。
 * 直接開打一隻塔主，指定牠下一招（照 enemies.ts 的招式），結束回合讓牠出手，每 120 毫秒拍一張；
 * 換階段那一刻也連拍。另外在頁面裡記每一次畫上魔物逐格畫布的是哪一張圖集（看寬高對 pack_side_motion.report.json），
 * 每 80 毫秒記魔物那一格有沒有掛逐格畫布、靜態立繪是哪一張（看變身時有沒有閃原圖）。
 *
 *   node tools/perf/motion_map_check.mjs <dist 資料夾> <輸出夾> <orange_king|frog_daimyo|tanuki_lord|roomba_king> <fast|slow> [標籤]
 * slow＝0.8 Mbps／300 毫秒、冷快取（新的設定資料夾）；fast＝不限速。
 * 環境變數 MM_WAIT_MS：開打後等多久才讓牠出第一招（預設 4000；slow 想看「圖還沒到」就設 0）。
 * MM_POISON＝1：牠出手前身上帶毒（回合開頭先扣血）。MM_BLOCK＝這幾張圖集一律下載失敗（看退回預設）。
 * MM_DWELL_MS：開打前先在地圖停多久（慢網路比圖集下載順序用）。
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const DIST = resolve(process.argv[2] ?? 'dist');
const OUT_ROOT = resolve(process.argv[3] ?? 'tmp-motionmap');
const BOSS = process.argv[4] ?? 'orange_king';
const NET = process.argv[5] ?? 'fast';
const TAG = process.argv[6] ?? `${BOSS}-${NET}`;
const WAIT = Number(process.env.MM_WAIT_MS ?? 4000);
const POISON = process.env.MM_POISON === '1';
const OUT = join(OUT_ROOT, TAG);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 圖集寬高 → 名字（pack_side_motion.report.json），認畫上去的是哪一段
const REPORT = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'pack_side_motion.report.json'), 'utf8'));
const ATLAS = new Map();
for (const [kind, acts] of Object.entries(REPORT.kinds)) {
  for (const [act, v] of Object.entries(acts)) if (v && v.atlas) ATLAS.set(v.atlas.join('x'), `${kind}.${act}(${v.src})`);
}

/* 每隻要演的段落：force＝指定下一招（招式物件照 enemies.ts），phaseHp＝打到第二階段前把血設成多少 */
const PLAN = {
  orange_king: { act: 1, steps: [
    { force: { intent: 'attack', label: '肚皮壓', effects: [{ kind: 'damage', amount: 18 }] }, name: '01_肚皮壓' },
    { force: { intent: 'attack', label: '丟魚骨頭', effects: [{ kind: 'damage', amount: 6, times: 2 }] }, name: '02_丟魚骨頭_預設出招' },
    { phaseHp: 58, name: '03_變身' },
    { force: { intent: 'attack', label: '泰山壓頂', effects: [{ kind: 'damage', amount: 27, pierce: true }] }, name: '04_二階_泰山壓頂_預設出招' },
    { kill: true, name: '05_打死_二階爆炸' },
  ] },
  frog_daimyo: { act: 3, steps: [
    { force: { intent: 'attack', label: '跳壓', effects: [{ kind: 'damage', amount: 20, pierce: true }] }, name: '01_跳壓' },
    { force: { intent: 'attack', label: '舌捲', effects: [{ kind: 'damage', amount: 6, times: 3 }] }, name: '02_舌捲_預設出招' },
    { phaseHp: 58, name: '03_換階段_沒有變身片段' },
    { force: { intent: 'attack', label: '重跳壓', effects: [{ kind: 'damage', amount: 26 }] }, name: '04_二階_重跳壓' },
    { force: { intent: 'attack', label: '大舌捲', effects: [{ kind: 'damage', amount: 15 }] }, name: '05_二階_大舌捲_預設出招' },
  ] },
  tanuki_lord: { act: 2, steps: [
    { force: { intent: 'attack', label: '醉八仙', effects: [{ kind: 'damage', amount: 10, times: 3 }] }, name: '01_醉八仙_預設出招' },
    { phaseHp: 133, name: '02_變身' },
    { force: { intent: 'attack', label: '醉拳真髓', effects: [{ kind: 'damage', amount: 10, times: 3 }] }, name: '03_二階_醉拳真髓_預設出招' },
    { kill: true, name: '04_打死_二階爆炸' },
  ] },
  roomba_king: { act: 2, steps: [
    { force: { intent: 'debuff', label: '吸走', effects: [{ kind: 'discardRandomHand', n: 2 }] }, name: '01_吸走' },
    { force: { intent: 'attack', label: '滾刷', effects: [{ kind: 'damage', amount: 5, times: 4 }] }, name: '02_滾刷_預設出招' },
  ] },
}[BOSS];
if (!PLAN) throw new Error(`沒有這隻的劇本：${BOSS}`);

const server = await startServer(DIST, 'qiuqiu-tower');
await loadPlaywright();
const c = await newContext('motionmap', `${TAG}-${process.pid}`.replace(/[^a-z0-9_-]/gi, '_'));
const { page } = c;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
if (NET === 'slow') {
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: (0.8e6) / 8, uploadThroughput: 750e3 / 8 });
}
// MM_BLOCK＝逗號分隔的圖集名（例：orange_king-slam,orange_king-rage）：這幾張一律下載失敗，看「片段圖集沒到」時退回預設、不卡住
const BLOCK = (process.env.MM_BLOCK ?? '').split(',').filter(Boolean);
if (BLOCK.length) await cdp.send('Network.setBlockedURLs', { urls: BLOCK.map((name) => `*motion/side/${name}*`) });
const t0 = Date.now();
const atlasLog = [];
const atlasById = new Map();
// 所有請求（慢網路時看大檔那一條被誰佔著）：網址 → 送出、到齊時間
const allReq = new Map();
cdp.on('Network.requestWillBeSent', (e) => { allReq.set(e.requestId, { url: e.request.url.replace(/^.*\/(assets|qiuqiu-tower)\//, ''), sent: Date.now(), done: 0 }); });
cdp.on('Network.loadingFinished', (e) => { const r = allReq.get(e.requestId); if (r) r.done = Date.now(); });
const pendingNow = () => [...allReq.values()].filter((r) => !r.done).map((r) => `${r.url.slice(0, 80)}（${((Date.now() - r.sent) / 1000).toFixed(0)} 秒）`);
cdp.on('Network.requestWillBeSent', (e) => {
  if (!/motion\/side\//.test(e.request.url)) return;
  const r = { url: e.request.url.replace(/^.*motion\/side\//, '').replace(/-[A-Za-z0-9_-]{8}\.webp.*$/, ''), sent: Date.now(), done: 0 };
  atlasLog.push(r); atlasById.set(e.requestId, r);
});
cdp.on('Network.loadingFinished', (e) => { const r = atlasById.get(e.requestId); if (r) r.done = Date.now(); });
cdp.on('Network.loadingFailed', (e) => { const r = atlasById.get(e.requestId); if (r) r.done = -Date.now(); });

// 記每一次畫上魔物逐格畫布的圖集寬高（ImageBitmap 或 <img> 都有寬高）
await page.addInitScript(() => {
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  window.__mmDraws = [];
  CanvasRenderingContext2D.prototype.drawImage = function (src, ...rest) {
    try {
      if (this.canvas?.classList?.contains('enemy-motion')) {
        const w = src.naturalWidth || src.width; const h = src.naturalHeight || src.height;
        const last = window.__mmDraws[window.__mmDraws.length - 1];
        const key = `${w}x${h}`;
        if (!last || last.key !== key) window.__mmDraws.push({ t: Date.now(), key, n: 1 }); else last.n++;
      }
    } catch { /* */ }
    return orig.call(this, src, ...rest);
  };
});

const CAN_ACT = () => {
  const cs = window.__app?.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false;
  const b = document.querySelector('.end-turn'); if (!b || b.disabled || b.classList.contains('disabled')) return false;
  if (document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay, .slide-overlay')) return false;
  return !document.querySelector('.hand .card.flying');
};

await bootRun(page, server.url, 'ninja', `motionmap-${BOSS}`);
// MM_DWELL_MS：開局後先在地圖停多久才開打（模擬一路打上來，地圖與主角的圖先下載完；慢網路比下載順序用）
if (Number(process.env.MM_DWELL_MS ?? 0) > 0) await sleep(Number(process.env.MM_DWELL_MS));
await page.evaluate((BOSS) => {
  window.__bx = { samples: [], marks: [] };
  setInterval(() => {
    const cs = window.__app?.cs; if (!cs) return;
    const e = cs.enemies.find((x) => x.enemyId === BOSS); if (!e) return;
    const unit = document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`);
    const box = unit?.querySelector('.sprite-box');
    const img = box?.querySelector('img.sprite');
    window.__bx.samples.push({
      t: Date.now(), hp: e.hp, phase: e.phase, dead: e.dead,
      motion: !!box?.classList.contains('has-enemy-motion'), canvas: !!box?.querySelector('canvas.enemy-motion'),
      img: img ? (img.getAttribute('src') || '').replace(/^.*\//, '').replace(/-[A-Za-z0-9_-]{8}\.webp.*$/, '').replace(/\?.*$/, '') : null,
    });
  }, 80);
}, BOSS);
const mark = (what) => page.evaluate((w) => window.__bx.marks.push({ t: Date.now(), what: w }), what);
const shots = [];
const shot = async (name) => {
  const clip = await page.evaluate((BOSS) => {
    const e = window.__app.cs.enemies.find((x) => x.enemyId === BOSS);
    const n = document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`) || document.querySelector('.enemies');
    const r = n.getBoundingClientRect();
    return { x: Math.max(0, r.left - 380), y: Math.max(0, r.top - 150), width: r.width + 520, height: r.height + 230 };
  }, BOSS).catch(() => null);
  const file = join(OUT, `${name}.jpg`);
  const x = clip ? Math.round(clip.x) : 0; const y = clip ? Math.round(clip.y) : 0;
  await page.screenshot({ path: file, type: 'jpeg', quality: 82,
    ...(clip ? { clip: { x, y, width: Math.min(1280 - x, Math.round(clip.width)), height: Math.min(720 - y, Math.round(clip.height)) } } : {}) });
  shots.push({ name, t: Date.now() });
};

await page.evaluate(({ BOSS, act }) => {
  const app = window.__app; const orig = app.show.bind(app); let done = false;
  app.show = (nm, ...r) => {
    if (nm === 'combat' && app.cs && !done) {
      done = true; const p = app.cs.players[0]; let u = 88001;
      p.hand.splice(0, p.hand.length, ...Array.from({ length: 5 }, () => ({ uid: u++, cardId: 'sanjo', upgraded: false })));
      p.drawPile.splice(0, p.drawPile.length, ...Array.from({ length: 30 }, () => ({ uid: u++, cardId: 'sanjo', upgraded: false })));
      p.energy = 9; p.maxHp = 999; p.hp = 999;
    }
    return orig(nm, ...r);
  };
  const r = app.run; r.act = act; r.floor = 9; r.flags['tut:combat'] = true;
  app.startFight(BOSS, false);
}, { BOSS, act: PLAN.act });
await mark('開打');
await waitScreen(page, 'combat', 180000);
await page.waitForFunction(CAN_ACT, null, { timeout: 180000 });
await mark('可以出牌');
await sleep(WAIT);
const pendingAtFirstMove = pendingNow();
const requestsBeforeFirstMove = allReq.size;
await shot('00_待機');

async function burst(prefix, ms, gap = 120) {
  const start = Date.now(); let i = 0;
  while (Date.now() - start < ms) { await shot(`${prefix}_${String(i).padStart(2, '0')}`); i++; await sleep(gap); }
}
async function forceAndEndTurn(step) {
  await page.evaluate(({ BOSS, move, poison }) => {
    const cs = window.__app.cs; cs.players[0].hp = 999;
    const e = cs.enemies.find((x) => x.enemyId === BOSS); e.move = move; e.queuedMove = undefined;
    // 這一拍要牠真的出手：拿掉會讓牠跳過的狀態
    if (e.statuses) for (const k of ['定身', '沉睡', '暈眩']) delete e.statuses[k];
    // MM_POISON＝1：牠身上帶毒（回合開頭先扣血、同一步出手；連線菲菲的毒針袋就是這樣）
    if (poison) { e.statuses ||= {}; e.statuses['中毒'] = 3; }
  }, { BOSS, move: step.force, poison: POISON });
  await mark(step.name);
  await page.click('.end-turn');
  await sleep(150);
  await burst(step.name, 2200);
  await page.waitForFunction(CAN_ACT, null, { timeout: 90000 }).catch(() => {});
  await mark(step.name + '完');
  await sleep(500);
}
async function hitToPhase(step) {
  await page.evaluate(({ BOSS, hp }) => {
    const cs = window.__app.cs; cs.players[0].energy = 9;
    const e = cs.enemies.find((x) => x.enemyId === BOSS); e.hp = hp; e.block = 0;
    // 打死那一下：反彈拿掉（不然球球被刺）；叫出來的小弟一起清掉，打死魔王就收場
    if (e.statuses) for (const k of ['縮殼', '隱身', ...(hp === 1 ? ['反彈'] : [])]) delete e.statuses[k];
    if (hp === 1) for (const x of cs.enemies) if (x !== e) { x.hp = 0; x.dead = true; }
  }, { BOSS, hp: step.phaseHp });
  const pt = await page.evaluate(({ POINT_FN }) => { const f = eval(POINT_FN); const n = document.querySelector('.hand .card'); return n ? f(n) : null; }, { POINT_FN });
  await mark(step.name);
  if (!pt) { await mark('沒有牌可出'); return; }
  await page.mouse.click(pt.x, pt.y); await sleep(200);
  const tp = await page.evaluate(({ POINT_FN, BOSS }) => {
    const f = eval(POINT_FN); const e = window.__app.cs.enemies.find((x) => x.enemyId === BOSS);
    const node = document.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite-box`); return node ? f(node) : null;
  }, { POINT_FN, BOSS });
  if (tp) await page.mouse.click(tp.x, tp.y);
  await burst(step.name, step.phaseHp === 1 ? 4000 : 3000, step.phaseHp === 1 ? 150 : 120);
  if (step.phaseHp === 1) { await mark(step.name + '完'); return; }
  await page.waitForFunction(CAN_ACT, null, { timeout: 90000 }).catch(() => {});
  await mark(step.name + '完');
  await sleep(800);
  await shot(`${step.name}_後待機`);
}

for (const step of PLAN.steps) {
  if (step.kill) await hitToPhase({ ...step, phaseHp: 1 });
  else if (step.phaseHp) await hitToPhase(step); else await forceAndEndTurn(step);
}
await mark('結束');

const { samples, marks } = await page.evaluate(() => window.__bx);
const draws = await page.evaluate(() => window.__mmDraws);
const sec = (t) => ((t - t0) / 1000).toFixed(2) + 's';
const segs = [];
for (let i = 0; i < marks.length; i++) {
  const a = marks[i].t, b = marks[i + 1]?.t ?? Infinity;
  const ss = samples.filter((s) => s.t >= a && s.t < b);
  const ds = draws.filter((d) => d.t >= a && d.t < b);
  // 換階段那一刻：第一筆第二階段的取樣有沒有掛畫布（沒掛＝閃了一下第二階段立繪）
  const firstP2 = ss.findIndex((s, k) => k > 0 && s.phase > ss[k - 1].phase);
  segs.push({ seg: marks[i].what, at: sec(a), samples: ss.length,
    canvasPct: ss.length ? Math.round(100 * ss.filter((s) => s.canvas && s.motion).length / ss.length) : 0,
    atlasesDrawn: [...new Set(ds.map((d) => ATLAS.get(d.key) ?? d.key))],
    imgs: [...new Set(ss.map((s) => s.img))].join(','), phase: [...new Set(ss.map((s) => s.phase))].join(','),
    phaseFlip: firstP2 >= 0 ? { canvasAtFlip: ss[firstP2].canvas && ss[firstP2].motion,
      // 換階段後：掛著畫布的連續幾毫秒、之後交還立繪時靜態圖是哪一張
      canvasMsAfterFlip: (() => { let k = firstP2; while (k < ss.length && ss[k].canvas) k++; return (ss[Math.min(k, ss.length - 1)].t - ss[firstP2].t); })(),
      imgAfter: ss.at(-1)?.img } : undefined });
}
const summary = { boss: BOSS, net: NET, waitMs: WAIT, pendingAtFirstMove: pendingAtFirstMove.slice(0, 30), requestsBeforeFirstMove, segs,
  atlasRequests: atlasLog.map((x) => `${x.url} 送出 ${sec(x.sent)} 到齊 ${x.done > 0 ? sec(x.done) : x.done < 0 ? '失敗' : '沒到'}`),
  logs: c.logs.slice(0, 20) };
writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ marks, samples, draws, shots }, null, 1));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
await c.close();
server.close?.();
process.exit(0);
