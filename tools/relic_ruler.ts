/**
 * 秘寶量尺＋忍具使用率（2026-09-23 內容擴充第〇批 0-3）。
 *
 * **為什麼要有**：`smartbot.ts` 原本的秘寶評分是手填的，77 件只評了 34 件、其餘一律 5 分，
 * 事件裡的秘寶一律算 24（常見）／34（大魔物）分——機器人挑秘寶跟丟骰差不多，
 * 新秘寶放進池子也量不出強弱。這支照封封牌的量法（2026-09-22）改成**實測**：
 *
 *   開局就塞這一件（起始秘寶則是「拿掉自己那件」）、四隻貓各跑 N 局（預設 600、種子固定），
 *   跟不塞的同一批種子逐局相減，看平均到達樓層多幾層，再換成分數。
 *
 * 忍具那一半是順便：同樣照 `smartRun` 跑，記每一支「拿到幾次、喝掉幾次、在什麼場面喝、
 * 結束時還握在手上幾次」，喝掉率低於兩成的標出來（＝`maybePotion` 沒規則或規則太保守）。
 *
 * **怎麼跑**（寫在 `tools/relic_ruler.test.ts` 檔頭，這裡只放算法）：
 *   `RULER=relics  npx vitest run tools/relic_ruler.test.ts` → `src/engine/relic-ratings.json`＋`docs/秘寶量尺.md`
 *   `RULER=potions npx vitest run tools/relic_ruler.test.ts` → `docs/忍具使用率.md`
 *
 * **全部經過 `smartRun` 本身**（`withSmartProbe` 掛觀察點），不另抄一份決策：
 * 量的就是機器人真正的樣子，機器人哪裡不會用，量出來就在哪裡偏低——那些要在報告裡標「量不準」，不能硬給分。
 */
import { withSmartProbe, smartRun, type SmartStats } from '../src/engine/smartbot';
import { relics, relicById } from '../src/content/relics';
import { potions } from '../src/content/potions';
import { encounterById } from '../src/content/enemies';
import { HEROES, startRelicFor, type Hero } from '../src/engine/hero';
import { runMods, takeRelic } from '../src/engine/run';
import { relicOk } from '../src/engine/rewards';
import { me } from '../src/engine/runplayer';
import type { CombatState, MapNode, RelicDef, RunState } from '../src/engine/types';

