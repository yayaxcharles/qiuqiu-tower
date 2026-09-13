import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CombatState, PlayerCombat } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/*
 * 連線支援牌 B 批六張（2026-09-13）。
 *
 * 這一批全部是「讀同伴的狀態」或「把東西交給同伴」，不開選單。
 * 交辦單點名了三個**算錯了也不會出聲**的地方，每一個都在這裡釘死：
 *   1. 靠你一下：讀的是**結算前**的蜷縮，自己這 5 點不可以被算進加成
 *   2. 這些你先吃：飯糰**守恆**——自己少多少，同伴才多多少，不能憑空生
 *   3. 照你說的打：看的是**打之前**目標有沒有毒，這張自己附的不算
 */
function combat(mates: boolean): { cs: CombatState; me: PlayerCombat; mate: PlayerCombat } {
  const cs = startCombat({
    hp: 60, maxHp: 80, deck: [inst('tanding', 1)], relics: [], potions: [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('coopB')),
  });
  const me = cs.player;
  me.drawPile = []; me.hand = []; me.energy = 99; me.block = 0;
  let mate = me;
  if (mates) {
    mate = blankPlayer([], 1);
    cs.players.push(mate);
    mate.energy = 99; mate.hand = []; mate.block = 0;
    mate.drawPile = [inst('tanding', 90), inst('tanding', 91), inst('tanding', 92)];
  }
  return { cs, me, mate };
}
const two = (): ReturnType<typeof combat> => combat(true);
const one = (): ReturnType<typeof combat> => combat(false);

let uid = 7000;
function play(cs: CombatState, who: PlayerCombat, id: string, target?: number, up = false): void {
  const u = uid++;
  who.hand.push({ uid: u, cardId: id, upgraded: up });
  playCard(cs, u, target);
}

describe('B 批六張：規格對得上交辦單', () => {
  const SPEC: [string, string, number, string, string][] = [
    ['kaoniyixia', '靠你一下', 1, '技能', '罕見'],
    ['zhexienixianchi', '這些你先吃', 0, '技能', '罕見'],
    ['zhaonishuodeda', '照你說的打', 1, '攻擊', '常見'],
    ['jienideliqi', '借你的力氣', 1, '攻擊', '罕見'],
    ['chenxianzaichushou', '趁現在出手', 1, '技能', '罕見'],
    ['biezhanzaishenshang', '別沾在身上', 1, '技能', '罕見'],
  ];
  for (const [id, name, cost, type, rarity] of SPEC) {
    it(`${name}：費用、類型、稀有度、連線旗標`, () => {
      const d = cardById[id]!;
      expect(d, `${name} 不見了`).toBeTruthy();
      expect([d.name, d.cost, d.type, d.rarity, d.coop]).toEqual([name, cost, type, rarity, true]);
      expect(d.upgrade, '要有升級效果').toBeTruthy();
    });
  }
  it('趁現在出手升級後是 0 費（交辦單指定）', () => {
    expect(cardById['chenxianzaichushou']!.upgrade.cost).toBe(0);
  });
});

describe('靠你一下：讀同伴的蜷縮，同伴不會少', () => {
  it('同伴 12 點 → 自己拿 5＋6；同伴一點都沒少', () => {
    const { cs, me, mate } = two();
    mate.block = 12;
    play(cs, me, 'kaoniyixia');
    expect(me.block, '5 ＋ 12 的一半 6').toBe(11);
    expect(mate.block, '同伴不可以變少').toBe(12);
  });

  it('加成有上限：同伴 40 點也只多 8', () => {
    const { cs, me, mate } = two();
    mate.block = 40;
    play(cs, me, 'kaoniyixia');
    expect(me.block, '5 ＋ 上限 8').toBe(13);
  });

  it('升級版讀全額：同伴 6 點 → 5＋6', () => {
    const { cs, me, mate } = two();
    mate.block = 6;
    play(cs, me, 'kaoniyixia', undefined, true);
    expect(me.block).toBe(11);
  });

  /*
   * **單人時最容易寫錯的一條**：`ally()` 回的是自己，如果先給 5 點再讀，
   * 這張牌剛給的那 5 點會被算進加成，變成「越打越多」。
   * 交辦單把它列成必須核對的項目。
   */
  it('一個人：讀的是打之前的自己，這張給的 5 點不算在裡面', () => {
    const { cs, me } = one();
    me.block = 0;
    play(cs, me, 'kaoniyixia');
    expect(me.block, '打之前 0 點 → 只有基本的 5').toBe(5);

    const b = one();
    b.me.block = 10;
    play(b.cs, b.me, 'kaoniyixia');
    expect(b.me.block, '打之前 10 點 → 5 ＋ 一半 5').toBe(20);
  });
});

