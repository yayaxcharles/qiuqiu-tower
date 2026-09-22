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
