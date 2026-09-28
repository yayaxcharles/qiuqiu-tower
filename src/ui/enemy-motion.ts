import motionData from './enemy-motion-data.json';
import { fileUrl } from './assets';
import './styles/enemy-motion.css';
import { decodedAtlas, imageLoaded, prepareDecodedAtlas } from './decoded-atlas';
import { loadHeavy } from './heavy-lane';

/**
 * 兩隻魔王（鐵爪機關貓兩個階段、掃地機器人王）的逐格動作是從橫向捲軸搬來的（2026-09-28 試做）。
 * 牠們的格子資料放在另一份 JSON、**開打那一刻才用動態載入抓**（`boss-motion-data.json`，
 * 由 `tools/pack_boss_motion.py` 產生），不進開場的主程式；圖集也一樣只在那一場才下載。
 */
export const BOSS_MOTION_KINDS = ['iron_claw', 'iron_claw_p2', 'roomba_king'] as const;
export type BossMotionKind = typeof BOSS_MOTION_KINDS[number];
export type EnemyMotionKind = 'rat' | 'ninja' | BossMotionKind;
export function isBossMotionKind(kind: EnemyMotionKind): kind is BossMotionKind {
  return (BOSS_MOTION_KINDS as readonly string[]).includes(kind);
}
export type EnemyMotionAction = 'idle' | 'attack' | 'hurt' | 'air_rise' | 'air_fall' | 'knockdown' | 'getup';

type MotionFrame = {
  rect: [number, number, number, number];
  pivot: [number, number];
  duration: number;
};

type Motion = {
  texture: string;
  mirror?: boolean;
  scale: number;
  loop: boolean;
  frames: MotionFrame[];
};

