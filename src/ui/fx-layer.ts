import cueTable from './fx/cues.json';
import { fileUrl } from './assets';
import { decodedAtlas, imageLoaded, prepareDecodedAtlas } from './decoded-atlas';
import { loadHeavy } from './heavy-lane';

/**
 * 魔物特效圖層（2026-10-01，盤點裁決第 2 題，使用者同意）。
 *
 * 在魔物（或被打的那一位）的立繪框裡疊一張逐格特效畫布：大爆炸、小爆炸、煙霧（Flow 新生，`tools/pack_fx.py` 打包）。
 * **資料驅動**：什麼時候、在誰身上、放哪一支、多大、多快，全寫在 `fx/cues.json`（格式見 docs/特效圖層_20261001.md 第 5 節），
 * 程式只認幾種時機（倒下、出某一招、換階段、站著時一直有的氣場），之後「師父」那條線照同一個格式加提示就能接。
 *
 * 規矩：
 * - **不擋點擊**（`pointer-events: none`），**疊在名字、血條、牌子底下**（前面那層 z-index 1，跟逐格畫布同層、排在它後面＝畫在它上面；
 *   名字、血條、牌子是 2，意圖牌 6）。後面那層插在立繪框最前面、z-index 0：畫在魔物身體後面。
 * - **不等圖**：特效圖集還沒下載好就這一次不放（不卡、不插隊）；用到才在背景排隊下載（大檔那一條、不插隊）。
 * - 立繪框被重畫換掉時（挨打、整頁重畫），每一格都重新找宿主、搬過去，播到一半不中斷（跟變身煙同一個做法）。
 * - 不降畫質：圖集是來源原尺寸，畫布照裝置像素比放大（最多 2 倍），跟逐格動作一樣。
 */

export type FxEvent = 'death' | 'change' | 'attack' | 'aura' | `move:${string}`;

export type FxCue = Readonly<{
  /** 誰的：逐格動作那一套（`iron_claw_p2`），或 `enemy:<魔物編號>`、`enemy:<魔物編號>@<階段>`（階段 0 起算；師父這種沒有逐格動作的用這個） */
  owner: string;
  /** 什麼時候：death（倒下）、change（換階段那一刻）、attack（出任何攻擊招）、move:<招式名>（出這一招）、aura（站著時一直有，循環） */
  on: string;
  /** 哪一支特效（`fx/sprites/<名>.json`） */
  fx: string;
  /** 開演後幾毫秒；寫字串＝那一段逐格動作的關鍵格名（hit、spark、fall⋯⋯，`pack_side_motion.py` 換算成毫秒寫在 marks） */
  at?: number | string;
  /** 放在誰身上：self（這隻魔物，預設）、target（這一招打到的那一位） */
  host?: 'self' | 'target';
  /** 位置：以宿主立繪框的高度為 1。x 往右為正、y 從腳底往上 */
  x?: number;
  y?: number;
  /** 特效原尺寸的幾倍（1＝來源 1 像素畫成戰場 1 像素） */
  scale?: number;
  /** 播放速度（1＝每秒 12 格，來源 24 格每 2 格取 1） */
  speed?: number;
  /** front：畫在魔物身體前面（預設）；back：畫在身體後面 */
  layer?: 'front' | 'back';
  /** 循環播（aura 一定循環；其他時機寫 true 也循環，直到宿主不見或被 stop） */
  loop?: boolean;
  /** 左右翻過來 */
  flip?: boolean;
  /** 停下時淡出幾毫秒（循環的停下、或宿主倒下） */
  fadeOutMs?: number;
}>;

type FxFrame = { rect: [number, number, number, number]; pivot: [number, number]; duration: number };
type FxSprite = { texture: string; scale: number; size?: [number, number]; frames: FxFrame[] };

const CUES: readonly FxCue[] = (cueTable as { cues: FxCue[] }).cues;

/** 這幾個「誰」在這個時機要放的提示（照表上的順序） */
export function fxCuesFor(owners: readonly (string | undefined)[], on: string, cues: readonly FxCue[] = CUES): FxCue[] {
  const set = new Set(owners.filter((o): o is string => !!o));
  return cues.filter((cue) => set.has(cue.owner) && cue.on === on);
}

/** 這幾個「誰」整場可能用到的特效（開打時背景下載用） */
export function fxNamesFor(owners: readonly (string | undefined)[], cues: readonly FxCue[] = CUES): string[] {
  const set = new Set(owners.filter((o): o is string => !!o));
  return [...new Set(cues.filter((cue) => set.has(cue.owner)).map((cue) => cue.fx))];
}

