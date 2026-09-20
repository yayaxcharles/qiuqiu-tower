import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import motionData from '../../src/ui/feifei-motion-data.json';
import needleMotionData from '../../src/ui/feifei-needle-motion-data.json';
import dangdangMotionData from '../../src/ui/dangdang-motion-data.json';
import dangdangAttackMotionData from '../../src/ui/dangdang-attack-motion-data.json';
import fengfengMotionData from '../../src/ui/fengfeng-motion-data.json';
import fengfengAttackMotionData from '../../src/ui/fengfeng-attack-motion-data.json';
import dangdangPlan from '../../docs/dangdang-motion-plan.json';
import fengfengPlan from '../../docs/fengfeng-motion-plan.json';
import { cardById } from '../../src/content/cards';
import { visibleCanvasRect } from './motion_test_geometry';
import {
  FEIFEI_CLONE_TIMING,
  companionCardAction,
  companionImpactTimes,
  companionMotionDuration,
  companionMotionReady,
  companionIsMelee,
  companionRestMotionAction,
  createCompanionMotionActor,
  preloadCompanionMotion,
} from '../../src/ui/companion-motion';

type DrawCall = [CanvasImageSource, number, number, number, number, number, number, number, number];

class FakeContext {
  draws: DrawCall[] = [];
  clearRect(): void {}
  setTransform(): void {}
  drawImage(...args: DrawCall): void { this.draws.push(args); }
}

class FakeCanvas {
  width = 0;
  height = 0;
  className = '';
  readonly style = { width: '', height: '', bottom: '', transform: '' };
  readonly context = new FakeContext();
  readonly attrs = new Map<string, string>();
  getContext(kind: string): FakeContext | null { return kind === '2d' ? this.context : null; }
  setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
}

class FakeImage {
  static sources: string[] = [];
  src = '';
  async decode(): Promise<void> { FakeImage.sources.push(this.src); }
}

let nextRaf = 1;
let rafs = new Map<number, FrameRequestCallback>();
let canvases: FakeCanvas[] = [];

function step(time: number): void {
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
}

function lastDraw(): DrawCall {
  const draw = canvases.at(-1)?.context.draws.at(-1);
  if (!draw) throw new Error('菲菲沒有畫出任何影格');
  return draw;
}

