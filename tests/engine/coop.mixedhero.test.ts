import { describe, expect, it } from 'vitest';
import { newCoopRun } from '../../src/engine/run';
import { runFingerprint } from '../../src/net/hash';
import { FEIFEI_STARTER_DECK, STARTER_DECK } from '../../src/content/cards';
import { startRelicFor } from '../../src/engine/hero';

/**
 * 一人球球、一人菲菲（2026-09-12）。
 *
 * 連線版的角色是**開房的人替兩位都挑**（見 `lobby.ts` 的 `coopHeroes`），所以混搭
 * 是正常玩法，不是邊角情況。而混搭正好踩到最多東西：起手牌與起始秘寶都跟角色綁在
 * 一起，得各發各的；牌號要從整局共用的 `nextUid` 拿，不然兩副牌會撞號；
 * 而最要命的是**兩台機器算出來必須一模一樣**——鎖步傳的是動作不是狀態，
 * 開局那一刻對不上，後面每一步都對不上。
 *
 * 原本只測到「兩位都是菲菲」（`feifei_event.test.ts`），那條走的是
 * `hero2 === heroOf(first)` 的捷徑——照第一位複製一份，根本沒碰到各發各的那一段。
 */
describe('連線：一人球球、一人菲菲', () => {
  const ids = (deck: readonly { cardId: string }[]): string[] => deck.map((c) => c.cardId).sort();

  it('各拿各的起手牌與起始秘寶', () => {
    const run = newCoopRun('mix-1', 1, 'ninja', 'feifei');
    const [a, b] = run.players;
    expect(a?.hero ?? 'ninja').toBe('ninja');
    expect(b?.hero).toBe('feifei');
    expect(ids(a!.deck)).toEqual([...STARTER_DECK].sort());
    expect(ids(b!.deck)).toEqual([...FEIFEI_STARTER_DECK].sort());
    expect(a!.relics).toContain(startRelicFor('ninja'));
    expect(b!.relics).toContain(startRelicFor('feifei'));
    expect(a!.relics).not.toContain(startRelicFor('feifei'));
  });

  it('兩副牌的牌號不會撞', () => {
    for (const [h1, h2] of [['ninja', 'feifei'], ['feifei', 'ninja'], ['feifei', 'feifei']] as const) {
      const run = newCoopRun(`uid-${h1}-${h2}`, 1, h1, h2);
      const uids = run.players.flatMap((p) => p.deck.map((c) => c.uid));
      expect(new Set(uids).size, `${h1}＋${h2} 撞號了`).toBe(uids.length);
    }
  });

  it('同一顆種子兩邊算出來一模一樣（鎖步的前提）', () => {
    for (const [h1, h2] of [['ninja', 'feifei'], ['feifei', 'ninja']] as const) {
      const x = runFingerprint(newCoopRun('lockstep', 3, h1, h2));
      const y = runFingerprint(newCoopRun('lockstep', 3, h1, h2));
      expect(y, `${h1}＋${h2} 兩次算出來不一樣`).toBe(x);
    }
  });

  it('座位順序換過來就是不同的一局（不是把兩個人當成同一種）', () => {
    const ab = runFingerprint(newCoopRun('order', 1, 'ninja', 'feifei'));
    const ba = runFingerprint(newCoopRun('order', 1, 'feifei', 'ninja'));
    expect(ba).not.toBe(ab);
  });

  it('單人一點都沒被動到', () => {
    // 連線的改動不可以外溢到單人局（這個專案的硬規矩）
    const solo = newCoopRun('solo-guard', 1, 'ninja', 'ninja');
    expect(solo.players.length).toBe(2);
    expect(ids(solo.players[0]!.deck)).toEqual(ids(solo.players[1]!.deck));
  });
});
