import { describe, expect, it } from 'vitest';
import { applyEffects } from '../../src/engine/effects';
import { startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';

/*
 * `blockAll`（分你一半／別沾在身上＋）自己那一份要走 `selfBlockPool`。
 *
 * `flushSelfBlock` 看到隊伍後面還有 `blockAll` 就把前面的 `block` 先留著（同一張牌給自己兩次蜷縮
 * 只能過一次拒馬加成，2026-09-13 稽核 中-6）。以前 `blockAll` 自己直接 `gainBlock`、不碰池子，
 * 「先 block 再 blockAll」的牌會把前面那份靜靜吞掉（2026-09-15 稽核 引擎 低-9）。
 * 今天沒有牌這樣排，這條是守住那個洞：哪天有人這樣寫牌，這裡先紅。
 */
function pair() {
  const cs = startCombat({
    hp: 60, maxHp: 80, deck: [inst('tanding', 1)], relics: [], potions: [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('blockall')),
  });
  const me = cs.player; me.block = 0;
  const mate = blankPlayer([], 1); cs.players.push(mate); mate.block = 0;
  return { cs, me, mate };
}

describe('blockAll 自己那份走池子', () => {
  it('先 block 4 再 blockAll 3：自己 7 一次發（拒馬只加一次）、同伴 3', () => {
    const { cs, me, mate } = pair();
    me.blockBonus = 2;                                                   // 拒馬：每次獲得蜷縮多 2
    applyEffects(cs, [{ kind: 'block', amount: 4 }, { kind: 'blockAll', amount: 3 }], { self: me, source: 'card' });
    expect(me.block, '4＋3 合成一次發，拒馬只加一次＝9；以前是 4 被吞掉、只剩 3＋2').toBe(9);
    expect(mate.block, '同伴那份照舊').toBe(3);
  });

  it('只有 blockAll（分你一半）：兩個人各拿一份，跟以前一樣', () => {
    const { cs, me, mate } = pair();
    applyEffects(cs, [{ kind: 'blockAll', amount: 5 }], { self: me, source: 'card' });
    expect(me.block).toBe(5);
    expect(mate.block).toBe(5);
  });

  it('blockAll 之後還有 block：等最後那條一起發，還是只過一次拒馬', () => {
    const { cs, me, mate } = pair();
    me.blockBonus = 2;
    applyEffects(cs, [{ kind: 'blockAll', amount: 3 }, { kind: 'block', amount: 4 }], { self: me, source: 'card' });
    expect(me.block).toBe(9);
    expect(mate.block).toBe(3);
  });
});
