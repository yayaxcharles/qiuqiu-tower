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
 * 這裡守三件事，任何一件倒退都會紅：
 *  1. 修正倍率還在：scale 回到改前值（重新打包、重新移植原畫）、或只改紀錄不改資料，這裡會紅；
 *  2. 圖與格子沒動（雜湊、格子對紀錄）——所以縮放前後相鄰格頭部倍率的比值完全相同；
 *  3. 閘門數字：量得準的每一格改後在待機 ±5%；量不準的只准是明列的三格，退路（前腳／接力量）也在 ±5%；
 *     原畫本身相鄰格就跳超過 4% 的只准是明列的那幾組（整套縮放改不了，主控裁定不逐格再縮）。
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

type Fix = {
  packedScale: number; sizeFix: number; scale: number; loop: boolean; texture: string; textureSha256: string;
  frames: Frame[];
  before: { head: number[]; spread: number[]; corrMax: number[] };
  headAfter: number[]; spreadAfter: number[]; corrMaxAfter: number[];
  unreliable: Record<string, { method: string; before: number; after: number; corr: number }>;
  inherentSteps: [number, number, number][];
};
const FIXES = record.scaleFix as unknown as Record<string, Fix>;
const GATE = record.gate;

// 修正倍率與改前的 scale 寫死在這裡：資料檔、紀錄、打包工具三邊要一起改才對得上
const FIX = {
  'dangdang/dodge': 0.946, 'dangdang/win': 0.962,
  'qiuqiu/combo_kick': 1.111, 'qiuqiu/rush': 1.084, 'qiuqiu/storm': 1.042, 'qiuqiu/attack_air': 1.081,
} as const;
const PACKED = {
  'dangdang/dodge': 0.863013698630137, 'dangdang/win': 0.865979381443299,
  'qiuqiu/combo_kick': 0.605, 'qiuqiu/rush': 0.622, 'qiuqiu/storm': 0.622, 'qiuqiu/attack_air': 0.515,
} as const;
// 量不準的格子（從 1 算）與退路；原畫本身就跳超過 4% 的相鄰格（跳過量不準的格子）
const UNRELIABLE: Record<string, Record<string, string>> = {
  'dangdang/dodge': { 4: 'feet' }, 'dangdang/win': { 6: 'feet' }, 'qiuqiu/attack_air': { 4: 'chain' },
};
const INHERENT: Record<string, string[]> = {
  'qiuqiu/combo_kick': ['5→6', '6→7'], 'qiuqiu/rush': ['1→2'], 'qiuqiu/attack_air': ['3→5'],
};
const HEAD_LIMIT = 0.05;
const HEAD_STEP = 0.04;

const listed = (key: string): number[] => Object.keys(UNRELIABLE[key] ?? {}).map(Number);
const within = (v: number): boolean => Math.abs(v - 1) <= HEAD_LIMIT + 1e-9;

/** 量得準的格子依序相鄰（循環動作連最後一格接回第 1 格）變化超過 4% 的組，'前→後'（從 1 算）。 */
function bigSteps(key: string, heads: number[], loop: boolean): string[] {
  const idx = heads.map((_, i) => i).filter((i) => !listed(key).includes(i + 1));
  const pairs = idx.slice(1).map((b, k) => [idx[k]!, b] as const);
  if (loop) pairs.push([idx.at(-1)!, idx[0]!]);
  return pairs.filter(([a, b]) => Math.abs(heads[b]! / heads[a]! - 1) > HEAD_STEP + 1e-9).map(([a, b]) => `${a + 1}→${b + 1}`);
}
const outOfLimit = (key: string, heads: number[]): number[] =>
  heads.map((h, i) => [h, i + 1] as const).filter(([h, n]) => !listed(key).includes(n) && !within(h)).map(([, n]) => n);

describe('六套只改縮放（資料檔 scale ＝ 改前 × 修正倍率，圖與格子不動）', () => {
  it('六套都在紀錄裡，閘門數字跟規格一樣', () => {
    expect(Object.keys(FIXES).sort()).toEqual(Object.keys(FIX).sort());
    expect(GATE.headLimit).toBe(HEAD_LIMIT);
    expect(GATE.headStep).toBe(HEAD_STEP);
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
});

describe('閘門數字：頭部倍率跟新版待機第 1 格比', () => {
  it.each(Object.keys(FIX))('%s 量得準的每格改後在 ±5%（改後重量與改前×修正都是），改前有格子超出', (key) => {
    const fix = FIXES[key]!;
    const n = motion(key).frames.length;
    expect(fix.headAfter).toHaveLength(n);
    expect(fix.before.head).toHaveLength(n);
    expect(outOfLimit(key, fix.headAfter)).toEqual([]);
    expect(outOfLimit(key, fix.before.head.map((h) => h * fix.sizeFix))).toEqual([]);
    expect(outOfLimit(key, fix.before.head).length).toBeGreaterThan(0);
  });

  it.each(Object.keys(FIX))('%s 量不準的只准是明列的格子，退路也在 ±5%', (key) => {
    const fix = FIXES[key]!;
    const bad = (corr: number[], spread: number[]) => corr.map((c, i) => [c, spread[i]!, i + 1] as const)
      .filter(([c, s]) => c < GATE.minCorr || s > GATE.maxSpread + 1e-9).map(([, , n]) => n);
    expect(bad(fix.corrMaxAfter, fix.spreadAfter)).toEqual(listed(key));
    expect(bad(fix.before.corrMax, fix.before.spread)).toEqual(listed(key));
    expect(Object.fromEntries(Object.entries(fix.unreliable).map(([k, v]) => [k, v.method]))).toEqual(UNRELIABLE[key] ?? {});
    for (const u of Object.values(fix.unreliable)) {
      expect(within(u.after)).toBe(true);
      expect(within(u.before * fix.sizeFix)).toBe(true);
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
