import { it } from 'vitest';
import { smartRun } from '../src/engine/smartbot';
import { encounterById } from '../src/content/enemies';

/**
 * 爪力量表（使用者 2026-09-02：「爪力累積好像太快了，後期會太強？」）：
 * 每關戰鬥結束時球球身上的爪力、回合數、秒殺率，以及到第三關的牌組裡爪力是從哪些牌／秘寶來的。
 *
 * 看數字：`SMART_N=300 npx vitest run --reporter=verbose tests/smart.str.report.test.ts`
 * （預設報表器會把通過測試的 console 輸出吞掉，一定要加 `--reporter=verbose`）。
 * 平常 `npm test` 只跑 12 局當煙霧測試。
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env['SMART_N'] ?? 12);

it('爪力報表', () => {
  const rows: { act: number; boss: boolean; str: number; turns: number; won: boolean }[] = [];
  const late: { deckIds: string[]; relicIds: string[] }[] = [];
  for (let i = 0; i < N; i++) {
    const s = smartRun(`str-${i}`);
    if (s.act >= 3) late.push({ deckIds: s.deckIds, relicIds: s.relicIds });
    for (const f of s.fights) rows.push({ act: f.act, boss: encounterById[f.id]?.pool === '塔主', str: f.str, turns: f.turns, won: f.won });
  }
  const avg = (xs: number[]): string => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-');
  const lines: string[] = [];
  for (const act of [1, 2, 3]) for (const boss of [false, true]) {
    const g = rows.filter((r) => r.act === act && r.boss === boss && r.won);
    if (!g.length) continue;
    const hi = g.filter((r) => r.str >= 6).length;
    lines.push(`第${act}關 ${boss ? '關主' : '一般'}：場數 ${g.length}、平均爪力 ${avg(g.map((r) => r.str))}、爪力≥6 佔 ${Math.round(100 * hi / g.length)}%、平均回合 ${avg(g.map((r) => r.turns))}、≤2 回合結束 ${Math.round(100 * g.filter((r) => r.turns <= 2).length / g.length)}%`);
  }
  // 爪力從哪裡來：到第三關的牌組裡，各個來源的持有率（含升級版）與平均張數
  const n = Math.max(1, late.length);
  for (const id of ['yungong', 'liangzhua', 'tiexin', 'fengyin', 'jiuweiquan', 'yingzi']) {
    const has = late.filter((d) => d.deckIds.some((c) => c === id || c === `${id}+`)).length;
    const copies = late.reduce((a, d) => a + d.deckIds.filter((c) => c === id || c === `${id}+`).length, 0);
    lines.push(`來源 ${id}：到第三關的 ${late.length} 局裡 ${Math.round(100 * has / n)}% 有，平均 ${(copies / n).toFixed(2)} 張`);
  }
  for (const id of ['wrist_guard', 'scroll', 'claw_sheath']) {
    lines.push(`秘寶 ${id}：${Math.round(100 * late.filter((d) => d.relicIds.includes(id)).length / n)}%`);
  }
  console.log(lines.join('\n'));
});
