import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CombatState, PlayerCombat } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/*
 * 連線支援牌 C 批六張（2026-09-13）。
 *
 * 這一批全是「排到下一輪才發」與「每輪監聽一次」，也就是**跨回合的狀態**——
 * 這種東西寫錯了畫面不會說任何話，只會「數字跟你想的不一樣」。
 * 交辦單列了四條必須核對的，每一條在這裡都有對應的測試：
 *   1. 下一輪才發的東西，要在**回滿飯糰、清掉舊蜷縮之後**才給（不然給了就被蓋掉）
 *   2. 每輪的觸發次數**只在自己回合開始重置**，不因對方出牌或按結束而重置
 *   3. 能力牌**自己的施放不觸發自己**
 *   4. 「命中」＝真的扣到血（使用者 2026-09-13 裁定）：被蜷縮全擋掉不算
 */
function combat(mates = true): { cs: CombatState; me: PlayerCombat; mate: PlayerCombat } {
  const cs = startCombat({
    hp: 60, maxHp: 80, deck: [inst('tanding', 1)], relics: [], potions: [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('coopC')),
  });
  const me = cs.player;
  me.drawPile = []; me.hand = []; me.energy = 99; me.block = 0;
  let mate = me;
  if (mates) {
    mate = blankPlayer([], 1);
    cs.players.push(mate);
    mate.energy = 99; mate.hand = []; mate.block = 0;
    mate.drawPile = Array.from({ length: 8 }, (_, i) => inst('tanding', 200 + i));
  }
  return { cs, me, mate };
}

let uid = 6000;
/** `playCard` 吃的是**座位號**不是玩家物件，忘了帶就永遠當成 0 號在打（第一版就這樣） */
function play(cs: CombatState, who: PlayerCombat, id: string, target?: number, up = false): void {
  const u = uid++;
  who.hand.push({ uid: u, cardId: id, upgraded: up });
  const seat = cs.players.indexOf(who);
  playCard(cs, u, target, seat);
}

/**
 * 把兩個人都推到下一輪。
 *
 * **`endTurn` 自己就會接著開下一輪**（`finishEnemyTurn` 尾端會叫 `startPlayerTurn`），
 * 所以這裡不可以再叫一次——多叫一次等於跑了兩輪，剛排好的「下一輪多 1 顆飯糰」
 * 會被第二次的回滿洗掉，抽牌也會多抽一輪。第一版就是這樣，三條測試同時紅。
 */
function nextRound(cs: CombatState): void {
  for (const p of cs.players) p.ready = true;
  endTurn(cs);
}

describe('C 批六張：規格對得上交辦單', () => {
  const SPEC: [string, string, number, string, string][] = [
    ['xianbangniliuzhe', '先幫你留著', 1, '技能', '常見'],
    ['nimangwobuwei', '你忙我補位', 1, '能力', '稀有'],
    ['fantuanliuyikou', '飯糰留一口', 1, '能力', '罕見'],
    ['youwozaiqianmian', '有我在前面', 1, '能力', '稀有'],
    ['biepengzhenjian', '別碰針尖喔', 1, '技能', '罕見'],
    ['woyouxianbeihao', '我有先備好', 2, '能力', '稀有'],
  ];
  for (const [id, name, cost, type, rarity] of SPEC) {
    it(`${name}：費用、類型、稀有度、連線旗標`, () => {
      const d = cardById[id]!;
      expect(d, `${name} 不見了`).toBeTruthy();
      expect([d.name, d.cost, d.type, d.rarity, d.coop]).toEqual([name, cost, type, rarity, true]);
      expect(d.upgrade).toBeTruthy();
    });
  }
  it('角色專屬對得上：有我在前面＝球球，別碰針尖喔／我有先備好＝菲菲', () => {
    expect(cardById['youwozaiqianmian']!.hero).toBe('ninja');
    expect(cardById['biepengzhenjian']!.hero).toBe('feifei');
    expect(cardById['woyouxianbeihao']!.hero).toBe('feifei');
  });
});

