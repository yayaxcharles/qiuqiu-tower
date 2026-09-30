/**
 * 封封「守著蓄氣，出劍花氣」（2026-09-29 使用者拍板）。
 *
 * 四條規則，每一條改回舊寫法都要變紅：
 *   ① 攻擊全部花氣（沒有氣也打得出去，只剩基本傷害）
 *   ② 防禦改成「蜷縮＋獲得蓄氣」，不再花氣換蜷縮
 *   ③ 花氣攻擊的升級不動基本傷害（加的是每點蓄氣的傷害，或多段的改成能多花）
 *   ④ 新牌絕學·氣貫長虹：1 費、用盡蓄氣、沒有基本傷害；牌面不能出現「造成 0 點傷害」
 */
import { afterAll, describe, expect, it } from 'vitest';
import { cardById, cards } from '../src/content/cards';
import { playCard, startCombat } from '../src/engine/combat';
import { pickable } from '../src/engine/hero';
import { learnCard } from '../src/engine/mimic';
import { Rng, seedFromString } from '../src/engine/rng';
import { handRated, rating } from '../src/engine/smartbot';
import type { CombatState, Effect, PlayerCombat } from '../src/engine/types';
import { _setPackForTest } from '../src/i18n';
import en from '../src/i18n/en/index';
import enContent from '../src/i18n/en/content.json';
import ja from '../src/i18n/ja/index';
import jaContent from '../src/i18n/ja/content.json';
import { companionCardAction } from '../src/ui/companion-motion';
import { describeCard } from '../src/ui/cardtext';
import manifest from '../public/assets/manifest.json';
import { inst } from './helpers';

afterAll(() => _setPackForTest('zh', null));

const HERS = cards.filter((c) => c.hero === 'fengfeng');
const fxOf = (id: string, up = false): Effect[] => (up ? (cardById[id]!.upgrade.effects ?? cardById[id]!.effects) : cardById[id]!.effects);

let uid = 97_000;
function setup(): { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [], encounterId: 'wood_dummy',
    rng: new Rng(seedFromString('fengfeng-0929')), hero: 'fengfeng' });
  const p = cs.player;
  p.hand = []; p.drawPile = []; p.discardPile = []; p.exhaustPile = []; p.energy = 99; p.block = 0; p.qi = 0;
  const e = cs.enemies[0]!; e.hp = e.maxHp = 300; e.block = 0;
  return { cs, p };
}
function play(cs: CombatState, p: PlayerCombat, id: string, upgraded = false): boolean {
  const u = uid++;
  p.hand.push({ uid: u, cardId: id, upgraded });
  return playCard(cs, u, cardById[id]!.target === 'enemy' ? cs.enemies[0]!.uid : undefined, p.seat);
}

