/**
 * 戰鬥畫面的環境光效（火光明暗、上緣兩團暖光、三層浮塵）畫在**同一張畫布**上（2026-09-29 效能）。
 *
 * 為什麼不用原本的 CSS：原本是五個蓋滿整個畫面的圖層各自在動（背景圖的亮度濾鏡動畫、暖光那層、
 * 三層浮塵各 1.2 倍大），瀏覽器每一格都要把這些大圖層重新疊一次。顯示晶片強的機器無感，
 * 但使用者朋友的 MacBook（Intel i5 內建顯示晶片、兩倍密度螢幕）戰鬥畫面明顯卡。
 * 用處理器模擬弱顯示晶片量到：戰鬥畫面每秒只畫得出 8 格，把這幾個動畫停掉就回到 170 格以上。
 * 使用者要求**特效全部留著、看起來一樣**，所以改成一張畫布照同樣的節奏、顏色、飄法畫出來：
 * 圖層從五個（約 6 個畫面大）變成一個，也不再每格對整張背景圖跑一次濾鏡。
 *
 * 數值照抄原本 combat.css 的 `torchlight`（5.7 秒）、`torchglow`（4.3 秒）、`mote-drift-a/b/c`（41／63／89 秒），
 * 改的時候兩邊對照這裡的表。時間用頁面時鐘算，戰鬥畫面重畫（整個換掉節點）時光效不會從頭跳回去。
 */

type Key = [t: number, v: number];

/** 分段 ease-in-out 插值（CSS `ease-in-out` 的近似：兩端緩、中間快） */
function track(keys: readonly Key[], period: number, now: number): number {
  const p = ((now / 1000) % period) / period;
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    const [t0, v0] = keys[i - 1]!;
    if (p <= t1) {
      const k = (p - t0) / (t1 - t0 || 1);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      return v0 + (v1 - v0) * e;
    }
  }
  return keys[keys.length - 1]![1];
}

// 背景亮度（原 `torchlight`：brightness 關鍵影格）
const LIGHT: readonly Key[] = [[0, 1], [0.17, 1.055], [0.31, 0.985], [0.52, 1.04], [0.63, 1.005], [0.81, 1.07], [1, 1]];
// 暖光層（原 `torchglow`：opacity 與上下飄、縮放）
const GLOW_OP: readonly Key[] = [[0, 0.85], [0.23, 1], [0.46, 0.7], [0.71, 0.95], [1, 0.85]];
const GLOW_Y: readonly Key[] = [[0, 0], [0.23, -4], [0.46, 2], [0.71, -2], [1, 0]];
const GLOW_S: readonly Key[] = [[0, 1], [0.23, 1.03], [0.46, 0.985], [0.71, 1.015], [1, 1]];
// 三層浮塵（原 `.motes i:nth-child(n)`：點的半徑、顏色、格距、飄移向量、週期；外層整體 opacity .5）
const MOTES = [
  { r: 1, soft: 1.6, rgb: '255,233,192', a: 0.8, w: 190, h: 150, dx: 190, dy: -150, sec: 41 },
  { r: 1.4, soft: 2.2, rgb: '255,220,168', a: 0.6, w: 270, h: 210, dx: -270, dy: -210, sec: 63 },
  { r: 2, soft: 3, rgb: '255,244,215', a: 0.4, w: 410, h: 330, dx: 140, dy: -330, sec: 89 },
] as const;

const W = 1280;
const H = 720;

/*
 * ===== 背景動效（2026-10-06 美術改版，使用者：「加一點點動效」「要考慮電腦爛的玩家」）=====
 *
 * 每張戰鬥背景一份小設定（`BG_FX`，鍵＝manifest 的 `bg/...`），畫在**同一張環境光畫布**上，不另開畫布、不加浮塵粒子：
 *  ① fog     薄霧：一張程式畫好的霧帶（開頁第一次用到才畫一次、之後重複用）整條橫向慢慢飄、首尾接起來循環
 *  ② beams   光束：斜的半透明光帶，只有透明度慢慢呼吸
 *  ③ lamps   燈籠：燈的位置與半徑，畫一團暖色徑向光、透明度微微閃
 *  ④ breathe 整張背景極慢的呼吸縮放 1.00→1.015→1.00、20 秒一輪：只改 `.battle-bg` 的 `transform`，
 *            跟著這張畫布每秒 30 次的節奏改（不另跑一條每秒 60 格的動畫），縮放中心放在牆腳那條線，角色的腳不會滑
 * 哪一項不要就在那張的設定裡拿掉（或寫 false）；沒有設定的背景（舊的九張與關主戰場）一項都不畫，跟改版前一模一樣。
 * 每一格只畫**這一張**背景自己那幾項，跟背景總共有幾張無關。
 * 座標是舞台座標（1280×720）。新背景都是 100% 鋪、不放大（進倉時就裁好讓牆腳落在 `floor` 那條線），所以圖上量到的位置就是舞台位置。
 *
 * 量測用的總開關：網址加 `?bgfx=0` 全關、`?bgfx=fog,lamps` 只開這幾項（`tools/perf/composite.mjs` 的 `PERF_QUERY`）。
 */
