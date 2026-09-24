import { describe, expect, it } from 'vitest';
import { encounterById } from '../src/content/enemies';
import { applyTuning, coopRun, type CoopStats, type CoopTuning } from '../src/engine/coopbot';
import { coopHpMul } from '../src/engine/coopscale';
import { HEROES, type Hero } from '../src/engine/hero';
import { beginCombat, newCoopRun } from '../src/engine/run';
import { smartRun, type SmartStats } from '../src/engine/smartbot';
import { getStatus } from '../src/engine/statuses';
import type { EnemyPool } from '../src/engine/types';

/**
 * **兩個人一起打有多容易**——雙人對單人的平衡報告（2026-09-16）。
 *
 * 平常 `npm test` 只跑 6 局當煙霧測試（引擎沒丟例外、兩個人真的都在出牌就算過）；
 * 要看數字時設環境變數：
 *
 *   COOP_N=300 npx vitest run --reporter=verbose tests/coop.report.test.ts
 *   COOP_N=300 COOP_HEROES=ninja,feifei npx vitest run --reporter=verbose tests/coop.report.test.ts
 *   COOP_N=300 COOP_SCEN=base,hp18,hp20,boss20,boss22,bossx3,bossx2,str1 npx vitest run --reporter=verbose tests/coop.report.test.ts
 *
 * 旋鈕：
 *   COOP_N       幾局（預設 6）
 *   COOP_DIFF    難度 1～5（預設 1）
 *   COOP_SEED    種子前綴（預設 coop）——換一批種子驗同樣的結論站不站得住
 *   COOP_HEROES  兩位的角色，逗號分開（預設 ninja,ninja）
 *   COOP_SOLO    要不要順便跑單人對照（預設 1；0＝不跑）
 *   COOP_SCEN    要試算哪幾種調法，逗號分開（預設 base，清單見 `SCENARIOS`）
 *
 * **這把尺量得準與量不準的地方**寫在 `src/engine/coopbot.ts` 的檔頭，看數字之前先讀那一段。
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env['COOP_N'] ?? 6);
const DIFF = Number(env['COOP_DIFF'] ?? 1);
const SEED = env['COOP_SEED'] ?? 'coop';
const HERO_PAIR = (env['COOP_HEROES'] ?? 'ninja,ninja').split(',').map((s) => s.trim()) as Hero[];
for (const h of HERO_PAIR) if (!HEROES.includes(h)) throw new Error(`COOP_HEROES=${h} 不是角色（${HEROES.join('／')}）`);
const HEROES2: readonly [Hero, Hero] = [HERO_PAIR[0] ?? 'ninja', HERO_PAIR[1] ?? HERO_PAIR[0] ?? 'ninja'];
const WITH_SOLO = (env['COOP_SOLO'] ?? '1') !== '0';

/** 一般怪（含召喚場）的四個池——調「一般怪血量」時要一起動，不然召喚場會漏掉 */
const NORMAL_POOLS: EnemyPool[] = ['弱', '中', '強', '召喚'];
const normalHp = (v: number): Partial<Record<EnemyPool, number>> =>
  Object.fromEntries(NORMAL_POOLS.map((p) => [p, v])) as Partial<Record<EnemyPool, number>>;

