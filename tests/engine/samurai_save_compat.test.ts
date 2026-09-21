// 武士球球（samurai）與他的「甲」（armour）2026-09-22 整套拆掉了（使用者裁定）。
// 舊存檔裡的他要能繼續玩：讀回來當忍者球球、甲一律丟掉，不能被判成壞檔（壞檔會被 loadRun 直接清掉）。
import { beforeEach, describe, expect, it } from 'vitest';
import { heroOf } from '../../src/engine/hero';
import { newCoopRun, newRun } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { checkRun, loadRun, RUN_KEY, setStore } from '../../src/engine/save';
import { startCombat } from '../../src/engine/combat';
import { combatFingerprint } from '../../src/net/hash';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { PlayerCombat, RunState } from '../../src/engine/types';

/** 照舊版程式存下來的長相：這一位標成武士，身上還帶著一欄甲 */
function oldSamuraiSave(): Record<string, unknown> {
  const run = JSON.parse(JSON.stringify(newRun('old-samurai', 2))) as RunState;
  (run.players[0] as unknown as Record<string, unknown>)['hero'] = 'samurai';
  (run.players[0] as unknown as Record<string, unknown>)['armour'] = 12;
  return run as unknown as Record<string, unknown>;
}

describe('武士球球的舊存檔', () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map();
    setStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } });
  });

  it('讀得起來，讀出來是忍者球球、沒有甲', () => {
    const back = checkRun(oldSamuraiSave() as unknown as Partial<RunState>);
    expect(back, '不該被判成壞檔').not.toBeNull();
    const p = me(back!);
    expect(heroOf(p)).toBe('ninja');
    expect(p.hero, '跟新開的忍者局一樣不寫 hero').toBeUndefined();
    expect('armour' in p).toBe(false);
    expect(p.deck.length).toBe(me(newRun('old-samurai', 2)).deck.length);
  });

  it('從瀏覽器存檔續玩也一樣，而且存檔沒有被清掉', () => {
    mem.set(RUN_KEY, JSON.stringify(oldSamuraiSave()));
    const back = loadRun();
    expect(back).not.toBeNull();
    expect(heroOf(me(back!))).toBe('ninja');
    expect(mem.has(RUN_KEY)).toBe(true);
  });

  it('連線局裡其中一位是武士：只換那一位，另一位照舊', () => {
    const run = JSON.parse(JSON.stringify(newCoopRun('old-coop', 1, 'ninja', 'feifei'))) as RunState;
    (run.players[0] as unknown as Record<string, unknown>)['hero'] = 'samurai';
    const back = checkRun(run);
    expect(back).not.toBeNull();
    expect(back!.players.map((p) => heroOf(p))).toEqual(['ninja', 'feifei']);
  });

  it('其他亂寫的角色照舊判成壞檔（這條相容只放行武士）', () => {
    const bad = oldSamuraiSave();
    ((bad['players'] as Record<string, unknown>[])[0]!)['hero'] = 'pirate';
    expect(checkRun(bad as unknown as Partial<RunState>)).toBeNull();
  });
});

describe('連線對帳雜湊不再看甲', () => {
  it('沒有甲這一欄照樣算得出來；身上殘留一欄甲也不影響結果', () => {
    const cs = startCombat({
      hp: 70, maxHp: 70, deck: [], relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('fp')),
    });
    const fp = combatFingerprint(cs);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    (cs.players[0] as PlayerCombat & { armour?: number }).armour = 5;
    expect(combatFingerprint(cs)).toBe(fp);
  });
});
