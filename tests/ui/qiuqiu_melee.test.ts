import { describe, expect, it } from 'vitest';
import { MELEE_LUNGE_PX, motionMeleePlan, motionMeleeSample, type MeleePoint } from '../../src/ui/qiuqiu-melee';
import { qiuqiuImpactDelay, qiuqiuMotionDuration, type QiuqiuAction } from '../../src/ui/qiuqiu-motion';
import { motionMs } from '../../src/ui/motion-speed';

/**
 * 近戰原地出招（使用者 2026-09-22 裁定）：角色留在自己的位置，往魔物方向衝一小段（最多 74 像素，
 * 比照舊版靜態演出）再退回。舊寫法是出手那一格直接瞬移到魔物身邊（488～698 像素），
 * 這裡的「位移不超過 74 像素」「第一格還在原位」在舊寫法下都會失敗。
 * 時間是 1.5 倍速後的毫秒（見 motion-speed.ts）。
 */
/** 球球的近戰規劃：跟戰鬥畫面一樣，時長與命中點取自球球自己的動作資料 */
function qiuqiuPlan(from: MeleePoint, target: MeleePoint, targetWidth: number, action: QiuqiuAction) {
  return motionMeleePlan(from, target, targetWidth, action, qiuqiuMotionDuration(action), qiuqiuImpactDelay(action));
}

describe('球球近戰原地出招', () => {
  it('往魔物方向最多衝 74 像素、上下不動，命中照動作自己的命中格', () => {
    const plan = qiuqiuPlan({ x: 100, y: 500 }, { x: 900, y: 450 }, 200, 'attack1');

    expect(MELEE_LUNGE_PX).toBe(74);
    expect(plan.dx).toBe(74);
    expect(plan.dy).toBe(0);
    expect(plan.approachMs).toBe(0);
    expect(plan.returnMs).toBe(0);
    expect(plan.impactMs).toBe(motionMs(70));
    expect(plan.totalMs).toBe(motionMs(300));
  });

  it('各招攻擊時間直接反映動作資料的逐格總和（1.5 倍速）', () => {
    const actions: QiuqiuAction[] = ['attack1', 'attack2', 'attack3', 'attack4', 'kick'];
    const strikeTimes = actions.map((action) => qiuqiuPlan(
      { x: 100, y: 500 },
      { x: 900, y: 500 },
      200,
      action,
    ).strikeMs);

    expect(strikeTimes).toEqual([300, 340, 420, 520, 580].map(motionMs));
  });

  it.each(['attack1', 'attack4', 'kick', 'combo_kick', 'palm_combo', 'ultimate_rush'] as const)
  ('%s 從原位出發、命中那一格衝到最前面，整段不超過 74 像素、收招回到原位', (action) => {
    const plan = qiuqiuPlan({ x: 100, y: 500 }, { x: 1000, y: 430 }, 200, action);
    expect(motionMeleeSample(plan, 0)).toMatchObject({ x: 0, y: 0, action, facing: 1, done: false });
    expect(motionMeleeSample(plan, plan.impactMs).x).toBeCloseTo(plan.dx, 6);
    for (let elapsed = 0; elapsed < plan.totalMs; elapsed += 1) {
      const sample = motionMeleeSample(plan, elapsed);
      expect(Math.abs(sample.x)).toBeLessThanOrEqual(MELEE_LUNGE_PX);
      expect(sample.y).toBe(0);
      expect(sample.done).toBe(false);
    }
    // 收招前已經退得差不多，收招當下回到原位
    expect(Math.abs(motionMeleeSample(plan, plan.totalMs - 1).x)).toBeLessThan(1);
    expect(motionMeleeSample(plan, plan.totalMs)).toEqual({ x: 0, y: 0, action: 'idle', facing: 1, done: true });
  });

  it('每一格（約 16 毫秒）的位移都小於舊版瞬移判定的 100 像素', () => {
    const plan = qiuqiuPlan({ x: 100, y: 500 }, { x: 1000, y: 500 }, 200, 'attack1');
    let last = 0;
    for (let elapsed = 0; elapsed <= plan.totalMs; elapsed += 16) {
      const { x } = motionMeleeSample(plan, elapsed);
      expect(Math.abs(x - last)).toBeLessThan(50);
      last = x;
    }
  });

  it('上一招還沒退回原位就被接手：從當下位移接著衝，不先跳回原位', () => {
    const plan = qiuqiuPlan({ x: 100, y: 500 }, { x: 900, y: 500 }, 200, 'attack2');
    expect(motionMeleeSample(plan, 0, 60).x).toBe(60);
    expect(motionMeleeSample(plan, plan.impactMs / 2, 60).x).toBeGreaterThan(60);
    expect(motionMeleeSample(plan, plan.impactMs, 60).x).toBeCloseTo(plan.dx, 6);
  });

  it('魔物很近時只衝到牠面前為止，不衝過頭', () => {
    const plan = qiuqiuPlan({ x: 100, y: 500 }, { x: 330, y: 500 }, 200, 'attack3');
    // 接觸點＝330 − (200 × 0.25 + 100) = 180，離原位 80 像素 → 仍以 74 為上限
    expect(plan.dx).toBe(74);
    const near = qiuqiuPlan({ x: 100, y: 500 }, { x: 290, y: 500 }, 200, 'attack3');
    expect(near.dx).toBe(40);
  });

  it('近左側敵人的接觸點不越過畫面，整段移動也不超出兩端', () => {
    const from = { x: 40, y: 500 };
    const plan = qiuqiuPlan(from, { x: 80, y: 500 }, 80, 'attack4');

    expect(plan.dx).toBe(-40);
    for (let elapsed = 0; elapsed <= plan.totalMs; elapsed += 10) {
      const sample = motionMeleeSample(plan, elapsed);
      expect(from.x + sample.x).toBeGreaterThanOrEqual(0);
      expect(sample.x).toBeGreaterThanOrEqual(plan.dx);
      expect(sample.x).toBeLessThanOrEqual(0);
    }
  });

  it('魔物在右側原位的左邊時往左衝，仍面向魔物出招', () => {
    const plan = qiuqiuPlan({ x: 1000, y: 500 }, { x: 700, y: 500 }, 200, 'attack1');

    expect(plan.dx).toBe(-74);
    expect(motionMeleeSample(plan, plan.impactMs)).toMatchObject({ action: 'attack1', facing: 1 });
    expect(motionMeleeSample(plan, plan.impactMs).x).toBeCloseTo(-74, 6);
    expect(motionMeleeSample(plan, plan.strikeMs)).toMatchObject({ x: 0, facing: 1, done: true });
  });

  it('不到一像素時省略移動，負時間則從零開始取樣', () => {
    const plan = qiuqiuPlan({ x: 200, y: 500 }, { x: 350.5, y: 500 }, 200, 'kick');

    expect(plan.approachMs).toBe(0);
    expect(plan.returnMs).toBe(0);
    expect(motionMeleeSample(plan, -100)).toEqual(motionMeleeSample(plan, 0));
    expect(motionMeleeSample(plan, plan.totalMs)).toEqual({
      x: 0,
      y: 0,
      action: 'idle',
      facing: 1,
      done: true,
    });
  });
});

