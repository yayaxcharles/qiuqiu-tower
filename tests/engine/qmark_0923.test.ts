import { afterEach, describe, expect, it } from 'vitest';
import { eventById, events } from '../../src/content/events';
import { encounterById } from '../../src/content/enemies';
import { potionById } from '../../src/content/potions';
import { relicById } from '../../src/content/relics';
import { poolForFloor } from '../../src/engine/map';
import {
  AMBUSH_BONUS_FISH, AMBUSH_FLEE_DAMAGE, QMARK_WEIGHTS, ambushAllowed, ambushOutcomes, qmarkChance, qmarkProtected, rollQmark,
} from '../../src/engine/qmark';
import {
  MERCHANT_RATE, advanceAct, applyRunEffects, buyCard, buyPotion, buyRelic, chooseNode, makeMerchant, makeMerchants, newCoopRun, newRun,
  openRoadsideBox, openRoadsideBoxCoop, priceFor, reshuffleShop, runMods, shopClosed, takeRelic,
} from '../../src/engine/run';
import { checkRun } from '../../src/engine/save';
import { canApplyRun } from '../../src/net/runaction';
import { runFingerprint } from '../../src/net/hash';
import { coopRun } from '../../src/engine/coopbot';
import { playRun } from '../../src/engine/bot';
import { eventValue, shopAtMerchant, smartRun, withSmartProbe } from '../../src/engine/smartbot';
import type { EventDef, MapNode, RelicDef, RunState } from '../../src/engine/types';

/*
 * 問號格變化（2026-09-23 內容擴充第三批 新G～新I，設計稿 design3 第三節）的引擎規則。
 * 機率曲線、哪幾格不擲、三種結果、分支亂數（兩台一致、不位移整局亂數）、存檔相容、機器人會用。
 */

/** 一格假的事件格（直接餵 `rollQmark`，不用真的走到那裡） */
function cell(id: string, floor: number, eventId = events.find((e) => !e.fixedFloor && !e.requiresFlag && !e.hero)!.id): MapNode {
  return { id, floor, lane: 2, type: '事件', next: [], eventId };
}

const injected: string[] = [];
function fakeRelic(id: string, hooks: Record<string, unknown>): void {
  (relicById as Record<string, RelicDef>)[id] = { id, name: id, pool: '常見', text: '', art: '', price: 100, hooks: hooks as RelicDef['hooks'] };
  injected.push(`r:${id}`);
}
function fakeEvent(def: Partial<EventDef> & { id: string }): void {
  (eventById as Record<string, EventDef>)[def.id] = { title: def.id, text: '', choices: [], ...def } as EventDef;
  injected.push(`e:${def.id}`);
}
afterEach(() => {
  for (const k of injected.splice(0)) {
    if (k.startsWith('r:')) delete (relicById as Record<string, unknown>)[k.slice(2)];
    else delete (eventById as Record<string, unknown>)[k.slice(2)];
  }
});

