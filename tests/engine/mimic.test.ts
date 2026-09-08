// 鏡中球球照著學（2026-09-08 使用者：招式沒特色，改成隨機抽主角牌組的牌打出來、畫面亮牌，但不動主角的牌）
import { describe, expect, it } from 'vitest';
import { STARTER_DECK, cardById } from '../../src/content/cards';
import { endTurn, startCombat } from '../../src/engine/combat';
import { learnCard, learnedMove } from '../../src/engine/mimic';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';

const fight = (enc: string, seed = 'mimic', deck: readonly string[] = STARTER_DECK) =>
  startCombat({ hp: 80, maxHp: 80, deck: deck.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: enc, rng: new Rng(seedFromString(seed)) });
const pileCount = (cs: ReturnType<typeof fight>): number =>
  cs.player.drawPile.length + cs.player.hand.length + cs.player.discardPile.length + cs.player.exhaustPile.length;

describe('鏡中球球照著學', () => {
  it('翻譯：打擊→damage、蜷縮→block、抽牌那半略過；只會抽牌／能力／自傷／結束回合的整張不收', () => {
    expect(learnCard(inst('sanjo', 1))).toEqual([{ kind: 'damage', amount: 6 }]);
    expect(learnCard(inst('tanding', 1))).toEqual([{ kind: 'block', amount: 5 }]);
    expect(learnCard(inst('luoye', 1))).toEqual([{ kind: 'damage', amount: 4 }]);
    expect(learnCard(inst('qianliyan', 1))).toBeNull();
    expect(learnCard(inst('jiejie', 1))).toBeNull();
    expect(learnCard(inst('tietou', 1))).toBeNull();
    expect(learnCard(inst('sashoujian', 1))).toBeNull();
  });

  it('給對手的狀態翻成 statusPlayer，升級版照升級後的數字', () => {
    expect(learnCard(inst('tieshazhang', 1))).toEqual([{ kind: 'damage', amount: 7 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }]);
    expect(learnCard(inst('tieshazhang', 1, true))).toEqual([{ kind: 'damage', amount: 9 }, { kind: 'statusPlayer', name: '噎到', amount: 4 }]);
  });

  it('開戰第一動就是學來的牌：牌名當標籤、cardIds 記那張；球球的牌一張都沒少', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    expect(e.move.cardIds).toHaveLength(1);
    const id = e.move.cardIds![0]!;
    expect(STARTER_DECK).toContain(id);
    expect(e.move.label).toBe(cardById[id]!.name);
    expect(pileCount(cs)).toBe(STARTER_DECK.length);
  });

  it('二三關版一動兩張，牌名用＋串、效果接在一起', () => {
    const cs = fight('mirror_duel_a2');
    const e = cs.enemies[0]!;
    expect(e.move.cardIds).toHaveLength(2);
    expect(e.move.label).toContain('＋');
    expect(e.move.effects.length).toBeGreaterThanOrEqual(2);
  });

  it('每一動重抽；同一個種子永遠抽到同一張（局面碼要能重現）', () => {
    const a = fight('mirror_duel', 'seedX');
    const b = fight('mirror_duel', 'seedX');
    expect(a.enemies[0]!.move.cardIds).toEqual(b.enemies[0]!.move.cardIds);
    endTurn(a); endTurn(b);
    expect(a.enemies[0]!.move.cardIds).toEqual(b.enemies[0]!.move.cardIds);
    expect(a.enemies[0]!.move.cardIds).toHaveLength(1);
    expect(pileCount(a)).toBe(STARTER_DECK.length);
  });

  it('學來的貓抓真的會打到球球、學來的淡定給他自己蜷縮', () => {
    const cs = fight('mirror_duel');
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '貓抓', effects: learnCard(inst('sanjo', 99))!, cardIds: ['sanjo'] };
    endTurn(cs);
    expect(cs.player.hp).toBe(74);
    expect(cs.log.some((l) => l.includes('貓抓'))).toBe(true);
    e.move = { intent: 'block', label: '淡定', effects: learnCard(inst('tanding', 99))!, cardIds: ['tanding'] };
    endTurn(cs);
    expect(e.block).toBe(5);
  });

  it('牌組裡沒半張學得會的：退回招式表的照著學', () => {
    const cs = fight('mirror_duel', 'none', ['qianliyan', 'qianliyan', 'jiejie']);
    expect(learnedMove(cs)).toBeUndefined();
    expect(cs.enemies[0]!.move.label).toBe('照著學');
    expect(cs.enemies[0]!.move.cardIds).toBeUndefined();
  });
});
