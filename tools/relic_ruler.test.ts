/**
 * 秘寶量尺＋忍具使用率（2026-09-23 內容擴充第〇批 0-3）。算法在 `tools/relic_ruler.ts`。
 *
 * 平常 `npx vitest run` 只跑小樣本（工具跑得起來、格式對、機器人真的讀到新分數），幾秒鐘。
 * 要重量時設環境變數：
 *
 *   RULER=relics  npx vitest run tools/relic_ruler.test.ts
 *     → 四隻各 600 局 × 77 件，約十分鐘。寫 `src/engine/relic-ratings.json`（機器人讀）與 `docs/秘寶量尺.md`（人讀）
 *   RULER=relics RULER_ONLY=snake_fang,anvil  npx vitest run tools/relic_ruler.test.ts
 *     → 只量這幾件（新秘寶進池子時用），其餘格子沿用舊檔
 *   RULER=relics RULER_HEROES=fengfeng  npx vitest run tools/relic_ruler.test.ts
 *     → 只重量這一隻（改了他的牌之後）
 *   RULER=rescore npx vitest run tools/relic_ruler.test.ts
 *     → 不重量，只照檔裡的層差重算分數與事件分（改了 `scoreOf` 這類換算方法時用），幾秒鐘
 *   RULER=potions npx vitest run tools/relic_ruler.test.ts
 *     → 四隻各 600 局的忍具使用率，寫 `docs/忍具使用率.md`；原始數字另存 `tools/out/potion_usage.json`
 *     加 `RULER_BEFORE=tools/out/potion_usage_before.json` 會多一欄「改之前」
 *
 * 其他：`RULER_N`（局數，預設 600）、`RULER_SEED`（種子前綴，預設 ruler）、`RULER_DIFF`（難度，預設 1）。
 * **改了秘寶數值、機器人的出牌或挑選規則、角色的牌，量尺就過期了**，要重跑。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bestRelic, eventValue, relicEventValue, relicRating, setRelicRatings, smartBless, smartRun, withSmartProbe } from '../src/engine/smartbot';
import RATING_JSON from '../src/engine/relic-ratings.json';
import BLESS_JSON from '../src/engine/bless-ratings.json';
import { BLESSINGS } from '../src/content/blessings';
import { blessingAvailable } from '../src/engine/blessing';
import { relicById, relics } from '../src/content/relics';
import { HEROES, type Hero } from '../src/engine/hero';
import { newRun, takeRelic } from '../src/engine/run';
import { me } from '../src/engine/runplayer';
import type { RunEffect } from '../src/engine/types';
import {
  AFTER_EVENT, FISH_EVENT_POINTS, moneyEv, moneyFish, RULER_DEFAULTS, blessClassSpread, blessRatingFile, measureBlessings, measureCell, measurePotions, measureRelics, mergeRatingFile, modeFor, obtainable,
  renderBlessReport, renderPotionReport, renderRelicReport, runBatch, scoreOf, serializeRatingFile, type PotionReport, type RelicRatingFile,
} from './relic_ruler';
import { eventById } from '../src/content/events';

const env = process.env;
const MODE = env['RULER'] ?? '';
const N = Number(env['RULER_N'] ?? RULER_DEFAULTS.n);
const SEED = env['RULER_SEED'] ?? RULER_DEFAULTS.seed;
const DIFF = Number(env['RULER_DIFF'] ?? RULER_DEFAULTS.difficulty);
const HERO_LIST = (env['RULER_HEROES'] ? env['RULER_HEROES'].split(',') : [...HEROES]) as Hero[];
const ONLY = env['RULER_ONLY'] ? env['RULER_ONLY'].split(',') : undefined;
for (const h of HERO_LIST) if (!HEROES.includes(h)) throw new Error(`RULER_HEROES 裡的 ${h} 不是角色（${HEROES.join('／')}）`);
// 祝福量尺的 RULER_ONLY 是祝福代號（`bless_` 開頭），秘寶量尺的是秘寶代號
const ONLY_BLESS = MODE === 'bless' ? ONLY : undefined;
for (const id of MODE === 'bless' ? [] : ONLY ?? []) if (!relicById[id]) throw new Error(`RULER_ONLY 裡的 ${id} 不是秘寶`);

const ROOT = join(__dirname, '..');
const RATING_PATH = join(ROOT, 'src', 'engine', 'relic-ratings.json');
const today = (): string => new Date().toISOString().slice(0, 10);

describe('量尺工具（小樣本）', () => {
  it('跑得起來：基準與塞一件都回 N 局，樓層合理', () => {
    const base = runBatch('ninja', 3, 'ruler-smoke', 1);
    expect(base).toHaveLength(3);
    for (const r of base) expect(r.floor).toBeGreaterThan(0);
    const c = measureCell('ninja', 'fish_bone', base, { n: 3, seed: 'ruler-smoke', difficulty: 1 });
    expect(c.mode).toBe('add');
    expect(Number.isFinite(c.d) && Number.isFinite(c.se)).toBe(true);
    expect(c.fire, '魚骨頭只加最大生命，沒有戰鬥裡的發動可數').toBeNull();
  });

  it('起始秘寶：自己的是「拿掉」、別隻的是「硬塞」', () => {
    expect(modeFor('blue_headband', 'ninja')).toBe('remove');
    expect(modeFor('blue_headband', 'feifei')).toBe('cross');
    expect(modeFor('tuna_can', 'feifei')).toBe('add');
  });

  it('真的塞進去了：鈴鐺在每一場開戰都發動（fire ≈ 1）', () => {
    const base = runBatch('feifei', 2, 'ruler-smoke', 1);
    const c = measureCell('feifei', 'bell', base, { n: 2, seed: 'ruler-smoke', difficulty: 1 });
    expect(c.fire).toBeGreaterThanOrEqual(1);
  });

  it('觀察點不改任何決策：掛著空的觀察點跑，結果一個位元都不差', () => {
    for (const hero of ['ninja', 'dangdang'] as const) {
      const plain = smartRun('ruler-probe-0', 1, hero);
      const probed = withSmartProbe({ setup() {}, node() {}, combatEnd() {}, potion() {} }, () => smartRun('ruler-probe-0', 1, hero));
      expect(probed).toEqual(plain);
    }
  });

  it('忍具帳對得起來：喝掉＋結束還握著 ≤ 拿到（差的是帶滿時被擠掉的）', () => {
    const r = measurePotions({ n: 3, seed: 'ruler-smoke', difficulty: 1, heroes: ['ninja', 'fengfeng'] });
    const all = Object.values(r.stats);
    expect(all.reduce((s, x) => s + x.got, 0)).toBeGreaterThan(0);
    for (const s of all) {
      expect(s.used + s.heldEnd, s.id).toBeLessThanOrEqual(s.got);
      expect(s.useKind.一般 + s.useKind.大魔物 + s.useKind.塔主, s.id).toBe(s.used);
    }
    expect(renderPotionReport(r, 'test')).toContain('喝掉率');
  });

  it('祝福量尺跑得起來：強制拿的那一樣真的拿了、報表每一種都有一列（2026-09-23 第三批）', () => {
    const m = measureBlessings({ n: 2, seed: 'ruler-smoke', difficulty: 1, heroes: ['ninja'], only: ['bless_rations', 'bless_dice'] });
    expect(Object.keys(m.cells).sort()).toEqual(['bless_dice', 'bless_rations']);
    expect(Number.isFinite(m.cells['bless_rations']!.ninja!.d)).toBe(true);
    const txt = renderBlessReport(m, 'test');
    expect(txt).toContain('乾糧袋');
    expect(txt).toContain('一顆骰子');
    expect(blessClassSpread(m).map((s) => s.cls)).toEqual(['安全', '換牌', '代價', '賭運氣']);
    // 強制拿：不在包袱裡也照拿（乾糧袋多 6 點生命上限）；`null`＝什麼都不拿、包袱也拿掉
    const run = newRun('ruler-smoke-0', 1, 'ninja');
    const before = me(run).maxHp;
    withSmartProbe({ blessing: () => 'bless_rations' }, () => smartBless(run));
    expect(me(run).bless?.took).toBe('bless_rations');
    expect(me(run).maxHp - before).toBe(6);
    const bare = newRun('ruler-smoke-0', 1, 'ninja');
    withSmartProbe({ blessing: () => null }, () => smartBless(bare));
    expect(me(bare).bless).toBeUndefined();
  });

  it('資料檔的寫法：一件一行、讀得回來', () => {
    const m = measureRelics({ n: 2, seed: 'ruler-smoke', difficulty: 1, heroes: ['ninja'], only: ['tuna_can', 'bell'] });
    const f = mergeRatingFile(null, m, { n: 2, seed: 'ruler-smoke', difficulty: 1, heroes: ['ninja'], only: ['tuna_can', 'bell'] }, 'test');
    const txt = serializeRatingFile(f);
    const back = JSON.parse(txt) as RelicRatingFile;
    expect(back.relics['tuna_can']?.ninja?.score).toBe(f.relics['tuna_can']?.ninja?.score);
    expect(txt.split('\n').filter((l) => l.includes('"bell"'))).toHaveLength(1);
    expect(renderRelicReport(back)).toContain('鮪魚罐頭');
  });
});

const FILE = RATING_JSON as unknown as RelicRatingFile;

describe('分數表 src/engine/relic-ratings.json', () => {
  it('池子裡每一件、四隻都量過（新秘寶沒量就擋：跑 RULER=relics RULER_ONLY=<代號>）', () => {
    const missing: string[] = [];
    for (const def of relics) for (const h of HEROES) if (obtainable(def, h) && !FILE.relics[def.id]?.[h]) missing.push(`${def.id}/${h}`);
    expect(missing).toEqual([]);
  });

  it('格式：分數＝5＋層差（最低 0）、事件分＝層差×一層幾分、模式對、局數夠', () => {
    expect(FILE.meta.n).toBeGreaterThanOrEqual(600);
    expect(FILE.meta.eventPointsPerFloor).toBeGreaterThan(0);
    for (const [id, per] of Object.entries(FILE.relics)) {
      expect(relicById[id], `${id} 不是秘寶（改名或刪掉了？）`).toBeDefined();
      for (const [h, c] of Object.entries(per)) {
        if (!c) continue;
        const where = `${id}/${h}`;
        expect(c.mode, where).toBe(modeFor(id, h as Hero));
        for (const k of ['d', 'se', 'a2', 'a3', 'score', 'ev'] as const) expect(Number.isFinite(c[k]), `${where} ${k}`).toBe(true);
        expect(c.score, where).toBe(scoreOf(c.d));
        expect(c.score, where).toBeGreaterThanOrEqual(0);
        // 錢類的事件分走心算（`moneyEv`，2026-09-23 bal），其餘＝層差×一層幾分
        const byFish = moneyEv(relicById[id]!);
        expect(c.ev, where).toBeCloseTo(byFish ?? Math.round(c.d * FILE.meta.eventPointsPerFloor * 10) / 10, 5);
      }
    }
  });

  it('同一件對不同貓的分數不一樣（四隻各一份，不是同一份抄四次）', () => {
    const differs = Object.values(FILE.relics).filter((per) => new Set(HEROES.map((h) => per[h]?.score)).size > 1).length;
    expect(differs).toBeGreaterThan(Object.keys(FILE.relics).length / 2);
  });
});

/** 照代號算的亂分數（跟量尺無關的一張表），用來證明機器人的選擇真的跟著表走 */
function fakeTable(salt: number): RelicRatingFile['relics'] {
  const out: RelicRatingFile['relics'] = {};
  for (const def of relics) {
    const s = [...def.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0) + salt) % 1009, 7) % 11;
    out[def.id] = Object.fromEntries(HEROES.map((h) => [h, { mode: 'add', d: s - 5, se: 0, a2: 0, a3: 0, b1: null, b2: null, fire: null, score: s, ev: s * 10 }]));
  }
  return out;
}