describe('先幫你留著：下一輪才發，而且發得到', () => {
  it('這一輪自己 6 點；同伴這一輪沒有，下一輪才有', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'xianbangniliuzhe');
    expect(me.block, '自己立刻 6 點').toBe(6);
    expect(mate.block, '同伴這一輪還沒有').toBe(0);
    nextRound(cs);
    expect(mate.block, '下一輪開始才給——而且要在舊蜷縮清掉之後給，不然會被歸零').toBe(6);
  });

  it('升級版：同伴現在也拿 4，下一輪再拿 6', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'xianbangniliuzhe', undefined, true);
    expect(mate.block, '現在 4 點').toBe(4);
    nextRound(cs);
    expect(mate.block, '下一輪 6 點').toBe(6);
  });

  it('只發一次，不會每輪都給', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'xianbangniliuzhe');
    nextRound(cs);
    expect(mate.block).toBe(6);
    nextRound(cs);
    expect(mate.block, '再下一輪不該又冒出來').toBe(0);
  });
});

describe('你忙我補位：看同伴打牌', () => {
  it('同伴打技能牌 → 自己抽 1；能力牌自己的施放不算', () => {
    const { cs, me, mate } = combat();
    me.drawPile = [inst('tanding', 300), inst('tanding', 301)];
    const hand0 = me.hand.length;
    play(cs, me, 'nimangwobuwei');
    expect(me.hand.length - hand0, '打出這張能力牌本身不該觸發自己').toBe(0);
    play(cs, mate, 'tanding');                    // 坦定＝技能牌
    expect(me.hand.length - hand0, '同伴打技能牌後自己抽 1').toBe(1);
  });

  it('每輪只發一次，下一輪重置', () => {
    const { cs, me, mate } = combat();
    me.drawPile = Array.from({ length: 20 }, (_, i) => inst('tanding', 310 + i));
    play(cs, me, 'nimangwobuwei');
    const h0 = me.hand.length;
    play(cs, mate, 'tanding');
    play(cs, mate, 'tanding');
    expect(me.hand.length - h0, '同一輪第二次不該再抽').toBe(1);
    nextRound(cs);
    const h1 = me.hand.length;
    play(cs, mate, 'tanding');
    expect(me.hand.length - h1, '下一輪重置了，又抽得到').toBe(1);
  });

  it('基礎版只認技能牌，攻擊牌不算', () => {
    const { cs, me, mate } = combat();
    me.drawPile = [inst('tanding', 320)];
    play(cs, me, 'nimangwobuwei');
    const h0 = me.hand.length;
    play(cs, mate, 'sanjo', cs.enemies[0]!.uid);   // 貓抓＝攻擊牌
    expect(me.hand.length - h0, '攻擊牌不該觸發基礎版').toBe(0);
  });
});

describe('有我在前面：自己出手，同伴受惠', () => {
  it('自己打攻擊牌 → 同伴 6 點蜷縮；自己沒有', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'youwozaiqianmian');
    me.block = 0; mate.block = 0;
    play(cs, me, 'sanjo', cs.enemies[0]!.uid);
    expect(mate.block, '同伴拿 6 點').toBe(6);
    expect(me.block, '自己不該拿到').toBe(0);
  });

  it('每輪只發一次', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'youwozaiqianmian');
    mate.block = 0;
    play(cs, me, 'sanjo', cs.enemies[0]!.uid);
    play(cs, me, 'sanjo', cs.enemies[0]!.uid);
    expect(mate.block, '同一輪第二張攻擊牌不該再給').toBe(6);
  });
});

describe('別碰針尖喔：替同伴的下一擊附毒', () => {
  it('同伴下一張攻擊牌真的打到人 → 那隻多 2 層毒；用掉就清', () => {
    const { cs, me, mate } = combat();
    const e = cs.enemies[0]!;
    play(cs, me, 'biepengzhenjian');
    expect(mate.block, '同伴先拿 4 點蜷縮').toBe(4);
    play(cs, mate, 'sanjo', e.uid);
    expect(getStatus(e, '中毒'), '打到人就上 2 層').toBe(2);
    play(cs, mate, 'sanjo', e.uid);
    expect(getStatus(e, '中毒'), '用掉就清，第二張不該再上').toBe(2);
  });

  /** 使用者 2026-09-13 裁定：**要真的扣到血才算**。被蜷縮全擋掉不算命中 */
  it('被蜷縮全擋掉 → 不算命中，附毒留著', () => {
    const { cs, me, mate } = combat();
    const e = cs.enemies[0]!;
    e.block = 999;
    play(cs, me, 'biepengzhenjian');
    play(cs, mate, 'sanjo', e.uid);
    expect(getStatus(e, '中毒'), '一點血都沒扣到，不算命中').toBe(0);
    expect(mate.poisonNextAttack, '附毒要留著等下一次').toBeTruthy();
  });

  it('本輪沒用到就過期，不跨輪', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'biepengzhenjian');
    nextRound(cs);
    expect(mate.poisonNextAttack, '待觸發的附毒不跨輪').toBeUndefined();
  });
});

