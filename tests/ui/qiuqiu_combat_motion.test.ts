import { describe, expect, it } from 'vitest';
import {
  buildCombatMotionImpactPlan,
  buildFeifeiStatusImpactPlan,
  buildQiuqiuCombatImpactPlan,
  combatMotionPresentationDuration,
  combatMotionPresentationWait,
  combatMotionPresentationWaitAt,
  combatQiValue,
  extendConfirmedMotionWaves,
  LocalMotionPresentationQueue,
  motionPresentationMatches,
  qiuqiuConsumedStealth,
  qiuqiuEnemyBlocked,
  qiuqiuEnemyMotionAllowed,
  qiuqiuEnemyMotionHold,
  qiuqiuEnemyMotionKind,
  qiuqiuMotionBatchBoundaries,
  qiuqiuRestMotionAction,
  qiuqiuShouldPlayHurt,
  qiuqiuVictoryLinger,
  resolveCombatMotionPresentationWait,
  resizeMotionMeleeTrip,
  shouldResumeConfirmedMotion,
} from '../../src/ui/qiuqiu-combat-motion';
import { qiuqiuMotionDuration } from '../../src/ui/qiuqiu-motion';
import { companionMotionDuration } from '../../src/ui/companion-motion';
import { motionMeleeSample } from '../../src/ui/qiuqiu-melee';

describe('buildQiuqiuCombatImpactPlan', () => {
  it('只為指定 UID 排入真正命中的三段傷害', () => {
    const plan = buildQiuqiuCombatImpactPlan('combo_kick', [
      { uid: 12, amount: 3 },
      { uid: 99, amount: 40 },
      { uid: 12, amount: 4 },
      { uid: 12, amount: 5 },
    ], 12);

    expect(plan).toEqual([
      { at: 100, amount: 3, pendingAfter: 9 },
      { at: 270, amount: 4, pendingAfter: 5 },
      { at: 600, amount: 5, pendingAfter: 0 },
    ]);
  });

  it('依實際命中數截短節拍，不替未命中的同名怪造傷害', () => {
    expect(buildQiuqiuCombatImpactPlan('ultimate_rush', [
      { uid: 7, amount: 6 },
      { uid: 8, amount: 6 },
    ], 7)).toEqual([
      { at: 160, amount: 6, pendingAfter: 0 },
    ]);
  });

  it('手裏劍閃避補波保留零傷害段，待扣血量只計真傷害', () => {
    expect(buildQiuqiuCombatImpactPlan('shuriken', [
      { uid: 4, amount: 5 },
    ], 4, 1)).toEqual([
      { at: 350, amount: 0, pendingAfter: 5 },
      { at: 490, amount: 5, pendingAfter: 0 },
    ]);
  });

  it('升級亂舞沿用兩個真命中節拍', () => {
    expect(buildQiuqiuCombatImpactPlan('ultimate_storm', [
      { uid: 2, amount: 5 },
      { uid: 2, amount: 5 },
    ], 2)).toEqual([
      { at: 470, amount: 5, pendingAfter: 5 },
      { at: 730, amount: 5, pendingAfter: 0 },
    ]);
  });
});

describe('combatQiValue', () => {
  it('shows only Fengfeng qi and clamps the HUD value to 0..12', () => {
    expect(combatQiValue('fengfeng', 7)).toBe(7);
    expect(combatQiValue('fengfeng', -3)).toBe(0);
    expect(combatQiValue('fengfeng', 99)).toBe(12);
    expect(combatQiValue('fengfeng', undefined)).toBe(0);
    expect(combatQiValue('ninja', 7)).toBeUndefined();
    expect(combatQiValue('feifei', 7)).toBeUndefined();
  });
});

describe('qiuqiuEnemyMotionKind', () => {
  it.each([
    ['rat', 'rat'],
    ['rat_guard', 'rat'],
    ['black_ninja', 'ninja'],
    ['black_ninja_elite', 'ninja'],
    ['sparring_partner', 'ninja'],
  ] as const)('%s 使用相符的普通怪動作', (enemyId, kind) => {
    expect(qiuqiuEnemyMotionKind(enemyId)).toBe(kind);
  });

  it.each(['ninja_boss', 'rat_general', 'fox', 'crow'])('%s 不換成普通怪素材', (enemyId) => {
    expect(qiuqiuEnemyMotionKind(enemyId)).toBeUndefined();
  });
});