export const RULER_DEFAULTS = { n: 600, seed: 'ruler', difficulty: 1 } as const;
export const HERO_NAMES: Readonly<Record<Hero, string>> = { ninja: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' };

// ===================== 秘寶 =====================

/** 一局跑完留下的東西（只留算分用得到的） */
interface RunRow {
  floor: number;
  act: number;
  won: boolean;
  /** 第一關、第二關關主：打了沒（null）、贏了沒 */
  boss1: boolean | null;
  boss2: boolean | null;
  combats: number;
  /** 被量的那一件在戰鬥裡發動了幾次（`cs.relicFired`） */
  fired: number;
}

function rowOf(s: SmartStats, combats: number, fired: number): RunRow {
  const boss = (act: number): boolean | null => {
    const b = s.bosses.find((x) => x.act === act);
    return b ? b.won : null;
  };
  return { floor: s.floor, act: s.act, won: s.won, boss1: boss(1), boss2: boss(2), combats, fired };
}

/**
 * 塞進去還是拿掉。
 * - `add`：開局 `takeRelic`（最大生命那幾件會照規則補血，跟真的拿到一樣）
 * - `remove`：這隻自己的起始秘寶——量的是「沒有它少幾層」，正負號反過來就是它值多少
 * - `cross`：別隻的起始秘寶硬塞給這隻。遊戲裡**抽不到**，只當參考
 */
export type RulerMode = 'add' | 'remove' | 'cross';
export function modeFor(relicId: string, hero: Hero): RulerMode {
  const def = relicById[relicId];
  if (def?.pool !== '起始') return 'add';
  return startRelicFor(hero) === relicId ? 'remove' : 'cross';
}

/** 跑 N 局。`relicId` 不給＝基準（什麼都不動） */
export function runBatch(hero: Hero, n: number, seed: string, difficulty: number, relicId?: string): RunRow[] {
  const rows: RunRow[] = [];
  const mode = relicId ? modeFor(relicId, hero) : null;
  for (let i = 0; i < n; i++) {
    let combats = 0; let fired = 0;
    const stats = withSmartProbe({
      setup(run: RunState) {
        if (!relicId) return;
        if (mode === 'remove') {
          const p = me(run);
          p.relics = p.relics.filter((x) => x !== relicId);
          const d = relicById[relicId]?.hooks.maxHp ?? 0;
          if (d) { p.maxHp -= d; p.hp = Math.min(p.hp, p.maxHp); }
        } else takeRelic(run, relicId);
      },
      combatEnd(cs: CombatState) {
        combats += 1;
        if (relicId) fired += cs.relicFired.filter((x) => x === relicId).length;
      },
    }, () => smartRun(`${seed}-${i}`, difficulty, hero));
    rows.push(rowOf(stats, combats, fired));
  }
  return rows;
}

/** 戰鬥裡會「發動」（推進 `cs.relicFired`）的掛鉤。其餘（最大生命、每回合飯糰、小魚乾、打盹、罐頭鋪）整局常駐，沒有發動可數 */
const FIRED_HOOKS = new Set([
  'combatStart', 'turnStart', 'firstTurnDraw', 'firstTurnEnergy', 'firstCardDiscount', 'firstCardDiscountCombat',
  'firstAttackDouble', 'drawOnNthCard', 'energyOnNthCard', 'onAttackPlayed', 'turnEndNoAttack', 'onHit', 'blockKeep',
  'onPotionUse', 'killHeal', 'killStrength', 'killFish', 'stealthBonus', 'stealthBonusEvery', 'preventLethal', 'restNextFightBlock',
  // 2026-09-23 內容擴充第二批：計數型與角色的新時機（撲滿在地圖上發動、不在戰鬥裡，不列）
  'everyNTurns', 'onNthCard', 'attackCounterDouble', 'qiReachDoubleNext', 'qiSpentEnergy', 'poisonTickBonus', 'turnEndBlockToThorns', 'onDodge',
]);
export function hasFiredHook(def: RelicDef): boolean {
  return Object.keys(def.hooks).some((k) => FIRED_HOOKS.has(k));
}

/** 一格（一件 × 一隻）的量測結果。差值一律是「塞了 − 基準」，`remove` 模式已經把正負號翻回「它值多少」 */
export interface RelicCell {
  mode: RulerMode;
  /** 平均到達樓層差（逐局相減再平均） */
  d: number;
  /** 上面那個平均的標準誤（逐局差的標準差 ÷ √N）。|d| 小於兩倍它就是雜訊 */
  se: number;
  /** 過第一關（到得了第二關）比例差、過第二關比例差，百分點 */
  a2: number;
  a3: number;
  /** 第一關、第二關關主的勝率差（只算打到關主的那幾局），百分點；兩邊有一邊沒人打到就是 null */
  b1: number | null;
  b2: number | null;
  /** 每場戰鬥平均發動幾次；整局常駐型（沒有戰鬥裡的掛鉤）是 null */
  fire: number | null;
  /** 機器人用的分數（5＋層差、最低 0、不封頂，見 `scoreOf`） */
  score: number;
  /** 事件估值用的分數（跟 `eventValue` 同一個單位，見 `eventPointsPerFloor`） */
  ev: number;
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
function rate(xs: (boolean | null)[]): number | null {
  const fought = xs.filter((x): x is boolean => x !== null);
  return fought.length ? fought.filter(Boolean).length / fought.length : null;
}

export interface Baseline { floor: number; act2: number; act3: number; won: number; boss1: number | null; boss2: number | null }
export function baselineOf(rows: RunRow[]): Baseline {
  return {
    floor: r2(mean(rows.map((r) => r.floor))),
    act2: r2(mean(rows.map((r) => (r.act >= 2 ? 1 : 0)))),
    act3: r2(mean(rows.map((r) => (r.act >= 3 ? 1 : 0)))),
    won: r2(mean(rows.map((r) => (r.won ? 1 : 0)))),
    boss1: (() => { const x = rate(rows.map((r) => r.boss1)); return x === null ? null : r2(x); })(),
    boss2: (() => { const x = rate(rows.map((r) => r.boss2)); return x === null ? null : r2(x); })(),
  };
}

/**
 * 分數：**5 分＝跟沒拿一樣，每多爬一層加 1 分**，最低 0、**不封頂**。
 *
 * 為什麼這樣換：舊表的 5 分就是「沒評過」的預設，6 分以上罐頭鋪才會買（`smartRun` 的門檻），
 * 照這個換法「罐頭鋪會買」＝「量出來平均多爬一層以上」，意思講得出來。
 * 不像封封的牌用級距：牌是塞進三十張裡的一張、差距小到級距才看得出高低；
 * 秘寶整場常駐，量出來的差距大得多，直接用連續值，過關三選一才分得出「好」與「更好」。
 * **不封頂**是第一次量完才改的：塔主池大半量到多爬五層以上，夾在 10 的話過關三選一全部同分、等於照原本順序拿。
 */
export function scoreOf(d: number): number {
  return r1(Math.max(0, 5 + d));
}

/**
 * 一層值多少「事件分」（`smartbot.ts` 的 `eventValue` 的單位）。
 *
 * **拿「只加最大生命」的那幾件當錨**：事件估值裡最大生命 1 點＝2.2 分（`eventValue` 的 `maxHp` 那一行），
 * 而魷魚絲（+6）、鮪魚罐頭（+10）、魚骨頭（+16）、掌門腰帶（+25）量出來各多爬幾層是實測的，
 * 兩個一除就是「一層值幾分」。這樣事件裡的秘寶跟「最大生命 +8」「回 20 血」擺在同一把尺上比，
 * 不會因為換算亂抓一個數而整批偏高或偏低。四隻貓十六個點合起來算（過原點的最小平方），比單隻穩。
 * 錨點量得太弱（合計的層數差 ≤ 0）就退回 12 分一層（舊表常見池平均 24 分 ÷ 約兩層），並在報告裡講明。
 */
export const MAXHP_EVENT_POINTS = 2.2;
export function eventPointsPerFloor(cells: Record<string, Partial<Record<Hero, RelicCell>>>): { k: number; anchors: string[]; fallback: boolean } {
  let sxy = 0; let sxx = 0; const anchors: string[] = [];
  for (const def of relics) {
    const keys = Object.keys(def.hooks);
    if (keys.length !== 1 || keys[0] !== 'maxHp' || (def.hooks.maxHp ?? 0) <= 0) continue;
    const y = (def.hooks.maxHp ?? 0) * MAXHP_EVENT_POINTS;
    for (const h of HEROES) {
      const c = cells[def.id]?.[h];
      if (!c || c.mode !== 'add') continue;
      sxy += c.d * y; sxx += c.d * c.d;
      anchors.push(`${def.id}/${h}`);
    }
  }
  if (sxy <= 0 || sxx === 0) return { k: 12, anchors, fallback: true };
  return { k: r1(sxy / sxx), anchors, fallback: false };
}

export interface MeasureOptions { n: number; seed: string; difficulty: number; heroes: readonly Hero[]; only?: readonly string[] }

export interface RelicMeasurement {
  baseline: Partial<Record<Hero, Baseline>>;
  cells: Record<string, Partial<Record<Hero, RelicCell>>>;
}

/** 量一件 × 一隻。`base` 是同一批種子的基準 */
export function measureCell(hero: Hero, relicId: string, base: RunRow[], o: { n: number; seed: string; difficulty: number }): RelicCell {
  const mode = modeFor(relicId, hero);
  const rows = runBatch(hero, o.n, o.seed, o.difficulty, relicId);
  const sign = mode === 'remove' ? -1 : 1;
  const diffs = rows.map((r, i) => (r.floor - base[i]!.floor) * sign);
  const d = mean(diffs);
  const sd = Math.sqrt(mean(diffs.map((x) => (x - d) ** 2)) * diffs.length / Math.max(1, diffs.length - 1));
  const pp = (f: (r: RunRow) => number): number => r1((mean(rows.map(f)) - mean(base.map(f))) * 100 * sign);
  const bossDiff = (k: 'boss1' | 'boss2'): number | null => {
    const a = rate(rows.map((r) => r[k])); const b = rate(base.map((r) => r[k]));
    return a === null || b === null ? null : r1((a - b) * 100 * sign);
  };
  const def = relicById[relicId]!;
  const combats = rows.reduce((s, r) => s + r.combats, 0);
  return {
    mode, d: r2(d), se: r2(sd / Math.sqrt(diffs.length)),
    a2: pp((r) => (r.act >= 2 ? 1 : 0)), a3: pp((r) => (r.act >= 3 ? 1 : 0)),
    b1: bossDiff('boss1'), b2: bossDiff('boss2'),
    fire: hasFiredHook(def) ? r2(combats ? rows.reduce((s, r) => s + r.fired, 0) / combats : 0) : null,
    score: scoreOf(d), ev: 0,   // ev 要等全部量完、錨點齊了才算得出來（`finishCells`）
  };
}

/** 全部量完之後補上事件分（要用到全體的錨點），順便把分數照 `d` 重算一次（合併舊檔時舊格子也一起更新） */
export function finishCells(cells: Record<string, Partial<Record<Hero, RelicCell>>>): { k: number; anchors: string[]; fallback: boolean } {
  const k = eventPointsPerFloor(cells);
  for (const per of Object.values(cells)) for (const c of Object.values(per)) {
    if (!c) continue;
    c.score = scoreOf(c.d);
    c.ev = r1(c.d * k.k);
  }
  return k;
}

/** 這隻抽不抽得到（`notFor` 鎖）。抽不到的不量，表上留空 */
export function obtainable(def: RelicDef, hero: Hero): boolean {
  return def.pool !== '起始' ? relicOk(def, [hero]) : true;
}

export function measureRelics(o: MeasureOptions, onProgress?: (msg: string) => void): RelicMeasurement {
  const out: RelicMeasurement = { baseline: {}, cells: {} };
  for (const hero of o.heroes) {
    const base = runBatch(hero, o.n, o.seed, o.difficulty);
    out.baseline[hero] = baselineOf(base);
    onProgress?.(`${HERO_NAMES[hero]} 基準 ${out.baseline[hero]!.floor}F`);
    for (const def of relics) {
      if (o.only && !o.only.includes(def.id)) continue;
      if (!obtainable(def, hero)) continue;
      (out.cells[def.id] ??= {})[hero] = measureCell(hero, def.id, base, o);
    }
    onProgress?.(`${HERO_NAMES[hero]} 量完`);
  }
  return out;
}

// ===================== 秘寶資料檔（`src/engine/relic-ratings.json`） =====================

export interface RelicRatingFile {
  說明: string;
  meta: { n: number; seed: string; difficulty: number; date: string; eventPointsPerFloor: number; anchors: string[]; fallback: boolean };
  baseline: Partial<Record<Hero, Baseline>>;
  relics: Record<string, Partial<Record<Hero, RelicCell>>>;
}

export const RATING_FILE_NOTE = '秘寶量尺的結果（tools/relic_ruler.test.ts 產生，不要手改）。score＝機器人挑秘寶用的分數（5＋平均多爬幾層，最低 0、不封頂）；ev＝事件估值用的分數；d／se＝平均到達樓層差與標準誤；a2／a3＝過第一、二關比例差（百分點）；b1／b2＝第一、二關關主勝率差；fire＝每場戰鬥發動幾次。';

/** 合併：`only`／`heroes` 只重量一部分時，沒量到的格子沿用舊檔。N、種子、難度不同的舊檔不准合（兩把尺混在一張表上） */
export function mergeRatingFile(prev: RelicRatingFile | null, m: RelicMeasurement, o: MeasureOptions, date: string): RelicRatingFile {
  if (prev && (prev.meta.n !== o.n || prev.meta.seed !== o.seed || prev.meta.difficulty !== o.difficulty)) {
    const partial = o.only || o.heroes.length < HEROES.length;
    if (partial) throw new Error(`舊的量尺是 N=${prev.meta.n}、種子 ${prev.meta.seed}、難度 ${prev.meta.difficulty}，這次是 N=${o.n}、${o.seed}、${o.difficulty}：只重量一部分會把兩把尺混在一起，請全部重量`);
    prev = null;
  }
  const relicsOut: Record<string, Partial<Record<Hero, RelicCell>>> = {};
  for (const def of relics) {
    const cell: Partial<Record<Hero, RelicCell>> = {};
    for (const h of HEROES) {
      const c = m.cells[def.id]?.[h] ?? prev?.relics[def.id]?.[h];
      if (c) cell[h] = { ...c };
    }
    if (Object.keys(cell).length) relicsOut[def.id] = cell;
  }
  const k = finishCells(relicsOut);
  return {
    說明: RATING_FILE_NOTE,
    meta: { n: o.n, seed: o.seed, difficulty: o.difficulty, date, eventPointsPerFloor: k.k, anchors: k.anchors, fallback: k.fallback },
    baseline: { ...(prev?.baseline ?? {}), ...m.baseline },
    relics: relicsOut,
  };
}

/** 一件一行，差異好讀（`git diff` 看得出是哪一件變了） */
export function serializeRatingFile(f: RelicRatingFile): string {
  const lines = ['{', `  "說明": ${JSON.stringify(f.說明)},`, `  "meta": ${JSON.stringify(f.meta)},`, `  "baseline": ${JSON.stringify(f.baseline)},`, '  "relics": {'];
  const ids = Object.keys(f.relics);
  ids.forEach((id, i) => lines.push(`    ${JSON.stringify(id)}: ${JSON.stringify(f.relics[id])}${i < ids.length - 1 ? ',' : ''}`));
  lines.push('  }', '}', '');
  return lines.join('\n');
}

// ===================== 秘寶報表（`docs/秘寶量尺.md`） =====================

/**
 * 機器人不會刻意配合、或價值不在戰鬥裡的掛鉤——量出來會偏低，報告裡標「量不準」，分數照給但要打問號。
 * 每一條都寫機器人**哪裡**不會，不是泛稱「可能不準」。
 */
export const UNRELIABLE_HOOKS: Readonly<Record<string, string>> = {
  turnEndNoAttack: '機器人不會為了觸發它刻意整回合不出攻擊，只吃到「剛好沒攻擊」的回合，偏低',
  onPotionUse: '跟著忍具喝掉的次數走；機器人不會為了它多買、多留忍具（罐頭鋪只在身上少於兩支時才買），偏低',
  potionSlots: '機器人在罐頭鋪只在身上少於兩支時才買忍具，多出來的格子只靠戰利品填，偏低',
  shopDiscount: '價值在罐頭鋪；機器人逛店的規則很簡單（秘寶 6 分以上、牌 7 分以上才買），偏低或偏高都有可能',
  winGold: '小魚乾要花掉才有價值；機器人逛店規則簡單，偏低',
  killFish: '同上（小魚乾）',
  rewardChoices: '多一張可選只在機器人的挑牌評分分得出好壞時才有用，偏低',
  // 2026-09-23 內容擴充第二批：價值在罐頭鋪與地圖上的四種
  removeCostFixed: '機器人只在牌組有三張以上爛牌、錢夠時才放生，一局放生沒幾次，偏低',
  shopFirstItemHalf: '價值在罐頭鋪；機器人一間店多半只買一兩件，而且不會為了半價多買，偏低',
  shopPotionMul: '機器人只在身上少於兩支時才買忍具，半價多半用不到，偏低',
  shopEntryFee: '代價在罐頭鋪；機器人逛店規則簡單，錢的價值估不準（偏高或偏低都有可能）',
  nodeCounterFish: '小魚乾要花掉才有價值（同上）；而且機器人挑路只看格子種類，不會為了它多走事件格',
};

export function unreliableNotes(def: RelicDef): string[] {
  return Object.keys(def.hooks).filter((k) => k in UNRELIABLE_HOOKS).map((k) => UNRELIABLE_HOOKS[k]!);
}

/** 一格的判讀：差距在兩倍標準誤以內＝量不出差別（完全沒差的 0±0 也算，例如別隻的舊劍穗：蓄氣對他們沒用） */
export function isNoise(c: RelicCell): boolean {
  return Math.abs(c.d) <= 2 * c.se;
}

export function renderRelicReport(f: RelicRatingFile): string {
  const heroes = HEROES.filter((h) => f.baseline[h]);
  const L: string[] = [];
  L.push('# 秘寶量尺（機器人實測）', '');
  L.push(`> 由 \`tools/relic_ruler.test.ts\` 產生（\`RULER=relics npx vitest run tools/relic_ruler.test.ts\`），不要手改。${f.meta.date}。`);
  L.push(`> 每一格：開局就塞這一件（起始秘寶是「拿掉自己那件」）、這隻跑 ${f.meta.n} 局（種子 \`${f.meta.seed}-0\`～\`${f.meta.seed}-${f.meta.n - 1}\`、難度 ${f.meta.difficulty}），跟不塞的同一批種子逐局相減。`);
  L.push(`> 分數＝5＋平均多爬幾層（最低 0、不封頂），機器人挑過關三選一、罐頭鋪買不買（6 分以上）都讀它；事件裡的秘寶照「一層 ${f.meta.eventPointsPerFloor} 分」換（錨點：只加最大生命的 ${f.meta.anchors.length} 格${f.meta.fallback ? '，**錨點量不出來，退回預設**' : ''}）。`);
  L.push('> 括號是標準誤；差距小於兩倍標準誤的標「≈」＝量不出差別。「量不準」欄是機器人不會刻意配合的機制，分數偏低要打問號。', '');
  L.push('## 基準（什麼都不塞）', '');
  L.push('| 角色 | 平均到達 | 過第一關 | 過第二關 | 通關 | 第一關關主勝率 | 第二關關主勝率 |', '|---|---|---|---|---|---|---|');
  const pc = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)}%`);
  for (const h of heroes) {
    const b = f.baseline[h]!;
    L.push(`| ${HERO_NAMES[h]} | ${b.floor}F | ${pc(b.act2)} | ${pc(b.act3)} | ${pc(b.won)} | ${pc(b.boss1)} | ${pc(b.boss2)} |`);
  }
  L.push('');
  // 罐頭鋪、事件是 2026-09-23 第二批的限定池；淨化是第三批「沾了魔氣」淨化之後換成的那一件（抽不到，量了才算得出淨化值多少）
  const pools: RelicDef['pool'][] = ['起始', '常見', '大魔物', '塔主', '罐頭鋪', '事件', '淨化'];
  for (const pool of pools) {
    const defs = relics.filter((r) => r.pool === pool && f.relics[r.id]);
    if (!defs.length) continue;
    L.push(`## ${pool}（${defs.length} 件）`, '');
    L.push(`| 秘寶 | ${heroes.map((h) => `${HERO_NAMES[h]} 分數（層差±標準誤）`).join(' | ')} | 過一關／過二關；關主一／二勝率（百分點，四隻平均） | 每場發動 | 量不準 |`);
    L.push(`|---|${heroes.map(() => '---').join('|')}|---|---|---|`);
    const avgScore = (def: RelicDef): number => mean(heroes.map((h) => f.relics[def.id]?.[h]?.score ?? 5));
    for (const def of defs.slice().sort((a, b) => avgScore(b) - avgScore(a))) {
      const cells = heroes.map((h) => f.relics[def.id]?.[h]);
      const txt = cells.map((c) => {
        if (!c) return '抽不到';
        const tag = c.mode === 'remove' ? '（拿掉）' : c.mode === 'cross' ? '（別隻的）' : '';
        return `${isNoise(c) ? '≈' : ''}${c.score}（${c.d >= 0 ? '+' : ''}${c.d}±${c.se}）${tag}`;
      });
      const got = cells.filter((c): c is RelicCell => !!c);
      const bAvg = (k: 'b1' | 'b2'): string => { const xs = got.map((c) => c[k]).filter((x): x is number => x !== null); return xs.length ? String(r1(mean(xs))) : '—'; };
      const a = `${r1(mean(got.map((c) => c.a2)))}／${r1(mean(got.map((c) => c.a3)))}；${bAvg('b1')}／${bAvg('b2')}`;
      const fire = got.some((c) => c.fire !== null) ? got.map((c) => (c.fire === null ? '—' : String(c.fire))).join('／') : '常駐';
      const notes = unreliableNotes(def);
      L.push(`| ${def.name} \`${def.id}\` | ${txt.join(' | ')} | ${a} | ${fire} | ${notes.length ? notes.join('；') : ''} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

// ===================== 忍具使用率 =====================

type FightKind = '一般' | '大魔物' | '塔主';
type Source = '戰利品' | '罐頭鋪' | '事件' | '其他';
export interface PotionStat {
  id: string;
  got: number;
  gotBy: Record<Source, number>;
  used: number;
  /** 一局結束時還握在手上（`heldDeath`＝其中死掉的那幾局） */
  heldEnd: number;
  heldDeath: number;
  useKind: Record<FightKind, number>;
  useTurn: Record<'第1回合' | '第2～3回合' | '第4回合起', number>;
  useHp: Record<'血低於35%' | '35～70%' | '70%以上', number>;
  perHero: Partial<Record<Hero, { got: number; used: number }>>;
}

function blankStat(id: string): PotionStat {
  return {
    id, got: 0, gotBy: { 戰利品: 0, 罐頭鋪: 0, 事件: 0, 其他: 0 }, used: 0, heldEnd: 0, heldDeath: 0,
    useKind: { 一般: 0, 大魔物: 0, 塔主: 0 }, useTurn: { 第1回合: 0, '第2～3回合': 0, 第4回合起: 0 },
    useHp: { '血低於35%': 0, '35～70%': 0, '70%以上': 0 }, perHero: {},
  };
}

/** 多重集合相減：a 裡有、b 裡沒有的（重複的照次數算） */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const left = [...b]; const out: string[] = [];
  for (const x of a) { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); else out.push(x); }
  return out;
}

function sourceOf(node: MapNode): Source {
  if (node.type === '戰鬥' || node.type === '大魔物' || node.type === '塔主') return '戰利品';
  if (node.type === '罐頭鋪') return '罐頭鋪';
  if (node.type === '事件') return '事件';
  return '其他';
}

export interface PotionReport { n: number; seed: string; difficulty: number; heroes: Hero[]; runs: number; stats: Record<string, PotionStat>; baseSlots: number }

export function measurePotions(o: { n: number; seed: string; difficulty: number; heroes: readonly Hero[] }): PotionReport {
  const stats: Record<string, PotionStat> = Object.fromEntries(potions.map((p) => [p.id, blankStat(p.id)]));
  const st = (id: string): PotionStat => (stats[id] ??= blankStat(id));
  let baseSlots = 0;
  for (const hero of o.heroes) {
    for (let i = 0; i < o.n; i++) {
      let bag: string[] = [];
      let usedHere: string[] = [];
      let runRef: RunState | null = null;
      withSmartProbe({
        setup(run) { runRef = run; bag = [...me(run).potions]; baseSlots = runMods(run).potionSlots; },
        potion(cs, id, seat) {
          usedHere.push(id);
          const s = st(id); s.used += 1;
          const ph = (s.perHero[hero] ??= { got: 0, used: 0 }); ph.used += 1;
          const pool = encounterById[cs.encounterId]?.pool;
          s.useKind[pool === '塔主' ? '塔主' : pool === '大魔物' ? '大魔物' : '一般'] += 1;
          s.useTurn[cs.turn <= 1 ? '第1回合' : cs.turn <= 3 ? '第2～3回合' : '第4回合起'] += 1;
          const p = cs.players[seat]!;
          const hp = p.hp / p.maxHp;
          s.useHp[hp < 0.35 ? '血低於35%' : hp < 0.7 ? '35～70%' : '70%以上'] += 1;
        },
        node(run, node) {
          const now = [...me(run).potions];
          for (const id of minus(now, minus(bag, usedHere))) {
            const s = st(id); s.got += 1; s.gotBy[sourceOf(node)] += 1;
            (s.perHero[hero] ??= { got: 0, used: 0 }).got += 1;
          }
          bag = now; usedHere = [];
        },
      }, () => smartRun(`${o.seed}-${i}`, o.difficulty, hero));
      const run = runRef as RunState | null;
      if (run) for (const id of me(run).potions) { const s = st(id); s.heldEnd += 1; if (run.status === 'lost') s.heldDeath += 1; }
    }
  }
  return { ...o, heroes: [...o.heroes], runs: o.n * o.heroes.length, stats, baseSlots };
}

export const LOW_USE = 0.2;
export function useRate(s: PotionStat): number | null { return s.got ? s.used / s.got : null; }

export function renderPotionReport(r: PotionReport, date: string, before?: PotionReport): string {
  const L: string[] = [];
  L.push('# 忍具使用率（機器人實測）', '');
  L.push(`> 由 \`tools/relic_ruler.test.ts\` 產生（\`RULER=potions npx vitest run tools/relic_ruler.test.ts\`），不要手改。${date}。`);
  L.push(`> 照 \`smartRun\` 跑：${r.heroes.map((h) => HERO_NAMES[h]).join('、')}各 ${r.n} 局（種子 \`${r.seed}-0\`～、難度 ${r.difficulty}），共 ${r.runs} 局。`);
  L.push('> 「拿到」＝真的進了袋子（帶滿收不下的不算）；「喝掉率」＝喝掉 ÷ 拿到；「結束還握著」＝一局結束（死掉或通關）時還在袋子裡。');
  L.push(`> **喝掉率低於 ${LOW_USE * 100}% 的標 ⚠**：多半是 \`maybePotion\` 沒有規則或規則太保守，拿到等於白佔一格。`);
  if (before) L.push('> 「改之前」是補規則之前同一批種子的喝掉率。');
  L.push('');
  const rows = Object.values(r.stats).sort((a, b) => (useRate(a) ?? -1) - (useRate(b) ?? -1));
  const pct = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)}%`);
  L.push(`| 忍具 | 拿到 | 喝掉 | 喝掉率 |${before ? ' 改之前 |' : ''} 結束還握著（死掉時） | 在哪喝（一般／大魔物／塔主） | 第幾回合（1／2～3／4+） | 喝的時候的血（<35%／35～70%／70%+） | 各角色喝掉率（${r.heroes.map((h) => HERO_NAMES[h]).join('／')}） |`);
  L.push(`|---|---|---|---|${before ? '---|' : ''}---|---|---|---|---|`);
  const name = (id: string): string => potions.find((p) => p.id === id)?.name ?? id;
  for (const s of rows) {
    const u = useRate(s);
    const flag = u !== null && u < LOW_USE ? '⚠ ' : '';
    const b = before?.stats[s.id];
    const perHero = r.heroes.map((h) => { const x = s.perHero[h]; return x && x.got ? pct(x.used / x.got) : '—'; }).join('／');
    L.push(`| ${flag}${name(s.id)} \`${s.id}\` | ${s.got} | ${s.used} | ${pct(u)} |${before ? ` ${pct(b ? useRate(b) : null)} |` : ''} ${s.heldEnd}（${s.heldDeath}） | ${s.useKind.一般}／${s.useKind.大魔物}／${s.useKind.塔主} | ${s.useTurn.第1回合}／${s.useTurn['第2～3回合']}／${s.useTurn.第4回合起} | ${s.useHp['血低於35%']}／${s.useHp['35～70%']}／${s.useHp['70%以上']} | ${perHero} |`);
  }
  const all = Object.values(r.stats);
  const tg = all.reduce((s, x) => s + x.got, 0); const tu = all.reduce((s, x) => s + x.used, 0);
  const th = all.reduce((s, x) => s + x.heldDeath, 0);
  L.push('', `合計：拿到 ${tg}、喝掉 ${tu}（${pct(tg ? tu / tg : null)}）、死的時候袋子裡還有 ${th} 支（平均每局 ${(th / r.runs).toFixed(2)} 支）。`, '');
  return L.join('\n');
}
