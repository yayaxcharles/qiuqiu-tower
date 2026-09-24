import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import record from '../../docs/motion-size-fix-mix.json';
import dangdangData from '../../src/ui/dangdang-motion-data.json';
import fengfengData from '../../src/ui/fengfeng-motion-data.json';
import qiuqiuData from '../../src/ui/qiuqiu-motion-data.json';
import qiuqiuExtraData from '../../src/ui/qiuqiu-extra-motion-data.json';

/**
 * mix 批次動作圖大小修正（2026-09-22，`tools/motion_size_fix_mix.py`）。
 *
 * 09-20 那批逐格動作打包時「第 1 格外框高一律拉成 252 單位」：第 1 格架式跟待機不一樣高，整隻就被放大縮小；
 * 有幾套則是生圖時頭本身就畫偏。出招時頭會縮一下、脹一下（拿待機第 1 格的頭當樣板、在各格找最吻合的倍率）。
 *  - 只改縮放（頭與尾巴、拳頭、腳掌一起偏）：噹噹跑步、球球過關走路（Godot 原畫，只准縮放）、球球太極——
 *    圖一個位元都不動，資料檔 scale ＝ 打包值 × 修正倍率；
 *  - 重畫（腳掌、腰帶跟待機一樣大，只有頭畫偏）：噹噹吃東西與中毒、封封突刺、連斬、橫掃。
 *
 * 這裡守三件事，任何一件倒退都會紅：
 *  1. 修正倍率還在：拿原本的打包工具重新打包（scale 回到打包值）、或只改資料檔，這裡會紅；
 *  2. 重畫的圖集就是量過、過了閘門的那一張（雜湊對紀錄），資料檔的比例尺是待機的解析度；
 *  3. 閘門數字：紀錄裡改後每一格頭部倍率都在待機 ±5%、相鄰格變化 ≤4%（循環動作連最後一格接回第 1 格），
 *     而且紀錄量的就是現在資料檔的比例尺（改了資料不重量，這裡會紅）。改前的數字也留著：每套都有格子超出，
 *     證明量法抓得到這個毛病——頭部倍率回到舊值（例如換回舊圖、拿掉修正），第 1、3 點會一起紅。
 */
type Frame = { rect: number[]; pivot: number[]; duration: number };
type Motion = { texture: string; scale: number; loop?: boolean; frames: Frame[]; impactTimes?: number[] };
type Actions = Record<string, Motion>;
const DATA: Record<string, Actions> = {
  dangdang: dangdangData.actions as unknown as Actions,
  fengfeng: fengfengData.actions as unknown as Actions,
  qiuqiu: { ...(qiuqiuData.actions as unknown as Actions), ...(qiuqiuExtraData.actions as unknown as Actions) },
};
const motion = (key: string): Motion => {
  const [hero, action] = key.split('/') as [string, string];
  return DATA[hero]![action]!;
};
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

type ScaleFix = { packedScale: number; sizeFix: number; scale: number; texture: string; textureSha256: string;
  before: { head: number[] }; headAfter: number[] };
type Redraw = { texture: string; scale: number; before: { head: number[] }; headAfter: number[] };
const SCALE_FIX = record.scaleFix as unknown as Record<string, ScaleFix>;
const REDRAW = record.redraw as unknown as Record<string, Redraw>;
const ATLAS = record.atlases as unknown as Record<string, { target: string; sha256: string }>;

// 修正倍率寫死在這裡：資料檔、紀錄、打包工具三邊要一起改才對得上
const FIX = { 'dangdang/run': 0.909, 'qiuqiu/walk': 0.909, 'qiuqiu/taiji': 1.081 } as const;
const PACKED = { 'dangdang/run': 0.631578947368421, 'qiuqiu/walk': 0.68, 'qiuqiu/taiji': 0.7159090909090909 } as const;
// 重畫的五套：比例尺＝該角色待機圖集的解析度；每格時長照舊（出手、命中那一格不變）
const IDLE_SCALE = { dangdang: dangdangData.actions.idle.scale, fengfeng: fengfengData.actions.idle.scale };
const DURATIONS: Record<string, number[]> = {
  'dangdang/eat': [0.08, 0.1, 0.1, 0.15, 0.18, 0.15, 0.1, 0.16],
  'dangdang/poison': [0.26, 0.18, 0.12, 0.12, 0.18, 0.2, 0.23, 0.26],
  'fengfeng/thrust': [0.06, 0.09, 0.1, 0.05, 0.08, 0.11, 0.11, 0.13],
  'fengfeng/double_slash': [0.07, 0.15, 0.06, 0.1, 0.17, 0.07, 0.11, 0.15],
  'fengfeng/sweep': [0.08, 0.1, 0.13, 0.05, 0.1, 0.11, 0.11, 0.14],
};
const HEAD_LIMIT = 0.05;
const HEAD_STEP = 0.04;