describe('① 攻擊全部花氣', () => {
  it('封封每一張攻擊牌（升級前後）都有花氣出招，沒有固定傷害的 `damage`', () => {
    const attacks = HERS.filter((c) => c.type === 'attack');
    expect(attacks.length).toBe(16);   // 15 張舊的＋氣貫長虹
    for (const c of attacks) for (const up of [false, true]) {
      const fx = fxOf(c.id, up);
      expect(fx.some((e) => e.kind === 'damageSpendQi'), `${c.id}${up ? '＋' : ''}`).toBe(true);
      expect(fx.some((e) => e.kind === 'damage'), `${c.id}${up ? '＋' : ''}`).toBe(false);
    }
  });

  it('探步劍：0 氣打 5、不回氣；2 氣打 11；3 氣只花 2 點；升級每點 4（2 氣 13）', () => {
    const a = setup(); play(a.cs, a.p, 'fengfeng_tanbu');
    expect([300 - a.cs.enemies[0]!.hp, a.p.qi]).toEqual([5, 0]);
    const b = setup(); b.p.qi = 2; play(b.cs, b.p, 'fengfeng_tanbu');
    expect([300 - b.cs.enemies[0]!.hp, b.p.qi]).toEqual([11, 0]);
    const c = setup(); c.p.qi = 3; play(c.cs, c.p, 'fengfeng_tanbu');
    expect([300 - c.cs.enemies[0]!.hp, c.p.qi]).toEqual([11, 1]);
    const d = setup(); d.p.qi = 2; play(d.cs, d.p, 'fengfeng_tanbu', true);
    expect(300 - d.cs.enemies[0]!.hp).toBe(13);
  });

  it('挑開：0 氣打 5；3 氣打 14；升級每點 4 並抽 1 張（3 氣 17）', () => {
    const a = setup(); play(a.cs, a.p, 'fengfeng_tiaokai');
    expect(300 - a.cs.enemies[0]!.hp).toBe(5);
    const b = setup(); b.p.qi = 3; play(b.cs, b.p, 'fengfeng_tiaokai');
    expect([300 - b.cs.enemies[0]!.hp, b.p.qi]).toEqual([14, 0]);
    const c = setup(); c.p.qi = 3; c.p.drawPile = [inst('fengfeng_hushen', uid++)];
    play(c.cs, c.p, 'fengfeng_tiaokai', true);
    expect([300 - c.cs.enemies[0]!.hp, c.p.hand.length]).toEqual([17, 1]);
  });
});

describe('② 防禦改成蜷縮＋獲得蓄氣', () => {
  it('沒有任何封封的牌還在花氣換蜷縮（`blockSpendQi`）', () => {
    for (const c of HERS) for (const up of [false, true]) {
      expect(fxOf(c.id, up).some((e) => e.kind === 'blockSpendQi'), `${c.id}${up ? '＋' : ''}`).toBe(false);
    }
  });

  // [牌, 沒升級 [蜷縮, 蓄氣], 升級 [蜷縮, 蓄氣]]
  const ROWS: [string, [number, number], [number, number]][] = [
    ['fengfeng_hushen', [6, 1], [9, 2]],
    ['fengfeng_tuibu', [8, 1], [11, 2]],
    ['fengfeng_jianqiao', [6, 3], [8, 4]],
    ['fengfeng_zhenshou', [7, 2], [10, 3]],
    ['fengfeng_huanshou', [4, 1], [6, 1]],
    ['fengfeng_husong', [8, 2], [11, 2]],   // 一個人玩：同伴＝自己
    ['fengfeng_zhuanshen', [7, 2], [10, 2]],   // 本來就是這樣，沒動
  ];
  it('實際打出來（手上有 3 點氣，打完氣只會變多、不會被花掉）', () => {
    for (const [id, base, upg] of ROWS) for (const up of [false, true]) {
      const { cs, p } = setup(); p.qi = 3;
      expect(play(cs, p, id, up), id).toBe(true);
      const [block, qi] = up ? upg : base;
      expect([p.block, p.qi], `${id}${up ? '＋' : ''}`).toEqual([block, 3 + qi]);
    }
  });

  it('我護著你走的牌面講清楚蓄氣是自己拿的（中英日）', () => {
    const c = cardById['fengfeng_husong']!;
    expect(describeCard(c, false)).toBe('同伴獲得 8 點蜷縮，自己獲得 2 點蓄氣。一個人玩時「同伴」＝你自己。');
    _setPackForTest('ja', ja);
    expect(ja.describeCard(c, false, 0)).toContain('自分は');
    _setPackForTest('en', en);
    expect(en.describeCard(c, false, 0)).toBe('Your partner gains 8 Curl. Gain 2 Qi. Solo: partner = you.');
    _setPackForTest('zh', null);
  });
});

