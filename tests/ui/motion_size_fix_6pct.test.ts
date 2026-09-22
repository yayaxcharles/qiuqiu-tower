import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import record from '../../docs/motion-size-fix-6pct.json';
import dangdangData from '../../src/ui/dangdang-motion-data.json';
import qiuqiuData from '../../src/ui/qiuqiu-motion-data.json';

/**
 * 6pct 批次動作圖大小修正（2026-09-22，`tools/motion_size_fix_6pct.py`）。
 *
 * 拿新版待機第 1 格的頭當樣板、在每一格找最吻合的倍率：噹噹閃避與勝利（同一張 dodge_win.webp）頭大 1～8%、
 * 腳掌也一起大（整隻畫大）；球球連環踢、衝刺、手裏劍亂舞、空中爪擊（Godot 原畫，只准縮放）頭小 2～13%。
 * 六套都不重畫，只改資料檔 scale ＝ 開分支那一版 × 修正倍率，圖與每一格的 rect／pivot／duration 都不動。
 *
 * 球球原畫的頭身比跟待機不同（頭比較小）：第一版只照頭對齊，連環踢整隻比待機高 11%、亂舞高 7%，
 * 玩家看起來就是大小變來變去。主控裁定折衷：修正倍率＝min(頭的中點, 整隻高度 +5% 的上限, 原畫 ×1.05)，
 * 原畫的頭放寬到 ±6%，因為高度或上限壓住、頭還是超出的格子明列。
 *
 * 這裡守的事，任何一件倒退都會紅：
 *  1. 修正倍率還在、而且照規則算：scale 回到改前值或第一版的值、只改紀錄不改資料，這裡會紅；
 *  2. 圖與格子沒動（雜湊、格子對紀錄）——所以縮放前後相鄰格頭部倍率的比值完全相同；
 *  3. 整隻高度（每格外框高 ÷ 待機第 1 格外框高，直接從資料檔算）最高 +5%；
 *  4. 頭部倍率：量得準的每一格改後在範圍內，超出的只准是明列的；量不準的只准是明列的三格、退路也在範圍內；
 *     原畫本身相鄰格就跳超過 4% 的只准是明列的那幾組；
 *  5. 連環踢播完接迴旋踢（kick 第 1 格）：頭與整隻高度的跳動都 ≤5%。
 *     改前的數字也留著：每套都有格子超出 ±5%，證明量法抓得到這個毛病——頭部倍率回到舊值會紅。
 */
type Frame = { rect: number[]; pivot: number[]; duration: number };
type Motion = { texture: string; scale: number; loop?: boolean; frames: Frame[] };
type Actions = Record<string, Motion>;
const DATA: Record<string, Actions> = {
  dangdang: dangdangData.actions as unknown as Actions,
  qiuqiu: qiuqiuData.actions as unknown as Actions,
};
const motion = (key: string): Motion => {
  const [hero, action] = key.split('/') as [string, string];
  return DATA[hero]![action]!;
};
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

type Transition = { from: number; to: string; toScale: number; toHead: number; headJump: number; heightJump: number };
type Fix = {
  packedScale: number; sizeFix: number; scale: number; loop: boolean; texture: string; textureSha256: string;
  frames: Frame[];
  before: { head: number[]; spread: number[]; corrMax: number[] };
  headAfter: number[]; spreadAfter: number[]; corrMaxAfter: number[];
  unreliable: Record<string, { method: string; before: number; after: number; corr: number }>;
  inherentSteps: [number, number, number][];
  headLimit: number; headShort: Record<string, string>; transitions: Transition[];
};
const FIXES = record.scaleFix as unknown as Record<string, Fix>;
const GATE = record.gate;

// 修正倍率與改前的 scale 寫死在這裡：資料檔、紀錄、打包工具三邊要一起改才對得上
const FIX = {
  'dangdang/dodge': 0.946, 'dangdang/win': 0.962,
  'qiuqiu/combo_kick': 1.046, 'qiuqiu/rush': 1.05, 'qiuqiu/storm': 1.022, 'qiuqiu/attack_air': 1.05,
} as const;
const PACKED = {
  'dangdang/dodge': 0.863013698630137, 'dangdang/win': 0.865979381443299,
  'qiuqiu/combo_kick': 0.605, 'qiuqiu/rush': 0.622, 'qiuqiu/storm': 0.622, 'qiuqiu/attack_air': 0.515,
} as const;
const ORIGINAL = ['qiuqiu/combo_kick', 'qiuqiu/rush', 'qiuqiu/storm', 'qiuqiu/attack_air'];
// 量不準的格子（從 1 算）與退路；高度或上限優先、頭還是超出的格子；原畫本身就跳超過 4% 的相鄰格（跳過量不準的格子）
const UNRELIABLE: Record<string, Record<string, string>> = {
  'dangdang/dodge': { 4: 'feet' }, 'dangdang/win': { 6: 'feet' }, 'qiuqiu/attack_air': { 4: 'chain' },
};
const HEAD_SHORT: Record<string, number[]> = { 'qiuqiu/combo_kick': [6], 'qiuqiu/rush': [6] };
const INHERENT: Record<string, string[]> = {
  'qiuqiu/combo_kick': ['5→6', '6→7'], 'qiuqiu/rush': ['1→2'], 'qiuqiu/attack_air': ['3→5'],
};
const HEAD_LIMIT = 0.05;
const ORIGINAL_HEAD_LIMIT = 0.06;
const HEAD_FLOOR = 0.9;
const HEAD_STEP = 0.04;
const HEIGHT_LIMIT = 0.05;
const FIX_CAP = 1.05;
const TRANSITION_LIMIT = 0.05;