describe('qiuqiuRestMotionAction', () => {
  const poses = { idle: 'idle-pose', poison: 'poison-pose', belly: 'belly-pose', puff: 'puff-pose', stealth: 'stealth-pose' };

  it.each([
    ['idle-pose', 'idle'],
    ['poison-pose', 'poison'],
    ['belly-pose', 'belly'],
    ['puff-pose', 'puff'],
    ['stealth-pose', 'stealth'],
  ] as const)('%s 使用已有的逐格待機動作', (displayedPose, action) => {
    expect(qiuqiuRestMotionAction(displayedPose, poses, 'player', false)).toBe(action);
  });

  it.each(['hungry-pose', 'lazy-pose', 'dizzy-pose', 'power-pose', 'iron-pose', 'hurt-pose'])
  ('%s 保留原本狀態立繪', (displayedPose) => {
    expect(qiuqiuRestMotionAction(displayedPose, poses, 'player', false)).toBeUndefined();
  });

  it('勝負與倒下使用完整動作', () => {
    expect(qiuqiuRestMotionAction('hurt-pose', poses, 'won', false)).toBe('win');
    expect(qiuqiuRestMotionAction('idle-pose', poses, 'player', true)).toBe('defeat');
    expect(qiuqiuRestMotionAction('idle-pose', poses, 'lost', false)).toBe('defeat');
  });
});

describe('戰鬥動作整合判定', () => {
  it('只在動作模式且隊伍有已接入逐格的角色時啟用敵人逐格', () => {
    expect(qiuqiuEnemyMotionAllowed(true, ['ninja', 'feifei'])).toBe(true);
    expect(qiuqiuEnemyMotionAllowed(false, ['ninja'])).toBe(false);
    expect(qiuqiuEnemyMotionAllowed(true, ['feifei', 'dangdang'])).toBe(true);
    expect(qiuqiuEnemyMotionAllowed(true, ['dangdang', 'fengfeng'])).toBe(true);
    expect(qiuqiuEnemyMotionAllowed(true, ['fengfeng'])).toBe(true);
  });

  it('依同一 UID 的隱身差補齊每一個前置閃避', () => {
    expect(qiuqiuConsumedStealth(2, 0)).toBe(2);
    expect(qiuqiuConsumedStealth(1, 0)).toBe(1);
    expect(qiuqiuConsumedStealth(0, 0)).toBe(0);
    expect(qiuqiuConsumedStealth(1, 3)).toBe(0);

    expect(buildQiuqiuCombatImpactPlan('combo_kick', [
      { uid: 4, amount: 5 },
      { uid: 4, amount: 5 },
    ], 4, qiuqiuConsumedStealth(1, 0))).toEqual([
      { at: 100, amount: 0, pendingAfter: 10 },
      { at: 270, amount: 5, pendingAfter: 5 },
      { at: 600, amount: 5, pendingAfter: 0 },
    ]);
  });

  it('本張出招造成的反彈傷害不打斷動作，敵方傷害仍會播放受傷', () => {
    expect(qiuqiuShouldPlayHurt({
      reactionSeat: 0, beforeHp: 40, afterHp: 37, outgoingSeat: 0, hasOutgoingMotion: true,
    })).toBe(false);
    expect(qiuqiuShouldPlayHurt({
      reactionSeat: 0, beforeHp: 40, afterHp: 37, outgoingSeat: 1, hasOutgoingMotion: true,
    })).toBe(true);
    expect(qiuqiuShouldPlayHurt({
      reactionSeat: 0, beforeHp: 40, afterHp: 37, outgoingSeat: 0, hasOutgoingMotion: false,
    })).toBe(true);
  });

  it('同名敵人的格擋只看該 UID 的 block 差', () => {
    expect(qiuqiuEnemyBlocked(8, 3, 1)).toBe(5);
    expect(qiuqiuEnemyBlocked(8, 3, 0)).toBe(0);
    expect(qiuqiuEnemyBlocked(3, 8, 1)).toBe(0);
  });

  it('最後出招結束後保留完整勝利動作', () => {
    expect(qiuqiuVictoryLinger(true, ['ninja'])).toBe(qiuqiuMotionDuration('win'));
    expect(qiuqiuVictoryLinger(false, ['ninja'])).toBe(0);
    expect(qiuqiuVictoryLinger(true, ['feifei'])).toBe(companionMotionDuration('feifei', 'win'));
    expect(qiuqiuVictoryLinger(true, ['dangdang'])).toBe(companionMotionDuration('dangdang', 'win'));
    expect(qiuqiuVictoryLinger(true, ['fengfeng'])).toBe(companionMotionDuration('fengfeng', 'win'));
  });

  it('敵人逐格至少保留到素材動作播完', () => {
    expect(qiuqiuEnemyMotionHold('rat', 'attack', 650)).toBe(820);
    expect(qiuqiuEnemyMotionHold('ninja', 'attack', 650)).toBe(720);
    expect(qiuqiuEnemyMotionHold('rat', 'hurt', 650)).toBe(650);
  });
});

