import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import motionData from '../../src/ui/enemy-motion-data.json';
import type {
  EnemyMotionAction,
  EnemyMotionKind,
} from '../../src/ui/enemy-motion';

type DrawCall = [CanvasImageSource, number, number, number, number, number, number, number, number];

class FakeContext {
  draws: DrawCall[] = [];
  clears = 0;
  transform: [number, number, number, number, number, number] | null = null;
  clearRect(): void { this.clears += 1; }
  setTransform(...args: [number, number, number, number, number, number]): void {
    this.transform = args;
  }
  drawImage(...args: DrawCall): void { this.draws.push(args); }
}

class FakeCanvas {
  width = 0;
  height = 0;
  className = '';
  ariaLabel = '';
  role = '';
  style = { width: '', height: '', transform: '', bottom: '' };
  readonly context = new FakeContext();
  getContext(kind: string): FakeContext | null { return kind === '2d' ? this.context : null; }
  setAttribute(name: string, value: string): void {
    if (name === 'aria-label') this.ariaLabel = value;
    if (name === 'role') this.role = value;
  }
}

class FakeImage {
  static sources: string[] = [];
  /** 呼叫過 decode() 的網址：逐格動作不該有——畫布用不到那份解碼（清理 2026-09-22） */
  static decoded: string[] = [];
  /** 建過的每一張（待機畫不上去那條要把某一張改成還沒載好） */
  static instances: FakeImage[] = [];
  constructor() { FakeImage.instances.push(this); }
  complete = true;
  private value = '';
  set src(value: string) { this.value = value; FakeImage.sources.push(value); }
  get src(): string { return this.value; }
  async decode(): Promise<void> { FakeImage.decoded.push(this.value); }
}

type EnemyMotionModule = typeof import('../../src/ui/enemy-motion');

let motion: EnemyMotionModule;
let nextRaf = 1;
let rafs = new Map<number, FrameRequestCallback>();
let cancelled: number[] = [];
let canvases: FakeCanvas[] = [];

function step(time: number): void {
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
}

function lastDraw(): DrawCall {
  const draw = canvases.at(-1)?.context.draws.at(-1);
  if (!draw) throw new Error('沒有畫布繪製紀錄');
  return draw;
}

beforeEach(async () => {
  vi.resetModules();
  FakeImage.sources = [];
  FakeImage.decoded = [];
  FakeImage.instances = [];
  nextRaf = 1;
  rafs = new Map();
  cancelled = [];
  canvases = [];
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`未預期的元素：${tag}`);
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
    cancelAnimationFrame: (id: number) => { cancelled.push(id); rafs.delete(id); },
  });
  motion = await import('../../src/ui/enemy-motion');
});

afterEach(() => vi.unstubAllGlobals());

describe('敵人逐格素材載入', () => {
  it('只載入本場敵人種類，同來源圖去重且分種類記錄就緒', async () => {
    expect(motion.enemyMotionReady('rat')).toBe(false);
    expect(motion.enemyMotionReady('ninja')).toBe(false);

    await motion.preloadEnemyMotion(['rat']);
    expect(FakeImage.sources).toHaveLength(3);
    expect(new Set(FakeImage.sources).size).toBe(3);
    expect(FakeImage.sources.every((source) => source.includes('assets/motion/enemies/'))).toBe(true);
    expect(FakeImage.sources.every((source) => source.includes('rat-'))).toBe(true);
    expect(motion.enemyMotionReady('rat')).toBe(true);
    expect(motion.enemyMotionReady('ninja')).toBe(false);

    await motion.preloadEnemyMotion(['rat', 'ninja']);
    expect(FakeImage.sources).toHaveLength(5);
    expect(new Set(FakeImage.sources).size).toBe(5);
    expect(motion.enemyMotionReady('ninja')).toBe(true);
    expect(FakeImage.decoded).toEqual([]);
  });

  it('保留來源影格時長，並回報完整動作總時長', () => {
    expect([
      motion.enemyMotionDuration('rat', 'idle'),
      motion.enemyMotionDuration('rat', 'attack'),
      motion.enemyMotionDuration('rat', 'hurt'),
      motion.enemyMotionDuration('rat', 'air_rise'),
      motion.enemyMotionDuration('rat', 'air_fall'),
      motion.enemyMotionDuration('rat', 'knockdown'),
      motion.enemyMotionDuration('rat', 'getup'),
    ]).toEqual([100, 820, 400, 240, 210, 200, 280]);
    expect([
      motion.enemyMotionDuration('ninja', 'idle'),
      motion.enemyMotionDuration('ninja', 'attack'),
      motion.enemyMotionDuration('ninja', 'hurt'),
    ]).toEqual([1000, 720, 400]);
  });
});