/** 要試算的調法。`base`＝現況，其餘每一個只動一件事，才看得出是哪一項造成的 */
const SCENARIOS: { key: string; label: string; t: CoopTuning }[] = [
  { key: 'base', label: '現況（一般 2.6／大魔物 2.8／塔主 3.0）', t: {} },
  { key: 'hp18', label: '一般怪 1.5 → 1.8', t: { hpMul: normalHp(1.8) } },
  { key: 'hp20', label: '一般怪 1.5 → 2.0', t: { hpMul: normalHp(2.0) } },
  { key: 'boss20', label: '塔主 1.75 → 2.0', t: { hpMul: { '塔主': 2.0 } } },
  { key: 'boss22', label: '塔主 1.75 → 2.2', t: { hpMul: { '塔主': 2.2 } } },
  { key: 'hp165', label: '一般怪 1.5 → 1.65', t: { hpMul: normalHp(1.65) } },
  { key: 'bossx2', label: '塔主每 2 回合多出手一次', t: { bossExtraEvery: 2 } },
  { key: 'bossx3', label: '塔主每 3 回合多出手一次', t: { bossExtraEvery: 3 } },
  { key: 'bossx4', label: '塔主每 4 回合多出手一次', t: { bossExtraEvery: 4 } },
  { key: 'bossx5', label: '塔主每 5 回合多出手一次', t: { bossExtraEvery: 5 } },
  { key: 'elitex3', label: '大魔物每 3 回合多出手一次', t: { eliteExtraEvery: 3 } },
  { key: 'bossstr3', label: '塔主戰全體 +3 爪力（招式變重，出手數不變）', t: { strengthByPool: { '塔主': 3 } } },
  { key: 'bossstr6', label: '塔主戰全體 +6 爪力', t: { strengthByPool: { '塔主': 6 } } },
  { key: 'str1', label: '全場魔物 +1 爪力（傷害整體變重）', t: { extraStrength: 1 } },
  { key: 'str2', label: '全場魔物 +2 爪力', t: { extraStrength: 2 } },
  { key: 'mix', label: '一般 1.8 ＋ 塔主 2.0 ＋ 塔主每 3 回合多出手', t: { hpMul: { ...normalHp(1.8), '塔主': 2.0 }, bossExtraEvery: 3 } },
  { key: 'rec', label: '一般 1.65 ＋ 塔主 2.0 ＋ 塔主每 4 回合多出手', t: { hpMul: { ...normalHp(1.65), '塔主': 2.0 }, bossExtraEvery: 4 } },
  { key: 'rec2', label: '一般 1.8 ＋ 塔主 2.0 ＋ 塔主每 4 回合多出手', t: { hpMul: { ...normalHp(1.8), '塔主': 2.0 }, bossExtraEvery: 4 } },
  // **建議值**（2026-09-16 量完之後挑的）：旅途照一般怪 1.8 補回被兩個人攤掉的消耗，
  // 王的血不動、改成每 4 回合多出手一次——王最吃虧的是「出手數 1 對 2」，血量對牠幾乎沒用（見報告）
  // 《殺戮尖塔 2》官方 wiki 查到的真實倍率（兩人）：第一關 ×2.2、第二三關 ×2.4、第三關王 ×2.6。
  // 我們的表寫著「抄的是殺戮尖塔 2」，實際數字卻只有 1.5／1.65／1.75，差了三分之一。
  // 再往上推：殺戮尖塔 2 的數字量出來每人掉血已經追平單人，但整局通關率還是單人的 2.7 倍
  //（兩條命＋兩份戰利品的好處），使用者要再加血。
  { key: 'hp26', label: '再加一成：一般 2.6、大魔物 2.8、塔主 3.0',
    t: { hpMul: { '弱': 2.6, '中': 2.6, '強': 2.6, '召喚': 2.6, '大魔物': 2.8, '塔主': 3.0 } } },
  { key: 'hp30', label: '再加兩成：一般 3.0、大魔物 3.2、塔主 3.4',
    t: { hpMul: { '弱': 3.0, '中': 3.0, '強': 3.0, '召喚': 3.0, '大魔物': 3.2, '塔主': 3.4 } } },
  { key: 'hp34', label: '再加三成：一般 3.4、大魔物 3.6、塔主 3.8',
    t: { hpMul: { '弱': 3.4, '中': 3.4, '強': 3.4, '召喚': 3.4, '大魔物': 3.6, '塔主': 3.8 } } },
  { key: 'sts2', label: '照殺戮尖塔 2 的真數字：一般 2.2、大魔物 2.4、塔主 2.6',
    t: { hpMul: { '弱': 2.2, '中': 2.2, '強': 2.2, '召喚': 2.2, '大魔物': 2.4, '塔主': 2.6 } } },
  { key: 'sts2x4', label: '殺戮尖塔 2 的數字 ＋ 塔主每 4 回合多出手',
    t: { hpMul: { '弱': 2.2, '中': 2.2, '強': 2.2, '召喚': 2.2, '大魔物': 2.4, '塔主': 2.6 }, bossExtraEvery: 4 } },
  { key: 'hp18x4', label: '建議：一般 1.8 ＋ 塔主每 4 回合多出手（血量不動）', t: { hpMul: normalHp(1.8), bossExtraEvery: 4 } },
];
const WANT = (env['COOP_SCEN'] ?? 'base').split(',').map((s) => s.trim()).filter(Boolean);

