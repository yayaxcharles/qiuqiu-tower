import { describe, expect, it } from 'vitest';
import { motionMeleePlan, motionMeleeSample, qiuqiuMeleePlan, qiuqiuMeleeSample } from '../../src/ui/qiuqiu-melee';
import type { QiuqiuAction } from '../../src/ui/qiuqiu-motion';

describe('球球近戰瞬移', () => {
  it('依敵人腳底與寬度停在左側接觸位置', () => {
    const plan = qiuqiuMeleePlan({ x: 100, y: 500 }, { x: 900, y: 450 }, 200, 'attack1');

    expect(plan.dx).toBe(650);
    expect(plan.dy).toBe(-50);
    expect(plan.approachMs).toBe(0);
    expect(plan.returnMs).toBe(0);
    expect(plan.impactMs).toBe(70);
    expect(plan.totalMs).toBe(300);
  });

  it('各招攻擊時間直接反映動作資料的逐格總和', () => {
    const actions: QiuqiuAction[] = ['attack1', 'attack2', 'attack3', 'attack4', 'kick'];
    const strikeTimes = actions.map((action) => qiuqiuMeleePlan(
      { x: 100, y: 500 },
      { x: 900, y: 500 },
      200,
      action,
    ).strikeMs);

    expect(strikeTimes).toEqual([300, 340, 420, 520, 580]);
  });

  it('第一格就到目標身旁出招，命中時仍在接觸位置', () => {
    const plan = qiuqiuMeleePlan({ x: 100, y: 500 }, { x: 700, y: 500 }, 200, 'kick');
    const arrived = qiuqiuMeleeSample(plan, 0);
    const impact = qiuqiuMeleeSample(plan, plan.impactMs);

    expect(arrived).toMatchObject({ x: plan.dx, y: plan.dy, action: 'kick', facing: 1, done: false });
    expect(impact).toMatchObject({ x: plan.dx, y: plan.dy, action: 'kick', facing: 1, done: false });
  });

  it('收招前留在魔物身旁，結束當下直接回原位', () => {
    const plan = qiuqiuMeleePlan({ x: 100, y: 500 }, { x: 700, y: 440 }, 200, 'attack2');
    const lastStrike = qiuqiuMeleeSample(plan, plan.strikeMs - 0.001);
    const done = qiuqiuMeleeSample(plan, plan.strikeMs);

    expect(lastStrike).toMatchObject({ x: plan.dx, y: plan.dy, action: 'attack2', facing: 1, done: false });
    expect(done).toEqual({ x: 0, y: 0, action: 'idle', facing: 1, done: true });
  });

  it('不同敵人位置會產生不同接觸終點', () => {
    const near = qiuqiuMeleePlan({ x: 100, y: 500 }, { x: 600, y: 500 }, 200, 'attack3');
    const far = qiuqiuMeleePlan({ x: 100, y: 500 }, { x: 900, y: 500 }, 200, 'attack3');

    expect(near.dx).toBe(350);
    expect(far.dx).toBe(650);
    expect(near.dx).not.toBe(far.dx);
    expect(near.totalMs).toBe(far.totalMs);
    for (const plan of [near, far]) for (let elapsed = 0; elapsed <= plan.totalMs; elapsed += 10) {
      expect(qiuqiuMeleeSample(plan, elapsed).action).not.toBe('run');
    }
  });

  it('近左側敵人的接觸點不越過畫面，整段移動也不超出兩端', () => {
    const from = { x: 40, y: 500 };
    const plan = qiuqiuMeleePlan(from, { x: 80, y: 500 }, 80, 'attack4');

    expect(plan.dx).toBe(-40);
    for (let elapsed = 0; elapsed <= plan.totalMs; elapsed += 10) {
      const sample = qiuqiuMeleeSample(plan, elapsed);
      expect(from.x + sample.x).toBeGreaterThanOrEqual(0);
      expect(sample.x).toBeGreaterThanOrEqual(plan.dx);
      expect(sample.x).toBeLessThanOrEqual(0);
    }
  });

  it('從敵人右側瞬移到左側後，仍面向魔物出招', () => {
    const plan = qiuqiuMeleePlan({ x: 1000, y: 500 }, { x: 700, y: 500 }, 200, 'attack1');

    expect(qiuqiuMeleeSample(plan, 0)).toMatchObject({ x: plan.dx, action: 'attack1', facing: 1 });
    expect(qiuqiuMeleeSample(plan, plan.strikeMs)).toMatchObject({ x: 0, facing: 1, done: true });
  });

  it('不到一像素時省略移動，負時間則從零開始取樣', () => {
    const plan = qiuqiuMeleePlan({ x: 200, y: 500 }, { x: 350.5, y: 500 }, 200, 'kick');

    expect(plan.approachMs).toBe(0);
    expect(plan.returnMs).toBe(0);
    expect(qiuqiuMeleeSample(plan, -100)).toEqual(qiuqiuMeleeSample(plan, 0));
    expect(qiuqiuMeleeSample(plan, plan.totalMs)).toEqual({
      x: 0,
      y: 0,
      action: 'idle',
      facing: 1,
      done: true,
    });
  });
});

describe('球球複合近戰規劃', () => {
  it('採用完整招式時間軸', () => {
    const combo = qiuqiuMeleePlan({ x: 100, y: 500 }, { x: 900, y: 500 }, 200, 'combo_kick');
    const rush = qiuqiuMeleePlan({ x: 100, y: 500 }, { x: 900, y: 500 }, 200, 'ultimate_rush');

    expect(combo.strikeMs).toBe(980);
    expect(combo.impactMs).toBe(100);
    expect(combo.totalMs).toBe(980);
    expect(rush.strikeMs).toBe(1450);
    expect(rush.impactMs).toBe(160);
  });
});

describe('共用近戰規劃', () => {
  it('噹噹沿同一腳底接觸規則，保留自己的動作時長與命中點', () => {
    const plan = motionMeleePlan(
      { x: 100, y: 500 }, { x: 900, y: 450 }, 200,
      'shoulder', 820, 360,
    );
    expect(plan).toMatchObject({ dx: 650, dy: -50, action: 'shoulder', strikeMs: 820, impactMs: 360, totalMs: 820 });
    expect(motionMeleeSample(plan, 360)).toMatchObject({ x: 650, y: -50, action: 'shoulder', done: false });
    expect(motionMeleeSample(plan, 820)).toEqual({ x: 0, y: 0, action: 'idle', facing: 1, done: true });
  });
});