/** 一隻魔物在這個階段的「誰」：逐格動作那一套＋魔物編號（含與不含階段） */
export function fxOwnersOf(enemyId: string, phase: number, kind?: string): string[] {
  return [kind, `enemy:${enemyId}`, `enemy:${enemyId}@${phase}`].filter((o): o is string => !!o);
}

/** 提示的開演時間：數字照用；關鍵格名照那一段動作的 marks 換算，查不到就 0 */
export function fxCueDelay(cue: FxCue, marks: Readonly<Record<string, number>> | undefined): number {
  if (typeof cue.at === 'number') return Math.max(0, cue.at);
  if (typeof cue.at === 'string') return Math.max(0, marks?.[cue.at] ?? 0);
  return 0;
}

/**
 * 畫布的大小與擺法（純計算，測試直接驗）：所有格子以中心點對齊後的外框，乘上倍率。
 * 回傳畫布寬高、中心點在畫布裡的位置。
 */
export function fxBounds(sprite: Readonly<FxSprite>, scale: number): { width: number; height: number; cx: number; cy: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const k = sprite.scale * scale;
  for (const frame of sprite.frames) {
    const [, , w, h] = frame.rect;
    const [px, py] = frame.pivot;
    minX = Math.min(minX, -px * k);
    minY = Math.min(minY, -py * k);
    maxX = Math.max(maxX, (w - px) * k);
    maxY = Math.max(maxY, (h - py) * k);
  }
  return { width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY), cx: -Math.floor(minX), cy: -Math.floor(minY) };
}

/** 播到第幾格（超過總長：循環的繞回、不循環的回 -1＝播完） */
export function fxFrameAt(sprite: Readonly<FxSprite>, elapsedMs: number, speed: number, loop: boolean): number {
  const durations = sprite.frames.map((f) => (f.duration * 1000) / Math.max(0.01, speed));
  const total = durations.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let t = Math.max(0, elapsedMs);
  if (t >= total) {
    if (!loop) return -1;
    t %= total;
  }
  for (let i = 0; i < durations.length; i += 1) {
    if (t < durations[i]!) return i;
    t -= durations[i]!;
  }
  return durations.length - 1;
}

/* ---------- 資料與圖集 ---------- */

/** tsconfig 不吃 vite/client：`import.meta.glob` 的宣告在 enemy-motion.ts（全域的 ImportMeta） */
const spriteLoaders = import.meta.glob<{ default: unknown }>('./fx/sprites/*.json');
const sprites = new Map<string, FxSprite>();
const spriteLoads = new Map<string, Promise<FxSprite | undefined>>();
const images = new Map<string, HTMLImageElement>();

function loadSprite(name: string): Promise<FxSprite | undefined> {
  const known = sprites.get(name);
  if (known) return Promise.resolve(known);
  const pending = spriteLoads.get(name);
  if (pending) return pending;
  const loader = spriteLoaders[`./fx/sprites/${name}.json`];
  if (!loader) return Promise.resolve(undefined);
  const load = loader().then((module) => {
    const data = ((module as { default?: unknown }).default ?? module) as FxSprite;
    sprites.set(name, data);
    return data;
  }).catch(() => undefined).finally(() => { spriteLoads.delete(name); });
  spriteLoads.set(name, load);
  return load;
}

function drawable(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return image !== undefined && !('complete' in image && (!image.complete || image.naturalWidth === 0));
}

/** 這支特效現在畫得出來嗎（資料與圖集都到了）。**不會**因為問了就開始抓 */
export function fxReady(name: string): boolean {
  const sprite = sprites.get(name);
  return sprite !== undefined && drawable(images.get(sprite.texture));
}

/**
 * 背景下載這幾支特效（**不插隊**，走大檔那一條排在後面）；下載好再排背景解開，第一次放時不在主執行緒解碼。
 * 失敗的從快取拿掉，下次再試。由 combat.ts 決定什麼時候排（排在這一場的魔物動作後面，見那邊的下載順序）。
 */
export async function prefetchFx(names: readonly string[]): Promise<void> {
  for (const name of names) {
    const sprite = await loadSprite(name);
    if (!sprite) continue;
    let image = images.get(sprite.texture);
    if (!image) {
      image = new Image();
      images.set(sprite.texture, image);
    }
    await loadHeavy(image, fileUrl(sprite.texture), false);
    try {
      await imageLoaded(image);
      void prepareDecodedAtlas(image, false);
    } catch { if (images.get(sprite.texture) === image) images.delete(sprite.texture); }
  }
}

/* ---------- 畫面 ---------- */

/** 這張畫布後面還有不是特效的東西嗎（逐格畫布、立繪⋯⋯） */
function hasNonFxAfter(canvas: Element): boolean {
  for (let n = canvas.nextSibling as (Element & { classList?: DOMTokenList }) | null; n; n = n.nextSibling as typeof n) {
    if (!n.classList?.contains('fx-layer')) return true;
  }
  return false;
}

