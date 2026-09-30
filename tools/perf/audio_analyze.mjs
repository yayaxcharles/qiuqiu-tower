#!/usr/bin/env node
/*
 * 把 audio_trace.mjs 錄到的 trace 算成表：音效／語音有沒有被跳過、點戰鬥格到畫面的時間線、地圖底圖到齊時間、各時段下載量。
 *   node tools/perf/audio_analyze.mjs <trace.json> [--json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
const d = JSON.parse(readFileSync(file, 'utf8'));
const L = d.L; const reqs = d.reqs;
const T0 = d.timeOrigin;                               // 這一頁開始載入的時間（epoch 毫秒）
const rel = (t) => Math.round((t - T0) / 100) / 10;    // 秒，小數 1 位
const relf = (t) => Math.round(t - T0);                // 毫秒
const sec = (ms) => Math.round(ms / 100) / 10;
const base = (u) => String(u ?? '').split('?')[0].split('/').slice(-1)[0];
const short = (u) => String(u ?? '').split('/').slice(-1)[0].replace(/-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)/, '$1').replace(/\?.*/, '');

function cat(url) {
  const p = url.split('?')[0];
  const m = /\/assets\/(bg|cards|icons|monsters|motion|sfx|sprites)\//.exec(p);
  if (m) return m[1];
  if (/\/voice\/voice-map/.test(p)) return 'voicemap';
  if (/\/voice\//.test(p)) return 'voice';
  if (/\/bgm\//.test(p)) return 'bgm';
  if (/\/video\//.test(p)) return 'video';
  if (/\.js$/.test(p)) return 'js';
  if (/\.css$/.test(p)) return 'css';
  if (/manifest\.json/.test(p)) return 'manifest';
  if (/\.html$|\/$/.test(p)) return 'html';
  return 'other';
}
const R = reqs.filter((r) => r.t1 !== null).map((r) => ({ ...r, c: cat(r.url), s: short(r.url) }));
const inflightAt = (t) => reqs.filter((r) => r.t0 <= t && (r.t1 === null || r.t1 > t));
const marks = {}; for (const e of L) if (e.tag === 'mark') marks[e.name] = e.t;

const out = { file, config: d.config, netSpeed: d.res?.netSpeed, audioContext: d.ac, pageErrors: d.res?.pageErrors };

// ── A. 時間線 ──
out.marks = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, rel(v)]));

// ── B. 音效 ──
const sfx = { requests: 0, started: 0, skipped: 0, exitNoCtx: 0, skipByReason: {}, skippedList: [], byName: {}, delays: [] };
const sfxReq = new Map();
for (const e of L) {
  if (e.tag === 'sfx.req') { sfx.requests++; sfxReq.set(e.id, e); const b = (sfx.byName[e.name] ??= { req: 0, started: 0, skipped: 0, firstAt: rel(e.t), preloaded: e.cached }); b.req++; }
  if (e.tag === 'sfx.exit') { sfx.exitNoCtx++; sfx.requests++; (sfx.byName['(未解鎖)' + e.name] ??= { req: 0, started: 0, skipped: 0 }).req++; }
  if (e.tag === 'sfx.start') { sfx.started++; sfx.byName[e.name].started++; sfx.delays.push({ name: e.name, at: rel(e.t), ms: e.waitedMs }); }
  if (e.tag === 'sfx.skip') { sfx.skipped++; sfx.byName[e.name].skipped++; sfx.skipByReason[e.why] = (sfx.skipByReason[e.why] ?? 0) + 1; sfx.skippedList.push({ name: e.name, at: rel(e.t), why: e.why, waitedMs: e.waitedMs }); }
}
const late = sfx.delays.filter((x) => x.ms > 60);
sfx.lateStarts = late.map((x) => `${x.name}@${x.at}s 等了${x.ms}ms`);
delete sfx.delays;
out.sfx = sfx;

