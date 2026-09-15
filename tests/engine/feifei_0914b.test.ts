import { describe, expect, it } from 'vitest';
import { STARTER_DECK, cardById, cardNameFor } from '../../src/content/cards';
import { eventTextFor } from '../../src/content/dialogue';
import { eventById } from '../../src/content/events';
import { playCard, startCombat } from '../../src/engine/combat';
import { pickable } from '../../src/engine/hero';
import { learnCard } from '../../src/engine/mimic';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addCard, newRun } from '../../src/engine/run';
import { checkRun } from '../../src/engine/save';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState } from '../../src/engine/types';
import { describeCard } from '../../src/ui/cardtext';
import { inst } from '../helpers';

/*
 * 使用者 2026-09-14 下午逐張看菲菲抓到的（文字、牌名、牌的歸屬、分身術改疊毒）。
 * 圖在 `tools/make_feifei_fix_0914b.py`，位置在 `tools/rest_portrait_0914.test.ts`。
 */

function start(ids: readonly string[]): CombatState {
  let uid = 1;
  return startCombat({ hp: 70, maxHp: 70, deck: ids.map((id) => inst(id, uid++)), relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('ff-fenshen')) });
}
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) {
    const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1);
  }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('菲菲的分身術：疊毒（22）', () => {
  it('2 層起、這場同一張每打出一次就再加 2 層；升級 3／+3；換一場歸零', () => {
    const cs = start([...STARTER_DECK, 'feifei_fenshen']);
    cs.player.energy = 9;
    const e = cs.enemies[0]!;
    playCard(cs, toHand(cs, 'feifei_fenshen'), e.uid); expect(getStatus(e, '中毒')).toBe(2);    // 2
    playCard(cs, toHand(cs, 'feifei_fenshen'), e.uid); expect(getStatus(e, '中毒')).toBe(6);    // +4
    playCard(cs, toHand(cs, 'feifei_fenshen'), e.uid); expect(getStatus(e, '中毒')).toBe(12);   // +6
    expect(e.hp, '只下毒、不直接打').toBe(e.maxHp);

    const up = start([...STARTER_DECK, 'feifei_fenshen']);
    up.player.energy = 9;
    const ue = up.enemies[0]!;
    const uid = toHand(up, 'feifei_fenshen');
    up.player.hand.find((c) => c.uid === uid)!.upgraded = true;
    playCard(up, uid, ue.uid); expect(getStatus(ue, '中毒')).toBe(3);
    playCard(up, toHand(up, 'feifei_fenshen'), ue.uid); expect(getStatus(ue, '中毒')).toBe(9);   // +6

    const next = start([...STARTER_DECK, 'feifei_fenshen']);
    const ne = next.enemies[0]!;
    playCard(next, toHand(next, 'feifei_fenshen'), ne.uid); expect(getStatus(ne, '中毒'), '換一場從頭算').toBe(2);
  });

  it('牌面照使用者給的句子，疊過就印當下的層數', () => {
    const d = cardById['feifei_fenshen']!;
    expect(describeCard(d, false)).toBe('造成 2 點中毒層數，這場戰鬥中這張牌每打出一次，中毒層數就再加 2 點。');
    expect(describeCard(d, true)).toBe('造成 3 點中毒層數，這場戰鬥中這張牌每打出一次，中毒層數就再加 3 點。');
    expect(describeCard(d, false, 2)).toBe('造成 6 點中毒層數（原本 2 點），這場戰鬥中這張牌每打出一次，中毒層數就再加 2 點。');
    expect(cardNameFor(d, 'feifei')).toBe('分身術');
  });

  it('效果以外照球球那張：攻擊、1 費、升級 2 費、罕見；圖是她自己那張', () => {
    const mine = cardById['feifei_fenshen']!;
    const his = cardById['bunshin']!;
    expect([mine.type, mine.cost, mine.upgrade.cost, mine.rarity, mine.pool])
      .toEqual([his.type, his.cost, his.upgrade.cost, his.rarity, his.pool]);
    expect(mine.art).toBe('card/feifei_fenshen');
  });

  it('鏡子走廊的假師兄學不會（跟球球的分身術一樣：魔物記不了打過幾次）', () => {
    expect(learnCard(inst('bunshin', 1)), '球球那張本來就學不會').toBeNull();
    expect(learnCard(inst('feifei_fenshen', 2))).toBeNull();
    expect(learnCard(inst('feifei_tianzhen', 3)), '不長的毒牌照學').not.toBeNull();
  });

  it('之前存的局：她手上的分身術換成她那張，球球的不動', () => {
    const ff = newRun('ff-save', 1, 'feifei');
    addCard(ff, 'bunshin');
    const back = checkRun(JSON.parse(JSON.stringify(ff)))!;
    expect(back.players[0]!.deck.some((c) => c.cardId === 'feifei_fenshen')).toBe(true);
    expect(back.players[0]!.deck.some((c) => c.cardId === 'bunshin')).toBe(false);
    const qq = newRun('qq-save', 1, 'ninja');
    addCard(qq, 'bunshin');
    expect(checkRun(JSON.parse(JSON.stringify(qq)))!.players[0]!.deck.some((c) => c.cardId === 'bunshin')).toBe(true);
  });
});

