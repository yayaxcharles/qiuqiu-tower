import { describe, expect, it } from 'vitest';
import { relics } from '../../src/content/relics';
import { rollRelic, rollRelicChoices } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';

/**
 * 職業獨占的秘寶（2026-09-12）。
 *
 * 只用在「這件對別的職業是**完全的廢物**」那幾件——不是「比較弱」，是零效果。
 * 紙袋與影披風都是「獲得隱身時多幾層」的放大器，而取得隱身的 11 張牌整套是忍者獨占的，
 * 菲菲身上一張都沒有；影披風還是塔主三選一，抽到等於少一個選項。
 *
 * **只給隱身的那幾件不算**（鈴鐺、無聲鈴、風鈴）：那些自己就會生隱身，
 * 而且她沒有別的閃避手段，對她反而珍貴。
 */
describe('職業獨占的秘寶', () => {
  const locked = relics.filter((r) => r.hero);

  it('只鎖「放大器」，不鎖會自己生隱身的那幾件', () => {
    expect(locked.map((r) => r.id).sort()).toEqual(['paper_bag', 'shadow_cloak']);
    for (const id of ['bell', 'silent_bell', 'wind_chime']) {
      const r = relics.find((x) => x.id === id);
      if (r) expect(r.hero, `${r.name} 不該被鎖`).toBeUndefined();
    }
  });

  it('菲菲抽不到那兩件，球球抽得到', () => {
    const drawn = (heroes: string[]) => {
      const got = new Set<string>();
      for (let i = 0; i < 400; i++) {
        for (const pool of ['大魔物', '塔主'] as const) {
          const id = rollRelic(new Rng(seedFromString(`r-${pool}-${i}`)), pool, [], heroes);
          if (id) got.add(id);
        }
      }
      return got;
    };
    const hers = drawn(['feifei']);
    for (const r of locked) expect(hers.has(r.id), `${r.name} 被菲菲抽到了`).toBe(false);
    const his = drawn(['ninja']);
    expect(locked.some((r) => his.has(r.id)), '球球一件都沒抽到，測試本身可能失效了').toBe(true);
  });

  it('連線時只要有一位用得到就留著', () => {
    // 影披風對球球有用、對菲菲沒用；兩個人一起玩時球球拿得到，所以照樣該出現
    const got = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const id of rollRelicChoices(new Rng(seedFromString(`c-${i}`)), '塔主', [[], []], 2, ['feifei', 'ninja'])) {
        got.add(id);
      }
    }
    expect(got.has('shadow_cloak'), '兩個人的局也抽不到影披風').toBe(true);
  });

  it('沒傳職業時當忍者（單機舊呼叫端不用改）', () => {
    const a = rollRelic(new Rng(seedFromString('same')), '塔主', []);
    const b = rollRelic(new Rng(seedFromString('same')), '塔主', [], ['ninja']);
    expect(a).toBe(b);
  });
});