// ── C. 語音 ──
const v = { line: {}, bark: {}, queue: {} };
const gate = [];
for (const e of L) if (e.tag === 'gate.say') gate.push(e);
const vreq = L.filter((e) => e.tag === 'voice.req');
const vend = new Map();
for (const e of L) if (e.tag === 'voice.start' || e.tag === 'voice.exit') vend.set(e.id, e);
const vclip = new Map(L.filter((e) => e.tag === 'voice.clip').map((e) => [e.id, e]));
const rows = [];
for (const r of vreq) {
  const g = [...gate].reverse().find((x) => x.t <= r.t + 1 && x.name === r.kind && (x.text ?? '').slice(0, 10) === (r.text ?? '').slice(0, 10));
  const end = vend.get(r.id);
  const clip = vclip.get(r.id);
  rows.push({ id: r.id, kind: r.kind, group: r.group, text: r.text, at: rel(r.t), gateAt: g ? rel(g.t) : null, moduleLoadWaitMs: g ? Math.round(r.t - g.t) : null,
    hasClip: !!clip, clipCached: clip?.cached ?? null, result: !end ? '(無結果紀錄)' : end.tag === 'voice.start' ? '播出' : '未播:' + end.why,
    waitedMs: end?.waitedMs ?? null, totalFromToastMs: end && g && end.tag === 'voice.start' ? Math.round(end.t - g.t) : null });
}
for (const k of ['line', 'bark', 'queue']) {
  const rr = rows.filter((x) => x.kind === k);
  v[k] = { requests: rr.length, played: rr.filter((x) => x.result === '播出').length, noClip: rr.filter((x) => x.result.includes('noclip')).length,
    timeout: rr.filter((x) => x.result.includes('timeout')).length, busy: rr.filter((x) => x.result.includes('busy')).length, other: rr.filter((x) => !['播出'].includes(x.result) && !/noclip|timeout|busy/.test(x.result)).map((x) => x.result) };
}
out.voiceSummary = v;
out.voiceRows = rows;
// 從 gate.say 到 voice.req 之間沒有 voice.req 的（模組載入中被叫停、或沒載入前就不講）
const gateVoiced = gate.filter((g) => g.group);
out.voiceGateCalls = { total: gate.length, withGroup: gateVoiced.length, reachedSpeak: vreq.length };

// ── D. 每個 sfx 音檔載入耗時 ──
const fetchStart = new Map(); const sfxLoads = [];
for (const e of L) {
  if (e.tag === 'fetch.start') fetchStart.set(e.id, e);
  if (e.tag === 'decode.done' && /\/sfx\//.test(e.name ?? '')) {
    const st = [...fetchStart.values()].find((s) => base(s.name) === base(e.name));
    sfxLoads.push({ file: short(e.name), fetchAt: st ? rel(st.t) : null, doneAt: rel(e.t), ms: st ? Math.round(e.t - st.t) : null });
  }
}
out.sfxLoads = sfxLoads;
const vfetch = [];
for (const e of L) if (e.tag === 'fetch.start' && /\/voice\//.test(e.name)) {
  const body = L.find((x) => x.tag === 'fetch.body' && base(x.name) === base(e.name) && x.t >= e.t);
  vfetch.push({ file: short(e.name), at: rel(e.t), ms: body ? Math.round(body.t - e.t) : null, bytes: body?.bytes ?? null });
}
out.voiceFetches = vfetch;

// ── E. 點地圖格到畫面（每一場）──
const uiEvents = L.filter((e) => e.tag === 'ui');
out.nodeClicks = [];
for (const k of Object.keys(marks).filter((k) => /\.beforeNodeClick$/.test(k))) {
  const tag = k.split('.')[0];
  const tClick = marks[k];
  const md = L.find((e) => e.tag === 'mousedown' && e.t >= tClick - 5 && /map-node/.test(String(e.name)));
  const t = md ? md.t : tClick;
  const after = uiEvents.filter((e) => e.t >= t - 50);
  const pick = (re) => { const e = after.find((x) => re.test(x.name)); return e ? Math.round(e.t - t) : null; };
  const combatShown = marks[tag + '.combatShown']; const canAct = marks[tag + '.canAct'];
  const inf = inflightAt(t);
  const infCat = {}; for (const r of inf) { const c = cat(r.url); infCat[c] = (infCat[c] ?? 0) + 1; }
  const combatChunk = R.find((r) => /\/combat-[^/]*\.js/.test(r.url));
  const stepSfx = L.find((e) => e.tag === 'sfx.req' && e.name === 'step' && e.t >= t - 50);
  const stepEnd = L.find((e) => (e.tag === 'sfx.start' || e.tag === 'sfx.skip') && e.name === 'step' && e.t >= t - 50);
  // 點下去之後才開始下載的魔物立繪／其他
  const newReqs = R.filter((r) => r.t0 >= t - 50 && r.t0 <= (combatShown ?? t + 5000)).map((r) => ({ f: r.s, c: r.c, startMs: Math.round(r.t0 - t), endMs: Math.round(r.t1 - t), kb: Math.round((r.bytes ?? 0) / 1024) }));
  const pendingAtClick = inf.map((r) => ({ f: short(r.url), c: cat(r.url), startedMsBeforeClick: Math.round(t - r.t0) })).slice(0, 40);
  out.nodeClicks.push({
    fight: tag,
    clickAtSec: rel(t),
    feedbackPickedMs: pick(/picked/), fightPendingMs: pick(/PENDING/), hintChangedMs: pick(/正在準備戰鬥/), loadingScreenMs: pick(/LOADING/),
    combatScreenMs: combatShown ? Math.round(combatShown - t) : null, canActMs: canAct ? Math.round(canAct - t) : null,
    inflightAtClick: inf.length, inflightByCat: infCat,
    combatChunk: combatChunk ? { startedSecRel: rel(combatChunk.t0), doneSecRel: rel(combatChunk.t1), kb: Math.round((combatChunk.bytes ?? 0) / 1024) } : null,
    stepSfx: stepSfx ? { requestedMs: Math.round(stepSfx.t - t), preloaded: stepSfx.cached, result: stepEnd ? stepEnd.tag : '無', waitedMs: stepEnd?.waitedMs ?? null } : null,
    newRequestsDuringWait: newReqs.filter((r) => r.c !== 'sfx').slice(0, 40),
    pendingAtClick,
  });
}