describe('連線批次動作邊界', () => {
  it('逐張保留命中與紀錄範圍，不把全部命中套到最後一張', () => {
    expect(qiuqiuMotionBatchBoundaries([
      { hitsLen: 4, logLen: 10 },
      { hitsLen: 6, logLen: 13 },
      { hitsLen: 9, logLen: 17 },
    ])).toEqual([
      { hitStart: 4, hitEnd: 6, logStart: 10, logEnd: 13 },
      { hitStart: 6, hitEnd: 9, logStart: 13, logEnd: 17 },
    ]);
  });

  it('依實際波數保留完整菲菲飛針與噹噹連拳時間', () => {
    expect(combatMotionPresentationDuration('feifei', 'shuriken', 3)).toBe(980);
    expect(combatMotionPresentationWait('feifei', 'shuriken', 3, 250)).toBe(760);
    expect(combatMotionPresentationDuration('qiuqiu', 'palm_combo', 1)).toBe(520);
    expect(combatMotionPresentationDuration('qiuqiu', 'palm_combo', 2)).toBe(760);
    expect(combatMotionPresentationDuration('qiuqiu', 'palm_combo', 3)).toBe(1000);
    expect(combatMotionPresentationDuration('dangdang', 'rapid_combo', 1)).toBe(520);
    expect(combatMotionPresentationDuration('dangdang', 'rapid_combo', 2)).toBe(760);
    expect(combatMotionPresentationDuration('dangdang', 'rapid_combo', 3)).toBe(1000);
    expect(combatMotionPresentationDuration('dangdang', 'punch', 3)).toBe(1020);
    expect(combatMotionPresentationWait('dangdang', 'punch', 3, 0)).toBe(1050);
  });

  it.each([
    [520, 220],
    [760, 460],
    [1000, 700],
  ])('確認 %i 毫秒近戰行程後，%i 毫秒命中仍停在敵前，收招時才回位', (duration, lastImpact) => {
    const trip = resizeMotionMeleeTrip({
      origin: { x: 100, y: 200 },
      plan: {
        dx: 300, dy: 0, approachMs: 0, strikeMs: 520, returnMs: 0,
        impactMs: 220, totalMs: 520, action: 'palm_combo' as const,
      },
    }, duration)!;
    expect(trip.plan.strikeMs).toBe(duration);
    expect(trip.plan.totalMs).toBe(duration);
    expect(motionMeleeSample(trip.plan, lastImpact).done).toBe(false);
    expect(motionMeleeSample(trip.plan, duration).done).toBe(true);
  });

  it('全體攻擊採所有目標的最大波數，不被最後一隻的一段計畫覆短', () => {
    let waves = 0;
    waves = extendConfirmedMotionWaves(waves, [{}, {}, {}]);
    waves = extendConfirmedMotionWaves(waves, [{}]);
    expect(waves).toBe(3);
    const trip = resizeMotionMeleeTrip({
      origin: { x: 0, y: 0 },
      plan: {
        dx: 300, dy: 0, approachMs: 0, strikeMs: 520, returnMs: 0,
        impactMs: 220, totalMs: 520, action: 'rapid_combo' as const,
      },
    }, combatMotionPresentationDuration('dangdang', 'rapid_combo', waves))!;
    expect(motionMeleeSample(trip.plan, 700).done).toBe(false);
    expect(motionMeleeSample(trip.plan, 1000).done).toBe(true);
  });

  it('排隊期間經過的時間會在步驟真正開始時扣掉', () => {
    let now = 1300;
    const wait = () => combatMotionPresentationWaitAt('feifei', 'shuriken', 3, 1000, now);
    now = 1700;
    expect(resolveCombatMotionPresentationWait(wait)).toBe(310);
  });

  it('本機預演已停但確認仍在延伸波次內時續播，不蓋掉下一張動作', () => {
    expect(shouldResumeConfirmedMotion({ playedHere: true, active: false, elapsed: 760, duration: 980 })).toBe(true);
    expect(shouldResumeConfirmedMotion({ playedHere: true, active: false, elapsed: 981, duration: 980 })).toBe(false);
    expect(shouldResumeConfirmedMotion({ playedHere: true, active: true, elapsed: 760, duration: 980 })).toBe(false);
    expect(shouldResumeConfirmedMotion({ playedHere: false, active: false, elapsed: 760, duration: 980 })).toBe(false);
    expect(shouldResumeConfirmedMotion({
      playedHere: true, active: false, elapsed: 760, duration: 980,
      presentationToken: 7, activePresentationToken: 8,
    })).toBe(false);
    expect(motionPresentationMatches(true, 7, 7)).toBe(true);
    expect(motionPresentationMatches(true, 7, 8)).toBe(false);
  });

  it('同種藥水的本機預演逐次消耗，確認批次不會重播 eat', () => {
    const ledger = new LocalMotionPresentationQueue<{ at: number }>();
    const key = 'potion:0:tea';
    ledger.record(key, { at: 10 });
    ledger.record(key, { at: 20 });
    expect(ledger.take(key)).toEqual({ at: 10 });
    expect(ledger.take(key)).toEqual({ at: 20 });
    expect(ledger.take(key)).toBeUndefined();
    ledger.record(key, { at: 30 });
    ledger.clear();
    expect(ledger.take(key)).toBeUndefined();
  });

  it('送出遭拒會精確丟掉該次預演，同鍵重試只取得新的代次', () => {
    const ledger = new LocalMotionPresentationQueue<{ token: number; at: number }>();
    const key = 'card:42';
    const stale = { token: 1, at: 100 };
    ledger.record(key, stale);
    expect(ledger.dropInFlight()).toBe(stale);

    const retry = { token: 2, at: 900 };
    ledger.record(key, retry);
    expect(ledger.take(key)).toBe(retry);
    expect(ledger.take(key)).toBeUndefined();
  });
});