// ===== 把單人與雙人的紀錄攤平成同一個樣子，才比得起來 =====

interface FightRow { pool: EnemyPool; act: number; turns: number; won: boolean; lost: number[]; down: boolean[] }
interface RunRow { won: boolean; act: number; floor: number; seats: number; diedTo: string | null; fights: FightRow[];
  deck: number[]; upgraded: number[]; relics: number[]; cardsPlayed: number[]; coopCards: number[];
  bosses: { id: string; turns: number; won: boolean }[] }

const poolOf = (id: string): EnemyPool => encounterById[id]?.pool ?? '中';

function fromSolo(s: SmartStats): RunRow {
  return {
    won: s.won, act: s.act, floor: s.floor, seats: 1, diedTo: s.diedTo,
    deck: [s.deckSize], upgraded: [s.upgraded], relics: [s.relics], cardsPlayed: [], coopCards: [],
    fights: s.fights.map((f) => ({ pool: poolOf(f.id), act: f.act, turns: f.turns, won: f.won, lost: [f.hpLost], down: [!f.won] })),
    bosses: s.bosses.map((b) => ({ id: b.id, turns: b.turns, won: b.won })),
  };
}
function fromCoop(s: CoopStats): RunRow {
  return {
    won: s.won, act: s.act, floor: s.floor, seats: 2, diedTo: s.diedTo,
    deck: s.deckSize, upgraded: s.upgraded, relics: s.relics, cardsPlayed: s.cardsPlayed, coopCards: s.coopCards,
    fights: s.fights.map((f) => ({ pool: f.pool, act: f.act, turns: f.turns, won: f.won, lost: f.hpLost, down: f.down })),
    bosses: s.bosses.map((b) => ({ id: b.id, turns: b.turns, won: b.won })),
  };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '—');
const pct = (a: number, b: number): string => (b ? (a / b * 100).toFixed(1) + '%' : '—');

interface Cut { n: number; turns: number; perSeat: number; party: number; lostFights: number; downRate: number }
/** 挑出某一類戰鬥，算「打贏的那幾場」平均幾回合、每個人掉多少血（輸掉的場只計場數） */
function cut(rows: RunRow[], keep: (f: FightRow, r: RunRow) => boolean): Cut {
  const all = rows.flatMap((r) => r.fights.filter((f) => keep(f, r)));
  const won = all.filter((f) => f.won);
  return {
    n: all.length,
    lostFights: all.length - won.length,
    turns: mean(won.map((f) => f.turns)),
    perSeat: mean(won.flatMap((f) => f.lost)),          // 每個座位各算一筆＝「每個玩家平均掉多少血」
    party: mean(won.map((f) => f.lost.reduce((a, b) => a + b, 0))),   // 整隊合計（雙人是兩個人加起來）
    // 贏了但有人躺在地上：雙人真正的「差點翻車」指標（單機躺下＝整場輸，所以這欄只對雙人有意義）
    downRate: won.length ? won.filter((f) => f.down.some(Boolean)).length / won.length : NaN,
  };
}

const isNormal = (f: FightRow): boolean => NORMAL_POOLS.includes(f.pool);

