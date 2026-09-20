import motionData from './enemy-motion-data.json';
import { fileUrl } from './assets';
import './styles/enemy-motion.css';

export type EnemyMotionKind = 'rat' | 'ninja';
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
  actions: Record<EnemyMotionAction, Motion>;
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
const kinds = motionData.kinds as unknown as Record<EnemyMotionKind, MotionKind>;
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
  image.src = fileUrl(texture);
  images.set(texture, image);
  return image;
}

export function enemyMotionReady(kind: EnemyMotionKind): boolean {
  return readyKinds.has(kind);
}

async function preloadEnemyMotionKind(kind: EnemyMotionKind): Promise<void> {
  if (readyKinds.has(kind)) return;
  const pending = kindLoads.get(kind);
  if (pending) return pending;
  const textures = new Set<string>();
  for (const action of ACTIONS) textures.add(kinds[kind].actions[action].texture);
  const load = Promise.all([...textures].map(async (texture) => {
    const image = imageFor(texture);
    if (typeof image.decode === 'function') await image.decode();
  })).then(() => { readyKinds.add(kind); });
  kindLoads.set(kind, load);
  try { await load; } finally { kindLoads.delete(kind); }
}

export async function preloadEnemyMotion(
  requested: readonly EnemyMotionKind[] = ['rat', 'ninja'],
): Promise<void> {
  await Promise.all([...new Set(requested)].map(preloadEnemyMotionKind));
}

export function enemyMotionDuration(kind: EnemyMotionKind, action: EnemyMotionAction): number {
  return Math.round(timingFor(kinds[kind].actions[action]).total);
}

function motionBounds(kind: MotionKind, wantedHeight: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const heightScale = wantedHeight / kind.native_height;
  for (const action of ACTIONS) {
    const motion = kind.actions[action];
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
  const kindData = kinds[kind];
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
  canvas.setAttribute('aria-label', kind === 'rat' ? '老鼠敵人' : '忍者敵人');
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
    const motion = kindData.actions[action];
    const frame = motion.frames[frameIndex] ?? motion.frames[0];
    if (!frame) return;
    if (drawnMotion === motion && drawnFrame === frame) return;
    const image = imageFor(motion.texture);
    if ('complete' in image && !image.complete) return;
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
      image,
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
    const current = kindData.actions[action];
    draw(frameAt(current, elapsed));
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
