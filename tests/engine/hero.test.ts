// 職業（2026-09-05）：各角色共用大部分牌，各自有獨占牌（武士球球 2026-09-22 拆掉了）。
// 中分流——CardDef.hero 沒寫＝共用；RunState.hero 沒寫＝忍者（舊存檔相容）。
import { describe, expect, it } from 'vitest';

import { cards } from '../../src/content/cards';
import { newRun } from '../../src/engine/run';
import { loadRun, saveRun, setStore, RUN_KEY } from '../../src/engine/save';
import { cardsForHero, heroOf } from '../../src/engine/hero';
import { Rng, seedFromString } from '../../src/engine/rng';
import { rollCardChoices } from '../../src/engine/rewards';
import { me } from '../../src/engine/runplayer';

describe('牌池分流', () => {
  it('沒標 hero 的牌球球拿得到', () => {
    const shared = cards.filter((c) => !c.hero);
    expect(shared.length).toBeGreaterThan(50);
    for (const c of shared.slice(0, 20)) {
      expect(cardsForHero('ninja').includes(c), c.name).toBe(true);
    }
  });

  it('標了 hero 的牌只有那個職業拿得到', () => {
    const ninjaOnly = cards.filter((c) => c.hero === 'ninja');
    // 13→17（2026-09-14 使用者）：菲菲力氣小，地裂陣、沾衣十八跌、鐵頭功不給她；分身術她有自己那張疊毒的
    // 17→18（同日併回前裁定）：影子分身球球維持原版、她留 9/12 改版，分成兩張
    expect(ninjaOnly.length, '隱身潛水那批該標成忍者獨占（10 張）＋連線牌「你先躲」「跟著我躲好」「有我在前面」＋地裂陣、沾衣十八跌、鐵頭功、分身術、影子分身').toBe(18);
    for (const c of ninjaOnly) {
      expect(cardsForHero('ninja').includes(c), c.name).toBe(true);
    }
  });
});

describe('這一局是哪個職業', () => {
  it('沒指定就是忍者', () => {
    expect(heroOf(me(newRun('h1')))).toBe('ninja');
  });

  it('沒指定職業就不寫 hero 這一欄，讀回來當忍者', () => {
    const m = new Map<string, string>();
    setStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } });
    saveRun(newRun('old'));
    expect(m.get(RUN_KEY)).not.toContain('hero');
    const back = loadRun();
    expect(back, '不該被判成壞檔').not.toBeNull();
    expect(heroOf(me(back!))).toBe('ninja');
  });
});

describe('抽牌時真的濾掉別職業的獨占牌', () => {
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
