// 波斯大小姐每十回合把倒下的僕從叫回來（使用者 2026-09-04）
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { damageEnemy } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';

describe('波斯大小姐喚僕從', () => {
  it('第 9 次出招是「喚僕從」：倒下的執事貓與女僕貓回到場上；第 1～8 次照表', () => {
    const cs = startCombat({ hp: 999, maxHp: 999, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: 'persian_lady', rng: new Rng(seedFromString('pc')) });
    const lady = cs.enemies.find((e) => e.enemyId === 'persian_lady')!;
    for (const e of cs.enemies) if (e !== lady) damageEnemy(cs, e, 999, { direct: true });   // 僕從 2026-09-06 起不再同生共死，清掉就是清掉
    const alive = () => cs.enemies.filter((e) => e.enemyId !== 'persian_lady' && !e.dead).length;
    for (let t = 1; t <= 8; t++) { expect(lady.move.label, `第 ${t} 次`).not.toBe('喚僕從'); cs.player.block = 999; endTurn(cs); }
    expect(alive()).toBe(0);
    expect(lady.move.label).toBe('喚僕從');
    cs.player.block = 999; endTurn(cs);   // 第 9 次出招
    expect(alive()).toBe(2);
    expect(cs.enemies.filter((e) => e.enemyId === 'butler_cat' && !e.dead).length).toBe(1);
  });
});
