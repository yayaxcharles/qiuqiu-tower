/**
 * 四隻貓的逐格動作整體 1.5 倍速（使用者 2026-09-22 裁定：換成逐格動作後節奏變拖）。
 *
 * 釘三件事：
 *  1. 代表招式（貓抓、連環踢、連掌、手裏劍、菲菲飛針…）的命中時間＝原命中時間÷1.5——
 *     舊寫法沒有加速，拿到的是原速，這裡會全部失敗；
 *  2. 投射物的出手、飛行一起縮短，傷害數字仍落在飛到的那一刻（畫面與數字同步）；
 *  3. 不該加速的沒被加速：敵人的逐格動作、待機、跑步、受擊那張舊立繪。
 */
import { describe, expect, it } from 'vitest';
import { MOTION_SPEED, motionMs, speedUpMotion } from '../../src/ui/motion-speed';
import { qiuqiuImpactTimes, qiuqiuMotionDuration } from '../../src/ui/qiuqiu-motion';
import { companionImpactTimes, companionMotionDuration } from '../../src/ui/companion-motion';
import { enemyMotionDuration } from '../../src/ui/enemy-motion';
import { feifeiNeedleFlightMs, feifeiNeedleReleaseTimes } from '../../src/ui/feifei-needle-patterns';
import { QIUQIU_SHURIKEN_FLIGHT_MS, QIUQIU_SHURIKEN_RELEASE_MS } from '../../src/ui/qiuqiu-shuriken';
import attackMotionData from '../../src/ui/qiuqiu-attack-motion-data.json';
import type { FrameMotion } from '../../src/ui/frame-motion';

/** 加速後的時間跟「原速÷1.5」最多差 1 毫秒（各段各自四捨五入到整數毫秒再相加）。 */
function expectSped(got: readonly number[], source: readonly number[]): void {
  expect(got).toHaveLength(source.length);
  got.forEach((time, index) => expect(Math.abs(time - source[index]! / 1.5)).toBeLessThanOrEqual(1));
}

describe('四隻貓的逐格動作 1.5 倍速', () => {
  it('倍速是 1.5', () => {
    expect(MOTION_SPEED).toBe(1.5);
    expect(motionMs(300)).toBe(200);
    expect(motionMs(70)).toBe(47);
  });

  it.each([
    ['貓抓（球球 attack1）', () => qiuqiuImpactTimes('attack1', 1), [70]],
    ['連環踢（球球 combo_kick 三段）', () => qiuqiuImpactTimes('combo_kick', 3), [100, 270, 600]],
    ['連掌（球球肉球連擊 palm_combo 三段）', () => qiuqiuImpactTimes('palm_combo', 3), [220, 460, 700]],
    ['連掌（噹噹 rapid_combo 三段）', () => companionImpactTimes('dangdang', 'rapid_combo', 3), [220, 460, 700]],
    ['手裏劍（球球 shuriken 兩把）', () => qiuqiuImpactTimes('shuriken', 2), [350, 490]],
    ['升級手裏劍風暴（球球 ultimate_storm）', () => qiuqiuImpactTimes('ultimate_storm', 2), [470, 730]],
    ['菲菲飛針（shuriken）', () => companionImpactTimes('feifei', 'shuriken', 1), [455]],
    ['菲菲連針（needle_combo 兩段）', () => companionImpactTimes('feifei', 'needle_combo', 2), [380, 540]],
    ['菲菲毒分身（clone）', () => companionImpactTimes('feifei', 'clone', 1), [690]],
    ['封封雙段斬（double_slash）', () => companionImpactTimes('fengfeng', 'double_slash', 2), [220, 550]],
  ] as const)('%s：命中時間＝原命中時間÷1.5', (_name, times, source) => {
    expectSped(times(), source);
  });

  it('手裏劍與飛針的出手、飛行一起縮短，命中＝出手＋飛行（傷害數字在飛到的那一刻跳）', () => {
    expectSped([QIUQIU_SHURIKEN_RELEASE_MS, QIUQIU_SHURIKEN_FLIGHT_MS], [180, 170]);
    expect(qiuqiuImpactTimes('shuriken', 1)).toEqual([QIUQIU_SHURIKEN_RELEASE_MS + QIUQIU_SHURIKEN_FLIGHT_MS]);
    expectSped([feifeiNeedleReleaseTimes('shuriken')[0]!, feifeiNeedleFlightMs('shuriken')], [285, 170]);
    expect(companionImpactTimes('feifei', 'shuriken', 1))
      .toEqual([feifeiNeedleReleaseTimes('shuriken')[0]! + feifeiNeedleFlightMs('shuriken')]);
  });

  it('整招長度與勝利動作一起縮短', () => {
    expectSped([qiuqiuMotionDuration('attack1'), qiuqiuMotionDuration('combo_kick'), qiuqiuMotionDuration('win')],
      [300, 980, 1180]);
    expectSped(['feifei', 'dangdang', 'fengfeng'].map((kind) => companionMotionDuration(kind as 'feifei', 'win')),
      [1220, 1220, 1220]);
  });

  it('不加速：敵人的逐格動作、待機、跑步，以及受擊用的那張舊立繪（比照舊版靜態演出的 650 毫秒）', () => {
    expect(enemyMotionDuration('rat', 'attack')).toBe(820);
    expect(enemyMotionDuration('ninja', 'attack')).toBe(720);
    expect(qiuqiuMotionDuration('idle')).toBe(2000);
    expect(qiuqiuMotionDuration('run')).toBe(480);
    expect(companionMotionDuration('feifei', 'run')).toBe(480);
    expect(qiuqiuMotionDuration('hurt')).toBe(650);
    expect(companionMotionDuration('dangdang', 'hurt')).toBe(650);
  });

  it('逐格換算從累積時間算：原本剛好落在格子交界的命中點，換算後仍在同一個交界', () => {
    const source = attackMotionData.actions.palm_combo as unknown as FrameMotion & { impactTimes: number[] };
    const sped = speedUpMotion(source);
    let end = 0;
    const ends = sped.frames.map((frame) => (end += Math.round(frame.duration * 1000)));
    // 原速 220／460／700 毫秒都是格子交界
    for (const impact of sped.impactTimes) expect(ends).toContain(impact);
    expect(ends.at(-1)).toBe(motionMs(1000));
  });
});