describe('機率曲線（設計稿 3-1）', () => {
  it('起跳 5%、每遇到一次正常事件 +5%、最多 20%', () => {
    const run = newRun('qm-curve');
    const got = [0, 1, 2, 3, 4, 9].map((q) => { run.qmark = q; return Math.round(qmarkChance(run) * 100); });
    expect(got).toEqual([5, 10, 15, 20, 20, 20]);
    delete run.qmark;
    expect(qmarkChance(run), '舊存檔沒有這一欄＝0').toBeCloseTo(0.05);
  });

  it('沒變＝累積 +1、變了＝歸零；照累積擲出來的次數跟曲線對得上', () => {
    // 同一顆種子、每格照順序走：累積 0 時 5%、1 時 10%……（兩萬格，誤差 ±1 個百分點）
    let hits = 0, rolls = 0;
    const byQ = new Map<number, [number, number]>();
    const run = newRun('qm-seq');
    for (let i = 0; i < 2000; i++) {
      run.seed = `qm-seq-${i}`; delete run.qmark;   // 換種子字串＝另一局（擲法不看地圖）
      run.act = 2;   // 伏擊不受第一關 3F 的限制
      for (let k = 0; k < 10; k++) {
        const q = run.qmark ?? 0;
        const v = rollQmark(run, cell(`f${k + 2}-l${i % 5}`, 6 + (k % 7)));
        const [a, b] = byQ.get(Math.min(q, 3)) ?? [0, 0];
        byQ.set(Math.min(q, 3), [a + (v ? 1 : 0), b + 1]);
        rolls++; if (v) hits++;
        expect(run.qmark).toBe(v ? 0 : q + 1);
      }
    }
    const rate = (q: number): number => { const [a, b] = byQ.get(q)!; return a / b; };
    expect(rate(0)).toBeGreaterThan(0.035); expect(rate(0)).toBeLessThan(0.065);
    expect(rate(1)).toBeGreaterThan(0.08); expect(rate(1)).toBeLessThan(0.12);
    expect(rate(3)).toBeGreaterThan(0.17); expect(rate(3)).toBeLessThan(0.23);
    expect(hits / rolls).toBeGreaterThan(0.08);
  });

  it('變成哪一種照 40／35／25；第一關 3F 以前沒有伏擊，另外兩種照比例分', () => {
    const base = newRun('qm-mix');   // 擲法只看種子、關、格子、累積與身上的秘寶：換種子字串就是另一局，不必每次重生地圖
    const count = (act: number, floor: number): Record<string, number> => {
      const c: Record<string, number> = { 伏擊: 0, 行腳商: 0, 路邊紙箱: 0 };
      for (let i = 0; i < 30000; i++) {
        const run = base;
        run.seed = `qm-mix-${act}-${floor}-${i}`;
        run.act = act; run.qmark = 3;   // 20%
        const v = rollQmark(run, cell(`f${floor}-l1`, floor));
        if (v) c[v]!++;
      }
      return c;
    };
    const mid = count(2, 9);
    const total = mid['伏擊']! + mid['行腳商']! + mid['路邊紙箱']!;
    expect(QMARK_WEIGHTS).toEqual([['伏擊', 40], ['行腳商', 35], ['路邊紙箱', 25]]);
    expect(mid['伏擊']! / total).toBeGreaterThan(0.36); expect(mid['伏擊']! / total).toBeLessThan(0.44);
    expect(mid['路邊紙箱']! / total).toBeGreaterThan(0.21); expect(mid['路邊紙箱']! / total).toBeLessThan(0.29);
    const early = count(1, 3);
    expect(early['伏擊'], '第一關 3F 以前不出伏擊').toBe(0);
    const t2 = early['行腳商']! + early['路邊紙箱']!;
    expect(early['行腳商']! / t2).toBeGreaterThan(0.54); expect(early['行腳商']! / t2).toBeLessThan(0.63);   // 35／60
    expect(count(1, 4)['伏擊'], '4F 起就有').toBeGreaterThan(0);
  });
});

