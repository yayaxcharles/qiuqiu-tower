import { describe, expect, it } from 'vitest';
import { difficultyMods } from '../../src/content/difficulty';
import { encountersOfPool } from '../../src/content/enemies';
import { eventById, events } from '../../src/content/events';
import { rareEvents } from '../../src/content/events-rare';
import { potionById } from '../../src/content/potions';
import { isMiasma, MIASMA_PURE, relicById, relicLongText, relics } from '../../src/content/relics';
import { relicCounter, relicSpent } from '../../src/engine/counters';
import { choiceGate } from '../../src/engine/eventcond';
import { generateMap, nextChoices } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import {
  addPotion, applyRunEffects, beginCombat, bossPoolForAct, canPurifyAtShop, chooseNode, finishCombat, makeShop, miasmaRelicsOf,
  newCoopRun, newRun, openChest, openChestCoop, placeRareEvent, PURIFY_PRICE, purifyAtShop, purifyRelic,
  RARE_EVENT_CHANCE, rest, restCardChoices, shopMulFor, stampDone, stampVisit, takeRelic, takeRestCard, buyRelic,
  type RunEffectOutcome,
} from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { checkRun } from '../../src/engine/save';
import type { CombatState, MapNode, RunEffect, RunState } from '../../src/engine/types';
import { runFingerprint } from '../../src/net/hash';
import { applyRunAction, canApplyRun } from '../../src/net/runaction';

/*
 * 內容擴充第三批 b3rare（2026-09-23，設計稿 design3 第五～七節）：稀有事件 5 篇、沾了魔氣的秘寶與淨化、新秘寶 9 件＋淨化版 6 件。
 * 每一條都照「改回壞寫法會紅」寫：拿掉 `map.ts` 的 `!e.rare`、`enterEvent` 的保護、`shared`、分支亂數、`herbBasket`……都會有一條紅。
 */

const RARE_IDS = rareEvents.map((e) => e.id);

/** 從 1F 走到這一格的最短路（走不到回 null） */
function pathTo(run: RunState, target: string): string[] | null {
  const prev = new Map<string, string | null>();
  const q: string[] = [];
  for (const id of run.map.start) { prev.set(id, null); q.push(id); }
  while (q.length) {
    const id = q.shift()!;
    if (id === target) {
      const out: string[] = [];
      for (let x: string | null = id; x; x = prev.get(x) ?? null) out.unshift(x);
      return out;
    }
    for (const nx of run.map.nodes.find((n) => n.id === id)!.next) if (!prev.has(nx)) { prev.set(nx, id); q.push(nx); }
  }
  return null;
}

/** 假裝這一場打贏了（把魔物清掉、判贏），照正式的 `finishCombat` 結算 */
function winFight(run: RunState, encounterId: string): ReturnType<typeof finishCombat> {
  const cs: CombatState = beginCombat(run, encounterId);
  for (const e of cs.enemies) { e.dead = true; e.hp = 0; }
  cs.kills = cs.enemies.length;
  cs.phase = 'won';
  return finishCombat(run, cs);
}

