import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { beginCombat, newRun } from '../../src/engine/run';
import { playCard } from '../../src/engine/combat';
import { getStatus } from '../../src/engine/statuses';

/**
 * 影子分身要不要複製「能力牌」（2026-09-13 使用者實測回報）。
 *
 * 使用者的原話：「下一個回合我剛才打出一張絕學馬步，效果是貓步 +2，
 * 理論上我有影子分身 buff 應該要變成貓步 +4，但她沒有。」
 *
 * 病根是那條判斷寫成 `st.def.type !== '能力'`——本意只是擋「影子分身自己複製自己」
 *（第一張就打它的話會當場再給一層），卻把**所有**能力牌一起排除了。
 * 牌面寫的是「之後每回合打出的第一張牌，會再打一次」，一個例外都沒提。
 *
 * 這一類的共同特徵還是**靜音**：不丟例外、紀錄也不會說，畫面只是「數字比你想的小」。
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
function play(cs: ReturnType<typeof beginCombat>, id: string, target?: number): void {
  const u = uid++;
  cs.players[0]!.hand.push({ uid: u, cardId: id, upgraded: false });
  playCard(cs, u, target);
}

describe('影子分身與能力牌', () => {
  it('有影分身時，第一張打馬步＝貓步拿兩次（使用者回報的那一局）', () => {
    const { cs, p } = setup();
    expect(cardById['mabu']!.type, '馬步不是能力牌了？那這條要重寫').toBe('能力');
    p.echoFirst = 1;                       // 上一回合打過影子分身
    p.cardsPlayedThisTurn = 0;             // 當成新回合
    play(cs, 'mabu');
    expect(getStatus(p, '貓步'), '第一張牌沒有打兩次——能力牌又被整類排除了嗎？').toBe(4);
  });

  it('沒有影分身就是一次', () => {
    const { cs, p } = setup();
    p.cardsPlayedThisTurn = 0;
    play(cs, 'mabu');
    expect(getStatus(p, '貓步')).toBe(2);
  });

  it('第二張以後不複製', () => {
    const { cs, p } = setup();
    p.echoFirst = 1;
    p.cardsPlayedThisTurn = 0;
    play(cs, 'mabu');                      // 第一張：2 → 4
    play(cs, 'mabu');                      // 第二張：只加 2
    expect(getStatus(p, '貓步')).toBe(6);
  });

  it('影子分身自己當第一張打，不會複製自己', () => {
    const { cs, p } = setup();
    p.echoFirst = 1;                       // 已經有一層
    p.cardsPlayedThisTurn = 0;
    play(cs, 'yingzi');
    expect(p.echoFirst, '影分身複製了自己——那條例外被拿掉了').toBe(2);
  });
});

/**
 * 這幾張「效果存在角色旗標上」的能力牌要出現在狀態列（同一次回報：
 * 「我身上下方也沒有出現影子分身的 buff 圖示」）。
 *
 * 它們走的是 `echoFirst`／`poisonOnAttack`／`poisonBurst`／`blockBonus` 旗標，
 * 不是 `kind: 'power'`，所以 `p.powers` 收不到，`statusRow` 那排「生效中的能力牌」
 * 就一個都不畫——玩家打完之後身上沒有任何東西告訴他這張牌還在生效。
 */
describe('旗標型能力牌要進 powers（狀態列才畫得出來）', () => {
  const CASES: [string, string][] = [
    ['yingzi', '影子分身'], ['feifei_qianzhen', '千針萬毒'],
    ['feifei_yudu', '餘毒'], ['feifei_juma', '拒馬'],
  ];

  it('四張牌都還在（改名或改機制要回來改這支測試）', () => {
    const gone = CASES.filter(([id]) => !cardById[id]).map(([, n]) => n);
    expect(gone, `這幾張查不到了：${gone.join('、')}`).toEqual([]);
  });

  for (const [id, label] of CASES) {
    it(`打出「${label}」之後，powers 裡看得到它`, () => {
      const { cs, p } = setup();
      p.cardsPlayedThisTurn = 0;
      play(cs, id, cs.enemies[0]?.uid);
      const mine = p.powers.filter((pw) => pw.cardId === id);
      expect(mine.length, `${label} 沒進 powers——狀態列不會畫出來`).toBe(1);
      expect(mine[0]!.effects, 'passive 的 effects 要是空的，不然觸發迴圈會多跑一次').toEqual([]);
      expect(mine[0]!.trigger, '要掛成 passive，不然會被觸發迴圈跑到').toBe('passive');
    });
  }
});
