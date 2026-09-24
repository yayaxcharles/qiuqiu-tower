import { describe, expect, it } from 'vitest';
import { cardById, cardNameFor, inHeroCollection } from '../../src/content/cards';
import { canPlay, playCard, startCombat } from '../../src/engine/combat';
import { cardStats } from '../../src/engine/deck';
import { pickable } from '../../src/engine/hero';
import { rollCardChoices } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { describeCard } from '../../src/ui/cardtext';
import { companionCardAction } from '../../src/ui/companion-motion';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/*
 * 菲菲補爪力牌的缺那三張毒系牌（2026-09-25 使用者裁定，說明在 `cards.ts` 常見區的補一針上面）。
 *   - 補一針（常見攻擊）：4 點傷害；目標**本來就**中毒的話抽 1 張；再給 2 層中毒。升級 6／1／3
 *   - 看準破綻（罕見技能，0 費）：目標已經中毒的話抽 2 張。升級：抽完再給 3 層中毒
 *   - 越撒越順手（稀有能力，2 費）：之後每打出一張技能牌，所有魔物中毒 1 層。升級 1 費
 * 這一份守的是「本來就中毒」看的是上毒之前、能力只吃技能牌、每一隻都 +1。
 */

const DRAW_PILE = ['feifei_tuikai', 'feifei_tuikai', 'feifei_tuikai', 'feifei_tuikai', 'feifei_tuikai'];

/** 開一場菲菲的戰鬥：手牌照給、抽牌堆放五張退開（抽牌才看得出來）、飯糰調大 */
function fight(hand: string[], opts: { encounterId?: string; upgraded?: string[] } = {}): CombatState {
  const cs = startCombat({
    hp: 70, maxHp: 70, deck: hand.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: opts.encounterId ?? 'wood_dummy',
    rng: new Rng(seedFromString('feifei-poison-0925')), hero: 'feifei',
  });
  cs.player.hand = hand.map((id, i) => inst(id, i + 1, opts.upgraded?.includes(id) ?? false));
  cs.player.drawPile = DRAW_PILE.map((id, i) => inst(id, 100 + i));
  cs.player.discardPile = [];
  cs.player.energy = 9;
  for (const e of cs.enemies) e.statuses = {};
  return cs;
}

const uidOf = (cs: CombatState, id: string): number => cs.player.hand.find((c) => c.cardId === id)!.uid;
const play = (cs: CombatState, id: string, target = cs.enemies[0]?.uid): boolean => playCard(cs, uidOf(cs, id), target);
const poison = (cs: CombatState, i = 0): number => getStatus(cs.enemies[i]!, '中毒');

