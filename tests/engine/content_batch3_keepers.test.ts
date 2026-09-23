import { beforeEach, describe, expect, it } from 'vitest';
import { cardById, cardNameFor } from '../../src/content/cards';
import { GUEST_KEEPERS, KEEPERS } from '../../src/content/keepers';
import { potionById } from '../../src/content/potions';
import { relicById, relics } from '../../src/content/relics';
import { heroOf } from '../../src/engine/hero';
import {
  addCard, advanceAct, assignKeepers, buyRelic, buyRemove, buySwap, canSwap, keeperOf, makeShop, makeShops,
  newCoopRun, newRun, priceFor, removePrice, reshuffleShop, shopService, swapCandidates, type ShopStock,
} from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { checkRun, loadRun, saveRun, setStore } from '../../src/engine/save';
import { keeperDetour, keeperServices, smartRun } from '../../src/engine/smartbot';
import type { KeeperId, RunState } from '../../src/engine/types';
import { runFingerprint } from '../../src/net/hash';
import { applyRunAction, canApplyRun } from '../../src/net/runaction';

/*
 * 罐頭鋪店主輪替（2026-09-23 內容擴充第三批 新J，design3 第四節；店長私藏照主控裁決第 1 條）。
 * 算例表（design3 4-3）逐例核對放在「價錢怎麼疊」那一段。
 */

/** 讓這一局「站在」一間指定店主顧的店上（除錯用的手法：隨便挑一格、寫上店主、把現在的格子設成它） */
function standIn(run: RunState, keeper: KeeperId | undefined): void {
  const node = run.map.nodes.find((n) => n.type === '罐頭鋪') ?? run.map.nodes[0]!;
  if (keeper && keeper !== 'orange') node.keeper = keeper; else delete node.keeper;
  run.currentNode = node.id;
}
function shopOf(keeper: KeeperId, seed: string, act = 1, hero: 'ninja' | 'feifei' | 'dangdang' | 'fengfeng' = 'ninja'): { run: RunState; shop: ShopStock } {
  const run = newRun(seed, 1, hero);
  run.act = act;
  standIn(run, keeper);
  return { run, shop: makeShop(run) };
}
const rarity = (id: string): string | undefined => potionById[id]?.rarity;