describe('敵人逐格畫布', () => {
  it.each((['rat', 'ninja'] as const).flatMap((kind) =>
    (['idle', 'attack', 'hurt', 'air_rise', 'air_fall', 'knockdown', 'getup'] as const)
      .map((action) => ({ kind, action }))))('$kind $action 在 60 Hz 下保持原始時間軸，每個來源影格只重畫一次', ({ kind, action }) => {
    const actor = motion.createEnemyMotionActor(kind, { action });
    const context = canvases.at(-1)!.context;
    const data = motionData.kinds[kind].actions[action];
    const durations = data.frames.map((frame) => frame.duration * 1000);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    for (let index = 0; index <= 60; index++) {
      const elapsed = index * 1000 / 60;
      step(elapsed);
      let remaining = data.loop ? elapsed % total : Math.min(elapsed, total);
      let frameIndex = 0;
      while (frameIndex < data.frames.length - 1 && remaining >= durations[frameIndex]!) {
        remaining -= durations[frameIndex]!;
        frameIndex += 1;
      }
      expect(lastDraw().slice(1, 5)).toEqual(data.frames[frameIndex]!.rect);
    }
    expect(context.draws).toHaveLength(data.frames.length);
    expect(context.clears).toBe(data.frames.length);
    // 只有一格的循環（待機）畫好就不再要下一格（2026-09-23 效能）；多格的循環才一直排
    expect(rafs.size).toBe(data.loop && data.frames.length > 1 ? 1 : 0);
    actor.dispose();
  });

  it('攻擊重播會重新計時，不受上一輪繪製紀錄影響', () => {
    const actor = motion.createEnemyMotionActor('rat', { action: 'attack' });
    step(0);
    step(110);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.kinds.rat.actions.attack.frames[1]!.rect);
    actor.play('attack');
    step(200);
    step(299);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.kinds.rat.actions.attack.frames[0]!.rect);
    step(300);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.kinds.rat.actions.attack.frames[1]!.rect);
    actor.dispose();
  });

  it('依來源時長換格，非循環動作停在最後一格', () => {
    const actor = motion.createEnemyMotionActor('rat', { action: 'attack' });
    step(1000);
    expect(lastDraw().slice(1, 5)).toEqual([32, 26, 340, 395]);
    step(1099);
    expect(lastDraw().slice(1, 5)).toEqual([32, 26, 340, 395]);
    step(1100);
    expect(lastDraw().slice(1, 5)).toEqual([476, 31, 346, 390]);
    step(2000);
    expect(lastDraw().slice(1, 5)).toEqual([1362, 469, 340, 396]);
    expect(rafs.size).toBe(0);
    actor.dispose();
  });

  it('所有動作維持同一腳底定位點，切換動作不改畫布位置', () => {
    const actions: EnemyMotionAction[] = ['idle', 'attack', 'hurt', 'air_rise', 'air_fall', 'knockdown', 'getup'];
    for (const kind of ['rat', 'ninja'] as EnemyMotionKind[]) {
      const actor = motion.createEnemyMotionActor(kind);
      const canvas = canvases.at(-1)!;
      const initial = { foot: actor.foot, transform: canvas.style.transform, bottom: canvas.style.bottom };
      expect(Object.isFrozen(actor.foot)).toBe(true);
      for (const action of actions) {
        actor.play(action);
        step(100);
        const [, , , , , dx, dy, width, height] = lastDraw();
        expect(dx).toBeGreaterThanOrEqual(-0.001);
        expect(dy).toBeGreaterThanOrEqual(-0.001);
        expect(dx + width).toBeLessThanOrEqual(Number.parseFloat(canvas.style.width) + 0.001);
        expect(dy + height).toBeLessThanOrEqual(Number.parseFloat(canvas.style.height) + 0.001);
        expect(actor.foot).toBe(initial.foot);
        expect(canvas.style.transform).toBe(initial.transform);
        expect(canvas.style.bottom).toBe(initial.bottom);
      }
      actor.dispose();
    }
  });

  it('依各角色待機可見高度正規化，預設老鼠 150、忍者 210', () => {
    const rat = motion.createEnemyMotionActor('rat');
    const ratIdleHeight = lastDraw()[8];
    expect(ratIdleHeight).toBeCloseTo(468 * 0.5 * 150 / 231, 6);
    rat.dispose();

    const ninja = motion.createEnemyMotionActor('ninja');
    const ninjaIdleHeight = lastDraw()[8];
    expect(ninjaIdleHeight).toBeCloseTo(285 * 0.81 * 210 / 231, 6);
    ninja.dispose();
  });

  it('依原圖朝向逐動作面向左側，換待機、攻擊、受擊時腳底不跳位', () => {
    for (const kind of ['rat', 'ninja'] as const) {
      const actor = motion.createEnemyMotionActor(kind);
      const canvas = canvases.at(-1)!;
      const initialTransform = canvas.style.transform;
      const actions: EnemyMotionAction[] = ['idle', 'attack', 'hurt', 'air_rise', 'air_fall', 'knockdown', 'getup', 'idle'];
      for (const action of actions) {
        actor.play(action);
        const mirrored = kind !== 'rat' || (action !== 'idle' && action !== 'hurt');
        const transform = canvas.context.transform!;
        expect(transform[0]).toBe(mirrored ? -2 : 2);
        expect(transform[3]).toBe(2);
        expect(transform[4]).toBe(mirrored ? canvas.width : 0);
        const kindData = motionData.kinds[kind];
        const actionData = kindData.actions[action];
        const pivotX = actionData.frames[0]!.pivot[0]!;
        const drawnPivotX = lastDraw()[5] + pivotX * actionData.scale * kindData.default_height / kindData.native_height;
        expect((transform[0] * drawnPivotX + transform[4]) / 2).toBeCloseTo(actor.foot.x, 6);
        expect(canvas.style.transform).toBe(initialTransform);
      }
      actor.dispose();
    }
  });

  /**
   * 2026-09-23 效能：待機只有一格，畫好就不再每一拍要下一格（三隻老鼠每一拍各要一格，閒置時主執行緒整場停不下來）。
   * 把 enemy-motion.ts 那行「一格的循環畫好就收」拿掉 → 第一個 expect 會紅。
   */
  it.each(['rat', 'ninja'] as const)('%s 待機畫好就停，換動作重新排、回待機再停；圖還沒載好就繼續試', (kind) => {
    const actor = motion.createEnemyMotionActor(kind, { action: 'idle' });
    const context = canvases.at(-1)!.context;
    step(0);
    expect(rafs.size, '待機畫好了還在要下一格').toBe(0);
    const idleDraws = context.draws.length;
    actor.play('hurt');
    expect(rafs.size).toBe(1);
    for (let t = 0; t <= 600; t += 16) step(t);
    expect(context.draws.length).toBeGreaterThan(idleDraws);
    actor.play('idle');
    step(700);
    expect(rafs.size).toBe(0);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.kinds[kind].actions.idle.frames[0]!.rect);
    actor.dispose();

    // 圖還沒載好（complete 是 false）：畫不上去就照舊每一拍再試，載好畫上去才停
    const loading = motion.createEnemyMotionActor(kind, { action: 'idle' });
    const idleTexture = motionData.kinds[kind].actions.idle.texture.replace(/\.webp$/, '');
    const image = FakeImage.instances.find((one) => one.src.includes(idleTexture))!;
    image.complete = false;
    loading.play('idle');
    step(800);
    expect(rafs.size).toBe(1);
    image.complete = true;
    step(816);
    expect(rafs.size).toBe(0);
    loading.dispose();
  });

  it('建立後持續請求影格，釋放後取消且不再繪製', () => {
    // 用出招（多格、還在演）：待機只有一格，畫好就不再排下一格，沒有東西可以取消（見下一條）
    const actor = motion.createEnemyMotionActor('ninja', { action: 'attack' });
    const canvas = canvases.at(-1)!;
    expect(actor.element.className).toBe('enemy-motion');
    expect(actor.element.role).toBe('img');
    expect(rafs.size).toBe(1);
    step(10);
    const before = canvas.context.draws.length;
    actor.dispose();
    expect(cancelled).toHaveLength(1);
    step(20);
    expect(canvas.context.draws.length).toBe(before);
  });
});

