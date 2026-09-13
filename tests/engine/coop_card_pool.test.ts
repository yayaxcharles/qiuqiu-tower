import { describe, expect, it } from 'vitest';
import { beginCombat, finishCombat, makeShop, newCoopRun, newRun, rollActCards } from '../../src/engine/run';
import { cards } from '../../src/content/cards';
import type { CardDef } from '../../src/engine/types';

/*
 * **連線牌真的要抽得到**（2026-09-13 第三輪稽核 高-1）。
 *
 * `pickable` 的第三道關卡是「`coop: true` 的牌要兩個人以上才開得出來」，
 * 而人數是 `rollCardChoices` 的第九個參數、**預設 1**。
 * 戰利品三選一、過關三選一、罐頭鋪這三條主幹一次都沒把人數傳下去，
 * 於是連線局裡那 28 張連線牌一張都開不出來——27 張新做的加原本 9 張全都拿不到。
 *
 * 為什麼靜音：畫面完全正常，三選一照樣給三張、罐頭鋪照樣擺滿貨，
 * 只是那些牌永遠不在候選池裡。沒有錯誤、沒有缺格，只有「怎麼都沒看過那幾張」。
 *
 * 測法一律用**多局取樣**：一局裡抽三張，剛好沒中不能算證據。
 * 一張都沒出現才是「那道過濾根本沒放行」。
 */
const COOP_IDS = new Set(cards.filter((c) => c.coop && !c.hidden).map((c) => c.id));
const countCoop = (list: readonly CardDef[]): number => list.filter((c) => COOP_IDS.has(c.id)).length;

/** 打贏一場拿戰利品。`seed` 換一顆就是換一局 */
function winOnce(seed: string, coop: boolean) {
  const run = coop ? newCoopRun(seed, 1, 'ninja', 'feifei') : newRun(seed, 1, 'ninja');
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  const cs = beginCombat(run);
  for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
  cs.phase = 'won';
  return { run, r: finishCombat(run, cs)! };
}

describe('連線牌抽得到（稽核 高-1）', () => {
  it('這一版真的有連線牌可抽，不然底下每一條都是空測', () => {
    expect(COOP_IDS.size, '連線牌一張都沒有的話這個檔案沒有意義').toBeGreaterThan(10);
  });

  it('戰利品三選一：連線局抽得到連線牌', () => {
    let n = 0;
    for (let i = 0; i < 40; i++) n += countCoop(winOnce(`pool-fight-${i}`, true).r.cards);
    expect(n, '40 局的戰利品一張連線牌都沒有——人數沒傳進 rollCardChoices').toBeGreaterThan(0);
  });

  it('各自那一份也抽得到（兩個人各看各的三選一）', () => {
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const { r } = winOnce(`pool-seat-${i}`, true);
      for (const set of r.cardsPerSeat ?? []) n += countCoop(set);
    }
    expect(n, '各自那一份也漏了人數').toBeGreaterThan(0);
  });

  it('過關三選一：連線局抽得到連線牌', () => {
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const run = newCoopRun(`pool-act-${i}`, 1, 'ninja', 'ninja');
      n += countCoop(rollActCards(run));
    }
    expect(n, '過關三選一一張連線牌都沒有').toBeGreaterThan(0);
  });

  it('罐頭鋪：連線局的貨架上有連線牌', () => {
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const run = newCoopRun(`pool-shop-${i}`, 1, 'ninja', 'feifei');
      n += makeShop(run).cards.filter((c) => COOP_IDS.has(c.def.id)).length;
    }
    expect(n, '罐頭鋪一張連線牌都沒有').toBeGreaterThan(0);
  });

  /*
   * 反向那一半同樣重要：**單機絕對不能開出連線牌**。
   * 只傳人數不看效果的話，一個人拿到「分你一半」就是一張廢牌。
   */
  it('單機一張連線牌都不該出現', () => {
    for (let i = 0; i < 60; i++) {
      const { r } = winOnce(`pool-solo-${i}`, false);
      expect(countCoop(r.cards), `單機第 ${i} 局的戰利品混進了連線牌`).toBe(0);
    }
    for (let i = 0; i < 60; i++) {
      const run = newRun(`pool-solo-act-${i}`, 1, 'ninja');
      expect(countCoop(rollActCards(run)), '單機的過關三選一混進了連線牌').toBe(0);
      expect(makeShop(run).cards.filter((c) => COOP_IDS.has(c.def.id)).length, '單機的罐頭鋪混進了連線牌').toBe(0);
    }
  });
});
