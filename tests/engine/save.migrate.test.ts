import { beforeEach, describe, expect, it } from 'vitest';
import { checkRun, loadRun, saveRun, setStore } from '../../src/engine/save';
import { me } from '../../src/engine/runplayer';
import { newRun } from '../../src/engine/run';
import type { RunState } from '../../src/engine/types';

/*
 * 存檔從第 1 版轉到第 2 版（2026-09-11，連線版：每人一份的家當搬進 `players`）。
 *
 * 這是**線上已經有人玩到一半**的東西，轉錯了就是把別人的進度弄不見，
 * 所以這一支比一般測試嚴格：不是「載得起來就好」，是**逐欄比對搬過去的值**。
 *
 * 為什麼要自己手工造一份第 1 版：`newRun` 現在只生得出第 2 版，
 * 用它產完再改版本號是自欺欺人（欄位位置早就是新的了）。
 */

function v1Save(): Record<string, unknown> {
  const fresh = newRun('migrate-me', 3, 'samurai');
  const p = me(fresh);
  // 攤平成第 1 版的長相：每人一份的那幾欄放回最上層，players 拿掉
  const { players, ...shared } = fresh as RunState & { players: unknown };
  void players;
  return {
    ...shared,
    version: 1,
    hero: p.hero,
    hp: p.hp, maxHp: p.maxHp, fish: p.fish,
    deck: p.deck, relics: p.relics, potions: p.potions,
    removeCost: p.removeCost,
  };
}

describe('第 1 版存檔轉第 2 版', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    setStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } });
  });

  it('舊存檔載得起來，而且每一欄都搬到對的位置', () => {
    const old = v1Save();
    const back = checkRun(old as unknown as Partial<RunState>);

    expect(back, '舊存檔不該被判成壞檔').not.toBeNull();
    expect(back!.version).toBe(2);
    expect(back!.players.length, '轉出來就一位').toBe(1);

    const p = me(back!);
    expect(p.hp).toBe(old['hp']);
    expect(p.maxHp).toBe(old['maxHp']);
    expect(p.fish).toBe(old['fish']);
    expect(p.removeCost).toBe(old['removeCost']);
    expect(p.hero).toBe('samurai');
    expect(p.deck.map((c) => c.cardId)).toEqual((old['deck'] as { cardId: string }[]).map((c) => c.cardId));
    expect(p.relics).toEqual(old['relics']);
    expect(p.potions).toEqual(old['potions']);
  });

  it('整局共用的欄位原封不動（地圖、亂數、關數、難度、旗標）', () => {
    const old = v1Save();
    const back = checkRun(old as unknown as Partial<RunState>)!;
    expect(back.seed).toBe(old['seed']);
    expect(back.rng).toEqual(old['rng']);
    expect(back.act).toBe(old['act']);
    expect(back.difficulty).toBe(old['difficulty']);
    expect(back.map).toEqual(old['map']);
    expect(back.flags).toEqual(old['flags']);
  });

  it('轉完之後最上層**不該再留著**舊欄位：留著遲早會有人去讀，然後兩份資料各改各的', () => {
    const back = checkRun(v1Save() as unknown as Partial<RunState>)!;
    for (const k of ['hp', 'maxHp', 'fish', 'deck', 'relics', 'potions', 'removeCost', 'hero']) {
      expect(Object.prototype.hasOwnProperty.call(back, k), `最上層不該還有 ${k}`).toBe(false);
    }
  });

  it('舊存檔壞掉的話照樣擋得住（轉換不是放行的後門）', () => {
    const bad = v1Save(); bad['hp'] = 0;
    expect(checkRun(bad as unknown as Partial<RunState>)).toBeNull();

    const bad2 = v1Save(); delete bad2['potions'];
    expect(checkRun(bad2 as unknown as Partial<RunState>)).toBeNull();

    const bad3 = v1Save(); bad3['removeCost'] = 'x';
    expect(checkRun(bad3 as unknown as Partial<RunState>)).toBeNull();
  });

  it('轉過來的檔存回去再讀一次，已經是第 2 版而且值沒變', () => {
    const back = checkRun(v1Save() as unknown as Partial<RunState>)!;
    saveRun(back);
    const again = loadRun();
    expect(again!.version).toBe(2);
    expect(me(again!).hp).toBe(me(back).hp);
    expect(me(again!).deck.length).toBe(me(back).deck.length);
  });
});
