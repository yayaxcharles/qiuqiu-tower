import { describe, expect, it } from 'vitest';
import { relicById, relics } from '../../src/content/relics';
import { relicOk, rollRelic, rollRelicChoices, settleRelicPicks } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';

/**
 * 秘寶的職業鎖（`RelicDef.notFor`）。
 *
 * 2026-09-12 起紙袋與影披風鎖住菲菲（她沒有隱身牌，放大器對她期望值太低）。
 * **2026-09-14 深夜拿掉**：使用者把「後退閃躲」改成獲得隱身（跟師兄學來的招式），
 * 兩件放大器對她有用了（使用者：「這樣剛好她拿隱身秘寶也有用」）。
 *
 * **2026-09-23 內容擴充第一批又用上了**：蓄氣三件（磨劍石、劍穗結、養氣葫蘆）只給封封——別人身上沒有蓄氣，
 * 千斤墜腰帶只給噹噹——卸掉蜷縮出招的牌只有他有。這一次都是「對別人零效果」，不是比較弱。
 * 當初盯五個入口（戰利品、紙箱、過關三選一、罐頭鋪、事件）的那批測試從 git 歷史（2e326a6、9f0ea98）撿回來，
 * 照新的四件改寫；這一次常見池裡也有鎖（磨劍石），罐頭鋪常見那兩格終於測得到。
 */
const LOCKED = ['iron_weight_belt', 'qi_gourd', 'tassel_knot', 'whet_stone'];
/** 球球抽不到的那幾件（四件都是） */
const bannedFor = (hero: string): string[] => relics.filter((r) => r.notFor?.includes(hero as never)).map((r) => r.id);

