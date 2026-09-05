import { describe, expect, it } from 'vitest';

import { STARTER_DECK } from '../../src/content/cards';
import { enemyById } from '../../src/content/enemies';
import { modifierById, modifierChanceFor } from '../../src/content/modifiers';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import { BOSS_PREFIXES, beginCombat, newRun } from '../../src/engine/run';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState, EnemyCombat } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 2026-09-05 使用者拍板的「下一輪」平衡（數據在 docs/審查報告/平衡下一輪_2026-09-05.md）：
 * 1. 第一關關主：貓又鱗甲 7→4、蛙大名鱗甲 4→2＋成長 2→3 回合、五隻血 −10%
 * 2. 第二關：憤怒每回合最多觸發一次、奶牛與老住持 2→1、狸大人拿掉「戲法」
 * 3. 關主前綴：暴怒 +2／−20%、疲憊 −10%／防 8
 * 4. 修飾詞：打瞌睡定身 1、中魔氣爪力 +2、肥美 +40 條、餓扁 −15 條；難度 1（見習）整局不抽
 */
function start(extra: [string, boolean][], encounterId: string, hp = 200): CombatState {
  const deck = [...STARTER_DECK.map((id, i) => inst(id, i + 1)), ...extra.map(([id, up], i) => inst(id, 100 + i, up))];
  const cs = startCombat({ hp, maxHp: hp, deck, relics: [], potions: [], encounterId, rng: new Rng(seedFromString('balance-0905')) });
  cs.player.energy = 9;
  return cs;
}
function toHand(cs: CombatState, uid: number): void {
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) {
    const i = pile.findIndex((c) => c.uid === uid);
    if (i >= 0) { const [c] = pile.splice(i, 1); cs.player.hand.unshift(c!); return; }
  }
  throw new Error('找不到牌 ' + uid);
}
function dummy(maxHp = 100): EnemyCombat {
  return {
    uid: 1, enemyId: 'wood_dummy', name: '木樁人', hp: maxHp, maxHp, block: 0, statuses: {},
    moveIndex: 0, turnCount: 0, phase: 0, charged: false, reviveIn: 0, invulnIn: 0, dead: false, escaped: false, stolen: 0,
    move: { intent: 'special', label: '站著', effects: [] },
  } as unknown as EnemyCombat;
}

describe('第一關關主：削拖長＋血 −10%', () => {
  it('貓又鱗甲 4、蛙大名鱗甲 2 成長每 3 回合，五隻血各降一成', () => {
    expect(enemyById['nekomata']!.plating).toBe(4);
    expect(enemyById['nekomata']!.hp).toEqual([158, 158]);
    expect(enemyById['frog_daimyo']!.plating).toBe(2);
    expect(enemyById['frog_daimyo']!.strengthEveryNTurns).toBe(3);
    expect(enemyById['frog_daimyo']!.hp).toEqual([135, 135]);
    expect(enemyById['iron_claw']!.hp).toEqual([113, 113]);
    expect(enemyById['orange_king']!.hp).toEqual([149, 149]);
    expect(enemyById['armadillo_king']!.hp).toEqual([135, 135]);
  });
});

describe('第二關：憤怒', () => {
  it('奶牛、老住持每次 +1；狸大人沒有戲法了', () => {
    expect(enemyById['cowcat_boss']!.angerOnSkill).toBe(1);
    expect(enemyById['hex_abbot']!.angerOnSkill).toBe(1);
    expect(enemyById['tanuki_lord']!.hexOnSkill).toBeUndefined();
    expect(enemyById['tanuki_lord']!.angerOnSkill).toBe(1);
  });

  it('同一回合打三張技能牌只激怒一次，下一回合才會再激怒', () => {
    // 烏天狗：憤怒 1、沒有自己的成長，數字乾淨
    const cs = start([['tanding', false], ['tanding', false], ['tanding', false], ['tanding', false]], 'tengu');
    const e = cs.enemies[0]!;
    const before = getStatus(e, '爪力');
    for (const uid of [100, 101, 102]) { toHand(cs, uid); playCard(cs, uid); }
    expect(getStatus(e, '爪力') - before, '一回合最多 +1').toBe(1);
    expect(cs.log.filter((l) => l.endsWith('被激怒了')).length).toBe(1);
    cs.player.block = 999;
    endTurn(cs);
    toHand(cs, 103); playCard(cs, 103);
    expect(getStatus(e, '爪力') - before, '換了回合可以再激怒一次').toBe(2);
  });
});