function summary(label: string, rows: RunRow[]): string[] {
  const n = rows.length;
  const reach = (a: number): number => rows.filter((r) => r.act >= a).length;
  const lines: string[] = [];
  lines.push(`── ${label}｜局數 ${n}｜通關 ${rows.filter((r) => r.won).length}（${pct(rows.filter((r) => r.won).length, n)}）`
    + `｜到二關 ${pct(reach(2), n)}｜到三關 ${pct(reach(3), n)}｜平均到達 ${f1(mean(rows.map((r) => r.floor)))}F`);
  for (const a of [1, 2, 3]) {
    const c = cut(rows, (f, r) => isNormal(f) && f.act === a && r.act >= a);
    if (!c.n) continue;
    lines.push(`   一般戰 第${a}關：${c.n} 場（輸 ${c.lostFights}）｜${f1(c.turns)} 回合｜每人掉 ${f1(c.perSeat)}｜整隊掉 ${f1(c.party)}`);
  }
  const el = cut(rows, (f) => f.pool === '大魔物');
  lines.push(`   大魔物：${el.n} 場（輸 ${el.lostFights}）｜${f1(el.turns)} 回合｜每人掉 ${f1(el.perSeat)}｜整隊掉 ${f1(el.party)}`
    + (rows[0]?.seats === 2 ? `｜贏了但有人躺著 ${f1(el.downRate * 100)}%` : ''));
  const bo = cut(rows, (f) => f.pool === '塔主');
  lines.push(`   塔主戰：${bo.n} 場｜贏 ${bo.n - bo.lostFights}（${pct(bo.n - bo.lostFights, bo.n)}）｜贏的那幾場 ${f1(bo.turns)} 回合｜每人掉 ${f1(bo.perSeat)}｜整隊掉 ${f1(bo.party)}`
    + (rows[0]?.seats === 2 ? `｜贏了但有人躺著 ${f1(bo.downRate * 100)}%` : ''));
  // 每隻關主各自的勝率與回合數（王只有一隻，加怪對牠沒用，所以單獨列）
  const map = new Map<string, { n: number; w: number; t: number }>();
  for (const r of rows) for (const b of r.bosses) {
    const cur = map.get(b.id) ?? { n: 0, w: 0, t: 0 };
    cur.n += 1; cur.w += b.won ? 1 : 0; cur.t += b.turns;
    map.set(b.id, cur);
  }
  const bosses = [...map.entries()].sort((a, b) => b[1].n - a[1].n)
    .map(([id, b]) => `${id} ${b.w}/${b.n}（${f1(b.t / b.n)} 回）`);
  if (bosses.length) lines.push('   每隻關主：' + bosses.join('、'));
  const deaths = new Map<string, number>();
  for (const r of rows) if (r.diedTo) deaths.set(r.diedTo, (deaths.get(r.diedTo) ?? 0) + 1);
  lines.push('   陣亡遭遇前八：' + [...deaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, c]) => `${id}×${c}`).join('、'));
  lines.push(`   收局牌組 ${f1(mean(rows.flatMap((r) => r.deck)))} 張（升級 ${f1(mean(rows.flatMap((r) => r.upgraded)))}）`
    + `｜秘寶 ${f1(mean(rows.flatMap((r) => r.relics)))}`
    + (rows[0]?.seats === 2
      ? `｜互助牌 ${f1(mean(rows.flatMap((r) => r.coopCards)))} 張`
        + `｜整局出牌 座位0 ${f1(mean(rows.map((r) => r.cardsPlayed[0] ?? 0)))} 張／座位1 ${f1(mean(rows.map((r) => r.cardsPlayed[1] ?? 0)))} 張`
      : ''));
  return lines;
}

