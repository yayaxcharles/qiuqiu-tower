import { describe, expect, it } from 'vitest';
import {
  qiuqiuChoreographyDuration,
  qiuqiuChoreographyPose,
} from '../../src/ui/qiuqiu-choreography';
import { motionMs } from '../../src/ui/motion-speed';

// 分段時間寫的是素材原速的毫秒，播放時整體 1.5 倍速，一律過 motionMs() 換算（見 motion-speed.ts）

describe('球球複合招式時間軸', () => {
  it('連環踢完整播放連段與迴旋踢兩段', () => {
    expect(qiuqiuChoreographyDuration('combo_kick')).toBe(motionMs(980));
    expect(qiuqiuChoreographyPose('combo_kick', motionMs(400) - 1)).toMatchObject({ action: 'combo_kick' });
    expect(qiuqiuChoreographyPose('combo_kick', motionMs(400))).toEqual({ action: 'kick', elapsed: 0 });
    expect(qiuqiuChoreographyPose('combo_kick', motionMs(980) - 1))
      .toEqual({ action: 'kick', elapsed: motionMs(980) - 1 - motionMs(400) });
  });

  it('影分身奧義由本體結印指揮，攻擊由兩側分身演出', () => {
    expect(qiuqiuChoreographyPose('ultimate_clone', 0)).toEqual({ action: 'seal', elapsed: 0 });
    for (const at of [280, 460, 760, 1120, 1200]) {
      expect(qiuqiuChoreographyPose('ultimate_clone', motionMs(at))).toEqual({ action: 'seal', elapsed: motionMs(280) });
    }
    expect(qiuqiuChoreographyPose('clone', motionMs(180))?.action).toBe('seal');
    expect(qiuqiuChoreographyPose('clone_duo', motionMs(420))?.action).toBe('seal');
    expect(qiuqiuChoreographyDuration('ultimate_clone')).toBe(motionMs(1800));
  });

  it('手裏劍風暴只演兩波並在約一秒（1.5 倍速後 0.7 秒）完成', () => {
    expect(qiuqiuChoreographyPose('ultimate_storm', 0)).toEqual({ action: 'seal', elapsed: 0 });
    expect(qiuqiuChoreographyPose('ultimate_storm', motionMs(300))).toEqual({ action: 'storm', elapsed: 0 });
    expect(qiuqiuChoreographyPose('ultimate_storm', motionMs(940))).toEqual({ action: 'shuriken', elapsed: motionMs(690) });
    expect(qiuqiuChoreographyDuration('ultimate_storm')).toBe(motionMs(1050));
  });

  it('突進奧義的主角姿勢涵蓋三段突進與收尾爪擊', () => {
    expect(qiuqiuChoreographyPose('ultimate_rush', motionMs(160))).toEqual({ action: 'rush', elapsed: 0 });
    expect(qiuqiuChoreographyPose('ultimate_rush', motionMs(640))).toEqual({ action: 'rush', elapsed: 0 });
    expect(qiuqiuChoreographyPose('ultimate_rush', motionMs(880))).toEqual({ action: 'attack4', elapsed: 0 });
    expect(qiuqiuChoreographyDuration('ultimate_rush')).toBe(motionMs(1450));
  });
});
