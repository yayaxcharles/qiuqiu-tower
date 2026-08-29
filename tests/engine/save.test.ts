import { beforeEach, describe, expect, it } from 'vitest';
import { newRun, runRng } from '../../src/engine/run';
import { clearSave, hasSave, loadBest, loadRun, recordBest, saveRun, setStore } from '../../src/engine/save';

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
    store.setItem('qiuqiu-tower/run', '{oops');
    expect(loadRun()).toBeNull();
  });
  it('clearSave', () => {
    saveRun(newRun('c')); expect(hasSave()).toBe(true);
    clearSave(); expect(hasSave()).toBe(false);
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
});
