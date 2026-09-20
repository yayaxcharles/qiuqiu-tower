import { fileUrl } from './assets';

export type FrameMotionFrame = Readonly<{
  rect: readonly [number, number, number, number];
  pivot: readonly [number, number];
  duration: number;
}>;

export type FrameMotion = Readonly<{
  texture: string;
  scale: number;
  loop: boolean;
  frames: readonly FrameMotionFrame[];
}>;

export type FrameMotionPlayOptions = Readonly<{
  elapsed?: number;
  waves?: number;
}>;

export type FrameMotionActor<Action extends string> = {
  element: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly foot: Readonly<{ x: number; y: number }>;
  play(action: Action, options?: FrameMotionPlayOptions): void;
  dispose(): void;
};

type ResolvedFrameMotion = Readonly<{
  key: string;
  elapsed: number;
  loop?: boolean;
}>;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const timings = new WeakMap<FrameMotion, { durations: number[]; total: number }>();

function timingFor(motion: FrameMotion): { durations: number[]; total: number } {
  const cached = timings.get(motion);
  if (cached) return cached;
  const durations = motion.frames.map((frame) => frame.duration * 1000);
  const timing = { durations, total: durations.reduce((sum, duration) => sum + duration, 0) };
  timings.set(motion, timing);
  return timing;
}

export function frameMotionDuration(motion: FrameMotion): number {
  return Math.round(timingFor(motion).total);
}