describe('③ 花氣攻擊的升級不動基本傷害', () => {
  it('每一張花氣出招的牌，升級後的基本傷害跟沒升級一樣', () => {
    for (const c of HERS) {
      const a = fxOf(c.id).find((e) => e.kind === 'damageSpendQi');
      const b = fxOf(c.id, true).find((e) => e.kind === 'damageSpendQi');
      if (!a || !b || a.kind !== 'damageSpendQi' || b.kind !== 'damageSpendQi') continue;
      expect(b.amount, c.id).toBe(a.amount);
    }
  });
  it('多段的不加每點、改成能多花到 6 點：連環三劍、雙段劍', () => {
    for (const id of ['fengfeng_sanlian', 'fengfeng_shuangduan']) {
      const a = fxOf(id)[0] as Extract<Effect, { kind: 'damageSpendQi' }>;
      const b = fxOf(id, true)[0] as Extract<Effect, { kind: 'damageSpendQi' }>;
      expect([b.perQi, b.maxQi, a.maxQi], id).toEqual([a.perQi, 6, 4]);
    }
  });
});

describe('④ 絕學·氣貫長虹', () => {
  const G = 'fengfeng_guanhong';
  it('稀有、絕學池、封封專屬、攻擊、1 費，單人拿得到、別人拿不到', () => {
    const d = cardById[G]!;
    expect([d.rarity, d.pool, d.hero, d.type, d.cost, d.upgrade.cost, d.art, !!d.coop, !!d.hidden])
      .toEqual(['rare', '絕學', 'fengfeng', 'attack', 1, undefined, `card/${G}`, false, false]);
    expect(pickable(d, 'fengfeng', 1)).toBe(true);
    for (const h of ['ninja', 'feifei', 'dangdang'] as const) expect(pickable(d, h, 2), h).toBe(false);
  });

  it('實際打出來：0 氣打得出去、0 傷害；3 氣 9；4 氣 15（×1.3）；升級 4 氣 26；氣全部用光', () => {
    const a = setup(); const e0 = a.p.energy;
    expect(play(a.cs, a.p, G)).toBe(true);
    expect([300 - a.cs.enemies[0]!.hp, a.p.energy]).toEqual([0, e0 - 1]);
    for (const [qi, dmg, up] of [[3, 9, false], [4, 15, false], [4, 26, true], [12, 46, false]] as const) {
      const { cs, p } = setup(); p.qi = qi;
      play(cs, p, G, up);
      expect([300 - cs.enemies[0]!.hp, p.qi], `${qi} 氣${up ? '＋' : ''}`).toEqual([dmg, 0]);
    }
  });

  it('牌面讀起來自然：中英日都不出現「0 點傷害」', () => {
    const d = cardById[G]!;
    expect(describeCard(d, false)).toBe('用盡蓄氣，每點蓄氣造成 3 點傷害。');
    expect(describeCard(d, true)).toBe('用盡蓄氣，每點蓄氣造成 5 點傷害。');
    _setPackForTest('en', en);
    expect(en.describeCard(d, false, 0)).toBe('Spend all your Qi: deal 3 damage per Qi spent.');
    expect(en.describeCard(d, true, 0)).toBe('Spend all your Qi: deal 5 damage per Qi spent.');
    _setPackForTest('ja', ja);
    expect(ja.describeCard(d, false, 0)).toBe('気を全て使い、気1につき3ダメージを与える。');
    _setPackForTest('zh', null);
    for (const c of cards) expect(describeCard(c, false), c.id).not.toMatch(/造成 0 點傷害/);
  });

  it('牌名有英日翻譯、有卡圖、機器人有手動評分、出招演劍氣劈、鏡子不學（用盡蓄氣）', () => {
    expect((enContent as { card: Record<string, string> }).card[G]).toBe('Secret Art: Rainbow-Piercing Qi');
    expect((jaContent as { card: Record<string, string> }).card[G]).toBe('秘伝・気貫長虹');
    expect((manifest as { cards: Record<string, string> }).cards[`card/${G}`]).toBe(`assets/cards/card/${G}.webp`);
    expect(handRated(G)).toBe(true);
    expect(rating(G)).toBe(6);
    expect(companionCardAction('fengfeng', G)).toBe('qi_cleave');
    expect(learnCard(inst(G, 1))).toBeNull();
    expect(learnCard(inst(G, 1, true))).toBeNull();
  });
});
