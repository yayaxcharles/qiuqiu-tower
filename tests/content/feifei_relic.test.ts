import { describe, expect, it } from 'vitest';
import { relics } from '../../src/content/relics';
import { rollRelic } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';

/**
 * 秘寶的職業鎖（`RelicDef.notFor`）。
 *
 * 2026-09-12 起紙袋與影披風鎖住菲菲（她沒有隱身牌，放大器對她期望值太低）。
 * **2026-09-14 深夜拿掉**：使用者把「後退閃躲」改成獲得隱身（跟師兄學來的招式），
 * 兩件放大器對她有用了（使用者：「這樣剛好她拿隱身秘寶也有用」）。
 *
 * 機制留著、目前沒有任何秘寶在用。原本盯五個入口（戰利品、紙箱、過關三選一、罐頭鋪、事件）
 * 都有濾的那批測試，沒有被鎖的秘寶就守不到東西（拆掉濾網照樣全綠），一起拿掉了；
 * 哪天再鎖秘寶，從 git 歷史（2e326a6、9f0ea98）把它們找回來：這個檔的舊版，還有
 * `tests/engine/coop_event_relic_hero.test.ts`（混搭連線局的事件秘寶只看拿到的那一位，同樣沒東西可守、一起刪了）。
 */
describe('秘寶的職業鎖', () => {
  it('現在沒有任何秘寶對誰上鎖（紙袋、影披風都解開了）', () => {
    expect(relics.filter((r) => r.notFor?.length).map((r) => r.id)).toEqual([]);
  });

  it('菲菲抽得到紙袋與影披風', () => {
    const got = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const pool of ['大魔物', '塔主'] as const) {
        const id = rollRelic(new Rng(seedFromString(`r-${pool}-${i}`)), pool, [], ['feifei']);
        if (id) got.add(id);
      }
    }
    expect(got.has('paper_bag'), '紙袋').toBe(true);
    expect(got.has('shadow_cloak'), '影披風').toBe(true);
  });

  it('沒傳職業時當忍者（單機舊呼叫端不用改）', () => {
    const a = rollRelic(new Rng(seedFromString('same')), '塔主', []);
    const b = rollRelic(new Rng(seedFromString('same')), '塔主', [], ['ninja']);
    expect(a).toBe(b);
  });
});