describe('機器人真的讀這份分數（把表換掉，選擇跟著變）', () => {
  it('relicRating／relicEventValue 讀的就是表上那一格，而且分角色', () => {
    for (const id of ['nine_tails', 'bell', 'master_belt']) for (const h of HEROES) {
      expect(relicRating(id, h), `${id}/${h}`).toBe(FILE.relics[id]![h]!.score);
      expect(relicEventValue(id, h), `${id}/${h}`).toBe(FILE.relics[id]![h]!.ev);
    }
  });

  it('過關三選一：每一次都挑「這份表上」最高分的那件，換一份表就換一個挑法', () => {
    for (const salt of [1, 2]) {
      const table = fakeTable(salt);
      setRelicRatings({ relics: table });
      try {
        let checked = 0;
        for (let i = 0; i < 12 && checked < 3; i++) {
          let seen: string[] = []; let owned: string[] = [];
          withSmartProbe({
            node(run, node) {
              const nowSeen = Object.keys(run.flags).filter((k) => k.startsWith('relic_seen:')).map((k) => k.slice(11));
              const nowOwned = [...me(run).relics];
              if (node.type === '塔主' && run.status === 'playing') {
                const offers = nowSeen.filter((x) => !seen.includes(x));
                const got = nowOwned.filter((x) => !owned.includes(x));
                const best = offers.slice().sort((a, b) => table[b]!.ninja!.score - table[a]!.ninja!.score)[0];
                if (offers.length >= 2) { expect(got, `salt ${salt} 種子 ${i}：${offers.join('、')}`).toContain(best); checked += 1; }
              }
              seen = nowSeen; owned = nowOwned;
            },
          }, () => smartRun(`ruler-pick-${i}`, 1, 'ninja'));
        }
        expect(checked, '樣本裡要真的有過關三選一').toBeGreaterThanOrEqual(1);
      } finally { setRelicRatings(null); }
    }
  });

  it('罐頭鋪：全部 10 分會買秘寶、全部 0 分一件都不買', () => {
    const bought = (score: number): number => {
      setRelicRatings({ relics: Object.fromEntries(relics.map((r) => [r.id, Object.fromEntries(HEROES.map((h) => [h, { score, ev: 24 }]))])) });
      let n = 0;
      try {
        for (let i = 0; i < 12; i++) {
          let before = 0;
          withSmartProbe({
            setup(run) { before = me(run).relics.length; },
            node(run, node) {
              if (node.type === '罐頭鋪') n += me(run).relics.length - before;
              before = me(run).relics.length;
            },
          }, () => smartRun(`ruler-shop-${i}`, 1, 'feifei'));
        }
      } finally { setRelicRatings(null); }
      return n;
    };
    expect(bought(0)).toBe(0);
    expect(bought(10)).toBeGreaterThan(0);
  });

  it('事件：「隨機一件常見秘寶」＝這一位抽得到的那幾件的平均事件分；表換了估值跟著換', () => {
    const run = newRun('ruler-ev', 1, 'dangdang');
    const opt: RunEffect[] = [{ kind: 'relic', pool: '常見' }];
    // 「這一位抽得到的」＝濾掉鎖住噹噹的（2026-09-23 內容擴充第一批：常見池多了只給封封的磨劍石，量尺對鎖住的那格留空）
    const common = relics.filter((r) => r.pool === '常見' && obtainable(r, 'dangdang'));
    expect(common.length, '前提：常見池裡確實有鎖住噹噹的，這條才測得到濾網').toBeLessThan(relics.filter((r) => r.pool === '常見').length);
    const avg = common.reduce((s, r) => s + FILE.relics[r.id]!.dangdang!.ev, 0) / common.length;
    expect(eventValue(run, opt, 0)).toBeCloseTo(avg, 5);
    const table = fakeTable(3);
    setRelicRatings({ relics: table });
    try {
      expect(eventValue(run, opt, 0)).toBeCloseTo(common.reduce((s, r) => s + table[r.id]!.dangdang!.ev, 0) / common.length, 5);
      // 身上已經有的不會再抽到，估值也不算它
      takeRelic(run, common[0]!.id);
      const rest = common.slice(1);
      expect(eventValue(run, opt, 0)).toBeCloseTo(rest.reduce((s, r) => s + table[r.id]!.dangdang!.ev, 0) / rest.length, 5);
    } finally { setRelicRatings(null); }
  });

  it('交出一件換兩件：身上沒有可交的（只有起始秘寶）→ 引擎什麼都不給，估值也是 0', () => {
    const run = newRun('ruler-lose', 1, 'ninja');
    const opt: RunEffect[] = [{ kind: 'loseRelic' }, { kind: 'relic', pool: '常見' }, { kind: 'relic', pool: '常見' }];
    expect(eventValue(run, opt, 0)).toBeCloseTo(0, 5);
    takeRelic(run, 'nine_tails');
    const expected = -FILE.relics['nine_tails']!.ninja!.ev + 2 * eventValue(run, [{ kind: 'relic', pool: '常見' }], 0);
    expect(eventValue(run, opt, 0)).toBeCloseTo(expected, 5);
  });

  it('錢類的事件分走心算：牢裡的山賊，機器人會放牠出來拿欠條，不是挖那 50 條（2026-09-23 bal）', () => {
    // 量尺換出來的欠條只有 8～12 分，一直比不過「挖 50 條」的 17.5 分，2400 局一次都沒拿過
    const ev = eventById['cell_bandit']!;
    const iou = ev.choices.find((c) => c.outcome.some((fx) => fx.kind === 'relicId' && fx.id === 'bandit_iou'))!;
    const dig = ev.choices.find((c) => c.outcome.some((fx) => fx.kind === 'fish'))!;
    expect(FISH_EVENT_POINTS, '跟 eventValue 的小魚乾同一把尺').toBeCloseTo(eventValue(newRun('iou-scale', 1, 'ninja'), [{ kind: 'fish', n: 1 }], 0), 5);
    for (const h of HEROES) {
      const run = newRun(`iou-${h}`, 1, h);
      expect(eventValue(run, iou.outcome, iou.costFish ?? 0), h).toBeGreaterThan(eventValue(run, dig.outcome, dig.costFish ?? 0));
      expect(relicEventValue('bandit_iou', h), h).toBeCloseTo(moneyEv(relicById['bandit_iou']!)!, 5);
    }
  });

  it('錢類全部走同一套心算：哪幾件算錢類、公式一處、表上的事件分就是它（2026-09-23 bal 主控裁定）', () => {
    const money = relics.filter((r) => moneyFish(r) !== null).map((r) => r.id).sort();
    // 只有錢的掛鉤的才算；銅臭錢袋（飯糰）、批發箱（忍具格）不算。新的錢類秘寶會自動進來，這裡要跟著改名單
    expect(money).toEqual(['bandit_iou', 'coin_jar', 'coin_sword', 'fish_jar', 'glutton_purse', 'lucky_cat', 'lucky_coin', 'piggy_bank']);
    const A = AFTER_EVENT;
    // 公式對得上牌面：小魚乾罐＝每場 15 × 剩下幾場；銅錢劍＝每隻 15 × 剩下幾隻；貪吃錢袋＝每場 25 − 店貴三成；欠條＝每場 25 − 每間店 10
    expect(moneyFish(relicById['fish_jar']!)).toBeCloseTo(15 * A.wins, 5);
    expect(moneyFish(relicById['coin_sword']!)).toBeCloseTo(15 * A.kills, 5);
    expect(moneyFish(relicById['glutton_purse']!)).toBeCloseTo(25 * A.wins - 0.3 * A.shopSpendPerVisit * A.shops, 5);
    expect(moneyFish(relicById['bandit_iou']!)).toBeCloseTo(25 * A.wins - 10 * A.shops, 5);
    expect(moneyFish(relicById['piggy_bank']!)).toBeCloseTo(40 * A.nonCombatNodes / 3, 5);
    for (const id of money) for (const h of HEROES) {
      const cell = FILE.relics[id]?.[h];
      if (!cell) continue;
      expect(relicEventValue(id, h), `${id}/${h}`).toBeCloseTo(moneyEv(relicById[id]!)!, 5);
      // 同一把尺：多拿 N 條的秘寶，事件分＝直接給 N 條
      expect(relicEventValue(id, h), `${id}/${h}`).toBeCloseTo(eventValue(newRun('money-scale', 1, h), [{ kind: 'fish', n: moneyFish(relicById[id]!)! }], 0), 0);
    }
  });

  it('bestRelic 就是分數最高的那件', () => {
    setRelicRatings({ relics: { a: { ninja: { score: 3, ev: 0 } }, b: { ninja: { score: 9, ev: 0 } }, c: { ninja: { score: 5, ev: 0 } } } });
    try { expect(bestRelic(['a', 'b', 'c'], 'ninja')).toBe('b'); } finally { setRelicRatings(null); }
  });
});

