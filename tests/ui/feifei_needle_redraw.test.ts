/**
 * 菲菲七套針招重畫（2026-09-22，批次 ff2）。
 *
 * 09-20 那批針招是照舊版立繪畫的：跟新版待機第 1 格比，頭只有 0.76～0.94 倍、腿長三成左右，
 * 打包時又把第 1 格外框拉成跟待機一樣高，所以一出招整隻貓「身高一樣、頭縮一圈」。
 * 重畫後由 `tools/pack_feifei_needle_redraw.py` 打包：量 8 格的頭（新版待機第 1 格的頭當樣板、帶遮罩顏色比對），
 * 定大小與腳底，閘門不合格整批停下；量到的數字寫在 `docs/feifei-needle-redraw-ff2.json`。
 *
 * 這裡守四件事（頭部比對要跑影像比對，測試裡跑不動，所以守的是「紀錄的數字＋紀錄對得上圖檔與資料」）：
 *  1. 紀錄裡 8 格頭部倍率都在待機的 ±5%、相鄰格差 ≤4%——換回舊圖、或有人重打包時把閘門拿掉，這裡會紅；
 *  2. 紀錄對得上真的圖檔（雜湊）與動作資料（貼圖路徑、比例）——只換圖不重量、或只改資料的比例，這裡會紅；
 *  3. 比例是「頭對齊」算出來的：資料的比例 ＝ 252 ÷ 第 1 格高 × 修正倍率（修正倍率量自生圖原檔）；
 *     退回舊寫法（只把第 1 格外框拉成 252，頭就又小一圈）會紅；
 *  4. 格數、每格時長、出手時間跟 09-20 那版一樣（飛針投射物照出手時間放出去），第 1 格兩腳中點對齊待機。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import needleData from '../../src/ui/feifei-needle-motion-data.json';
import record from '../../docs/feifei-needle-redraw-ff2.json';
import { feifeiNeedleReleaseTimes, type FeifeiNeedleAction } from '../../src/ui/feifei-needle-patterns';

type Frame = { rect: number[]; pivot: number[]; duration: number };
type Motion = { texture: string; scale: number; frames: Frame[]; releaseTimes: number[] };
type Asset = {
  action: string; target: string; targetSha256: string; headScales: number[]; headMethod: string[]; sizeFix: number;
  rawHeadScales: number[]; feetMidOffsetUnits: number[]; idleFeetMidOffsetUnits: number; firstHeightRatio: number;
};

const actions = needleData.actions as unknown as Record<string, Motion>;
const assets = record.assets as Asset[];
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

// 09-20 那版的每格時長（毫秒）與出手時間（素材原速）
const TIMING: Record<string, [number[], number[]]> = {
  needle_combo: [[60, 80, 80, 70, 90, 70, 110, 120], [220, 380]],
  needle_backhand: [[50, 70, 100, 40, 80, 90, 110, 160], [260]],
  needle_pierce: [[60, 90, 90, 100, 80, 55, 100, 125], [420]],
  needle_venom: [[60, 80, 100, 120, 70, 90, 140, 150], [360]],
  needle_retreat: [[60, 65, 75, 60, 70, 90, 110, 140], [260]],
  needle_rain: [[60, 90, 110, 90, 80, 120, 160, 170], [350]],
  needle_barrage: [[60, 80, 100, 110, 70, 110, 150, 140], [350]],
};

describe('菲菲針招重畫：頭的大小跟新版待機一致', () => {
  it('七套都重畫過、都有紀錄', () => {
    expect(assets.map((a) => a.action).sort()).toEqual(Object.keys(TIMING).sort());
  });

  for (const [action, [times, release]] of Object.entries(TIMING)) {
    describe(action, () => {
      const asset = assets.find((a) => a.action === action)!;
      const motion = actions[action]!;

      it('8 格頭部倍率都在待機的 ±5%，相鄰格差不超過 4%（舊版 0.76～0.94，會在這裡紅）', () => {
        expect(asset.headScales).toHaveLength(8);
        for (const [i, head] of asset.headScales.entries()) {
          expect(Math.abs(head - 1), `第 ${i + 1} 格頭部倍率 ${head}`).toBeLessThanOrEqual(0.05 + 1e-9);
        }
        for (let i = 1; i < 8; i += 1) {
          expect(Math.abs(asset.headScales[i]! - asset.headScales[i - 1]!), `第 ${i}→${i + 1} 格`).toBeLessThanOrEqual(0.04 + 1e-9);
        }
        // 每格都量得準：整顆頭對得上，或（手舉過頭擋到後腦的格）只量臉也對得上、兩種量法互相印證
        expect(asset.headMethod).toHaveLength(8);
        for (const method of asset.headMethod) expect(['head', 'face-confirmed']).toContain(method);
      });

      it('紀錄對得上真的圖檔與動作資料（換圖不重量、只改資料比例都會紅）', () => {
        expect(motion.texture).toBe(asset.target.replace(/^public\//, ''));
        expect(motion.texture).toMatch(/_v3\.webp$/);
        expect(existsSync(asset.target)).toBe(true);
        expect(sha(asset.target)).toBe(asset.targetSha256);
        // 比例＝「第 1 格外框＝252 單位」再乘頭部修正倍率；拿掉修正（退回舊寫法）會差出修正倍率那麼多
        expect(motion.scale).toBeCloseTo(252 / motion.frames[0]!.rect[3]! * asset.sizeFix, 6);
        // 修正倍率是把生圖原檔 8 格頭部倍率的中位數修成 1.00
        const raw = [...asset.rawHeadScales].sort((a, b) => a - b);
        expect(asset.sizeFix).toBeCloseTo(1 / ((raw[3]! + raw[4]!) / 2), 3);
        expect(asset.firstHeightRatio).toBeGreaterThanOrEqual(0.94);
        expect(asset.firstHeightRatio).toBeLessThanOrEqual(1.06);
      });

      it('格數、每格時長、出手時間跟 09-20 那版一樣；出手時間落在某一格的開頭', () => {
        expect(motion.frames.map((f) => Math.round(f.duration * 1000))).toEqual(times);
        expect(motion.releaseTimes).toEqual(release);
        const starts = times.map((_, i) => times.slice(0, i).reduce((s, t) => s + t, 0));
        for (const at of release) expect(starts).toContain(at);
        // 投射物那邊（1.5 倍速換算後）也還是同一組出手時間
        expect(feifeiNeedleReleaseTimes(action as FeifeiNeedleAction)).toHaveLength(release.length);
      });

      it('第 1 格兩腳中點對齊待機，第 8 格回到附近（接回待機不橫移）', () => {
        expect(asset.feetMidOffsetUnits[0]).toBeCloseTo(asset.idleFeetMidOffsetUnits, 0);
        expect(Math.abs(asset.feetMidOffsetUnits[7]! - asset.idleFeetMidOffsetUnits)).toBeLessThanOrEqual(12);
        // 定位點在腳底最下一排：每格都踩在地上
        for (const frame of motion.frames) expect(frame.pivot[1]).toBe(frame.rect[3]! - 1);
      });
    });
  }

  it('撒針（needle_fan）借的舊 fan.webp 不在這批，沒被動到', () => {
    expect(actions.needle_fan!.texture).toBe('assets/motion/feifei/fan.webp');
  });
});
