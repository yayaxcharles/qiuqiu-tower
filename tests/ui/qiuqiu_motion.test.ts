import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import motionData from '../../src/ui/qiuqiu-motion-data.json';
import extraMotionData from '../../src/ui/qiuqiu-extra-motion-data.json';
import attackMotionData from '../../src/ui/qiuqiu-attack-motion-data.json';
import { cards } from '../../src/content/cards';
import { visibleCanvasRect } from './motion_test_geometry';
import {
  createQiuqiuActor,
  preloadQiuqiuMotion,
  qiuqiuCardAction,
  qiuqiuCombatMotionDecision,
  qiuqiuImpactDelay,
  qiuqiuImpactTimes,
  qiuqiuIsMelee,
  qiuqiuMotionDuration,
  qiuqiuMotionEnabled,
  qiuqiuMotionReady,
  type QiuqiuAction,
} from '../../src/ui/qiuqiu-motion';
import { DEFERRED_REST_ACTIONS } from '../../src/ui/rest-state-motion';

type DrawCall = [CanvasImageSource, number, number, number, number, number, number, number, number];

class FakeContext {
  draws: DrawCall[] = [];
  clearRect(): void { /* observable through the following draw */ }
  setTransform(): void { /* the bitmap dimensions are asserted separately */ }
  drawImage(...args: DrawCall): void { this.draws.push(args); }
}

class FakeCanvas {
  width = 0;
  height = 0;
  className = '';
  ariaLabel = '';
  style = {
    width: '',
    height: '',
    bottom: '',
  };
  readonly context = new FakeContext();
  getContext(kind: string): FakeContext | null { return kind === '2d' ? this.context : null; }
  setAttribute(name: string, value: string): void { if (name === 'aria-label') this.ariaLabel = value; }
}

class FakeImage {
  static sources: string[] = [];
  src = '';
  async decode(): Promise<void> { FakeImage.sources.push(this.src); }
}

let nextRaf = 1;
let rafs = new Map<number, FrameRequestCallback>();
let cancelled: number[] = [];
let canvases: FakeCanvas[] = [];

function step(time: number): void {
  const pending = [...rafs.values()];
  rafs.clear();
  for (const cb of pending) cb(time);
}

function lastDraw(): DrawCall {
  const draw = canvases.at(-1)?.context.draws.at(-1);
  if (!draw) throw new Error('沒有畫出任何影格');
  return draw;
}

beforeEach(async () => {
  nextRaf = 1;
  rafs = new Map();
  cancelled = [];
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
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      const id = nextRaf++;
      rafs.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (id: number) => { cancelled.push(id); rafs.delete(id); },
  });
  await preloadQiuqiuMotion();
});

afterEach(() => vi.unstubAllGlobals());

describe('球球全身動作開關與招式選擇', () => {
  it('一般入口預設開啟動作，仍可明確關閉或進入預覽', () => {
    expect(qiuqiuMotionReady()).toBe(true);
    expect(qiuqiuMotionEnabled('?motion-preview')).toBe(true);
    expect(qiuqiuMotionEnabled('?motion=1')).toBe(true);
    expect(qiuqiuMotionEnabled('?motion=0')).toBe(false);
    expect(qiuqiuMotionEnabled('')).toBe(true);
    expect(qiuqiuMotionEnabled('?preview=1')).toBe(true);
  });

  it('基本貓抓與未知爪擊保留四種輪換，具名招式使用固定語義動作', () => {
    expect([0, 1, 2, 3, 4].map((n) => qiuqiuCardAction('sanjo', 'claw', n)))
      .toEqual(['attack1', 'attack2', 'attack3', 'attack4', 'attack1']);
    expect([0, 1, 2, 3, 4].map((n) => qiuqiuCardAction('unknown', 'claw', n)))
      .toEqual(['attack1', 'attack2', 'attack3', 'attack4', 'attack1']);
    expect(qiuqiuCardAction('huixuan', 'kick', 0)).toBe('kick');
    expect(qiuqiuCardAction('lianhuan', 'kick', 0)).toBe('combo_kick');
    expect(qiuqiuCardAction('tietou', 'dash', 0)).toBe('body_bash');
  });

  it('手裏劍亂舞優先使用投擲，不沿用舊的爪擊分類', () => {
    expect(qiuqiuCardAction('luanwu', 'claw', 3)).toBe('shuriken');
    expect(qiuqiuImpactDelay('shuriken')).toBe(350);
  });

  it('最後一擊已結算為勝利仍播完招式，敗北則立即交還既有姿勢', () => {
    expect(qiuqiuCombatMotionDecision('won', true, false)).toBe('play');
    expect(qiuqiuCombatMotionDecision('won', false, true)).toBe('keep');
    expect(qiuqiuCombatMotionDecision('lost', true, true)).toBe('stop');
  });

  it('命中拍點沿用 Godot 動作的第一個有效攻擊窗', () => {
    expect((['attack1', 'attack2', 'attack3', 'attack4', 'kick'] as QiuqiuAction[])
      .map(qiuqiuImpactDelay)).toEqual([70, 90, 100, 160, 200]);
    expect(qiuqiuImpactDelay('idle')).toBe(0);
    expect(qiuqiuImpactDelay('run')).toBe(0);
  });
});

