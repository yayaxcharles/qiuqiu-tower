#!/usr/bin/env node
/*
 * 魔物特效圖層＋一階倒下＋橘皮大王二階新片段的實戰連拍（2026-10-01）。
 * 無頭 Chrome、獨立設定資料夾（visual-gate/lib/browser.mjs）、只開本機網址；截圖不帶縮放。
 *
 *   node tools/perf/fx_layer_check.mjs <dist 資料夾> <輸出夾> <劇本> <fast|slow> [標籤]
 * 劇本：iron_claw_p1kill、frog_daimyo_p1kill、orange_king_p1kill、tanuki_lord_p1kill（一刀從第一階段打死）、
 *       iron_claw_laser（打到第二階段 → 全開 → 打死二階）、orange_king_p2（打到第二階段 → 龍捲滾 → 蓄力 → 打死）、
 *       lantern_ghost_fire（燈籠妖吐火）、roomba_king_kill（掃地機王打死）
 * slow＝0.8 Mbps／300 毫秒、冷快取（新的設定資料夾）。環境變數 FX_DWELL_MS：開打前先在地圖停多久（慢網路「一路打上來」用 120000）。
 * FX_ATLAS_WAIT_MS：每一步之前最多等這一步要用的圖集多久（預設 fast 8000、slow 120000）；沒等到就照打（看退回）。
 *
 * 每 80 毫秒記：魔物那一格有沒有掛逐格畫布、框裡有幾張特效畫布（前／後）、主角那一格有幾張特效畫布、
 * 特效畫布的 z-index 與 pointer-events、名字血條的 z-index、魔物中心點 elementFromPoint 是誰（不擋點擊）。
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../visual-gate/lib/server.mjs';
import { loadPlaywright, newContext, bootRun, waitScreen, POINT_FN } from '../visual-gate/lib/browser.mjs';
import { sleep } from '../visual-gate/lib/util.mjs';

const DIST = resolve(process.argv[2] ?? 'dist');
const OUT_ROOT = resolve(process.argv[3] ?? 'tmp-fxlayer');
const PLAN_NAME = process.argv[4] ?? 'iron_claw_p1kill';
const NET = process.argv[5] ?? 'fast';
const TAG = process.argv[6] ?? `${PLAN_NAME}-${NET}`;
const DWELL = Number(process.env.FX_DWELL_MS ?? 0);
const ATLAS_WAIT = Number(process.env.FX_ATLAS_WAIT_MS ?? (NET === 'slow' ? 120000 : 8000));
const OUT = join(OUT_ROOT, TAG);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const REPORT = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'pack_side_motion.report.json'), 'utf8'));
const ATLAS = new Map();
for (const [kind, acts] of Object.entries(REPORT.kinds)) for (const [act, v] of Object.entries(acts)) if (v && v.atlas) ATLAS.set(v.atlas.join('x'), `${kind}.${act}`);

const atk = (label, amount = 12) => ({ intent: 'attack', label, effects: [{ kind: 'damage', amount }] });
const PLANS = {
  iron_claw_p1kill: { boss: 'iron_claw', act: 1, steps: [{ kill: true, need: ['side/iron_claw-down', 'fx/blast_large', 'fx/blast_small'], name: '01_一階打死' }] },
  frog_daimyo_p1kill: { boss: 'frog_daimyo', act: 3, steps: [{ kill: true, need: ['side/frog_daimyo-down'], name: '01_一階打死' }] },
  orange_king_p1kill: { boss: 'orange_king', act: 1, steps: [{ kill: true, need: ['side/orange_king-down'], name: '01_一階打死' }] },
  tanuki_lord_p1kill: { boss: 'tanuki_lord', act: 2, steps: [{ kill: true, need: ['side/tanuki_lord-down'], name: '01_一階打死' }] },
  iron_claw_laser: { boss: 'iron_claw', act: 1, steps: [
    { phaseHp: 58, name: '01_換階段' },
    { force: atk('全開'), need: ['side/iron_claw-laser_p2', 'fx/blast_small'], name: '02_二階全開_雷射命中', wide: true },
    { kill: true, need: ['side/iron_claw-down_p2', 'fx/blast_large'], name: '03_二階打死' },
  ] },
  orange_king_p2: { boss: 'orange_king', act: 1, steps: [
    { phaseHp: 58, name: '01_換階段' },
    { force: { intent: 'attack', label: '龍捲滾', effects: [{ kind: 'damage', amount: 12, times: 2 }] }, need: ['side/orange_king-roll_p2'], name: '02_二階龍捲滾' },
    { force: { intent: 'special', label: '蓄力', effects: [{ kind: 'chargeNext' }] }, need: ['side/orange_king-burst_p2'], name: '03_二階蓄力' },
    { kill: true, need: ['side/orange_king-down_p2'], name: '04_二階打死' },
  ] },
  lantern_ghost_fire: { boss: 'lantern_ghost', act: 1, steps: [
    { force: atk('吐火', 13), need: ['side/lantern_ghost-attack', 'fx/blast_small'], name: '01_吐火_火球命中', wide: true },
    { force: atk('撲上來', 6), need: [], name: '02_撲上來_對照不放', wide: true },
  ] },
  roomba_king_kill: { boss: 'roomba_king', act: 2, steps: [{ kill: true, need: ['side/roomba_king-down', 'fx/blast_large'], name: '01_打死' }] },
  // 旁邊有別隻（看變寬的畫布、特效有沒有蓋到旁邊魔物的名字、血條、意圖牌，擋不擋點擊）
  tanuki_lord_kids: { boss: 'tanuki_lord', act: 2, steps: [
    { force: { intent: 'summon', label: '喚小弟', effects: [{ kind: 'summon', enemyId: 'tanuki_kid', n: 2, max: 3 }] }, need: [], name: '01_喚小弟' },
    { kill: true, keep: true, need: ['side/tanuki_lord-down'], name: '02_一階打死_小弟還在' },
  ] },
  roomba_king_brooms: { boss: 'roomba_king', act: 2, steps: [
    { force: { intent: 'summon', label: '放出小掃把', effects: [{ kind: 'summon', enemyId: 'mini_broom', n: 2 }] }, need: [], name: '01_放出小掃把' },
    { kill: true, keep: true, need: ['side/roomba_king-down', 'fx/blast_large'], name: '02_打死_小掃把還在' },
  ] },
  iron_claw_p1kill_keep: { boss: 'iron_claw', act: 1, steps: [{ kill: true, keep: true, need: ['side/iron_claw-down', 'fx/blast_large', 'fx/blast_small'], name: '01_一階打死' }] },
};
const PLAN = PLANS[PLAN_NAME];
if (!PLAN) throw new Error(`沒有這個劇本：${PLAN_NAME}`);
const BOSS = PLAN.boss;

const server = await startServer(DIST, 'qiuqiu-tower');
await loadPlaywright();
const c = await newContext('fxlayer', `${TAG}-${process.pid}`.replace(/[^a-z0-9_-]/gi, '_'));
const { page } = c;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
if (NET === 'slow') {
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: (0.8e6) / 8, uploadThroughput: 750e3 / 8 });
}
const t0 = Date.now();
const sec = (t) => ((t - t0) / 1000).toFixed(1) + 's';
// 大圖集（魔物逐格、特效、主角逐格）：網址 → 送出、到齊時間
const atlasLog = [];
const atlasById = new Map();
cdp.on('Network.requestWillBeSent', (e) => {
  const m = /motion\/(side|fx|qiuqiu)\/([^?]*?)(-[A-Za-z0-9_-]{8})?\.webp/.exec(e.request.url);
  if (!m) return;
  const r = { url: `${m[1]}/${m[2]}`, sent: Date.now(), done: 0 };
  atlasLog.push(r); atlasById.set(e.requestId, r);
});
cdp.on('Network.loadingFinished', (e) => { const r = atlasById.get(e.requestId); if (r) r.done = Date.now(); });
cdp.on('Network.loadingFailed', (e) => { const r = atlasById.get(e.requestId); if (r) r.done = -Date.now(); });
const atlasDone = (name) => atlasLog.some((r) => r.url === name && r.done > 0);

// 特效畫布每一次畫的是哪一張圖集（寬高）
await page.addInitScript(() => {
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  window.__fxDraws = [];
  window.__mmDraws = [];
  CanvasRenderingContext2D.prototype.drawImage = function (src, ...rest) {
    try {
      const cls = this.canvas?.classList;
      const w = src.naturalWidth || src.width; const h = src.naturalHeight || src.height; const key = `${w}x${h}`;
      const list = cls?.contains('fx-layer') ? window.__fxDraws : cls?.contains('enemy-motion') ? window.__mmDraws : null;
      if (list) { const last = list[list.length - 1]; if (!last || last.key !== key) list.push({ t: Date.now(), key, n: 1 }); else last.n++; }
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

await bootRun(page, server.url, 'ninja', `fxlayer-${PLAN_NAME}`);
if (DWELL > 0) await sleep(DWELL);
await page.evaluate((BOSS) => {
  window.__bx = { samples: [], marks: [] };
  setInterval(() => {
    const cs = window.__app?.cs; if (!cs) return;
    const e = cs.enemies.find((x) => x.enemyId === BOSS); if (!e) return;
    const unit = document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`);
    const box = unit?.querySelector('.sprite-box');
    const hero = document.querySelector('.unit.player[data-seat="0"] .sprite-box');
    const fx = [...(box?.querySelectorAll('canvas.fx-layer') ?? [])];
    const heroFx = [...(hero?.querySelectorAll('canvas.fx-layer') ?? [])];
    const cv = box?.querySelector('canvas.enemy-motion');
    const name = unit?.querySelector('.name');
    let hitTarget = null;
    if (box) {
      const r = box.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.6);
      hitTarget = el ? (el.closest('.unit.enemy') === unit ? 'boss' : el.className?.baseVal ?? el.className) : null;
    }
    window.__bx.samples.push({
      t: Date.now(), hp: e.hp, phase: e.phase, dead: e.dead,
      motion: !!box?.classList.contains('has-enemy-motion'), canvas: !!cv, canvasW: cv ? Math.round(cv.getBoundingClientRect().width) : 0,
      fx: fx.map((f) => `${f.classList.contains('fx-back') ? '後' : '前'}z${getComputedStyle(f).zIndex}/${getComputedStyle(f).pointerEvents}/${Math.round(f.getBoundingClientRect().width)}`),
      heroFx: heroFx.map((f) => `z${getComputedStyle(f).zIndex}/${getComputedStyle(f).pointerEvents}/${Math.round(f.getBoundingClientRect().width)}`),
      nameZ: name ? getComputedStyle(name).zIndex : null, hitTarget,
      heroHp: cs.players[0]?.hp,
    });
  }, 80);
}, BOSS);
const mark = (what) => page.evaluate((w) => window.__bx.marks.push({ t: Date.now(), what: w }), what);
const shot = async (name) => {
  // 整個戰場（魔物、主角、名字、血條、意圖牌都在裡面）；截圖不帶縮放
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82, clip: { x: 0, y: 40, width: 1280, height: 450 } });
};
async function burst(prefix, ms, gap = 140) {
  const start = Date.now(); let i = 0;
  while (Date.now() - start < ms) { await shot(`${prefix}_${String(i).padStart(2, '0')}`); i++; await sleep(gap); }
}
async function waitAtlases(names, label) {
  const start = Date.now();
  while (Date.now() - start < ATLAS_WAIT && !names.every(atlasDone)) await sleep(250);
  const ok = names.every(atlasDone);
  await mark(`${label}：圖集${ok ? '到齊' : '沒到齊'}（等了 ${((Date.now() - start) / 1000).toFixed(1)} 秒）`);
  if (names.length) await sleep(1200);   // 解碼
  return ok;
}

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
await waitScreen(page, 'combat', 240000);
await page.waitForFunction(CAN_ACT, null, { timeout: 240000 });
await mark('可以出牌');
await sleep(1500);
await shot('00_待機');

async function forceAndEndTurn(step) {
  await page.evaluate(({ BOSS, move }) => {
    const cs = window.__app.cs; cs.players[0].hp = 999; cs.players[0].block = 0;
    for (const k of ['隱身', '潛水']) delete cs.players[0].statuses?.[k];
    const e = cs.enemies.find((x) => x.enemyId === BOSS); e.move = move; e.queuedMove = undefined;
    if (e.statuses) for (const k of ['定身', '沉睡', '暈眩']) delete e.statuses[k];
    // 同一場其他魔物這一拍不出手（只看這一隻）
    for (const x of cs.enemies) if (x !== e && !x.dead) { x.statuses ||= {}; x.statuses['定身'] = 1; }
  }, { BOSS, move: step.force });
  await mark(step.name);
  await page.click('.end-turn');
  await sleep(100);
  await burst(step.name, 2600, 120);
  await page.waitForFunction(CAN_ACT, null, { timeout: 90000 }).catch(() => {});
  await mark(step.name + '完');
  await sleep(500);
}
async function hitTo(step, hp) {
  await page.evaluate(({ BOSS, hp, keep }) => {
    const cs = window.__app.cs; cs.players[0].energy = 9;
    const e = cs.enemies.find((x) => x.enemyId === BOSS); e.hp = hp; e.block = 0;
    if (e.statuses) for (const k of ['縮殼', '隱身', ...(hp === 1 ? ['反彈'] : [])]) delete e.statuses[k];
    if (hp === 1 && !keep) for (const x of cs.enemies) if (x !== e) { x.hp = 0; x.dead = true; }
  }, { BOSS, hp, keep: !!step.keep });
  const pt = await page.evaluate(({ POINT_FN }) => { const f = eval(POINT_FN); const n = document.querySelector('.hand .card'); return n ? f(n) : null; }, { POINT_FN });
  await mark(step.name);
  if (!pt) { await mark('沒有牌可出'); return; }
  await page.mouse.click(pt.x, pt.y); await sleep(200);
  const tp = await page.evaluate(({ POINT_FN, BOSS }) => {
    const f = eval(POINT_FN); const e = window.__app.cs.enemies.find((x) => x.enemyId === BOSS);
    const node = document.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite-box`); return node ? f(node) : null;
  }, { POINT_FN, BOSS });
  if (tp) await page.mouse.click(tp.x, tp.y);
  await page.mouse.move(640, 30);
  if (hp === 1) { await burst(step.name, 4200, 150); await mark(step.name + '完'); return; }
  await burst(step.name, 2600, 140);
  await page.waitForFunction(CAN_ACT, null, { timeout: 90000 }).catch(() => {});
  await mark(step.name + '完');
  await sleep(800);
}

const waits = [];
for (const step of PLAN.steps) {
  if (step.need?.length) waits.push({ step: step.name, ok: await waitAtlases(step.need, step.name) });
  if (step.kill) await hitTo(step, 1);
  else if (step.phaseHp) await hitTo(step, step.phaseHp);
  else await forceAndEndTurn(step);
}
await mark('結束');

const { samples, marks } = await page.evaluate(() => window.__bx);
const fxDraws = await page.evaluate(() => window.__fxDraws);
const mmDraws = await page.evaluate(() => window.__mmDraws);
const segs = [];
for (let i = 0; i < marks.length; i++) {
  const a = marks[i].t, b = marks[i + 1]?.t ?? Infinity;
  const ss = samples.filter((s) => s.t >= a && s.t < b);
  const fxOn = ss.filter((s) => s.fx.length);
  const heroOn = ss.filter((s) => s.heroFx.length);
  segs.push({ seg: marks[i].what, at: sec(a), samples: ss.length,
    canvasPct: ss.length ? Math.round(100 * ss.filter((s) => s.canvas && s.motion).length / ss.length) : 0,
    maxCanvasW: Math.max(0, ...ss.map((s) => s.canvasW)),
    atlasesDrawn: [...new Set(mmDraws.filter((d) => d.t >= a && d.t < b).map((d) => ATLAS.get(d.key) ?? d.key))],
    fxDrawn: [...new Set(fxDraws.filter((d) => d.t >= a && d.t < b).map((d) => d.key))],
    bossFx: fxOn.length ? { firstMs: fxOn[0].t - a, lastMs: fxOn.at(-1).t - a, kinds: [...new Set(fxOn.flatMap((s) => s.fx))].slice(0, 6) } : null,
    heroFx: heroOn.length ? { firstMs: heroOn[0].t - a, lastMs: heroOn.at(-1).t - a, kinds: [...new Set(heroOn.flatMap((s) => s.heroFx))].slice(0, 4) } : null,
    // 時間對照（毫秒，從這一段開頭算）：魔物逐格第一次畫、主角血第一次掉、特效第一次掛上去
    clipFirstMs: (() => { const d = mmDraws.find((x) => x.t >= a && x.t < b && !/idle/.test(ATLAS.get(x.key) ?? '')); return d ? d.t - a : null; })(),
    heroHpDropMs: (() => { const k = ss.findIndex((s, i) => i > 0 && s.heroHp < ss[i - 1].heroHp); return k > 0 ? ss[k].t - a : null; })(),
    nameZ: [...new Set(ss.map((s) => s.nameZ))].join(','),
    clickHitsBoss: ss.length ? `${ss.filter((s) => s.hitTarget === 'boss').length}/${ss.filter((s) => !s.dead).length}` : null,
    phase: [...new Set(ss.map((s) => s.phase))].join(',') });
}
const summary = { plan: PLAN_NAME, net: NET, dwellMs: DWELL, waits, segs,
  atlasRequests: atlasLog.map((x) => `${x.url} 送出 ${sec(x.sent)} 到齊 ${x.done > 0 ? sec(x.done) : x.done < 0 ? '失敗' : '沒到'}`),
  logs: c.logs.slice(0, 20) };
writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ marks, samples, fxDraws, mmDraws }, null, 1));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
await c.close();
server.close?.();
process.exit(0);