describe('誰顧店：地圖生成時用分支亂數擲好', () => {
  it('只有罐頭鋪會有店主、只寫客座；一關裡同一位客座最多一間', () => {
    for (let i = 0; i < 300; i++) {
      const run = newRun(`kp-${i}`);
      const guests = run.map.nodes.filter((n) => n.keeper);
      expect(guests.every((n) => n.type === '罐頭鋪' && GUEST_KEEPERS.includes(n.keeper!))).toBe(true);
      expect(new Set(guests.map((n) => n.keeper)).size).toBe(guests.length);
    }
  });

  it('機率：每一間先擲，橘貓老闆一半、三位客座各六分之一（去重之前）；去重之後客座一間都不會重複', () => {
    const tally: Record<string, number> = { orange: 0, tortoise: 0, curio: 0, junk: 0 };
    let shops = 0;
    for (let i = 0; i < 2000; i++) {
      const run = newRun(`kprob-${i}`);
      // 去重前的原始擲法：每一間換一顆假的地圖只放它自己（同一位不會撞），看擲出來的分布
      for (const n of run.map.nodes.filter((x) => x.type === '罐頭鋪')) {
        const solo = { ...run, map: { nodes: [{ ...n }], start: [n.id] } } as RunState;
        assignKeepers(solo);
        tally[keeperOf(solo.map.nodes[0])]! += 1;
        shops += 1;
      }
    }
    expect(tally.orange! / shops).toBeGreaterThan(0.47);
    expect(tally.orange! / shops).toBeLessThan(0.53);
    for (const k of GUEST_KEEPERS) {
      expect(tally[k]! / shops, k).toBeGreaterThan(0.145);
      expect(tally[k]! / shops, k).toBeLessThan(0.19);
    }
  });

  it('不推整局亂數：擲店主前後 `run.rng` 一模一樣，重擲一次結果也一樣（重新整理重進算得出同一張臉）', () => {
    const run = newRun('kp-rng');
    const before = { ...run.rng };
    const keepers = run.map.nodes.map((n) => n.keeper ?? '');
    assignKeepers(run);
    expect(run.rng).toEqual(before);
    expect(run.map.nodes.map((n) => n.keeper ?? '')).toEqual(keepers);
  });

  it('連線兩台同一顆種子＝同一張地圖、同一批店主（單機同種子也一樣：地圖就是同一張）', () => {
    for (let i = 0; i < 50; i++) {
      const a = newCoopRun(`kp-coop-${i}`, 1, 'ninja', 'feifei');
      const b = newCoopRun(`kp-coop-${i}`, 1, 'ninja', 'feifei');
      const solo = newRun(`kp-coop-${i}`, 1, 'ninja', 2);
      const ks = (r: RunState): string => r.map.nodes.map((n) => n.keeper ?? '-').join(',');
      expect(ks(a)).toBe(ks(b));
      expect(ks(a)).toBe(ks(solo));
    }
  });

  it('過關換地圖也擲（第二、三關各自一批，種子帶關數）', () => {
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      const run = newRun(`kp-act-${i}`);
      advanceAct(run);
      expect(run.act).toBe(2);
      seen += run.map.nodes.filter((n) => n.keeper).length;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('貨架照店主排（design3 4-2）', () => {
  it('橘貓老闆：跟沒有店主欄位時一模一樣（貨架與整局亂數的走向一步都沒變）', () => {
    for (let i = 0; i < 40; i++) {
      for (const act of [1, 2, 3]) {
        const a = newRun(`orange-${i}`); a.act = act;
        const b = newRun(`orange-${i}`); b.act = act; standIn(b, 'orange');
        expect(JSON.stringify(makeShop(b))).toBe(JSON.stringify(makeShop(a)));
        expect(b.rng).toEqual(a.rng);
      }
    }
  });

  it('玳瑁婆婆：牌 3、常見秘寶 1、不擺私藏、忍具 6 格（至少 1 支稀有、2 支罕見）', () => {
    for (let i = 0; i < 120; i++) {
      const { shop } = shopOf('tortoise', `tt-${i}`, 1 + (i % 3));
      expect(shop.keeper).toBe('tortoise');
      expect(shop.cards).toHaveLength(3);
      expect(shop.relics).toHaveLength(1);
      expect(relicById[shop.relics[0]!.id]?.pool).toBe('常見');
      expect(shop.relics.some((r) => r.limited)).toBe(false);
      expect(shop.potions).toHaveLength(6);
      expect(shop.potions.filter((p) => rarity(p.id) === '稀有').length).toBeGreaterThanOrEqual(1);
      expect(shop.potions.filter((p) => rarity(p.id) === '罕見').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('玳瑁婆婆：重整貨架照樣保證稀有與罕見', () => {
    for (let i = 0; i < 60; i++) {
      const { run, shop } = shopOf('tortoise', `tt-rs-${i}`);
      me(run).fish = 500;
      expect(reshuffleShop(run, shop)).toBe(true);
      expect(shop.potions).toHaveLength(6);
      expect(shop.potions.filter((p) => rarity(p.id) === '稀有').length).toBeGreaterThanOrEqual(1);
      expect(shop.potions.filter((p) => rarity(p.id) === '罕見').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('長毛掌櫃：牌 3、常見 2＋大魔物 1（第一關就有；第二關起 2）＋店長私藏一定有、忍具 1', () => {
    for (let i = 0; i < 80; i++) {
      for (const act of [1, 2]) {
        const { shop } = shopOf('curio', `cu-${i}`, act);
        expect(shop.cards).toHaveLength(3);
        expect(shop.potions).toHaveLength(1);
        const pools = shop.relics.map((r) => relicById[r.id]?.pool);
        expect(pools).toEqual(['常見', '常見', ...(act >= 2 ? ['大魔物', '大魔物'] : ['大魔物']), '罐頭鋪']);
        expect(shop.relics.at(-1)!.limited).toBe(true);
      }
    }
  });

  it('長毛掌櫃：限定池這一位都拿過了，私藏那一格改一件大魔物（不空著）', () => {
    const run = newRun('cu-dry');
    for (const r of relics.filter((x) => x.pool === '罐頭鋪')) me(run).relics.push(r.id);
    standIn(run, 'curio');
    const shop = makeShop(run);
    expect(shop.relics.map((r) => relicById[r.id]?.pool)).toEqual(['常見', '常見', '大魔物', '大魔物']);
    expect(shop.relics.some((r) => r.limited)).toBe(false);
  });

  it('阿福：牌 5／6 格其中一定有一張升級版、常見秘寶 1、不擺私藏、忍具 2', () => {
    for (let i = 0; i < 80; i++) {
      for (const act of [1, 2]) {
        const { shop } = shopOf('junk', `jk-${i}`, act);
        expect(shop.cards).toHaveLength(act >= 2 ? 6 : 5);
        expect(shop.cards.filter((c) => c.upgraded)).toHaveLength(1);
        expect(shop.relics).toHaveLength(1);
        expect(shop.relics.some((r) => r.limited)).toBe(false);
        expect(shop.potions).toHaveLength(2);
      }
    }
  });

  it('橘貓老闆的店長私藏照舊一半（主控裁決第 1 條：只有他還是擲五成）', () => {
    let got = 0;
    const n = 400;
    for (let i = 0; i < n; i++) if (shopOf('orange', `or-lim-${i}`).shop.relics.some((r) => r.limited)) got += 1;
    expect(got / n).toBeGreaterThan(0.42);
    expect(got / n).toBeLessThan(0.58);
  });

  it('連線：兩位走進同一間，兩份貨架都是這位店主的規矩（各抽各的）', () => {
    const run = newCoopRun('kp-coop-shop', 1, 'ninja', 'dangdang');
    standIn(run, 'tortoise');
    const shops = makeShops(run);
    expect(shops.map((s) => s.keeper)).toEqual(['tortoise', 'tortoise']);
    expect(shops.map((s) => s.potions.length)).toEqual([6, 6]);
  });
});

describe('價錢怎麼疊（design3 4-3 算例表，逐例核對）', () => {
  /** 一間只擺一件的店：直接拿引擎的 `priceFor` 算這一格 */
  function priced(keeper: KeeperId, kind: 'relics' | 'potions', base: number, relicsOnMe: string[], sale?: number): number {
    const run = newRun('price-table');
    me(run).relics.splice(0, me(run).relics.length, ...relicsOnMe);
    const it = { id: kind === 'relics' ? 'lucky_coin' : 'onigiri', base, price: 0, sold: false, ...(sale ? { sale } : {}) };
    const shop: ShopStock = { cards: [], relics: kind === 'relics' ? [it] : [], potions: kind === 'potions' ? [it] : [], ...(keeper !== 'orange' ? { keeper } : {}) };
    return priceFor(run, it, 0, shop);
  }
  it.each([
    { label: '婆婆那裡一支 45 條的忍具', keeper: 'tortoise', kind: 'potions', base: 45, mine: [], sale: undefined, want: 34 },
    { label: '同上，帶零錢罐', keeper: 'tortoise', kind: 'potions', base: 45, mine: ['coin_jar'], sale: undefined, want: 27 },
    { label: '同上，再帶批發箱', keeper: 'tortoise', kind: 'potions', base: 45, mine: ['coin_jar', 'bulk_crate'], sale: undefined, want: 14 },
    { label: '同上，那一格剛好七折特價', keeper: 'tortoise', kind: 'potions', base: 45, mine: ['coin_jar', 'bulk_crate'], sale: 0.7, want: 9 },
    { label: '掌櫃那裡一件 200 條的大魔物秘寶', keeper: 'curio', kind: 'relics', base: 200, mine: [], sale: undefined, want: 220 },
    { label: '同上，帶銅臭錢袋', keeper: 'curio', kind: 'relics', base: 200, mine: ['greedy_pouch'], sale: undefined, want: 330 },
    { label: '同上，是這間第一件（帶帳本）', keeper: 'curio', kind: 'relics', base: 200, mine: ['greedy_pouch', 'shop_ledger'], sale: undefined, want: 165 },
  ] as const)('$label → $want', ({ keeper, kind, base, mine, sale, want }) => {
    expect(priced(keeper, kind, base, [...mine], sale)).toBe(want);
  });

  it('店主倍率只乘那一類：婆婆的秘寶與牌不打折、掌櫃的忍具與牌不加價、阿福的貨全部照定價', () => {
    expect(priced('tortoise', 'relics', 200, [])).toBe(200);
    expect(priced('curio', 'potions', 45, [])).toBe(45);
    expect(priced('junk', 'relics', 200, [])).toBe(200);
    expect(priced('junk', 'potions', 45, [])).toBe(45);
  });

  it('最低 5 條：全部折扣疊上去也不會低於 5', () => {
    expect(priced('tortoise', 'potions', 20, ['coin_jar', 'bulk_crate', 'shop_ledger'], 0.3)).toBe(5);
  });

  it('阿福那裡放生，現在放生價 100 → 50（之後漲成 125）', () => {
    const { run, shop } = shopOf('junk', 'jk-rm');
    me(run).removeCost = 100;
    me(run).fish = 500;
    expect(removePrice(run, 0, shop)).toBe(50);
    expect(removePrice(run, 0)).toBe(100);   // 沒給店＝橘貓老闆的價錢
    expect(buyRemove(run, me(run).deck[0]!.uid, 0, shop)).toBe(true);
    expect(me(run).fish).toBe(450);
    expect(me(run).removeCost).toBe(125);
  });

  it('阿福那裡放生，現在 125 → 62.5 進位到 65；帶會員卡時用卡上的 40 → 20，之後不漲', () => {
    const { run, shop } = shopOf('junk', 'jk-rm2');
    me(run).removeCost = 125;
    expect(removePrice(run, 0, shop)).toBe(65);
    me(run).relics.push('member_card');
    me(run).fish = 500;
    expect(removePrice(run, 0, shop)).toBe(20);
    expect(buyRemove(run, me(run).deck[0]!.uid, 0, shop)).toBe(true);
    expect(me(run).fish).toBe(480);
    expect(me(run).removeCost).toBe(125);
  });

  it('實際開出來的店：婆婆的忍具標價都比定價便宜、掌櫃的秘寶都貴一成（沒帶改價秘寶、沒特價的那幾格）', () => {
    for (let i = 0; i < 40; i++) {
      const t = shopOf('tortoise', `tp-${i}`).shop;
      for (const p of t.potions) if (!p.sale) expect(p.price).toBe(Math.max(5, Math.round(p.base * 0.75)));
      const c = shopOf('curio', `cp-${i}`).shop;
      for (const r of c.relics) if (!r.sale) expect(r.price).toBe(Math.round(r.base * 1.1));
    }
  });

  it('買下去扣的錢＝標價（婆婆的忍具、掌櫃的秘寶）', () => {
    const { run, shop } = shopOf('curio', 'cp-buy');
    me(run).fish = 2000;
    const it = shop.relics[0]!;
    const want = priceFor(run, it, 0, shop);
    expect(buyRelic(run, shop, 0)).toBe(true);
    expect(me(run).fish).toBe(2000 - want);
  });
});

describe('阿福的「舊招換新招」', () => {
  it('40 條、原地換成同職業罕見以上的牌（不同名、不帶升級），一間一次；換的抽法不推整局亂數', () => {
    for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const) {
      const { run, shop } = shopOf('junk', `sw-${hero}`, 1, hero);
      me(run).fish = 200;
      const c = me(run).deck[0]!;
      c.upgraded = true;
      const oldId = c.cardId;
      const rng = { ...run.rng };
      const got = buySwap(run, shop, c.uid);
      expect(got).not.toBeNull();
      const now = me(run).deck[0]!;
      expect(now.uid).toBe(c.uid);
      expect(now.cardId).toBe(got);
      expect(now.upgraded).toBe(false);
      const def = cardById[got!]!;
      expect(['罕見', '稀有']).toContain(def.rarity);
      expect(def.pool).toBe('忍術');
      expect(!def.hero || def.hero === heroOf(me(run))).toBe(true);
      expect(cardNameFor(def, hero)).not.toBe(cardNameFor(cardById[oldId]!, hero));
      expect(me(run).fish).toBe(160);
      expect(run.rng).toEqual(rng);
      expect(shop.serviced).toBe(true);
      expect(buySwap(run, shop, me(run).deck[1]!.uid)).toBeNull();   // 一間一次
      expect(me(run).fish).toBe(160);
    }
  });

  it('同一顆種子、同一格、同一個座位換出同一張（兩台算得一樣）', () => {
    const a = shopOf('junk', 'sw-det');
    const b = shopOf('junk', 'sw-det');
    me(a.run).fish = 100; me(b.run).fish = 100;
    expect(buySwap(a.run, a.shop, me(a.run).deck[2]!.uid)).toBe(buySwap(b.run, b.shop, me(b.run).deck[2]!.uid));
  });

  it('壞毛病換成常見；錢不夠、別家店都換不了', () => {
    const { run, shop } = shopOf('junk', 'sw-curse');
    const curse = addCard(run, Object.values(cardById).find((c) => c.pool === '壞毛病')!.id);
    expect(swapCandidates(run, curse.cardId).every((c) => c.rarity === '常見')).toBe(true);
    me(run).fish = 39;
    expect(canSwap(run, shop, curse.uid)).toBe(false);
    me(run).fish = 40;
    expect(canSwap(run, shop, curse.uid)).toBe(true);
    const other = shopOf('tortoise', 'sw-other');
    me(other.run).fish = 999;
    expect(canSwap(other.run, other.shop, me(other.run).deck[0]!.uid)).toBe(false);
  });

  it('連線：換招走 `act()`，判準跟引擎同一支（做不到不發號碼）', () => {
    const { run, shop } = shopOf('junk', 'sw-net');
    const ctx = { run, shops: [shop] };
    const u = me(run).deck[0]!.uid;
    me(run).fish = 10;
    expect(canApplyRun(ctx, { t: 'buy', seat: 0, k: 'swap', u })).toBe(false);
    me(run).fish = 100;
    expect(canApplyRun(ctx, { t: 'buy', seat: 0, k: 'swap', u })).toBe(true);
    expect(applyRunAction(ctx, { t: 'buy', seat: 0, k: 'swap', u })).toBe(true);
    expect(canApplyRun(ctx, { t: 'buy', seat: 0, k: 'swap', u })).toBe(false);
    // 放生帶貨架：阿福的半價，連線放行也照這個數（70 → 35；照橘貓老闆的 70 算的話 35 條會被擋下）
    me(run).fish = 35;
    me(run).removeCost = 70;
    expect(canApplyRun(ctx, { t: 'scrub', seat: 0, u })).toBe(true);
    expect(applyRunAction(ctx, { t: 'scrub', seat: 0, u })).toBe(true);
    expect(me(run).fish).toBe(0);
  });
});

describe('存檔與連線指紋', () => {
  function memStore() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  }
  beforeEach(() => { setStore(memStore()); });

  it('舊存檔（節點沒有 keeper 那一欄）讀得回來，全部是橘貓老闆，走進去的店跟以前一樣', () => {
    const run = newRun('old-save');
    for (const n of run.map.nodes) delete n.keeper;
    const raw = JSON.parse(JSON.stringify(run)) as RunState;
    const back = checkRun(raw)!;
    expect(back).not.toBeNull();
    expect(back.map.nodes.every((n) => keeperOf(n) === 'orange')).toBe(true);
  });

  it('認不得的店主只丟那一格、當橘貓老闆；認得的留著', () => {
    const run = newRun('bad-keeper');
    const shops = run.map.nodes.filter((n) => n.type === '罐頭鋪');
    (shops[0] as { keeper?: string }).keeper = 'samurai_cat';
    if (shops[1]) shops[1].keeper = 'curio';
    saveRun(run);
    const back = loadRun()!;
    expect(back).not.toBeNull();
    expect(back.map.nodes.find((n) => n.id === shops[0]!.id)!.keeper).toBeUndefined();
    if (shops[1]) expect(back.map.nodes.find((n) => n.id === shops[1]!.id)!.keeper).toBe('curio');
  });

  it('整局指紋收店主：兩台記的不一樣（換一位、或一台有一台沒有）就對不上', () => {
    const a = newRun('fp-keeper');
    const shop = a.map.nodes.find((n) => n.type === '罐頭鋪')!;
    const b = JSON.parse(JSON.stringify(a)) as RunState;
    const bs = b.map.nodes.find((n) => n.id === shop.id)!;
    bs.keeper = bs.keeper === 'junk' ? 'curio' : 'junk';
    expect(runFingerprint(b)).not.toBe(runFingerprint(a));
    const c = JSON.parse(JSON.stringify(b)) as RunState;
    for (const n of c.map.nodes) delete n.keeper;
    expect(runFingerprint(c)).not.toBe(runFingerprint(b));
  });
});

describe('機器人會為了店主繞路、會用服務', () => {
  it('繞路加分：阿福（廢牌兩張以上）＋15、掌櫃（錢 150 以上）＋15、婆婆（忍具不到兩支）＋10、橘貓老闆 0', () => {
    const run = newRun('detour');
    const node = run.map.nodes.find((n) => n.type === '罐頭鋪')!;
    const at = (k: KeeperId | undefined): number => { if (k) node.keeper = k; else delete node.keeper; return keeperDetour(run, node); };
    me(run).potions = [];
    me(run).fish = 200;
    expect(at(undefined)).toBe(0);
    expect(at('curio')).toBe(15);
    expect(at('tortoise')).toBe(10);
    const curse = Object.values(cardById).find((c) => c.pool === '壞毛病')!.id;
    addCard(run, curse); addCard(run, curse);
    expect(at('junk')).toBe(15);
    me(run).fish = 100;
    expect(at('curio')).toBe(0);
  });

  it('阿福那間：機器人先半價放生最爛的、再把下一張爛牌換掉', () => {
    const { run, shop } = shopOf('junk', 'bot-junk');
    const curse = Object.values(cardById).find((c) => c.pool === '壞毛病')!.id;
    addCard(run, curse); addCard(run, curse);
    me(run).fish = 200;
    const n = me(run).deck.length;
    keeperServices(run, shop);
    expect(me(run).deck.length).toBe(n - 1);
    expect(me(run).deck.filter((c) => c.cardId === curse)).toHaveLength(0);
    expect(shop.serviced).toBe(true);
  });

  it('聰明機器人整局跑得完（客座店主的店走得進去、買得下去）', () => {
    let guests = 0;
    for (let i = 0; i < 12; i++) {
      const s = smartRun(`bot-keepers-${i}`, 1, (['ninja', 'feifei', 'dangdang', 'fengfeng'] as const)[i % 4]);
      expect(s.floor).toBeGreaterThan(0);
      guests += 1;
    }
    expect(guests).toBe(12);
  });
});

it('KEEPERS 表：橘貓老闆那一列就是改版前寫死的數字；三位客座的招牌、服務照設計稿', () => {
  expect(KEEPERS.orange).toMatchObject({ cards: [5, 6], common: 2, big: [0, 1], limited: 'chance', potions: 3, removeMul: 1, mul: { card: 1, relic: 1, potion: 1 } });
  expect(KEEPERS.orange.service).toBeUndefined();
  expect(KEEPERS.tortoise.mul.potion).toBe(0.75);
  // 婆婆的淨化：服務的定義在這裡（地圖說明、鈕的字），淨化本身是淨化那條線的 `purifyAtShop`，合併後接（報告附程式碼）
  expect(KEEPERS.tortoise.service).toMatchObject({ kind: 'purify', cost: 90 });
  expect(shopService({ cards: [], relics: [], potions: [], keeper: 'tortoise' })?.kind).toBe('purify');
  expect(shopService({ cards: [], relics: [], potions: [] })).toBeUndefined();
  expect(KEEPERS.curio.mul.relic).toBe(1.1);
  expect(KEEPERS.junk.removeMul).toBe(0.5);
  expect(KEEPERS.junk.service).toMatchObject({ kind: 'swap', cost: 40 });
});
