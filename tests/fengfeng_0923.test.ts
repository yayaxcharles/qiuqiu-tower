import { describe, expect, it } from 'vitest';
import BOT_SRC from '../src/engine/bot.ts?raw';
import SMARTBOT_SRC from '../src/engine/smartbot.ts?raw';
import COMBAT_UI_SRC from '../src/ui/screens/combat.ts?raw';
import { canPlay, canUsePotion, endTurn, playCard, potionBlockedReason, startCombat, usePotion } from '../src/engine/combat';
import { Rng, seedFromString } from '../src/engine/rng';
import { cardById, cardNameFor, cards, inHeroCollection } from '../src/content/cards';
import { potionById } from '../src/content/potions';
import { describeCard } from '../src/ui/cardtext';
import { poolNameFor } from '../src/ui/compendium';
import type { CombatState, PlayerCombat } from '../src/engine/types';
import { blankPlayer, inst } from './helpers';

/*
 * 2026-09-23 引擎稽核（scratchpad audit/engine.md）低 1～6：封封那一路的六個小毛病。
 * 每一條都先把修正改回舊寫法確認會紅，才改回來（做法寫在 w0923/fix.md）。
 */

let uid = 95_000;
function setup(): { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [], encounterId: 'wood_dummy',
    rng: new Rng(seedFromString('fengfeng-0923')), hero: 'fengfeng' });
  const p = cs.player;
  p.hand = []; p.drawPile = []; p.discardPile = []; p.exhaustPile = []; p.energy = 9; p.block = 0; p.qi = 0;
  cs.enemies[0]!.hp = cs.enemies[0]!.maxHp = 500;
  return { cs, p };
}
function give(p: PlayerCombat, id: string, upgraded = false): number {
  const u = uid++;
  p.hand.push({ uid: u, cardId: id, upgraded });
  return u;
}
function play(cs: CombatState, p: PlayerCombat, id: string, upgraded = false): boolean {
  return playCard(cs, give(p, id, upgraded), undefined, p.seat);
}

describe('低-1：集中精神之後，飯糰類忍具變成用不出來（不再白白吃掉）', () => {
  it('兩顆飯糰、飯糰擋下來、留在袋子裡；不給飯糰的照常能用；下一回合恢復', () => {
    const { cs, p } = setup();
    p.potions = ['dried_fish_bundle', 'onigiri', 'smoke_bomb'];
    for (const id of ['dried_fish_bundle', 'onigiri']) {
      expect(potionBlockedReason(p, potionById[id]!), `${id} 集中精神之前用得出來`).toBeNull();
    }
    expect(play(cs, p, 'fengfeng_jizhong')).toBe(true);
    for (const id of ['dried_fish_bundle', 'onigiri']) {
      expect(potionBlockedReason(p, potionById[id]!), id).toMatch(/集中精神.*飯糰/);
      expect(canUsePotion(cs, id), id).toBe(false);
      expect(usePotion(cs, id), id).toBe(false);
    }
    expect(p.potions, '兩支都還在袋子裡').toEqual(['dried_fish_bundle', 'onigiri', 'smoke_bomb']);
    expect(usePotion(cs, 'smoke_bomb'), '不給飯糰的忍具不受影響').toBe(true);

    endTurn(cs);
    expect(cs.phase).toBe('player');
    expect(canUsePotion(cs, 'dried_fish_bundle'), '下一個自己的回合就能喝').toBe(true);
  });

  // 主控 2026-09-23 裁決：還抽得到牌的照樣能喝，但被擋掉的飯糰要在戰報說出來
  it('半卷殘頁照樣能喝、抽得到兩張；飯糰那一半被擋，戰報寫出來', () => {
    const { cs, p } = setup();
    p.potions = ['secret_scroll'];
    p.drawPile = [inst('fengfeng_hushen', uid++), inst('fengfeng_hushen', uid++), inst('fengfeng_hushen', uid++)];
    expect(play(cs, p, 'fengfeng_jizhong')).toBe(true);
    expect(potionBlockedReason(p, potionById['secret_scroll']!)).toBeNull();
    const energy = p.energy;
    const hand = p.hand.length;
    const logs = cs.log.length;
    expect(usePotion(cs, 'secret_scroll')).toBe(true);
    expect(p.hand.length - hand, '抽到兩張').toBe(2);
    expect(p.energy, '飯糰一顆都沒多').toBe(energy);
    expect(cs.log.slice(logs)).toContain('集中精神：這回合拿不到飯糰');
  });

  it('同伴送的飯糰被擋也寫出來，連線時帶名字（給一顆、轉兩顆兩條路都算）', () => {
    const { cs, p } = setup();
    const q = blankPlayer([], 1); q.hero = 'dangdang'; q.energy = 9; q.hand = []; q.drawPile = [];
    cs.players.push(q);
    expect(play(cs, p, 'fengfeng_jizhong')).toBe(true);
    const energy = p.energy;
    let logs = cs.log.length;
    expect(play(cs, q, 'fantuanfenni')).toBe(true);
    expect(p.energy).toBe(energy);
    expect(cs.log.slice(logs)).toContain('集中精神：封封這回合拿不到飯糰');
    logs = cs.log.length;
    const qEnergy = q.energy;
    expect(play(cs, q, 'zhexienixianchi')).toBe(true);
    expect([p.energy, q.energy], '轉移型不扣送的人').toEqual([energy, qEnergy]);
    expect(cs.log.slice(logs)).toContain('集中精神：封封這回合拿不到飯糰');
  });

  it('起死回生丹的生命門檻照舊走同一支，原因字串就是資料上那一句', () => {
    const { p } = setup();
    const def = potionById['revive_pill']!;
    p.hp = 80;
    expect(potionBlockedReason(p, def)).toBe(def.usable!.reason);
    p.hp = 10;
    expect(potionBlockedReason(p, def)).toBeNull();
  });

  it('畫面與兩支機器人都讀同一支（各寫一套會走鐘）', () => {
    const ui = COMBAT_UI_SRC.replace(/\r\n/g, '\n');
    expect(ui).toContain('const blocked = potionBlockedReason(p, def);');
    expect(ui).not.toContain('def.usable.check(p.hp, p.maxHp)');
    expect(BOT_SRC).toContain('potionBlockedReason(cs.player, def)');
    expect(SMARTBOT_SRC).toContain('potionBlockedReason(p, def) !== null');
  });
});

