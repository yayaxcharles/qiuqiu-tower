import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { endTurn, playCard, resolveChoice, startCombat, usePotion } from '../../src/engine/combat';
import { applyEffects } from '../../src/engine/effects';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function deck(ids: string[]): CardInstance[] { return ids.map((id, i) => inst(id, i + 1)); }
function start(encounterId: string, extra: string[] = [], potions: string[] = [], seed = 'fx'): CombatState {
  const cs = startCombat({ hp: 70, maxHp: 70, deck: deck([...STARTER_DECK, ...extra]), relics: [], potions, encounterId, rng: new Rng(seedFromString(seed)) });
  cs.player.energy = 9;
  return cs;
}
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('選牌類效果', () => {
  it('讀心術：看頂 3 張、丟掉選的、再抽 1', () => {
    const cs = start('wood_dummy', ['duxin']);
    const uid = toHand(cs, 'duxin');
    const top = cs.player.drawPile.slice(0, 3).map((c) => c.uid);
    const handBefore = cs.player.hand.length;
    playCard(cs, uid);
    expect(cs.pending?.purpose).toBe('scryDiscard');
    expect(cs.pending?.cards.map((c) => c.uid)).toEqual(top);
    expect(endTurn(cs)).toBeUndefined(); expect(cs.turn).toBe(1);          // 有待選不能結束回合
    expect(resolveChoice(cs, [top[0]!])).toBe(true);
    expect(cs.pending).toBeNull();
    expect(cs.player.discardPile.some((c) => c.uid === top[0])).toBe(true);
    expect(cs.player.hand.length).toBe(handBefore);                         // 打出 −1、抽 1
    expect(cs.player.hand.at(-1)?.uid).toBe(top[1]);                        // 抽到的是原本第 2 張
  });
  it('告退：消耗一張手牌再抽 1；亂選會被拒', () => {
    const cs = start('wood_dummy', ['gaotui']);
    const uid = toHand(cs, 'gaotui');
    playCard(cs, uid);
    expect(cs.pending?.purpose).toBe('exhaust');
    expect(resolveChoice(cs, [999])).toBe(false);
    expect(resolveChoice(cs, [])).toBe(false);
    const victim = cs.pending!.cards[0]!.uid;
    expect(resolveChoice(cs, [victim])).toBe(true);
    expect(cs.player.exhaustPile.map((c) => c.uid)).toContain(victim);
  });
  it('拖字訣：保留的牌回合結束不棄', () => {
    const cs = start('wood_dummy', ['tuozi']);
    playCard(cs, toHand(cs, 'tuozi'));
    const keep = cs.pending!.cards[0]!.uid;
    resolveChoice(cs, [keep]);
    endTurn(cs);
    expect(cs.player.hand.some((c) => c.uid === keep)).toBe(true);
  });
  it('移形換影：抽 3 棄 1；隔空取物：從棄牌堆拿回', () => {
    const cs = start('wood_dummy', ['yixing', 'gekong']);
    const n = cs.player.hand.length;
    playCard(cs, toHand(cs, 'yixing'));
    expect(cs.pending?.purpose).toBe('discard');
    const drop = cs.pending!.cards[0]!.uid;
    resolveChoice(cs, [drop]);
    expect(cs.player.hand.length).toBe(n - 1 + 3 - 1);
    playCard(cs, toHand(cs, 'gekong'));
    expect(cs.pending?.purpose).toBe('recover');
    expect(resolveChoice(cs, [drop])).toBe(true);
    expect(cs.player.hand.some((c) => c.uid === drop)).toBe(true);
  });
  it('候選為空就不暫停', () => {
    const cs = start('wood_dummy', ['gaotui']);
    const uid = toHand(cs, 'gaotui');
    cs.player.drawPile.push(...cs.player.hand.filter((c) => c.uid !== uid));
    cs.player.hand = cs.player.hand.filter((c) => c.uid === uid);
    playCard(cs, uid);
    expect(cs.pending).toBeNull();
    expect(cs.player.hand.length).toBe(1);   // 只有抽到的 1 張
  });
  it('已經分出勝負就不暫停選牌', () => {
    const cs = start('wood_dummy');
    cs.phase = 'won';
    applyEffects(cs, [{ kind: 'scry', n: 3 }], { source: 'card' });
    expect(cs.pending).toBeNull();
  });
});