describe('稀有事件的放置（新L）', () => {
  it('五篇都標了 `rare`、關數照設計稿、選項順序跟結果圖對得上', () => {
    expect(RARE_IDS).toEqual(['rare_hot_spring', 'rare_fortune_sticks', 'rare_sleeping_hoard', 'rare_miasma_whisper', 'rare_catnip_master']);
    expect(rareEvents.map((e) => e.acts)).toEqual([[1, 2, 3], [1, 2, 3], [1, 2, 3], [2], [3]]);
    for (const e of rareEvents) {
      expect(eventById[e.id]).toBe(e);
      expect(e.rare!.weight).toBeGreaterThan(0);
      e.choices.forEach((c, i) => { if (c.resultArt) expect(c.resultArt).toBe(`${e.id}_r${i}`); });
    }
    expect(RARE_EVENT_CHANCE).toBe(0.25);   // 主控裁決 4
  });

  it('一般的地圖產生器一篇稀有事件都不排（拿掉 `map.ts` 的 `!e.rare` 就紅）', () => {
    for (let i = 0; i < 150; i++) for (const act of [1, 2, 3]) {
      const map = generateMap(new Rng(seedFromString(`rare-q-${i}`)), { act, flags: {}, hero: i % 2 ? 'feifei' : null });
      const bad = map.nodes.filter((n) => n.eventId && eventById[n.eventId]?.rare).map((n) => n.eventId);
      expect(bad, `rare-q-${i} 第 ${act} 關`).toEqual([]);
    }
  });

  it('開局那一關：約四分之一放一篇，放的是這一關的、不在 5F；整局亂數與其餘格子一格都不動（分支亂數）', () => {
    let placed = 0;
    const N = 800;
    for (let i = 0; i < N; i++) {
      const seed = `rare-p-${i}`;
      const run = newRun(seed, 1, 'ninja');
      // 同一顆種子、同一組參數照原樣生一張不放稀有事件的地圖：整局亂數要停在一樣的地方，事件格最多差一格
      const rng = new Rng(seedFromString(seed));
      const plain = generateMap(rng, { act: 1, bossIds: bossPoolForAct(1), eliteMul: difficultyMods(1).eliteMul, flags: {}, difficulty: 1, hero: 'ninja' });
      expect(run.rng, seed).toEqual(rng.state);
      const diff = run.map.nodes.filter((n, k) => n.eventId !== plain.nodes[k]!.eventId);
      expect(diff.length, seed).toBeLessThanOrEqual(1);
      const rare = run.map.nodes.filter((n) => n.eventId && eventById[n.eventId]?.rare);
      expect(rare.length).toBeLessThanOrEqual(1);
      if (!rare.length) continue;
      placed += 1;
      expect(diff[0]).toBe(rare[0]);
      expect(rare[0]!.floor).not.toBe(5);
      expect(rare[0]!.type).toBe('事件');
      expect(eventById[rare[0]!.eventId!]!.acts).toContain(1);
    }
    expect(placed / N).toBeGreaterThan(0.2);
    expect(placed / N).toBeLessThan(0.3);
  });

  it('同一顆種子放的一樣（兩台連線、重整重進都算出同一篇、同一格）', () => {
    for (let i = 0; i < 40; i++) {
      const a = newCoopRun(`rare-same-${i}`, 1, 'ninja', 'feifei');
      const b = newCoopRun(`rare-same-${i}`, 1, 'ninja', 'feifei');
      expect(a.map.nodes.map((n) => n.eventId)).toEqual(b.map.nodes.map((n) => n.eventId));
      expect(runFingerprint(a)).toBe(runFingerprint(b));
    }
  });

  it('遇過的不再放；身上 2 件以上沾了魔氣的人在場，紫霧不放；有人帶著魔氣秘寶時溫泉的權重加倍', () => {
    const count = (setup: (run: RunState) => void): Record<string, number> => {
      const out: Record<string, number> = {};
      for (let i = 0; i < 1200; i++) {
        const run = newRun(`rare-w-${i}`, 1, 'ninja');
        run.act = 2;
        run.map = generateMap(new Rng(seedFromString(`rare-w-map-${i}`)), { act: 2, flags: {}, hero: 'ninja' });
        setup(run);
        const id = placeRareEvent(run);
        if (id) out[id] = (out[id] ?? 0) + 1;
      }
      return out;
    };
    const plain = count(() => {});
    expect(Object.keys(plain).sort()).toEqual(['rare_fortune_sticks', 'rare_hot_spring', 'rare_miasma_whisper', 'rare_sleeping_hoard']);   // 第二關沒有大俠貓那篇
    const seen = count((run) => { for (const id of RARE_IDS) if (id !== 'rare_hot_spring') run.flags[`event:${id}`] = true; });
    expect(Object.keys(seen)).toEqual(['rare_hot_spring']);
    const twoMiasma = count((run) => { me(run).relics.push('miasma_charm', 'black_cat_mask'); });
    expect(twoMiasma['rare_miasma_whisper'] ?? 0).toBe(0);
    const oneMiasma = count((run) => { me(run).relics.push('miasma_charm'); });
    const share = (o: Record<string, number>): number => (o['rare_hot_spring'] ?? 0) / Object.values(o).reduce((s, n) => s + n, 0);
    // 權重 3／(3+3+3+2)≈27% → 6／(6+3+3+2)≈43%
    expect(share(plain)).toBeLessThan(0.34);
    expect(share(oneMiasma)).toBeGreaterThan(0.36);
  });

  it('稀有事件那一格受保護：走進去時不換成後集（拿掉 `enterEvent` 的保護就紅）', () => {
    let checked = 0;
    for (let i = 0; i < 40 && checked < 5; i++) {
      const run = newRun(`rare-guard-${i}`, 1, 'ninja');
      run.act = 2;
      run.map = generateMap(new Rng(seedFromString(`rare-guard-map-${i}`)), { act: 2, flags: {}, hero: 'ninja' });
      run.flags['sequel:toll_again_paid'] = true;
      // 最近的那一格事件（走到那裡之前不會經過別的事件格）：換成稀有事件
      const evs = run.map.nodes.filter((n) => n.type === '事件' && n.floor !== 5);
      const paths = evs.map((n) => pathTo(run, n.id)).filter((p): p is string[] => !!p)
        .filter((p) => p.slice(0, -1).every((id) => run.map.nodes.find((n) => n.id === id)!.type !== '事件'));
      const path = paths[0];
      if (!path) continue;
      const target = run.map.nodes.find((n) => n.id === path[path.length - 1])!;
      target.eventId = 'rare_hot_spring';
      for (const id of path) chooseNode(run, id);
      expect(target.eventId).toBe('rare_hot_spring');
      expect(run.flags['event:rare_hot_spring']).toBe(true);
      expect(run.flags['event:toll_again_paid'], '後集要留給下一個事件格').toBeUndefined();
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('沾了魔氣的秘寶與淨化（新K）', () => {
  it('六件沾了魔氣、各有淨化版（`淨化` 池）；塔主池四件代價型、貪吃錢袋、山賊的欠條不算', () => {
    expect(Object.keys(MIASMA_PURE).sort()).toEqual(['black_cat_mask', 'blood_dagger', 'master_bracer', 'miasma_charm', 'miasma_lantern', 'miasma_shard']);
    for (const [id, pure] of Object.entries(MIASMA_PURE)) {
      expect(relicById[id], id).toBeDefined();
      expect(relicById[pure]?.pool, pure).toBe('淨化');
      expect(relicLongText(relicById[id]!)).toContain('沾了魔氣：可以淨化');
      expect(relicLongText(relicById[pure]!)).not.toContain('沾了魔氣');
    }
    for (const id of ['sleepless_censer', 'greedy_pouch', 'renounce_beads', 'mad_sheath', 'glutton_purse', 'bandit_iou']) expect(isMiasma(id), id).toBe(false);
    expect(relics.filter((r) => r.pool === '淨化').map((r) => r.id).sort()).toEqual(Object.values(MIASMA_PURE).sort());
  });

  it('淨化版永遠抽不到：紙箱、事件的隨機秘寶、罐頭鋪都不會出現', () => {
    const pure = new Set(Object.values(MIASMA_PURE));
    for (let i = 0; i < 200; i++) {
      const run = newRun(`pure-roll-${i}`, 1, 'ninja');
      me(run).fish = 999;
      const got = [openChest(run), ...makeShop(run).relics.map((r) => r.id)];
      applyRunEffects(run, [{ kind: 'relic', pool: '大魔物' }, { kind: 'relic', pool: '塔主' }, { kind: 'relic', pool: '常見' }]);
      for (const id of [...got, ...me(run).relics]) expect(pure.has(id ?? ''), `pure-roll-${i}：${id}`).toBe(false);
    }
  });

  it('淨化是原地換代號：位置不變；血契短刀把拿到時扣的 12 點最大生命還回來（上限與當前一起加）', () => {
    const run = newRun('purify-1', 1, 'ninja');
    takeRelic(run, 'blood_dagger'); takeRelic(run, 'miasma_charm');
    const p = me(run);
    p.hp = 30;
    const max = p.maxHp;
    expect(miasmaRelicsOf(run)).toEqual(['blood_dagger', 'miasma_charm']);
    expect(purifyRelic(run, 'blood_dagger')).toBe(true);
    expect(p.relics).toEqual(['blue_headband', 'blood_dagger_pure', 'miasma_charm']);
    expect(p.maxHp).toBe(max + 12);
    expect(p.hp).toBe(42);
    expect(purifyRelic(run, 'blood_dagger'), '已經淨化過了').toBe(false);
    expect(purifyRelic(run, 'tuna_can'), '不是沾了魔氣的').toBe(false);
    // 魔氣殘片：兩件一樣是最大生命 +15，淨化不動血
    takeRelic(run, 'miasma_shard');
    const m2 = p.maxHp, h2 = p.hp;
    purifyRelic(run, 'miasma_shard');
    expect([p.maxHp, p.hp]).toEqual([m2, h2]);
  });

  it('事件的淨化：全部／一件（一件直接淨化、兩件以上要挑）／紫霧沒得淨化時改成移除一張', () => {
    const run = newRun('purify-2', 1, 'ninja');
    const notes: string[] = [];
    expect(applyRunEffects(run, [{ kind: 'purify', n: 1 }], notes)).toBeNull();
    expect(notes).toContain('身上沒有沾了魔氣的東西');
    expect(applyRunEffects(run, [{ kind: 'purify', n: 1, orRemove: true }])).toEqual({ needs: 'removeCard', n: 1 });
    takeRelic(run, 'miasma_charm');
    expect(applyRunEffects(run, [{ kind: 'purify', n: 1 }])).toBeNull();
    expect(me(run).relics).toContain('miasma_charm_pure');
    takeRelic(run, 'black_cat_mask'); takeRelic(run, 'miasma_lantern');
    const o = applyRunEffects(run, [{ kind: 'purify', n: 1 }]);
    expect(o).toEqual({ purify: ['black_cat_mask', 'miasma_lantern'] });
    expect(me(run).relics, '要等玩家挑，不先動').toContain('black_cat_mask');
    const n2: string[] = [];
    applyRunEffects(run, [{ kind: 'purify', n: 'all' }], n2);
    expect(miasmaRelicsOf(run)).toEqual([]);
    expect(n2.filter((s) => s.includes('淨化成'))).toHaveLength(2);
  });

  it('貓窩「點一炷清心香」：用掉這一格、只淨化身上有的那件', () => {
    const run = newRun('purify-rest', 1, 'ninja');
    expect(rest(run, '淨化', undefined, 0, 'miasma_charm'), '身上沒有').toBe(false);
    takeRelic(run, 'miasma_charm');
    expect(rest(run, '淨化', undefined, 0)).toBe(false);
    expect(rest(run, '淨化', undefined, 0, 'miasma_charm')).toBe(true);
    expect(me(run).relics).toContain('miasma_charm_pure');
    // 連線的動作也走同一條：沒有那件就不發號碼
    expect(canApplyRun({ run }, { t: 'rest', seat: 0, c: '淨化', r: 'blood_dagger' })).toBe(false);
    takeRelic(run, 'blood_dagger');
    expect(canApplyRun({ run }, { t: 'rest', seat: 0, c: '淨化', r: 'blood_dagger' })).toBe(true);
    expect(applyRunAction({ run }, { t: 'rest', seat: 0, c: '淨化', r: 'blood_dagger' })).toBe(true);
    expect(me(run).relics).toContain('blood_dagger_pure');
  });

  it('店主淨化（給店主輪替那條線的介面）：90 條、一間一次、付不起不做', () => {
    const run = newRun('purify-shop', 1, 'ninja');
    takeRelic(run, 'miasma_charm'); takeRelic(run, 'black_cat_mask');
    const shop = makeShop(run);
    me(run).fish = PURIFY_PRICE - 1;
    expect(canPurifyAtShop(run, shop, 'miasma_charm')).toBe(false);
    me(run).fish = 200;
    expect(purifyAtShop(run, shop, 'tuna_can'), '不是沾了魔氣的').toBe(false);
    expect(me(run).fish).toBe(200);
    expect(purifyAtShop(run, shop, 'miasma_charm')).toBe(true);
    expect(me(run).fish).toBe(110);
    expect(shop.purified).toBe(true);
    expect(purifyAtShop(run, shop, 'black_cat_mask'), '一間一次').toBe(false);
    const shops = [makeShop(run)];
    expect(canApplyRun({ run, shops }, { t: 'purify', seat: 0, id: 'black_cat_mask' })).toBe(true);
    expect(canApplyRun({ run }, { t: 'purify', seat: 0, id: 'black_cat_mask' }), '不在店裡').toBe(false);
    expect(applyRunAction({ run, shops }, { t: 'purify', seat: 0, id: 'black_cat_mask' })).toBe(true);
    expect(me(run).relics).toContain('black_cat_mask_pure');
  });

  it('倒了的神龕【魔氣】：身上有沾了魔氣的才出現，加在最後、不動既有選項', () => {
    const ev = eventById['broken_shrine']!;
    expect(ev.choices).toHaveLength(3);
    expect(ev.choices[2]!.requires).toEqual({ kind: 'miasmaRelic' });
    expect(ev.choices[2]!.resultArt).toBe('broken_shrine_r2');
    expect(ev.choices.slice(0, 2).map((c) => c.resultArt)).toEqual(['broken_shrine_r0', 'broken_shrine_r1']);
    const run = newCoopRun('shrine', 1, 'ninja', 'feifei');
    expect(choiceGate(run, ev.choices[2]!, 0).shown).toBe(false);
    takeRelic(run, 'miasma_shard', 1);
    const g = choiceGate(run, ev.choices[2]!, 0);
    expect(g).toEqual({ shown: true, by: 1, why: { kind: 'relic', id: 'miasma_shard' } });
  });

  it('紫霧①：隨機一件沾了魔氣、身上沒有的（淨化版也算有）；六件都有了改給 60 條', () => {
    for (let i = 0; i < 30; i++) {
      const run = newRun(`whisper-${i}`, 1, 'ninja');
      takeRelic(run, 'miasma_charm_pure'); takeRelic(run, 'blood_dagger');
      const gains: { kind: string; id: string }[] = [];
      applyRunEffects(run, [{ kind: 'relicMiasma', fallbackFish: 60 }], undefined, gains as never);
      const got = gains[0]!.id;
      expect(isMiasma(got)).toBe(true);
      expect(['miasma_charm', 'blood_dagger']).not.toContain(got);
    }
    const run = newRun('whisper-all', 1, 'ninja');
    for (const id of Object.keys(MIASMA_PURE)) takeRelic(run, id);
    const fish = me(run).fish;
    applyRunEffects(run, [{ kind: 'relicMiasma', fallbackFish: 60 }]);
    expect(me(run).fish).toBe(fish + 60);
  });

  it('酒葫蘆已經有了就改給隨機一件塔主秘寶（`fallbackPool`）', () => {
    const run = newRun('gourd', 1, 'ninja');
    takeRelic(run, 'master_gourd');
    const before = me(run).relics.length;
    const notes: string[] = [];
    applyRunEffects(run, [{ kind: 'relicId', id: 'master_gourd', fallbackFish: 60, fallbackPool: '塔主' }], notes);
    expect(me(run).relics.length).toBe(before + 1);
    expect(relicById[me(run).relics[me(run).relics.length - 1]!]!.pool).toBe('塔主');
    expect(notes[0]).toContain('已經有「塔主的酒葫蘆」了');
  });
});

describe('抽獎、大魔物池、泡壞忍具（新F／新M／新O）', () => {
  const sticks = eventById['rare_fortune_sticks']!;
  it('籤筒①照權重抽（10／25／35／20／10），提示那一行寫抽到哪一籤', () => {
    const tally: Record<string, number> = {};
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const run = newRun(`stick-${i}`, 1, 'ninja');
      const notes: string[] = [];
      applyRunEffects(run, sticks.choices[0]!.outcome, notes);
      const tier = notes.find((s) => s.startsWith('抽到：'))!;
      tally[tier] = (tally[tier] ?? 0) + 1;
    }
    const pct = (t: string): number => (tally[t] ?? 0) / N;
    expect(pct('抽到：上上籤！')).toBeCloseTo(0.10, 1);
    expect(pct('抽到：上籤！')).toBeCloseTo(0.25, 1);
    expect(pct('抽到：中籤')).toBeCloseTo(0.35, 1);
    expect(pct('抽到：下籤')).toBeCloseTo(0.20, 1);
    expect(pct('抽到：下下籤')).toBeCloseTo(0.10, 1);
    // 60 條那一條不會抽到下籤
    for (let i = 0; i < 300; i++) {
      const notes: string[] = [];
      applyRunEffects(newRun(`stick60-${i}`, 1, 'ninja'), sticks.choices[1]!.outcome, notes);
      expect(notes.some((s) => s.startsWith('抽到：下'))).toBe(false);
    }
  });

  it('大魔物醒沒醒兩個座位一樣（`shared`；拿掉就紅）；醒了打這一關大魔物池、兩台同一組，秘寶打贏才發', () => {
    const hoard = eventById['rare_sleeping_hoard']!;
    let woke = 0;
    for (let i = 0; i < 60; i++) {
      const run = newCoopRun(`hoard-${i}`, 1, 'ninja', 'dangdang');
      run.act = 2;
      run.currentNode = run.map.nodes.find((n) => n.floor === 3)!.id;
      const notes: string[][] = [[], []];
      const outs: RunEffectOutcome[] = [0, 1].map((s) => applyRunEffects(run, hoard.choices[1]!.outcome, notes[s], undefined, s));
      expect(notes[0]!.find((t) => t.startsWith('牠'))).toBe(notes[1]!.find((t) => t.startsWith('牠')));
      const f = outs.map((o) => (o && 'fight' in o ? o.fight : null));
      if (!f[0]) { expect(f[1]).toBeNull(); continue; }
      woke += 1;
      expect(f[1]!.encounterId).toBe(f[0].encounterId);
      expect(encountersOfPool('大魔物', 2).map((e) => e.id)).toContain(f[0].encounterId);
      expect(f[0].afterWin?.filter((e) => e.kind === 'relic')).toHaveLength(2);
    }
    expect(woke).toBeGreaterThan(10);
    expect(woke).toBeLessThan(40);
  });

  it('叫醒牠：打大魔物池一組，塔主＋大魔物秘寶打贏才發；打的是事件格，一般戰利品不多給大魔物秘寶', () => {
    const run = newRun('hoard-wake', 1, 'ninja');
    run.currentNode = run.map.nodes.find((n) => n.type === '事件')!.id;
    const o = applyRunEffects(run, eventById['rare_sleeping_hoard']!.choices[2]!.outcome);
    expect(o && 'fight' in o).toBe(true);
    if (!o || !('fight' in o)) return;
    expect(encountersOfPool('大魔物', 1).map((e) => e.id)).toContain(o.fight.encounterId);
    expect(o.fight.bonusFish).toBe(50);
    expect(o.fight.afterWin?.map((e) => (e.kind === 'relic' ? e.pool : e.kind))).toEqual(['塔主', '大魔物']);
    const r = winFight(run, o.fight.encounterId);
    expect(r?.kind).toBe('戰鬥');
    expect(r?.relic).toBeNull();
    // 連線：效果一位跑一次，兩位抽到的一定是同一組（不然兩台打不同的架）
    for (let i = 0; i < 30; i++) {
      const co = newCoopRun(`hoard-wake-coop-${i}`, 1, 'ninja', 'feifei');
      co.currentNode = co.map.nodes.find((n) => n.type === '事件')!.id;
      const ids = [0, 1].map((s) => { const x = applyRunEffects(co, eventById['rare_sleeping_hoard']!.choices[2]!.outcome, undefined, undefined, s); return x && 'fight' in x ? x.fight.encounterId : ''; });
      expect(ids[1], `hoard-wake-coop-${i}`).toBe(ids[0]);
    }
  });

  it('溫泉①：回滿、淨化全部、忍具全部失去', () => {
    const run = newRun('spring', 1, 'ninja');
    takeRelic(run, 'miasma_charm'); addPotion(run, 'onigiri'); addPotion(run, 'smoke_bomb');
    expect(me(run).potions, '前提：身上真的有兩支').toHaveLength(2);
    me(run).hp = 20;
    const notes: string[] = [];
    applyRunEffects(run, eventById['rare_hot_spring']!.choices[0]!.outcome, notes);
    expect(me(run).hp).toBe(me(run).maxHp);
    expect(me(run).potions).toEqual([]);
    expect(me(run).relics).toContain('miasma_charm_pure');
    expect(notes.some((s) => s.startsWith('忍具全部泡壞了'))).toBe(true);
  });
});

describe('新秘寶 9 件的掛鉤（新P）', () => {
  it('藥簍：單人每一場戰利品都有一支罕見以上的忍具（拿掉 `herbBasket` 就紅）', () => {
    for (let i = 0; i < 40; i++) {
      const run = newRun(`herb-${i}`, 1, 'ninja');
      takeRelic(run, 'herb_basket');
      run.currentNode = run.map.start[0]!;
      const r = winFight(run, 'rats3')!;
      expect(r.potion, `herb-${i}`).not.toBeNull();
      expect(potionById[r.potion!]!.rarity).not.toBe('常見');
    }
  });

  it('藥簍：兩個人時只有帶的那一位保證有（`potionPerSeat`），另一位照常擲', () => {
    let diff = 0;
    for (let i = 0; i < 30; i++) {
      const run = newCoopRun(`herb-coop-${i}`, 1, 'ninja', 'feifei');
      takeRelic(run, 'herb_basket', 1);
      run.currentNode = run.map.start[0]!;
      const r = winFight(run, 'rats3')!;
      const mine = r.potionPerSeat ? r.potionPerSeat[1] : r.potion;
      expect(mine && potionById[mine]!.rarity !== '常見', `herb-coop-${i}`).toBe(true);
      expect(run.players[1]!.potions).toContain(mine);
      if (r.potionPerSeat && r.potionPerSeat[0] !== r.potionPerSeat[1]) diff += 1;
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('夢枕：打盹之後三張牌（同一格算出同一份）、挑一次就好、不在那三張裡的不收', () => {
    const run = newRun('pillow', 1, 'ninja');
    run.currentNode = run.map.nodes.find((n) => n.floor === 9)!.id;
    expect(restCardChoices(run)).toEqual([]);
    takeRelic(run, 'dream_pillow');
    const a = restCardChoices(run);
    expect(a).toHaveLength(3);
    expect(restCardChoices(run).map((c) => c.id)).toEqual(a.map((c) => c.id));
    const deck = me(run).deck.length;
    expect(takeRestCard(run, 'no_such_card')).toBe(false);
    expect(takeRestCard(run, a[1]!.id)).toBe(true);
    expect(me(run).deck.length).toBe(deck + 1);
    expect(takeRestCard(run, a[0]!.id), '這一格挑過了').toBe(false);
    expect(applyRunAction({ run }, { t: 'restCard', seat: 0, id: '' }), '連線重送也擋').toBe(false);
  });

  // 「不會變伏擊」與探路杖的計數是問號格那條線讀掛鉤做的（主控 2026-09-23 對齊），這裡只守掛鉤名與回血
  it('平安繩：走進問號格回 5 點（寫一句提示）；掛鉤名照設計稿（問號格那條線讀的）', () => {
    expect(relicById['peace_cord']!.hooks).toEqual({ qmarkNoAmbush: true, qmarkHeal: 5 });
    expect(relicById['scout_staff']!.hooks).toEqual({ qmarkEvery: 3 });
    const run = newCoopRun('cord', 1, 'ninja', 'fengfeng');
    takeRelic(run, 'peace_cord', 1);
    const target = run.map.nodes.find((n) => n.type === '事件' && pathTo(run, n.id))!;
    const path = pathTo(run, target.id)!;
    for (const id of path.slice(0, -1)) chooseNode(run, id);
    run.players[1]!.hp = 30; run.players[0]!.hp = 30;
    const notes: string[] = [];
    chooseNode(run, target.id, notes, 1);
    expect(run.players[1]!.hp).toBe(35);
    expect(run.players[0]!.hp, '沒帶的不回').toBe(30);
    expect(notes).toEqual(['平安繩：回復了 5 點生命']);
  });

  it('箱中箱：接下來兩個紙箱各多一件（接在 `openChest` 裡，路邊紙箱也吃得到），用完變灰、第三個不給', () => {
    const run = newRun('boxbox', 1, 'ninja');
    takeRelic(run, 'box_in_box');
    expect(relicCounter('box_in_box', me(run))).toBe(2);
    for (const left of [1, 0]) {
      const n = me(run).relics.length;
      const extra: { seat: number; id: string }[] = [];
      openChest(run, 0, extra);
      expect(extra).toHaveLength(1);
      expect(me(run).relics.length).toBe(n + 2);
      expect(relicCounter('box_in_box', me(run))).toBe(left);
    }
    expect(relicSpent('box_in_box', me(run))).toBe(true);
    const n = me(run).relics.length;
    openChest(run);
    expect(me(run).relics.length, '用完了只拿箱子本來那一件').toBe(n + 1);
  });

  it('箱中箱（連線）：帶的那一位多一件、不跟攤出來的兩件撞；兩台算出一樣', () => {
    for (let i = 0; i < 20; i++) {
      const runs = [0, 1].map(() => { const r = newCoopRun(`boxbox-coop-${i}`, 1, 'ninja', 'feifei'); takeRelic(r, 'box_in_box', 1); return r; });
      const outs = runs.map((r) => { const b: { seat: number; id: string }[] = []; const offers = openChestCoop(r, b); return { offers, b }; });
      expect(outs[1]).toEqual(outs[0]);
      const { offers, b } = outs[0]!;
      expect(b.map((x) => x.seat)).toEqual([1]);
      expect(offers).not.toContain(b[0]!.id);
      expect(runs[0]!.players[1]!.relics).toContain(b[0]!.id);
    }
  });

  it('集章卡：三位不同店主各蓋一個章，集滿給一件塔主秘寶、之後九折；卡被拿走就沒有九折', () => {
    const run = newRun('stamp', 1, 'ninja');
    takeRelic(run, 'stamp_card');
    const base = shopMulFor(run);
    const notes: string[] = [];
    stampVisit(run, 0, 'orange', notes);
    stampVisit(run, 0, 'orange', notes);
    stampVisit(run, 0, 'tortoise', notes);
    expect(notes).toEqual(['集章卡蓋了第 1 個章', '集章卡蓋了第 2 個章']);
    expect(stampDone(run)).toBe(false);
    const n = me(run).relics.length;
    stampVisit(run, 0, 'junk', notes);
    expect(stampDone(run)).toBe(true);
    expect(me(run).relics.length).toBe(n + 1);
    expect(relicById[me(run).relics[n]!]!.pool).toBe('塔主');
    expect(shopMulFor(run)).toBeCloseTo(base * 0.9, 5);
    stampVisit(run, 0, 'curio');
    expect(me(run).relics.length, '集滿之後不再給').toBe(n + 1);
    me(run).relics = me(run).relics.filter((x) => x !== 'stamp_card');
    expect(shopMulFor(run)).toBeCloseTo(base, 5);
  });

  it('集章卡：在店裡買到它的那一間算第一個章；走進罐頭鋪（沒寫店主的舊地圖＝橘貓老闆）也蓋', () => {
    const run = newRun('stamp-buy', 1, 'ninja');
    const shopNode = run.map.nodes.find((n): n is MapNode => n.type === '罐頭鋪' && !!pathTo(run, n.id))!;
    for (const id of pathTo(run, shopNode.id)!) chooseNode(run, id);
    const shop = makeShop(run);
    shop.relics.push({ id: 'stamp_card', base: 150, price: 150, sold: false, limited: true });
    me(run).fish = 999;
    expect(buyRelic(run, shop, shop.relics.length - 1)).toBe(true);
    expect(me(run).counters?.['stamp_card']).toBe(1);
    // 店主輪替那條線的 `MapNode.keeper`：寫了誰就蓋誰
    (shopNode as MapNode & { keeper?: string }).keeper = 'curio';
    stampVisit(run, 0, (shopNode as MapNode & { keeper?: string }).keeper!);
    expect(me(run).counters?.['stamp_card']).toBe(1 | 4);
  });

  it('鎮魔符、魔氣燈籠、舊護腕：開戰那一拍照說明發動', () => {
    let frozen = 0;
    for (let i = 0; i < 20; i++) {
      const run = newRun(`seal-${i}`, 1, 'ninja');
      takeRelic(run, 'demon_seal');
      const cs = beginCombat(run, 'rats3');
      frozen += cs.enemies.filter((e) => (e.statuses['定身'] ?? 0) > 0).length;
    }
    expect(frozen).toBeGreaterThan(20);   // 三隻老鼠 × 20 場，七成機會
    const run = newRun('lantern', 1, 'ninja');
    takeRelic(run, 'miasma_lantern'); takeRelic(run, 'master_bracer');
    const cs = beginCombat(run, 'rats3');
    expect(cs.player.energy).toBe(4);
    expect(cs.player.hand.length).toBe(5 + 1 + 1);   // 藍頭巾第一回合 +1、燈籠每回合 +1
    expect(cs.player.statuses['懶洋洋']).toBe(2);
    expect(cs.player.statuses['爪力']).toBe(3);
    expect(cs.player.statuses['翻肚']).toBe(2);
  });
});

describe('存檔相容', () => {
  it('舊存檔（沒有淨化版、計數、稀有事件）讀得回來；新格式的淨化版與集章卡的章讀得回來', () => {
    const old = newRun('save-old', 1, 'ninja');
    const json = JSON.parse(JSON.stringify(old)) as RunState;
    for (const n of json.map.nodes) if (n.eventId && eventById[n.eventId]?.rare) n.eventId = 'toll';   // 改版前的地圖一篇稀有事件都沒有
    expect(checkRun(json)).not.toBeNull();
    const run = newRun('save-new', 1, 'ninja');
    takeRelic(run, 'blood_dagger_pure'); takeRelic(run, 'stamp_card'); takeRelic(run, 'box_in_box');
    stampVisit(run, 0, 'orange'); openChest(run);
    const back = checkRun(JSON.parse(JSON.stringify(run)) as RunState)!;
    expect(back).not.toBeNull();
    expect(me(back).relics).toContain('blood_dagger_pure');
    expect(me(back).counters).toEqual({ stamp_card: 1, box_in_box: 1 });
    expect(runFingerprint(back)).toBe(runFingerprint(run));
  });
});

describe('機器人會估新東西', () => {
  it('每一篇稀有事件的每個選項都估得出有限的分數（包括抽獎、淨化、大魔物池）', async () => {
    const { eventValue } = await import('../../src/engine/smartbot');
    const run = newRun('bot-rare', 1, 'ninja');
    takeRelic(run, 'miasma_charm');
    for (const e of [...rareEvents, eventById['broken_shrine']!]) for (const c of e.choices) {
      const v = eventValue(run, c.outcome as RunEffect[], c.costFish ?? 0);
      expect(Number.isFinite(v), `${e.id}：${c.label.slice(0, 12)}`).toBe(true);
    }
    // 叫醒大魔物比一般的「打一場」多扣 15（估值不看對手多強）
    const plain = eventValue(run, [{ kind: 'fight', encounterId: 'rats3', bonusFish: 50 }], 0);
    const elite = eventValue(run, [{ kind: 'fight', encounterId: '', pool: '大魔物', bonusFish: 50 }], 0);
    expect(plain - elite).toBe(15);
  });
});

describe('走完一整局遇得到稀有事件（sim 量完整一局的比例，這裡只守「遇得到、不會每局都遇」）', () => {
  it('機器人 200 局裡有幾局走進過稀有事件', async () => {
    const { smartRun, withSmartProbe } = await import('../../src/engine/smartbot');
    let met = 0;
    for (let i = 0; i < 200; i++) {
      let hit = false;
      withSmartProbe({ node(run, node) { if (node.type === '事件' && eventById[node.eventId ?? '']?.rare) hit = true; void run; } },
        () => smartRun(`rare-meet-${i}`, 1, 'ninja'));
      if (hit) met += 1;
    }
    expect(met).toBeGreaterThan(0);
    expect(met).toBeLessThan(120);
  });
});

void nextChoices; void events;
