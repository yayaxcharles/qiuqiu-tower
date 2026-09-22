/**
 * 菲菲五套出招動作重畫（批次 ff1，2026-09-22）：爪擊 attack1、格擋 guard、踢 kick、丟針 shuriken、跑步 run。
 *
 * 09-20 那批跟新版待機第 1 格比，頭只有 0.86～0.92 倍——外框身高照 252 對齊了，頭卻畫小、身體腿畫長，
 * 出招時頭會縮一下。外框量不出來（今天挨打圖就是這樣漏掉的），所以量的是**頭**：
 * `tools/redraw_ff1.py` 拿待機第 1 格的頭當樣板，在每一格上找最吻合的縮放倍率，量到的數字連同圖檔雜湊
 * 寫進 `docs/redraw-ff1-motion-assets.json`。這裡守四件事：
 *  1. 重畫只換圖：格數、每格時長、命中／出手時間、是否循環、貼圖檔名跟原資料一樣；
 *  2. 遊戲裡的圖與比例就是量過的那一版（圖檔雜湊、資料檔的比例都對得上紀錄）——換回舊圖、
 *     或只改資料檔的比例不重量，這裡會紅；
 *  3. 閘門數字：8 格每格頭部倍率在待機的 ±5% 內、相鄰格變化 ≤4%（跑步連第 8→1 格也算）、
 *     頭對齊後第 1 格外框在 252±6%；頭部倍率回到舊值（0.86～0.92）這裡會紅；
 *  4. 腳底：第 1 格兩腳中點跟待機一致、第 8 格回到第 1 格的架式、往左伸出不會被戰場左緣切掉、跑步照舊騰空。
 * 聯絡表：`docs/審查報告/重畫_ff1_2026-09-22.png`（待機第 1 格｜舊 8 格｜新 8 格，同比例、同一條腳底線）。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import motionData from '../../src/ui/feifei-motion-data.json';
import record from '../../docs/redraw-ff1-motion-assets.json';

type Motion = {
  texture: string; scale: number; loop: boolean;
  frames: { rect: number[]; pivot: number[]; duration: number }[];
  impactTimes?: number[]; releaseTimes?: number[];
};
type Asset = {
  action: string; target: string; targetSha256: string; size: number[]; scale: number;
  headScales: number[]; headCorr: number[]; headScalesBefore: number[]; firstFrameHeightRatio: number;
  feetMidOffsetUnits: number[]; idleFeetMidOffsetUnits: number; leftReachUnits: number[];
};
const ACTIONS = motionData.actions as unknown as Record<string, Motion>;
const ASSETS = record.assets as unknown as Asset[];

// 原資料（09-20 那批）的節奏：重畫只換圖，這些一個都不能變
const ORIGINAL: Record<string, { texture: string; loop: boolean; ms: number[]; impactTimes?: number[]; releaseTimes?: number[] }> = {
  attack1: { texture: 'claw.webp', loop: false, ms: [70, 100, 120, 50, 70, 80, 100, 160], impactTimes: [340] },
  guard: { texture: 'guard.webp', loop: false, ms: [70, 70, 70, 90, 110, 80, 90, 140] },
  kick: { texture: 'kick_claw.webp', loop: false, ms: [60, 80, 100, 60, 90, 90, 100, 120], impactTimes: [300] },
  shuriken: { texture: 'needle.webp', loop: false, ms: [60, 80, 100, 45, 75, 100, 120, 120], releaseTimes: [285] },
  run: { texture: 'run.webp', loop: true, ms: [65, 55, 55, 65, 65, 55, 55, 65] },
};
// 改前量到的頭部倍率上限（每套 8 格裡最大的一格）：新圖最小的一格也要比這個大一截
const BEFORE_MAX: Record<string, number> = { attack1: .91, guard: .92, kick: .90, shuriken: .88, run: .91 };
const RUN_LIFT = [0, 0, 6, 12, 0, 0, 6, 12];   // 跑步騰空高度（遊戲單位），照舊資料

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** 無損 webp（VP8L）檔頭裡的寬高 */
function webpSize(path: string): [number, number] {
  const bytes = readFileSync(path);
  expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe('VP8L');
  const [b1, b2, b3, b4] = [bytes[21]!, bytes[22]!, bytes[23]!, bytes[24]!];
  return [1 + (b1 | ((b2 & 0x3f) << 8)), 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10))];
}

