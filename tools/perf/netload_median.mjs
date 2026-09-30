#!/usr/bin/env node
/*
 * 第二輪（2026-10-01）重跑的中位數：node tools/perf/netload_median.mjs <情境> <主角> <夾1> <夾2> ...
 * 每個夾裡找 trace_<情境>_<主角>_cold.json，印每次的數字與中位數。
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [scen, hero, ...dirs] = process.argv.slice(2);
const rows = [];
for (const d of dirs) {
  const f = `${d}/trace_${scen}_${hero}_cold.json`;
  if (!existsSync(f)) continue;
  const s = JSON.parse(execFileSync('node', ['tools/perf/audio_analyze.mjs', f], { maxBuffer: 1e8 }).toString());
  const res = JSON.parse(readFileSync(f, 'utf8')).res ?? {};
  const total = (arr) => arr.reduce((t, x) => t + (x.durMs ?? 0), 0);
  rows.push({
    dir: d.split('/').slice(-2).join('/'),
    fight1: s.nodeClicks[0]?.combatScreenMs ?? null,
    fight2: s.nodeClicks[1]?.combatScreenMs ?? null,
    blank1: s.hasUnitMissingLog ? (s.nodeClicks[0]?.playerMissingFirst5sMs ?? 0) : 0,
    blank2: s.hasUnitMissingLog ? (s.nodeClicks[1]?.playerMissingFirst5sMs ?? 0) : 0,
    toMap: res.continueToMapSec !== undefined ? Math.round(res.continueToMapSec * 1000) : null,
    gate: total(s.mapGateSpans), bars: s.progressBarSpans.length, speed: s.netSpeed,
  });
}
const med = (k) => { const v = rows.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
for (const r of rows) console.log(JSON.stringify(r));
console.log('中位數', JSON.stringify(Object.fromEntries(['fight1', 'fight2', 'blank1', 'blank2', 'toMap', 'gate', 'bars'].map((k) => [k, med(k)]))), `（${rows.length} 次）`);
