import { describe, expect, it } from 'vitest';
import { startCombat } from '../../src/engine/combat';
import type { Hero } from '../../src/engine/hero';
import { Rng, seedFromString } from '../../src/engine/rng';
import { cards } from '../../src/content/cards';
import { deckJunk, handRated, rating, smartSeatAct } from '../../src/engine/smartbot';
import { newRun } from '../../src/engine/run';
import type { CombatState, EnemyMove, PlayerCombat } from '../../src/engine/types';

/**
 * 量測工具修正（2026-09-22）：聰明機器人讀不懂噹噹、封封的那幾處。
 *
 * 這支機器人是這個專案**唯一的平衡訊號**（`tests/smart.report.test.ts`），它看錯一張牌，
 * 報告就會安靜地把那個角色量得太弱，而且不會有任何測試變紅——這一檔就是補那個洞。
 * 每一條都照「修之前會怎樣打」寫，把修正拿掉就會變紅。
 */

const QUIET: EnemyMove = { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 8 }] };
const hit = (n: number): EnemyMove => ({ intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: n }] });

let uid = 70_000;
function setup(hero: Hero, hand: string[], opt: { move?: EnemyMove; enemyHp?: number; block?: number; qi?: number; energy?: number } = {}):
  { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [], relics: [], potions: [], encounterId: 'wood_dummy',
    rng: new Rng(seedFromString(`smart0922-${hero}`)), hero });
  const p = cs.player;
  p.hand = hand.map((cardId) => ({ uid: uid++, cardId, upgraded: false }));
  p.drawPile = []; p.discardPile = []; p.exhaustPile = [];
  p.energy = opt.energy ?? 3; p.block = opt.block ?? 0; p.qi = opt.qi ?? 0;
  const e = cs.enemies[0]!;
  e.hp = e.maxHp = opt.enemyHp ?? 100; e.block = 0;
  e.move = opt.move ?? QUIET;
  return { cs, p };
}
const rng = (): Rng => new Rng(seedFromString('smart0922'));
/** 機器人這一步打了哪一張（沒打就是 null） */
function nextPlay(cs: CombatState, p: PlayerCombat): string | null {
  const before = p.hand.map((c) => c.cardId);
  if (!smartSeatAct(cs, rng(), 0)) return null;
  const after = p.hand.map((c) => c.cardId);
  for (const id of after) before.splice(before.indexOf(id), 1);
  return before[0] ?? null;
}

describe('量測工具修正 2026-09-22：反彈整場有效', () => {
  it('魔物這回合不攻擊，噹噹也會先掛上回敬（原本估成 −0.6，只在挨打那拍才打）', () => {
    const { cs, p } = setup('dangdang', ['dangdang_huijing']);
    expect(nextPlay(cs, p)).toBe('dangdang_huijing');
  });
  it('每回合給反彈的能力牌（站樁）不挨打的回合也值得放', () => {
    const { cs, p } = setup('dangdang', ['dangdang_zhanzhuang']);
    expect(nextPlay(cs, p)).toBe('dangdang_zhanzhuang');
  });
});

describe('量測工具修正 2026-09-22：卸蜷縮的代價', () => {
  it('蜷縮 10、這一拍要挨 12：卸 6 點會多吃 6 點，不該拿去打（原本估成免費）', () => {
    const { cs, p } = setup('dangdang', ['dangdang_jielidali'], { block: 10, move: hit(12) });
    expect(nextPlay(cs, p)).toBeNull();
  });
  it('蜷縮多出來、擋完還有剩：卸掉剩的那幾點照樣打', () => {
    const { cs, p } = setup('dangdang', ['dangdang_jielidali'], { block: 20, move: hit(12) });
    expect(nextPlay(cs, p)).toBe('dangdang_jielidali');
  });
  it('身上沒蜷縮：借力打力整張撲空，不打（原本目標血少於 20 就照打）', () => {
    const { cs, p } = setup('dangdang', ['dangdang_jielidali'], { enemyHp: 15 });
    expect(nextPlay(cs, p)).toBeNull();
  });
  it('沒有反彈：原樣奉還也是撲空，不打', () => {
    const { cs, p } = setup('dangdang', ['dangdang_yibi'], { enemyHp: 15 });
    expect(nextPlay(cs, p)).toBeNull();
  });
  it('先存蜷縮、再卸出去：手上有架盤＋借力打力、魔物不攻擊時，兩張都打、打得到人', () => {
    const { cs, p } = setup('dangdang', ['dangdang_jielidali', 'dangdang_jiapan']);
    const e = cs.enemies[0]!;
    expect(nextPlay(cs, p)).toBe('dangdang_jiapan');
    expect(nextPlay(cs, p)).toBe('dangdang_jielidali');
    expect(e.hp).toBe(95);
  });
});

