import { describe, expect, it } from 'vitest';
import { cards } from '../../src/content/cards';
import { pickable } from '../../src/engine/hero';

/*
 * 連線牌（2026-09-11）：九張只有雙人局才抽得到的牌。
 *
 * 這三件事一起盯：**張數**（漏了一張不會有人發現）、**都要有升級效果**
 *（使用者明示「升級效果也得規畫上去，邏輯跟之前的牌都一樣」）、
 * 以及**單機絕對抽不到**——後者是最要緊的，抽到了就等於單機多出九張
 * 效果全部落空的廢牌（它們的作用對象是「同伴」）。
 */
describe('連線牌', () => {
  it('九張、都可以升級、單機抽不到、兩個人抽得到', () => {
    const coop = cards.filter((c) => c.coop);
    expect(coop.length).toBe(9);
    for (const c of coop) {
      expect(c.upgrade, `${c.name} 要有升級效果`).toBeTruthy();
      expect(pickable(c, c.hero ?? 'ninja', 1), `${c.name} 單機不該抽得到`).toBe(false);
      expect(pickable(c, c.hero ?? 'ninja', 2), `${c.name} 兩個人要抽得到`).toBe(true);
    }
  });
});