type Beam = Readonly<{ x: number; y: number; w: number; len: number; tilt: number; rgb: string; a: number }>;
type Lamp = Readonly<{ x: number; y: number; r: number; rgb?: string; a?: number }>;
export type BgFx = Readonly<{
  /** 牆腳在舞台上的 y（呼吸縮放的中心線）；預設 388 */
  floor?: number;
  /** 霧帶：中心 y、高度、最濃的不透明度、顏色、飄一整圈幾秒（預設 70） */
  fog?: Readonly<{ y: number; h: number; a: number; rgb?: string; sec?: number }> | false;
  /** 光束：頂端中心 (x, y)、頂端寬 w、長 len、往右斜多少（每往下 1 像素往右幾像素）、顏色、最亮的不透明度 */
  beams?: readonly Beam[] | false;
  /** 燈：中心、光暈半徑、顏色（預設暖橘）、最亮的不透明度（預設 .32） */
  lamps?: readonly Lamp[] | false;
  breathe?: boolean;
}>;

const WARM = '255,178,90';
export const BG_FX: Readonly<Record<string, BgFx>> = {
  // 第一關：清晨練功房（窗格斜光＋地上薄霧）
  'bg/art26_low_1': {
    breathe: true,
    fog: { y: 420, h: 130, a: 0.55, rgb: '240,228,205', sec: 80 },
    beams: [
      { x: 230, y: 70, w: 90, len: 320, tilt: -0.72, rgb: '255,226,160', a: 0.1 },
      { x: 620, y: 70, w: 100, len: 330, tilt: -0.72, rgb: '255,226,160', a: 0.12 },
      { x: 1030, y: 60, w: 100, len: 340, tilt: -0.72, rgb: '255,226,160', a: 0.12 },
    ],
    lamps: [{ x: 120, y: 30, r: 55, a: 0.28 }, { x: 1230, y: 22, r: 55, a: 0.28 }],
  },
  // 第一關：火把地牢（兩支火把＋拱門吹進來的藍霧）
  'bg/art26_low_2': {
    breathe: true,
    fog: { y: 410, h: 120, a: 0.6, rgb: '170,190,230', sec: 65 },
    lamps: [{ x: 360, y: 160, r: 120, rgb: '255,150,60', a: 0.34 }, { x: 905, y: 160, r: 120, rgb: '255,150,60', a: 0.34 }],
  },
  // 第一關：雨天倉庫（油燈＋窗口冷光）
  'bg/art26_low_3': {
    breathe: true,
    fog: { y: 410, h: 100, a: 0.4, rgb: '200,210,225', sec: 75 },
    beams: [{ x: 700, y: 140, w: 300, len: 260, tilt: 0.12, rgb: '200,215,235', a: 0.07 }],
    lamps: [{ x: 240, y: 120, r: 130, a: 0.36 }],
  },
  // 第二關：夕陽大廳（一排紙燈籠＋斜陽）
  'bg/art26_mid_1': {
    breathe: true,
    fog: { y: 415, h: 110, a: 0.35, rgb: '255,215,170', sec: 85 },
    beams: [
      { x: 520, y: 90, w: 80, len: 300, tilt: -0.8, rgb: '255,200,130', a: 0.09 },
      { x: 900, y: 90, w: 90, len: 320, tilt: -0.8, rgb: '255,200,130', a: 0.1 },
    ],
    lamps: [
      { x: 167, y: 29, r: 70 }, { x: 447, y: 29, r: 70 }, { x: 637, y: 24, r: 80 },
      { x: 833, y: 29, r: 70 }, { x: 1117, y: 29, r: 70 }, { x: 1104, y: 349, r: 50 },
    ],
  },
  // 第二關：燈籠祭夜廊（滿天燈籠，挑大的與欄杆上的石燈）
  'bg/art26_mid_2': {
    breathe: true,
    fog: { y: 410, h: 110, a: 0.35, rgb: '255,200,170', sec: 70 },
    lamps: [
      { x: 127, y: 47, r: 95, rgb: '255,120,60' }, { x: 1160, y: 53, r: 95, rgb: '255,120,60' }, { x: 637, y: 73, r: 70, rgb: '255,120,60' },
      { x: 187, y: 280, r: 45 }, { x: 640, y: 280, r: 45 }, { x: 987, y: 280, r: 45 }, { x: 1093, y: 280, r: 45 },
    ],
  },
  // 第二關：晨霧道場（格窗透進來的晨光）
  'bg/art26_mid_3': {
    breathe: true,
    fog: { y: 415, h: 130, a: 0.5, rgb: '238,236,240', sec: 90 },
    beams: [
      { x: 600, y: 60, w: 120, len: 330, tilt: -0.3, rgb: '255,240,210', a: 0.1 },
      { x: 830, y: 60, w: 110, len: 330, tilt: -0.3, rgb: '255,240,210', a: 0.1 },
    ],
    lamps: [{ x: 113, y: 73, r: 60 }, { x: 1040, y: 333, r: 50 }],
  },
  // 第三關：月夜雲海露台（石燈＋雲霧漫過地面）
  'bg/art26_top_1': {
    breathe: true,
    fog: { y: 405, h: 150, a: 0.6, rgb: '200,210,235', sec: 95 },
    lamps: [{ x: 107, y: 247, r: 70 }, { x: 460, y: 247, r: 70 }, { x: 807, y: 247, r: 70 }, { x: 1177, y: 247, r: 70 }],
  },
  // 第三關：雲上破曉涼亭（日出光芒）
  'bg/art26_top_2': {
    breathe: true,
    fog: { y: 405, h: 120, a: 0.45, rgb: '255,235,230', sec: 85 },
    beams: [
      { x: 687, y: 190, w: 60, len: 230, tilt: -0.6, rgb: '255,215,150', a: 0.1 },
      { x: 687, y: 190, w: 60, len: 230, tilt: 0.6, rgb: '255,215,150', a: 0.1 },
    ],
    lamps: [{ x: 69, y: 67, r: 60 }, { x: 637, y: 80, r: 60 }, { x: 1207, y: 60, r: 60 }, { x: 100, y: 333, r: 55 }, { x: 1173, y: 333, r: 55 }],
  },
  // 第三關：暮色旗幟露台（欄杆燈＋紫色雲霧）
  'bg/art26_top_3': {
    breathe: true,
    fog: { y: 405, h: 130, a: 0.5, rgb: '215,200,240', sec: 80 },
    lamps: [{ x: 47, y: 40, r: 90, rgb: '255,130,70' }, { x: 117, y: 287, r: 60 }, { x: 453, y: 293, r: 60 }, { x: 800, y: 293, r: 60 }, { x: 1157, y: 293, r: 60 }],
  },
};