beforeEach(() => {
  FakeImage.sources = [];
  nextRaf = 1;
  rafs = new Map();
  canvases = [];
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`非預期元素：${tag}`);
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas;
    },
  });
  vi.stubGlobal('window', {
    devicePixelRatio: 3,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = nextRaf++;
      rafs.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => { rafs.delete(id); },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('同伴持續狀態的緩慢呼吸', () => {
  it.each(['feifei', 'dangdang', 'fengfeng'] as const)('%s 中毒保留不適姿勢，不反覆抖動或停住', (kind) => {
    const actor = createCompanionMotionActor(kind, { action: 'poison' });
    const data = { feifei: motionData, dangdang: dangdangMotionData, fengfeng: fengfengMotionData }[kind];
    const frame = data.actions.poison.frames[3]!;
    step(0);
    const start = lastDraw();
    for (const elapsed of [180, 400, 1000, 1550, 3100, 6200, 9300, 12400]) {
      step(elapsed);
      const draw = lastDraw();
      const [dx, dy, , dh] = visibleCanvasRect(actor.element, [draw[5], draw[6], draw[7], draw[8]]);
      expect(draw.slice(1, 5)).toEqual(frame.rect);
      expect(dx).toBe(start[5]);
      expect(dy + dh * frame.pivot[1]! / frame.rect[3]!).toBeCloseTo(actor.foot.y, 6);
      expect(rafs.size).toBe(1);
      if (elapsed === 3100 || elapsed === 9300) expect(dh).toBeGreaterThan(start[8] * 1.02);
      if (elapsed === 6200 || elapsed === 12400) expect(dh).toBeCloseTo(start[8], 6);
    }
    actor.dispose();
  });
});

describe('菲菲卡牌與命中節奏', () => {
  it('九張針牌各自使用指定整身動作', () => {
    expect([
      'feifei_feizhen', 'feifei_lianzhen', 'feifei_shouhua',
      'feifei_jianxue', 'feifei_yizhen', 'feifei_buyaoguolai',
      'feifei_sazhen', 'feifei_zhenyu', 'feifei_quansale',
    ].map((id) => companionCardAction('feifei', id))).toEqual([
      'shuriken', 'needle_combo', 'needle_backhand',
      'needle_venom', 'needle_pierce', 'needle_retreat',
      'needle_fan', 'needle_rain', 'needle_barrage',
    ]);
    expect(companionCardAction('feifei', 'feifei_buyaoguolai', {
      cardType: '攻擊', hasBlock: true,
    })).toBe('needle_retreat');
    expect(companionCardAction('feifei', 'feifei_fenshen')).toBe('clone');
  });

  it('菲菲牌面已改成針術的共用攻擊使用相符的投針動作', () => {
    expect([
      'paozhao', 'roubao', 'lianhuan', 'huixuan', 'dieda',
      'bengquan', 'jiuweiquan', 'zuiquan', 'caiweiba', 'ehou',
    ].map((id) => companionCardAction('feifei', id, {
      poseFamily: id === 'huixuan' || id === 'lianhuan' || id === 'caiweiba' ? 'kick'
        : id === 'bengquan' || id === 'jiuweiquan' || id === 'zuiquan' || id === 'ehou' ? 'punch'
          : 'claw',
      cardType: '攻擊',
    }))).toEqual([
      'shuriken', 'needle_combo', 'needle_combo', 'needle_fan', 'needle_barrage',
      'needle_pierce', 'needle_barrage', 'needle_fan', 'needle_venom', 'needle_venom',
    ]);
  });

  it('尚缺專屬投射物的毒丸、毒砂與絆索不會誤播拳腳', () => {
    expect(companionCardAction('feifei', 'maoqiudan', { poseFamily: 'claw', cardType: '攻擊' })).toBeUndefined();
    expect(companionCardAction('feifei', 'tieshazhang', { cardType: '攻擊' })).toBeUndefined();
    expect(companionCardAction('feifei', 'qinna', { poseFamily: 'punch', cardType: '攻擊' })).toBeUndefined();
  });

  it('其餘共用卡只按爪擊種類接近，非針術攻擊保留既有演出', () => {
    expect(companionCardAction('feifei', 'sanjo', { poseFamily: 'claw', cardType: '攻擊' })).toBe('attack1');
    expect(companionCardAction('feifei', 'tietou', { poseFamily: 'dash', cardType: '攻擊' })).toBeUndefined();
    expect(companionCardAction('feifei', 'feifei_moyao', { cardType: '技能' })).toBe('seal');
    expect(companionCardAction('feifei', 'feifei_tuikai', { cardType: '技能', hasBlock: true })).toBe('guard');
  });

  it('所有針招的命中點都由各自離手時間加飛行時間得到，額外波次沿用指定間隔', () => {
    expect(companionImpactTimes('feifei', 'shuriken', 3)).toEqual([455, 595, 735]);
    expect(companionImpactTimes('feifei', 'storm', 4)).toEqual([455, 555, 695, 835]);
    expect(companionImpactTimes('feifei', 'needle_combo', 4)).toEqual([380, 540, 680, 820]);
    expect(companionImpactTimes('feifei', 'needle_backhand', 1)).toEqual([410]);
    expect(companionImpactTimes('feifei', 'needle_venom', 1)).toEqual([570]);
    expect(companionImpactTimes('feifei', 'needle_pierce', 1)).toEqual([520]);
    expect(companionImpactTimes('feifei', 'needle_retreat', 1)).toEqual([440]);
    expect(companionImpactTimes('feifei', 'needle_fan', 1)).toEqual([465]);
    expect(companionImpactTimes('feifei', 'needle_rain', 1)).toEqual([750]);
    expect(companionImpactTimes('feifei', 'needle_barrage', 1)).toEqual([570]);
    expect(companionImpactTimes('feifei', 'attack1', 1)).toEqual([340]);
    expect(companionImpactTimes('feifei', 'kick', 1)).toEqual([300]);
    expect(companionImpactTimes('feifei', 'clone', 1)).toEqual([690]);
    expect(FEIFEI_CLONE_TIMING).toEqual({ appear: 180, begin: 350, impact: 690, end: 1240 });
  });

  it('靜態專屬狀態不會被待機畫布蓋掉', () => {
    const poses = { idle: 'hero/ninja', poison: 'hero/ninja_choke' };
    expect(companionRestMotionAction('feifei', poses.idle, poses, 'player', false)).toBe('idle');
    expect(companionRestMotionAction('feifei', poses.poison, poses, 'player', false)).toBe('poison');
    for (const pose of ['lazy', 'dizzy', 'belly', 'puff', 'stealth', 'power', 'iron']) {
      expect(companionRestMotionAction('feifei', pose, poses, 'player', false)).toBeUndefined();
    }
    expect(companionRestMotionAction('feifei', poses.idle, poses, 'won', false)).toBe('win');
    expect(companionRestMotionAction('feifei', poses.idle, poses, 'player', true)).toBe('defeat');
  });
});

describe('噹噹卡牌與命中節奏', () => {
  it('逐張覆蓋 31 張專屬牌與既定共用牌群，不把負擔牌硬套動作', () => {
    const revised: Readonly<Record<string, string>> = {
      dangdang_fanshou: 'rapid_combo', dangdang_bengshan: 'heavy_palm',
      dangdang_sheshen: 'reckless_bash', roubao: 'rapid_combo',
      shierlian: 'rapid_combo', luanwu: 'sweep_combo',
      lianhuan: 'sweep_combo', wangming: 'reckless_bash',
    };
    const own = dangdangPlan.heroSpecificCardToAction as Record<string, { action: string }>;
    expect(Object.keys(own)).toHaveLength(31);
    for (const [cardId, expected] of Object.entries(own)) {
      expect(cardById[cardId]?.hero, `${cardId} 必須是真實噹噹牌`).toBe('dangdang');
      expect(companionCardAction('dangdang', cardId), cardId).toBe(revised[cardId] ?? expected.action);
    }
    const shared = dangdangPlan.sharedCardGroups as Record<string, unknown>;
    for (const [action, ids] of Object.entries(shared)) {
      if (!Array.isArray(ids)) continue;
      for (const cardId of ids) {
        const expected = revised[cardId] ?? (action === 'no_motion_unplayable_burden' ? undefined : action);
        expect(cardById[cardId], `${cardId} 必須是真實共用牌`).toBeDefined();
        expect(companionCardAction('dangdang', cardId), cardId).toBe(expected);
      }
    }
  });

  it('專屬拳掌、防禦、蓄勢、震地與衝撞都使用指定整身動作', () => {
    expect(companionCardAction('dangdang', 'dangdang_zhengquan')).toBe('punch');
    expect(companionCardAction('dangdang', 'dangdang_xieli')).toBe('palm');
    expect(companionCardAction('dangdang', 'dangdang_jiapan')).toBe('guard');
    expect(companionCardAction('dangdang', 'dangdang_jieliqi')).toBe('focus');
    expect(companionCardAction('dangdang', 'dangdang_zhendang')).toBe('ground_slam');
    expect(companionCardAction('dangdang', 'dangdang_tieshan')).toBe('shoulder');
    expect(companionCardAction('dangdang', 'dangdang_huima')).toBe('counter');
    expect(companionCardAction('dangdang', 'huixuan')).toBe('kick');
    expect(companionCardAction('dangdang', 'slime_card')).toBeUndefined();
    expect(companionCardAction('dangdang', 'future_unknown_card', { cardType: '攻擊' })).toBeUndefined();
  });

  it('多段拳掌、重掌、掃腿與捨身撞使用新整身動作', () => {
    expect(companionCardAction('dangdang', 'dangdang_fanshou')).toBe('rapid_combo');
    expect(companionCardAction('dangdang', 'roubao')).toBe('rapid_combo');
    expect(companionCardAction('dangdang', 'shierlian')).toBe('rapid_combo');
    expect(companionCardAction('dangdang', 'dangdang_bengshan')).toBe('heavy_palm');
    expect(companionCardAction('dangdang', 'luanwu')).toBe('sweep_combo');
    expect(companionCardAction('dangdang', 'lianhuan')).toBe('sweep_combo');
    expect(companionCardAction('dangdang', 'dangdang_sheshen')).toBe('reckless_bash');
    expect(companionCardAction('dangdang', 'wangming')).toBe('reckless_bash');
  });

  it('只有拳掌踢靠與反擊貼近指定 UID，震地與防禦保持原位', () => {
    for (const action of ['punch', 'palm', 'kick', 'shoulder', 'counter'] as const) {
      expect(companionIsMelee('dangdang', action)).toBe(true);
    }
    expect(companionIsMelee('dangdang', 'ground_slam')).toBe(false);
    expect(companionIsMelee('dangdang', 'guard')).toBe(false);
    expect(companionIsMelee('feifei', 'attack1')).toBe(true);
  });

  it('命中點讀取噹噹 metadata，多段只延展既有拳擊節拍', () => {
    expect(companionImpactTimes('dangdang', 'punch', 3)).toEqual([300, 440, 580]);
    expect(companionImpactTimes('dangdang', 'palm', 1)).toEqual([340]);
    expect(companionImpactTimes('dangdang', 'kick', 1)).toEqual([300]);
    expect(companionImpactTimes('dangdang', 'shoulder', 1)).toEqual([360]);
    expect(companionImpactTimes('dangdang', 'counter', 1)).toEqual([360]);
    expect(companionImpactTimes('dangdang', 'ground_slam', 1)).toEqual([430]);
    expect(companionImpactTimes('dangdang', 'guard', 1)).toEqual([]);
  });

  it('三拍新招只播放真實一、二或三擊，再接同一段收勢', () => {
    expect(companionImpactTimes('dangdang', 'rapid_combo', 1)).toEqual([220]);
    expect(companionImpactTimes('dangdang', 'rapid_combo', 2)).toEqual([220, 460]);
    expect(companionImpactTimes('dangdang', 'rapid_combo', 3)).toEqual([220, 460, 700]);
    expect(companionMotionDuration('dangdang', 'rapid_combo', 1)).toBe(520);
    expect(companionMotionDuration('dangdang', 'rapid_combo', 2)).toBe(760);
    expect(companionMotionDuration('dangdang', 'rapid_combo', 3)).toBe(1000);

    const actor = createCompanionMotionActor('dangdang', { action: 'rapid_combo' });
    actor.play('rapid_combo', { elapsed: 290, waves: 1 });
    expect(lastDraw().slice(1, 5)).toEqual(dangdangAttackMotionData.actions.rapid_combo.frames[10]!.rect);
    actor.play('rapid_combo', { elapsed: 530, waves: 2 });
    expect(lastDraw().slice(1, 5)).toEqual(dangdangAttackMotionData.actions.rapid_combo.frames[10]!.rect);
    actor.dispose();
  });

  it('沒有逐格的長駐狀態保留噹噹靜態圖', () => {
    const poses = { idle: 'hero/ninja', poison: 'hero/ninja_choke' };
    expect(companionRestMotionAction('dangdang', poses.idle, poses, 'player', false)).toBe('idle');
    expect(companionRestMotionAction('dangdang', poses.poison, poses, 'player', false)).toBe('poison');
    for (const pose of ['hurt', 'lazy', 'dizzy', 'belly', 'puff', 'stealth', 'power', 'iron']) {
      expect(companionRestMotionAction('dangdang', pose, poses, 'player', false)).toBeUndefined();
    }
    expect(companionRestMotionAction('dangdang', poses.idle, poses, 'won', false)).toBe('win');
    expect(companionRestMotionAction('dangdang', poses.idle, poses, 'player', true)).toBe('defeat');
  });
});

describe('封封卡牌、近戰與收劍節奏', () => {
  it('32張專屬牌逐張使用既定整身動作', () => {
    const revised: Readonly<Record<string, string>> = {
      fengfeng_huibu: 'retreat_thrust', fengfeng_duanliu: 'qi_cleave',
      fengfeng_kaishan: 'earth_split', fengfeng_pozhen: 'qi_cleave',
    };
    const own = fengfengPlan.heroSpecificCardToAction as Record<string, { action: string }>;
    expect(Object.keys(own)).toHaveLength(32);
    for (const [cardId, expected] of Object.entries(own)) {
      expect(cardById[cardId]?.hero, `${cardId} 必須是真實封封牌`).toBe('fengfeng');
      expect(companionCardAction('fengfeng', cardId), cardId).toBe(revised[cardId] ?? expected.action);
    }
  });

  it('三拍連刀、氣斬、開山與回步刺使用新整身動作', () => {
    expect(companionCardAction('fengfeng', 'liandao', { cardType: '攻擊' })).toBe('sword_combo');
    expect(companionCardAction('fengfeng', 'fengfeng_duanliu')).toBe('qi_cleave');
    expect(companionCardAction('fengfeng', 'fengfeng_pozhen')).toBe('qi_cleave');
    expect(companionCardAction('fengfeng', 'fengfeng_kaishan')).toBe('earth_split');
    expect(companionCardAction('fengfeng', 'fengfeng_huibu')).toBe('retreat_thrust');
    expect(companionCardAction('fengfeng', 'luanwu', { cardType: '攻擊' })).toBeUndefined();
    expect(companionCardAction('fengfeng', 'maoqiudan', { cardType: '攻擊' })).toBeUndefined();
    expect(companionCardAction('fengfeng', 'sashoujian', { cardType: '攻擊' })).toBeUndefined();
  });

  it('五種劍擊與菲菲爪踢貼近目標，技能、飛針與震地保持原位', () => {
    for (const action of ['slash', 'sweep', 'heavy_slash', 'thrust', 'double_slash'] as const) {
      expect(companionIsMelee('fengfeng', action)).toBe(true);
    }
    expect(companionIsMelee('fengfeng', 'guard')).toBe(false);
    expect(companionIsMelee('fengfeng', 'sword_combo')).toBe(true);
    expect(companionIsMelee('fengfeng', 'qi_cleave')).toBe(true);
    expect(companionIsMelee('fengfeng', 'retreat_thrust')).toBe(true);
    expect(companionIsMelee('fengfeng', 'earth_split')).toBe(false);
    expect(companionIsMelee('feifei', 'attack1')).toBe(true);
    expect(companionIsMelee('feifei', 'kick')).toBe(true);
    expect(companionIsMelee('feifei', 'shuriken')).toBe(false);
    expect(companionIsMelee('dangdang', 'ground_slam')).toBe(false);
  });

  it('真命中讀取metadata；攻擊播完接可中斷短收劍，收劍不增加命中', () => {
    expect(companionImpactTimes('fengfeng', 'slash', 1)).toEqual([300]);
    expect(companionImpactTimes('fengfeng', 'double_slash', 2)).toEqual([220, 550]);
    expect(companionImpactTimes('fengfeng', 'guard', 1)).toEqual([]);
    expect(companionMotionDuration('fengfeng', 'slash')).toBe(1230);
    expect(companionMotionDuration('fengfeng', 'double_slash')).toBe(1390);
    expect(companionMotionDuration('fengfeng', 'double_slash', 2)).toBe(1390);

    const actor = createCompanionMotionActor('fengfeng', { action: 'slash' });
    actor.play('slash', { elapsed: 720 });
    expect(lastDraw().slice(1, 5)).toEqual(fengfengMotionData.actions.sheath.frames[2]!.rect);
    actor.play('guard');
    expect(lastDraw().slice(1, 5)).toEqual(fengfengMotionData.actions.guard.frames[0]!.rect);
    actor.dispose();
  });

  it('三拍連刀只播放真實波數，520／760 毫秒後立即接完整收劍', () => {
    expect(companionImpactTimes('fengfeng', 'sword_combo', 1)).toEqual([220]);
    expect(companionImpactTimes('fengfeng', 'sword_combo', 2)).toEqual([220, 460]);
    expect(companionImpactTimes('fengfeng', 'sword_combo', 3)).toEqual([220, 460, 700]);
    expect(companionMotionDuration('fengfeng', 'sword_combo', 1)).toBe(1030);
    expect(companionMotionDuration('fengfeng', 'sword_combo', 2)).toBe(1270);
    expect(companionMotionDuration('fengfeng', 'sword_combo', 3)).toBe(1510);

    const actor = createCompanionMotionActor('fengfeng', { action: 'sword_combo' });
    actor.play('sword_combo', { elapsed: 520, waves: 1 });
    expect(lastDraw().slice(1, 5)).toEqual(fengfengMotionData.actions.sheath.frames[2]!.rect);
    actor.play('sword_combo', { elapsed: 760, waves: 2 });
    expect(lastDraw().slice(1, 5)).toEqual(fengfengMotionData.actions.sheath.frames[2]!.rect);
    actor.play('sword_combo', { elapsed: 519, waves: 1 });
    expect(lastDraw().slice(1, 5)).toEqual(fengfengAttackMotionData.actions.sword_combo.frames.at(-1)!.rect);
    actor.dispose();
  });

  it('未知共用牌依真牌種類選擇劍擊、架擋、進食或蓄勢', () => {
    expect(companionCardAction('fengfeng', 'sanjo', { poseFamily: 'claw', cardType: '攻擊' })).toBe('slash');
    expect(companionCardAction('fengfeng', 'shunkan', { poseFamily: 'dash', cardType: '攻擊' })).toBe('thrust');
    expect(companionCardAction('fengfeng', 'huixuan', { poseFamily: 'kick', cardType: '攻擊' })).toBe('sweep');
    expect(companionCardAction('fengfeng', 'tiebushan', { cardType: '技能', hasBlock: true })).toBe('guard');
    expect(companionCardAction('fengfeng', 'guixi', { cardType: '技能', hasHeal: true })).toBe('eat');
    expect(companionCardAction('fengfeng', 'dingshen', { cardType: '技能' })).toBe('focus');
  });
});

describe('菲菲全身逐格畫布', () => {
  it('預載舊動作與七張新增針招來源圖，載妥前後狀態可查', async () => {
    expect(companionMotionReady('feifei')).toBe(false);
    expect(companionMotionReady('dangdang')).toBe(false);
    await preloadCompanionMotion('feifei');
    expect(companionMotionReady('feifei')).toBe(true);
    expect(new Set(FakeImage.sources)).toEqual(new Set(
      [...Object.values(motionData.actions), ...Object.values(needleMotionData.actions),
        { texture: 'assets/sprites/hero/feifei_hit.webp' }]
        .map((motion) => `/${motion.texture}`),
    ));
    expect(new Set(FakeImage.sources)).toHaveLength(18);

    FakeImage.sources = [];
    await preloadCompanionMotion('fengfeng');
    expect(companionMotionReady('fengfeng')).toBe(true);
    expect(new Set(FakeImage.sources)).toEqual(new Set(
      [...Object.values(fengfengMotionData.actions), ...Object.values(fengfengAttackMotionData.actions),
        { texture: 'assets/sprites/hero/fengfeng_hit.webp' }]
        .map((motion) => `/${motion.texture}`),
    ));
    expect(new Set(FakeImage.sources)).toHaveLength(16);
    expect(companionMotionReady('dangdang')).toBe(false);

    FakeImage.sources = [];
    await preloadCompanionMotion('dangdang');
    expect(companionMotionReady('dangdang')).toBe(true);
    expect(new Set(FakeImage.sources)).toEqual(new Set(
      [...Object.values(dangdangMotionData.actions), ...Object.values(dangdangAttackMotionData.actions),
        { texture: 'assets/sprites/hero/dangdang_hit.webp' }]
        .map((motion) => `/${motion.texture}`),
    ));
    expect(new Set(FakeImage.sources)).toHaveLength(15);
  });

  it('以原生高度正規化、腳底固定，停止後不再排程', () => {
    const actor = createCompanionMotionActor('feifei', { action: 'idle' });
    expect(actor.element.className).toContain('companion-motion-feifei');
    expect(actor.element.getAttribute?.('aria-label') ?? (actor.element as unknown as FakeCanvas).attrs.get('aria-label')).toBe('菲菲');
    expect(actor.element.style.transform).toBe(`translateX(${-actor.foot.x}px)`);
    expect(actor.width).toBeGreaterThan(0);
    expect(actor.height).toBeGreaterThanOrEqual(252);
    step(1000);
    actor.dispose();
    expect(rafs.size).toBe(0);
  });

  it('三秒換場期間跑步跨過兩輪後仍交替四肢影格', () => {
    const actor = createCompanionMotionActor('feifei', { action: 'run' });
    step(0);
    step(1025);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.actions.run.frames[1]!.rect);
    expect(rafs.size).toBe(1);
    step(1265);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.actions.run.frames[5]!.rect);
    expect(rafs.size).toBe(1);
    actor.dispose();
  });

  it('噹噹跑步跨過兩輪後仍交替手腳，畫布標籤與角色相符', () => {
    const actor = createCompanionMotionActor('dangdang', { action: 'run' });
    expect(actor.element.className).toContain('companion-motion-dangdang');
    expect(actor.element.getAttribute?.('aria-label') ?? (actor.element as unknown as FakeCanvas).attrs.get('aria-label')).toBe('噹噹');
    step(0);
    step(1090);
    expect(lastDraw().slice(1, 5)).toEqual(dangdangMotionData.actions.run.frames[0]!.rect);
    step(1230);
    expect(lastDraw().slice(1, 5)).toEqual(dangdangMotionData.actions.run.frames[2]!.rect);
    expect(rafs.size).toBe(1);
    actor.dispose();
  });

  it('封封跑步跨過兩輪仍循環，畫布標籤與角色相符', () => {
    const actor = createCompanionMotionActor('fengfeng', { action: 'run' });
    expect(actor.element.className).toContain('companion-motion-fengfeng');
    expect(actor.element.getAttribute?.('aria-label') ?? (actor.element as unknown as FakeCanvas).attrs.get('aria-label')).toBe('封封');
    step(0);
    step(1080);
    expect(lastDraw().slice(1, 5)).toEqual(fengfengMotionData.actions.run.frames[2]!.rect);
    step(1310);
    expect(lastDraw().slice(1, 5)).toEqual(fengfengMotionData.actions.run.frames[5]!.rect);
    expect(rafs.size).toBe(1);
    actor.dispose();
  });

  it('連針在第一次離手後重播投擲子段，投射物不會憑空追加', () => {
    const actor = createCompanionMotionActor('feifei', { action: 'shuriken' });
    actor.play('shuriken', { elapsed: 286, waves: 2 });
    expect(lastDraw().slice(1, 5)).toEqual(motionData.actions.shuriken.frames[2]!.rect);
    actor.play('shuriken', { elapsed: 425, waves: 2 });
    expect(lastDraw().slice(1, 5)).toEqual(motionData.actions.shuriken.frames[4]!.rect);
    expect(companionMotionDuration('feifei', 'shuriken', 3)).toBe(980);
    actor.dispose();
  });

  it('連針只保留實際波次的預備段，額外波循環後仍播放最後收招', () => {
    const combo = needleMotionData.actions.needle_combo;
    const base = Math.round(combo.frames.reduce((sum, frame) => sum + frame.duration * 1000, 0));
    expect(companionMotionDuration('feifei', 'needle_combo', 1)).toBe(base - 160);
    expect(companionMotionDuration('feifei', 'needle_combo', 2)).toBe(base);
    expect(companionMotionDuration('feifei', 'needle_combo', 4)).toBe(base + 280);

    const actor = createCompanionMotionActor('feifei', { action: 'needle_combo' });
    actor.play('needle_combo', { elapsed: base - 160, waves: 1 });
    expect(lastDraw().slice(1, 5)).toEqual(combo.frames.at(-1)!.rect);
    actor.play('needle_combo', { elapsed: base + 280, waves: 4 });
    expect(lastDraw().slice(1, 5)).toEqual(combo.frames.at(-1)!.rect);
    actor.dispose();
  });

  it('毒分身期間本體停在結印中格，分身收完才完成收勢', () => {
    const actor = createCompanionMotionActor('feifei', { action: 'clone' });
    actor.play('clone', { elapsed: 300 });
    expect(lastDraw().slice(1, 5)).toEqual(motionData.actions.seal.frames[2]!.rect);
    actor.play('clone', { elapsed: FEIFEI_CLONE_TIMING.end });
    expect(lastDraw().slice(1, 5)).toEqual(motionData.actions.seal.frames.at(-1)!.rect);
    actor.dispose();
  });
});