describe('關主前綴的數字', () => {
  const by = (label: string) => BOSS_PREFIXES.find((p) => p.label === label)!;
  it('暴怒：爪力 +2、生命 −20%', () => {
    const e = dummy(100); by('暴怒的').apply(e);
    expect(getStatus(e, '爪力')).toBe(2);
    expect(e.maxHp).toBe(80); expect(e.hp).toBe(80);
  });
  it('疲憊：生命 −10%、先架 8 點防禦', () => {
    const e = dummy(100); by('疲憊的').apply(e);
    expect(e.maxHp).toBe(90); expect(e.block).toBe(8);
  });
  it('披甲：鱗甲 2、生命 −5%（沒動）', () => {
    const e = dummy(100); by('披甲的').apply(e);
    expect(getStatus(e, '鱗甲')).toBe(2); expect(e.maxHp).toBe(95);
  });
});

describe('修飾詞的數字與難度門檻', () => {
  it('中了魔氣的爪力 +2；肥美 +40 條、餓扁 −15 條；打瞌睡定身 1', () => {
    const e = dummy(100); modifierById['miasmic']!.apply(e);
    expect(getStatus(e, '爪力')).toBe(2);
    expect(modifierById['plump']!.fishAdd).toBe(40);
    expect(modifierById['starved']!.fishAdd).toBe(-15);
    const d = dummy(100); modifierById['dozing']!.apply(d);
    expect(getStatus(d, '定身')).toBe(1);
    expect(d.maxHp).toBe(120);
  });

  it('見習（難度 1）整局不抽修飾詞；出師（難度 2）起照關數機率抽', () => {
    expect(modifierChanceFor(1, 1)).toBe(0);
    expect(modifierChanceFor(3, 1)).toBe(0);
    expect(modifierChanceFor(1, 2)).toBe(0.15);
    expect(modifierChanceFor(2, 2)).toBe(0.25);
    expect(modifierChanceFor(3, 5)).toBe(0.3);
    for (let i = 0; i < 60; i++) for (const act of [1, 2, 3]) {
      const m = generateMap(new Rng(seedFromString(`novice${act}-${i}`)), { act, difficulty: 1 });
      expect(m.nodes.every((n) => n.modifier === undefined), `難度 1 第 ${act} 關不該有修飾詞`).toBe(true);
    }
    // 沒給難度＝當成 1（生成地圖的呼叫端漏傳時，寧可少抽也不要在見習冒出來）
    for (let i = 0; i < 30; i++) expect(generateMap(new Rng(seedFromString(`nodiff-${i}`)), { act: 3 }).nodes.every((n) => n.modifier === undefined)).toBe(true);
    let novice = 0, journeyman = 0;
    for (let i = 0; i < 60; i++) {
      novice += newRun(`n${i}`, 1).map.nodes.filter((n) => n.modifier).length;
      journeyman += newRun(`j${i}`, 2).map.nodes.filter((n) => n.modifier).length;
    }
    expect(novice).toBe(0);
    expect(journeyman).toBeGreaterThan(0);
  });

  it('難度 2 的局裡，帶修飾詞的節點開打真的有生效（門檻只擋抽籤，不擋套用）', () => {
    for (let i = 0; i < 40; i++) {
      const run = newRun(`apply${i}`, 2);
      const node = run.map.nodes.find((n) => n.type === '戰鬥' && n.modifier === 'miasmic');
      if (!node) continue;
      run.currentNode = node.id;
      const cs = beginCombat(run);
      // 難度 2 本身給全體魔物 +1 爪力（cs.mods.strength），修飾詞的 +2 疊在它上面
      for (const e of cs.enemies) expect(getStatus(e, '爪力') - (cs.mods?.strength ?? 0), e.name).toBe(2);
      return;
    }
    throw new Error('40 顆種子都沒抽到中了魔氣的戰鬥節點，測試無效');
  });
});
