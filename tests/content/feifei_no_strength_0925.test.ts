import { describe, expect, it } from 'vitest';
import { cards, grantsStrength, inHeroCollection } from '../../src/content/cards';
import { pickable } from '../../src/engine/hero';

/*
 * 菲菲主打中毒，不拿加爪力的牌（2026-09-25 使用者：「有玩家反應菲菲的中毒會疊層，有點類似爪力了，
 * 所以菲菲不應該有爪力的牌」「主打中毒為主」）。
 * 判準看效果（整棵效果樹、含升級版與能力牌觸發），不是列牌號：以後新增的爪力牌也自動擋。
 */
const FIVE = ['liangzhua', 'yungong', 'fengyin', 'tiexin', 'jiuweiquan'];

describe('菲菲抽不到、圖鑑也不列加爪力的牌', () => {
  it('現有的五張共用爪力牌：菲菲單人、連線都抽不到，圖鑑也不列；另外三隻照舊抽得到', () => {
    for (const id of FIVE) {
      const c = cards.find((x) => x.id === id)!;
      expect(grantsStrength(c), id).toBe(true);
      expect(pickable(c, 'feifei', 1), id).toBe(false);
      expect(pickable(c, 'feifei', 2), id).toBe(false);
      expect(inHeroCollection(c, 'feifei'), id).toBe(false);
      for (const h of ['ninja', 'dangdang', 'fengfeng'] as const) expect(pickable(c, h, 1), `${h} ${id}`).toBe(true);
    }
  });

  it('菲菲現在抽得到的牌裡，一張會替自己加爪力的都沒有', () => {
    const left = cards.filter((c) => pickable(c, 'feifei', 2) && grantsStrength(c)).map((c) => c.id);
    expect(left).toEqual([]);
  });

  it('給魔物的爪力、減爪力不算；能力牌觸發、升級版才有的也算', () => {
    expect(grantsStrength({ effects: [{ kind: 'status', name: '爪力', amount: 2, target: 'enemy' }] } as never)).toBe(false);
    expect(grantsStrength({ effects: [{ kind: 'status', name: '爪力', amount: -1, target: 'self' }] } as never)).toBe(false);
    expect(grantsStrength({ effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] }] } as never)).toBe(true);
    expect(grantsStrength({ effects: [], upgrade: { effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } } as never)).toBe(true);
  });
});