/*
 * 橫向捲軸搬來的 17 隻（2026-09-28，稽核 低-6）：每一套的每個動作，第一格的腳底都要畫在同一個定位點上，
 * 切換動作不改畫布位置——換待機、出招、倒下時整隻不會跳位。
 */
describe('橫向捲軸動作：腳底不跳位', () => {
  it.each(['iron_claw', 'iron_claw_p2', 'roomba_king', 'frog_daimyo', 'frog_daimyo_p2', 'orange_king', 'orange_king_p2',
    'tanuki_lord', 'tanuki_lord_p2', 'drum_tanuki', 'guardian_statue', 'iron_arhat', 'mask_dancer', 'armor_ghost', 'kappa',
    'lantern_ghost', 'orange_bandit', 'plated_beetle', 'tengu', 'vacuum', 'wraith_samurai'] as const)('%s', async (kind) => {
    await motion.preloadEnemyMotion([kind]);
    expect(motion.enemyMotionReady(kind)).toBe(true);
    const data = (await import(`../../src/ui/side-motion/${kind}.json`)).default as {
      actions: Record<string, { scale: number; frames: { pivot: [number, number] }[] }>;
    };
    const actor = motion.createEnemyMotionActor(kind);
    const canvas = canvases.at(-1)!;
    const initial = { transform: canvas.style.transform, bottom: canvas.style.bottom };
    for (const [action, motionData] of Object.entries(data.actions)) {
      actor.play(action as EnemyMotionAction);
      const [, , , , , dx, dy] = lastDraw();
      const [px, py] = motionData.frames[0]!.pivot;
      expect(dx + px * motionData.scale, `${kind} ${action} 腳底 x`).toBeCloseTo(actor.foot.x, 4);
      expect(dy + py * motionData.scale, `${kind} ${action} 腳底 y`).toBeCloseTo(actor.foot.y, 4);
      expect(canvas.style.transform).toBe(initial.transform);
      expect(canvas.style.bottom).toBe(initial.bottom);
    }
    actor.dispose();
  });
});

