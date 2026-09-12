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

/**
 * 整局跑一遍，確認**每一條拿秘寶的路**都濾過。
 *
 * 2026-09-12 實戰樣本抓到：我只補了「戰利品」與「紙箱」，**漏掉罐頭鋪**，
 * 她照樣在店裡買到紙袋。秘寶有五個入口（戰利品、紙箱、過關三選一、罐頭鋪、事件），
 * 逐個補很容易漏一個——所以這條測試直接跑整局看最後身上有什麼。
 */
describe('每一條拿秘寶的路都要濾', () => {
  /*
   * 秘寶有五個入口：戰利品、紙箱、過關三選一、**罐頭鋪**、事件。
   * 2026-09-12 我只補了前兩個，實戰樣本才抓到「她在店裡買到紙袋」。
   *
   * **直接測每個入口的函式**，不要靠「跑幾十局看會不會剛好撞到」——
   * 第一版就是那樣寫的，把罐頭鋪的濾網拆掉之後測試照樣全綠，等於沒有守到。
   */
  const banned = relics.filter((r) => r.hero && r.hero !== 'feifei').map((r) => r.id);

  it('罐頭鋪的貨架', async () => {
    const { newRun, makeShop } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const run = newRun(`shop-${i}`, 1, 'feifei');
      run.act = 2;                                    // 第二關起貨架會多一件大魔物池的
      for (const it of makeShop(run).relics) if (banned.includes(it.id)) bad.push(`${i}: ${it.id}`);
    }
    expect(bad, `罐頭鋪賣了球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  /*
   * 紙箱從「常見」池開始抽，而被鎖的兩件都在大魔物／塔主池——
   * 拿全新的局測 120 次也**永遠測不到**（第一版就是那樣寫的，拆掉濾網照樣全綠）。
   * 所以要先把常見池整池塞給她，逼紙箱退到下一池。
   */
  it('紙箱（先把常見池抽光，逼它退到大魔物池）', async () => {
    const { newRun, openChest } = await import('../../src/engine/run');
    const common = relics.filter((r) => r.pool === '常見').map((r) => r.id);
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const run = newRun(`chest-${i}`, 1, 'feifei');
      run.players[0]!.relics = [...run.players[0]!.relics, ...common];
      const id = openChest(run);
      if (id && banned.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(bad, `紙箱開出球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  it('過關三選一', async () => {
    const { newRun, rollActRelics } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      for (const id of rollActRelics(newRun(`act-${i}`, 1, 'feifei'))) {
        if (banned.includes(id)) bad.push(`${i}: ${id}`);
      }
    }
    expect(bad, `過關三選一給了球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });
});
