import { describe, expect, it } from 'vitest';
import { smartRun, type SmartStats } from '../src/engine/smartbot';

/**
 * 會算傷害的機器人的平衡報告。
 *
 * 平常 `npm test` 只跑 12 局當煙霧測試（引擎沒丟例外就算過）；
 * 要看完整數字時設環境變數：`SMART_N=300 npx vitest run tests/smart.report.test.ts`。
 * 報告印在 console：通關率、各關到達率、陣亡遭遇排行、每隻關主的勝率與進場血量。
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env['SMART_N'] ?? 12);
/** 難度（1～5）：`SMART_DIFF=3 SMART_N=300 npx vitest run --reporter=verbose tests/smart.report.test.ts` */
const DIFF = Number(env['SMART_DIFF'] ?? 1);

function report(rs: SmartStats[]): string[] {
  const n = rs.length;
  const wins = rs.filter((r) => r.won).length;
  const reachAct = (a: number): number => rs.filter((r) => r.act >= a).length;
  const deaths = new Map<string, number>();
  for (const r of rs) if (r.diedTo) deaths.set(r.diedTo, (deaths.get(r.diedTo) ?? 0) + 1);
  const bossMap = new Map<string, { n: number; w: number; hp: number; turns: number }>();
  for (const r of rs) for (const b of r.bosses) {
    const cur = bossMap.get(b.id) ?? { n: 0, w: 0, hp: 0, turns: 0 };
    cur.n += 1; cur.w += b.won ? 1 : 0; cur.hp += b.hpIn / b.maxHp; cur.turns += b.turns;
    bossMap.set(b.id, cur);
  }
  // 每場一般戰鬥平均掉血，分關
  const lossByAct = [1, 2, 3].map((a) => {
    const fs = rs.flatMap((r) => r.fights.filter((f) => f.won && Math.ceil(f.floor / 15) === a && !r.bosses.some((b) => b.id === f.id)));
    return fs.length ? (fs.reduce((s, f) => s + f.hpLost, 0) / fs.length).toFixed(1) : '—';
  });
  // 每種遭遇：打了幾場、輸幾場、贏的時候平均掉血——找出「太軟」與「太硬」的怪
  const enc = new Map<string, { n: number; lost: number; hp: number; turns: number; floor: number }>();
  for (const r of rs) for (const f of r.fights) {
    const cur = enc.get(f.id) ?? { n: 0, lost: 0, hp: 0, turns: 0, floor: 0 };
    cur.n += 1; if (!f.won) cur.lost += 1; else { cur.hp += f.hpLost; cur.turns += f.turns; }
    cur.floor += f.floor;
    enc.set(f.id, cur);
  }
  const encLines = [...enc.entries()].filter(([, v]) => v.n >= 5)
    .map(([id, v]) => ({ id, n: v.n, lost: v.lost, hp: v.n - v.lost ? v.hp / (v.n - v.lost) : 0, turns: v.n - v.lost ? v.turns / (v.n - v.lost) : 0, floor: v.floor / v.n }))
    .sort((a, b) => a.floor - b.floor)
    .map((x) => `${x.id}@${x.floor.toFixed(0)}F n${x.n} 輸${x.lost} 掉血${x.hp.toFixed(1)} ${x.turns.toFixed(1)}回`);
  const floorDeaths = new Map<number, number>();
  for (const r of rs) if (!r.won) floorDeaths.set(r.floor, (floorDeaths.get(r.floor) ?? 0) + 1);
  const lines = [
    `局數 ${n}｜通關 ${wins}（${(wins / n * 100).toFixed(1)}%）`,
    `到達第二關 ${reachAct(2)}（${(reachAct(2) / n * 100).toFixed(0)}%）｜到達第三關 ${reachAct(3)}（${(reachAct(3) / n * 100).toFixed(0)}%）`,
    `平均到達 ${(rs.reduce((s, r) => s + r.floor, 0) / n).toFixed(1)}F｜平均牌組 ${(rs.reduce((s, r) => s + r.deckSize, 0) / n).toFixed(1)} 張（升級 ${(rs.reduce((s, r) => s + r.upgraded, 0) / n).toFixed(1)}）｜秘寶 ${(rs.reduce((s, r) => s + r.relics, 0) / n).toFixed(1)}`,
    `一般戰每場平均掉血：第一關 ${lossByAct[0]}、第二關 ${lossByAct[1]}、第三關 ${lossByAct[2]}`,
    '陣亡樓層：' + [...floorDeaths.entries()].sort((a, b) => a[0] - b[0]).map(([f, c]) => `${f}F×${c}`).join('、'),
    '陣亡遭遇排行：' + [...deaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, c]) => `${id}×${c}`).join('、'),
    '遭遇明細（依樓層）：\n  ' + encLines.join('\n  '),
    '關主：' + [...bossMap.entries()].map(([id, b]) => `${id} ${b.w}/${b.n}（進場血 ${(b.hp / b.n * 100).toFixed(0)}%、${(b.turns / b.n).toFixed(1)} 回合）`).join('｜'),
  ];
  return lines;
}

describe('會算傷害的機器人', () => {
  it(`${N} 局統計（難度 ${DIFF}）`, () => {
    const rs: SmartStats[] = [];
    for (let i = 0; i < N; i++) rs.push(smartRun(`smart-${i}`, DIFF));
    console.log(report(rs).join('\n'));
    expect(rs.length).toBe(N);
  }, 600_000);
});
