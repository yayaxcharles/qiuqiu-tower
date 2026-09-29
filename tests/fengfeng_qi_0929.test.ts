/**
 * 封封「守著蓄氣，出劍花氣」（2026-09-29 使用者拍板）。
 *
 * 三條規則，每一條改回舊寫法都要變紅：
 *   ① 攻擊全部花氣（沒有氣也打得出去，只剩基本傷害）
 *   ② 防禦改成「蜷縮＋獲得蓄氣」，不再花氣換蜷縮
 *   ③ 花氣攻擊的升級不動基本傷害（加的是每點蓄氣的傷害，或多段的改成能多花）
 */
import { afterAll, describe, expect, it } from 'vitest';
import { cardById, cards } from '../src/content/cards';
import { playCard, startCombat } from '../src/engine/combat';
import { Rng, seedFromString } from '../src/engine/rng';
import type { CombatState, Effect, PlayerCombat } from '../src/engine/types';
import { _setPackForTest } from '../src/i18n';
import en from '../src/i18n/en/index';
import ja from '../src/i18n/ja/index';
import { describeCard } from '../src/ui/cardtext';
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
    expect(attacks.length).toBe(15);
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
    expect(en.describeCard(c, false, 0)).toBe('Your partner gains 8 Curl. Gain 2 Qi. Solo: "partner" means you.');
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