const limitOf = (key: string): number => (ORIGINAL.includes(key) ? ORIGINAL_HEAD_LIMIT : HEAD_LIMIT);
const listed = (key: string): number[] => Object.keys(UNRELIABLE[key] ?? {}).map(Number);
const within = (key: string, v: number): boolean => Math.abs(v - 1) <= limitOf(key) + 1e-9;
const idleHeight = (key: string): number => {
  const idle = DATA[key.split('/')[0]!]!.idle!;
  return idle.frames[0]!.rect[3]! * idle.scale;
};
/** 每一格的整隻高度：外框高（遊戲單位）÷ 待機第 1 格外框高。 */
const heights = (key: string, scale: number): number[] =>
  motion(key).frames.map((f) => Math.round(f.rect[3]! * scale / idleHeight(key) * 1e4) / 1e4);

/** 量得準的格子依序相鄰（循環動作連最後一格接回第 1 格）變化超過 4% 的組，'前→後'（從 1 算）。 */
function bigSteps(key: string, heads: number[], loop: boolean): string[] {
  const idx = heads.map((_, i) => i).filter((i) => !listed(key).includes(i + 1));
  const pairs = idx.slice(1).map((b, k) => [idx[k]!, b] as const);
  if (loop) pairs.push([idx.at(-1)!, idx[0]!]);
  return pairs.filter(([a, b]) => Math.abs(heads[b]! / heads[a]! - 1) > HEAD_STEP + 1e-9).map(([a, b]) => `${a + 1}→${b + 1}`);
}
const outOfLimit = (key: string, heads: number[]): number[] =>
  heads.map((h, i) => [h, i + 1] as const).filter(([h, n]) => !listed(key).includes(n) && !within(key, h)).map(([, n]) => n);

describe('六套只改縮放（資料檔 scale ＝ 改前 × 修正倍率，圖與格子不動）', () => {
  it('六套都在紀錄裡，閘門數字跟規格一樣', () => {
    expect(Object.keys(FIXES).sort()).toEqual(Object.keys(FIX).sort());
    expect(GATE.headLimit).toBe(HEAD_LIMIT);
    expect(GATE.originalHeadLimit).toBe(ORIGINAL_HEAD_LIMIT);
    expect(GATE.headStep).toBe(HEAD_STEP);
    expect(GATE.heightLimit).toBe(HEIGHT_LIMIT);
    expect(GATE.fixCap).toBe(FIX_CAP);
    expect(GATE.transitionLimit).toBe(TRANSITION_LIMIT);
  });

  it.each(Object.keys(FIX))('%s', (key) => {
    const fix = FIXES[key]!;
    const m = motion(key);
    expect(fix.sizeFix).toBe(FIX[key as keyof typeof FIX]);
    expect(fix.packedScale).toBe(PACKED[key as keyof typeof PACKED]);
    // 重新打包／重新移植原畫會把 scale 打回改前值；只改紀錄不改資料、或反過來，都會在這裡紅
    expect(m.scale).toBeCloseTo(PACKED[key as keyof typeof PACKED] * FIX[key as keyof typeof FIX], 9);
    expect(fix.scale).toBeCloseTo(m.scale, 9);
    // 圖與格子沒動（打包工具對過開分支那一版）：縮放前後相鄰格的比值完全相同
    expect(m.texture).toBe(fix.texture);
    expect(sha(`public/${m.texture}`)).toBe(fix.textureSha256);
    expect(m.frames).toEqual(fix.frames);
    expect(!!m.loop).toBe(fix.loop);
  });

  it.each(Object.keys(FIX))('%s 修正倍率＝min(頭的中點, 整隻高度 +5% 上限, 原畫 ×1.05)', (key) => {
    const fix = FIXES[key]!;
    const ok = fix.before.head.filter((_, i) => !listed(key).includes(i + 1));
    const head = Math.round(1 / ((Math.min(...ok) + Math.max(...ok)) / 2) * 1000) / 1000;
    const height = Math.floor((1 + HEIGHT_LIMIT) / Math.max(...heights(key, fix.packedScale)) * 1000) / 1000;
    const want = Math.min(head, height, ...(ORIGINAL.includes(key) ? [FIX_CAP] : []));
    expect(fix.sizeFix).toBe(want);
  });
});

