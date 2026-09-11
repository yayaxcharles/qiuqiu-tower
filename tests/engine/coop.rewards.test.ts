import { describe, expect, it } from 'vitest';
import { rollRelic, rollRelicChoices, settleRelicPicks } from '../../src/engine/rewards';
import { REVIVE_RATIO, addCard, closeCardReward, newCoopRun, newRun, revivePartner, takeCardReward } from '../../src/engine/run';
import { cardById } from '../../src/content/cards';
import { STARTER_DECK } from '../../src/content/cards';
import { me } from '../../src/engine/runplayer';
import { Rng, seedFromString } from '../../src/engine/rng';
import { relics } from '../../src/content/relics';
import type { CombatRewards } from '../../src/engine/rewards';
import type { RunPlayer } from '../../src/engine/types';

/*
 * 規則三（獎勵分開給，秘寶出兩件各選一件）與規則四的後半（打盹扶起同伴），
 * 使用者 2026-09-11 拍板。
 */

const rng = (s: string): Rng => new Rng(seedFromString(s));

describe('規則三：秘寶出兩件，兩個人各挑一件', () => {
  it('抽出來的兩件不重複，而且兩個人都還沒有', () => {
    const mine = relics.filter((r) => r.pool === '常見').slice(0, 5).map((r) => r.id);
    const theirs = relics.filter((r) => r.pool === '常見').slice(5, 9).map((r) => r.id);
    const out = rollRelicChoices(rng('pair'), '常見', [mine, theirs], 2);

    expect(out.length).toBe(2);
    expect(out[0]).not.toBe(out[1]);
    for (const id of out) {
      expect(mine, '一號已經有的不該再開').not.toContain(id);
      expect(theirs, '二號已經有的也不該再開').not.toContain(id);
    }
  });

  it('抽一件時跟單機的 rollRelic 完全一樣（同候選、同一次擲骰）', () => {
    const owned = ['blue_headband'];
    expect(rollRelicChoices(rng('same'), '常見', [owned], 1)).toEqual([rollRelic(rng('same'), '常見', owned)]);
  });

  it('池子抽不滿就給幾件算幾件，不會丟例外', () => {
    const all = relics.filter((r) => r.pool === '塔主').map((r) => r.id);
    expect(rollRelicChoices(rng('dry'), '塔主', [all], 2)).toEqual([]);
    const allButOne = all.slice(1);
    expect(rollRelicChoices(rng('dry2'), '塔主', [allButOne], 2).length).toBe(1);
  });

  it('各挑各的就各拿各的，一次骰都不用擲', () => {
    const r = rng('nofight');
    const before = { ...r.state };
    expect(settleRelicPicks(r, ['a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(r.state, '沒撞件就不該動到亂數').toEqual(before);
  });

  it('挑同一件：隨機給一個，剩下那件給另一位——兩個人都拿得到', () => {
    for (const seed of ['t1', 't2', 't3', 't4', 't5', 't6']) {
      const got = settleRelicPicks(rng(seed), ['a', 'b'], ['a', 'a']);
      expect(got.length).toBe(2);
      expect(new Set(got), '一人一件，不會兩個人拿到同一件').toEqual(new Set(['a', 'b']));
      expect(got.filter((x) => x === null), '沒有人空手').toEqual([]);
    }
  });

  it('撞件的贏家兩邊都可能，不是永遠第一個', () => {
    const winners = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const got = settleRelicPicks(rng(`w${i}`), ['a', 'b'], ['a', 'a']);
      winners.add(got[0] === 'a' ? 0 : 1);
    }
    expect(winners, '兩個座位都贏過').toEqual(new Set([0, 1]));
  });

  it('只有一個人挑（另一位倒下或不要）：他拿到自己挑的，另一位空手', () => {
    expect(settleRelicPicks(rng('solo'), ['a', 'b'], ['a', null])).toEqual(['a', null]);
    expect(settleRelicPicks(rng('solo2'), ['a', 'b'], [null, 'b'])).toEqual([null, 'b']);
  });

  it('挑了一個根本沒開出來的當作沒挑（被竄改的封包不該憑空變出秘寶）', () => {
    expect(settleRelicPicks(rng('hack'), ['a', 'b'], ['zzz', 'b'])).toEqual([null, 'b']);
  });
});

describe('規則四後半：打盹扶起倒下的同伴', () => {
  function twoPlayerRun(): ReturnType<typeof newRun> {
    const run = newRun('revive', 1);
    const mate: RunPlayer = { ...me(run), deck: [...me(run).deck], relics: [...me(run).relics], potions: [] };
    run.players.push(mate);
    return run;
  }

  it('扶起來就不再是倒下狀態，血回到最大生命的三成', () => {
    const run = twoPlayerRun();
    const mate = run.players[1]!;
    mate.down = true; mate.hp = 0;

    expect(revivePartner(run, 1)).toBe(true);
    expect(mate.down).toBeFalsy();
    expect(mate.hp).toBe(Math.floor(mate.maxHp * REVIVE_RATIO));
    expect(mate.hp, '爬起來是虛的，但不會是 0').toBeGreaterThan(0);
  });

  it('沒倒下的人扶不起來（也就不會被當成免費回血）', () => {
    const run = twoPlayerRun();
    const mate = run.players[1]!;
    mate.hp = 5;
    expect(revivePartner(run, 1), '他好好站著').toBe(false);
    expect(mate.hp, '血量一點都不該動').toBe(5);
  });

  it('沒有那個座位就回 false，不會丟例外', () => {
    expect(revivePartner(newRun('solo-revive', 1), 1)).toBe(false);
  });
});

describe('牌號在整局裡不能撞（兩個人的牌組共用一個號碼池）', () => {
  /*
   * 為什麼要守這條：`canPlay` 是在**那一位自己的手牌**裡找 uid。兩個人的牌撞號的話，
   * 「一號打二號的牌」會誤打成一號自己同號的那一張——引擎不會報錯，
   * 畫面上那張牌就這樣憑空變成另一張。連線版每個動作送的就是 uid，
   * 撞號等於兩台機器對「哪一張」的認知不同，直接分岔。
   *
   * 現在靠的是 `addCard` 一律用整局共用的 `run.nextUid++`。這條測試釘住那件事。
   * （2026-09-11 寫鎖步測試時，自己的測試輔助就先踩到了這個坑。）
   */
  it('兩個人的牌組沒有任何共用的牌號', () => {
    const run = newRun('uid', 1);
    const mate: RunPlayer = { ...me(run), deck: [], relics: [], potions: [] };
    run.players.push(mate);
    // 替二號也發一副起手牌，走的是同一支 addCard
    for (const id of STARTER_DECK) addCard(run, id, false, 1);

    const a = me(run).deck.map((c) => c.uid);
    const b = mate.deck.map((c) => c.uid);
    expect(b.length, '二號真的拿到牌了').toBeGreaterThan(0);
    expect(a.filter((u) => b.includes(u)), '兩副牌不可以有同號的').toEqual([]);
    expect(new Set([...a, ...b]).size, '合起來也不能有重複').toBe(a.length + b.length);
  });
});

describe('規則三後半：兩個人從同一份戰利品各挑一張牌', () => {
  function twoPlayerRun2(): ReturnType<typeof newCoopRun> { return newCoopRun('reward2', 1); }

  it('各拿各的：兩張不同的牌分別進兩副牌組', () => {
    const run = twoPlayerRun2();
    const a0 = me(run).deck.length; const a1 = run.players[1]!.deck.length;
    const r: CombatRewards = { kind: '戰鬥', cards: [
      { ...cardById['sanjo']! }, { ...cardById['tanding']! },
    ], fish: 0, potion: null, relic: null };

    takeCardReward(run, r, 'sanjo', 0);
    takeCardReward(run, r, 'tanding', 1);
    closeCardReward(r);

    expect(me(run).deck.length).toBe(a0 + 1);
    expect(run.players[1]!.deck.length).toBe(a1 + 1);
    expect(me(run).deck.at(-1)?.cardId).toBe('sanjo');
    expect(run.players[1]!.deck.at(-1)?.cardId).toBe('tanding');
  });

  it('**兩個人可以挑同一張**（那是一份清單，不是一疊實體牌）', () => {
    const run = twoPlayerRun2();
    const r: CombatRewards = { kind: '戰鬥', cards: [{ ...cardById['sanjo']! }], fish: 0, potion: null, relic: null };
    takeCardReward(run, r, 'sanjo', 0);
    takeCardReward(run, r, 'sanjo', 1);
    closeCardReward(r);
    expect(me(run).deck.at(-1)?.cardId).toBe('sanjo');
    expect(run.players[1]!.deck.at(-1)?.cardId).toBe('sanjo');
  });

  it('**第一位挑完不會把戰利品清掉**（清掉的話第二位會靜靜落空）', () => {
    const run = twoPlayerRun2();
    const r: CombatRewards = { kind: '戰鬥', cards: [{ ...cardById['sanjo']! }, { ...cardById['tanding']! }], fish: 0, potion: null, relic: null };
    takeCardReward(run, r, 'sanjo', 0);
    expect(r.cards.length, '還沒關，第二位才挑得到').toBe(2);
    closeCardReward(r);
    expect(r.cards.length, '關掉之後就不能再挑了').toBe(0);
  });

  it('放棄（傳 null）不會拿到牌，也不影響另一位', () => {
    const run = twoPlayerRun2();
    const a0 = me(run).deck.length; const a1 = run.players[1]!.deck.length;
    const r: CombatRewards = { kind: '戰鬥', cards: [{ ...cardById['sanjo']! }], fish: 0, potion: null, relic: null };
    takeCardReward(run, r, null, 0);
    takeCardReward(run, r, 'sanjo', 1);
    closeCardReward(r);
    expect(me(run).deck.length, '我放棄了').toBe(a0);
    expect(run.players[1]!.deck.length, '他照拿').toBe(a1 + 1);
  });

  it('兩副牌組的牌號還是不撞（各拿各的也共用同一個號碼池）', () => {
    const run = twoPlayerRun2();
    const r: CombatRewards = { kind: '戰鬥', cards: [{ ...cardById['sanjo']! }], fish: 0, potion: null, relic: null };
    takeCardReward(run, r, 'sanjo', 0);
    takeCardReward(run, r, 'sanjo', 1);
    closeCardReward(r);
    const a = me(run).deck.map((c) => c.uid); const b = run.players[1]!.deck.map((c) => c.uid);
    expect(a.filter((u) => b.includes(u))).toEqual([]);
  });
});