describe('量測工具修正 2026-09-22：封封的蓄氣', () => {
  it('循息（能力牌、打技能牌加蓄氣）會被打出來（原本整張 −0.6、600 局打出 0 次）', () => {
    const { cs, p } = setup('fengfeng', ['fengfeng_xunxi']);
    expect(nextPlay(cs, p)).toBe('fengfeng_xunxi');
  });
  it('藏鋒（能力牌、每回合開始加蓄氣）會被打出來', () => {
    const { cs, p } = setup('fengfeng', ['fengfeng_cunfeng']);
    expect(nextPlay(cs, p)).toBe('fengfeng_cunfeng');
  });
  it('蓄氣門檻沒到就不算：蓄氣 0 時退步守勢只值 8 點擋，輸給 9 點的貼牆；蓄氣 3 時反過來', () => {
    const a = setup('fengfeng', ['fengfeng_tuibu', 'feifei_tieqiang'], { move: hit(20), energy: 1, qi: 0 });
    expect(nextPlay(a.cs, a.p)).toBe('feifei_tieqiang');
    const b = setup('fengfeng', ['fengfeng_tuibu', 'feifei_tieqiang'], { move: hit(20), energy: 1, qi: 3 });
    expect(nextPlay(b.cs, b.p)).toBe('fengfeng_tuibu');
  });
  it('先吐納、再出斬：兩張都打得起時先補氣，平斬吃到 3 點氣打 14', () => {
    const { cs, p } = setup('fengfeng', ['fengfeng_pingzhan', 'fengfeng_tuna']);
    const e = cs.enemies[0]!;
    expect(nextPlay(cs, p)).toBe('fengfeng_tuna');
    expect(nextPlay(cs, p)).toBe('fengfeng_pingzhan');
    expect(e.hp).toBe(86);   // 5＋3×3（2026-09-24 平斬上限 2→4，吐納的 3 點全吃；還不到 4 點，不套 ×1.3）
  });
});

describe('量測工具 2026-09-24：憋氣（氣有價錢）', () => {
  // 一顆飯糰、手上平斬與挑開：氣不到 4 點時平斬只打 11，扣掉「這 2 點氣留著值多少」後輸給不花氣的挑開 7，
  // 先打挑開把氣存著；氣到 4 點時平斬 5＋3×4＝17×1.3＝22，照樣花。拿掉 `qiHoldValue` 的話第一條會變成打平斬
  it('氣不到門檻先打不花氣的牌存著，到門檻就一口氣花掉', () => {
    const a = setup('fengfeng', ['fengfeng_pingzhan', 'fengfeng_tiaokai'], { qi: 2, energy: 1 });
    expect(nextPlay(a.cs, a.p)).toBe('fengfeng_tiaokai');
    expect(a.p.qi).toBe(2);
    const b = setup('fengfeng', ['fengfeng_pingzhan', 'fengfeng_tiaokai'], { qi: 4, energy: 1 });
    expect(nextPlay(b.cs, b.p)).toBe('fengfeng_pingzhan');
    expect(b.cs.enemies[0]!.hp).toBe(78);
  });
});

describe('量測工具修正 2026-09-22：封封起手三張的評分', () => {
  it('平斬、護身比照貓抓、淡定算廢牌（2 分），吐納比照替身術（3 分）', () => {
    expect(rating('fengfeng_pingzhan')).toBe(rating('sanjo'));
    expect(rating('fengfeng_hushen')).toBe(rating('tanding'));
    expect(rating('fengfeng_tuna')).toBe(rating('kawarimi'));
  });
  it('所以罐頭鋪、事件的放生挑得到它們（原本起手十張一輩子留在牌組裡）', () => {
    const run = newRun('smart0922-junk', 1, 'fengfeng');
    const junk = deckJunk(run).map((c) => c.cardId);
    expect(junk).toContain('fengfeng_pingzhan');
    expect(junk).toContain('fengfeng_hushen');
  });
});

describe('量測工具 2026-09-22：封封專屬牌評分', () => {
  /*
   * 沒評分的牌照稀有度拿預設分，機器人分不出好壞（回劍護肘與長息都是 5 分），
   * 封封的好牌撿不到、後段量得太弱。來源與級距寫在 `smartbot.ts` 的 RATING 那一段。
   */
  it('單人拿得到的封封專屬牌（起手與連線專用以外）每一張都有手動評分——新加的牌漏評會變紅', () => {
    const own = cards.filter((c) => c.hero === 'fengfeng' && c.pool !== '起手' && !c.coop);
    expect(own.length).toBe(25);
    for (const c of own) expect(handRated(c.id), c.id).toBe(true);
  });
  it('照實測排序：斷流、回劍護肘 8 分，長息、藏鋒 3 分（預設會是 7／5／5／7）', () => {
    expect(rating('fengfeng_duanliu')).toBe(8);
    expect(rating('fengfeng_huzhou')).toBe(8);
    expect(rating('fengfeng_changxi')).toBe(3);
    expect(rating('fengfeng_cunfeng')).toBe(3);
    // 偏弱的牌不進放生名單（2 分以下才是）
    for (const c of cards.filter((x) => x.hero === 'fengfeng' && x.pool !== '起手')) expect(rating(c.id), c.id).toBeGreaterThan(2);
  });
});
