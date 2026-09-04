// 武士球球的「甲」（2026-09-05 拍板）：跟蜷縮並列但性格相反——回合開始不歸零，被打會永久扣。
// 受傷順序 蜷縮 → 甲 → 生命；穿透穿得過蜷縮，但擋在甲前面。
import { describe, expect, it } from 'vitest';

import { damagePlayer } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function fight(seed = 'armour'): CombatState {
  return startCombat({
    hp: 100, maxHp: 100, deck: ['sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString(seed)),
  });
}

describe('甲不歸零', () => {
  it('回合開始時蜷縮歸零，甲原封不動', () => {
    const cs = fight();
    cs.player.block = 9;
    cs.player.armour = 12;
    endTurn(cs);
    expect(cs.player.block, '蜷縮照舊歸零').toBe(0);
    expect(cs.player.armour, '甲不歸零').toBe(12);
  });

  it('連過三個回合都不掉', () => {
    const cs = fight();
    cs.player.armour = 20;
    for (let i = 0; i < 3; i++) { cs.player.block = 999; endTurn(cs); }
    expect(cs.player.armour).toBe(20);
  });
});

describe('受傷順序：蜷縮 → 甲 → 生命', () => {
  it('蜷縮擋得住就不動甲', () => {
    const cs = fight();
    cs.player.block = 10; cs.player.armour = 8;
    const hp = cs.player.hp;
    damagePlayer(cs, cs.enemies[0]!, 6);
    expect(cs.player.block).toBe(4);
    expect(cs.player.armour, '沒溢出就不該啃甲').toBe(8);
    expect(cs.player.hp).toBe(hp);
  });

  it('蜷縮擋不完，溢出的部分啃甲，血不動', () => {
    const cs = fight();
    cs.player.block = 3; cs.player.armour = 10;
    const hp = cs.player.hp;
    damagePlayer(cs, cs.enemies[0]!, 8);
    expect(cs.player.block).toBe(0);
    expect(cs.player.armour, '溢出的 5 點由甲吃掉').toBe(5);
    expect(cs.player.hp, '甲還夠，血不該掉').toBe(hp);
  });

  it('甲也擋不完才扣血', () => {
    const cs = fight();
    cs.player.block = 2; cs.player.armour = 3;
    const hp = cs.player.hp;
    damagePlayer(cs, cs.enemies[0]!, 12);
    expect(cs.player.block).toBe(0);
    expect(cs.player.armour).toBe(0);
    expect(hp - cs.player.hp, '12 − 2 蜷縮 − 3 甲 = 7 點掉血').toBe(7);
  });

  it('沒有甲的時候跟現在完全一樣（忍者不受影響）', () => {
    const a = fight(), b = fight();
    a.player.block = 4; b.player.block = 4; b.player.armour = 0;
    damagePlayer(a, a.enemies[0]!, 10);
    damagePlayer(b, b.enemies[0]!, 10);
    expect(b.player.hp).toBe(a.player.hp);
    expect(b.player.block).toBe(a.player.block);
  });
});

describe('穿透穿得過蜷縮，但擋在甲前面', () => {
  it('穿透無視蜷縮，卻被甲吃掉', () => {
    const cs = fight();
    cs.player.block = 10; cs.player.armour = 6;
    const hp = cs.player.hp;
    damagePlayer(cs, cs.enemies[0]!, 4, { pierce: true });
    expect(cs.player.block, '穿透不碰蜷縮').toBe(10);
    expect(cs.player.armour, '改由甲擋').toBe(2);
    expect(cs.player.hp, '甲夠就不掉血').toBe(hp);
  });

  it('穿透把甲打光才扣血', () => {
    const cs = fight();
    cs.player.block = 10; cs.player.armour = 5;
    const hp = cs.player.hp;
    damagePlayer(cs, cs.enemies[0]!, 9, { pierce: true });
    expect(cs.player.block).toBe(10);
    expect(cs.player.armour).toBe(0);
    expect(hp - cs.player.hp).toBe(4);
  });
});
