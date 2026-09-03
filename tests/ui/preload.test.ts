// 分關預載的名單（src/ui/preload.ts）：第一關不該抓第二關的關主，召喚物要跟著主人一起算
import { describe, expect, it } from 'vitest';
import { enemyIdsForAct, monsterArtKeysForAct, warmEncounter } from '../../src/ui/preload';

describe('魔物立繪分關預載', () => {
  it('第一關：塔下五關主與牠們的召喚物都在，第二關關主不在', () => {
    const a1 = enemyIdsForAct(1);
    for (const id of ['nekomata', 'nekomata_tail', 'frog_daimyo', 'tadpole', 'orange_king', 'iron_claw', 'armadillo_king']) expect(a1.has(id), id).toBe(true);
    for (const id of ['cowcat_boss', 'persian_lady', 'butler_cat', 'tower_master']) expect(a1.has(id), id).toBe(false);
  });
  it('第二關：塔中關主與僕從在，第三關只有師父當關主', () => {
    const a2 = enemyIdsForAct(2);
    for (const id of ['cowcat_boss', 'persian_lady', 'butler_cat', 'maid_cat', 'dragon_cat', 'hex_abbot', 'tanuki_lord']) expect(a2.has(id), id).toBe(true);
    expect(a2.has('orange_king')).toBe(false);
    const a3 = enemyIdsForAct(3);
    expect(a3.has('tower_master')).toBe(true);
    expect(a3.has('cowcat_boss')).toBe(false);
  });
  it('立繪鍵不含師父（他的立繪組在 sprites），且三關合起來涵蓋所有一般遭遇', () => {
    expect(monsterArtKeysForAct(3).includes('daxia')).toBe(false);
    const all = new Set([1, 2, 3].flatMap((a) => monsterArtKeysForAct(a)));
    expect(all.size).toBeGreaterThan(60);
  });
  it('沒有瀏覽器時 warmEncounter 立刻結束', async () => {
    await expect(warmEncounter('nekomata', 100)).resolves.toBeUndefined();
  });
});