type FxKind = 'fog' | 'beams' | 'lamps' | 'breathe';
let fxAllowed: Set<FxKind> | null = null;
function allowed(kind: FxKind): boolean {
  if (!fxAllowed) {
    const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('bgfx');
    fxAllowed = new Set<FxKind>(q === null ? ['fog', 'beams', 'lamps', 'breathe'] : (q.split(',') as FxKind[]));
  }
  return fxAllowed.has(kind);
}

/** 霧帶貼圖：640×128 的一條軟霧，左右接得起來（越過右緣的霧團在左緣再畫一次）。照顏色各畫一次、整頁共用 */
const fogTex = new Map<string, HTMLCanvasElement>();
function fogTexture(rgb: string): HTMLCanvasElement {
  let c = fogTex.get(rgb);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 640;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    // 固定的亂數種子：每次畫出來一樣
    let s = 7;
    const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    // 橫向拉長的橢圓霧團：上下半徑不超過離貼圖上下緣的距離，霧帶上下緣才是軟的、不會切出一條直線
    for (let i = 0; i < 30; i++) {
      const x = rnd() * 640;
      const y = 50 + rnd() * 28;
      const r = Math.min(y, 128 - y) - 2;
      const a = (0.14 + rnd() * 0.1).toFixed(3);
      for (const dx of [-640, 0, 640]) {
        g.save();
        g.translate(x + dx, y);
        g.scale(2.6, 1);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, `rgba(${rgb},${a})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr;
        g.fillRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
    }
  }
  fogTex.set(rgb, c);
  return c;
}

/** 幾個不同頻率的正弦疊起來，給燈籠閃爍用（0～1，不規則但連續） */
function flicker(t: number, seed: number): number {
  return 0.5 + 0.22 * Math.sin(t * 2.3 + seed) + 0.17 * Math.sin(t * 5.1 + seed * 1.7) + 0.11 * Math.sin(t * 11.7 + seed * 2.9);
}

/** 呼吸縮放這一刻的倍率（1～1.015，20 秒一輪，兩端緩） */
export function breatheScale(now: number): number {
  return 1 + 0.0075 * (1 - Math.cos(((now / 1000) % 20) / 20 * Math.PI * 2));
}

function drawBgFx(g: CanvasRenderingContext2D, now: number, fx: BgFx, scale: number): void {
  const t = now / 1000;
  const floor = fx.floor ?? 388;
  // 光束與燈跟著背景一起呼吸縮放，才不會跟圖上的燈對不準
  g.save();
  g.translate(W / 2, floor);
  g.scale(scale, scale);
  g.translate(-W / 2, -floor);
  if (fx.beams && allowed('beams')) {
    fx.beams.forEach((b, i) => {
      g.globalAlpha = b.a * (0.6 + 0.4 * Math.sin(t * 0.85 + i * 2.1));
      const gr = g.createLinearGradient(0, b.y, 0, b.y + b.len);
      gr.addColorStop(0, `rgba(${b.rgb},1)`);
      gr.addColorStop(1, `rgba(${b.rgb},0)`);
      g.fillStyle = gr;
      const dx = b.tilt * b.len;
      g.beginPath();
      g.moveTo(b.x - b.w / 2, b.y);
      g.lineTo(b.x + b.w / 2, b.y);
      g.lineTo(b.x + dx + b.w, b.y + b.len);
      g.lineTo(b.x + dx - b.w, b.y + b.len);
      g.closePath();
      g.fill();
    });
  }
  if (fx.lamps && allowed('lamps')) {
    fx.lamps.forEach((l, i) => {
      g.globalAlpha = (l.a ?? 0.32) * (0.72 + 0.28 * flicker(t, i * 1.3 + l.x * 0.01));
      const gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      gr.addColorStop(0, `rgba(${l.rgb ?? WARM},1)`);
      gr.addColorStop(1, `rgba(${l.rgb ?? WARM},0)`);
      g.fillStyle = gr;
      g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    });
  }
  g.restore();
  if (fx.fog && allowed('fog')) {
    const f = fx.fog;
    const tex = fogTexture(f.rgb ?? '225,232,245');
    const k = ((t % (f.sec ?? 70)) / (f.sec ?? 70)) * W;   // 貼圖放大兩倍＝1280 寬，整條往右飄一整圈
    g.globalAlpha = f.a;
    g.drawImage(tex, k - W, f.y - f.h / 2, W, f.h);
    g.drawImage(tex, k, f.y - f.h / 2, W, f.h);
  }
  g.globalAlpha = 1;
}

function draw(g: CanvasRenderingContext2D, now: number, fx?: BgFx, scale = 1): void {
  g.clearRect(0, 0, W, H);
  // 一、火光明暗：原本是對背景圖乘亮度。亮的時候疊一層暖白、暗的時候疊一層黑，幅度照原本的 ±7%
  const b = track(LIGHT, 5.7, now);
  if (b >= 1) { g.fillStyle = `rgba(255,214,160,${((b - 1) * 0.75).toFixed(4)})`; g.fillRect(0, 0, W, H); }
  else { g.fillStyle = `rgba(0,0,0,${((1 - b) * 0.9).toFixed(4)})`; g.fillRect(0, 0, W, H); }
  // 二、上緣兩團暖光（原 `.battle-bg::after` 的兩個橢圓漸層）
  const op = track(GLOW_OP, 4.3, now);
  const gy = track(GLOW_Y, 4.3, now);
  const gs = track(GLOW_S, 4.3, now);
  g.save();
  g.globalAlpha = op;
  g.translate(W / 2, H / 2 + gy);
  g.scale(gs, gs);
  g.translate(-W / 2, -H / 2);
  const blob = (cx: number, cy: number, rx: number, ry: number, rgba: string, stop: number): void => {
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, rgba);
    gr.addColorStop(stop, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  };
  // CSS 橢圓漸層「60% 45%」是半徑占元素寬／高的比例
  blob(W * 0.3, H * 0.08, W * 0.6, H * 0.45, 'rgba(255,156,58,0.18)', 0.7);
  blob(W * 0.88, H * 0.1, W * 0.55, H * 0.42, 'rgba(255,176,72,0.17)', 0.72);
  g.restore();
  // 背景自己的動效（霧、光束、燈；2026-10-06），畫在浮塵底下
  if (fx) drawBgFx(g, now, fx, scale);
  // 三、浮塵：每層是一張無限重複的點點圖，整張往一個方向慢慢飄
  for (const m of MOTES) {
    const k = ((now / 1000) % m.sec) / m.sec;
    // 原本圖層往外多留 10%，點的位置從圖層左上角起算；這裡直接取餘數對齊格子
    const ox = ((((-0.1 * W + m.dx * k) % m.w) + m.w) % m.w);
    const oy = ((((-0.1 * H + m.dy * k) % m.h) + m.h) % m.h);
    g.fillStyle = `rgba(${m.rgb},${(m.a * 0.5).toFixed(3)})`;
    g.beginPath();
    for (let x = ox - m.w + m.w / 2; x < W + m.w; x += m.w) {
      for (let y = oy - m.h + m.h / 2; y < H + m.h; y += m.h) {
        g.moveTo(x + (m.r + m.soft) / 2, y);
        g.arc(x, y, (m.r + m.soft) / 2, 0, Math.PI * 2);
      }
    }
    g.fill();
  }
}

/**
 * 做一張環境光畫布（`.ambient`，樣式在 combat.css）。節點被拿掉（戰鬥畫面重畫、換畫面）時自己停掉。
 * 只在畫面真的在動時畫：分頁藏起來時瀏覽器本來就不跑 requestAnimationFrame。
 * 一秒畫 30 次就夠：這些東西都動得很慢（浮塵一秒飄不到 5 像素），畫 60 次看不出差別、只是多花力氣。
 *
 * `bgKey`／`bgEl`（2026-10-06）：這一場的戰鬥背景鍵與那一層 `.battle-bg`，有設定（`BG_FX`）的背景才多畫霧、光束、燈、呼吸縮放。
 * 時間一律用頁面時鐘：出一張牌整個戰鬥畫面重建，縮放與霧接著原本的位置走，不會跳回起點。
 */
export function ambientCanvas(bgKey?: string, bgEl?: HTMLElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'ambient';
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return c;
  const fx = bgKey ? BG_FX[bgKey] : undefined;
  const breathe = !!(fx?.breathe && bgEl && allowed('breathe'));
  if (breathe) {
    // 自己一層、只改 transform：顯示晶片直接縮放疊上去，背景圖不用重畫
    bgEl!.style.willChange = 'transform';
    bgEl!.style.transformOrigin = `50% ${fx!.floor ?? 388}px`;
  }
  let lastScale = '';
  const paint = (now: number): void => {
    const s = breathe ? breatheScale(now) : 1;
    if (breathe) {
      const v = s.toFixed(4);
      if (v !== lastScale) { lastScale = v; bgEl!.style.transform = `scale(${v})`; }
    }
    draw(g, now, fx, s);
  };
  let last = 0;
  let started = false;
  const born = performance.now();
  const tick = (now: number): void => {
    if (started && !c.isConnected) return;   // 被換掉了就停
    if (c.isConnected) started = true;
    else if (now - born > 3000) return;   // 做出來卻一直沒掛上畫面（整段被丟掉）：不要空轉
    if (now - last >= 32) { last = now; paint(now); }
    requestAnimationFrame(tick);
  };
  paint(performance.now());
  requestAnimationFrame(tick);
  return c;
}
