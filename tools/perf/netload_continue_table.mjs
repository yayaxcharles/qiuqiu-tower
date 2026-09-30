#!/usr/bin/env node
/*
 * 續玩情境（2026-10-01 netload 審查 中-2）前後對照：node tools/perf/netload_continue_table.mjs <修正前夾> <修正後夾>
 * 按「續玩」到地圖出現、進地圖前蓋層、進度條、地圖出現後底圖／節點圖示還缺多久。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [beforeDir, afterDir] = process.argv.slice(2);
const RE = /^trace_((c|q)(20|16|08))_(ninja|feifei)_cold\.json$/;
function sum(file) {
  const s = JSON.parse(execFileSync('node', ['tools/perf/audio_analyze.mjs', file], { maxBuffer: 1e8 }).toString());
  const res = JSON.parse(readFileSync(file, 'utf8')).res ?? {};
  const total = (arr) => arr.reduce((t, x) => t + (x.durMs ?? 0), 0);
  return {
    toMap: Math.round((res.continueToMapSec ?? NaN) * 1000),
    gate: total(s.mapGateSpans), bars: s.progressBarSpans.length, bar: total(s.progressBarSpans),
    bg: s.mapBgMissingSpans[0]?.durMs ?? 0, icons: s.hasMapMissingLog ? total(s.mapNodeIconsMissing) : 0, speed: s.netSpeed,
  };
}
const files = new Set();
for (const dir of [beforeDir, afterDir]) if (dir && existsSync(dir)) for (const f of readdirSync(dir)) if (RE.test(f)) files.add(f);
console.log('| 網速 | 主角 | 按續玩→地圖 ms | 進地圖前蓋層 ms | 進度條次數 | 進度條 ms | 地圖底圖缺 ms | 節點圖示缺 ms | 網速判定 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const f of [...files].sort()) {
  const m = RE.exec(f);
  const b = existsSync(`${beforeDir}/${f}`) ? sum(`${beforeDir}/${f}`) : null;
  const a = existsSync(`${afterDir}/${f}`) ? sum(`${afterDir}/${f}`) : null;
  const c = (k) => `${b ? b[k] : '—'} → ${a ? a[k] : '—'}`;
  console.log(`| ${{ 20: '20', 16: '1.6', '08': '0.8' }[m[3]]}${m[2] === 'q' ? '（0.3 秒就按）' : ''} | ${m[4]} | ${c('toMap')} | ${c('gate')} | ${c('bars')} | ${c('bar')} | ${c('bg')} | ${c('icons')} | ${c('speed')} |`);
}