describe('其他效果', () => {
  it('交出來奪走蜷縮；太極照蜷縮值打', () => {
    const cs = start('wood_dummy', ['jiaochulai', 'taiji']);
    const e = cs.enemies[0]!; e.block = 8; const hp = e.hp;
    playCard(cs, toHand(cs, 'jiaochulai'), e.uid);
    expect(cs.player.block).toBe(8); expect(e.block).toBe(0); expect(e.hp).toBe(hp - 4);
    cs.player.block = 10;
    playCard(cs, toHand(cs, 'taiji'), e.uid);
    expect(e.hp).toBe(hp - 14); expect(cs.player.block).toBe(10);
  });
  it('甩鍋術把負面狀態丟給魔物；封口術拆增益與蜷縮', () => {
    const cs = start('wood_dummy', ['shuaiguo', 'fengkou']);
    const e = cs.enemies[0]!;
    addStatus(cs.player, '翻肚', 2); addStatus(cs.player, '懶洋洋', 1);
    playCard(cs, toHand(cs, 'shuaiguo'), e.uid);
    expect(getStatus(cs.player, '翻肚')).toBe(0); expect(getStatus(e, '翻肚')).toBe(2); expect(getStatus(e, '懶洋洋')).toBe(1);
    addStatus(e, '爪力', 2); e.block = 5;
    playCard(cs, toHand(cs, 'fengkou'), e.uid);
    expect(getStatus(e, '爪力')).toBe(0); expect(e.block).toBe(0);
  });
  it('我什麼都沒看到：本回合攻擊打不到', () => {
    const cs = start('cucumber', ['meikandao']);
    playCard(cs, toHand(cs, 'meikandao'));
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    const hp = cs.player.hp; endTurn(cs);
    expect(cs.player.hp).toBe(hp);
  });
  it('先睡了：回血後回合直接結束；蓄力讓下一張攻擊加倍', () => {
    const cs = start('wood_dummy', ['xianshuile', 'xuli']);
    cs.player.hp = 50;
    playCard(cs, toHand(cs, 'xianshuile'));
    expect(cs.player.hp).toBe(54); expect(cs.turn).toBe(2);
    cs.player.energy = 9;
    playCard(cs, toHand(cs, 'xuli'));
    const e = cs.enemies[0]!; e.block = 0; const hp = e.hp;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(e.hp).toBe(hp - 12);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(e.hp).toBe(hp - 18);
  });
  it('順風耳下回合多抽；潛水術下回合再給隱身', () => {
    const cs = start('wood_dummy', ['shunfenger', 'qianshui']);
    playCard(cs, toHand(cs, 'shunfenger'));
    playCard(cs, toHand(cs, 'qianshui'));
    expect(getStatus(cs.player, '隱身')).toBe(1);
    endTurn(cs);                                   // 木樁人第一動是硬撐，不會消耗隱身
    expect(cs.player.hand.length).toBe(7);
    expect(getStatus(cs.player, '隱身')).toBe(2);
  });
  it('順手牽羊擊倒時加小魚乾', () => {
    const cs = start('rats2', ['shunshou']);
    const e = cs.enemies[0]!; e.hp = 3;
    playCard(cs, toHand(cs, 'shunshou'), e.uid);
    expect(e.dead).toBe(true); expect(cs.fishDelta).toBe(15);
  });
});

describe('忍具', () => {
  it('手裡劍不吃爪力、用完即丟；鞭炮打全體；有待選時不能用', () => {
    const cs = start('rats2', ['duxin'], ['shuriken', 'firecracker']);
    addStatus(cs.player, '爪力', 3);
    const [a, b] = cs.enemies as [typeof cs.enemies[0], typeof cs.enemies[0]];
    const ha = a.hp, hb = b.hp;
    expect(usePotion(cs, 'shuriken', a.uid)).toBe(true);
    expect(a.hp).toBe(ha - 8);
    expect(cs.potions).toEqual(['firecracker']);
    expect(usePotion(cs, 'shuriken', a.uid)).toBe(false);
    playCard(cs, toHand(cs, 'duxin'));
    expect(usePotion(cs, 'firecracker')).toBe(false);
    resolveChoice(cs, []);
    expect(usePotion(cs, 'firecracker')).toBe(true);
    expect(a.hp).toBe(ha - 14); expect(b.hp).toBe(hb - 6);
  });
});