describe('補一針', () => {
  it('目標原本沒毒：打 4 點、不抽牌、上 2 層毒（自己上的毒不算「本來就中毒」）', () => {
    const cs = fight(['feifei_buyizhen']);
    const hp = cs.enemies[0]!.hp;
    expect(play(cs, 'feifei_buyizhen')).toBe(true);
    expect(hp - cs.enemies[0]!.hp).toBe(4);
    expect(cs.player.hand.length, '沒抽牌').toBe(0);
    expect(cs.player.drawPile.length).toBe(DRAW_PILE.length);
    expect(poison(cs)).toBe(2);
  });

  it('目標本來就中毒：抽 1 張，毒再疊 2 層', () => {
    const cs = fight(['feifei_buyizhen']);
    addStatus(cs.enemies[0]!, '中毒', 3);
    play(cs, 'feifei_buyizhen');
    expect(cs.player.hand.map((c) => c.cardId), '抽到一張退開').toEqual(['feifei_tuikai']);
    expect(poison(cs)).toBe(5);
  });

  it('連打兩張：第一張把毒上去，第二張才抽', () => {
    const cs = fight(['feifei_buyizhen', 'feifei_buyizhen']);
    playCard(cs, cs.player.hand[0]!.uid, cs.enemies[0]!.uid);
    expect(cs.player.hand.length, '第一張打完手上只剩第二張').toBe(1);
    playCard(cs, cs.player.hand[0]!.uid, cs.enemies[0]!.uid);
    expect(cs.player.hand.map((c) => c.cardId)).toEqual(['feifei_tuikai']);
    expect(poison(cs)).toBe(4);
  });

  it('升級：6 點、照樣只抽 1 張、3 層毒；效果順序是 傷害 → 抽牌判斷 → 上毒', () => {
    const cs = fight(['feifei_buyizhen'], { upgraded: ['feifei_buyizhen'] });
    addStatus(cs.enemies[0]!, '中毒', 1);
    const hp = cs.enemies[0]!.hp;
    play(cs, 'feifei_buyizhen');
    expect(hp - cs.enemies[0]!.hp).toBe(6);
    expect(cs.player.hand.length).toBe(1);
    expect(poison(cs)).toBe(4);
    for (const up of [false, true]) {
      const kinds = cardStats(inst('feifei_buyizhen', 1, up)).effects.map((e) => e.kind);
      expect(kinds, '上毒排到抽牌判斷前面的話，條件永遠成立').toEqual(['damage', 'drawIfTargetStatus', 'status']);
    }
  });

  it('牌面：1 費常見攻擊，上毒跟抽牌用分號切開（不會被讀成「有毒才上毒」）', () => {
    const c = cardById['feifei_buyizhen']!;
    expect([c.cost, c.type, c.rarity, c.pool, c.hero, c.target]).toEqual([1, '攻擊', '常見', '忍術', 'feifei', 'enemy']);
    expect(describeCard(c, false)).toBe('造成 4 點傷害；目標身上有中毒就抽 1 張牌；給目標 2 層中毒。');
    expect(describeCard(c, true)).toBe('造成 6 點傷害；目標身上有中毒就抽 1 張牌；給目標 3 層中毒。');
  });
});

describe('看準破綻', () => {
  it('0 費；目標沒毒什麼都不發生，有毒就抽 2 張', () => {
    const cs = fight(['feifei_kanzhun', 'feifei_kanzhun']);
    expect(canPlay(cs, cs.player.hand[0]!.uid, cs.enemies[0]!.uid)).toEqual({ ok: true, cost: 0 });
    const energy = cs.player.energy;
    playCard(cs, cs.player.hand[0]!.uid, cs.enemies[0]!.uid);
    expect(cs.player.energy).toBe(energy);
    expect(cs.player.hand.length, '目標沒毒，沒抽').toBe(1);
    expect(poison(cs), '基礎版不上毒').toBe(0);

    addStatus(cs.enemies[0]!, '中毒', 1);
    playCard(cs, cs.player.hand[0]!.uid, cs.enemies[0]!.uid);
    expect(cs.player.hand.map((c) => c.cardId)).toEqual(['feifei_tuikai', 'feifei_tuikai']);
    expect(poison(cs)).toBe(1);
  });

  it('升級：抽牌判斷在上毒之前——目標原本沒毒，給了 3 層也不抽', () => {
    const cs = fight(['feifei_kanzhun'], { upgraded: ['feifei_kanzhun'] });
    play(cs, 'feifei_kanzhun');
    expect(cs.player.hand.length, '被自己的 3 層騙過去就會抽').toBe(0);
    expect(poison(cs)).toBe(3);
  });

  it('升級：目標原本有毒，抽 2 張再疊 3 層', () => {
    const cs = fight(['feifei_kanzhun'], { upgraded: ['feifei_kanzhun'] });
    addStatus(cs.enemies[0]!, '中毒', 2);
    play(cs, 'feifei_kanzhun');
    expect(cs.player.hand.length).toBe(2);
    expect(poison(cs)).toBe(5);
  });

  it('消耗：打一次就移出這場（薄牌組不能把自己抽回來無限打，推前稽核第四輪 低-4）；升級版照樣消耗', () => {
    const cs = fight(['feifei_kanzhun']);
    addStatus(cs.enemies[0]!, '中毒', 1);
    play(cs, 'feifei_kanzhun');
    expect(cs.player.exhaustPile.map((c) => c.cardId)).toEqual(['feifei_kanzhun']);
    expect(cardStats(inst('feifei_kanzhun', 1, true)).keywords ?? []).toContain('消耗');
  });

  it('牌面：罕見技能、要選一隻', () => {
    const c = cardById['feifei_kanzhun']!;
    expect([c.cost, c.type, c.rarity, c.pool, c.hero, c.target]).toEqual([0, '技能', '罕見', '忍術', 'feifei', 'enemy']);
    expect(describeCard(c, false)).toBe('目標身上有中毒就抽 2 張牌。消耗。');
    expect(describeCard(c, true)).toBe('目標身上有中毒就抽 2 張牌；給目標 3 層中毒。消耗。');
  });
});