describe('球球全身動作畫布', () => {
  it('受擊時完整保持舊立繪表情，再由播放流程接回站姿', () => {
    const actor = createQiuqiuActor({ action: 'hurt' });
    for (const elapsed of [0, 200, 500, 649]) {
      step(elapsed);
      expect((lastDraw()[0] as HTMLImageElement).src).toContain('assets/sprites/hero/ninja_hit.webp');
      expect(lastDraw().slice(1, 5)).toEqual([0, 0, 560, 547]);
    }
    expect(qiuqiuMotionDuration('hurt')).toBe(650);
    step(650);
    expect(rafs.size).toBe(0);
    actor.play('idle');
    expect(lastDraw().slice(1, 5)).toEqual(motionData.actions.idle.frames[0]!.rect);
    actor.dispose();
  });

  it.each(['poison', 'puff', 'stealth'] as const)('%s 保留狀態姿勢並持續緩慢呼吸，不輪播錯位畫格', (action) => {
    const actor = createQiuqiuActor({ action });
    const motion = extraMotionData.actions[action];
    const frame = motion.frames[action === 'poison' ? 3 : 0]!;
    const heights: number[] = [];
    step(0);
    const restingX = lastDraw()[5];
    for (const elapsed of [0, 180, 500, 1000, 2000, 3100, 5000, 6200, 9300, 12400]) {
      step(elapsed);
      const draw = lastDraw();
      const [dx, dy, , dh] = visibleCanvasRect(actor.element, [draw[5], draw[6], draw[7], draw[8]]);
      expect(draw.slice(1, 5)).toEqual(frame.rect);
      expect(dx).toBe(restingX);
      expect(dy + dh * frame.pivot[1]! / frame.rect[3]!).toBeCloseTo(actor.foot.y, 6);
      expect(dy).toBeGreaterThanOrEqual(0);
      expect(dy + dh).toBeLessThanOrEqual(actor.height);
      expect(rafs.size).toBe(1);
      heights.push(dh);
    }
    expect(Math.max(...heights)).toBeGreaterThan(heights[0]! * 1.02);
    expect(Math.max(...heights)).toBeLessThanOrEqual(heights[0]! * 1.025 + .00001);
    expect(heights.at(-1)).toBeCloseTo(heights[0]!, 6);
    actor.dispose();
  });

  it('翻肚先播完躺下動作，再維持翻肚姿勢緩慢呼吸', () => {
    const actor = createQiuqiuActor({ action: 'belly' });
    const motion = extraMotionData.actions.belly;
    step(0);
    expect(lastDraw().slice(1, 5)).toEqual(motion.frames[0]!.rect);
    const end = qiuqiuMotionDuration('belly');
    step(end);
    const lying = lastDraw();
    expect(lying.slice(1, 5)).toEqual(motion.frames.at(-1)!.rect);
    expect(rafs.size).toBe(1);
    step(end + 3100);
    expect(lastDraw().slice(1, 5)).toEqual(lying.slice(1, 5));
    expect(visibleCanvasRect(actor.element, [lastDraw()[5], lastDraw()[6], lastDraw()[7], lastDraw()[8]])[3]).toBeGreaterThan(lying[8]);
    step(end + 6200);
    expect(visibleCanvasRect(actor.element, [lastDraw()[5], lastDraw()[6], lastDraw()[7], lastDraw()[8]])[3]).toBeCloseTo(lying[8], 6);
    expect(rafs.size).toBe(1);
    actor.dispose();
    expect(rafs.size).toBe(0);
  });

  it('每個動作與手裏劍素材只預載一個貼圖網址', () => {
    const actions = {
      ...(motionData.actions as Record<string, { texture: string }>),
      ...(extraMotionData.actions as Record<string, { texture: string }>),
      ...(attackMotionData.actions as Record<string, { texture: string }>),
    };
    // 2026-09-21 新補的待機狀態圖不解碼預載（預載完才在背景下載）
    const expected = new Set(Object.entries(actions)
      .filter(([key]) => !DEFERRED_REST_ACTIONS.has(key))
      .map(([, motion]) => `/${motion.texture}`));
    expected.add('/assets/motion/qiuqiu/shuriken.webp');
    expected.add('/assets/sprites/hero/ninja_hit.webp');
    expect(new Set(FakeImage.sources)).toEqual(expected);
    expect(FakeImage.sources.every((src) => src.includes('assets/motion/qiuqiu/')
      || src === '/assets/sprites/hero/ninja_hit.webp')).toBe(true);
  });

  it('依不規則時長推進影格，非循環動作停在最後一格', () => {
    const actor = createQiuqiuActor({ action: 'attack1' });
    step(1000);
    expect(lastDraw().slice(1, 5)).toEqual([50, 9, 406, 499]);
    step(1039);
    expect(lastDraw().slice(1, 5)).toEqual([50, 9, 406, 499]);
    step(1040);
    expect(lastDraw().slice(1, 5)).toEqual([567, 19, 410, 488]);
    step(2000);
    expect(lastDraw().slice(1, 5)).toEqual([1072, 516, 413, 482]);
    actor.dispose();
  });

  it('循環動作跨過總時長後回到第一格', () => {
    const actor = createQiuqiuActor({ action: 'run' });
    step(500);
    step(979); // 跑步共 480 毫秒
    expect(lastDraw().slice(1, 5)).toEqual([1369, 464, 384, 392]);
    step(980);
    expect(lastDraw().slice(1, 5)).toEqual([29, 25, 381, 414]);
    actor.dispose();
  });

  it.each(['attack1', 'attack2', 'attack3', 'attack4'] as const)('%s 收招後接回待機會持續呼吸超過兩個週期', (action) => {
    const actor = createQiuqiuActor();
    actor.play(action);
    step(0);
    step(qiuqiuMotionDuration(action) + 100);
    expect(rafs.size).toBe(0);
    actor.play('idle');
    const start = 1000;
    step(start);
    const rest = lastDraw();
    for (const elapsed of [1000, 3100, 5000, 6200, 7200, 9300, 12400]) {
      step(start + elapsed);
      const draw = lastDraw();
      const height = visibleCanvasRect(actor.element, [draw[5], draw[6], draw[7], draw[8]])[3];
      expect(draw.slice(1, 5)).toEqual(rest.slice(1, 5));
      expect(draw[5]).toBe(rest[5]);
      expect(rafs.size).toBe(1);
      if (elapsed === 3100 || elapsed === 9300) expect(height - rest[8]).toBeGreaterThan(6);
      if (elapsed === 6200 || elapsed === 12400) expect(height).toBeCloseTo(rest[8], 6);
    }
    actor.dispose();
  });

  it('所有影格依各自樞紐落在同一腳底，且寬招式不超出畫布', () => {
    const actions: QiuqiuAction[] = [
      'idle', 'hurt', 'down', 'walk', 'run', 'roll', 'jump', 'land',
      'attack1', 'attack2', 'attack3', 'dash', 'clone', 'attack4', 'attack_run', 'attack_air',
      'shuriken', 'kick', 'seal', 'storm', 'rush', 'combo_kick', 'uppercut', 'flying_kick',
      'clone_duo', 'ultimate_clone', 'ultimate_storm', 'ultimate_rush',
      'guard', 'eat', 'win', 'poison', 'belly', 'defeat',
      'roar', 'ground_slam', 'body_bash', 'palm_combo',
    ];
    const actor = createQiuqiuActor({ height: 252 });
    let time = 100;
    for (const action of actions) {
      actor.play(action);
      step(time);
      for (let i = 0; i < 20; i++) {
        step(time + i * 50);
        const draw = lastDraw();
        const [dx, dy, dw, dh] = visibleCanvasRect(actor.element, [draw[5], draw[6], draw[7], draw[8]]);
        const canvas = canvases.at(-1)!;
        const cssWidth = Number.parseFloat(canvas.style.width);
        const cssHeight = Number.parseFloat(canvas.style.height);
        expect(dx).toBeGreaterThanOrEqual(-0.001);
        expect(dy).toBeGreaterThanOrEqual(-0.001);
        expect(dx + dw).toBeLessThanOrEqual(cssWidth + 0.001);
        expect(dy + dh).toBeLessThanOrEqual(cssHeight + 0.001);
      }
      time += 1200;
    }
    actor.dispose();
  });

  it('裝置倍率最多取二倍，dispose 後停止排程與繪圖', () => {
    const actor = createQiuqiuActor({ height: 250 });
    const canvas = canvases.at(-1)!;
    expect(canvas.ariaLabel).toBe('球球');
    expect(actor.element.style.transform).toBe(`translateX(${-actor.foot.x}px)`);
    expect(canvas.width).toBe(Math.ceil(Number.parseFloat(canvas.style.width) * 2));
    expect(canvas.height).toBe(Math.ceil(Number.parseFloat(canvas.style.height) * 2));
    step(10);
    const before = canvas.context.draws.length;
    actor.dispose();
    expect(cancelled.length).toBe(1);
    step(20);
    expect(canvas.context.draws.length).toBe(before);
  });
});

