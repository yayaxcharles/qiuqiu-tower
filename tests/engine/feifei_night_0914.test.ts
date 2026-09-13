import { describe, expect, it } from 'vitest';
import { playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus } from '../../src/engine/statuses';
import { cardById } from '../../src/content/cards';
import { castLineFor, dialogue } from '../../src/content/dialogue';
import type { DialogueLine } from '../../src/content/dialogue';
import { describeCard } from '../../src/ui/cardtext';
import { inst } from '../helpers';
import type { CardInstance } from '../../src/engine/types';

/*
 * 2026-09-14 夜間稽核（菲菲那一份）抓到、測試抓得到的那幾條。每一條都照「把修正改回去要紅」寫。
 */

function combat(deck: CardInstance[], relics: string[] = []) {
  const cs = startCombat({ hp: 999, maxHp: 999, deck, relics, potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('ff0914')), hero: 'feifei' });
  cs.player.drawPile = []; cs.player.hand = [...deck]; cs.player.energy = 9;
  return cs;
}

describe('高-1：見血封喉吃得到加倍（秘笈、蓄力）', () => {
  const hit = (opts: { relics?: string[]; charged?: boolean; upgraded?: boolean }): number => {
    const cs = combat([inst('feifei_jianxue', 1, opts.upgraded)], opts.relics);
    const foe = cs.enemies[0]!;
    foe.hp = 500; foe.maxHp = 500; foe.block = 0;
    addStatus(foe, '中毒', 10);
    if (opts.charged) cs.player.doubleNext = 1;
    expect(playCard(cs, 1, foe.uid)).toBe(true);
    return 500 - foe.hp;
  };

  it('沒有加倍：等於毒層數', () => { expect(hit({})).toBe(10); });
  it('秘笈的第一擊：兩倍（修好之前紀錄印「秘笈：第一擊加倍」、實際只扣 10，秘笈白白用掉）', () => {
    expect(hit({ relics: ['scroll'] })).toBe(20);
  });
  it('蓄力：兩倍', () => { expect(hit({ charged: true })).toBe(20); });
  it('升級版自己兩倍，再乘秘笈', () => { expect(hit({ relics: ['scroll'], upgraded: true })).toBe(40); });
});

describe('中-12：累加型的能力牌打第二張，狀態列要數得出兩張', () => {
  const passives = (id: string): number => {
    const cs = combat([inst(id, 1), inst(id, 2)]);
    playCard(cs, 1); playCard(cs, 2);
    return cs.player.powers.filter((pw) => pw.trigger === 'passive' && pw.cardId === id).length;
  };
  it('拒馬、千針萬毒打兩張 → 兩個牌子（效果本來就疊了兩份）', () => {
    expect(passives('feifei_juma')).toBe(2);
    expect(passives('feifei_qianzhen')).toBe(2);
  });
  it('指派型的（你忙我補位）打兩張還是一個：效果只有一份，這條去重要留著', () => {
    expect(passives('nimangwobuwei')).toBe(1);
  });
});

describe('中-3：塔主與旁白講到主角的句子，玩菲菲時換掉', () => {
  const all: DialogueLine[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o['speaker'] === 'string' && typeof o['text'] === 'string') { all.push(o as unknown as DialogueLine); return; }
      Object.values(o).forEach(walk);
    }
  };
  walk(dialogue);
  const cast = all.filter((l) => l.speaker !== '球球');

  it('玩菲菲時，非主角的句子不再出現「小兄弟」「看了球球」「收拾他」', () => {
    const bad = cast.map((l) => castLineFor('feifei', l.text)).filter((t) => /小兄弟|看了球球|收拾他/.test(t));
    expect(bad).toEqual([]);
    expect(cast.some((l) => /小兄弟|看了球球|收拾他/.test(l.text)), '原文真的有這幾句（不然上面那條等於沒測）').toBe(true);
  });

  it('球球那邊一個字都不動', () => {
    for (const l of cast) expect(castLineFor('ninja', l.text)).toBe(l.text);
  });
  // 「播對白與換階段吐槽兩條路都有過這一層」要讀原始碼，放在 tools/feifei_screen_0914.test.ts（tests/ 底下沒有 node 的型別）
});

describe('低-7：牌面文字跟引擎一致', () => {
  it('一針斃命：層數「不少於」生命就打倒（引擎是 ≥）', () => {
    expect(describeCard(cardById['feifei_yizhen']!, false)).toContain('不少於');
  });
});