/** 兩組數字的對照：回合數與掉血是「乙是甲的幾倍」 */
function compare(aLabel: string, a: RunRow[], bLabel: string, b: RunRow[]): string[] {
  const ratio = (x: number, y: number): string => (Number.isFinite(x) && Number.isFinite(y) && x !== 0 ? `${(y / x).toFixed(2)}×` : '—');
  const out: string[] = [`▶ ${bLabel} ÷ ${aLabel}`];
  /*
   * **一般戰要分關看**：合在一起會被「走到第幾關」污染——雙人走得深，
   * 而第三關的一般戰本來就比第一關長，合併之後雙人的回合數會被拉高，看起來優勢比實際小。
   * 反過來第二、三關那兩列有存活者偏差：能走到那裡的單人局都是牌組長得好的那幾成，
   * 所以**第一關那一列是唯一沒有偏差的對照**（每一局都會打完第一關）。
   */
  const rows: [string, (f: FightRow) => boolean][] = [
    ['一般戰 第1關', (f) => isNormal(f) && f.act === 1],
    ['一般戰 第2關', (f) => isNormal(f) && f.act === 2],
    ['一般戰 第3關', (f) => isNormal(f) && f.act === 3],
    ['大魔物', (f) => f.pool === '大魔物'],
    ['塔主戰', (f) => f.pool === '塔主'],
  ];
  for (const [name, keep] of rows) {
    const ca = cut(a, keep); const cb = cut(b, keep);
    if (!ca.n && !cb.n) continue;
    out.push(`   ${name}：回合 ${f1(ca.turns)} → ${f1(cb.turns)}（${ratio(ca.turns, cb.turns)}）`
      + `｜每人掉血 ${f1(ca.perSeat)} → ${f1(cb.perSeat)}（${ratio(ca.perSeat, cb.perSeat)}）`
      + `｜整隊掉血 ${f1(ca.party)} → ${f1(cb.party)}（${ratio(ca.party, cb.party)}）`
      + `｜輸掉 ${pct(ca.lostFights, ca.n)} → ${pct(cb.lostFights, cb.n)}`);
  }
  const re = (rs: RunRow[], k: number): number => rs.filter((r) => r.act >= k).length / rs.length;
  out.push(`   到二關 ${pct(a.filter((r) => r.act >= 2).length, a.length)} → ${pct(b.filter((r) => r.act >= 2).length, b.length)}`
    + `（${(re(b, 2) / (re(a, 2) || 1)).toFixed(2)}×）`
    + `｜到三關 ${pct(a.filter((r) => r.act >= 3).length, a.length)} → ${pct(b.filter((r) => r.act >= 3).length, b.length)}`
    + `｜通關 ${pct(a.filter((r) => r.won).length, a.length)} → ${pct(b.filter((r) => r.won).length, b.length)}`);
  return out;
}