// ── F. 地圖 ──
const mapShown = marks['map.shown'];
const mapUi = uiEvents.find((e) => /^map\|/.test(e.name) && e.t >= (marks['prologue.start'] ?? 0));
const find1 = (re) => R.find((r) => re.test(r.url));
const mapBg = find1(/\/map_tall-/);
const nodeIcons = R.filter((r) => /\/icons\/node_/.test(r.url));
out.map = {
  mapScreenShownSec: mapShown ? rel(mapShown) : null,
  mapUiFirstSec: mapUi ? rel(mapUi.t) : null,
  mapBg: mapBg ? { requestSec: rel(mapBg.t0), doneSec: rel(mapBg.t1), afterMapShownSec: mapShown ? sec(mapBg.t1 - mapShown) : null, inflightAtRequest: inflightAt(mapBg.t0).length, kb: Math.round((mapBg.bytes ?? 0) / 1024), fromCache: mapBg.fromCache, orderAmongAllRequests: reqs.slice().sort((a, b) => a.t0 - b.t0).findIndex((r) => r.url === mapBg.url) + 1, totalRequestsBefore: reqs.filter((r) => r.t0 < mapBg.t0).length } : '(沒有請求)',
  nodeIcons: nodeIcons.map((r) => ({ f: r.s, requestSec: rel(r.t0), doneSec: rel(r.t1), afterMapShownSec: mapShown ? sec(r.t1 - mapShown) : null, kb: Math.round((r.bytes ?? 0) / 1024), fromCache: r.fromCache })),
};