export type FxHost = () => HTMLElement | null | undefined;

export type FxHandle = { element: HTMLCanvasElement; stop(fadeMs?: number): void;
  /** 只停、不拔（換場時舊畫面還要墊在底下淡出） */
  halt(): void; readonly done: boolean };

/**
 * 在宿主（立繪框）裡放一支特效。`host` 每一拍都重新找一次：框被重畫換掉就搬到新框，找不到（那一格不見了）就收掉。
 * 圖集還沒好就回 undefined（這一次不放）。`delayMs` 之後才掛上去開演。
 */
export function playFx(cue: FxCue, host: FxHost, delayMs = 0, env: FxEnv = defaultEnv): FxHandle | undefined {
  const sprite = sprites.get(cue.fx);
  const image = sprite ? images.get(sprite.texture) : undefined;
  if (!sprite || !drawable(image)) return undefined;
  const first = host();
  if (!first) return undefined;
  const boxH = env.hostHeight(first);
  const scale = cue.scale ?? 1;
  const bounds = fxBounds(sprite, scale);
  const loop = cue.loop === true || cue.on === 'aura';
  const speed = cue.speed ?? 1;
  const back = cue.layer === 'back';
  const canvas = env.createCanvas();
  canvas.className = `fx-layer${back ? ' fx-back' : ''}`;
  canvas.setAttribute('aria-hidden', 'true');
  const offX = (cue.x ?? 0) * boxH;
  const offY = (cue.y ?? 0) * boxH;
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '50%',
    // 中心點放在「腳底往上 offY、往右 offX」：畫布下緣在中心點下面 (height - cy)
    bottom: `${Math.round(offY - (bounds.height - bounds.cy))}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    transform: `translateX(${Math.round(offX - bounds.cx)}px)${cue.flip ? ' scaleX(-1)' : ''}`,
    zIndex: back ? '0' : '1',
    pointerEvents: 'none',
    maxWidth: 'none',
    maxHeight: 'none',
  });
  const dpr = Math.min(2, Math.max(1, env.dpr()));
  canvas.width = Math.ceil(bounds.width * dpr);
  canvas.height = Math.ceil(bounds.height * dpr);
  const context = canvas.getContext('2d');
  let startedAt: number | null = null;
  let raf = 0;
  let timer = 0;
  let finished = false;
  let drawn = -1;
  let fading = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    if (raf) env.cancelFrame(raf);
    if (timer) env.clearTimer(timer);
    raf = 0;
    canvas.remove();
  };
  const attach = (): boolean => {
    const box = host();
    if (!box) return false;
    if (back) {
      if (canvas.parentNode !== box) box.insertBefore(canvas, box.firstChild?.nextSibling ?? null);   // 插在地上的影子後面、立繪前面
    }
    // 前面那層要排在框的最後：主角、魔物的逐格畫布也是 z-index 1，重掛時會被排到後面、把特效蓋住（實測燈籠妖吐火的爆炸整團被主角擋掉）。
    // 後面只剩別的特效畫布就不搬（兩支前層特效同框時不互相搬來搬去，審查 2026-10-01 低）
    else if (canvas.parentNode !== box || hasNonFxAfter(canvas)) box.append(canvas);
    return true;
  };
  const draw = (index: number): void => {
    if (!context || index === drawn) return;
    const frame = sprite.frames[index];
    if (!frame) return;
    const source: CanvasImageSource = decodedAtlas(image) ?? image;
    if (source === image) void prepareDecodedAtlas(image, true);
    const [sx, sy, sw, sh] = frame.rect;
    const k = sprite.scale * scale;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.drawImage(source, sx, sy, sw, sh, bounds.cx - frame.pivot[0] * k, bounds.cy - frame.pivot[1] * k, sw * k, sh * k);
    drawn = index;
  };
  const tick = (now: number): void => {
    raf = 0;
    if (finished) return;
    if (!attach()) { finish(); return; }
    // 延遲是負的＝該開演的時間已經過了（倒下片段比特效早開演）：從那個進度接著播
    if (startedAt === null) startedAt = now - Math.max(0, -delayMs);
    const index = fxFrameAt(sprite, now - startedAt, speed, loop);
    if (index < 0) { finish(); return; }
    draw(index);
    raf = env.requestFrame(tick);
  };
  const begin = (): void => {
    timer = 0;
    if (finished) return;
    if (!attach()) { finish(); return; }
    draw(0);
    raf = env.requestFrame(tick);
  };
  if (delayMs > 0) timer = env.setTimer(begin, delayMs);
  else begin();

  return {
    element: canvas,
    get done() { return finished; },
    halt() {
      finished = true;
      if (raf) env.cancelFrame(raf);
      if (timer) env.clearTimer(timer);
      raf = 0;
      timer = 0;
    },
    stop(fadeMs = cue.fadeOutMs ?? 0) {
      if (finished || fading) return;
      if (fadeMs <= 0 || !canvas.parentNode) { finish(); return; }
      fading = true;
      canvas.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: fadeMs, fill: 'forwards', easing: 'ease-out' });
      timer = env.setTimer(finish, fadeMs);
    },
  };
}

/** 瀏覽器那幾支（測試換成假的） */
export type FxEnv = {
  createCanvas(): HTMLCanvasElement;
  hostHeight(box: HTMLElement): number;
  dpr(): number;
  requestFrame(cb: (now: number) => void): number;
  cancelFrame(id: number): void;
  setTimer(cb: () => void, ms: number): number;
  clearTimer(id: number): void;
};

const defaultEnv: FxEnv = {
  createCanvas: () => document.createElement('canvas'),
  // 立繪框的高（版面像素，不受舞台縮放影響）：魔物看 .sprite（被逐格畫布蓋住時也還佔著位子），沒有就看框本身
  hostHeight: (box) => box.querySelector<HTMLElement>('.sprite')?.offsetHeight || box.offsetHeight || 200,
  dpr: () => window.devicePixelRatio || 1,
  requestFrame: (cb) => window.requestAnimationFrame(cb),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  setTimer: (cb, ms) => window.setTimeout(cb, ms),
  clearTimer: (id) => window.clearTimeout(id),
};

/**
 * 一場戰鬥的特效圖層：記著正在放的，換場時一起停（只停、不拔，跟逐格畫布一樣：舊畫面墊在底下淡出那 220 毫秒還看得到）。
 * `aura`（站著時一直有的氣場，給師父用）：每次重畫那一格時叫 `syncAura`，該有的補上、不該有的（換階段、倒下、表上沒有了）淡出收掉。
 */
export function createFxLayer(env: FxEnv = defaultEnv) {
  const live = new Set<FxHandle>();
  const auras = new Map<string, FxHandle>();
  const track = (handle: FxHandle | undefined): FxHandle | undefined => {
    if (handle) live.add(handle);
    for (const h of live) if (h.done) live.delete(h);
    return handle;
  };
  return {
    /** 放一個時機的所有提示。`hostOf` 照提示的 host（self／target）給宿主；`marks`＝這一段動作的關鍵格（毫秒） */
    fire(cues: readonly FxCue[], hostOf: (cue: FxCue) => FxHost | undefined, marks?: Readonly<Record<string, number>>,
      /** 這一段動作已經演了幾毫秒（倒下片段比這裡早開演時扣掉，特效才對得上片段裡的那一格） */
      elapsedMs = 0): FxHandle[] {
      const out: FxHandle[] = [];
      for (const cue of cues) {
        const host = hostOf(cue);
        if (!host) continue;
        const handle = track(playFx(cue, host, fxCueDelay(cue, marks) - Math.max(0, elapsedMs), env));
        if (handle) out.push(handle);
      }
      return out;
    },
    /**
     * 站著時一直有的氣場：`key`＝這一隻（例 `e12`）。`cues`＝這一隻這一刻該有的 aura 提示（倒下了傳空的）。
     * 已經在放的不重來（循環照跑、框換了自己會搬），表上沒有的淡出收掉。
     */
    syncAura(key: string, cues: readonly FxCue[], host: FxHost): void {
      const want = new Map<string, FxCue>(cues.map((cue, i) => [`${key}|${cue.fx}|${i}|${cue.owner}`, cue]));
      for (const [id, handle] of auras) {
        if (!id.startsWith(`${key}|`)) continue;
        if (!want.has(id) || handle.done) {
          handle.stop();
          auras.delete(id);
        }
      }
      for (const [id, cue] of want) {
        if (auras.has(id)) continue;
        const handle = track(playFx({ ...cue, loop: true }, host, fxCueDelay(cue, undefined), env));
        if (handle) auras.set(id, handle);
      }
    },
    /** 換場：全部停（不拔） */
    dispose(): void {
      for (const handle of live) handle.halt();
      for (const handle of auras.values()) handle.halt();
      live.clear();
      auras.clear();
    },
    /** 測試用 */
    get size(): number { for (const h of live) if (h.done) live.delete(h); return live.size; },
  };
}

/** 測試用：直接塞資料與圖集 */
export function _setFxForTest(name: string, sprite: FxSprite | undefined, image?: HTMLImageElement): void {
  if (!sprite) { sprites.delete(name); return; }
  sprites.set(name, sprite);
  if (image) images.set(sprite.texture, image);
}
