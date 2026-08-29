import { describe, expect, it } from 'vitest';
import { playRun } from '../../src/engine/bot';

describe('隨機試玩', () => {
  it('200 局不當、不卡死、每局都有結果', () => {
    const results = [];
    for (let i = 0; i < 200; i++) results.push(playRun(`bot-${i}`));
    for (const r of results) {
      expect(r.floor).toBeGreaterThanOrEqual(1);
      expect(r.turns).toBeGreaterThan(0);
      expect(typeof r.won).toBe('boolean');
    }
    const wins = results.filter((r) => r.won).length;
    console.log(`隨機亂打：通關 ${wins}/200，平均到達 ${(results.reduce((s, r) => s + r.floor, 0) / 200).toFixed(1)}F`);
  }, 120_000);
  it('同種子同結果', () => {
    expect(playRun('same')).toEqual(playRun('same'));
  });
  // 回歸：這兩個種子在戰鬥上限 60 回合時會爆掉（bal-369 是「告退」把牌組消耗光後的僵持，
  // 已於改成消耗牌後解掉；bal-453 是龜縮拖塔主）。釘住精確統計值，順便涵蓋「不丟例外」。
  it('曾經打超過 60 回合的種子照樣跑得完，而且結果不變', () => {
    expect(playRun('bal-369')).toEqual({ seed: 'bal-369', won: false, floor: 12, turns: 72, kills: 8, deckSize: 16 });
    expect(playRun('bal-453')).toEqual({ seed: 'bal-453', won: false, floor: 15, turns: 153, kills: 8, deckSize: 16 });
  });
});