/**
 * 正式遊戲（`index.html` → `src/main.ts`、連線測試頁 `src/net/nettest.ts`）**不載入**機器人與這份分數表。
 * 量尺、機器人都只是量測工具：兩台連線各跑決定性引擎，只傳玩家動作，機器人不在裡面；
 * 分數表多大也不吃首載預算。從兩個進入點沿著 import（含延後載入的 `import()`）走一遍，走不到它們才算數。
 */
function reachable(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = entries.map((e) => join(ROOT, e));
  const re = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.ts')) continue;
    const src = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const spec = (m[1] ?? m[2])!.split('?')[0]!;
      if (!spec.startsWith('.')) continue;
      const base = join(file, '..', spec);
      const hit = [base, `${base}.ts`, join(base, 'index.ts')].find((p) => existsSync(p) && (p.endsWith('.ts') || p.endsWith('.json')));
      if (hit) stack.push(hit);
    }
  }
  return seen;
}

describe('正式遊戲不載入機器人', () => {
  it('從 main.ts、nettest.ts 走不到 smartbot、coopbot、relic-ratings.json', () => {
    const files = [...reachable(['src/main.ts', 'src/net/nettest.ts'])].map((p) => p.replace(/\\/g, '/'));
    expect(files.length, '走得到的檔案太少＝路徑或正規式寫錯了，這條會永遠綠').toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('src/engine/run.ts')), '至少要走得到引擎').toBe(true);
    expect(files.filter((f) => /smartbot\.ts$|coopbot\.ts$|relic-ratings\.json$|bless-ratings\.json$/.test(f))).toEqual([]);
  });
});

