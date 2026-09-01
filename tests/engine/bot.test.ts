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
  // 2026-08-30 地圖兩度改版（先改路線式產生、再加不交叉規則、又新增 20 張牌），同種子的牌與路線都變了，數值重錄過三次。
  // 2026-08-31 依 Word 對照表的批改調了 27 張牌的費用／名稱／稀有度，又重錄一次。
  // 同日再補 14 隻魔物與 23 組遭遇、2 個塔主、20 個事件、20 個秘寶、12 個忍具、16 張牌，
  // 每加一批內容擲骰就全變，所以最後統一重錄一次。
  it('曾經打超過 60 回合的種子照樣跑得完，而且結果不變', () => {
    // 2026-09-01 地圖規則改動（5F 匯合、分岔與直向查重）後同種子的走向跟著變，錨值更新
    expect(playRun('bal-369')).toEqual({ seed: 'bal-369', won: false, floor: 10, turns: 63, kills: 5, deckSize: 13 });
    expect(playRun('bal-453')).toEqual({ seed: 'bal-453', won: false, floor: 9, turns: 33, kills: 3, deckSize: 13 });
  });
});
