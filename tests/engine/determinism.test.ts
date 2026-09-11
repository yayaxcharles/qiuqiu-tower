import { describe, expect, it } from 'vitest';
import { playCombat } from '../../src/engine/bot';
import { startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { STARTER_DECK } from '../../src/content/cards';
import { inst } from '../helpers';

/*
 * **引擎的決定性**：同一顆種子、同一串動作，永遠算出一模一樣的結果。
 *
 * 這不是「寫得好」而已，是連線版整個架構的地基。鎖步連線只傳動作不傳狀態
 * （一個動作二十幾個位元組，延遲完全不是問題），前提就是兩台機器各自照著算
 * 會得到同一個答案。只要引擎裡冒出一個 `Math.random` 或一個「現在幾點」，
 * 兩邊就會悄悄分岔——而且分岔的當下不會報錯，要等好幾回合之後畫面對不上才發現。
 *
 * 這一支在 2026-09-11 之前**不存在**：引擎零亂數零時間是靠人工 grep 確認的，
 * 沒有東西擋得住「哪天有人順手加一個 Date.now()」。強制收回合那顆按鈕
 * 整個設計都靠這條性質（計時放在畫面層、引擎只收明確的動作），所以補上。
 *
 * 掃原始碼的那兩條在 `tools/engine_pure.test.ts`——用 node:fs 的測試只能放那裡
 * （tsconfig 的 include 不含 tools，見 `tools/down_art.test.ts` 的檔頭）。
 */

describe('引擎的決定性（連線版的地基）', () => {
  it('同一顆種子跑兩次，整場戰鬥的紀錄一字不差', () => {
    const play = (): { log: string[]; hp: number; turn: number; phase: string } => {
      const cs = startCombat({
        hp: 80, maxHp: 80, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)),
        relics: [], potions: [], encounterId: 'rats3', rng: new Rng(seedFromString('det')),
      });
      playCombat(cs, new Rng(seedFromString('det-bot')), 60, 'det');
      return { log: [...cs.log], hp: cs.player.hp, turn: cs.turn, phase: cs.phase };
    };
    const a = play();
    const b = play();
    expect(b.log).toEqual(a.log);
    expect({ hp: b.hp, turn: b.turn, phase: b.phase }).toEqual({ hp: a.hp, turn: a.turn, phase: a.phase });
    expect(a.log.length, '要真的打了一場才有意義').toBeGreaterThan(10);
  });

  it('不同種子會走出不同的戰局（不是每次都回同一串）', () => {
    const play = (seed: string): string[] => {
      const cs = startCombat({
        hp: 80, maxHp: 80, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)),
        relics: [], potions: [], encounterId: 'rats3', rng: new Rng(seedFromString(seed)),
      });
      playCombat(cs, new Rng(seedFromString(`${seed}-bot`)), 60, seed);
      return cs.log;
    };
    expect(play('det-a')).not.toEqual(play('det-b'));
  });
});