describe('這些你先吃：飯糰守恆', () => {
  it('自己有 3 顆 → 交出 2、自己剩 1、同伴 +2', () => {
    const { cs, me, mate } = two();
    me.energy = 3; mate.energy = 0;
    play(cs, me, 'zhexienixianchi');
    expect(me.energy, '自己剩 1').toBe(1);
    expect(mate.energy, '同伴 +2').toBe(2);
  });

  it('自己只有 1 顆 → 只交出 1，不能透支', () => {
    const { cs, me, mate } = two();
    me.energy = 1; mate.energy = 0;
    play(cs, me, 'zhexienixianchi');
    expect(me.energy).toBe(0);
    expect(mate.energy, '自己少多少對方才多多少').toBe(1);
  });

  it('一個人：不轉飯糰（不然等於憑空多出來），但還是抽牌', () => {
    const { cs, me } = one();
    me.energy = 3;
    me.drawPile = [inst('tanding', 80), inst('tanding', 81)];
    const hand0 = me.hand.length;
    play(cs, me, 'zhexienixianchi');
    expect(me.energy, '一個人時不該有任何轉移').toBe(3);
    expect(me.hand.length - hand0, '自己抽 1 張').toBe(1);
  });
});

describe('照你說的打：看的是打之前的狀態', () => {
  it('目標本來就中毒 → 同伴抽 1', () => {
    const { cs, me, mate } = two();
    const e = cs.enemies[0]!;
    addStatus(e, '中毒', 3);
    const hand0 = mate.hand.length;
    play(cs, me, 'zhaonishuodeda', e.uid);
    expect(mate.hand.length - hand0).toBe(1);
  });

  it('目標本來沒毒 → 不抽', () => {
    const { cs, me, mate } = two();
    const e = cs.enemies[0]!;
    expect(getStatus(e, '中毒')).toBe(0);
    const hand0 = mate.hand.length;
    play(cs, me, 'zhaonishuodeda', e.uid);
    expect(mate.hand.length - hand0, '這張自己沒上毒，本來就不該抽').toBe(0);
  });

  it('升級版：任何減益都算', () => {
    const { cs, me, mate } = two();
    const e = cs.enemies[0]!;
    addStatus(e, '懶洋洋', 1);
    const hand0 = mate.hand.length;
    play(cs, me, 'zhaonishuodeda', e.uid, true);
    expect(mate.hand.length - hand0).toBe(1);
  });
});

describe('借你的力氣：同伴的爪力也幫得上忙', () => {
  it('同伴 3 爪力 → 6＋3＝9 傷；同伴的爪力不會被扣', () => {
    const { cs, me, mate } = two();
    const e = cs.enemies[0]!;
    addStatus(mate, '爪力', 3);
    const hp0 = e.hp;
    play(cs, me, 'jienideliqi', e.uid);
    expect(hp0 - e.hp).toBe(9);
    expect(getStatus(mate, '爪力'), '同伴的爪力不該變少').toBe(3);
  });

  it('加成有上限 8：同伴 20 爪力也只加 8', () => {
    const { cs, me, mate } = two();
    const e = cs.enemies[0]!;
    addStatus(mate, '爪力', 20);
    const hp0 = e.hp;
    play(cs, me, 'jienideliqi', e.uid);
    expect(hp0 - e.hp).toBe(14);
  });

  it('出牌者自己的爪力照一般規則另外算', () => {
    const { cs, me, mate } = two();
    const e = cs.enemies[0]!;
    addStatus(me, '爪力', 2);
    addStatus(mate, '爪力', 3);
    const hp0 = e.hp;
    play(cs, me, 'jienideliqi', e.uid);
    expect(hp0 - e.hp, '6 ＋ 同伴 3 ＋ 自己 2').toBe(11);
  });

  it('升級版無視防禦', () => {
    const { cs, me } = two();
    const e = cs.enemies[0]!;
    e.block = 50;
    const hp0 = e.hp;
    play(cs, me, 'jienideliqi', e.uid, true);
    expect(hp0 - e.hp, '蜷縮擋不住').toBe(6);
    expect(e.block, '蜷縮一點都沒掉').toBe(50);
  });
});

describe('趁現在出手：把加倍給同伴', () => {
  it('同伴拿到加倍，自己沒有', () => {
    const { cs, me, mate } = two();
    play(cs, me, 'chenxianzaichushou');
    expect(mate.doubleNext, '同伴的下一擊加倍').toBe(1);
    expect(me.doubleNext, '自己不該拿到').toBe(0);
    expect(me.block, '自己拿 4 蜷縮').toBe(4);
  });

  it('一個人：退化成自己拿加倍', () => {
    const { cs, me } = one();
    play(cs, me, 'chenxianzaichushou');
    expect(me.doubleNext).toBe(1);
  });
});

describe('別沾在身上：把同伴的麻煩丟回魔物身上', () => {
  it('移轉不是複製：同伴身上清掉，魔物身上長出來', () => {
    const { cs, me, mate } = two();
    const e = cs.enemies[0]!;
    addStatus(mate, '中毒', 6);
    addStatus(mate, '懶洋洋', 2);
    play(cs, me, 'biezhanzaishenshang', e.uid);
    expect(getStatus(mate, '中毒'), '同伴身上要清掉').toBe(0);
    expect(getStatus(mate, '懶洋洋')).toBe(0);
    expect(getStatus(e, '中毒'), '整份移過去').toBe(6);
    expect(getStatus(e, '懶洋洋')).toBe(2);
  });

  it('沒東西可移也打得出去；升級版照樣給兩個人各 4 蜷縮', () => {
    const { cs, me, mate } = two();
    me.block = 0; mate.block = 0;
    play(cs, me, 'biezhanzaishenshang', cs.enemies[0]!.uid, true);
    expect(me.block, '自己 4').toBe(4);
    expect(mate.block, '同伴 4').toBe(4);
  });
});