describe('兩個人一起打的平衡報告', () => {
  it(`${N} 局（難度 ${DIFF}、${HEROES2.join('＋')}、調法 ${WANT.join('／')}）`, () => {
    const out: string[] = [];
    let solo: RunRow[] = [];
    if (WITH_SOLO) {
      const rs: SmartStats[] = [];
      for (let i = 0; i < N; i++) rs.push(smartRun(`${SEED}-${i}`, DIFF, HEROES2[0]));
      solo = rs.map(fromSolo);
      out.push(...summary(`單人 ${HEROES2[0]}`, solo));
    }
    const done: { key: string; label: string; rows: RunRow[] }[] = [];
    for (const key of WANT) {
      const sc = SCENARIOS.find((s) => s.key === key);
      if (!sc) throw new Error(`COOP_SCEN=${key} 沒這個調法（有：${SCENARIOS.map((s) => s.key).join('、')}）`);
      const rs: CoopStats[] = [];
      for (let i = 0; i < N; i++) rs.push(coopRun(`${SEED}-${i}`, DIFF, HEROES2, sc.t));
      const rows = rs.map(fromCoop);
      done.push({ key, label: sc.label, rows });
      out.push('', ...summary(`雙人 ${sc.key}：${sc.label}`, rows));
      if (solo.length) out.push(...compare('單人', solo, `雙人 ${sc.key}`, rows));
    }
    const base = done.find((d) => d.key === 'base');
    if (base) for (const d of done) if (d.key !== 'base') out.push('', ...compare('雙人現況', base.rows, `雙人 ${d.key}`, d.rows));
    console.log(out.join('\n'));

    // 煙霧測試的部分：兩個座位真的都在打（不是一個人在扛），而且每一局都有結果
    const rows = done[0]!.rows;
    expect(rows.length).toBe(N);
    const both = rows.flatMap((r) => r.fights).filter((f) => f.won && f.lost.length === 2);
    expect(both.length, '雙人場每一場都要記到兩個座位').toBeGreaterThan(0);
    expect(rows.every((r) => r.won || r.diedTo !== null), '沒通關的局一定要說得出死在哪一場').toBe(true);
    /*
     * **這把尺自己的體檢**：第二位如果沒在出牌，整份報告就只是「一個人打血比較多的怪」，
     * 而且完全靜音——數字照印、測試照綠。兩邊的出牌數不該差一倍以上。
     */
    const p0 = mean(rows.map((r) => r.cardsPlayed[0] ?? 0));
    const p1 = mean(rows.map((r) => r.cardsPlayed[1] ?? 0));
    expect(p1, '座位 1 一張牌都沒打＝這把尺壞了').toBeGreaterThan(0);
    /*
     * 門檻 2 → 2.5（2026-09-17）。原本卡在 2.0 整，而**預設只跑 6 局**，比值本來就晃：
     * 這次只是把絕學太極改成噹噹專屬（球球的牌池少一張罕見牌），比值就從 1.9 幾滑到 2.006，
     * 整份測試變紅——但那不是座位失衡，是樣本太小。同一份程式碼 `COOP_N=30` 跑起來直接過。
     * 這條要擋的是「一個人在扛、另一個乾看」（那種會是好幾倍），2.5 一樣擋得住，
     * 而且不會每次動牌池都誤報。真的要精確量座位平衡，跑 `COOP_N=30` 那種樣本數才算數。
     */
    expect(Math.max(p0, p1) / Math.min(p0, p1), '兩個座位的出牌數差太多').toBeLessThan(2.5);
  }, 900_000);

  /**
   * 血量倍率的覆寫**真的有生效**。沒有這一條的話，`COOP_SCEN` 那十一種調法可能
   * 全部跑出同一份數字，而報告看起來一切正常——這正是整份試算最容易靜靜壞掉的地方。
   */
  it('倍率覆寫真的改得動魔物血量（試算才可信）', () => {
    const run = newCoopRun('tune-check', 1);
    const base = beginCombat(run, 'rats3');
    const before = base.enemies.map((e) => e.maxHp);
    const pool = encounterById['rats3']!.pool;
    expect(coopHpMul(pool, 2), '這條測的是一般怪那一格').toBe(2.6);

    const run2 = newCoopRun('tune-check', 1);
    const tuned = beginCombat(run2, 'rats3');
    applyTuning(tuned, 2, { hpMul: { [pool]: 5.2 } });
    tuned.enemies.forEach((e, i) => {
      // 2.6 → 5.2 就是兩倍（四捨五入允許一點誤差）
      expect(e.maxHp / (before[i] ?? 1), `第 ${i} 隻`).toBeCloseTo(2, 1);
    });
    // 之後召喚出來的小弟也要跟著放大，不然放大只影響開場那幾隻
    expect((tuned.mods?.hpMul ?? 1) / (base.mods?.hpMul ?? 1)).toBeCloseTo(2, 5);

    // 開場爪力那個旋鈕也一樣：加了就要在魔物身上看得到
    const run3 = newCoopRun('tune-check', 1);
    const hot = beginCombat(run3, 'rats3');
    const str0 = getStatus(hot.enemies[0]!, '爪力');
    applyTuning(hot, 2, { extraStrength: 2 });
    expect(getStatus(hot.enemies[0]!, '爪力')).toBe(str0 + 2);
  });
});