describe('祝福分數表 src/engine/bless-ratings.json（2026-09-23 第三批）', () => {
  it('包袱發得出來的每一樣、四隻都量過（改了祝福沒重量就擋：跑 RULER=bless）；量的局數夠', () => {
    const table = BLESS_JSON as unknown as { meta: { n: number }; bless: Record<string, Partial<Record<Hero, number>>> };
    expect(table.meta.n).toBeGreaterThanOrEqual(600);
    const missing = BLESSINGS.filter((b) => blessingAvailable(b)).flatMap((b) => HEROES.filter((h) => !Number.isFinite(table.bless[b.id]?.[h])).map((h) => `${b.id}/${h}`));
    expect(missing).toEqual([]);
    for (const id of Object.keys(table.bless)) expect(BLESSINGS.some((b) => b.id === id), `${id} 不是祝福（改名或刪掉了？）`).toBe(true);
  });
});

describe.runIf(MODE === 'relics')('秘寶量尺（完整）', () => {
  it(`量 ${ONLY ? ONLY.join('、') : '全部'} × ${HERO_LIST.join('、')}（各 ${N} 局）`, () => {
    const o = { n: N, seed: SEED, difficulty: DIFF, heroes: HERO_LIST, ...(ONLY ? { only: ONLY } : {}) };
    const t0 = Date.now();
    const m = measureRelics(o, (msg) => console.log(`[量尺] ${msg}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`));
    const prev = existsSync(RATING_PATH) ? JSON.parse(readFileSync(RATING_PATH, 'utf-8')) as RelicRatingFile : null;
    const f = mergeRatingFile(prev && prev.relics && Object.keys(prev.relics).length ? prev : null, m, o, today());
    writeFileSync(RATING_PATH, serializeRatingFile(f), 'utf-8');
    writeFileSync(join(ROOT, 'docs', '秘寶量尺.md'), renderRelicReport(f), 'utf-8');
    console.log(`[量尺] 寫好了：一層 ${f.meta.eventPointsPerFloor} 事件分（錨點 ${f.meta.anchors.length} 格${f.meta.fallback ? '，退回預設' : ''}）`);
  }, 7_200_000);
});