// ── F2. 地圖底圖／節點圖示／戰鬥圖缺的時間長度（從畫面狀態記錄算）──
function spans(test, endTest) {
  const res = []; let start = null;
  for (const e of uiEvents) {
    if (start === null && test(e.name)) start = e.t;
    else if (start !== null && endTest(e.name)) { res.push({ startSec: rel(start), startAbs: start, durMs: Math.round(e.t - start) }); start = null; }
  }
  if (start !== null) res.push({ startSec: rel(start), startAbs: start, durMs: null, note: '到記錄結束都沒好' });
  return res;
}
out.mapBgMissingSpans = spans((n) => /^map\|.*mapbg:WAIT/.test(n), (n) => !/mapbg:WAIT/.test(n));
out.mapIconsMissingSpans = spans((n) => /^map\|.*icons缺[1-9]/.test(n), (n) => !/icons缺[1-9]/.test(n));
out.combatUnitsMissingSpans = spans((n) => /units缺[1-9]/.test(n), (n) => !/units缺[1-9]/.test(n));
out.combatHandMissingSpans = spans((n) => /hand缺[1-9]/.test(n), (n) => !/hand缺[1-9]/.test(n));
// 條件式進度條（2026-09-30 netload）：畫面上有 `.net-progress` 的每一段、各多久；GATE＝進地圖前那一層蓋著（含還沒露出進度條的 250 毫秒）
out.progressBarSpans = spans((n) => /\|BAR:/.test(n), (n) => !/\|BAR:/.test(n));
out.mapGateSpans = spans((n) => /\|GATE\|/.test(n), (n) => !/\|GATE\|/.test(n));
out.mapShots = d.res?.mapShots;
// 地圖上「節點圖示」（node_*）與其他（塔主格用的是魔物立繪，另算）各缺多久；只有 2026-09-30 加了 mapmissing 記錄之後的 trace 才有
{
  const ev = L.filter((e) => e.tag === 'mapmissing' || (e.tag === 'ui' && !/^map\|/.test(e.name)));   // 離開地圖畫面也算結束
  const track = (pred) => { const res = []; let st = null; for (const e of ev) { const has = e.tag === 'mapmissing' && String(e.name).split(',').filter(Boolean).some(pred); if (has && st === null) st = e.t; else if (!has && st !== null) { res.push({ startSec: rel(st), durMs: Math.round(e.t - st), leftMapWhileMissing: e.tag === 'ui' }); st = null; } } if (st !== null) res.push({ startSec: rel(st), durMs: null }); return res; };
  out.hasMapMissingLog = L.some((e) => e.tag === 'mapmissing');
  out.mapNodeIconsMissing = track((n) => /^node_/.test(n));
  out.mapBossPortraitMissing = track((n) => !/^node_/.test(n));
}
// 每一場開打當下：魔物圖／手牌圖缺多久（只看戰鬥畫面出現前後 0.8 秒內開始的那一段；之後那些幾百毫秒的短缺是換姿勢圖的正常閃動，暖快取也有）
for (const nc of out.nodeClicks) {
  const cs = marks[nc.fight + '.combatShown'];
  const near = (arr) => { const x = arr.find((q) => cs !== undefined && Math.abs(q.startAbs - cs) < 800); return x ? x.durMs : 0; };
  nc.unitsMissingAtStartMs = near(out.combatUnitsMissingSpans); nc.handMissingAtStartMs = near(out.combatHandMissingSpans);
}
// 2026-09-30 netload：戰鬥畫面掛上後 5 秒內，主角（player）與魔物（enemy）的圖各空了多久（有 unitmissing 記錄的 trace 才有）
{
  const um = L.filter((e) => e.tag === 'unitmissing' || (e.tag === 'ui' && !/^combat\|/.test(e.name)));
  out.hasUnitMissingLog = L.some((e) => e.tag === 'unitmissing');
  for (const nc of out.nodeClicks) {
    const cs = marks[nc.fight + '.combatShown'];
    if (cs === undefined || !out.hasUnitMissingLog) continue;
    const end = cs + 5000;
    const acc = { player: 0, enemy: 0 };
    let state = { player: false, enemy: false }; let at = cs;
    const before = [...um].reverse().find((e) => e.t <= cs && e.tag === 'unitmissing');
    // 只算角色本人的圖：主角＝sprites/（姿勢立繪），魔物＝monsters/（立繪）；狀態小圖示、特效圖不算
    const who = (name) => ({ player: /player:sprites\//.test(name), enemy: /enemy:monsters\//.test(name) });
    if (before) state = who(before.name);
    for (const e of um.filter((x) => x.t > cs && x.t <= end)) {
      for (const k of ['player', 'enemy']) if (state[k]) acc[k] += e.t - at;
      at = e.t;
      state = e.tag === 'unitmissing' ? who(e.name) : { player: false, enemy: false };
    }
    for (const k of ['player', 'enemy']) if (state[k]) acc[k] += end - at;
    nc.playerMissingFirst5sMs = Math.round(acc.player); nc.enemyMissingFirst5sMs = Math.round(acc.enemy);
  }
}
for (const k of ['mapBgMissingSpans', 'mapIconsMissingSpans', 'combatUnitsMissingSpans', 'combatHandMissingSpans', 'progressBarSpans', 'mapGateSpans']) out[k] = out[k].map(({ startAbs, ...r }) => r);

// ── G. 下載量分段 ──
const windows = [['封面前', T0, marks['title.artReady'] ?? Infinity], ['封面到點新的一局', marks['title.artReady'], marks['click.newgame']], ['新的一局到出發', marks['click.newgame'], marks['click.go']], ['出發到地圖出現', marks['click.go'], marks['map.shown']],
  ['地圖出現到點第一格', marks['map.shown'], marks['fight1.beforeNodeClick']], ['點第一格到能出牌', marks['fight1.beforeNodeClick'], marks['fight1.canAct']]];
out.downloadByWindow = windows.filter((w) => w[1] !== undefined).map(([name, a, b]) => {
  const by = {}; let bytes = 0, n = 0;
  for (const r of R) { if (r.t0 < a || r.t0 >= (b ?? Infinity)) continue; by[r.c] = by[r.c] ?? { n: 0, kb: 0 }; by[r.c].n++; by[r.c].kb += Math.round((r.bytes ?? 0) / 1024); bytes += r.bytes ?? 0; n++; }
  return { window: name, fromSec: rel(a), toSec: b === undefined || b === Infinity ? null : rel(b), requests: n, kb: Math.round(bytes / 1024), by };
});
out.totalKB = Math.round(R.reduce((s, r) => s + (r.bytes ?? 0), 0) / 1024);
out.notFinished = reqs.filter((r) => r.t1 === null).length;

// ── H. 戰鬥用到的檔（點第一格前後）魔物立繪 ──
const m1 = marks['fight1.beforeNodeClick'];
if (m1) out.monstersFight1 = R.filter((r) => r.c === 'monsters').map((r) => ({ f: r.s, reqSec: rel(r.t0), doneSec: rel(r.t1), beforeClick: r.t1 <= m1 })).filter((r) => !r.beforeClick).slice(0, 30);

if (process.argv.includes('--json')) writeFileSync(file.replace(/\.json$/, '.summary.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
