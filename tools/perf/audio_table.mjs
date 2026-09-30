#!/usr/bin/env node
// 把 out_audio 裡所有 trace 算成一張總表（markdown），報告直接貼：node tools/perf/audio_table.mjs [目錄]
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = process.argv[2] ?? 'tools/perf/out_audio';
const files = readdirSync(dir).filter((f) => /^trace_(n|r|hn|hr)(16|08)_(ninja|feifei)_(cold|warm)\.json$/.test(f)).sort();
const NAME = { n: 'HTTP/1.1・正常節奏', r: 'HTTP/1.1・急性子', hn: 'HTTP/2・正常節奏', hr: 'HTTP/2・急性子' };
const rows = [];
for (const f of files) {
  const m = /^trace_(n|r|hn|hr)(16|08)_(ninja|feifei)_(cold|warm)\.json$/.exec(f);
  const s = JSON.parse(execFileSync('node', ['tools/perf/audio_analyze.mjs', `${dir}/${f}`], { maxBuffer: 1e8 }).toString());
  const v = s.voiceRows;
  const voicedBarks = v.filter((r) => r.kind === 'bark' && r.hasClip);
  const barkPlayed = voicedBarks.filter((r) => r.result === '播出');
  const delays = barkPlayed.map((r) => r.waitedMs).sort((a, b) => a - b);
  const lines = v.filter((r) => r.kind === 'line');
  const n1 = s.nodeClicks[0] ?? {}; const n2 = s.nodeClicks[1] ?? {};
  rows.push({
    scen: NAME[m[1]], net: m[2] === '16' ? '1.6' : '0.8', hero: m[3], cache: m[4],
    sfx: `${s.sfx.skipped}/${s.sfx.requests}`, sfxNames: s.sfx.skippedList.map((x) => x.name).join(','),
    line: `${lines.filter((r) => r.result === '播出').length}/${lines.length}`,
    bark: `${barkPlayed.length}/${voicedBarks.length}`, barkTimeout: voicedBarks.filter((r) => /timeout/.test(r.result)).length,
    barkMed: delays.length ? delays[Math.floor(delays.length / 2)] : null, barkMax: delays.length ? delays.at(-1) : null,
    node1: n1.combatScreenMs, node2: n2.combatScreenMs, hint1: n1.hintChangedMs, um1: n1.unitsMissingAtStartMs, hm1: n1.handMissingAtStartMs,
    step: n1.stepSfx ? `${n1.stepSfx.result.replace('sfx.', '')}(${n1.stepSfx.waitedMs})` : '-',
    mapShown: s.map.mapUiFirstSec, bgMiss: s.mapBgMissingSpans[0]?.durMs ?? 0, iconMiss: s.mapIconsMissingSpans[0]?.durMs ?? 0,
    chunkDoneAfterClick: n1.combatChunk ? Math.round((n1.combatChunk.doneSecRel - n1.clickAtSec) * 10) / 10 : null,
    total: s.totalKB,
  });
}
console.log('| 情境 | 網速Mbps | 主角 | 快取 | 音效跳過/要求 | 被跳過的音效 | 序章語音 播/要求 | 吐槽語音 播/有配音 | 吐槽逾時 | 吐槽延遲 中位/最大ms | 點第一格→進戰鬥ms | 魔物圖缺ms | 手牌缺ms | 點第二格→進戰鬥ms | 地圖底圖缺ms | 節點圖示缺ms | 戰鬥程式塊到齊(相對點擊 s) | 下載KB |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.scen} | ${r.net} | ${r.hero} | ${r.cache} | ${r.sfx} | ${r.sfxNames} | ${r.line} | ${r.bark} | ${r.barkTimeout} | ${r.barkMed ?? '-'}/${r.barkMax ?? '-'} | ${r.node1} | ${r.um1} | ${r.hm1} | ${r.node2} | ${r.bgMiss} | ${r.iconMiss} | ${r.chunkDoneAfterClick} | ${r.total} |`);
