import { describe, expect, it } from 'vitest';
import {
  FEIFEI_NEEDLE_CARD_ACTION,
  feifeiNeedleFlightMs,
  feifeiNeedleGapMs,
  feifeiNeedleReleaseTimes,
  isFeifeiNeedleAction,
  type FeifeiNeedleAction,
} from '../../src/ui/feifei-needle-patterns';

const timings: ReadonlyArray<readonly [FeifeiNeedleAction, readonly number[], number, number]> = [
  ['shuriken', [285], 170, 140],
  ['storm', [285, 385], 170, 140],
  ['needle_combo', [220, 380], 160, 140],
  ['needle_backhand', [260], 150, 140],
  ['needle_venom', [360], 210, 140],
  ['needle_pierce', [420], 100, 140],
  ['needle_retreat', [260], 180, 140],
  ['needle_fan', [285], 180, 140],
  ['needle_rain', [350], 400, 140],
  ['needle_barrage', [350], 220, 140],
];

describe('菲菲飛針招式資料', () => {
  it.each(timings)('%s 有固定離手、飛行與額外波距時間', (action, releases, flight, gap) => {
    expect(feifeiNeedleReleaseTimes(action)).toEqual(releases);
    expect(feifeiNeedleFlightMs(action)).toBe(flight);
    expect(feifeiNeedleGapMs(action)).toBe(gap);
  });

  it('辨識十種飛針招式且拒絕其他字串', () => {
    expect(timings.every(([action]) => isFeifeiNeedleAction(action))).toBe(true);
    expect(isFeifeiNeedleAction('attack1')).toBe(false);
    expect(isFeifeiNeedleAction('')).toBe(false);
  });

  it('把九張牌映射到各自投射物，不合併成通用飛針或針雨', () => {
    expect(FEIFEI_NEEDLE_CARD_ACTION).toEqual({
      feifei_feizhen: 'shuriken',
      feifei_lianzhen: 'needle_combo',
      feifei_shouhua: 'needle_backhand',
      feifei_jianxue: 'needle_venom',
      feifei_yizhen: 'needle_pierce',
      feifei_buyaoguolai: 'needle_retreat',
      feifei_sazhen: 'needle_fan',
      feifei_zhenyu: 'needle_rain',
      feifei_quansale: 'needle_barrage',
    });
  });
});
