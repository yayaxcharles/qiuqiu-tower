import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { beginCombat, newRun } from '../../src/engine/run';
import { endTurn, playCard } from '../../src/engine/combat';
import { getStatus } from '../../src/engine/statuses';
import { describeCard } from '../../src/ui/cardtext';

/**
 * 影子分身碰到能力牌怎麼算（2026-09-16 使用者裁定，**推翻 2026-09-13 那次**）。
 *
 * 09-13 那次的裁定是「牌面沒寫例外就不要有例外」，所以能力牌照樣被重播。
 * 後來量到那條規則的代價：封印解除每回合 +1 爪力 +1 貓步，被重播就等於再掛一台
 * 成長機器。掛兩張影子分身之後每回合 +3／+3，第 14 回合貓步 33、一張金鐘罩擋 150 點
 *（沒有影子分身時是 13 與 30）。一張 3 費牌換五倍。
 *
 * 先做過一版「照樣重播、但不多掛一份能力」，使用者否決：「缺點是會忘記」——
 * 那條規則在畫面上看不出來。現在的規矩是**能力牌整張跳過，這回合的重播留給下一張牌**，
 * 而且**這一句寫在牌面上**（`cardtext.ts` 的 `echoFirst`），09-13 抱怨的「牌面一個例外都沒提」
 * 這次有交代。
 *
 * 代價講明白：`絕學·貓步`、`絕學·運功` 這種當場給爪力貓步的能力牌，也跟著不再打兩次。
 */
function setup(hero: 'ninja' | 'feifei' = 'feifei') {
  const run = newRun(`echopow-${hero}`, 1, hero);
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  const cs = beginCombat(run);
  const p = cs.players[0]!;
  p.energy = 99;
  p.hand.length = 0;
  return { cs, p };
}

let uid = 5000;
/** 把一張牌直接塞到手上再打，繞開抽牌的隨機 */
function play(cs: ReturnType<typeof beginCombat>, id: string, target?: number, upgraded = false): void {
  const u = uid++;
  cs.players[0]!.hand.push({ uid: u, cardId: id, upgraded });
  playCard(cs, u, target);
}

describe('影子分身碰到能力牌', () => {
  it('能力牌不會被重播（打馬步就是一次）', () => {
    const { cs, p } = setup();
    expect(cardById['mabu']!.type, '馬步不是能力牌了？那這條要重寫').toBe('能力');
    p.echoFirst = 1;
    p.cardsPlayedThisTurn = 0;
    p.echoUsed = false;
    play(cs, 'mabu');
    expect(getStatus(p, '貓步'), '能力牌被重播了').toBe(2);
  });

  it('打了能力牌不算浪費：這回合的重播留給下一張', () => {
    const { cs, p } = setup();
    p.echoFirst = 1;
    p.cardsPlayedThisTurn = 0;
    p.echoUsed = false;
    play(cs, 'mabu');       // 能力牌，跳過，重播沒用掉
    play(cs, 'mabu');       // 還是能力牌，照樣跳過
    expect(getStatus(p, '貓步'), '兩張能力牌各給一次＝4').toBe(4);
    expect(p.echoUsed, '能力牌不該把這回合的重播用掉').toBeFalsy();
  });

  it('封印解除再也堆不起來：打它不重播，之後那張牌才重播一次', () => {
    const { cs, p } = setup();
    expect(cardById['fengyin']!.type).toBe('能力');
    p.echoFirst = 2;                       // 兩張影子分身
    p.cardsPlayedThisTurn = 0;
    p.echoUsed = false;
    play(cs, 'fengyin');                   // 能力牌：跳過
    const 爪力 = getStatus(p, '爪力');
    const 貓步 = getStatus(p, '貓步');
    play(cs, 'fengyin');                   // 再打一張：一樣跳過，不會變成三份成長
    expect(getStatus(p, '爪力'), '第二張封印解除被重播了').toBe(爪力 * 2);
    expect(getStatus(p, '貓步'), '第二張封印解除被重播了').toBe(貓步 * 2);
  });

  it('不是能力牌的照樣重播，而且只有第一張', () => {
    const { cs, p } = setup('ninja');
    p.echoFirst = 1;
    p.cardsPlayedThisTurn = 0;
    p.echoUsed = false;
    play(cs, 'mabu');                      // 能力牌：跳過，不佔用
    p.block = 0;
    play(cs, 'tanding');                   // 第一張非能力牌（淡定，給蜷縮）：打兩次
    const 兩次 = p.block;
    play(cs, 'tanding');                   // 第二張：只打一次
    expect(p.block, '重播用掉之後不該再觸發').toBe(兩次 + 兩次 / 2);
  });

  it('影子分身自己當第一張打，不會複製自己', () => {
    const { cs, p } = setup();
    p.echoFirst = 1;
    p.cardsPlayedThisTurn = 0;
    p.echoUsed = false;
    play(cs, 'feifei_yingzi');
    expect(p.echoFirst, '影分身複製了自己').toBe(2);
  });

  /**
   * 端對端：`echoUsed` 每回合真的有歸零（推前審查 2026-09-16 低-5）。
   * 上面那幾條都是手動把旗標設回 false，所以 `combat.ts` 的 `startSeatTurn` 那一行
   * 被誰刪掉都不會紅——這條走真的結束回合。
   */
  it('下一回合的重播會回來（旗標每回合歸零）', () => {
    const { cs, p } = setup('ninja');
    p.echoFirst = 1;
    p.block = 0;
    play(cs, 'tanding');                   // 第一張非能力牌：打兩次
    const 兩次 = p.block;
    expect(p.echoUsed, '這回合的重播該用掉了').toBe(true);
    endTurn(cs);
    while (cs.phase !== 'player') endTurn(cs);
    const me = cs.players[0]!;
    me.energy = 99;
    me.hand.length = 0;
    me.block = 0;
    play(cs, 'tanding');
    expect(me.block, '下一回合第一張又該打兩次').toBe(兩次);
  });

  it('牌面有把例外寫出來（09-13 抱怨的就是牌面沒提）', () => {
    const face = describeCard(cardById['feifei_yingzi']!, false);
    expect(face, '牌面沒講能力牌這個例外').toContain('能力牌');
  });
});
