import { motionMs } from './motion-speed';

export type FeifeiNeedleAction =
  | 'shuriken'
  | 'storm'
  | 'needle_combo'
  | 'needle_backhand'
  | 'needle_venom'
  | 'needle_pierce'
  | 'needle_retreat'
  | 'needle_fan'
  | 'needle_rain'
  | 'needle_barrage';

type NeedleTiming = Readonly<{
  releases: readonly number[];
  flight: number;
  gap: number;
}>;

// 原速（動作素材本身）的出手、飛行、額外波間隔，建表時就換成 1.5 倍速（見 motion-speed.ts）
const needle = (releases: readonly number[], flight: number, gap: number): NeedleTiming => ({
  releases: releases.map(motionMs), flight: motionMs(flight), gap: motionMs(gap),
});

const TIMINGS: Readonly<Record<FeifeiNeedleAction, NeedleTiming>> = {
  shuriken: needle([285], 170, 140),
  storm: needle([285, 385], 170, 140),
  needle_combo: needle([220, 380], 160, 140),
  needle_backhand: needle([260], 150, 140),
  needle_venom: needle([360], 210, 140),
  needle_pierce: needle([420], 100, 140),
  needle_retreat: needle([260], 180, 140),
  needle_fan: needle([285], 180, 140),
  needle_rain: needle([350], 400, 140),
  needle_barrage: needle([350], 220, 140),
};

const ACTIONS = new Set<string>(Object.keys(TIMINGS));

/** 相對菲菲腳底定位點的位移（遊戲單位＝舞台像素；x 往右為正、y 往上為負）。 */
export type FeifeiNeedleOffset = Readonly<{ x: number; y: number }>;

/**
 * 飛針放出去的位置沒特別指定時的共用預設：腳底往右 82、往上 118（`combat.ts` 的 throwFrom 用它）。
 * 09-20 那版全部招式都從這裡出手，只有連針上下 ±12、針雨與不要過來另外偏一點。
 */
export const FEIFEI_NEEDLE_DEFAULT_ORIGIN: FeifeiNeedleOffset = Object.freeze({ x: 82, y: -118 });

/**
 * 每一招出手那一格的手在哪裡（2026-09-22 量自重畫後的圖，`tools/measure_feifei_needle_hands.py`，
 * 手部外框與量法見 `docs/feifei-needle-origins.json`）：一隻手出手＝手掌那一截的重心；
 * 兩手一起出手（不要過來、全撒了）＝兩隻手掌的中點；針雨兩手分太開，取靠敵人的右手。
 * 一招有兩個值的（連針、舊針雨）照波次輪流：第 1、3、5 波用第一個，第 2、4 波用第二個。
 * 換了動作圖就要重量——測試會核對圖檔雜湊。
 */
const ORIGINS: Readonly<Partial<Record<FeifeiNeedleAction, readonly FeifeiNeedleOffset[]>>> = {
  shuriken: [{ x: 132, y: -120 }],
  storm: [{ x: 105, y: -115 }, { x: 105, y: -112 }],
  needle_fan: [{ x: 105, y: -115 }],
  needle_combo: [{ x: 132, y: -116 }, { x: 140, y: -133 }],
  needle_backhand: [{ x: 148, y: -119 }],
  needle_venom: [{ x: 144, y: -118 }],
  needle_pierce: [{ x: 166, y: -120 }],
  needle_retreat: [{ x: 142, y: -134 }],
  needle_rain: [{ x: 100, y: -258 }],
  needle_barrage: [{ x: 131, y: -129 }],
};

/** 第 wave 波飛針放出去的位置（相對腳底定位點）。沒量過的招用共用預設。 */
export function feifeiNeedleOrigin(action: FeifeiNeedleAction, wave: number): FeifeiNeedleOffset {
  const list = ORIGINS[action];
  return list?.length ? list[Math.max(0, wave) % list.length]! : FEIFEI_NEEDLE_DEFAULT_ORIGIN;
}

export const FEIFEI_NEEDLE_CARD_ACTION: Readonly<Record<string, FeifeiNeedleAction>> = {
  feifei_feizhen: 'shuriken',
  feifei_lianzhen: 'needle_combo',
  feifei_shouhua: 'needle_backhand',
  feifei_jianxue: 'needle_venom',
  feifei_yizhen: 'needle_pierce',
  feifei_buyaoguolai: 'needle_retreat',
  feifei_sazhen: 'needle_fan',
  feifei_zhenyu: 'needle_rain',
  feifei_quansale: 'needle_barrage',
};

export function isFeifeiNeedleAction(action: string): action is FeifeiNeedleAction {
  return ACTIONS.has(action);
}

export function feifeiNeedleFlightMs(action: FeifeiNeedleAction): number {
  return TIMINGS[action].flight;
}

export function feifeiNeedleGapMs(action: FeifeiNeedleAction): number {
  return TIMINGS[action].gap;
}

export function feifeiNeedleReleaseTimes(action: FeifeiNeedleAction): readonly number[] {
  return TIMINGS[action].releases;
}
