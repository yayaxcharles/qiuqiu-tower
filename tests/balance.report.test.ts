import { describe, it } from 'vitest';
import { playRun } from '../src/engine/bot';

describe('平衡報告', () => {
  it('500 局統計', () => {
    const rs = Array.from({ length: 500 }, (_, i) => playRun(`bal-${i}`));
    const wins = rs.filter((r) => r.won).length;
    const deaths = new Map<number, number>();
    for (const r of rs) if (!r.won) deaths.set(r.floor, (deaths.get(r.floor) ?? 0) + 1);
    const lines = [
      `通關率 ${(wins / 5).toFixed(1)}%（目標 5～15%）`,
      `平均到達 ${(rs.reduce((s, r) => s + r.floor, 0) / rs.length).toFixed(2)}F`,
      `平均牌組 ${(rs.reduce((s, r) => s + r.deckSize, 0) / rs.length).toFixed(1)} 張`,
      '陣亡樓層分布：' + [...deaths.entries()].sort((a, b) => a[0] - b[0]).map(([f, n]) => `${f}F×${n}`).join('、'),
    ];
    console.log(lines.join('\n'));
  }, 300_000);
});