function gateFailures(heads: number[], loop: boolean): string[] {
  const out: string[] = [];
  heads.forEach((h, i) => { if (Math.abs(h - 1) > HEAD_LIMIT + 1e-9) out.push(`第 ${i + 1} 格 ${h}`); });
  const pairs = heads.slice(1).map((h, i) => [heads[i]!, h] as const);
  if (loop) pairs.push([heads.at(-1)!, heads[0]!]);
  pairs.forEach(([a, b], i) => { if (Math.abs(b / a - 1) > HEAD_STEP + 1e-9) out.push(`第 ${i + 1}→${i + 2} 格 ${a}→${b}`); });
  return out;
}

describe('只改縮放的三套（圖不動，資料檔 scale ＝ 打包值 × 修正倍率）', () => {
  it.each(Object.keys(FIX))('%s', (key) => {
    const fix = SCALE_FIX[key]!;
    const m = motion(key);
    expect(fix.sizeFix).toBe(FIX[key as keyof typeof FIX]);
    expect(fix.packedScale).toBe(PACKED[key as keyof typeof PACKED]);
    // 重新打包會把 scale 打回打包值；只改紀錄不改資料、或反過來，都會在這裡紅
    expect(m.scale).toBeCloseTo(PACKED[key as keyof typeof PACKED] * FIX[key as keyof typeof FIX], 9);
    expect(fix.scale).toBeCloseTo(m.scale, 9);
    expect(m.texture).toBe(fix.texture);
    expect(sha(`public/${m.texture}`)).toBe(fix.textureSha256);
    expect(m.frames).toHaveLength(8);
  });
});

describe('重畫的五套（圖集就是過了閘門的那一張）', () => {
  it.each(Object.keys(DURATIONS))('%s', (key) => {
    const hero = key.split('/')[0] as keyof typeof IDLE_SCALE;
    const m = motion(key);
    const r = REDRAW[key]!;
    expect(m.texture).toBe(r.texture);
    const atlas = Object.values(ATLAS).find((a) => a.target === `public/${m.texture}`);
    expect(atlas, '紀錄裡找不到這張圖集').toBeDefined();
    expect(sha(`public/${m.texture}`)).toBe(atlas!.sha256);
    expect(m.scale).toBe(IDLE_SCALE[hero]);
    expect(r.scale).toBe(m.scale);
    expect(m.frames.map((f) => f.duration)).toEqual(DURATIONS[key]);
    // 腳底定位點＝每格最底下那一排（這五套每一格都踩在地上）
    for (const f of m.frames) expect(f.pivot[1]).toBe(f.rect[3]! - 1);
  });
});

describe('閘門數字：頭部倍率跟新版待機第 1 格比', () => {
  const all = [
    ...Object.entries(SCALE_FIX).map(([key, v]) => [key, v.before.head, v.headAfter] as const),
    ...Object.entries(REDRAW).map(([key, v]) => [key, v.before.head, v.headAfter] as const),
  ];

  it('八套都在紀錄裡', () => {
    expect(all.map(([key]) => key).sort()).toEqual([...Object.keys(FIX), ...Object.keys(DURATIONS)].sort());
  });

  it.each(all)('%s 改後每格在 ±5%、相鄰格變化 ≤4%；改前有格子超出', (key, before, after) => {
    const loop = !!motion(key).loop;
    expect(after).toHaveLength(8);
    expect(gateFailures(after, loop)).toEqual([]);
    expect(gateFailures(before, loop).length).toBeGreaterThan(0);
  });
});
