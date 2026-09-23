import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { beginCombat, newRun } from '../../src/engine/run';
import { playCard } from '../../src/engine/combat';

/**
 * 影子分身：**這場戰鬥裡，每回合打出的第一張牌會再打一次**（2026-09-12 使用者指定）。
 *
 * 原本是「打倒一隻就抽一張＋1 爪力」，那是跟著擊殺走的，對慢慢毒死人的打法幾乎不發動。
 */
function setup(hero: 'ninja' | 'feifei') {
  const run = newRun(`echo-${hero}`, 1, hero);
  // 球球不帶藍頭巾（2026-09-23 平衡 bal）：它改成開場 1 點爪力，這裡量的是「打幾次」，每一下多 1 就看不出是牌本身
  if (hero === 'ninja') run.players[0]!.relics = run.players[0]!.relics.filter((id) => id !== 'blue_headband');
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  // 對手釘死成飯糰怪（2026-09-23 內容擴充第二批）：原本拿地圖第一格戰鬥，事件池一變、地圖的亂數走向跟著變，
  // 換成會縮殼的犰狳寶寶，「打兩次＝12 點」就量到防禦了
  const cs = beginCombat(run, 'onigiri_monster');
  const p = cs.players[0]!;
  p.energy = 99;
  return { run, cs, p };
}

/** 把一張牌直接塞到手上並回傳它的 uid */
function toHand(cs: ReturnType<typeof beginCombat>, id: string, uid: number): number {
  cs.players[0]!.hand.push({ uid, cardId: id, upgraded: false });
  return uid;
}

describe('影子分身', () => {
  it('牌本身是 3 費、升級版 2 費', () => {
    const d = cardById['feifei_yingzi']!;
    expect(d.cost).toBe(3);
    expect(d.upgrade.cost).toBe(2);
    expect(d.effects).toEqual([{ kind: 'echoFirst' }]);
  });

  it('掛上之後，該回合的第一張攻擊牌打兩次', () => {
    const { cs, p } = setup('ninja');
    const e = cs.enemies[0]!;
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'feifei_yingzi', 900));           // 能力牌本身不算「第一張」
    const before = e.hp;
    p.cardsPlayedThisTurn = 0;                          // 當成新回合
    playCard(cs, toHand(cs, 'sanjo', 901), e.uid);      // 貓抓 6 傷
    expect(before - e.hp, '第一張應該打兩次＝12 點').toBe(12);
  });

  it('第二張以後只打一次', () => {
    const { cs, p } = setup('ninja');
    const e = cs.enemies[0]!;
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'feifei_yingzi', 900));
    p.cardsPlayedThisTurn = 0;
    playCard(cs, toHand(cs, 'sanjo', 901), e.uid);      // 第一張：兩次
    const mid = e.hp;
    playCard(cs, toHand(cs, 'sanjo', 902), e.uid);      // 第二張：一次
    expect(mid - e.hp).toBe(6);
  });

  it('能力牌不會複製自己', () => {
    const { cs, p } = setup('ninja');
    p.hand.length = 0;
    p.cardsPlayedThisTurn = 0;
    playCard(cs, toHand(cs, 'feifei_yingzi', 900));
    expect(p.echoFirst, '打一次應該只掛一層').toBe(1);
  });

  it('沒掛這張的時候，第一張牌只打一次', () => {
    const { cs, p } = setup('ninja');
    const e = cs.enemies[0]!;
    p.hand.length = 0;
    p.cardsPlayedThisTurn = 0;
    const before = e.hp;
    playCard(cs, toHand(cs, 'sanjo', 901), e.uid);
    expect(before - e.hp).toBe(6);
  });

  it('菲菲打也一樣（她的飛針帶毒帶擋，兩份都要給）', () => {
    const { cs, p } = setup('feifei');
    const e = cs.enemies[0]!;
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'feifei_yingzi', 900));
    p.cardsPlayedThisTurn = 0;
    p.block = 0;
    const hp0 = e.hp;
    // **量的是「這張牌加了多少」不是絕對值**（2026-09-13）：她的起始秘寶「毒針袋」
    // 每回合開始就會先給全體 1 層毒，寫死絕對值的話，只要秘寶一改這條就會紅，
    // 而紅的原因跟影子分身無關——看的人會往錯的方向修。
    const poison0 = e.statuses['中毒'] ?? 0;
    playCard(cs, toHand(cs, 'feifei_feizhen', 901), e.uid);
    expect(hp0 - e.hp, '3 傷 ×2').toBe(6);
    expect((e.statuses['中毒'] ?? 0) - poison0, '1 層毒 ×2').toBe(2);
    expect(p.block, '1 點蜷縮 ×2（飛針的蜷縮 2026-09-22 起 2→1）').toBe(2);
  });
});

