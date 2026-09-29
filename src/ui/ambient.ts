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

function draw(g: CanvasRenderingContext2D, now: number): void {
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
 */
export function ambientCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'ambient';
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return c;
  let last = 0;
  let started = false;
  const born = performance.now();
  const tick = (now: number): void => {
    if (started && !c.isConnected) return;   // 被換掉了就停
    if (c.isConnected) started = true;
    else if (now - born > 3000) return;   // 做出來卻一直沒掛上畫面（整段被丟掉）：不要空轉
    if (now - last >= 32) { last = now; draw(g, now); }
    requestAnimationFrame(tick);
  };
  draw(g, performance.now());
  requestAnimationFrame(tick);
  return c;
}
