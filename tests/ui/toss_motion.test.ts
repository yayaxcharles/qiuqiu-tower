/**
 * 空手擲出（2026-09-23，批次 toss；美術盤點 A1～A5）。
 *
 * 丟的不是手裏劍、不是針的牌與忍具，原本借別的動作——球球出手前手上捏著一枚手裏劍、菲菲手上是針、
 * 噹噹是一記推掌、封封是一記劍刺。四隻各補一套空手擲出（`tools/gen_toss_art.py`、`tools/pack_toss_motion.py`）。
 * 飛什麼、手上拿什麼對不對得上，由 `projectiles.test.ts` 的「出手前手上拿的東西」那一段守；這裡守素材本身：
 *  1. 四套圖檔跟打包紀錄的雜湊一致（重生了卻沒重量出手點，這裡會紅，提醒去重量 `TOSS_ORIGIN`）；
 *  2. 量過頭：第 1 格與第 8 格的頭跟新版待機差 5% 以內（外框對得上不代表頭一樣大，09-22 挨打圖的教訓）；
 *  3. 出手時點在第 4 格開頭、飛 170 毫秒（原速）才打到，載入時跟全部動作一起加快 1.5 倍；
 *  4. 原地丟、不衝上前，不在開場解碼預載裡（延後下載，還沒到先播原本借的那套）。
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import record from '../../docs/toss-motion-assets.json';
import qiuqiuExtra from '../../src/ui/qiuqiu-extra-motion-data.json';
import feifeiData from '../../src/ui/feifei-motion-data.json';
import dangdangData from '../../src/ui/dangdang-motion-data.json';
import fengfengData from '../../src/ui/fengfeng-motion-data.json';
import { motionMs } from '../../src/ui/motion-speed';
import { DEFERRED_QIUQIU_ACTIONS, qiuqiuImpactDelay, qiuqiuIsMelee, qiuqiuTossRelease } from '../../src/ui/qiuqiu-motion';
import { DEFERRED_COMPANION_ACTIONS, companionImpactDelay, companionIsMelee, companionThrowRelease } from '../../src/ui/companion-motion';
import { TOSS_ORIGIN, throwLaunch } from '../../src/ui/projectile-flight';
import { isThrowAction } from '../../src/ui/projectile-kinds';

type Frame = { rect: number[]; duration: number };
type Motion = { texture: string; frames: Frame[]; impactTimes?: number[]; releaseTimes?: number[] };
const DATA = {
  qiuqiu: (qiuqiuExtra.actions as Record<string, Motion>).toss!,
  feifei: (feifeiData.actions as Record<string, Motion>).toss!,
  dangdang: (dangdangData.actions as Record<string, Motion>).toss!,
  fengfeng: (fengfengData.actions as Record<string, Motion>).toss!,
};
const SOURCES = ['qiuqiu', 'feifei', 'dangdang', 'fengfeng'] as const;
type Asset = { hero: string; target: string; targetSha256: string; headFit: { frame: number; scale: number; corr: number }[] };

describe('空手擲出的素材', () => {
  it('四套都在，圖檔雜湊跟打包紀錄一致（換圖就要重量出手點）', () => {
    const assets = record.assets as Asset[];
    expect(assets.map((a) => a.hero).sort()).toEqual([...SOURCES].sort());
    for (const asset of assets) {
      const sha = createHash('sha256').update(readFileSync(asset.target)).digest('hex');
      expect(sha, asset.target).toBe(asset.targetSha256);
      expect(`public/${DATA[asset.hero as keyof typeof DATA].texture}`).toBe(asset.target);
    }
  });

  it('頭跟新版待機一樣大（第 1、8 格，±5%），比對吻合度夠高', () => {
    for (const asset of record.assets as Asset[]) {
      expect(asset.headFit.map((h) => h.frame), asset.hero).toEqual([1, 8]);
      for (const head of asset.headFit) {
        expect(Math.abs(head.scale - 1), `${asset.hero} 第 ${head.frame} 格`).toBeLessThanOrEqual(0.05);
        expect(head.corr, `${asset.hero} 第 ${head.frame} 格`).toBeGreaterThanOrEqual(0.85);
      }
    }
  });

  it('8 格、出手在第 4 格開頭、原速飛 170 毫秒才打到（資料照原速寫）', () => {
    for (const source of SOURCES) {
      const motion = DATA[source];
      expect(motion.frames, source).toHaveLength(8);
      const fourth = Math.round(motion.frames.slice(0, 3).reduce((sum, f) => sum + f.duration * 1000, 0));
      expect(motion.releaseTimes, source).toEqual([fourth]);
      expect(motion.impactTimes, source).toEqual([fourth + 170]);
    }
  });

  it('載入後出手與命中都換成 1.5 倍速，飛多久＝命中－出手，從量過的那隻手放出去', () => {
    expect(qiuqiuTossRelease()).toBe(motionMs(240));
    expect(qiuqiuImpactDelay('toss')).toBe(motionMs(410));
    for (const source of ['feifei', 'dangdang', 'fengfeng'] as const) {
      expect(companionThrowRelease(source, 'toss'), source).toBe(motionMs(240));
      expect(companionImpactDelay(source, 'toss'), source).toBe(motionMs(410));
    }
    for (const source of SOURCES) {
      expect(isThrowAction(source, 'toss'), source).toBe(true);
      expect(throwLaunch(source, 'toss'), source).toEqual({ origin: TOSS_ORIGIN[source], flightMs: motionMs(410) - motionMs(240) });
    }
  });

  it('原地丟、不衝上前；延後下載、不進開場解碼預載', () => {
    expect(qiuqiuIsMelee('toss')).toBe(false);
    for (const source of ['feifei', 'dangdang', 'fengfeng'] as const) expect(companionIsMelee(source, 'toss'), source).toBe(false);
    expect(DEFERRED_QIUQIU_ACTIONS.has('toss')).toBe(true);
    expect(DEFERRED_COMPANION_ACTIONS.has('toss')).toBe(true);
  });
});