/**
 * 2026-09-13 第二輪稽核抓到的兩個「算錯而且不出聲」。
 */
describe('影子分身的兩個邊角', () => {
  it('要選牌的牌不吃影分身（不然只問一次、只抽一份，紀錄卻說打了兩次）', () => {
    const { cs, p } = setup('ninja');
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'feifei_yingzi', 900));
    p.cardsPlayedThisTurn = 0;
    toHand(cs, 'sanjo', 902);                     // 手上要有東西可消耗，不然告退不會停下來問
    toHand(cs, 'tanding', 903);
    const before = p.drawPile.length;
    playCard(cs, toHand(cs, 'gaotui', 901));      // 告退：消耗手上一張 → 抽一張，會開挑牌疊層
    expect(cs.pending, '應該停下來等玩家挑').toBeTruthy();
    expect(cs.log.some((l) => l.includes('又打了一次')), '不該印「又打了一次」').toBe(false);
    expect(p.drawPile.length, '抽牌堆不該被動兩次').toBe(before);
  });

  it('蓄力的加倍不會被影分身吃兩次（6 傷不該打成 24）', () => {
    const { cs, p } = setup('ninja');
    const e = cs.enemies[0]!;
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'feifei_yingzi', 900));
    p.cardsPlayedThisTurn = 0;
    p.doubleNext = 1;                              // 蓄力：下一張攻擊牌傷害加倍
    const hp0 = e.hp;
    playCard(cs, toHand(cs, 'sanjo', 901), e.uid); // 貓抓 6
    expect(hp0 - e.hp, '加倍一次(12) × 打兩次 = 18，不是 24').toBe(18);
  });
});

describe('影子分身可以疊（使用者 2026-09-14 深夜裁定：兩張＝第一張牌打三次、牌子顯示 2）', () => {
  function two(upgradedSecond: boolean) {
    const { cs, p } = setup('feifei');
    const e = cs.enemies[0]!;
    e.hp = 100; e.maxHp = 100;
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'feifei_yingzi', 900));
    cs.players[0]!.hand.push({ uid: 901, cardId: 'feifei_yingzi', upgraded: upgradedSecond });
    playCard(cs, 901);
    return { cs, p, e };
  }

  it('兩張影子分身：第一張牌打三次，第二張以後還是一次', () => {
    const { cs, p, e } = two(false);
    expect(p.echoFirst).toBe(2);
    p.cardsPlayedThisTurn = 0;
    const before = e.hp;
    playCard(cs, toHand(cs, 'sanjo', 902), e.uid);      // 貓抓 6 傷
    expect(before - e.hp, '兩層＝第一張打三次＝18 點').toBe(18);
    const mid = e.hp;
    playCard(cs, toHand(cs, 'sanjo', 903), e.uid);
    expect(mid - e.hp, '第二張以後只打一次').toBe(6);
  });

  it('狀態列的牌子要有兩筆（畫面會寫 2）', () => {
    const { p } = two(false);
    const mine = p.powers.filter((pw) => pw.trigger === 'passive' && pw.cardId === 'feifei_yingzi');
    expect(mine.length, '原本同一張牌去重成一筆，玩家以為第二張白打').toBe(2);
  });

  it('基本版加升級版也是兩層：打三次、牌子各一筆', () => {
    const { cs, p, e } = two(true);
    p.cardsPlayedThisTurn = 0;
    const before = e.hp;
    playCard(cs, toHand(cs, 'sanjo', 902), e.uid);
    expect(before - e.hp).toBe(18);
    const mine = p.powers.filter((pw) => pw.trigger === 'passive' && pw.cardId === 'feifei_yingzi');
    expect(mine.length).toBe(2);
    expect(mine.filter((pw) => pw.upgraded).length).toBe(1);
  });
});