describe('低-2：絕學·藏鋒的同名取高', () => {
  it('牌面基礎版、升級版都寫「同名取高」', () => {
    const def = cardById['fengfeng_cunfeng']!;
    expect(describeCard(def, false)).toBe('每回合開始時獲得 2 點蓄氣（同名取高）。');
    expect(describeCard(def, true)).toBe('每回合開始時獲得 2 點蓄氣（同名取高）。');
  });

  it('已掛基礎版時，升級版（只降費用、能力一模一樣）打不出來，飯糰與手牌不動', () => {
    const { cs, p } = setup();
    expect(play(cs, p, 'fengfeng_cunfeng')).toBe(true);
    const u = give(p, 'fengfeng_cunfeng', true);
    const before = { energy: p.energy, hand: p.hand.slice(), powers: structuredClone(p.powers) };
    expect(canPlay(cs, u, undefined, p.seat)).toEqual({ ok: false, reason: '同名或更高版本的能力已經生效' });
    expect(playCard(cs, u, undefined, p.seat)).toBe(false);
    expect({ energy: p.energy, hand: p.hand, powers: p.powers }).toEqual(before);
  });

  it('數字真的變大的升級版照舊取代基礎版（循息）', () => {
    const { cs, p } = setup();
    expect(play(cs, p, 'fengfeng_xunxi')).toBe(true);
    expect(play(cs, p, 'fengfeng_xunxi', true)).toBe(true);
    expect(p.powers.filter((pw) => pw.cardId === 'fengfeng_xunxi')).toMatchObject([{ upgraded: true }]);
  });
});

describe('低-3：門檻句補「至少」與「再」', () => {
  it('退步守勢、看準劍路', () => {
    expect(describeCard(cardById['fengfeng_tuibu']!, false)).toBe('獲得 8 點蜷縮，出牌前有至少 3 點蓄氣的話，再獲得 3 點蜷縮。');
    expect(describeCard(cardById['fengfeng_tuibu']!, true)).toBe('獲得 10 點蜷縮，出牌前有至少 3 點蓄氣的話，再獲得 4 點蜷縮。');
    expect(describeCard(cardById['fengfeng_kanshi']!, false)).toBe('抽 2 張牌，出牌前有至少 4 點蓄氣的話，再抽 1 張牌。');
  });
});

