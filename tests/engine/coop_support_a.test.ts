import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { playCard, startCombat } from '../../src/engine/combat';
import { damageEnemy } from '../../src/engine/actions';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CombatState, PlayerCombat } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/*
 * 連線支援牌第一批六張（2026-09-13，交辦單 `docs/連線支援牌20張_實作交辦單_2026-09-13.md` 的 A 批）。
 *
 * 這一份守的是**效果真的算對了**，不是「有沒有這張牌」——交辦單特別要求
 * 「不要用只對照文案的測試代替效果驗證」。
 *
 * 每一張都測兩次：**兩個人**（效果落在同伴身上）與**一個人**（退化成落在自己身上）。
 * 單人那一半不是補充題：這些牌會從事件流進單人牌組，退化寫錯的話玩家拿到的是廢牌，
 * 而且畫面不會說任何話。
 */
/** 開一場戰鬥。`mates`＝要不要加第二位（照 `coop.rules.test.ts` 的做法） */
function combat(mates: boolean): { cs: CombatState; me: PlayerCombat; mate: PlayerCombat } {
  const cs = startCombat({
    hp: 60, maxHp: 80, deck: [inst('tanding', 1)], relics: [], potions: [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('coopA')),
  });
  const me = cs.player;
  me.drawPile = []; me.hand = []; me.energy = 99;
  let mate = me;
  if (mates) {
    mate = blankPlayer([], 1);
    cs.players.push(mate);
    mate.energy = 99; mate.hand = [];
    mate.drawPile = [inst('tanding', 90), inst('tanding', 91), inst('tanding', 92), inst('tanding', 93)];
    expect(cs.players.length, '這一份要兩個人才測得出來').toBe(2);
  }
  return { cs, me, mate };
}

const twoPlayer = (): { cs: CombatState; me: PlayerCombat; mate: PlayerCombat } => combat(true);
const solo = (): { cs: CombatState; me: PlayerCombat } => {
  const { cs, me } = combat(false);
  return { cs, me };
};

let uid = 9000;
/** 把一張牌塞進指定玩家手上再打。回傳它的 uid */
function play(cs: CombatState, who: PlayerCombat, id: string, target?: number, up = false): number {
  const u = uid++;
  who.hand.push({ uid: u, cardId: id, upgraded: up });
  playCard(cs, u, target);
  return u;
}

describe('連線支援牌 A 批：六張都在，規格對得上交辦單', () => {
  const SPEC: [string, string, number, string, string][] = [
    ['bangnidianyixia', '幫你墊一下', 1, '攻擊', '常見'],
    ['shoujiewoyixia', '手借我一下', 1, '技能', '罕見'],
    ['huannieduochoudian', '換你多抽點', 0, '技能', '常見'],
    ['wobangnishouwei', '我幫你收尾', 1, '攻擊', '罕見'],
    ['huannimangyixia', '換你忙一下', 1, '技能', '稀有'],
    ['genzhewoduohao', '跟著我躲好', 0, '技能', '罕見'],
  ];

  for (const [id, name, cost, type, rarity] of SPEC) {
    it(`${name}：費用、類型、稀有度、連線旗標`, () => {
      const d = cardById[id];
      expect(d, `${name} 不見了`).toBeTruthy();
      expect(d!.name).toBe(name);
      expect(d!.cost, '費用跟交辦單不符').toBe(cost);
      expect(d!.type).toBe(type);
      expect(d!.rarity).toBe(rarity);
      expect(d!.coop, '要標 coop，不然單人也會抽到').toBe(true);
      expect(d!.upgrade, '要有升級效果').toBeTruthy();
    });
  }

  it('「跟著我躲好」是球球專屬，其餘五張兩個角色都拿得到', () => {
    expect(cardById['genzhewoduohao']!.hero).toBe('ninja');
    for (const [id] of SPEC.filter(([i]) => i !== 'genzhewoduohao')) {
      expect(cardById[id]!.hero, `${cardById[id]!.name} 不該綁角色`).toBeUndefined();
    }
  });
});

describe('幫你墊一下：打人同時護同伴', () => {
  it('兩個人：6 傷，蜷縮給同伴不是自己', () => {
    const { cs, me, mate } = twoPlayer();
    const e = cs.enemies[0]!;
    const hp0 = e.hp;
    me.block = 0; mate.block = 0;
    play(cs, me, 'bangnidianyixia', e.uid);
    expect(hp0 - e.hp, '傷害 6').toBe(6);
    expect(mate.block, '同伴拿到 4').toBe(4);
    expect(me.block, '自己不該拿到（基礎版）').toBe(0);
  });

  it('升級版：同伴 4，自己也 4', () => {
    const { cs, me, mate } = twoPlayer();
    me.block = 0; mate.block = 0;
    play(cs, me, 'bangnidianyixia', cs.enemies[0]!.uid, true);
    expect(mate.block).toBe(4);
    expect(me.block).toBe(4);
  });

  it('一個人：蜷縮退回自己身上；升級版合計 8', () => {
    const a = solo();
    a.me.block = 0;
    play(a.cs, a.me, 'bangnidianyixia', a.cs.enemies[0]!.uid);
    expect(a.me.block, '單人基礎版 4').toBe(4);

    const b = solo();
    b.me.block = 0;
    play(b.cs, b.me, 'bangnidianyixia', b.cs.enemies[0]!.uid, true);
    expect(b.me.block, '單人升級版 4＋4').toBe(8);
  });
});