describe('角色共用命中排程', () => {
  it('本機沒有比較快照時，以目前減益增量建立毒分身命中計畫', () => {
    const before = { hp: 9999, dead: false, debuff: 3 };
    const current = { hp: 9999, dead: false, debuff: 5 };
    expect(buildFeifeiStatusImpactPlan('clone', before, current)).toEqual([
      { at: 690, amount: 0, pendingAfter: 0 },
    ]);
    expect(buildFeifeiStatusImpactPlan('clone', before, before)).toEqual([]);
    expect(buildFeifeiStatusImpactPlan('clone', before, current,
      { hp: 9999, dead: false, debuff: 3 })).toEqual([]);
  });

  it('菲菲連針依 UID 保留真實多段傷害與前置閃避，不把同名敵人混入或截短分身重播', () => {
    expect(buildCombatMotionImpactPlan('feifei', 'needle_combo', [
      { uid: 7, amount: 2 },
      { uid: 8, amount: 99 },
      { uid: 7, amount: 2 },
      { uid: 7, amount: 2 },
      { uid: 7, amount: 2 },
    ], 7, 1)).toEqual([
      { at: 380, amount: 0, pendingAfter: 8 },
      { at: 540, amount: 2, pendingAfter: 6 },
      { at: 680, amount: 2, pendingAfter: 4 },
      { at: 820, amount: 2, pendingAfter: 2 },
      { at: 960, amount: 2, pendingAfter: 0 },
    ]);
  });

  it('所有針招都能為只有狀態變化的命中排程，一針斃命失敗時不硬造命中', () => {
    const before = { hp: 30, dead: false, debuff: 2 };
    const poisoned = { hp: 30, dead: false, debuff: 3 };
    expect(buildFeifeiStatusImpactPlan('needle_fan', before, poisoned)).toEqual([
      { at: 465, amount: 0, pendingAfter: 0 },
    ]);
    expect(buildFeifeiStatusImpactPlan('needle_pierce', before, before)).toEqual([]);
  });

  it('球球仍走原本衍生時間軸，抽共用模型不改命中節拍', () => {
    expect(buildCombatMotionImpactPlan('qiuqiu', 'ultimate_storm', [
      { uid: 2, amount: 7 }, { uid: 2, amount: 7 },
    ], 2)).toEqual([
      { at: 470, amount: 7, pendingAfter: 7 },
      { at: 730, amount: 7, pendingAfter: 0 },
    ]);
  });

  it('噹噹多段拳擊依指定 UID 排程，不混入同名敵人', () => {
    expect(buildCombatMotionImpactPlan('dangdang', 'punch', [
      { uid: 7, amount: 3 }, { uid: 8, amount: 99 }, { uid: 7, amount: 3 },
    ], 7)).toEqual([
      { at: 300, amount: 3, pendingAfter: 3 },
      { at: 440, amount: 3, pendingAfter: 0 },
    ]);
  });

  it('封封雙段劍只使用指定 UID 的兩筆真命中', () => {
    expect(buildCombatMotionImpactPlan('fengfeng', 'double_slash', [
      { uid: 7, amount: 4 }, { uid: 8, amount: 99 }, { uid: 7, amount: 5 },
    ], 7)).toEqual([
      { at: 220, amount: 4, pendingAfter: 5 },
      { at: 550, amount: 5, pendingAfter: 0 },
    ]);
  });
});
