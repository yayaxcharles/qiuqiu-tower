// 2026-09-04 凌晨稽核（scratchpad audit_0903_night.md）修掉的問題，各釘一個回歸
import { describe, expect, it } from 'vitest';
import { STARTER_DECK, cardById } from '../../src/content/cards';
import { damageEnemy } from '../../src/engine/actions';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { makeShop, newRun } from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { describeCard } from '../../src/ui/cardtext';
import { inst } from '../helpers';

function deck(ids: readonly string[]): CardInstance[] { return ids.map((id, i) => inst(id, i + 1)); }
function start(encounterId: string, ids: readonly string[] = STARTER_DECK, seed = 's'): CombatState {
  return startCombat({ hp: 76, maxHp: 76, deck: deck(ids), relics: ['blue_headband'], potions: [], encounterId, rng: new Rng(seedFromString(seed)) });
}
function toHand(cs: CombatState, cardId: string, upgraded = false): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); }
  c.upgraded = upgraded;
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('稽核 2026-09-04', () => {
  it('H-1 反彈流打貓又：牠出招時被反彈打過門檻，頭上排好的「放尾巴」不會被洗掉，下回合尾巴照放', () => {
    const cs = start('nekomata');
    const neko = cs.enemies[0]!;
    endTurn(cs);                                          // 第 1 回合放兩條
    const tails = () => cs.enemies.filter((e) => e.enemyId === 'nekomata_tail' && !e.dead).length;
    expect(tails()).toBe(2);
    neko.hp = 57; neko.block = 0;
    addStatus(cs.player, '反彈', 3);
    neko.move = { intent: 'attack', label: '雙尾抽', effects: [{ kind: 'damage', amount: 9, times: 3 }] };
    for (const e of cs.enemies) if (e !== neko) e.move = { intent: 'block', label: '護主', effects: [{ kind: 'block', amount: 5 }] };
    cs.player.block = 0;
    endTurn(cs);                                          // 三下各被反彈 3 → 57-9=48 ≤ 55 換階段（回血 12）
    expect(neko.phase).toBe(1);
    expect(neko.move.label, '換階段排好的招不該被 advanceMove 蓋掉').toBe('放尾巴');
    expect(tails(), '換階段當下不冒尾巴').toBe(2);
    cs.player.block = 99; endTurn(cs);
    expect(tails()).toBe(4);
  });

  it('H-2 升級過的能力牌：power 記得升級與否，說明文字要念升級版', () => {
    const cs = start('wood_dummy', [...STARTER_DECK, 'fengyin', 'fengyin']);
    cs.player.energy = 9;
    playCard(cs, toHand(cs, 'fengyin', true));
    playCard(cs, toHand(cs, 'fengyin', false));
    const pw = cs.player.powers.filter((p) => p.cardId === 'fengyin');
    expect(pw.length).toBe(2);
    expect(pw.some((p) => p.upgraded === true)).toBe(true);
    expect(pw.some((p) => !p.upgraded)).toBe(true);
    const def = cardById['fengyin']!;
    expect(describeCard(def, true)).not.toBe(describeCard(def, false));
  });

  it('M-1 剛爬起來的那一拍：不出招，但噎到照扣、定身照遞減，回合數不算', () => {
    const cs = start('persian_lady');
    const butler = cs.enemies.find((e) => e.enemyId === 'butler_cat')!;
    addStatus(butler, '噎到', 5); addStatus(butler, '定身', 2);
    damageEnemy(cs, butler, 999, { direct: true });
    expect(butler.dead).toBe(true); expect(butler.reviveIn).toBe(2);
    cs.player.block = 99; endTurn(cs);                    // 躺著：2 → 1
    expect(butler.dead).toBe(true); expect(butler.reviveIn).toBe(1);
    const tc = butler.turnCount; const hpBefore = cs.player.hp;
    cs.player.block = 99; endTurn(cs);                    // 爬起來（30 血），這一拍不出招但狀態要結算
    expect(butler.dead).toBe(false);
    expect(butler.turnCount, '爬起來那拍不算回合').toBe(tc);
    expect(butler.hp, '噎到要扣').toBeLessThan(30);
    expect(getStatus(butler, '噎到')).toBe(4);
    expect(getStatus(butler, '定身'), '定身在那一拍被消耗一層').toBe(1);
    expect(butler.move.intent, '頭上是真的招不是閒置').not.toBe('idle');
    expect(cs.player.hp, '牠沒出手（其餘傷害被 99 蜷縮擋掉）').toBe(hpBefore);
  });

  it('L-4／同組沒人站著：第二個倒下的僕從直接 reviveIn 0，之後都不會爬起來', () => {
    const cs = start('persian_lady');
    const [b, m] = ['butler_cat', 'maid_cat'].map((id) => cs.enemies.find((e) => e.enemyId === id)!);
    damageEnemy(cs, b!, 999, { direct: true });
    expect(b!.reviveIn).toBe(2);
    damageEnemy(cs, m!, 999, { direct: true });
    expect(m!.reviveIn, '倒下時同組已沒人站著→不倒數').toBe(0);
    cs.player.block = 99; endTurn(cs);
    expect(b!.reviveIn, '同組沒人站著→倒數歸零').toBe(0);
    expect(b!.dead && m!.dead).toBe(true);
    cs.player.block = 99; endTurn(cs); cs.player.block = 99; endTurn(cs);
    expect(b!.dead && m!.dead, '主子在組外，兩個僕從再也不會爬起來').toBe(true);
  });

  it('M-4 稀有保底改成隨機格、忍術格優先：絕學那張變稀有的比例不再遠高於機率表', () => {
    let jue = 0, jueRare = 0;
    for (let i = 0; i < 600; i++) {
      const run = newRun(`m4-${i}`); run.act = 3;
      const shop = makeShop(run);
      expect(shop.cards.filter((c) => c.def.rarity === '稀有').length).toBeGreaterThanOrEqual(2);
      const j = shop.cards.find((c) => c.def.pool === '絕學');
      if (j) { jue++; if (j.def.rarity === '稀有') jueRare++; }
    }
    expect(jue).toBeGreaterThan(150);
    expect(jueRare / jue, '第三關機率表稀有 40%，保底不該把絕學推到六七成').toBeLessThan(0.52);
  });
});