/** 換算方法（`scoreOf`、一層幾分）改了、量測本身沒變：不重跑，照檔裡的層差重算分數與報表 */
describe.runIf(MODE === 'rescore')('只重算分數（不重量）', () => {
  it('照 relic-ratings.json 的層差重算', () => {
    const prev = JSON.parse(readFileSync(RATING_PATH, 'utf-8')) as RelicRatingFile;
    const o = { n: prev.meta.n, seed: prev.meta.seed, difficulty: prev.meta.difficulty, heroes: [...HEROES] };
    const f = mergeRatingFile(prev, { baseline: {}, cells: {} }, o, prev.meta.date);
    writeFileSync(RATING_PATH, serializeRatingFile(f), 'utf-8');
    writeFileSync(join(ROOT, 'docs', '秘寶量尺.md'), renderRelicReport(f), 'utf-8');
  });
});

/** 開局祝福（2026-09-23 第三批）：`RULER=bless`，16 種 × 四隻 × N 局，開局強制拿那一樣；寫 `docs/祝福量尺.md` */
describe.runIf(MODE === 'bless')('祝福量尺（完整）', () => {
  it(`${HERO_LIST.join('、')} 各 ${N} 局 × 每一種祝福`, () => {
    const t0 = Date.now();
    const m = measureBlessings({ n: N, seed: SEED, difficulty: DIFF, heroes: HERO_LIST, ...(ONLY_BLESS ? { only: ONLY_BLESS } : {}) },
      (msg) => console.log(`[祝福] ${msg}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`));
    mkdirSync(join(ROOT, 'tools', 'out'), { recursive: true });
    writeFileSync(join(ROOT, 'tools', 'out', 'bless_ruler.json'), JSON.stringify(m), 'utf-8');
    writeFileSync(join(ROOT, 'docs', '祝福量尺.md'), renderBlessReport(m, today()), 'utf-8');
    if (!ONLY_BLESS && HERO_LIST.length === HEROES.length) writeFileSync(join(ROOT, 'src', 'engine', 'bless-ratings.json'), JSON.stringify(blessRatingFile(m, today()), null, 1) + '\n', 'utf-8');
    for (const s of blessClassSpread(m)) console.log(`[祝福] ${s.cls}：平均 ${s.avg} 層、同類差 ${s.spread} 層`);
  }, 7_200_000);
});

describe.runIf(MODE === 'potions')('忍具使用率（完整）', () => {
  it(`${HERO_LIST.join('、')} 各 ${N} 局`, () => {
    const r = measurePotions({ n: N, seed: SEED, difficulty: DIFF, heroes: HERO_LIST });
    const beforePath = env['RULER_BEFORE'];
    const before = beforePath ? JSON.parse(readFileSync(join(ROOT, beforePath), 'utf-8')) as PotionReport : undefined;
    mkdirSync(join(ROOT, 'tools', 'out'), { recursive: true });
    writeFileSync(join(ROOT, 'tools', 'out', 'potion_usage.json'), JSON.stringify(r), 'utf-8');
    writeFileSync(join(ROOT, 'docs', '忍具使用率.md'), renderPotionReport(r, today(), before), 'utf-8');
    console.log('[忍具] 寫好了 docs/忍具使用率.md');
  }, 7_200_000);
});