describe('低-4：借我擋一下補「一個人玩時同伴＝你自己」', () => {
  it('條件本身在看同伴，句尾要補那一句', () => {
    expect(describeCard(cardById['fengfeng_jiewo']!, false))
      .toBe('獲得 3 點蓄氣，同伴原有至少 8 點蜷縮的話，再獲得 2 點蓄氣。一個人玩時「同伴」＝你自己。');
  });
});

describe('低-5：戰鬥雜牌不觸發「打出牌後」的能力', () => {
  it('掛著循息時打掉眼冒金星、黏液不給蓄氣，也不吃掉這回合那一次', () => {
    const { cs, p } = setup();
    expect(play(cs, p, 'fengfeng_xunxi')).toBe(true);
    expect(play(cs, p, 'dazed_card')).toBe(true);
    expect(play(cs, p, 'slime_card')).toBe(true);
    expect(p.qi, '雜牌不算技能牌').toBe(0);
    expect(play(cs, p, 'fengfeng_hushen')).toBe(true);
    expect(p.qi, '這回合第一張真的技能牌才觸發').toBe(1);
  });

  // 主控 2026-09-23 裁決：連線支援牌的監聽照同一個標準（牌面沒寫雜牌也算，就排除）
  it('你忙我補位（看同伴打牌）、有我在前面（看自己打牌）都不吃雜牌', () => {
    const { cs, p } = setup();
    const q = blankPlayer([], 1); q.hero = 'ninja'; q.energy = 9; q.hand = [];
    q.drawPile = [inst('sanjo', uid++), inst('sanjo', uid++)];
    cs.players.push(q);
    p.drawPile = [inst('fengfeng_hushen', uid++), inst('fengfeng_hushen', uid++)];
    // 升級版＝不限牌型，最容易被雜牌吃掉那一次
    // 同伴先掛自己的（不然他打這張能力牌就先用掉我那一次）
    expect(play(cs, q, 'youwozaiqianmian', true)).toBe(true);
    expect(play(cs, p, 'nimangwobuwei', true)).toBe(true);
    const pHand = p.hand.length;
    const pBlock = p.block;
    expect(play(cs, q, 'dazed_card')).toBe(true);
    expect(play(cs, q, 'slime_card')).toBe(true);
    expect(p.hand.length, '同伴打雜牌，我不抽').toBe(pHand);
    expect(p.block, '同伴打雜牌，我不拿蜷縮').toBe(pBlock);
    expect(play(cs, q, 'tanding')).toBe(true);
    expect(p.hand.length, '同伴打真的牌才抽').toBe(pHand + 1);
    expect(p.block, '同伴打真的牌才給蜷縮').toBe(pBlock + 6);
  });
});

describe('低-6：封封手上的共用牌拿掉「忍術·」', () => {
  it('他拿得到的牌沒有一張掛著「忍術·」，絕學留著，球球那邊不動', () => {
    let shared = 0;
    for (const c of cards) {
      if (!inHeroCollection(c, 'fengfeng')) continue;
      const got = cardNameFor(c, 'fengfeng');
      expect(got.startsWith('忍術·'), `${c.name} 還掛著忍術`).toBe(false);
      if (c.name.startsWith('絕學·')) expect(got, `${c.name} 的絕學被吃掉了`).toBe(c.name);
      if (c.name.startsWith('忍術·')) shared += 1;
      expect(cardNameFor(c, 'ninja')).toBe(c.name);
    }
    expect(shared, '真的有共用忍術牌被檢查到').toBeGreaterThan(10);
    expect(cardNameFor(cardById['shunkan']!, 'fengfeng')).toBe('瞬間移動');
  });

  it('圖鑑分區的標題跟著換（跟噹噹的「拳腳」同一套），池子的鍵不動', () => {
    expect(poolNameFor('忍術', 'fengfeng')).toBe('劍術');
    expect(poolNameFor('絕學', 'fengfeng')).toBe('絕學');
    expect(cards.some((c) => (c.pool as string) === '劍術')).toBe(false);
  });
});