describe('球球完整動作合約', () => {
  it('依卡牌與升級狀態選出完整視覺動作', () => {
    const expectedAttacks: Record<string, QiuqiuAction | null> = {
      sanjo: 'attack1',
      shunkan: 'dash',
      shengdong: 'attack2',
      shunshou: 'attack1',
      bangnidianyixia: 'attack3',
      wobangnishouwei: 'attack4',
      zhaonishuodeda: 'attack1',
      jienideliqi: 'attack4',
      wozaizhe: 'attack1',
      susu: 'attack3',
      bunshin: 'clone',
      ruying: 'clone_duo',
      tieshazhang: 'attack3',
      qinna: 'attack3',
      juye: null,
      tietou: 'body_bash',
      shihou: 'roar',
      dianxue: 'attack1',
      zuiquan: 'attack2',
      roubao: 'palm_combo',
      luoye: 'attack4',
      paozhao: 'attack1',
      canying: 'dash',
      caiweiba: 'flying_kick',
      sashoujian: 'shuriken',
      dieda: 'attack1',
      shibadie: 'palm_combo',
      liandao: 'ultimate_rush',
      jiedao: 'attack3',
      wangming: 'body_bash',
      shierlian: 'ultimate_clone',
      luanwu: 'shuriken',
      dilie: 'ground_slam',
      huixuan: 'kick',
      lianhuan: 'combo_kick',
      beici: 'dash',
      zhuiji: 'dash',
      maoqiudan: null,
      bengquan: 'uppercut',
      ehou: 'attack1',
      jiuweiquan: 'uppercut',
    };
    const eligibleAttackIds = cards
      .filter((card) => card.type === '攻擊' && card.hero !== 'feifei' && card.hero !== 'dangdang' && card.hero !== 'fengfeng')
      .map((card) => card.id)
      .sort();
    expect(Object.keys(expectedAttacks).sort()).toEqual(eligibleAttackIds);
    for (const [cardId, action] of Object.entries(expectedAttacks)) {
      const poseFamily = cardId === 'sanjo' || cardId === 'juye' || cardId === 'maoqiudan' ? 'claw' : undefined;
      expect(qiuqiuCardAction(cardId, poseFamily, 0), cardId).toBe(action);
    }
    expect(qiuqiuCardAction('juye', 'claw', 2)).toBeNull();
    expect(qiuqiuCardAction('maoqiudan', 'claw', 2)).toBeNull();

    const expectedSkills: Record<string, QiuqiuAction> = {
      kawarimi: 'seal',
      zhangyan: 'seal',
      yinshen: 'seal',
      huanying: 'seal',
      yingzi: 'seal',
      jingzhi: 'seal',
      duxin: 'seal',
      sanhua: 'seal',
      tanding: 'guard',
      tiebushan: 'guard',
      bianshen: 'guard',
      xianshuile: 'eat',
      guixi: 'eat',
      tianmao: 'eat',
      jiuming: 'eat',
      fanpu: 'eat',
    };
    for (const [cardId, action] of Object.entries(expectedSkills)) {
      expect(qiuqiuCardAction(cardId, undefined, 0)).toBe(action);
    }
    expect(qiuqiuCardAction('luanwu', 'claw', 0)).toBe('shuriken');
    expect(qiuqiuCardAction('luanwu', 'claw', 0, true)).toBe('ultimate_storm');
    expect(qiuqiuCardAction('unknown', 'claw', -1)).toBe('attack4');
    expect(qiuqiuCardAction('unknown', undefined, 0)).toBeNull();
  });

  it('回傳真正命中節拍並只延伸要求的溢出次數', () => {
    expect(qiuqiuImpactTimes('combo_kick', 3)).toEqual([100, 270, 600]);
    expect(qiuqiuImpactTimes('clone_duo', 2)).toEqual([180, 420]);
    expect(['dash', 'clone', 'uppercut', 'flying_kick'].map((action) => (
      qiuqiuImpactTimes(action as QiuqiuAction, 1)[0]
    ))).toEqual([60, 180, 180, 100]);
    expect(qiuqiuImpactTimes('ultimate_clone', 3)).toEqual([420, 760, 1120]);
    expect(qiuqiuImpactTimes('ultimate_rush', 3)).toEqual([160, 400, 640]);
    expect(qiuqiuImpactTimes('shuriken', 2)).toEqual([350, 490]);
    expect(qiuqiuImpactTimes('ultimate_storm', 2)).toEqual([470, 730]);
    expect(qiuqiuImpactTimes('clone_duo', 4)).toEqual([180, 420, 570, 720]);
    expect(qiuqiuImpactTimes('combo_kick', 1)).toEqual([100]);
    expect(qiuqiuImpactTimes('idle', 3)).toEqual([]);
    expect(qiuqiuImpactTimes('attack1', 0)).toEqual([]);
    expect(qiuqiuImpactDelay('ultimate_clone')).toBe(420);
    expect(qiuqiuImpactTimes('roar', 1)).toEqual([360]);
    expect(qiuqiuImpactTimes('ground_slam', 1)).toEqual([340]);
    expect(qiuqiuImpactTimes('body_bash', 1)).toEqual([260]);
    expect(qiuqiuImpactTimes('palm_combo', 1)).toEqual([220]);
    expect(qiuqiuImpactTimes('palm_combo', 2)).toEqual([220, 460]);
    expect(qiuqiuImpactTimes('palm_combo', 3)).toEqual([220, 460, 700]);
  });

  it('只把會由主角貼身出擊的動作判定為近戰', () => {
    const melee: QiuqiuAction[] = [
      'attack1', 'attack2', 'attack3', 'attack4', 'attack_run', 'attack_air',
      'kick', 'combo_kick', 'dash', 'uppercut', 'flying_kick', 'ultimate_rush',
      'body_bash', 'palm_combo',
    ];
    const stationary: QiuqiuAction[] = [
      'clone', 'clone_duo', 'ultimate_clone', 'shuriken', 'ultimate_storm', 'seal', 'idle',
      'roar', 'ground_slam',
    ];
    expect(melee.every(qiuqiuIsMelee)).toBe(true);
    expect(stationary.every((action) => !qiuqiuIsMelee(action))).toBe(true);
  });

  it('複合招式使用完整演出時間', () => {
    expect(qiuqiuMotionDuration('combo_kick')).toBe(980);
    expect(qiuqiuMotionDuration('ultimate_clone')).toBe(1800);
    expect(qiuqiuMotionDuration('ultimate_storm')).toBe(1050);
    expect(qiuqiuMotionDuration('ultimate_rush')).toBe(1450);
    expect(qiuqiuMotionDuration('roar')).toBe(740);
    expect(qiuqiuMotionDuration('ground_slam')).toBe(740);
    expect(qiuqiuMotionDuration('body_bash')).toBe(680);
    expect(qiuqiuMotionDuration('palm_combo')).toBe(1000);
    expect(qiuqiuMotionDuration('palm_combo', 1)).toBe(520);
    expect(qiuqiuMotionDuration('palm_combo', 2)).toBe(760);
    expect(qiuqiuMotionDuration('palm_combo', 3)).toBe(1000);
  });

  it('肉球連擊依真正段數跳過未發生的接觸格並共用收招', () => {
    const frames = attackMotionData.actions.palm_combo.frames;
    const actor = createQiuqiuActor({ action: 'idle' });

    actor.play('palm_combo', { waves: 1, elapsed: 289 });
    expect(lastDraw().slice(1, 5)).toEqual(frames[3]!.rect);
    actor.play('palm_combo', { waves: 1, elapsed: 290 });
    expect(lastDraw().slice(1, 5)).toEqual(frames[10]!.rect);

    actor.play('palm_combo', { waves: 2, elapsed: 530 });
    expect(lastDraw().slice(1, 5)).toEqual(frames[10]!.rect);
    actor.play('palm_combo', { waves: 3, elapsed: 531 });
    expect(lastDraw().slice(1, 5)).toEqual(frames[7]!.rect);
    actor.dispose();
  });

  it('連環踢在四百毫秒後真的切到迴旋踢姿勢', () => {
    const actor = createQiuqiuActor({ action: 'combo_kick' });
    const openingTexture = (lastDraw()[0] as unknown as FakeImage).src;
    step(1000);
    step(1399);
    expect((lastDraw()[0] as unknown as FakeImage).src).toBe(openingTexture);
    step(1400);
    expect((lastDraw()[0] as unknown as FakeImage).src).not.toBe(openingTexture);
    expect((lastDraw()[0] as unknown as FakeImage).src).toContain('kick_spin_sheet');
    actor.dispose();
  });

  it('可從網路確認的已經過時間直接追到正確影格', () => {
    const actor = createQiuqiuActor({ action: 'idle' });
    actor.play('attack1', { elapsed: 40 });
    expect(lastDraw().slice(1, 5)).toEqual([567, 19, 410, 488]);
    actor.dispose();
  });

  it('只有待機與中毒持續循環，倒地、敗北與防禦各播一次', () => {
    for (const action of ['down', 'defeat', 'guard'] as QiuqiuAction[]) {
      const actor = createQiuqiuActor({ action });
      const start = 1000;
      step(start);
      step(start + qiuqiuMotionDuration(action));
      expect(rafs.size).toBe(0);
      actor.dispose();
    }

    for (const action of ['idle', 'poison'] as QiuqiuAction[]) {
      const actor = createQiuqiuActor({ action });
      const start = 5000;
      step(start);
      step(start + qiuqiuMotionDuration(action) * 2);
      expect(rafs.size).toBe(1);
      actor.dispose();
    }
  });
});