describe('不擲的格子（設計稿 3-1）', () => {
  it('5F 固定事件不擲、照樣算一次正常事件', () => {
    const run = newRun('qm-5f');
    const f5 = run.map.nodes.find((n) => n.floor === 5)!;
    run.qmark = 3;
    const parent = run.map.nodes.find((n) => n.next.includes(f5.id))!;
    run.currentNode = parent.id;
    chooseNode(run, f5.id);
    expect(f5.variant).toBeUndefined();
    expect(run.qmark).toBe(4);
  });

  it('後集、鏈（有 `requiresFlag`）、稀有事件（事件定義上的 `rare`）那幾格不會變，累積照樣 +1', () => {
    fakeEvent({ id: 'qm_rare_probe', rare: { weight: 3 } } as never);
    const sequel = events.find((e) => e.requiresFlag)!;
    expect(qmarkProtected(cell('x', 9, sequel.id))).toBe(true);
    expect(qmarkProtected(cell('x', 9, 'qm_rare_probe'))).toBe(true);
    expect(qmarkProtected(cell('x', 9))).toBe(false);
    for (let i = 0; i < 400; i++) {
      const run = newRun(`qm-prot-${i}`);
      run.act = 2; run.qmark = 3;
      for (const id of [sequel.id, 'qm_rare_probe']) {
        const n = cell(`f9-l${i % 5}`, 9, id);
        const q = run.qmark;
        expect(rollQmark(run, n)).toBeNull();
        expect(n.variant).toBeUndefined();
        expect(run.qmark).toBe(q + 1);
      }
    }
  });

  it('這一格被換成待出的後集時不擲（後集不能被吃掉）', () => {
    // 找一顆種子：第二關第一個事件格在累積 3（20%）時會變——換成後集之後就不准變
    const sequel = events.find((e) => e.requiresFlag && !e.hero && !e.soloOnly && !e.coopOnly && !e.soloHeroSwap && (!e.acts || e.acts.includes(2)))!;
    let checked = 0;
    for (let i = 0; i < 600 && checked < 5; i++) {
      const run = newRun(`qm-seq-swap-${i}`);
      run.flags[sequel.requiresFlag!] = true;
      advanceAct(run);
      const first = run.map.nodes.find((n) => n.type === '事件' && n.floor === 2 && !eventById[n.eventId!]?.requiresFlag);
      if (!first) continue;
      run.currentNode = run.map.nodes.find((n) => n.next.includes(first.id))!.id;
      // 同一格不換後集時會不會變（拿一份複本、把待出的後集拿掉再擲）
      const probe = structuredClone(run) as RunState;
      for (const k of Object.keys(probe.flags)) if (k.startsWith('sequel:')) delete probe.flags[k];
      probe.qmark = 3;
      if (!rollQmark(probe, probe.map.nodes.find((n) => n.id === first.id)!)) continue;
      run.qmark = 3;
      chooseNode(run, first.id);
      expect(eventById[first.eventId!]?.requiresFlag, `種子 ${i}：那一格要換成後集`).toBeTruthy();
      expect(first.variant, `種子 ${i}：換成後集的那一格被變掉了`).toBeUndefined();
      expect(run.flags[`event:${first.eventId}`]).toBe(true);
      expect(run.qmark).toBe(4);
      checked++;
    }
    expect(checked, '至少要真的驗到幾格').toBeGreaterThan(0);
  });

  it('換成的後集本身沒有 `requiresFlag` 時也不擲（球球的「屋頂上的影子」是換關時改標的後集）', () => {
    // 影子鏈第二集單人球球換成他自己那一篇（`soloHeroSwap`），那一篇是普通的專屬事件、沒有 requiresFlag，
    // 只靠「這一格剛換成待出的後集」那一條擋著
    const swapTo = events.find((e) => e.soloHeroSwap?.ninja)!.soloHeroSwap!.ninja!;
    expect(eventById[swapTo]!.requiresFlag).toBeUndefined();
    const flag = events.find((e) => e.soloHeroSwap?.ninja)!.requiresFlag!;
    let checked = 0;
    for (let i = 0; i < 800 && checked < 5; i++) {
      const run = newRun(`qm-roof-${i}`, 1, 'ninja');
      run.flags[flag] = true;
      advanceAct(run);
      if (!run.flags[`sequel:${swapTo}`]) continue;
      const first = run.map.nodes.find((n) => n.type === '事件' && n.floor === 2 && !eventById[n.eventId!]?.requiresFlag && n.eventId !== swapTo);
      if (!first) continue;
      run.currentNode = run.map.nodes.find((n) => n.next.includes(first.id))!.id;
      const probe = structuredClone(run) as RunState;
      for (const k of Object.keys(probe.flags)) if (k.startsWith('sequel:')) delete probe.flags[k];
      probe.qmark = 3;
      if (!rollQmark(probe, probe.map.nodes.find((n) => n.id === first.id)!)) continue;
      run.qmark = 3;
      chooseNode(run, first.id);
      expect(first.eventId).toBe(swapTo);
      expect(first.variant, `種子 ${i}：換成「屋頂上的影子」的那一格被變掉了`).toBeUndefined();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('變了的那一格原本那篇沒被看到，不記「遇過」；沒變的照記', () => {
    let varied = 0, plain = 0;
    for (let i = 0; i < 400; i++) {
      const run = newRun(`qm-flag-${i}`);
      run.act = 2; run.qmark = 3;
      const start = run.map.nodes.find((n) => n.floor === 1)!;
      run.currentNode = start.id;
      const ev = run.map.nodes.find((n) => n.type === '事件' && n.floor === 2 && start.next.includes(n.id));
      if (!ev) continue;
      const id = ev.eventId!;
      chooseNode(run, ev.id);
      if (ev.variant) { varied++; expect(run.flags[`event:${id}`]).toBeUndefined(); }
      else { plain++; expect(run.flags[`event:${id}`]).toBe(true); }
    }
    expect(varied).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(0);
  });
});

describe('分支亂數：兩台一致、不動整局亂數', () => {
  it('同一顆種子、同一格、同一個累積 → 同一個結果；`run.rng` 一個位元都不動', () => {
    for (let i = 0; i < 300; i++) {
      const a = newRun(`qm-det-${i}`); const b = newRun(`qm-det-${i}`);
      a.act = b.act = 2; a.qmark = b.qmark = 2;
      const rngBefore = JSON.stringify(a.rng);
      const na = cell('f9-l2', 9); const nb = cell('f9-l2', 9);
      expect(rollQmark(a, na)).toBe(rollQmark(b, nb));
      expect(na.encounterId).toBe(nb.encounterId);
      expect(JSON.stringify(a.rng)).toBe(rngBefore);
    }
  });

  it('連線兩台各自走同一條路，變化、伏擊那一組、整局指紋都一樣；指紋收了累積與變化', () => {
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      const a = newCoopRun(`qm-coop-${i}`, 1, 'ninja', 'feifei');
      const b = newCoopRun(`qm-coop-${i}`, 1, 'ninja', 'feifei');
      for (const r of [a, b]) r.qmark = 3;
      for (let f = 0; f < 12; f++) {
        const ids = a.currentNode ? a.map.nodes.find((x) => x.id === a.currentNode)!.next : a.map.start;
        const opts = a.map.nodes.filter((n) => ids.includes(n.id));
        const next = opts.find((n) => n.type === '事件') ?? opts[0]!;   // 有問號格就走問號格
        chooseNode(a, next.id); chooseNode(b, next.id);
        expect(runFingerprint(a)).toBe(runFingerprint(b));
        if (next.variant) seen++;
      }
      expect(a.map.nodes.map((n) => `${n.variant ?? ''}${n.encounterId ?? ''}`)).toEqual(b.map.nodes.map((n) => `${n.variant ?? ''}${n.encounterId ?? ''}`));
    }
    expect(seen).toBeGreaterThan(0);
    // 指紋真的收了：只改累積或只改一格的變化，指紋就變
    const run = newRun('qm-fp');
    const base = runFingerprint(run);
    run.qmark = 2;
    expect(runFingerprint(run)).not.toBe(base);
    const q = runFingerprint(run);
    run.map.nodes.find((n) => n.type === '事件' && n.floor !== 5)!.variant = '路邊紙箱';
    expect(runFingerprint(run)).not.toBe(q);
  });

  it('沒走進任何事件格的局，整局亂數與地圖跟以前一模一樣（不位移既有種子）', () => {
    const run = newRun('qm-nomove');
    expect(run.qmark).toBeUndefined();
    expect(run.map.nodes.some((n) => n.variant)).toBe(false);
  });
});

describe('伏擊（設計稿 3-2）', () => {
  it('打這一層的一般戰鬥池（不會是大魔物）；①迎戰多 20 條、②甩掉牠們最多 6 點、扣不死人', () => {
    for (let i = 0; i < 400; i++) {
      const run = newRun(`qm-amb-${i}`);
      run.act = 1 + (i % 3); run.qmark = 3;
      const n = cell(`f${4 + (i % 9)}-l${i % 5}`, 4 + (i % 9));
      if (rollQmark(run, n) !== '伏擊') continue;
      const enc = encounterById[n.encounterId!]!;
      expect(enc.pool).toBe(poolForFloor(n.floor, run.act));
      expect(n.modifier).toBeUndefined();
    }
    const run = newRun('qm-amb-fx');
    const n = cell('f9-l2', 9); n.variant = '伏擊';
    rollQmark(run, n);   // 除錯指定的格子只補那一組
    expect(n.encounterId).toBeTruthy();
    const [fight, flee] = ambushOutcomes(n);
    expect(fight).toEqual([{ kind: 'fight', encounterId: n.encounterId, bonusFish: AMBUSH_BONUS_FISH }]);
    expect(flee).toEqual([{ kind: 'damage', n: AMBUSH_FLEE_DAMAGE }]);
    expect([AMBUSH_BONUS_FISH, AMBUSH_FLEE_DAMAGE]).toEqual([20, 6]);
    run.players[0]!.hp = 3;
    applyRunEffects(run, flee);
    expect(run.players[0]!.hp, '跑掉扣血扣不死人').toBe(1);
  });

  it('平安繩（`qmarkNoAmbush`，看任一位）整局不出伏擊', () => {
    fakeRelic('qm_test_cord', { qmarkNoAmbush: true });
    let others = 0;
    const run = newCoopRun('qm-cord');
    takeRelic(run, 'qm_test_cord', 1);   // 帶的是同伴
    for (let i = 0; i < 3000; i++) {
      run.seed = `qm-cord-${i}`;
      run.act = 2; run.qmark = 3;
      const n = cell('f9-l2', 9);
      expect(ambushAllowed(run, n)).toBe(false);
      const v = rollQmark(run, n);
      expect(v).not.toBe('伏擊');
      if (v) others++;
    }
    expect(others).toBeGreaterThan(0);
  });

  it('機器人：血少於五成會跑、血多會打（兩條路照 `eventValue` 比）', () => {
    const run = newRun('qm-amb-bot');
    const n = cell('f9-l2', 9); n.variant = '伏擊'; rollQmark(run, n);
    const [fight, flee] = ambushOutcomes(n);
    const p = run.players[0]!;
    p.hp = Math.floor(p.maxHp * 0.9);
    expect(eventValue(run, fight, 0)).toBeGreaterThan(eventValue(run, flee, 0));
    p.hp = Math.floor(p.maxHp * 0.3);
    expect(eventValue(run, flee, 0)).toBeGreaterThan(eventValue(run, fight, 0));
  });
});

describe('探路杖（`qmarkEvery`）', () => {
  // 2026-09-24 b3int 量尺調整：到點那一格改成一定是路邊紙箱（原本行腳商或路邊紙箱各一半），真的探路杖改成每 2 格
  it('每走進 n 個會擲的問號格，第 n 個一定是路邊紙箱；各算各的，到了的那位歸零', () => {
    fakeRelic('qm_test_staff', { qmarkEvery: 3 });
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const run = newCoopRun(`qm-staff-${i}`);
      takeRelic(run, 'qm_test_staff', 0);
      run.act = 2;
      const got: (string | null)[] = [];
      for (let k = 0; k < 3; k++) { run.qmark = 0; got.push(rollQmark(run, cell(`f${6 + k}-l1`, 6 + k))); }
      expect(got[2]).toBe('路邊紙箱');
      kinds.add(got[2]!);
      expect(run.players[0]!.counters?.['qm_test_staff']).toBe(0);
      expect(run.players[1]!.counters?.['qm_test_staff']).toBeUndefined();
    }
    expect([...kinds]).toEqual(['路邊紙箱']);
    expect(relicById['scout_staff']!.hooks.qmarkEvery).toBe(2);
  });
});

describe('行腳商（設計稿 3-2）', () => {
  it('貨架：牌 1 罕見＋1 稀有（這一位的職業）、秘寶 1、忍具 2 支罕見以上；每人一份', () => {
    for (let i = 0; i < 60; i++) {
      const run = newCoopRun(`qm-mer-${i}`, 1, 'ninja', 'fengfeng');
      const shops = makeMerchants(run);
      expect(shops).toHaveLength(2);
      shops.forEach((s, seat) => {
        expect(s.merchant).toBe(true);
        expect(s.cards.map((c) => c.def.rarity)).toEqual(['罕見', '稀有']);
        for (const c of s.cards) expect(!c.def.hero || c.def.hero === (seat === 0 ? 'ninja' : 'fengfeng')).toBe(true);
        expect(s.relics).toHaveLength(1);
        expect(['常見', '大魔物']).toContain(relicById[s.relics[0]!.id]!.pool);
        expect(s.potions).toHaveLength(2);
        for (const x of s.potions) expect(potionById[x.id]!.rarity).not.toBe('常見');
        expect(s.entryFee).toBeUndefined();
      });
    }
  });

  it('價錢＝定價 × 0.7 × 難度倍率，不吃零錢罐、貪吃錢袋、銅臭錢袋、帳本、批發箱，也不收欠條（主控裁決第 5 條）', () => {
    const run = newRun('qm-price', 4);
    for (const id of ['coin_jar', 'glutton_purse', 'greedy_pouch', 'shop_ledger', 'bulk_crate', 'bandit_iou']) takeRelic(run, id);
    const fish = run.players[0]!.fish = 999;
    const shop = makeMerchant(run);
    expect(run.players[0]!.fish, '欠條不收').toBe(fish);
    for (const it of [...shop.cards, ...shop.relics, ...shop.potions]) {
      expect(priceFor(run, it, 0, shop)).toBe(Math.round(it.base * MERCHANT_RATE * runMods(run).shopMul));
      expect(it.price).toBe(priceFor(run, it, 0, shop));
    }
    expect(runMods(run).shopMul).toBeGreaterThan(1);   // 難度 4 起貴一成，確實乘進去了
  });

  it('只做一筆生意：買了一樣，其他格子全部收攤（引擎與連線的放行判斷都擋）；沒有重整、沒有放生', () => {
    const run = newRun('qm-once');
    run.players[0]!.fish = 999;
    const shop = makeMerchant(run);
    expect(shopClosed(shop)).toBe(false);
    expect(reshuffleShop(run, shop)).toBe(false);
    const ctx = { run, shops: [shop] };
    expect(canApplyRun(ctx, { t: 'shuffle', seat: 0 })).toBe(false);
    expect(canApplyRun(ctx, { t: 'scrub', seat: 0, u: run.players[0]!.deck[0]!.uid })).toBe(false);
    expect(canApplyRun(ctx, { t: 'buy', seat: 0, k: 'card', i: 0 })).toBe(true);
    expect(buyCard(run, shop, 0)).toBe(true);
    expect(shopClosed(shop)).toBe(true);
    expect(buyCard(run, shop, 1)).toBe(false);
    expect(buyRelic(run, shop, 0)).toBe(false);
    expect(buyPotion(run, shop, 0)).toBe(false);
    for (const k of ['card', 'relic', 'potion'] as const) expect(canApplyRun(ctx, { t: 'buy', seat: 0, k, i: k === 'card' ? 1 : 0 })).toBe(false);
  });

  it('機器人：秘寶分數夠就買秘寶、不然好牌、不然忍具少於 2 支買便宜的；錢不夠就走', () => {
    const run = newRun('qm-mer-bot');
    run.players[0]!.fish = 0;
    const poor = makeMerchant(run);
    shopAtMerchant(run, poor);
    expect(poor.anyBought).toBeFalsy();
    run.players[0]!.fish = 999;
    run.players[0]!.potions = [];
    const rich = makeMerchant(run);
    shopAtMerchant(run, rich);
    expect(rich.anyBought, '身上沒忍具、錢夠：至少買到一樣').toBe(true);
    expect([...rich.cards, ...rich.relics, ...rich.potions].filter((x) => x.sold)).toHaveLength(1);
  });
});

describe('路邊紙箱（設計稿 3-2）', () => {
  it('一定給一件秘寶；常見池 75%、大魔物池 25%；抽不到往上退一池', () => {
    const pools: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const run = newRun(`qm-box-${i}`);
      const id = openRoadsideBox(run);
      expect(id).toBeTruthy();
      const pool = relicById[id!]!.pool;
      pools[pool] = (pools[pool] ?? 0) + 1;
    }
    expect(pools['常見']! / 2000).toBeGreaterThan(0.71);
    expect(pools['常見']! / 2000).toBeLessThan(0.79);
    expect(pools['大魔物']! / 2000).toBeGreaterThan(0.21);
    // 常見池全拿光：照樣有一件（退到大魔物以上）
    const run = newRun('qm-box-full');
    for (const r of Object.values(relicById)) if (r.pool === '常見') takeRelic(run, r.id);
    const id = openRoadsideBox(run);
    expect(id && relicById[id]!.pool).not.toBe('常見');
  });

  it('連線開兩件各挑一件', () => {
    const run = newCoopRun('qm-box-coop');
    const offers = openRoadsideBoxCoop(run);
    expect(offers).toHaveLength(2);
    expect(new Set(offers).size).toBe(2);
  });
});