describe('越撒越順手', () => {
  it('打出技能牌後，所有魔物各 +1 層中毒（三隻都算）', () => {
    const cs = fight(['feifei_yuesa', 'feifei_tuikai', 'feifei_tuikai'], { encounterId: 'rats3' });
    expect(cs.enemies.length).toBe(3);
    play(cs, 'feifei_yuesa');
    expect(cs.enemies.map((e) => getStatus(e, '中毒')), '打出能力牌本身不算技能牌').toEqual([0, 0, 0]);
    play(cs, 'feifei_tuikai');
    expect(cs.enemies.map((e) => getStatus(e, '中毒'))).toEqual([1, 1, 1]);
    play(cs, 'feifei_tuikai');
    expect(cs.enemies.map((e) => getStatus(e, '中毒')), '沒加每回合一次：每張技能牌都算').toEqual([2, 2, 2]);
  });

  it('攻擊牌、能力牌、戰鬥雜牌都不觸發', () => {
    const cs = fight(['feifei_yuesa', 'feifei_feizhen', 'feifei_duwu', 'slime_card'], { encounterId: 'rats3' });
    play(cs, 'feifei_yuesa');
    play(cs, 'feifei_feizhen');   // 攻擊牌：只有飛針自己那 1 層，而且只上在目標身上
    expect(cs.enemies.map((e) => getStatus(e, '中毒'))).toEqual([1, 0, 0]);
    play(cs, 'feifei_duwu');      // 能力牌
    expect(cs.enemies.map((e) => getStatus(e, '中毒'))).toEqual([1, 0, 0]);
    play(cs, 'slime_card');       // 黏液是技能牌，但它是魔物塞進來的戰鬥雜牌
    expect(cs.enemies.map((e) => getStatus(e, '中毒'))).toEqual([1, 0, 0]);
  });

  it('跟看準破綻一起：先判斷抽牌、再撒毒——目標原本沒毒就不抽', () => {
    const cs = fight(['feifei_yuesa', 'feifei_kanzhun']);
    play(cs, 'feifei_yuesa');
    play(cs, 'feifei_kanzhun');
    expect(cs.player.hand.length, '能力的毒是牌效果結算完才上的').toBe(0);
    expect(poison(cs)).toBe(1);
  });

  it('掛兩張就是每張技能牌 2 層（跟毒霧一樣會疊，不是同名取高）', () => {
    const cs = fight(['feifei_yuesa', 'feifei_yuesa', 'feifei_tuikai']);
    playCard(cs, cs.player.hand[0]!.uid);
    playCard(cs, cs.player.hand[0]!.uid);
    expect(cs.player.powers.filter((pw) => pw.cardId === 'feifei_yuesa').length).toBe(2);
    play(cs, 'feifei_tuikai');
    expect(poison(cs)).toBe(2);
  });

  it('每回合最多 5 次：同一回合第 6 張技能不再加毒，下一回合重新算（薄牌組 0 費循環不會無限疊毒，推前稽核第四輪 低-4）', () => {
    const cs = fight(['feifei_yuesa', ...Array.from({ length: 7 }, () => 'feifei_tanlu')]);
    play(cs, 'feifei_yuesa');
    for (let i = 0; i < 6; i++) play(cs, 'feifei_tanlu');
    expect(poison(cs)).toBe(5);
    cs.turn += 1;
    play(cs, 'feifei_tanlu');
    expect(poison(cs), '新的一回合重新數').toBe(6);
  });

  it('升級只降費用：2→1，效果不變', () => {
    const c = cardById['feifei_yuesa']!;
    expect([c.cost, c.type, c.rarity, c.pool, c.hero, c.target]).toEqual([2, '能力', '稀有', '絕學', 'feifei', 'self']);
    expect(cardStats(inst('feifei_yuesa', 1, true)).cost).toBe(1);
    expect(cardStats(inst('feifei_yuesa', 1, true)).effects).toEqual(cardStats(inst('feifei_yuesa', 1)).effects);
    const fx = c.effects[0]!;
    expect(fx.kind === 'power' && [fx.trigger, fx.cardType, fx.oncePerTurn, fx.minQiSpent, fx.sameNameMax])
      .toEqual(['afterCard', '技能', undefined, undefined, undefined]);
    expect(describeCard(c, false)).toBe('每次打出技能牌後，全體魔物獲得 1 層中毒（每回合最多 5 次）。');

    const cs = fight(['feifei_yuesa', 'feifei_tuikai'], { upgraded: ['feifei_yuesa'] });
    const energy = cs.player.energy;
    play(cs, 'feifei_yuesa');
    expect(energy - cs.player.energy).toBe(1);
    play(cs, 'feifei_tuikai');
    expect(poison(cs)).toBe(1);
  });
});

