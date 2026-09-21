import { fileUrl } from './assets';
import { imageLoaded } from './decoded-atlas';

export const QIUQIU_SHURIKEN_RELEASE_MS = 180;
export const QIUQIU_SHURIKEN_FLIGHT_MS = 170;
export const QIUQIU_SHURIKEN_GAP_MS = 140;

/*
 * 圖檔是預先裁好、縮好的（清理 2026-09-22）：原本的 shuriken.webp 是 1254×1254，每次只取中間
 * (137, 112, 979×1001) 那一塊畫成 40×41——解開一張 600 多萬像素的圖只為了畫一千多個像素。
 * 現在的 shuriken_128.webp 就是那一塊用高品質縮圖縮到 128 高（125×128、保留透明），整張拿來畫。
 */
const SOURCE_X = 0;
const SOURCE_Y = 0;
const SOURCE_WIDTH = 125;
const SOURCE_HEIGHT = 128;
const DRAW_WIDTH = 40;
const DRAW_HEIGHT = 41;

let shurikenImage: HTMLImageElement | undefined;
let shurikenPreload: Promise<void> | undefined;

export function preloadQiuqiuShuriken(): Promise<void> {
  if (shurikenPreload) return shurikenPreload;
  const image = new Image();
  image.src = fileUrl('assets/motion/qiuqiu/shuriken_128.webp');
  shurikenImage = image;
  // 只等載好、不呼叫 decode()：畫布用不到 decode() 解出來的那一份（見 decoded-atlas.ts 的 `imageLoaded`）
  shurikenPreload = imageLoaded(image);
  return shurikenPreload;
}

export function playQiuqiuShuriken(
  stage: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: {
    waves: number;
    elapsed?: number;
    /** 每一波的抵達時點；風暴仍只演出引擎實際結算的波數。 */
    impactTimes?: readonly number[];
    onImpact: (wave: number) => void;
    onDone: () => void;
  },
): () => void {
  void preloadQiuqiuShuriken();
  const waveCount = Math.max(0, Math.floor(options.waves));
  const canvases: Array<HTMLCanvasElement | undefined> = Array.from({ length: waveCount });
  const impacted = Array.from({ length: waveCount }, () => false);
  const startedAt = performance.now() - Math.max(0, options.elapsed ?? 0);
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  let raf = 0;
  let disposed = false;
  let completed = false;

  const removeCanvas = (wave: number): void => {
    canvases[wave]?.remove();
    canvases[wave] = undefined;
  };

  const createCanvas = (wave: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.className = 'qiuqiu-shuriken';
    canvas.width = DRAW_WIDTH;
    canvas.height = DRAW_HEIGHT;
    Object.assign(canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${DRAW_WIDTH}px`,
      height: `${DRAW_HEIGHT}px`,
      pointerEvents: 'none',
      zIndex: '20',
      transformOrigin: '50% 50%',
    });
    const context = canvas.getContext('2d');
    // 圖載入失敗（complete 但 naturalWidth 為 0）時 drawImage 會丟例外，整段手裏劍演出跟著中斷、
    // 傷害數字不出、打死的怪一直站著；壞圖就只留空畫布（稽核 2026-09-21 晚 低-10）
    const usable = !!shurikenImage && (!('complete' in shurikenImage) || (shurikenImage.complete && shurikenImage.naturalWidth !== 0));
    if (context && shurikenImage && usable) {
      context.drawImage(
        shurikenImage,
        SOURCE_X,
        SOURCE_Y,
        SOURCE_WIDTH,
        SOURCE_HEIGHT,
        0,
        0,
        DRAW_WIDTH,
        DRAW_HEIGHT,
      );
    }
    stage.appendChild(canvas);
    canvases[wave] = canvas;
    return canvas;
  };

  const frame = (now: number): void => {
    raf = 0;
    if (disposed || completed) return;
    const elapsed = Math.max(0, now - startedAt);

    for (let wave = 0; wave < waveCount; wave += 1) {
      if (impacted[wave]) continue;
      const impactAt = options.impactTimes?.[wave]
        ?? QIUQIU_SHURIKEN_RELEASE_MS + wave * QIUQIU_SHURIKEN_GAP_MS + QIUQIU_SHURIKEN_FLIGHT_MS;
      const releaseAt = Math.max(0, impactAt - QIUQIU_SHURIKEN_FLIGHT_MS);
      if (elapsed >= impactAt) {
        removeCanvas(wave);
        impacted[wave] = true;
        options.onImpact(wave);
        if (disposed) return;
        continue;
      }
      if (elapsed < releaseAt) continue;

      const progress = (elapsed - releaseAt) / QIUQIU_SHURIKEN_FLIGHT_MS;
      const x = from.x + (to.x - from.x) * progress - DRAW_WIDTH / 2;
      const y = from.y + (to.y - from.y) * progress - DRAW_HEIGHT / 2;
      const canvas = canvases[wave] ?? createCanvas(wave);
      canvas.style.transform = `translate(${x}px, ${y}px) rotate(${angle + progress * 720}deg)`;
    }

    if (impacted.every(Boolean)) {
      completed = true;
      for (let wave = 0; wave < waveCount; wave += 1) removeCanvas(wave);
      options.onDone();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  return (): void => {
    if (disposed || completed) return;
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (let wave = 0; wave < waveCount; wave += 1) removeCanvas(wave);
  };
}
