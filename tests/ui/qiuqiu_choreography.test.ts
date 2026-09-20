import { describe, expect, it } from 'vitest';
import {
  qiuqiuChoreographyDuration,
  qiuqiuChoreographyPose,
} from '../../src/ui/qiuqiu-choreography';

describe('球球複合招式時間軸', () => {
  it('連環踢完整播放連段與迴旋踢兩段', () => {
    expect(qiuqiuChoreographyDuration('combo_kick')).toBe(980);
    expect(qiuqiuChoreographyPose('combo_kick', 399)).toMatchObject({ action: 'combo_kick' });
    expect(qiuqiuChoreographyPose('combo_kick', 400)).toEqual({ action: 'kick', elapsed: 0 });
    expect(qiuqiuChoreographyPose('combo_kick', 979)).toEqual({ action: 'kick', elapsed: 579 });
  });

  it('影分身奧義由本體結印指揮，攻擊由兩側分身演出', () => {
    expect(qiuqiuChoreographyPose('ultimate_clone', 0)).toEqual({ action: 'seal', elapsed: 0 });
    for (const at of [280, 460, 760, 1120, 1200]) {
      expect(qiuqiuChoreographyPose('ultimate_clone', at)).toEqual({ action: 'seal', elapsed: 280 });
    }
    expect(qiuqiuChoreographyPose('clone', 180)?.action).toBe('seal');
    expect(qiuqiuChoreographyPose('clone_duo', 420)?.action).toBe('seal');
    expect(qiuqiuChoreographyDuration('ultimate_clone')).toBe(1800);
  });

  it('手裏劍風暴只演兩波並在約一秒完成', () => {
    expect(qiuqiuChoreographyPose('ultimate_storm', 0)).toEqual({ action: 'seal', elapsed: 0 });
    expect(qiuqiuChoreographyPose('ultimate_storm', 300)).toEqual({ action: 'storm', elapsed: 0 });
    expect(qiuqiuChoreographyPose('ultimate_storm', 940)).toEqual({ action: 'shuriken', elapsed: 690 });
    expect(qiuqiuChoreographyDuration('ultimate_storm')).toBe(1050);
  });

  it('突進奧義的主角姿勢涵蓋三段突進與收尾爪擊', () => {
    expect(qiuqiuChoreographyPose('ultimate_rush', 160)).toEqual({ action: 'rush', elapsed: 0 });
    expect(qiuqiuChoreographyPose('ultimate_rush', 640)).toEqual({ action: 'rush', elapsed: 0 });
    expect(qiuqiuChoreographyPose('ultimate_rush', 880)).toEqual({ action: 'attack4', elapsed: 0 });
    expect(qiuqiuChoreographyDuration('ultimate_rush')).toBe(1450);
  });
});