describe('秘寶的職業鎖', () => {
  it('鎖的就是這四件，而且只留給用得到的那一位', () => {
    expect(relics.filter((r) => r.notFor?.length).map((r) => r.id).sort()).toEqual(LOCKED);
    for (const id of ['whet_stone', 'tassel_knot', 'qi_gourd']) expect([...relicById[id]!.notFor!].sort(), id).toEqual(['dangdang', 'feifei', 'ninja']);
    expect([...relicById['iron_weight_belt']!.notFor!].sort()).toEqual(['feifei', 'fengfeng', 'ninja']);
    // 偏某一位但別人也用得到的，一件都不鎖（判準見 `RelicDef.notFor`）
    for (const id of ['snake_fang', 'miasma_sachet', 'herb_cauldron', 'anvil', 'knee_guard', 'bamboo_tube', 'startle_bell', 'shadow_band']) {
      expect(relicById[id]!.notFor, `${id} 不該鎖`).toBeUndefined();
    }
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

  it('球球抽不到那四件；封封抽得到蓄氣三件、噹噹抽得到腰帶', () => {
    const drawn = (heroes: string[]): Set<string> => {
      const got = new Set<string>();
      for (let i = 0; i < 400; i++) {
        for (const pool of ['常見', '大魔物', '塔主'] as const) {
          const id = rollRelic(new Rng(seedFromString(`r-${pool}-${i}`)), pool, [], heroes);
          if (id) got.add(id);
        }
      }
      return got;
    };
    const his = drawn(['ninja']);
    for (const id of LOCKED) expect(his.has(id), `${id} 被球球抽到了`).toBe(false);
    const feng = drawn(['fengfeng']);
    for (const id of ['whet_stone', 'tassel_knot', 'qi_gourd']) expect(feng.has(id), `封封抽不到 ${id}`).toBe(true);
    expect(feng.has('iron_weight_belt'), '封封不該抽到腰帶').toBe(false);
    expect(drawn(['dangdang']).has('iron_weight_belt'), '噹噹抽不到腰帶').toBe(true);
  });

  it('連線時只要有一位用得到就留著（兩人一起挑的清單）', () => {
    const got = (heroes: string[]): Set<string> => {
      const s = new Set<string>();
      for (let i = 0; i < 400; i++) {
        for (const id of rollRelicChoices(new Rng(seedFromString(`c-${i}`)), '塔主', [[], []], 2, heroes)) s.add(id);
      }
      return s;
    };
    expect(got(['feifei', 'fengfeng']).has('qi_gourd'), '菲菲＋封封的局開不出養氣葫蘆').toBe(true);
    expect(got(['feifei', 'ninja']).has('qi_gourd'), '沒有封封的局不該開出養氣葫蘆').toBe(false);
    expect(relicOk(relicById['iron_weight_belt']!, ['fengfeng', 'dangdang'])).toBe(true);
    expect(relicOk(relicById['iron_weight_belt']!, ['fengfeng', 'feifei'])).toBe(false);
  });

  it('撞件擲骰輸的那一位，不會被塞一件鎖他的（2026-09-23）', () => {
    // 兩人都挑鐵砧；剩下的是封封的磨劍石。菲菲（0 號）輸了就空手，封封（1 號）輸了就拿磨劍石
    const offered = ['anvil', 'whet_stone'];
    const outcomes = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const got = settleRelicPicks(new Rng(seedFromString(`s-${i}`)), offered, ['anvil', 'anvil'], ['feifei', 'fengfeng']);
      outcomes.add(JSON.stringify(got));
      expect(got[0], '菲菲被塞了磨劍石').not.toBe('whet_stone');
    }
    expect(outcomes).toEqual(new Set([JSON.stringify(['anvil', 'whet_stone']), JSON.stringify([null, 'anvil'])]));
    // 不傳角色＝以前的規則（輸的人一定拿剩下那件）
    const old = settleRelicPicks(new Rng(seedFromString('s-old')), offered, ['anvil', 'anvil']);
    expect(old.filter((x) => x !== null)).toHaveLength(2);
  });

  it('沒傳職業時當忍者（單機舊呼叫端不用改）', () => {
    const a = rollRelic(new Rng(seedFromString('same')), '塔主', []);
    const b = rollRelic(new Rng(seedFromString('same')), '塔主', [], ['ninja']);
    expect(a).toBe(b);
  });
});

/**
 * 整局的每一條拿秘寶的路都要濾（從 2e326a6 撿回來改寫）。
 *
 * **直接測每個入口的函式**，不要靠「跑幾十局看會不會剛好撞到」——
 * 2026-09-12 第一版就是那樣寫的，把罐頭鋪的濾網拆掉之後測試照樣全綠，等於沒有守到。
 */
describe('每一條拿秘寶的路都要濾', () => {
  const banned = bannedFor('ninja');

  it('罐頭鋪的貨架（常見兩格有磨劍石、第二關起的珍品架有劍穗結）', async () => {
    const { newRun, makeShop } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 200; i++) {
      const run = newRun(`shop-${i}`, 1, 'ninja');
      run.act = 2;
      for (const it of makeShop(run).relics) if (banned.includes(it.id)) bad.push(`${i}: ${it.id}`);
    }
    expect(bad, `罐頭鋪賣了封封／噹噹專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  it('反方向：封封的罐頭鋪擺得出磨劍石（濾網沒有整個擋掉）', async () => {
    const { newRun, makeShop } = await import('../../src/engine/run');
    let seen = false;
    for (let i = 0; i < 200 && !seen; i++) seen = makeShop(newRun(`shopf-${i}`, 1, 'fengfeng')).relics.some((it) => it.id === 'whet_stone');
    expect(seen).toBe(true);
  });

  it('紙箱（常見池、再逼它退到大魔物池）', async () => {
    const { newRun, openChest } = await import('../../src/engine/run');
    const common = relics.filter((r) => r.pool === '常見' && !banned.includes(r.id)).map((r) => r.id);
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const fresh = newRun(`chest-a-${i}`, 1, 'ninja');
      const a = openChest(fresh);
      if (a && banned.includes(a)) bad.push(`常見 ${i}: ${a}`);
      const run = newRun(`chest-${i}`, 1, 'ninja');
      run.players[0]!.relics = [...run.players[0]!.relics, ...common];
      const id = openChest(run);
      if (id && banned.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(bad, `紙箱開出封封／噹噹專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  it('過關三選一', async () => {
    const { newRun, rollActRelics } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      for (const id of rollActRelics(newRun(`act-${i}`, 1, 'ninja'))) if (banned.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(bad, `過關三選一給了封封／噹噹專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  it('戰利品（打贏大魔物）', async () => {
    const { newRun, beginCombat, finishCombat } = await import('../../src/engine/run');
    const bad: string[] = [];
    let fought = 0;
    for (let i = 0; i < 160; i++) {
      const run = newRun(`rw-${i}`, 1, 'ninja');
      const node = run.map.nodes.find((n) => n.type === '大魔物');
      if (!node) continue;
      run.currentNode = node.id;
      const cs = beginCombat(run);
      for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
      cs.phase = 'won';
      const r = finishCombat(run, cs);
      fought++;
      for (const id of [r?.relic, ...(r?.relicOffers ?? [])]) if (id && banned.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(fought, '一場大魔物都沒打到，這條測試等於空轉').toBeGreaterThan(50);
    expect(bad, `戰利品給了封封／噹噹專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  /*
   * 反方向（原本那條的理由照舊）：`finishCombat` 傳 `heroes: heroesIn(run)`，拿掉它就變成只看座位 0。
   * 球球坐 0 號、封封坐 1 號時，劍穗結會被誤擋——封封永遠拿不到自己那件。
   */
  it('戰利品：混搭連線局裡，封封該拿得到的不可以被球球擋掉', async () => {
    const { newCoopRun, beginCombat, finishCombat } = await import('../../src/engine/run');
    let seen = false;
    for (let i = 0; i < 300 && !seen; i++) {
      const run = newCoopRun(`mix-loot-${i}`, 1, 'ninja', 'fengfeng');
      const node = run.map.nodes.find((n) => n.type === '大魔物');
      if (!node) continue;
      run.currentNode = node.id;
      const cs = beginCombat(run);
      for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
      cs.phase = 'won';
      const r = finishCombat(run, cs);
      if ([r?.relic, ...(r?.relicOffers ?? [])].includes('tassel_knot')) seen = true;
    }
    expect(seen, '三百局混搭都沒開出劍穗結——封封在場卻拿不到自己的秘寶').toBe(true);
  });

  it('事件發秘寶（單機）', async () => {
    const { newRun, applyRunEffects } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (const pool of ['常見', '大魔物', '塔主'] as const) {
      for (let i = 0; i < 80; i++) {
        const run = newRun(`ev-${pool}-${i}`, 1, 'ninja');
        applyRunEffects(run, [{ kind: 'relic', pool }]);
        for (const id of run.players[0]!.relics) if (banned.includes(id)) bad.push(`${pool}-${i}: ${id}`);
      }
    }
    expect(bad, `事件發了封封／噹噹專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  // 從 9f0ea98 撿回來：事件直接塞給的秘寶只看拿到的那一位，混搭時同伴是封封也不放行
  it('事件發秘寶（混搭連線：球球那一位不會因為同伴是封封就拿到蓄氣秘寶）', async () => {
    const { newCoopRun, applyRunEffects } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 300; i++) {
      const run = newCoopRun(`ev-mix-${i}`, 1, 'fengfeng', 'ninja');
      applyRunEffects(run, [{ kind: 'relic', pool: (['常見', '大魔物', '塔主'] as const)[i % 3]! }], [], [], 1);
      for (const id of run.players[1]!.relics) if (banned.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(bad, `球球那一位從事件拿到：${bad.join('、')}`).toEqual([]);
  });

  it('罐頭鋪換貨', async () => {
    const { newRun, makeShop, reshuffleShop } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 160; i++) {
      const run = newRun(`re-${i}`, 1, 'ninja');
      run.act = 3;
      run.players[0]!.fish = 9999;
      const shop = makeShop(run);
      shop.relics = shop.relics.map((r) => ({ ...r, sold: false }));
      reshuffleShop(run, shop);
      for (const it of shop.relics) if (banned.includes(it.id)) bad.push(`${i}: ${it.id}`);
    }
    expect(bad, `換貨換出封封／噹噹專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  it('連線的紙箱（兩位都是球球時誰都不該拿到）', async () => {
    const { newCoopRun, openChestCoop } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 160; i++) {
      const run = newCoopRun(`cc-${i}`, 1, 'ninja', 'ninja');
      for (const id of openChestCoop(run)) if (banned.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(bad, `連線紙箱開出封封／噹噹專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });
});
