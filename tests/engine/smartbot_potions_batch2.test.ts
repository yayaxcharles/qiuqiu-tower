import { describe, expect, it } from 'vitest';
import { startCombat } from '../../src/engine/combat';
import type { Hero } from '../../src/engine/hero';
import { Rng, seedFromString } from '../../src/engine/rng';
import { bestRelic, relicRating, setBonusScore, smartSeatAct } from '../../src/engine/smartbot';
import type { CombatState, EnemyMove, PlayerCombat } from '../../src/engine/types';

/**
 * 內容擴充第二批 6 支忍具，機器人的喝法（2026-09-23，`smartbot.ts` 的 `maybePotion`）。
 * 跟第一批同一個規矩：每一支都有「該喝」與「不該喝」；把那一條規則拿掉，「該喝」那條就會紅。
 * 另外釘住兩件估值：中了迷魂香的魔物不算進「這一拍會挨多少」、湊成師門套組的那件加分。
 */
const QUIET: EnemyMove = { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 8 }] };
const hit = (n: number, times = 1): EnemyMove => ({ intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: n, times }] });

let uid = 84_000;
function setup(potions: string[], opt: { hand?: string[]; draw?: string[]; move?: EnemyMove; enemyHp?: number;
  energy?: number; encounterId?: string; hero?: Hero; hp?: number } = {}): { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [], relics: [], potions: [], encounterId: opt.encounterId ?? 'wood_dummy',
    rng: new Rng(seedFromString('potion-b2')), hero: opt.hero ?? 'ninja' });
  const p = cs.player;
  p.hand = (opt.hand ?? []).map((cardId) => ({ uid: uid++, cardId, upgraded: false }));
  p.drawPile = (opt.draw ?? []).map((cardId) => ({ uid: uid++, cardId, upgraded: false }));
  p.discardPile = []; p.exhaustPile = [];
  p.energy = opt.energy ?? 3; p.block = 0; p.statuses = {}; p.qi = 0;
  p.hp = opt.hp ?? 80;
  p.potions = [...potions];
  for (const e of cs.enemies) { e.hp = e.maxHp = opt.enemyHp ?? 100; e.block = 0; e.statuses = {}; e.move = opt.move ?? QUIET; }
  return { cs, p };
}
const rng = (): Rng => new Rng(seedFromString('potion-b2-bot'));
function drank(cs: CombatState, p: PlayerCombat, id: string): boolean {
  smartSeatAct(cs, rng(), 0);
  return !p.potions.includes(id);
}

describe('回魂香', () => {
  it('這一拍挨下去會死 → 點上', () => {
    const { cs, p } = setup(['revive_incense'], { move: hit(40), hp: 30, hand: ['tanding'], energy: 0 });
    expect(drank(cs, p, 'revive_incense')).toBe(true);
    expect(p.guardLethal).toBe(true);
  });
  it('血還多、挨得住 → 不點', () => {
    const { cs, p } = setup(['revive_incense'], { move: hit(10), hp: 80, energy: 0 });
    expect(drank(cs, p, 'revive_incense')).toBe(false);
  });
});

describe('便當', () => {
  it('飯糰用光、仗還長 → 打開', () => {
    const { cs, p } = setup(['bento'], { energy: 0, enemyHp: 60 });
    expect(drank(cs, p, 'bento')).toBe(true);
    expect(p.energyNextTurn).toBe(2);
  });
  it('還有飯糰（這回合還能打）→ 不開', () => {
    const { cs, p } = setup(['bento'], { energy: 2, enemyHp: 60, hand: ['sanjo'] });
    smartSeatAct(cs, rng(), 0);
    expect(p.potions).toContain('bento');
  });
  it('魔物快死了（總血不到 30、一般戰）→ 不開', () => {
    const { cs, p } = setup(['bento'], { energy: 0, enemyHp: 12 });
    expect(drank(cs, p, 'bento')).toBe(false);
  });
});

describe('照妖鏡', () => {
  it('有一隻正在虛化 → 照', () => {
    const { cs, p } = setup(['demon_mirror']);
    cs.enemies[0]!.statuses['虛化'] = 1;
    expect(drank(cs, p, 'demon_mirror')).toBe(true);
    expect(cs.enemies[0]!.statuses['虛化'] ?? 0).toBe(0);
  });
  it('三隻老鼠隱身合計 2 層 → 照', () => {
    const { cs, p } = setup(['demon_mirror'], { encounterId: 'rats3' });
    cs.enemies[0]!.statuses['隱身'] = 1; cs.enemies[2]!.statuses['隱身'] = 1;
    expect(drank(cs, p, 'demon_mirror')).toBe(true);
  });
  it('只有一層隱身、手上沒有打得出去的攻擊牌 → 不照', () => {
    const { cs, p } = setup(['demon_mirror'], { hand: ['tanding'] });
    cs.enemies[0]!.statuses['隱身'] = 1;
    expect(drank(cs, p, 'demon_mirror')).toBe(false);
  });
  it('一層隱身擋在我這回合打得出去的攻擊牌前面 → 照', () => {
    const { cs, p } = setup(['demon_mirror'], { hand: ['sanjo'] });
    cs.enemies[0]!.statuses['隱身'] = 1;
    expect(drank(cs, p, 'demon_mirror')).toBe(true);
  });
});

