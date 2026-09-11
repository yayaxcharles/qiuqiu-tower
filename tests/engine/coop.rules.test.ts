import { describe, expect, it } from 'vitest';
import { beginEnemyTurn, canPlay, startCombat, startPlayerTurn } from '../../src/engine/combat';
import { damagePlayer, pickVictim, runEnemyEffects } from '../../src/engine/actions';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState, PlayerCombat } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/*
 * 兩人玩的四條規則（使用者 2026-09-11 拍板），這一支管其中兩條：
 *   規則二：魔物一招**隨機挑一位還站著的**打
 *   規則四：一個人倒下不算輸，另一個繼續打到自己也倒為止
 * 另外兩條（秘寶忍具各帶各的、獎勵分開給）在別的地方。
 */

function combat(): CombatState {
  const cs = startCombat({
    hp: 60, maxHp: 80, deck: [inst('tanding', 1)], relics: [], potions: [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('coop-rules')),
  });
  cs.player.drawPile = []; cs.player.hand = [inst('tanding', 1)]; cs.player.energy = 9;
  return cs;
}

function addSecond(cs: CombatState, deckIds: string[] = []): PlayerCombat {
  const p2 = blankPlayer(deckIds, 1);
  cs.players.push(p2);
  return p2;
}

describe('規則四：一個人倒下不算輸', () => {
  it('一號倒下，二號還站著，戰鬥繼續', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 5; p1.block = 0; p2.hp = 50;
    const foe = cs.enemies[0]!;

    damagePlayer(cs, foe, 99, { victim: p1 });

    expect(p1.hp).toBe(0);
    expect(p1.down, '一號倒下了').toBe(true);
    expect(cs.phase, '但戰鬥還在打').toBe('player');
    expect(cs.log.some((l) => l.includes('另一位還站著'))).toBe(true);
  });

  it('兩個都倒下才算輸', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 5; p1.block = 0; p2.hp = 5; p2.block = 0;
    const foe = cs.enemies[0]!;

    damagePlayer(cs, foe, 99, { victim: p1 });
    expect(cs.phase).toBe('player');
    damagePlayer(cs, foe, 99, { victim: p2 });
    expect(cs.phase, '最後一位也倒了').toBe('lost');
  });

  it('單機一位玩家：倒下就是輸，跟以前一模一樣', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    p1.hp = 5; p1.block = 0;
    damagePlayer(cs, cs.enemies[0]!, 99, { victim: p1 });
    expect(cs.phase).toBe('lost');
  });

  it('倒下的人不再挨打、不抽牌、也打不出牌', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs, ['sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo']);
    p1.hp = 5; p1.block = 0; p2.hp = 50;
    const foe = cs.enemies[0]!;

    damagePlayer(cs, foe, 99, { victim: p1 });
    expect(p1.down).toBe(true);

    // 再打也不會有事（血條已經是 0，不該再往下掉）
    expect(damagePlayer(cs, foe, 20, { victim: p1 }), '倒下的人吃不到傷害').toBe(0);
    expect(p1.hp).toBe(0);

    // 回合開始：倒下的不抽牌，站著的照抽
    p1.hand = []; p2.hand = [];
    startPlayerTurn(cs);
    expect(p1.hand.length, '倒下的人不抽牌').toBe(0);
    expect(p2.hand.length, '站著的照抽五張').toBe(5);

    expect(canPlay(cs, 1, undefined, 0).ok, '倒下的人打不出牌').toBe(false);
  });

  it('倒下的人回合結束不會再被詛咒或減益結算', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 5; p1.block = 0; p2.hp = 50;
    damagePlayer(cs, cs.enemies[0]!, 99, { victim: p1 });

    p1.hand = [inst('sanjo', 11)];
    beginEnemyTurn(cs);
    expect(p1.hand.length, '倒下的人手牌留在原地，沒被結算').toBe(1);
  });
});

describe('規則二：魔物一招隨機挑一位還站著的打', () => {
  it('**只剩一位候選就完全不擲骰**：單機的亂數順序一格都不能位移', () => {
    const cs = combat();
    const before = { ...cs.rng.state };
    pickVictim(cs);
    expect(cs.rng.state, '一個人的時候 pickVictim 不准動到亂數').toEqual(before);

    // 兩位但其中一位倒下：候選還是只有一位，一樣不擲骰
    const p2 = addSecond(cs);
    p2.down = true;
    const before2 = { ...cs.rng.state };
    expect(pickVictim(cs)).toBe(cs.players[0]);
    expect(cs.rng.state).toEqual(before2);
  });

  it('兩位都站著就真的隨機，而且兩位都挑得到', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    const seen = new Set<PlayerCombat>();
    for (let i = 0; i < 50; i++) seen.add(pickVictim(cs));
    expect(seen.has(p1), '一號被挑到過').toBe(true);
    expect(seen.has(p2), '二號被挑到過').toBe(true);
  });

  it('倒下的人不會被挑中', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.down = true;
    for (let i = 0; i < 30; i++) expect(pickVictim(cs)).toBe(p2);
  });

  it('挑的單位是「一招」不是「一個效果」：同一招的傷害與減益落在同一個人身上', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 50; p2.hp = 50;
    const foe = cs.enemies[0]!;

    // 不指定對象，讓它自己挑；挑中誰不重要，重要的是**兩個效果落在同一個人身上**
    for (let i = 0; i < 20; i++) {
      p1.hp = 50; p2.hp = 50;
      p1.statuses = {}; p2.statuses = {};
      runEnemyEffects(cs, foe, [
        { kind: 'damage', amount: 6 },
        { kind: 'statusPlayer', name: '翻肚', amount: 2 },
      ], false);
      const hurt = [p1, p2].filter((p) => p.hp < 50);
      const debuffed = [p1, p2].filter((p) => getStatus(p, '翻肚') > 0);
      expect(hurt.length, '只有一個人挨打').toBe(1);
      expect(debuffed, '挨打的跟中減益的是同一位').toEqual(hurt);
    }
  });
});
