import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { damageEnemy } from '../../src/engine/actions';
import { canPlay, endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { applyRunEffects, newRun } from '../../src/engine/run';
import { getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 第二波魔物（2026-09-02，docs/怪物擴充_第二波_設計稿.md）的機制回歸。
 * 十個新機制各釘一條：縮殼、飛行、鱗甲、沉睡、消散、分裂、詛咒、憤怒、自爆、鼓舞（含盾陣、塞牌）。
 *
 * 血量刻意給很高（`hp` 參數）：這裡驗的是機制，不是誰打得贏誰——
 * 讓球球在中途被打死的話，測到一半戰鬥就結束了，看不出後面幾拍。
 */
const DECK = ['sanjo', 'sanjo', 'sanjo', 'tanding', 'tanding'];
function start(encounterId: string, hp = 400, deckIds: readonly string[] = DECK): CombatState {
  return startCombat({
    hp, maxHp: hp, deck: deckIds.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId, rng: new Rng(seedFromString('monsters2')),
  });
}
/** 手上、抽牌堆、棄牌堆、消耗堆全部加起來——塞進來的牌不管落在哪一堆都數得到 */
function allCards(cs: CombatState): CardInstance[] {
  const p = cs.player;
  return [...p.hand, ...p.drawPile, ...p.discardPile, ...p.exhaustPile];
}
const countOf = (cs: CombatState, cardId: string): number => allCards(cs).filter((c) => c.cardId === cardId).length;

describe('第二波魔物的機制', () => {
  it('縮殼：第一次被打痛長出防禦，而且一場只有一次', () => {
    const cs = start('armadillo_pup');
    const e = cs.enemies[0]!;
    expect(getStatus(e, '縮殼')).toBe(8);
    damageEnemy(cs, e, 3);
    expect(e.block, '第一次被打痛就縮起來').toBe(8);
    expect(getStatus(e, '縮殼'), '縮完狀態就消失').toBe(0);
    e.block = 0;
    damageEnemy(cs, e, 3);
    expect(e.block, '第二次不會再縮').toBe(0);
  });

  it('飛行：攻擊只吃一半、打痛剝一層，掉到 0 就打得到全額；牠的回合開始又飛起來', () => {
    const cs = start('lantern_moth');
    const e = cs.enemies[0]!;
    expect(getStatus(e, '飛行')).toBe(3);
    const hp0 = e.hp;
    damageEnemy(cs, e, 9);
    expect(hp0 - e.hp, '9 點只打進 4 點').toBe(4);
    expect(getStatus(e, '飛行')).toBe(2);
    damageEnemy(cs, e, 9);
    damageEnemy(cs, e, 9);
    expect(getStatus(e, '飛行'), '打三下就落地').toBe(0);
    const hp1 = e.hp;
    damageEnemy(cs, e, 9);
    expect(hp1 - e.hp, '落地之後全額').toBe(9);
    endTurn(cs);
    expect(getStatus(e, '飛行'), '牠的回合開始補回滿層').toBe(3);
  });

  it('鱗甲：牠的回合結束長出等同層數的防禦，被打痛就剝落一層', () => {
    const cs = start('plated_beetle');
    const e = cs.enemies[0]!;
    expect(getStatus(e, '鱗甲')).toBe(6);
    damageEnemy(cs, e, 5);
    expect(getStatus(e, '鱗甲'), '打痛一下剝一層').toBe(5);
    endTurn(cs);
    expect(e.block, '回合結束長出 5 點防禦').toBe(5);
    expect(getStatus(e, '鱗甲'), '層數不會自己長回來').toBe(5);
  });

  it('沉睡：睡著的什麼都不做；打痛牠會提早醒，而且醒來 +爪力', () => {
    const cs = start('hibernating_bear');
    const e = cs.enemies[0]!;
    expect(getStatus(e, '沉睡')).toBe(3);
    expect(e.move.label).toBe('呼呼大睡');
    const hp0 = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hp, '睡著的不會出手').toBe(hp0);
    expect(getStatus(e, '沉睡'), '每個牠的回合睡掉一層').toBe(2);
    damageEnemy(cs, e, 5);
    expect(getStatus(e, '沉睡'), '任何扣血都會叫醒牠').toBe(0);
    expect(getStatus(e, '爪力'), 'onWake：醒來很生氣').toBe(3);
    expect(e.move.label, '醒來從招式表第一招開始').toBe('拍');
    endTurn(cs);
    expect(cs.player.hp, '醒了就會打人').toBeLessThan(hp0);
  });

  it('消散：時間到自己散去，不算打倒也不算逃走給的獎勵', () => {
    const cs = start('phantom_fox');
    const e = cs.enemies[0]!;
    expect(getStatus(e, '消散')).toBe(4);
    for (let i = 0; i < 4 && cs.phase === 'player'; i++) endTurn(cs);
    expect(e.dead).toBe(true);
    expect(e.escaped, '走 escape 那條路').toBe(true);
    expect(cs.kills, '散掉的不算打倒').toBe(0);
    expect(cs.phase).toBe('won');
    expect(cs.log.some((l) => l.includes('散去了'))).toBe(true);
  });

  it('分裂：半血裂成兩隻，每隻的血量等於本體剩下的血，本體不算打倒', () => {
    const cs = start('dango_slime');
    const e = cs.enemies[0]!;
    const half = Math.floor(e.maxHp / 2);
    damageEnemy(cs, e, e.hp - half);
    expect(e.split).toBe(true);
    expect(e.dead).toBe(true);
    expect(e.escaped, '本體消失不算打倒').toBe(true);
    expect(cs.kills).toBe(0);
    const bits = cs.enemies.filter((x) => x.enemyId === 'dango_bit' && !x.dead);
    expect(bits.length).toBe(2);
    for (const b of bits) { expect(b.hp).toBe(half); expect(b.maxHp).toBe(half); }
    // 一場只裂一次：把小的也打到半血以下，不會再裂
    const before = cs.enemies.length;
    damageEnemy(cs, bits[0]!, 1);
    expect(cs.enemies.length).toBe(before);
  });

  it('詛咒：打技能牌會被塞牌進抽牌堆，打攻擊牌不會', () => {
    const cs = start('curse_priest', 400, ['sanjo', 'tanding']);
    const e = cs.enemies[0]!;
    const atk = cs.player.hand.find((c) => c.cardId === 'sanjo')!;
    expect(playCard(cs, atk.uid, e.uid)).toBe(true);
    expect(countOf(cs, 'dazed_card'), '攻擊牌不觸發').toBe(0);
    const skill = cs.player.hand.find((c) => c.cardId === 'tanding')!;
    expect(playCard(cs, skill.uid)).toBe(true);
    expect(countOf(cs, 'dazed_card'), '技能牌被塞一張').toBe(1);
    const uids = allCards(cs).map((c) => c.uid);
    expect(new Set(uids).size, '塞進來的牌編號不會跟原本的牌撞號').toBe(uids.length);
  });

  it('憤怒：打技能牌會讓牠 +爪力', () => {
    const cs = start('red_oni', 400, ['tanding']);
    const e = cs.enemies[0]!;
    const before = getStatus(e, '爪力');
    expect(playCard(cs, cs.player.hand[0]!.uid)).toBe(true);
    expect(getStatus(e, '爪力')).toBe(before + 1);
    expect(cs.log.some((l) => l.includes('被激怒了'))).toBe(true);
  });

  it('自爆：先打球球一記大的，然後牠自己倒下（算打倒）', () => {
    const cs = start('puffer_spirit');
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '爆炸', effects: [{ kind: 'selfDestruct', amount: 28 }] };
    const hp0 = cs.player.hp;
    endTurn(cs);
    expect(hp0 - cs.player.hp).toBe(28);
    expect(e.dead).toBe(true);
    expect(e.escaped, '自爆算打倒，戰利品照發').toBe(false);
    expect(cs.kills).toBe(1);
    expect(cs.phase).toBe('won');
  });

  it('鼓舞與盾陣：全體（含自己）拿到爪力／防禦，而且不會被排在後面的同伴洗掉', () => {
    const cs = start('rat_general');
    const gen = cs.enemies.find((e) => e.enemyId === 'rat_general')!;
    expect(cs.enemies.length).toBe(3);
    const before = cs.enemies.map((e) => getStatus(e, '爪力'));
    gen.move = { intent: 'buff', label: '號令', effects: [{ kind: 'statusAllies', name: '爪力', amount: 2 }] };
    endTurn(cs);
    cs.enemies.forEach((e, i) => expect(getStatus(e, '爪力'), e.name).toBe(before[i]! + 2));
    gen.move = { intent: 'block', label: '盾陣', effects: [{ kind: 'blockAllies', amount: 8 }] };
    endTurn(cs);
    for (const e of cs.enemies) expect(e.block, `${e.name} 的防禦`).toBeGreaterThanOrEqual(8);
  });

  it('塞牌：棄牌堆與抽牌堆兩種都塞得進去', () => {
    // 牌組要夠厚，抽牌堆才不會在回合開始時抽空重洗——重洗會把棄牌堆整疊搬走，就分不出牌被塞去哪一堆了
    const thick = Array.from({ length: 14 }, (_, i) => (i % 2 ? 'tanding' : 'sanjo'));
    const cs = start('dango_slime', 400, thick);
    const e = cs.enemies[0]!;
    e.move = { intent: 'debuff', label: '黏一下', effects: [{ kind: 'giveCard', cardId: 'slime_card', n: 2, to: 'discard' }] };
    endTurn(cs);
    expect(cs.player.discardPile.filter((c) => c.cardId === 'slime_card').length, '塞進棄牌堆').toBe(2);
    e.move = { intent: 'debuff', label: '鱗粉', effects: [{ kind: 'giveCard', cardId: 'dazed_card', n: 3, to: 'draw' }] };
    endTurn(cs);
    expect(countOf(cs, 'dazed_card')).toBe(3);
    expect(cs.player.discardPile.filter((c) => c.cardId === 'dazed_card').length, '這三張是洗進抽牌堆的，不是丟棄牌堆').toBe(0);
  });

  it('黏液：花 1 顆飯糰打出去就消耗掉，不會回到棄牌堆', () => {
    const cs = start('wood_dummy', 400, ['slime_card', 'tanding']);
    const slime = cs.player.hand.find((c) => c.cardId === 'slime_card')!;
    const energy = cs.player.energy;
    expect(playCard(cs, slime.uid)).toBe(true);
    expect(cs.player.energy).toBe(energy - 1);
    expect(cs.player.exhaustPile.some((c) => c.uid === slime.uid)).toBe(true);
    expect(cs.player.discardPile.some((c) => c.uid === slime.uid)).toBe(false);
  });

  it('眼冒金星：不可打出，回合結束就消失（不進棄牌堆）', () => {
    const cs = start('wood_dummy', 400, ['dazed_card', 'tanding']);
    const dazed = cs.player.hand.find((c) => c.cardId === 'dazed_card')!;
    expect(canPlay(cs, dazed.uid).ok).toBe(false);
    endTurn(cs);
    expect(cs.player.discardPile.some((c) => c.uid === dazed.uid), '不進棄牌堆').toBe(false);
    expect(cs.player.exhaustPile.some((c) => c.uid === dazed.uid), '直接消失').toBe(true);
  });

  it('戰鬥雜牌只有魔物塞得進來：事件抽壞毛病抽不到', () => {
    const run = newRun('junk-pool');
    for (let i = 0; i < 60; i++) applyRunEffects(run, [{ kind: 'addRandomCard', pool: '壞毛病' }]);
    expect(run.deck.some((c) => cardById[c.cardId]?.pool === '壞毛病')).toBe(true);
    expect(run.deck.every((c) => !cardById[c.cardId]?.combatOnly)).toBe(true);
  });
});
