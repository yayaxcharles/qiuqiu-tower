import { fileUrl } from './assets';
import { decodedAtlas, imageLoaded, prepareDecodedAtlas } from './decoded-atlas';
import { loadHeavy } from './heavy-lane';

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

/** 停在代表畫格上呼吸時往後試算的步距（約一拍）與最多看多遠（跟久未掛入的慢速檢查同一個 250 毫秒） */
const QUIET_STEP_MS = 16;
const QUIET_MAX_MS = 250;

export function createFrameMotionSet<Action extends string>(config: Readonly<{
  motions: Readonly<Record<string, FrameMotion>>;
  /**
   * 不解碼預載的動作。待機狀態圖（掛彩、氣勢…）一場戰鬥多半只用到一兩種，
   * 全部解碼預載每位同伴要多解開十張大圖，記憶體吃緊時會把出招圖擠出快取，出手又要當場重新解碼。
   * 所以預載完主要動作後只在背景「下載」它們、不解碼，真正畫到才解；還沒到時畫布停在上一格。
   * 不能等用到才下載：蜷縮、肚子餓只亮 0.7 秒左右，慢速網路第一次會來不及（實機 2026-09-21）。
   */
  deferred?: ReadonlySet<string>;
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
  /** 這個動作的圖現在畫得出來嗎：延後下載的要真的載好（壞圖不算），其他跟著預載走。 */
  drawable(action: string): boolean;
  createActor(options?: { height?: number; action?: Action }): FrameMotionActor<Action>;
}> {
  const images = new Map<string, HTMLImageElement>();
  // 載入失敗的圖 complete 也是 true、naturalWidth 是 0，拿去 drawImage 會丟例外（整個戰鬥畫面重畫中斷）。
  // 測試用的假影像沒有 complete，視為可畫。
  const usable = (image: HTMLImageElement): boolean =>
    !('complete' in image) || (image.complete && image.naturalWidth !== 0);
  let loaded = false;

  /**
   * 網址交給大檔那一條去設（`heavy-lane.ts`，2026-09-23）：同時抓幾張有上限、開場那一批小圖抓完才開始。
   * `urgent`＝正要畫它，排隊的話插到最前面。
   */
  const imageFor = (motion: FrameMotion, urgent = false): HTMLImageElement => {
    const url = fileUrl(motion.texture);
    const cached = images.get(url);
    if (cached) {
      if (urgent) void loadHeavy(cached, url, true);
      return cached;
    }
    const image = new Image();
    images.set(url, image);
    void loadHeavy(image, url, urgent);
    return image;
  };

  // 開局預載、戰鬥畫面、過關轉場都會叫 preload；進行中或已成功就共用同一次，
  // 不再對同一批圖重等一輪。失敗就清掉，下次重試（稽核 2026-09-21 晚 低-6）
  let preloading: Promise<void> | null = null;
  const preload = (): Promise<void> => {
    preloading ??= preloadOnce().catch((error: unknown) => { preloading = null; throw error; });
    return preloading;
  };
  const preloadOnce = async (): Promise<void> => {
    const unique = new Map<string, FrameMotion>();
    for (const [key, motion] of Object.entries(config.motions)) {
      if (!config.deferred?.has(key)) unique.set(fileUrl(motion.texture), motion);
    }
    // 只等「載好」（load），不呼叫 decode()：畫布不吃 decode() 的結果（實機追蹤 2026-09-21），
    // 白解一次還讓每隻貓多占 89～203 MB（清理 2026-09-22，見 decoded-atlas.ts 的 `imageLoaded`）。
    // 壞圖（complete 但 naturalWidth 是 0）不能當成載好；失敗仍要往外丟，
    // preload.ts 的「改用普通立繪」退路才會接手（稽核 2026-09-21 第 6 點）。
    // 先等大檔那一條排到它、設好網址（`loadHeavy`），再等載好：還在排隊的圖沒有網址，`imageLoaded` 會當成壞圖
    await Promise.all([...unique.values()].map(async (motion) => {
      const image = imageFor(motion);
      try {
        await loadHeavy(image, fileUrl(motion.texture));
        await imageLoaded(image);
      } catch (error: unknown) {
        // 失敗的圖從快取拿掉，下次預載重試時才會真的重新下載
        images.delete(fileUrl(motion.texture));
        throw error;
      }
    }));
    loaded = true;
    // 載好之後另外在背景解開成點陣圖，出手時才不用當場解碼
    for (const motion of unique.values()) void prepareDecodedAtlas(imageFor(motion));
    for (const [key, motion] of Object.entries(config.motions)) {
      if (!config.deferred?.has(key)) continue;
      const image = imageFor(motion);
      // 下載好也排進背景解開（排在最後，上限不夠時最先放），第一次進入狀態才不用當場解碼。
      // 排隊中的還沒有網址（`complete` 會是真的），所以等排到了再看
      void loadHeavy(image, fileUrl(motion.texture)).then(() => {
        if (image.complete) void prepareDecodedAtlas(image);
        else image.addEventListener?.('load', () => { void prepareDecodedAtlas(image); }, { once: true });
      });
    }
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
    canvas.style.transformOrigin = `${foot.x}px ${foot.y}px`;
    canvas.style.scale = '1';
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
    let appliedBreath = 1;
    let detachedFrames = 0;
    let slowTimer = 0;

    /** 這個時間點該畫哪一格、呼吸縮放多少（`draw` 與往後看的 `quietFor` 共用同一套算法） */
    const poseAt = (resolved: ResolvedFrameMotion) => {
      const motion = config.motions[resolved.key] ?? config.motions[config.initialAction];
      if (!motion) return undefined;
      // 持續狀態的不同繪圖不能當成呼吸輪播，否則頭、手、身形會反覆跳動。
      // 只對指定的狀態使用自己的代表姿勢；翻肚等一次性轉姿先照原節奏播完。
      const restFrame = action === resolved.key
        ? config.restFrames?.[action] ?? (action === 'idle' ? 0 : undefined)
        : undefined;
      const settleAfter = (resolved.loop ?? motion.loop) ? 0 : frameMotionDuration(motion);
      const resting = restFrame !== undefined && resolved.elapsed >= settleAfter;
      const frame = motion.frames[resting ? restFrame : frameAt(motion, resolved.elapsed, resolved.loop ?? motion.loop)] ?? motion.frames[0];
      if (!frame) return undefined;
      const breathPhase = ((resolved.elapsed - settleAfter) % 6200) / 6200;
      // 量化到千分位再比對：呼吸值是連續浮點數，直接比會每幀都不相等，
      // 等於每個待機角色每秒改 60 次行內樣式，把合成器的活搬回主執行緒（稽核 2026-09-21 第 2 點）。
      const breath = resting ? Math.round((1 + .025 * Math.sin(Math.PI * breathPhase) ** 2) * 1000) / 1000 : 1;
      return { motion, frame, breath, resting };
    };

    /**
     * 停在代表畫格上呼吸的時候，畫面還要多久才會變（2026-09-23 效能）。
     *
     * 那時候唯一會動的只有呼吸那個千分位的縮放（平均一秒八次、最快一秒十三次），原本卻每一拍都醒來：
     * 60 Hz 就是一秒 60 次，而只要有人每一拍要下一格，瀏覽器就每一拍都得把畫面上所有 CSS 動畫的樣式重算一遍
     *（實測閒置 3 秒、CPU 降速 4 倍：主執行緒忙 1.8～2.2 秒，樣式重算一秒 240 次）。
     * 這裡往後一格一格試算（照 `config.resolve` 算，速度倍率、換動作都照實），找到第一個會不一樣的時間點。
     * 回 0＝現在不是這種狀態（或這一格還沒真的畫上去），照舊每一拍醒；最多只看 `QUIET_MAX_MS`。
     */
    const quietFor = (elapsed: number): number => {
      const now = poseAt(config.resolve(action, elapsed, playOptions));
      if (!now?.resting || drawnMotion !== now.motion || drawnFrame !== now.frame || appliedBreath !== now.breath) return 0;
      for (let ahead = QUIET_STEP_MS; ahead < QUIET_MAX_MS; ahead += QUIET_STEP_MS) {
        const next = poseAt(config.resolve(action, elapsed + ahead, playOptions));
        if (!next || next.motion !== now.motion || next.frame !== now.frame || next.breath !== now.breath) return ahead;
      }
      return QUIET_MAX_MS;
    };

    const draw = (resolved: ResolvedFrameMotion): void => {
      const pose = poseAt(resolved);
      if (!pose) return;
      const { motion, frame, breath } = pose;
      // 呼吸只縮放既有畫格，維持腳底定位，不隨螢幕更新率重畫圖集。
      if (appliedBreath !== breath) {
        canvas.style.scale = breath === 1 ? '1' : `1 ${breath}`;
        appliedBreath = breath;
      }
      if (drawnMotion === motion && drawnFrame === frame) return;
      const image = imageFor(motion, true);   // 正要畫：還在大檔那一條排隊的話插到最前面
      if (!usable(image)) return;
      // 優先畫背景解開的點陣圖；還沒解好或被擠掉就照舊畫 <img>（當場解碼），並排一次背景解開給下一次
      const source: CanvasImageSource = decodedAtlas(image) ?? image;
      if (source === image) void prepareDecodedAtlas(image, true);
      const [sourceX, sourceY, sourceWidth, sourceHeight] = frame.rect;
      const [pivotX, pivotY] = frame.pivot;
      const scale = motion.scale * wantedHeight / config.nativeHeight;
      const drawX = -pivotX * scale - bounds.minX;
      const drawY = -pivotY * scale - bounds.minY;
      context.clearRect(0, 0, width, height);
      context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight,
        drawX, drawY, sourceWidth * scale, sourceHeight * scale);
      drawnMotion = motion;
      drawnFrame = frame;
    };

    const tick = (now: number): void => {
      raf = 0;
      if (disposed) return;
      if (startedAt === null) startedAt = now;
      const elapsed = elapsedOffset + Math.max(0, now - startedAt);
      const resolved = config.resolve(action, elapsed, playOptions);
      const detached = canvas.isConnected === false;
      if (!detached) draw(resolved);
      const motion = config.motions[resolved.key] ?? config.motions[config.initialAction];
      const resting = action === resolved.key && config.restFrames?.[action] !== undefined;
      // 未掛入時只等下一次機會；重新掛回仍能補畫終格，不重啟動作。
      // 但不能每幀空等：被拔掉又沒 dispose() 的畫布會永遠空轉（稽核 2026-09-21 第 3 點）。
      // 也不能直接停：戰鬥畫面掛回畫布時不一定呼叫 play()（待機姿勢沒變就不會），
      // 停了就永遠停在那一格。所以久未掛入改成每 250 毫秒看一次。
      detachedFrames = detached ? detachedFrames + 1 : 0;
      if (detachedFrames > 60) {
        if (slowTimer === 0) slowTimer = window.setTimeout(() => { slowTimer = 0; schedule(); }, 250);
        return;
      }
      if (detached || resting || (resolved.loop ?? motion?.loop) || elapsed < config.duration(action, playOptions)) {
        // 停在代表畫格上呼吸：睡到下一次呼吸變化的前一拍再醒（見 `quietFor`）；早一拍醒是為了照舊在變化後的第一拍畫上去
        // 沒有計時器可用（單元測試的假 window 只給 requestAnimationFrame）就照舊每一拍醒
        const quiet = detached || typeof window.setTimeout !== 'function' ? 0 : quietFor(elapsed);
        if (quiet > QUIET_STEP_MS * 2) {
          if (slowTimer === 0) slowTimer = window.setTimeout(() => { slowTimer = 0; schedule(); }, quiet - QUIET_STEP_MS);
          return;
        }
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
      detachedFrames = 0;
      startedAt = null;
      drawnMotion = null;
      // 換動作就不再照上一個動作的呼吸時間睡：那個時間點是照舊動作算的
      if (slowTimer !== 0) { window.clearTimeout(slowTimer); slowTimer = 0; }
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
        if (slowTimer !== 0) window.clearTimeout(slowTimer);
        slowTimer = 0;
      },
    };
  };

  const drawable = (action: string): boolean => {
    const motion = config.motions[action];
    if (!motion) return false;
    if (!config.deferred?.has(action)) return true;
    const image = images.get(fileUrl(motion.texture));
    return !!image && usable(image);
  };

  return { preload, ready: () => loaded, drawable, createActor };
}