export function createFrameMotionSet<Action extends string>(config: Readonly<{
  motions: Readonly<Record<string, FrameMotion>>;
  nativeHeight: number;
  defaultHeight?: number;
  initialAction: Action;
  className: string;
  ariaLabel: string;
  /** 持續狀態的代表畫格；非循環動作先播完，再以該姿勢呼吸。 */
  restFrames?: Readonly<Partial<Record<Action, number>>>;
  resolve(action: Action, elapsed: number, options: FrameMotionPlayOptions): ResolvedFrameMotion;
  duration(action: Action, options: FrameMotionPlayOptions): number;
}>): Readonly<{
  preload(): Promise<void>;
  ready(): boolean;
  createActor(options?: { height?: number; action?: Action }): FrameMotionActor<Action>;
}> {
  const images = new Map<string, HTMLImageElement>();
  let loaded = false;

  const imageFor = (motion: FrameMotion): HTMLImageElement => {
    const url = fileUrl(motion.texture);
    const cached = images.get(url);
    if (cached) return cached;
    const image = new Image();
    image.src = url;
    images.set(url, image);
    return image;
  };

  const preload = async (): Promise<void> => {
    const unique = new Map<string, FrameMotion>();
    for (const motion of Object.values(config.motions)) unique.set(fileUrl(motion.texture), motion);
    await Promise.all([...unique.values()].map(async (motion) => {
      const image = imageFor(motion);
      if (typeof image.decode === 'function') await image.decode();
    }));
    loaded = true;
  };

  const boundsFor = (height: number): Bounds => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const heightScale = height / config.nativeHeight;
    for (const [key, motion] of Object.entries(config.motions)) {
      const scale = motion.scale * heightScale;
      const restFrame = motion.frames[config.restFrames?.[key as Action] ?? (key === 'idle' ? 0 : -1)];
      for (const frame of motion.frames) {
        const [, , width, frameHeight] = frame.rect;
        const [pivotX, pivotY] = frame.pivot;
        minX = Math.min(minX, -pivotX * scale);
        const breath = frame === restFrame ? 1.025 : 1;
        minY = Math.min(minY, -pivotY * scale * breath);
        maxX = Math.max(maxX, (width - pivotX) * scale);
        maxY = Math.max(maxY, (frameHeight - pivotY) * scale * breath);
      }
    }
    return {
      minX: Math.floor(minX),
      minY: Math.floor(minY),
      maxX: Math.ceil(maxX),
      maxY: Math.ceil(maxY),
    };
  };

  const frameAt = (motion: FrameMotion, elapsedMs: number, loop: boolean): number => {
    const { durations, total } = timingFor(motion);
    let elapsed = loop && total > 0 ? elapsedMs % total : Math.min(elapsedMs, total);
    for (let index = 0; index < durations.length; index += 1) {
      if (elapsed < durations[index]!) return index;
      elapsed -= durations[index]!;
    }
    return Math.max(0, motion.frames.length - 1);
  };

  const createActor = (options: { height?: number; action?: Action } = {}): FrameMotionActor<Action> => {
    const wantedHeight = Math.max(1, options.height ?? config.defaultHeight ?? config.nativeHeight);
    const bounds = boundsFor(wantedHeight);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const foot = Object.freeze({ x: -bounds.minX, y: -bounds.minY });
    const canvas = document.createElement('canvas');
    canvas.className = config.className;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', config.ariaLabel);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.transform = `translateX(${-foot.x}px)`;
    canvas.style.bottom = `${-bounds.maxY}px`;

    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('無法建立逐格動作的 2D 畫布');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    let action = options.action ?? config.initialAction;
    let playOptions: FrameMotionPlayOptions = {};
    let startedAt: number | null = null;
    let elapsedOffset = 0;
    let raf = 0;
    let disposed = false;
    let drawnMotion: FrameMotion | null = null;
    let drawnFrame: FrameMotionFrame | undefined;
    let drawnBreath = 1;

    const draw = (resolved: ResolvedFrameMotion): void => {
      const motion = config.motions[resolved.key] ?? config.motions[config.initialAction];
      if (!motion) return;
      // 持續狀態的不同繪圖不能當成呼吸輪播，否則頭、手、身形會反覆跳動。
      // 只對指定的狀態使用自己的代表姿勢；翻肚等一次性轉姿先照原節奏播完。
      const restFrame = action === resolved.key
        ? config.restFrames?.[action] ?? (action === 'idle' ? 0 : undefined)
        : undefined;
      const settleAfter = (resolved.loop ?? motion.loop) ? 0 : frameMotionDuration(motion);
      const resting = restFrame !== undefined && resolved.elapsed >= settleAfter;
      const frame = motion.frames[resting ? restFrame : frameAt(motion, resolved.elapsed, resolved.loop ?? motion.loop)] ?? motion.frames[0];
      if (!frame) return;
      const breathPhase = ((resolved.elapsed - settleAfter) % 6200) / 6200;
      const breath = resting ? 1 + .025 * Math.sin(Math.PI * breathPhase) ** 2 : 1;
      if (drawnMotion === motion && drawnFrame === frame && drawnBreath === breath) return;
      const image = imageFor(motion);
      if ('complete' in image && !image.complete) return;
      const [sourceX, sourceY, sourceWidth, sourceHeight] = frame.rect;
      const [pivotX, pivotY] = frame.pivot;
      const scale = motion.scale * wantedHeight / config.nativeHeight;
      const drawX = -pivotX * scale - bounds.minX;
      const drawY = -pivotY * scale * breath - bounds.minY;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight,
        drawX, drawY, sourceWidth * scale, sourceHeight * scale * breath);
      drawnMotion = motion;
      drawnFrame = frame;
      drawnBreath = breath;
    };

    const tick = (now: number): void => {
      raf = 0;
      if (disposed) return;
      if (startedAt === null) startedAt = now;
      const elapsed = elapsedOffset + Math.max(0, now - startedAt);
      const resolved = config.resolve(action, elapsed, playOptions);
      draw(resolved);
      const motion = config.motions[resolved.key] ?? config.motions[config.initialAction];
      const resting = action === resolved.key && config.restFrames?.[action] !== undefined;
      if (resting || (resolved.loop ?? motion?.loop) || elapsed < config.duration(action, playOptions)) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    const schedule = (): void => {
      if (!disposed && raf === 0) raf = window.requestAnimationFrame(tick);
    };

    const play = (next: Action, nextOptions: FrameMotionPlayOptions = {}): void => {
      if (disposed) return;
      action = next;
      playOptions = nextOptions;
      const requestedElapsed = nextOptions.elapsed ?? 0;
      elapsedOffset = Number.isFinite(requestedElapsed) ? Math.max(0, requestedElapsed) : 0;
      startedAt = null;
      drawnMotion = null;
      draw(config.resolve(action, elapsedOffset, playOptions));
      schedule();
    };

    draw(config.resolve(action, 0, playOptions));
    schedule();

    return {
      element: canvas,
      width,
      height,
      foot,
      play,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (raf !== 0) window.cancelAnimationFrame(raf);
        raf = 0;
      },
    };
  };

  return { preload, ready: () => loaded, createActor };
}