describe('誰拿得到', () => {
  const NEW = ['feifei_buyizhen', 'feifei_kanzhun', 'feifei_yuesa'];

  it('菲菲單人、連線都抽得到，圖鑑有列；另外三隻抽不到、圖鑑也不列', () => {
    for (const id of NEW) {
      const c = cardById[id]!;
      expect(c.hidden, `${id} 還掛著待圖`).toBeUndefined();
      expect(pickable(c, 'feifei', 1), id).toBe(true);
      expect(pickable(c, 'feifei', 2), id).toBe(true);
      expect(inHeroCollection(c, 'feifei'), id).toBe(true);
      for (const h of ['ninja', 'dangdang', 'fengfeng'] as const) {
        expect(pickable(c, h, 1), `${h} ${id}`).toBe(false);
        expect(pickable(c, h, 2), `${h} ${id}`).toBe(false);
        expect(inHeroCollection(c, h), `${h} ${id}`).toBe(false);
      }
      expect(cardNameFor(c, 'feifei'), '專屬牌不換名').toBe(c.name);
    }
  });

  it('獎勵真的開得出來（只給菲菲）', () => {
    const seen = new Map<string, Set<string>>();
    for (const hero of ['feifei', 'ninja', 'dangdang', 'fengfeng'] as const) {
      const got = new Set<string>();
      for (let seed = 0; seed < 400; seed++) {
        for (const pool of ['忍術', '絕學'] as const) {
          for (const c of rollCardChoices(new Rng(seedFromString(`poison0925-${hero}-${seed}`)), pool, 3, [], true, 0, undefined, hero)) got.add(c.id);
        }
      }
      seen.set(hero, got);
    }
    for (const id of NEW) {
      expect(seen.get('feifei')!.has(id), `菲菲開不到 ${id}`).toBe(true);
      for (const h of ['ninja', 'dangdang', 'fengfeng']) expect(seen.get(h)!.has(id), `${h} 開到了 ${id}`).toBe(false);
    }
  });

  it('出牌動作：補一針借飛針的單手彈針；看準破綻、越撒越順手走她的結印（都有逐格素材，不退回靜態立繪）', () => {
    expect(companionCardAction('feifei', 'feifei_buyizhen', { cardType: '攻擊' })).toBe('shuriken');
    expect(companionCardAction('feifei', 'feifei_kanzhun', { cardType: '技能' })).toBe('seal');
    expect(companionCardAction('feifei', 'feifei_yuesa', { cardType: '能力' })).toBe('seal');
  });
});