describe('手借我一下：替同伴回血', () => {
  it('兩個人：血回在同伴身上', () => {
    const { cs, me, mate } = twoPlayer();
    mate.hp = mate.maxHp - 20;
    me.hp = me.maxHp - 20;
    play(cs, me, 'shoujiewoyixia');
    expect(mate.maxHp - mate.hp, '同伴回 8').toBe(12);
    expect(me.maxHp - me.hp, '自己不該回').toBe(20);
  });

  it('升級版先把同伴的減益清掉', () => {
    const { cs, me, mate } = twoPlayer();
    mate.hp = mate.maxHp - 20;
    addStatus(mate, '中毒', 5);
    addStatus(mate, '翻肚', 2);
    play(cs, me, 'shoujiewoyixia', undefined, true);
    expect(getStatus(mate, '中毒'), '中毒該被清掉').toBe(0);
    expect(getStatus(mate, '翻肚'), '翻肚該被清掉').toBe(0);
    expect(mate.maxHp - mate.hp).toBe(12);
  });

  it('一個人：回自己的', () => {
    const { cs, me } = solo();
    me.hp = me.maxHp - 20;
    play(cs, me, 'shoujiewoyixia');
    expect(me.maxHp - me.hp).toBe(12);
  });
});

describe('我幫你收尾：打倒才給飯糰', () => {
  it('兩個人：直接打倒 → 同伴 +1 飯糰', () => {
    const { cs, me, mate } = twoPlayer();
    const e = cs.enemies[0]!;
    e.hp = 5;                                   // 9 傷一定打得死
    const before = mate.energy;
    play(cs, me, 'wobangnishouwei', e.uid);
    expect(e.dead, '該被打倒').toBe(true);
    expect(mate.energy - before, '同伴拿到 1 顆').toBe(1);
  });

  it('沒打倒就不給（毒之後才毒死的也不算）', () => {
    const { cs, me, mate } = twoPlayer();
    const e = cs.enemies[0]!;
    e.hp = 99;
    const before = mate.energy;
    play(cs, me, 'wobangnishouwei', e.uid);
    expect(e.dead).toBe(false);
    expect(mate.energy - before, '沒打倒不該給').toBe(0);
    // 事後才死掉也不補發
    damageEnemy(cs, e, 999, { direct: true });
    expect(mate.energy - before).toBe(0);
  });

  it('升級版：沒打倒也讓同伴抽一張', () => {
    const { cs, me, mate } = twoPlayer();
    const e = cs.enemies[0]!;
    e.hp = 99;
    const hand0 = mate.hand.length;
    play(cs, me, 'wobangnishouwei', e.uid, true);
    expect(mate.hand.length - hand0, '同伴抽 1 張').toBe(1);
  });
});

describe('換你忙一下：把進攻機會讓出去', () => {
  it('基礎版只鎖自己，同伴照打', () => {
    const { cs, me, mate } = twoPlayer();
    const hand0 = mate.hand.length;
    const en0 = mate.energy;
    play(cs, me, 'huannimangyixia');
    expect(mate.hand.length - hand0, '同伴抽 2 張').toBe(2);
    expect(mate.energy - en0, '同伴 +1 飯糰').toBe(1);
    expect(me.noAttacks, '自己被鎖住').toBe(true);
    expect(mate.noAttacks, '同伴不該被鎖').toBeFalsy();
  });

  it('升級版不再鎖自己', () => {
    const { cs, me } = twoPlayer();
    play(cs, me, 'huannimangyixia', undefined, true);
    expect(me.noAttacks).toBeFalsy();
  });
});

describe('跟著我躲好：看自己有沒有隱身決定給什麼', () => {
  it('自己有隱身 → 同伴拿隱身，不是蜷縮', () => {
    const { cs, me, mate } = twoPlayer();
    addStatus(me, '隱身', 1);
    mate.block = 0;
    play(cs, me, 'genzhewoduohao');
    expect(getStatus(mate, '隱身'), '同伴該拿到隱身').toBeGreaterThanOrEqual(1);
    expect(mate.block, '基礎版不是兩者都給').toBe(0);
  });

  it('自己沒隱身 → 同伴拿 8 蜷縮，不是隱身', () => {
    const { cs, me, mate } = twoPlayer();
    expect(getStatus(me, '隱身'), '這一局開場不該有隱身').toBe(0);
    mate.block = 0;
    play(cs, me, 'genzhewoduohao');
    expect(mate.block, '同伴該拿到 8 點').toBe(8);
    expect(getStatus(mate, '隱身'), '不該給隱身').toBe(0);
  });

  it('升級版另外讓同伴抽一張', () => {
    const { cs, me, mate } = twoPlayer();
    const hand0 = mate.hand.length;
    play(cs, me, 'genzhewoduohao', undefined, true);
    expect(mate.hand.length - hand0).toBe(1);
  });
});
