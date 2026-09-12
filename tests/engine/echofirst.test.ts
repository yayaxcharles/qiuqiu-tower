import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { beginCombat, newRun } from '../../src/engine/run';
import { playCard } from '../../src/engine/combat';
import { addCard } from '../../src/engine/run';

/**
 * 影子分身：**這場戰鬥裡，每回合打出的第一張牌會再打一次**（2026-09-12 使用者指定）。
 *
 * 原本是「打倒一隻就抽一張＋1 爪力」，那是跟著擊殺走的，對慢慢毒死人的打法幾乎不發動。
 */
function setup(hero: 'ninja' | 'feifei') {
  const run = newRun(`echo-${hero}`, 1, hero);
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  const cs = beginCombat(run);
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
    const d = cardById['yingzi']!;
    expect(d.cost).toBe(3);
    expect(d.upgrade.cost).toBe(2);
    expect(d.effects).toEqual([{ kind: 'echoFirst' }]);
  });

  it('掛上之後，該回合的第一張攻擊牌打兩次', () => {
    const { cs, p } = setup('ninja');
    const e = cs.enemies[0]!;
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'yingzi', 900));           // 能力牌本身不算「第一張」
    const before = e.hp;
    p.cardsPlayedThisTurn = 0;                          // 當成新回合
    playCard(cs, toHand(cs, 'sanjo', 901), e.uid);      // 貓抓 6 傷
    expect(before - e.hp, '第一張應該打兩次＝12 點').toBe(12);
  });

  it('第二張以後只打一次', () => {
    const { cs, p } = setup('ninja');
    const e = cs.enemies[0]!;
    p.hand.length = 0;
    playCard(cs, toHand(cs, 'yingzi', 900));
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
    playCard(cs, toHand(cs, 'yingzi', 900));
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
    playCard(cs, toHand(cs, 'yingzi', 900));
    p.cardsPlayedThisTurn = 0;
    p.block = 0;
    const hp0 = e.hp;
    playCard(cs, toHand(cs, 'feifei_feizhen', 901), e.uid);
    expect(hp0 - e.hp, '3 傷 ×2').toBe(6);
    expect(e.statuses['中毒'] ?? 0, '1 層毒 ×2').toBe(2);
    expect(p.block, '2 點蜷縮 ×2').toBe(4);
  });
});