describe('球球複合近戰規劃', () => {
  it('採用完整招式時間軸（1.5 倍速）', () => {
    const combo = qiuqiuPlan({ x: 100, y: 500 }, { x: 900, y: 500 }, 200, 'combo_kick');
    const rush = qiuqiuPlan({ x: 100, y: 500 }, { x: 900, y: 500 }, 200, 'ultimate_rush');

    expect(combo.strikeMs).toBe(motionMs(980));
    expect(combo.impactMs).toBe(motionMs(100));
    expect(combo.totalMs).toBe(motionMs(980));
    expect(rush.strikeMs).toBe(motionMs(1450));
    expect(rush.impactMs).toBe(motionMs(160));
  });
});

describe('共用近戰規劃', () => {
  it('噹噹沿同一前衝規則，保留自己的動作時長與命中點', () => {
    const plan = motionMeleePlan(
      { x: 100, y: 500 }, { x: 900, y: 450 }, 200,
      'shoulder', 820, 360,
    );
    expect(plan).toMatchObject({ dx: 74, dy: 0, action: 'shoulder', strikeMs: 820, impactMs: 360, totalMs: 820 });
    expect(motionMeleeSample(plan, 0)).toMatchObject({ x: 0, y: 0, action: 'shoulder', done: false });
    expect(motionMeleeSample(plan, 360)).toMatchObject({ x: 74, y: 0, action: 'shoulder', done: false });
    expect(motionMeleeSample(plan, 820)).toEqual({ x: 0, y: 0, action: 'idle', facing: 1, done: true });
  });
});
