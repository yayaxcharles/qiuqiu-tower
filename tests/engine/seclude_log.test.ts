import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { damageEnemy } from '../../src/engine/actions';
import { startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';

/**
 * 師父調息中的紀錄（使用者 2026-09-08）：每回合開頭固定會用 0 點的中毒結算走進 damageEnemy 一次，
 * 那時沒人打他，卻照樣寫「正在調息，毫髮無傷」，玩家會以為自己漏看了一次攻擊。
 * 規則：真的有傷害打過來才記；0 點的例行結算安靜通過。無敵本身兩種情況都要成立。
 */
describe('調息中的紀錄', () => {
  const start = () => startCombat({
    hp: 76, maxHp: 76, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [],
    encounterId: 'tower_master', rng: new Rng(seedFromString('seclude')),
  });

  it('0 點的例行結算不寫「毫髮無傷」', () => {
    const cs = start();
    const m = cs.enemies.find((e) => e.enemyId === 'tower_master')!;
    m.invulnIn = 1;
    const n = cs.log.length;
    const r = damageEnemy(cs, m, 0, { direct: true });
    expect(r.dealt).toBe(0);
    expect(cs.log.slice(n).some((l) => l.includes('毫髮無傷'))).toBe(false);
  });

  it('真的被打才寫，而且照樣無敵', () => {
    const cs = start();
    const m = cs.enemies.find((e) => e.enemyId === 'tower_master')!;
    m.invulnIn = 1;
    const hp = m.hp;
    const n = cs.log.length;
    const r = damageEnemy(cs, m, 9, {});
    expect(r.dealt).toBe(0);
    expect(m.hp).toBe(hp);
    expect(cs.log.slice(n).some((l) => l.includes('正在調息，毫髮無傷'))).toBe(true);
  });
});
