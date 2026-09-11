// 2026-09-11 第二批忍具（五支對敵）的引擎行為。
// 五支用的都是引擎既有的效果，但**那些效果以前從來沒有忍具走過**——
// 忍具這條路跟牌不一樣（`source: 'potion'` 會關掉爪力加成、目標要另外傳），所以要各驗一次。
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { potionById } from '../../src/content/potions';
import { startCombat, usePotion } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { inst } from '../helpers';

function fight(encounterId: string, potions: string[], hp = 999, maxHp = 999) {
  return startCombat({
    hp, maxHp, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions,
    encounterId, rng: new Rng(seedFromString('p0911b')),
  });
}

describe('順手牽羊爪（stealBlock）', () => {
  it('目標的防禦整個搬到自己身上，不是清掉', () => {
    const cs = fight('kappa', ['steal_claw']);
    const e = cs.enemies[0]!;
    e.block = 23;
    cs.player.block = 4;
    expect(usePotion(cs, 'steal_claw', e.uid)).toBe(true);
    expect(e.block, '目標的防禦要歸零').toBe(0);
    expect(cs.player.block, '原本的 4 點要留著，再加 23').toBe(27);
  });
  it('目標沒有防禦時不會爆，也不會憑空生出蜷縮', () => {
    const cs = fight('kappa', ['steal_claw']);
    const e = cs.enemies[0]!;
    e.block = 0;
    cs.player.block = 5;
    expect(usePotion(cs, 'steal_claw', e.uid)).toBe(true);
    expect(cs.player.block).toBe(5);
  });
  it('**沒指目標就用不出來**：`usePotion` 會擋下，不會靜靜浪費掉一支', () => {
    // 資料寫成 target: 'self' 的話 `usePotion` 不會要 targetUid，效果就會拿到空陣列、
    // 什麼都沒發生卻把忍具吃掉。這裡驗的是「引擎真的擋得住」，不只是資料長得對
    const cs = fight('kappa', ['steal_claw']);
    cs.enemies[0]!.block = 10;
    expect(usePotion(cs, 'steal_claw'), '沒傳目標就不該成功').toBe(false);
    expect(cs.potions, '擋下來的話忍具要留著').toContain('steal_claw');
    expect(cs.player.block, '也不該憑空拿到蜷縮').toBe(0);
    expect(potionById['steal_claw']!.target).toBe('enemy');
  });
});

describe('破功散（removeStatuses）', () => {
  it('爪力、貓步、鱗甲、不壞身一起拔光', () => {
    const cs = fight('kappa', ['break_art']);
    const e = cs.enemies[0]!;
    addStatus(e, '爪力', 6); addStatus(e, '貓步', 4); addStatus(e, '鱗甲', 3); addStatus(e, '不壞身', 2);
    expect(usePotion(cs, 'break_art', e.uid)).toBe(true);
    expect(getStatus(e, '爪力')).toBe(0);
    expect(getStatus(e, '貓步')).toBe(0);
    expect(getStatus(e, '鱗甲')).toBe(0);
    expect(getStatus(e, '不壞身')).toBe(0);
  });
  it('只拔這三個，不誤傷別的狀態（減益要留著）', () => {
    const cs = fight('kappa', ['break_art']);
    const e = cs.enemies[0]!;
    addStatus(e, '爪力', 4); addStatus(e, '噎到', 5); addStatus(e, '翻肚', 2); addStatus(e, '隱身', 1);
    usePotion(cs, 'break_art', e.uid);
    expect(getStatus(e, '爪力')).toBe(0);
    expect(getStatus(e, '噎到'), '減益是好事，不該被拔').toBe(5);
    expect(getStatus(e, '翻肚')).toBe(2);
    expect(getStatus(e, '隱身'), '隱身不在名單上').toBe(1);
  });
  it('目標身上乾乾淨淨時也不會爆，而且**確實用得出去**', () => {
    // 只寫 not.toThrow 是不夠的：`usePotion` 靜靜回 false 也照樣不丟例外（稽核 2026-09-11 低-6）
    const cs = fight('kappa', ['break_art']);
    expect(usePotion(cs, 'break_art', cs.enemies[0]!.uid)).toBe(true);
    expect(cs.potions).not.toContain('break_art');
  });
});

describe('加倍奉還（doubleStatus）', () => {
  it('有噎到就翻倍，再加 2 層', () => {
    const cs = fight('kappa', ['double_back']);
    const e = cs.enemies[0]!;
    addStatus(e, '噎到', 5);
    expect(usePotion(cs, 'double_back', e.uid)).toBe(true);
    expect(getStatus(e, '噎到'), '5 → 翻倍 10 再 +2').toBe(12);
  });
  it('**0 層時不會變成一行「催不動」**：保底給 2 層（2026-09-11 刻意加的 `add`）', () => {
    // 牌（絕學·催噎）沒有保底沒關係——牌每場都能再打一次；
    // 忍具是一次性的，花 40 條買到「什麼都沒發生」太傷
    const cs = fight('kappa', ['double_back']);
    const e = cs.enemies[0]!;
    expect(getStatus(e, '噎到')).toBe(0);
    expect(usePotion(cs, 'double_back', e.uid)).toBe(true);
    expect(getStatus(e, '噎到')).toBe(2);
    expect(cs.log.some((l) => l.includes('催不動')), '不該印催不動').toBe(false);
  });
});

describe('亂石包（damageRandom）', () => {
  it('傷害落在 6～22 之間，而且**不吃爪力**（忍具同口徑）', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 40; k++) {
      const cs = startCombat({
        hp: 999, maxHp: 999, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)),
        relics: [], potions: ['rubble_bag'], encounterId: 'kappa', rng: new Rng(seedFromString(`rub${k}`)),
      });
      const e = cs.enemies[0]!;
      addStatus(cs.player, '爪力', 20);   // 爪力拉到 20：忍具若吃爪力，傷害會遠超過 22
      const before = e.hp + e.block;
      usePotion(cs, 'rubble_bag', e.uid);
      const dealt = before - (e.hp + e.block);
      expect(dealt, `種子 rub${k} 打出 ${dealt}`).toBeGreaterThanOrEqual(6);
      expect(dealt, `種子 rub${k} 打出 ${dealt}，爪力被算進去了`).toBeLessThanOrEqual(22);
      seen.add(dealt);
    }
    expect(seen.size, '四十個種子全打同一個數字＝亂數沒在動').toBeGreaterThan(5);
  });
});

describe('以彼之道（damageEqualBlock）', () => {
  it('傷害等同目前的蜷縮，而且**用完蜷縮還在**（不是消耗掉）', () => {
    const cs = fight('kappa', ['your_way']);
    const e = cs.enemies[0]!;
    cs.player.block = 18;
    const before = e.hp + e.block;
    expect(usePotion(cs, 'your_way', e.uid)).toBe(true);
    expect(before - (e.hp + e.block), '打出 18 點').toBe(18);
    expect(cs.player.block, '蜷縮不該被花掉').toBe(18);
  });
  it('沒有蜷縮時就是 0 點，不會爆', () => {
    const cs = fight('kappa', ['your_way']);
    cs.player.block = 0;
    const e = cs.enemies[0]!;
    const before = e.hp + e.block;
    expect(usePotion(cs, 'your_way', e.uid)).toBe(true);
    expect(before - (e.hp + e.block)).toBe(0);
  });
});
