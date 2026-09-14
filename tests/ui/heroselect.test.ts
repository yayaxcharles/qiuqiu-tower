import { describe, expect, it } from 'vitest';
import { KEY_CARD } from '../../src/ui/screens/heroselect';
import { cardById, starterDeckFor } from '../../src/content/cards';
import { relicById } from '../../src/content/relics';
import { HEROES, startRelicFor } from '../../src/engine/hero';

/**
 * 選角畫面指到的東西都要真的存在（2026-09-12 稽核 高-1）。
 *
 * 這支畫面查不到牌號時寫的是 `keyCard ? el(…) : ''`——**整列靜靜消失**，
 * 不報錯、不會讓測試變紅。實際就這樣壞過：代表牌原本指著「遠射」，
 * 那張牌隨著距離機制一起刪掉了，於是選菲菲看不到代表牌、選球球看得到，
 * 只有人眼抓得出來。起手牌與起始秘寶也是同一類：查不到就顯示牌號本身或「—」。
 */
describe('選角畫面', () => {
  it('代表牌的牌號存在', () => {
    for (const hero of HEROES) {
      const id = KEY_CARD[hero];
      if (!id) continue;   // 沒列的角色走預設，不強制
      expect(cardById[id], `${hero} 的代表牌 ${id} 不存在`).toBeTruthy();
    }
  });

  it('每個角色的起手十張都查得到牌', () => {
    for (const hero of HEROES) {
      const missing = starterDeckFor(hero).filter((id) => !cardById[id]);
      expect(missing, `${hero} 的起手牌查不到：${missing.join('、')}`).toEqual([]);
    }
  });

  it('每個角色的起始秘寶都查得到', () => {
    for (const hero of HEROES) {
      const id = startRelicFor(hero);
      expect(relicById[id], `${hero} 的起始秘寶 ${id} 不存在`).toBeTruthy();
    }
  });

  it('代表牌是那位角色真的拿得到的牌', () => {
    // 指到別人的獨占牌等於介面在騙人
    for (const hero of HEROES) {
      const def = cardById[KEY_CARD[hero] ?? ''];
      if (!def?.hero) continue;
      expect(def.hero, `${hero} 的代表牌是 ${def.hero} 的獨占牌`).toBe(hero);
    }
  });
});