describe('整隻高度：每格外框高 ÷ 待機第 1 格外框高（直接從資料檔算）', () => {
  it.each(Object.keys(FIX))('%s 最高不超過待機 +5%', (key) => {
    const hs = heights(key, motion(key).scale);
    expect(Math.max(...hs)).toBeLessThanOrEqual(1 + HEIGHT_LIMIT + 1e-9);
  });
});

describe('閘門數字：頭部倍率跟新版待機第 1 格比', () => {
  it.each(Object.keys(FIX))('%s 量得準的每格改後在範圍內（原畫 ±6%、噹噹 ±5%），超出的只准是明列的；改前有格子超出 ±5%', (key) => {
    const fix = FIXES[key]!;
    const n = motion(key).frames.length;
    expect(fix.headLimit).toBe(limitOf(key));
    expect(fix.headAfter).toHaveLength(n);
    expect(fix.before.head).toHaveLength(n);
    expect(outOfLimit(key, fix.headAfter)).toEqual(HEAD_SHORT[key] ?? []);
    expect(Object.keys(fix.headShort).map(Number)).toEqual(HEAD_SHORT[key] ?? []);
    for (const i of HEAD_SHORT[key] ?? []) expect(fix.headAfter[i - 1]!).toBeGreaterThanOrEqual(HEAD_FLOOR);
    // 高度優先的例外只准出現在倍率真的被高度或上限壓住的套（頭的中點比最後的倍率大）
    if (HEAD_SHORT[key]) {
      const ok = fix.before.head.filter((_, i) => !listed(key).includes(i + 1));
      expect(1 / ((Math.min(...ok) + Math.max(...ok)) / 2)).toBeGreaterThan(fix.sizeFix);
    }
    const before = fix.before.head.map((h, i) => [h, i + 1] as const)
      .filter(([h, i]) => !listed(key).includes(i) && Math.abs(h - 1) > HEAD_LIMIT + 1e-9);
    expect(before.length).toBeGreaterThan(0);
  });

  it.each(Object.keys(FIX))('%s 量不準的只准是明列的格子，退路也在範圍內', (key) => {
    const fix = FIXES[key]!;
    const bad = (corr: number[], spread: number[]) => corr.map((c, i) => [c, spread[i]!, i + 1] as const)
      .filter(([c, s]) => c < GATE.minCorr || s > GATE.maxSpread + 1e-9).map(([, , n]) => n);
    expect(bad(fix.corrMaxAfter, fix.spreadAfter)).toEqual(listed(key));
    expect(bad(fix.before.corrMax, fix.before.spread)).toEqual(listed(key));
    expect(Object.fromEntries(Object.entries(fix.unreliable).map(([k, v]) => [k, v.method]))).toEqual(UNRELIABLE[key] ?? {});
    for (const u of Object.values(fix.unreliable)) {
      expect(within(key, u.after)).toBe(true);
      expect(within(key, u.before * fix.sizeFix)).toBe(true);
      expect(u.corr).toBeGreaterThanOrEqual(u.method === 'feet' ? GATE.partCorr : GATE.chainCorr);
    }
  });

  it.each(Object.keys(FIX))('%s 相鄰格變化 ≤4%，超過的只准是原畫本來就有、明列的', (key) => {
    const fix = FIXES[key]!;
    const big = bigSteps(key, fix.before.head, fix.loop);
    expect(big).toEqual(INHERENT[key] ?? []);
    expect(fix.inherentSteps.map(([a, b]) => `${a}→${b}`)).toEqual(big);
  });
});

describe('編排接點：連環踢播完接迴旋踢（kick 第 1 格）', () => {
  it('頭與整隻高度的跳動都 ≤5%', () => {
    const [t] = FIXES['qiuqiu/combo_kick']!.transitions;
    expect(t).toBeDefined();
    expect(t!.from).toBe(8);
    expect(t!.to).toBe('kick#1');
    const kick = DATA.qiuqiu!.kick!;
    // 迴旋踢被人改了比例尺，紀錄的頭部倍率就過期了
    expect(kick.scale).toBe(t!.toScale);
    expect(Math.abs(t!.headJump)).toBeLessThanOrEqual(TRANSITION_LIMIT + 1e-9);
    const combo = motion('qiuqiu/combo_kick');
    const jump = kick.frames[0]!.rect[3]! * kick.scale / (combo.frames[t!.from - 1]!.rect[3]! * combo.scale) - 1;
    expect(Math.abs(jump)).toBeLessThanOrEqual(TRANSITION_LIMIT + 1e-9);
    expect(t!.heightJump).toBeCloseTo(jump, 3);
    // 頭的跳動也要跟現在的連環踢倍率對得上
    expect(t!.headJump).toBeCloseTo(t!.toHead / FIXES['qiuqiu/combo_kick']!.headAfter[t!.from - 1]! - 1, 3);
  });
});
