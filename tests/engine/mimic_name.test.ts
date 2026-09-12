import { describe, expect, it } from 'vitest';
import { beginCombat, newRun } from '../../src/engine/run';
import { learnedMove } from '../../src/engine/mimic';
import { cardNameFor } from '../../src/content/cards';
import { cardById } from '../../src/content/cards';

/**
 * 鏡中球球「照著打出「…」」那行要用**被照的那一位**看到的牌名（2026-09-12 稽核 低-1）。
 *
 * 菲菲玩到鏡中球球時，她手上的牌面寫「絕學·連珠針」，紀錄卻寫「絕學·貓爪抓」——
 * 同一張牌兩個名字。名字分家是 `cardNameFor` 做的，這裡漏過就對不起來。
 */
describe('鏡中球球學來的牌名', () => {
  /*
   * 牌組整副換成**共用牌**——她的起手十張全是她自己的牌（飛針、退開、淬毒），
   * `cardNameFor` 對那些回的就是 `def.name`，跟沒換一樣，測了等於沒測。
   * 分家只發生在共用牌上（`FEIFEI_CARD_NAME`），所以要拿那幾張來測。
   */
  const SHARED = ['liangzhua', 'dieda', 'jiuweiquan', 'lianhuan'];
  const move = (hero: 'ninja' | 'feifei') => {
    const run = newRun(`mimic-${hero}`, 1, hero);
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    run.currentNode = node.id;
    const cs = beginCombat(run, 'mirror_duel_a2');
    const p = cs.player;
    let uid = 900;
    p.drawPile = SHARED.map((id) => ({ uid: uid++, cardId: id, upgraded: false }));
    p.hand = []; p.discardPile = []; p.exhaustPile = [];
    return learnedMove(cs);
  };

  it('菲菲那局印的是她的牌名', () => {
    const m = move('feifei');
    if (!m) return;                     // 這場沒有鏡中球球就跳過
    let checked = 0;
    for (const l of m.learned ?? []) {
      const def = cardById[l.cardId];
      if (!def) continue;
      const hers = cardNameFor(def, 'feifei');
      expect(hers, `${l.cardId} 沒有分家的名字，這條測試會變成空轉`).not.toBe(def.name);
      expect(m.label, `牌 ${l.cardId} 的名字沒換成她的`).toContain(hers);
      checked++;
    }
    expect(checked, '一張都沒驗到').toBeGreaterThan(0);
  });

  it('球球那局還是原本的牌名', () => {
    const m = move('ninja');
    if (!m) return;
    for (const l of m.learned ?? []) {
      const def = cardById[l.cardId];
      if (def) expect(m.label).toContain(def.name);
    }
  });
});
