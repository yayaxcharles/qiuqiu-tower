/**
 * 頭大小修正（2026-09-23 實機驗收 M-3＋L-1；工具 `tools/motion_size_fix_0923.py`、`tools/pack_static_from_motion.py --only`）。
 *
 * 使用者的硬規矩：比頭，跟同一隻新版待機第 1 格差超過 5% 就是問題。驗收量到：
 * 噹噹隱身頭大 11%、掛彩大 9%，封封集中／卷軸／技能小 7%（逐格與靜態退路都是），
 * 封封「拳」靜態退路 0.89、菲菲「翻肚」靜態退路縮成 0.924。另外量逐格時發現封封重劈第 3、6 格只有 0.905、0.895。
 * 這裡守：
 *  1. 四套逐格的資料檔 scale 就是紀錄裡「改前 × 修正倍率」那個值（有人把資料檔改回去、或重打包沒重跑修正，這裡會紅）；
 *  2. 紀錄裡改後每一格量得準的頭都在待機 ±5% 內，改前確實有超出（證明這一刀是必要的）；
 *  3. 靜態退路：縮過 5% 以上的每一張都帶著量過的頭、在 ±5% 內；這次重裁的七張照新的取格。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Measure = { scale: number; head: number[]; spread: number[]; corrMax: number[]; height: number[] };
type FixRow = { data: string; packedScale: number; sizeFix: number; scale: number; before: Measure; after: Measure; heightExempt?: string };
const FIX = JSON.parse(readFileSync('docs/motion-size-fix-0923.json', 'utf8')) as { actions: Record<string, FixRow> };
const STATIC = JSON.parse(readFileSync('docs/static-from-motion-assets.json', 'utf8')) as {
  assets: { hero: string; pose: string; action: string; frame: number; shrink: number; head?: number; headCheck?: string }[];
};
const reliable = (m: Measure, i: number): boolean => m.corrMax[i]! >= 0.85 && m.spread[i]! <= 0.08 + 1e-9;

describe('逐格動作的大小修正', () => {
  it('修的就是這四套，倍率照紀錄', () => {
    expect(Object.keys(FIX.actions).sort()).toEqual(['dangdang/stealth', 'dangdang/wounded', 'fengfeng/focus', 'fengfeng/heavy_slash']);
    expect(Object.fromEntries(Object.entries(FIX.actions).map(([k, r]) => [k, r.sizeFix]))).toEqual({
      'dangdang/stealth': 0.939, 'dangdang/wounded': 0.973, 'fengfeng/focus': 1.05, 'fengfeng/heavy_slash': 1.07,
    });
  });

  it.each(Object.entries(FIX.actions))('%s：資料檔的 scale＝改前 × 修正倍率', (key, r) => {
    const data = JSON.parse(readFileSync(r.data, 'utf8')) as { actions: Record<string, { scale: number }> };
    const scale = data.actions[key.split('/')[1]!]!.scale;
    expect(scale).toBe(r.scale);
    expect(scale).toBeCloseTo(r.packedScale * r.sizeFix, 9);
  });

  it.each(Object.entries(FIX.actions))('%s：改後每一格的頭都在待機 ±5% 內，改前有超出', (key, r) => {
    const after = r.after.head.filter((_, i) => reliable(r.after, i));
    expect(after.length, `${key} 量得準的格子`).toBeGreaterThanOrEqual(6);
    for (const h of after) expect(Math.abs(h - 1), `${key} 改後 ${h}`).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(Math.max(...r.before.head.map((h) => Math.abs(h - 1))), `${key} 改前`).toBeGreaterThan(0.05);
    // 整隻高度（外框）不超過待機 +5%；重劈的外框量到的是舉過頭的劍，另外註明
    if (!r.heightExempt) expect(Math.max(...r.after.height)).toBeLessThanOrEqual(1.05 + 1e-9);
  });
});

describe('靜態退路的頭', () => {
  it('縮過 5% 以上的每一張都量過頭、在待機 ±5% 內（原本封封「拳」縮 0.904、頭 0.89）', () => {
    for (const a of STATIC.assets) {
      if (a.shrink >= 0.95) continue;
      expect(a.head, `${a.hero}/${a.pose} 縮了 ${a.shrink} 卻沒量頭`).toBeDefined();
      expect(Math.abs(a.head! - 1), `${a.hero}/${a.pose} 頭 ${a.head}`).toBeLessThanOrEqual(0.05);
    }
  });

  it('這次重裁的七張：取格照新的、頭都在 ±5% 內', () => {
    const got = Object.fromEntries(STATIC.assets.filter((a) => a.head !== undefined)
      .map((a) => [`${a.hero}/${a.pose}`, `${a.action}#${a.frame}`]));
    expect(got).toEqual({
      'fengfeng/punch': 'heavy_slash#2', 'feifei/belly': 'belly#5', 'dangdang/stealth': 'stealth#8', 'dangdang/hurt': 'wounded#8',
      'fengfeng/focus': 'focus#5', 'fengfeng/skill': 'focus#5', 'fengfeng/scroll': 'focus#5',
    });
    for (const a of STATIC.assets.filter((x) => x.head !== undefined)) {
      expect(Math.abs(a.head! - 1), `${a.hero}/${a.pose}`).toBeLessThanOrEqual(0.05);
      expect(a.headCheck, `${a.hero}/${a.pose}`).toBe(a.pose === 'belly' ? '躺姿：照打包縮放倍率' : '逐格那格的頭 × 縮放');
    }
  });
});
