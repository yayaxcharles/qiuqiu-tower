#!/usr/bin/env node
// 開打後 5 秒內主角缺的是哪幾張姿勢（2026-09-30 netload）：node tools/perf/netload_heroblank.mjs <輸出夾>
import { readdirSync, readFileSync } from 'node:fs';
const dir = process.argv[2];
for (const f of readdirSync(dir).filter((x) => /^trace_.*_cold\.json$/.test(x)).sort()) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  for (const fight of ['fight1', 'fight2']) {
    const m = d.L.find((e) => e.tag === 'mark' && e.name === `${fight}.combatShown`);
    if (!m) continue;
    const names = new Set();
    for (const e of d.L) if (e.tag === 'unitmissing' && e.t >= m.t - 50 && e.t <= m.t + 5000) for (const x of String(e.name).split(',')) if (x.startsWith('player:sprites/')) names.add(x.replace(/^player:sprites\/hero\//, '').replace(/-[\w-]{8}\.webp$/, ''));
    console.log(f.replace(/^trace_|_cold\.json$/g, ''), fight, [...names].join(' '));
  }
}