describe('我有先備好：攻擊打中原本就中毒的魔物', () => {
  it('同伴打中原本就中毒的 → 兩個人各 4 點', () => {
    const { cs, me, mate } = combat();
    const e = cs.enemies[0]!;
    play(cs, me, 'woyouxianbeihao');
    addStatus(e, '中毒', 3);
    me.block = 0; mate.block = 0;
    play(cs, mate, 'sanjo', e.uid);
    expect(me.block, '自己 4 點').toBe(4);
    expect(mate.block, '同伴 4 點').toBe(4);
  });

  it('目標本來沒毒就不算（這張攻擊自己附的毒不算數）', () => {
    const { cs, me, mate } = combat();
    const e = cs.enemies[0]!;
    play(cs, me, 'woyouxianbeihao');
    me.block = 0; mate.block = 0;
    play(cs, mate, 'feifei_feizhen', e.uid);      // 飛針會上毒，但「打之前」是沒有的
    expect(me.block, '打之前沒毒，不該觸發').toBe(0);
  });

  it('基礎版不認自己出手，升級版認', () => {
    const base = combat();
    const be = base.cs.enemies[0]!;
    play(base.cs, base.me, 'woyouxianbeihao');
    addStatus(be, '中毒', 3);
    base.me.block = 0; base.mate.block = 0;
    play(base.cs, base.me, 'sanjo', be.uid);
    expect(base.me.block, '基礎版只認同伴出手').toBe(0);

    const up = combat();
    const ue = up.cs.enemies[0]!;
    play(up.cs, up.me, 'woyouxianbeihao', undefined, true);
    addStatus(ue, '中毒', 3);
    up.me.block = 0; up.mate.block = 0;
    play(up.cs, up.me, 'sanjo', ue.uid);
    expect(up.me.block, '升級版自己出手也算').toBe(4);
  });

  it('升級版每輪仍只發一次，不是兩人各一次', () => {
    const { cs, me, mate } = combat();
    const e = cs.enemies[0]!;
    play(cs, me, 'woyouxianbeihao', undefined, true);
    addStatus(e, '中毒', 9);
    me.block = 0; mate.block = 0;
    play(cs, me, 'sanjo', e.uid);
    play(cs, mate, 'sanjo', e.uid);
    expect(me.block, '兩次出手合計只發一份').toBe(4);
  });
});

describe('飯糰留一口：留一顆給同伴的下一輪', () => {
  it('回合結束還有飯糰 → 扣 1、同伴下一輪多 1', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'fantuanliuyikou');
    me.energy = 3;
    const base = mate.maxEnergy;
    nextRound(cs);
    expect(mate.energy, '同伴下一輪多 1 顆').toBe(base + 1);
  });

  it('飯糰用完就不發動', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'fantuanliuyikou');
    me.energy = 0;
    const base = mate.maxEnergy;
    nextRound(cs);
    expect(mate.energy, '自己沒剩就不該給').toBe(base);
  });

  it('升級版：同伴下一輪還多抽 1 張', () => {
    const { cs, me, mate } = combat();
    play(cs, me, 'fantuanliuyikou', undefined, true);
    me.energy = 3;
    // 比「有沒有多抽一張」用 `drawNextTurn` 判最穩：直接數抽牌堆會被洗牌與手牌上限干擾
    expect(mate.drawNextTurn, '升級版要替同伴排一張').toBe(0);
    nextRound(cs);
    expect(mate.drawNextTurn, '發完就歸零').toBe(0);
    expect(mate.hand.length, '基本 5 張 ＋ 多的 1 張').toBe(6);
  });
});