describe('牌的歸屬（27）與牌名', () => {
  it('地裂陣、沾衣十八跌、鐵頭功、球球的分身術：她拿不到；她的分身術球球拿不到', () => {
    for (const id of ['dilie', 'shibadie', 'tietou', 'bunshin']) {
      expect(pickable(cardById[id]!, 'feifei', 1), `${id} 還會出現在菲菲的獎勵裡`).toBe(false);
      expect(pickable(cardById[id]!, 'ninja', 1), `${id} 球球應該還拿得到`).toBe(true);
    }
    expect(pickable(cardById['feifei_fenshen']!, 'feifei', 1)).toBe(true);
    expect(pickable(cardById['feifei_fenshen']!, 'ninja', 1)).toBe(false);
  });

  it('兩位都改的：回復卷軸、貓步', () => {
    expect(cardNameFor(cardById['renwuwancheng']!, 'ninja')).toBe('忍術·回復卷軸');
    expect(cardNameFor(cardById['renwuwancheng']!, 'feifei')).toBe('回復卷軸');
    expect(cardNameFor(cardById['mabu']!, 'ninja')).toBe('絕學·貓步');
    expect(cardNameFor(cardById['mabu']!, 'feifei')).toBe('絕學·貓步');
  });

  it('她專屬的：後退閃躲、強力塗毒、一起準備好', () => {
    expect(cardNameFor(cardById['feifei_lakai']!, 'feifei')).toBe('後退閃躲');
    expect(cardNameFor(cardById['feifei_tianzhen']!, 'feifei')).toBe('強力塗毒');
    expect(cardNameFor(cardById['woyouxianbeihao']!, 'feifei')).toBe('一起準備好');
  });
});

describe('事件文字', () => {
  const choice = (id: string, i: number) => eventById[id]!.choices[i]!;
  it('師兄的痕跡、牆後的暗號（1、2）', () => {
    expect(choice('feifei_trace', 0).result).toMatch(/菲菲：「.+」/su);   // 文案 2026-09-15 由 GPT 整批改寫，只釘規矩不釘句子
    expect(choice('feifei_trace', 0).result).not.toContain('喵');
    expect(choice('feifei_trace', 1).result).toMatch(/菲菲：「.+」/su);   // 文案 2026-09-15 由 GPT 整批改寫，只釘規矩不釘句子
    expect(choice('feifei_trace', 1).result).not.toContain('喵');
    expect(choice('feifei_signal', 0).result).toMatch(/菲菲：「.+」/su);   // 文案 2026-09-15 由 GPT 整批改寫，只釘規矩不釘句子
    expect(choice('feifei_signal', 0).result).not.toContain('喵');
    expect(choice('feifei_signal', 1).label).toBe('墊著布撐開機關（獲得 45 條小魚乾，失去 10 點生命）');
    expect(choice('feifei_signal', 1).result).toMatch(/菲菲：「.+」/su);   // 文案 2026-09-15 由 GPT 整批改寫，只釘規矩不釘句子
    expect(choice('feifei_signal', 1).result).not.toContain('喵');
  });

  it('共用事件的敘述、選項、標題（3、5、8、9、15），她看到的就是這幾句', () => {
    expect(eventTextFor('feifei', eventById['blocked']!.text)).toBe('樓梯被一座垃圾山堵住，頂上插著一塊新牌子，感覺就是有人故意擋住的，隱約看見一卷忍術卷軸露在一個破木板底下；旁邊的小走道似乎還是繞得過去。');
    expect(eventTextFor('feifei', choice('sunbath', 1).label)).toBe('曬著太陽整理招式（移除 1 張牌）');
    expect(eventTextFor('feifei', eventById['lost_scroll']!.text)).toBe('一卷沒署名的卷軸掉在階梯上，潦草的字旁畫著三段忍術圖解。旁邊有個轉角的舊書攤，攤主表示：「收購秘笈，破舊的也收。」');
    expect(eventTextFor('feifei', eventById['noisy_kitchen']!.text)).toBe('樓梯轉角的廚房傳來一陣鏗鏘聲，爐上的湯鍋咕嚕作響，蒸氣把鍋蓋頂得直跳。灶邊貼著「我吃不完但得先走了，想吃自己盛一碗」，旁邊還放著一盒供人取用的備用忍具。');
    expect(eventById['grindstone']!.title).toBe('磨利我的刀');
  });

  it('深藏不露（4）：紙條改成意味不明之後，她那句不再說「上面寫了別拿」', () => {
    const r = eventTextFor('feifei', choice('hidden_box', 1).result);
    expect(r).not.toContain('別拿');
    expect(r).toContain('菲菲：「');   // 2026-09-15 改寫後不一定提到師父，改釘她有開口
  });
});