describe('存檔相容', () => {
  it('舊存檔（沒有累積、格子沒有變化）照樣讀得進來、從 5% 算起', () => {
    const run = newRun('qm-old-save');
    const raw = JSON.parse(JSON.stringify(run)) as RunState;
    delete raw.qmark;
    for (const n of raw.map.nodes) delete n.variant;
    const back = checkRun(raw)!;
    expect(back).not.toBeNull();
    expect(back.qmark).toBeUndefined();
    expect(qmarkChance(back)).toBeCloseTo(0.05);
  });

  it('新欄位存了讀得回來；壞掉的只丟那一欄、不整份判壞檔', () => {
    const run = newRun('qm-new-save');
    run.qmark = 2;
    const evs = run.map.nodes.filter((n) => n.type === '事件' && n.floor !== 5);
    evs[0]!.variant = '行腳商';
    evs[1]!.variant = '伏擊'; evs[1]!.encounterId = Object.values(encounterById).find((e) => e.pool === '中')!.id;
    const ok = checkRun(JSON.parse(JSON.stringify(run)))!;
    expect(ok.qmark).toBe(2);
    expect(ok.map.nodes.find((n) => n.id === evs[0]!.id)!.variant).toBe('行腳商');
    expect(ok.map.nodes.find((n) => n.id === evs[1]!.id)!.variant).toBe('伏擊');
    const bad = JSON.parse(JSON.stringify(run)) as RunState;
    (bad as { qmark: unknown }).qmark = -1;
    (bad.map.nodes.find((n) => n.id === evs[0]!.id) as { variant: unknown }).variant = 'bogus';
    delete bad.map.nodes.find((n) => n.id === evs[1]!.id)!.encounterId;
    const fixed = checkRun(bad)!;
    expect(fixed).not.toBeNull();
    expect(fixed.qmark).toBeUndefined();
    expect(fixed.map.nodes.find((n) => n.id === evs[0]!.id)!.variant).toBeUndefined();
    expect(fixed.map.nodes.find((n) => n.id === evs[1]!.id)!.variant, '伏擊沒有遭遇＝當原本的事件').toBeUndefined();
  });
});

describe('三支機器人都走得過', () => {
  it('聰明機器人、雙人機器人、亂打的機器人：遇得到三種、不丟例外', () => {
    const seen = new Set<string>();
    withSmartProbe({ node: (_run, n) => { if (n.variant) seen.add(n.variant); } }, () => {
      for (let i = 0; i < 80; i++) smartRun(`qm-smart-${i}`, 1, (['ninja', 'feifei', 'dangdang', 'fengfeng'] as const)[i % 4]);
    });
    expect([...seen].sort()).toEqual(['伏擊', '行腳商', '路邊紙箱'].sort());
    for (let i = 0; i < 12; i++) coopRun(`qm-coopbot-${i}`, 1, i % 2 ? ['ninja', 'feifei'] : ['dangdang', 'fengfeng']);
    for (let i = 0; i < 40; i++) playRun(`qm-rand-${i}`);
  }, 120_000);
});
