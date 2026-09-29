// 多語系第一片（2026-09-29）：稀有度與牌型從中文改成英文代號。
// 舊存檔裡還留著中文值的兩個地方（打完這場才給的隨機牌、下一場的能力牌效果）要讀得回來、而且換成代號。
import { describe, expect, it } from 'vitest';
import { newRun } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { checkRun } from '../../src/engine/save';
import { cards } from '../../src/content/cards';
import { potions } from '../../src/content/potions';
import type { RunState } from '../../src/engine/types';

/** 照舊版（中文代號）存下來的長相 */
function oldSave(): Record<string, unknown> {
  const run = JSON.parse(JSON.stringify(newRun('old-codes', 1))) as Record<string, unknown>;
  run['pendingAfterFight'] = [{ kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }];
  (run['players'] as Record<string, unknown>[])[0]!['nextFight'] = [{
    note: '舊存檔',
    effects: [{ kind: 'power', trigger: 'afterCard', cardType: '攻擊', effects: [{ kind: 'block', amount: 4 }] }],
  }];
  return run;
}

describe('稀有度與牌型代號', () => {
  it('牌表與忍具只用英文代號', () => {
    for (const c of cards) {
      expect(['common', 'uncommon', 'rare']).toContain(c.rarity);
      expect(['attack', 'skill', 'power']).toContain(c.type);
    }
    for (const p of potions) expect(['common', 'uncommon', 'rare']).toContain(p.rarity);
  });

  it('舊存檔讀得回來，中文代號換成英文', () => {
    const back = checkRun(oldSave() as unknown as Partial<RunState>);
    expect(back, '不該被判成壞檔').not.toBeNull();
    expect(back!.pendingAfterFight).toEqual([{ kind: 'addRandomCard', pool: '忍術', rarity: 'uncommon' }]);
    const fx = me(back!).nextFight![0]!.effects[0] as { cardType?: string };
    expect(fx.cardType).toBe('attack');
    // 整份存檔再也找不到舊的中文代號
    expect(JSON.stringify(back)).not.toMatch(/"(rarity|cardType)":"(常見|罕見|稀有|攻擊|技能|能力)"/);
  });
});