/*
 * 2026-10-01 慢網路（使用者：「第一關 BOSS 機器狗還是原本的？爆炸應該很華麗」）：
 * 待機改畫立繪的那幾套不抓走路圖集（從來不上畫面）；塔主第二階段先下載、不解碼、不算就緒。
 * 0.8 Mbps 實測鐵爪變身後要等走路那張，雷射與爆炸 52 秒才演得出來（只等雷射、爆炸是 30 秒）。
 */
describe('慢網路：只抓會上畫面的圖集、第二階段先下載', () => {
  const sideSources = (): string[] => FakeImage.sources.map((s) => s.replace(/^.*motion\/side\//, '').replace(/\.webp.*$/, ''));

  it('鐵爪第二階段：就緒只等雷射與爆炸，不抓走路那張；建好畫布也不去抓', async () => {
    await motion.preloadEnemyMotion(['iron_claw_p2']);
    expect(motion.enemyMotionReady('iron_claw_p2')).toBe(true);
    expect(sideSources().sort()).toEqual(['iron_claw-down_p2', 'iron_claw-laser_p2']);
    const actor = motion.createEnemyMotionActor('iron_claw_p2');
    expect(sideSources()).not.toContain('iron_claw-walk_p2');
    actor.play('knockdown');
    expect(lastDraw()).toBeDefined();   // 倒下照樣畫得出來
    actor.dispose();
  });

  it('待機照播逐格的（掃地機器人王）照舊抓待機那張', async () => {
    await motion.preloadEnemyMotion(['roomba_king']);
    expect(sideSources().sort()).toEqual(['roomba_king-down', 'roomba_king-drive', 'roomba_king-ram']);
  });

  it('先下載第二階段：只設網址、不解碼、不算就緒；之後真的要用時沿用同一張、不重抓', async () => {
    await motion.prefetchEnemyMotion('iron_claw_p2');
    expect(sideSources().sort()).toEqual(['iron_claw-down_p2', 'iron_claw-laser_p2']);
    expect(motion.enemyMotionReady('iron_claw_p2')).toBe(false);
    expect(FakeImage.decoded).toEqual([]);
    await motion.preloadEnemyMotion(['iron_claw_p2']);
    expect(motion.enemyMotionReady('iron_claw_p2')).toBe(true);
    expect(sideSources().length).toBe(2);
  });

  it('先下載不插隊：慢網路排在主角那些圖集後面；變身時真的要用才插到最前面（審查 2026-10-01 中）', async () => {
    const lane = await import('../../src/ui/heavy-lane');
    lane.armHeavyLane(2);
    const release = lane.holdHeavyLane();   // 先擋住，看排隊的順序
    try {
      void lane.loadHeavy(new FakeImage() as unknown as HTMLImageElement, 'assets/motion/qiuqiu/hero-a.webp');
      const prefetch = motion.prefetchEnemyMotion('iron_claw_p2');
      for (let i = 0; i < 50 && lane._heavyLaneStateForTest().waiting.length < 3; i++) await new Promise((r) => setTimeout(r, 0));
      const order = (): string[] => lane._heavyLaneStateForTest().waiting.map((u) => u.replace(/^.*\//, '').replace(/\.webp.*$/, ''));
      expect(order()).toEqual(['hero-a', 'iron_claw-laser_p2', 'iron_claw-down_p2']);
      void motion.preloadEnemyMotion(['iron_claw_p2']);
      for (let i = 0; i < 50 && order()[0] === 'hero-a'; i++) await new Promise((r) => setTimeout(r, 0));
      expect(order().slice(0, 2).sort()).toEqual(['iron_claw-down_p2', 'iron_claw-laser_p2']);
      expect(order()[2]).toBe('hero-a');
      release();
      await prefetch;
    } finally {
      release();
      lane._resetHeavyLaneForTest();
    }
  });

  it('先下載失敗的從快取拿掉，之後真的要用時會重抓', async () => {
    const lane = await import('../../src/ui/heavy-lane');
    lane._resetHeavyLaneForTest();
    // 讓這一次建出來的圖都是「載入失敗」（complete 但沒有寬度，見 decoded-atlas.ts 的 imageLoaded）
    const broken = class extends FakeImage { naturalWidth = 0; addEventListener(): void {} };
    vi.stubGlobal('Image', broken);
    await motion.prefetchEnemyMotion('iron_claw_p2');
    vi.stubGlobal('Image', FakeImage);
    const before = FakeImage.sources.length;
    await motion.preloadEnemyMotion(['iron_claw_p2']).catch(() => undefined);
    expect(FakeImage.sources.length - before).toBe(2);   // 雷射、爆炸各重抓一次
  });
});
