import { beforeEach, describe, expect, it } from 'vitest';
import { newRun, runRng } from '../../src/engine/run';
import { clearSave, hasSave, loadBest, loadRun, recordBest, saveRun, setStore } from '../../src/engine/save';
import type { RunState } from '../../src/engine/types';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, raw: m };
}
let store: ReturnType<typeof memStore>;
beforeEach(() => { store = memStore(); setStore(store); });

describe('存檔', () => {
  it('存取一致，亂數狀態也接得上', () => {
    const run = newRun('save');
    runRng(run).next();
    saveRun(run);
    const back = loadRun()!;
    expect(back).toEqual(run);
    expect(runRng(back).next()).toBe(runRng(run).next());
  });
  it('沒存檔、版本不符、壞 JSON 都回 null', () => {
    expect(hasSave()).toBe(false);
    expect(loadRun()).toBeNull();
    store.setItem('qiuqiu-tower/run', JSON.stringify({ ...newRun('v'), version: 2 }));
    expect(loadRun()).toBeNull(); expect(hasSave()).toBe(false);
    expect(store.raw.has('qiuqiu-tower/run')).toBe(false);   // 不只回 null，壞存檔要被清掉
    store.setItem('qiuqiu-tower/run', '{oops');
    expect(loadRun()).toBeNull();
  });
  it('牌組裡有牌表認不得的牌 id：當作不相容，清掉回 null', () => {
    // 改過牌 id 之後留下來的舊存檔。以前這種檔載得進來，等到有人要把那張牌畫出來才爆
    const run = newRun('unknown-card');
    run.deck[0] = { uid: 999, cardId: 'no_such_card', upgraded: false };
    store.setItem('qiuqiu-tower/run', JSON.stringify(run));
    expect(loadRun()).toBeNull(); expect(hasSave()).toBe(false);
    expect(store.raw.has('qiuqiu-tower/run')).toBe(false);   // 不只回 null，壞存檔要被清掉
    // 牌物件本身壞掉（不是物件、少了 cardId）也一樣
    const broken: Partial<RunState> = newRun('broken-card');
    broken.deck = [null as unknown as RunState['deck'][number]];
    store.setItem('qiuqiu-tower/run', JSON.stringify(broken));
    expect(loadRun()).toBeNull();
    expect(store.raw.has('qiuqiu-tower/run')).toBe(false);
  });
  it('clearSave', () => {
    saveRun(newRun('c')); expect(hasSave()).toBe(true);
    clearSave(); expect(hasSave()).toBe(false);
    expect(store.raw.has('qiuqiu-tower/run')).toBe(false);
  });
  it('最佳成績：通關優先，再比樓層，再比回合', () => {
    const a = newRun('a'); a.floor = 9; a.stats.turns = 50;
    expect(recordBest(a, '2026-08-29').floor).toBe(9);
    const b = newRun('b'); b.floor = 7;
    expect(recordBest(b).floor).toBe(9);
    const c = newRun('c'); c.floor = 15; c.status = 'won'; c.stats.turns = 80;
    expect(recordBest(c).won).toBe(true);
    const d = newRun('d'); d.floor = 15; d.status = 'won'; d.stats.turns = 60;
    expect(recordBest(d).turns).toBe(60);
    const e = newRun('e'); e.floor = 15; e.status = 'won'; e.stats.turns = 70;
    expect(recordBest(e).turns).toBe(60);
    expect(loadBest()?.turns).toBe(60);
  });
  it('同一局記兩次成績結果一樣（結束時記一次、結算畫面再記一次）', () => {
    const r = newRun('twice'); r.floor = 12; r.status = 'lost'; r.stats.turns = 44;
    const first = recordBest(r, '2026-08-29');
    const second = recordBest(r, '2026-08-29');
    expect(second).toEqual(first);
    expect(loadBest()).toEqual(first);
  });
  it('最佳成績欄位壞掉就清掉回 null', () => {
    store.setItem('qiuqiu-tower/best', '{"floor":"abc"}');
    expect(loadBest()).toBeNull();
    expect(store.raw.has('qiuqiu-tower/best')).toBe(false);
  });
  it('倉庫寫不進去（空間滿了）不會把遊戲弄掛', () => {
    setStore({ getItem: () => null, setItem: () => { throw new Error('倉庫滿了'); }, removeItem: () => {} });
    expect(() => saveRun(newRun('full'))).not.toThrow();
    const r = newRun('full'); r.floor = 11;
    expect(recordBest(r, '2026-08-29')).toEqual({ floor: 11, won: false, turns: 0, date: '2026-08-29' });
  });
  it('倉庫讀不出來（getItem 直接爆）也不會把遊戲弄掛', () => {
    setStore({ getItem: () => { throw new Error('倉庫壞了'); }, setItem: () => {}, removeItem: () => { throw new Error('清不掉'); } });
    expect(loadRun()).toBeNull();
    expect(hasSave()).toBe(false);
    expect(loadBest()).toBeNull();
    expect(() => clearSave()).not.toThrow();
    // 讀得出來但是壞的，清除又爆掉：一樣只回 null，不丟例外
    setStore({ getItem: () => '{oops', setItem: () => {}, removeItem: () => { throw new Error('清不掉'); } });
    expect(loadRun()).toBeNull();
    expect(loadBest()).toBeNull();
  });
  it('flags：存檔往返留得住；舊存檔沒這欄就補成空的', () => {
    const run = newRun('flags');
    run.flags['seen:rat'] = true;
    saveRun(run);
    const back = loadRun()!;
    expect(back.flags).toEqual({ 'seen:rat': true });
    expect(back).toEqual(run);
    const old: Partial<RunState> = newRun('old');
    delete old.flags;                                   // 模擬這次改版之前存下來的檔
    store.setItem('qiuqiu-tower/run', JSON.stringify(old));
    expect(loadRun()!.flags).toEqual({});
    expect(hasSave()).toBe(true);                       // 舊存檔不算壞掉，不該被清掉
  });
});
