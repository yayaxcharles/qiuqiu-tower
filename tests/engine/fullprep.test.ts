// 44F 貓窩第三選項「全力準備」（難度 4 起；玩家 2026-09-08 建議）：升級一張牌＋回一成血＋小魚乾全換血（÷10）、魚乾歸零
import { describe, expect, it } from 'vitest';
import { fullPrepAvailable, fullPrepHeal, newRun, rest } from '../../src/engine/run';

const setup = (difficulty: number, floor = 44) => {
  const run = newRun('prep', difficulty);
  run.act = 3; run.floor = floor; run.maxHp = 80; run.hp = 30; run.fish = 300;
  return run;
};

describe('全力準備', () => {
  it('44F、難度 5：升級一張牌、回一成＋魚乾÷10、魚乾歸零', () => {
    const run = setup(5);
    const uid = run.deck.find((c) => !c.upgraded)!.uid;
    expect(fullPrepAvailable(run)).toBe(true);
    expect(fullPrepHeal(run)).toEqual({ tenth: 8, fromFish: 30, total: 38 });
    expect(rest(run, '全力準備', uid)).toBe(true);
    expect(run.hp).toBe(68);
    expect(run.fish).toBe(0);
    expect(run.deck.find((c) => c.uid === uid)!.upgraded).toBe(true);
  });

  it('難度 4 也開放（邊界），數字照樣', () => {
    const run = setup(4);
    const uid = run.deck.find((c) => !c.upgraded)!.uid;
    expect(fullPrepAvailable(run)).toBe(true);
    expect(rest(run, '全力準備', uid)).toBe(true);
    expect(run.hp).toBe(68);
    expect(run.fish).toBe(0);
  });

  it('挑到已升級的牌、不存在的牌：回 false，血與魚乾都不動；舊存檔沒有難度欄＝難度 1 不開放', () => {
    const run = setup(5);
    const c = run.deck[0]!;
    c.upgraded = true;
    expect(rest(run, '全力準備', c.uid)).toBe(false);
    expect(rest(run, '全力準備', 99999)).toBe(false);
    expect(run.hp).toBe(30);
    expect(run.fish).toBe(300);
    const old = setup(5);
    delete old.difficulty;
    expect(fullPrepAvailable(old)).toBe(false);
  });

  it('難度 3 以下、不是 44F 都不開放；沒挑牌不算，什麼都不動', () => {
    for (const run of [setup(3), setup(5, 43), setup(4, 29)]) {
      const uid = run.deck[0]!.uid;
      expect(fullPrepAvailable(run)).toBe(false);
      expect(rest(run, '全力準備', uid)).toBe(false);
      expect(run.hp).toBe(30);
      expect(run.fish).toBe(300);
      expect(run.deck[0]!.upgraded).toBe(false);
    }
    const run = setup(4);
    expect(rest(run, '全力準備')).toBe(false);
    expect(run.fish).toBe(300);
  });

  it('回血封頂在最大生命，魚乾照樣歸零', () => {
    const run = setup(5);
    run.hp = 70;
    rest(run, '全力準備', run.deck[0]!.uid);
    expect(run.hp).toBe(80);
    expect(run.fish).toBe(0);
  });

  it('44F 打盹照舊回滿、不動魚乾；磨爪照舊只回一成', () => {
    const a = setup(5);
    rest(a, '打盹');
    expect(a.hp).toBe(80);
    expect(a.fish).toBe(300);
    const b = setup(5);
    rest(b, '磨爪', b.deck[0]!.uid);
    expect(b.hp).toBe(38);
    expect(b.fish).toBe(300);
  });
});
