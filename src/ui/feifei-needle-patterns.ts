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

const TIMINGS: Readonly<Record<FeifeiNeedleAction, NeedleTiming>> = {
  shuriken: { releases: [285], flight: 170, gap: 140 },
  storm: { releases: [285, 385], flight: 170, gap: 140 },
  needle_combo: { releases: [220, 380], flight: 160, gap: 140 },
  needle_backhand: { releases: [260], flight: 150, gap: 140 },
  needle_venom: { releases: [360], flight: 210, gap: 140 },
  needle_pierce: { releases: [420], flight: 100, gap: 140 },
  needle_retreat: { releases: [260], flight: 180, gap: 140 },
  needle_fan: { releases: [285], flight: 180, gap: 140 },
  needle_rain: { releases: [350], flight: 400, gap: 140 },
  needle_barrage: { releases: [350], flight: 220, gap: 140 },
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
