// 職業（2026-09-05）：忍者球球與武士球球共用大部分牌，各自有獨占牌。
// 中分流——CardDef.hero 沒寫＝共用；RunState.hero 沒寫＝忍者（舊存檔相容）。
import { describe, expect, it } from 'vitest';

import { cards } from '../../src/content/cards';
import { newRun } from '../../src/engine/run';
import { loadRun, saveRun, setStore } from '../../src/engine/save';
import { cardsForHero, heroOf } from '../../src/engine/hero';
import { Rng, seedFromString } from '../../src/engine/rng';
import { rollCardChoices } from '../../src/engine/rewards';

describe('牌池分流', () => {
  it('沒標 hero 的牌兩個職業都拿得到', () => {
    const shared = cards.filter((c) => !c.hero);
    expect(shared.length).toBeGreaterThan(50);
    for (const c of shared.slice(0, 20)) {
      expect(cardsForHero('ninja').includes(c), c.name).toBe(true);
      expect(cardsForHero('samurai').includes(c), c.name).toBe(true);
    }
  });

  it('標了 hero 的牌只有那個職業拿得到', () => {
    const ninjaOnly = cards.filter((c) => c.hero === 'ninja');
    expect(ninjaOnly.length, '隱身潛水那批該標成忍者獨占').toBe(10);
    for (const c of ninjaOnly) {
      expect(cardsForHero('ninja').includes(c), c.name).toBe(true);
      expect(cardsForHero('samurai').includes(c), `武士不該拿到 ${c.name}`).toBe(false);
    }
  });

  it('隱身與潛水的牌一張都不留給武士', () => {
    const bad = cardsForHero('samurai').filter((c) =>
      JSON.stringify(c.effects).includes('隱身') || JSON.stringify(c.effects).includes('潛水'));
    expect(bad.map((c) => c.name), '武士沒有閃避手段').toEqual([]);
  });
});

describe('這一局是哪個職業', () => {
  it('沒指定就是忍者', () => {
    expect(heroOf(newRun('h1'))).toBe('ninja');
  });

  it('指定武士就是武士', () => {
    const run = newRun('h2', 1, 'samurai');
    expect(heroOf(run)).toBe('samurai');
  });

  it('舊存檔沒有 hero 這一欄，讀回來當忍者，而且不會被判成壞檔', () => {
    const m = new Map<string, string>();
    setStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } });
    const run = newRun('old');
    delete (run as { hero?: string }).hero;
    saveRun(run);
    expect(m.get('qiuqiu-tower/run')).not.toContain('hero');
    const back = loadRun();
    expect(back, '舊存檔不該被清掉').not.toBeNull();
    expect(back!.version, '加可選欄位不可以升存檔版本').toBe(1);
    expect(heroOf(back!)).toBe('ninja');
  });
});

describe('抽牌時真的濾掉別職業的獨占牌', () => {
  it('武士的戰鬥獎勵、罐頭鋪、事件選牌都開不出隱身牌', () => {
    const ninjaOnly = new Set(cards.filter((c) => c.hero === 'ninja').map((c) => c.id));
    let seen = 0;
    for (let i = 0; i < 300; i++) {
      const picks = rollCardChoices(new Rng(seedFromString(`s${i}`)), '忍術', 3, [], true, 0, undefined, 'samurai');
      for (const c of picks) {
        expect(ninjaOnly.has(c.id), `武士開出了忍者獨占牌 ${c.name}`).toBe(false);
        seen++;
      }
    }
    expect(seen, '要真的有抽到牌，不然這條等於沒測').toBeGreaterThan(500);
  });

  it('忍者照樣抽得到自己的獨占牌', () => {
    const got = new Set<string>();
    for (let i = 0; i < 300; i++) {
      for (const c of rollCardChoices(new Rng(seedFromString(`n${i}`)), '忍術', 3, [], true, 0, undefined, 'ninja')) {
        if (c.hero === 'ninja') got.add(c.id);
      }
    }
    expect(got.size, '忍者該抽得到隱身牌').toBeGreaterThan(3);
  });
});