type MotionKind = {
  native_height: number;
  default_height: number;
  mirror: boolean;
  /** 魔王只有待機、出招、挨打、倒地四段；缺的動作一律退回待機（`motionOf`） */
  actions: Partial<Record<EnemyMotionAction, Motion>> & { idle: Motion };
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const ACTIONS: readonly EnemyMotionAction[] = [
  'idle',
  'attack',
  'hurt',
  'air_rise',
  'air_fall',
  'knockdown',
  'getup',
];
const kinds: Partial<Record<EnemyMotionKind, MotionKind>> = { ...(motionData.kinds as unknown as Record<'rat' | 'ninja', MotionKind>) };
let bossData: Promise<void> | null = null;

/** 魔王的格子資料：第一次用到才抓。抓失敗就清掉、下一場再試（期間照舊畫靜態立繪） */
function ensureKindData(kind: EnemyMotionKind): Promise<void> {
  if (kinds[kind]) return Promise.resolve();
  bossData ??= import('./boss-motion-data.json').then((module) => {
    const data = ((module as { default?: unknown }).default ?? module) as { kinds: Record<BossMotionKind, MotionKind> };
    Object.assign(kinds, data.kinds);
  }).catch((error: unknown) => { bossData = null; throw error; });
  return bossData;
}

function kindOf(kind: EnemyMotionKind): MotionKind {
  const data = kinds[kind];
  if (!data) throw new Error(`敵人動作資料還沒載入：${kind}`);
  return data;
}

function motionOf(kind: MotionKind, action: EnemyMotionAction): Motion {
  return kind.actions[action] ?? kind.actions.idle;
}

function actionsOf(kind: MotionKind): Motion[] {
  return ACTIONS.map((action) => kind.actions[action]).filter((motion): motion is Motion => motion !== undefined);
}
const images = new Map<string, HTMLImageElement>();
const readyKinds = new Set<EnemyMotionKind>();
const kindLoads = new Map<EnemyMotionKind, Promise<void>>();
const timings = new WeakMap<Motion, { durations: number[]; total: number }>();

function timingFor(motion: Motion): { durations: number[]; total: number } {
  const cached = timings.get(motion);
  if (cached) return cached;
  const durations = motion.frames.map((frame) => frame.duration * 1000);
  const timing = { durations, total: durations.reduce((sum, duration) => sum + duration, 0) };
  timings.set(motion, timing);
  return timing;
}

function imageFor(texture: string): HTMLImageElement {
  const cached = images.get(texture);
  if (cached) return cached;
  const image = new Image();
  images.set(texture, image);
  // 網址交給大檔那一條設（`heavy-lane.ts`，2026-09-23）；這一場就要畫的魔物，排隊的話插到最前面
  void loadHeavy(image, fileUrl(texture), true);
  return image;
}

export function enemyMotionReady(kind: EnemyMotionKind): boolean {
  return readyKinds.has(kind);
}

async function preloadEnemyMotionKind(kind: EnemyMotionKind): Promise<void> {
  if (readyKinds.has(kind)) return;
  const pending = kindLoads.get(kind);
  if (pending) return pending;
  const load = ensureKindData(kind).then(() => Promise.all([...new Set(actionsOf(kindOf(kind)).map((motion) => motion.texture))].map(async (texture) => {
    const image = imageFor(texture);
    await loadHeavy(image, fileUrl(texture), true);   // 排到了、網址設好了（還在排隊的圖沒有網址，底下會當成壞圖）
    // 只等載好、不呼叫 decode()：畫布不吃 decode() 的結果，白解一次還多占記憶體（見 decoded-atlas.ts 的 `imageLoaded`）。
    // 載好之後另外在背景解開成點陣圖。
    await imageLoaded(image);
    // 等解好才算這類魔物就緒：開戰那一刻就要畫老鼠，沒等的話第一格會在主執行緒當場解碼（實機追蹤）。
    // 開戰就要畫＝「正要用」：插隊、解好不會一進來就被當罕用圖放掉；最多等 0.8 秒，網路卡住就照舊畫 <img>
    await Promise.race([prepareDecodedAtlas(image, true), new Promise<void>((done) => setTimeout(done, 800))]);
  }))).then(() => { readyKinds.add(kind); });
  kindLoads.set(kind, load);
  try { await load; } finally { kindLoads.delete(kind); }
}

export async function preloadEnemyMotion(
  requested: readonly EnemyMotionKind[] = ['rat', 'ninja'],
): Promise<void> {
  await Promise.all([...new Set(requested)].map(preloadEnemyMotionKind));
}

export function enemyMotionDuration(kind: EnemyMotionKind, action: EnemyMotionAction): number {
  const data = kinds[kind];
  return data ? Math.round(timingFor(motionOf(data, action)).total) : 0;
}

function motionBounds(kind: MotionKind, wantedHeight: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const heightScale = wantedHeight / kind.native_height;
  for (const motion of actionsOf(kind)) {
    const scale = motion.scale * heightScale;
    const mirror = motion.mirror ?? kind.mirror;
    for (const frame of motion.frames) {
      const [, , width, height] = frame.rect;
      const [pivotX, pivotY] = frame.pivot;
      minX = Math.min(minX, (mirror ? pivotX - width : -pivotX) * scale);
      minY = Math.min(minY, -pivotY * scale);
      maxX = Math.max(maxX, (mirror ? pivotX : width - pivotX) * scale);
      maxY = Math.max(maxY, (height - pivotY) * scale);
    }
  }
  return {
    minX: Math.floor(minX),
    minY: Math.floor(minY),
    maxX: Math.ceil(maxX),
    maxY: Math.ceil(maxY),
  };
}

function frameAt(motion: Motion, elapsedMs: number): number {
  const { durations, total } = timingFor(motion);
  let elapsed = motion.loop && total > 0 ? elapsedMs % total : Math.min(elapsedMs, total);
  for (let index = 0; index < motion.frames.length; index += 1) {
    const duration = durations[index]!;
    if (elapsed < duration) return index;
    elapsed -= duration;
  }
  return Math.max(0, motion.frames.length - 1);
}

export function createEnemyMotionActor(
  kind: EnemyMotionKind,
  options: { height?: number; action?: EnemyMotionAction } = {},
): {
  element: HTMLCanvasElement;
  foot: Readonly<{ x: number; y: number }>;
  play(action: EnemyMotionAction): void;
  dispose(): void;
} {
  const kindData = kindOf(kind);
  const wantedHeight = Math.max(1, options.height ?? kindData.default_height);
  const bounds = motionBounds(kindData, wantedHeight);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const foot = Object.freeze({
    x: -bounds.minX,
    y: -bounds.minY,
  });

  const canvas = document.createElement('canvas');
  canvas.className = 'enemy-motion';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', kind === 'rat' ? '老鼠敵人' : kind === 'ninja' ? '忍者敵人' : kind === 'roomba_king' ? '掃地機器人王' : '鐵爪機關貓');
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.transform = `translateX(${-foot.x}px)`;
  canvas.style.bottom = `${-bounds.maxY}px`;

  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('無法建立敵人動畫的 2D 畫布');

  let action = options.action ?? 'idle';
  let startedAt: number | null = null;
  let raf = 0;
  let disposed = false;
  let drawnMotion: Motion | null = null;
  let drawnFrame: MotionFrame | undefined;

  const draw = (frameIndex: number): void => {
    const motion = motionOf(kindData, action);
    const frame = motion.frames[frameIndex] ?? motion.frames[0];
    if (!frame) return;
    if (drawnMotion === motion && drawnFrame === frame) return;
    const image = imageFor(motion.texture);
    // 載入失敗的圖 complete 也是 true、naturalWidth 為 0，拿去畫會丟例外
    if ('complete' in image && (!image.complete || image.naturalWidth === 0)) return;
    const source: CanvasImageSource = decodedAtlas(image) ?? image;
    if (source === image) void prepareDecodedAtlas(image, true);
    const [sourceX, sourceY, sourceWidth, sourceHeight] = frame.rect;
    const [pivotX, pivotY] = frame.pivot;
    const scale = motion.scale * wantedHeight / kindData.native_height;
    // 老鼠待機／受擊原圖朝左，其餘原圖朝右；依動作翻轉並共用同一落地基準。
    const mirror = motion.mirror ?? kindData.mirror;
    const destinationX = (mirror ? width - foot.x : foot.x) - pivotX * scale;
    const destinationY = -pivotY * scale - bounds.minY;
    context.setTransform(mirror ? -dpr : dpr, 0, 0, dpr, mirror ? width * dpr : 0, 0);
    context.clearRect(0, 0, width, height);
    context.drawImage(
      source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destinationX,
      destinationY,
      sourceWidth * scale,
      sourceHeight * scale,
    );
    drawnMotion = motion;
    drawnFrame = frame;
  };

  const tick = (now: number): void => {
    raf = 0;
    if (disposed) return;
    if (startedAt === null) startedAt = now;
    const elapsed = Math.max(0, now - startedAt);
    const current = motionOf(kindData, action);
    draw(frameAt(current, elapsed));
    // 只有一格的循環（兩種魔物的待機都是）畫好就不會再變：不必每一拍都醒來（2026-09-23 效能）。
    // 場上每一隻都在每一拍要下一格的話，主執行緒整場都停不下來，CSS 動畫也被拖著每一拍重算樣式
    //（實測閒置 3 秒、CPU 降速 4 倍：主執行緒忙 1.8～2.2 秒）。下一次 play() 會重新排。
    // 還沒畫上去（圖還沒載好）就照舊每一拍再試。
    if (current.loop && current.frames.length <= 1 && drawnMotion === current) return;
    if (current.loop || elapsed < enemyMotionDuration(kind, action)) {
      raf = window.requestAnimationFrame(tick);
    }
  };

  const schedule = (): void => {
    if (!disposed && raf === 0) raf = window.requestAnimationFrame(tick);
  };

  const play = (next: EnemyMotionAction): void => {
    if (disposed) return;
    action = next;
    startedAt = null;
    drawnMotion = null;
    draw(0);
    schedule();
  };

  draw(0);
  schedule();

  return {
    element: canvas,
    foot,
    play,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (raf !== 0) window.cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