const asset = (action: string): Asset => {
  const found = ASSETS.find((a) => a.action === action);
  expect(found, action).toBeDefined();
  return found!;
};

describe('菲菲出招動作重畫（ff1）', () => {
  it('紀錄剛好是這五套', () => {
    expect(ASSETS.map((a) => a.action).sort()).toEqual(Object.keys(ORIGINAL).sort());
  });

  it.each(Object.keys(ORIGINAL))('%s 只換圖：格數、每格時長、命中／出手時間、循環、貼圖檔名都沒變', (action) => {
    const motion = ACTIONS[action]!;
    const original = ORIGINAL[action]!;
    expect(motion.texture).toBe(`assets/motion/feifei/${original.texture}`);
    expect(motion.loop).toBe(original.loop);
    expect(motion.frames.map((f) => Math.round(f.duration * 1000))).toEqual(original.ms);
    expect(motion.impactTimes).toEqual(original.impactTimes);
    expect(motion.releaseTimes).toEqual(original.releaseTimes);
  });

  it.each(Object.keys(ORIGINAL))('%s 遊戲裡的圖與比例就是量過的那一版', (action) => {
    const motion = ACTIONS[action]!;
    const a = asset(action);
    expect(a.target).toBe(`public/${motion.texture}`);
    expect(sha(a.target), a.target).toBe(a.targetSha256);
    expect(webpSize(a.target)).toEqual(a.size);
    expect(motion.scale).toBeCloseTo(a.scale, 10);
  });

  it.each(Object.keys(ORIGINAL))('%s 閘門：每格頭部倍率在待機 ±5%、相鄰格變化 ≤4%、頭身比沒畫偏', (action) => {
    const a = asset(action);
    const loop = ORIGINAL[action]!.loop;
    expect(record.gate.headTolerance).toBe(.05);
    expect(record.gate.headMaxStep).toBe(.04);
    expect(a.headScales).toHaveLength(8);
    for (const [i, s] of a.headScales.entries()) {
      expect(Math.abs(s - 1), `第 ${i + 1} 格頭部倍率 ${s}`).toBeLessThanOrEqual(.05);
      expect(a.headCorr[i], `第 ${i + 1} 格頭部比對相關`).toBeGreaterThanOrEqual(.85);
    }
    const pairs = a.headScales.map((s, i) => [s, a.headScales[i + 1] ?? (loop ? a.headScales[0]! : s)] as const);
    for (const [x, y] of pairs) expect(Math.abs(x - y)).toBeLessThanOrEqual(.04 + 1e-9);
    expect(Math.abs(a.firstFrameHeightRatio - 1)).toBeLessThanOrEqual(.06);
    // 第 1 格外框身高（遊戲單位）跟紀錄一致：資料檔的外框或比例被改了、沒重量，這裡會紅
    const first = ACTIONS[action]!.frames[0]!;
    expect(first.rect[3]! * ACTIONS[action]!.scale / 252).toBeCloseTo(a.firstFrameHeightRatio, 2);
    // 頭部倍率回到舊值就紅：新圖最小的一格要比舊圖最大的一格大 3% 以上
    expect(Math.max(...a.headScalesBefore)).toBeLessThanOrEqual(BEFORE_MAX[action]!);
    expect(Math.min(...a.headScales)).toBeGreaterThan(BEFORE_MAX[action]! + .03);
  });

  it.each(Object.keys(ORIGINAL))('%s 腳底：第 1 格兩腳中點跟待機一致、第 8 格接得回來、往左不會被切', (action) => {
    const a = asset(action);
    const motion = ACTIONS[action]!;
    expect(Math.abs(a.feetMidOffsetUnits[0]! - a.idleFeetMidOffsetUnits)).toBeLessThanOrEqual(1.5);
    if (!motion.loop) expect(Math.abs(a.feetMidOffsetUnits[7]! - a.feetMidOffsetUnits[0]!)).toBeLessThanOrEqual(10);
    // 往定位點左邊伸出（遊戲單位）：連線站左邊那位只有 130 的空間（見 tools/pack_hit_recoil_motion.py）
    for (const frame of motion.frames) expect(frame.pivot[0]! * motion.scale).toBeLessThanOrEqual(130);
    const lifts = motion.frames.map((f) => Math.round((f.pivot[1]! - (f.rect[3]! - 1)) * motion.scale));
    expect(lifts).toEqual(action === 'run' ? RUN_LIFT : [0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
