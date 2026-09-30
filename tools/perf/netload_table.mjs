#!/usr/bin/env node
/*
 * 慢網路修正（2026-09-30 netload）前後對照表：把兩個輸出夾的 trace 各算一次（audio_analyze.mjs），排成 markdown。
 *   node tools/perf/netload_table.mjs tools/perf/out_netload/before tools/perf/out_netload/after
 * 每列一個情境（n/r＝正常節奏／急性子；16/08/20＝1.6／0.8／20 Mbps），欄位是「修正前 → 修正後」。
 */
import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [beforeDir, afterDir] = process.argv.slice(2);
const RE = /^trace_((n|r|f|hr)(16|08|20))_(ninja|feifei)_cold\.json$/;

function summarize(file) {
  const s = JSON.parse(execFileSync('node', ['tools/perf/audio_analyze.mjs', file], { maxBuffer: 1e8 }).toString());
  const barks = s.voiceRows.filter((r) => r.kind === 'bark' && r.hasClip);
  const played = barks.filter((r) => r.result === '播出');
  const delays = played.map((r) => r.waitedMs).sort((a, b) => a - b);
  const sum = (arr) => arr.reduce((t, x) => t + (x.durMs ?? 0), 0);
  const open = (arr) => arr.some((x) => x.durMs === null);
  return {
    sfx: `${s.sfx.skipped}/${s.sfx.requests}`,
    sfxNames: s.sfx.skippedList.map((x) => x.name).join(','),
    bark: `${played.length}/${barks.length}`,
    barkTimeout: barks.filter((r) => /timeout/.test(r.result)).length,
    barkMed: delays.length ? delays[Math.floor(delays.length / 2)] : '-',
    fight1: s.nodeClicks[0]?.combatScreenMs ?? '-',
    fight2: s.nodeClicks[1]?.combatScreenMs ?? '-',
    units1: s.nodeClicks[0]?.unitsMissingAtStartMs ?? '-',
    hand1: s.nodeClicks[0]?.handMissingAtStartMs ?? '-',
    p1: s.hasUnitMissingLog ? s.nodeClicks[0]?.playerMissingFirst5sMs ?? '-' : '-',
    e1: s.hasUnitMissingLog ? s.nodeClicks[0]?.enemyMissingFirst5sMs ?? '-' : '-',
    p2: s.hasUnitMissingLog ? s.nodeClicks[1]?.playerMissingFirst5sMs ?? '-' : '-',
    e2: s.hasUnitMissingLog ? s.nodeClicks[1]?.enemyMissingFirst5sMs ?? '-' : '-',
    mapBg: s.mapBgMissingSpans[0]?.durMs ?? (s.mapBgMissingSpans.length ? '未到' : 0),
    icons: s.hasMapMissingLog ? (sum(s.mapNodeIconsMissing) + (open(s.mapNodeIconsMissing) ? '＋' : '')) : '-',
    bars: s.progressBarSpans.length,
    barMs: s.progressBarSpans.map((x) => x.durMs ?? '未收').join('+') || '0',
    gateMs: s.mapGateSpans.map((x) => x.durMs ?? '未收').join('+') || '0',
    totalKB: s.totalKB,
    netSpeed: s.netSpeed,
    errors: (s.pageErrors ?? []).length,
  };
}

const files = new Set();
for (const d of [beforeDir, afterDir]) if (d && existsSync(d)) for (const f of readdirSync(d)) if (RE.test(f)) files.add(f);
const order = ['n16', 'r16', 'n08', 'r08', 'f20', 'hr08'];
const rows = [...files].sort((a, b) => order.indexOf(RE.exec(a)[1]) - order.indexOf(RE.exec(b)[1]) || a.localeCompare(b));
const NAME = { n: '正常節奏', r: '急性子', f: '快網路・急性子', hr: 'HTTP/2・急性子' };
const COLS = [['sfx', '音效跳過/要求'], ['bark', '吐槽 播/有配音'], ['barkTimeout', '吐槽逾時'], ['fight1', '第一場進戰鬥 ms'], ['fight2', '第二場進戰鬥 ms'],
  ['units1', '第一場魔物圖缺 ms'], ['hand1', '第一場手牌缺 ms'], ['p1', '第一場開打5秒內主角圖空 ms'], ['e1', '第一場開打5秒內魔物圖空 ms'], ['p2', '第二場主角圖空 ms'], ['e2', '第二場魔物圖空 ms'], ['mapBg', '地圖底圖缺 ms'], ['icons', '節點圖示缺 ms'], ['bars', '進度條次數'], ['barMs', '進度條 ms'], ['gateMs', '進地圖前蓋層 ms'], ['totalKB', '下載 KB']];
console.log('| 情境 | 網速 | 主角 | ' + COLS.map((c) => c[1]).join(' | ') + ' |');
console.log('|---|---|---|' + COLS.map(() => '---').join('|') + '|');
for (const f of rows) {
  const m = RE.exec(f);
  const b = beforeDir && existsSync(`${beforeDir}/${f}`) ? summarize(`${beforeDir}/${f}`) : null;
  const a = afterDir && existsSync(`${afterDir}/${f}`) ? summarize(`${afterDir}/${f}`) : null;
  const cell = (k) => `${b ? b[k] : '—'} → ${a ? a[k] : '—'}`;
  const net = m[3] === '16' ? '1.6' : m[3] === '08' ? '0.8' : '20';
  console.log(`| ${NAME[m[2]]} | ${net} | ${m[4]} | ` + COLS.map((c) => cell(c[0])).join(' | ') + ' |');
  const extra = [b, a].map((x, i) => x && (x.errors || x.sfxNames) ? `${i ? '後' : '前'}：跳過 ${x.sfxNames || '無'}${x.errors ? `、頁面錯誤 ${x.errors}` : ''}（網速判定 ${x.netSpeed}）` : '').filter(Boolean);
  if (extra.length) console.error(`  ${f}: ${extra.join('；')}`);
}