describe('傳功丹（走「飯糰」那一條）', () => {
  it('飯糰用光、手上還有兩張打不出去的牌 → 喝', () => {
    const { cs, p } = setup(['transfer_pill'], { energy: 0, hand: ['sanjo', 'sanjo'], move: hit(12), enemyHp: 12 });
    expect(drank(cs, p, 'transfer_pill')).toBe(true);
  });
  it('飯糰還夠 → 不喝', () => {
    const { cs, p } = setup(['transfer_pill'], { energy: 3, hand: [] });
    expect(drank(cs, p, 'transfer_pill')).toBe(false);
  });
});

describe('替換符', () => {
  it('手上有起手的貓抓（2 分爛牌）、還有飯糰 → 換掉那一張', () => {
    const { cs, p } = setup(['swap_talisman'], { hand: ['sanjo', 'shunkan'] });
    const junk = p.hand[0]!.uid;
    expect(drank(cs, p, 'swap_talisman')).toBe(true);
    // 選牌那一步：換掉的是最爛的那張（機器人下一個動作處理選單）
    smartSeatAct(cs, rng(), 0);
    expect(p.hand.some((c) => c.uid === junk)).toBe(false);
    expect(p.hand.some((c) => c.upgraded)).toBe(true);
  });
  it('手上都是好牌 → 不換', () => {
    const { cs, p } = setup(['swap_talisman'], { hand: ['shunkan', 'bianshen'] });
    expect(drank(cs, p, 'swap_talisman')).toBe(false);
  });
});

describe('迷魂香', () => {
  it('三隻老鼠、中間那隻要打 15 點 → 丟牠（旁邊有同伴替我挨）', () => {
    const { cs, p } = setup(['daze_incense'], { encounterId: 'rats3', energy: 0 });
    cs.enemies[1]!.move = hit(15);
    expect(drank(cs, p, 'daze_incense')).toBe(true);
    expect(cs.enemies[1]!.statuses['迷魂']).toBe(1);
  });
  it('只有一隻、打 12 點、血還很多 → 不丟（打空而已，留到要命的時候）', () => {
    const { cs, p } = setup(['daze_incense'], { move: hit(12), energy: 0 });
    expect(drank(cs, p, 'daze_incense')).toBe(false);
  });
  it('只有一隻、挨下去剩不到四成 → 丟', () => {
    const { cs, p } = setup(['daze_incense'], { move: hit(30), hp: 50, energy: 0 });
    expect(drank(cs, p, 'daze_incense')).toBe(true);
  });
  it('中了迷魂的魔物不算進這一拍會挨多少（機器人不會為牠白擋）', () => {
    const { cs, p } = setup(['quilt'], { move: hit(40), hp: 40, energy: 0 });
    cs.enemies[0]!.statuses['迷魂'] = 1;
    expect(drank(cs, p, 'quilt'), '小被子是救命用的，這一拍其實不會挨打').toBe(false);
  });
});

describe('滿月劍意：機器人會為了蓄到門檻先打吐納', () => {
  it('蓄氣 9、手上吐納＋攻擊：帶著滿月劍意先打吐納（蓄過 10，下一張加倍）；沒帶就照舊', () => {
    const first = (relic: boolean): string | undefined => {
      const { cs, p } = setup([], { hero: 'fengfeng', hand: ['fengfeng_tuna', 'fengfeng_hushen', 'sanjo'], energy: 2, move: hit(4) });
      if (relic) p.relics.push('full_moon_sword');
      p.qi = 9;
      const before = p.hand.map((c) => c.cardId);
      smartSeatAct(cs, rng(), 0);
      return before.find((id) => !p.hand.some((c) => c.cardId === id));
    };
    expect(first(true)).toBe('fengfeng_tuna');
    expect(first(false)).not.toBe('fengfeng_tuna');
  });
});

describe('師門套組：湊成那一件加分', () => {
  it('身上有斗笠，舊木劍多了一份「飯糰袋」的分數；已經兩件就不再加', () => {
    for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const) {
      const bonus = Math.max(0, relicRating('onigiri_bag', hero) - 5);
      expect(setBonusScore('master_wooden_sword', hero, ['master_hat']), hero).toBe(bonus);
      expect(setBonusScore('master_wooden_sword', hero, []), hero).toBe(0);
      expect(setBonusScore('master_wooden_sword', hero, ['master_hat', 'master_gourd']), hero).toBe(0);
      expect(setBonusScore('tuna_can', hero, ['master_hat']), hero).toBe(0);
    }
  });
  it('bestRelic 帶身上的秘寶時會把套組算進去', () => {
    const hero = 'ninja';
    const ids = ['master_gourd', 'tuna_can'];
    const withSet = bestRelic(ids, hero, ['master_hat']);
    const gap = relicRating('tuna_can', hero) - relicRating('master_gourd', hero);
    if (setBonusScore('master_gourd', hero, ['master_hat']) > gap) expect(withSet).toBe('master_gourd');
    else expect(withSet).toBe(bestRelic(ids, hero));
  });
});
