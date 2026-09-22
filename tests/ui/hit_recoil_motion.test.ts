import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQiuqiuActor, qiuqiuMotionDuration } from '../../src/ui/qiuqiu-motion';
import { companionMotionDuration, createCompanionMotionActor } from '../../src/ui/companion-motion';

/**
 * 挨打那一下（2026-09-22 換成新畫風）：一張挨打立繪停滿 650 毫秒（09-20 依使用者「挨打看不清楚」拉長的，不能縮），
 * 貼圖是 `assets/motion/<角色>/hit_recoil.webp`（舊寫法借 `assets/sprites/hero/<代號>_hit.webp`，這裡會失敗），
 * 而且兩隻腳踩的位置、腳底那一排像素要跟新版待機第 1 格一樣——一挨打就橫移或浮起來，玩家看得出來。
 *
 * 下面的數字是直接量圖檔得來的（alpha > 16 的最上一排、腳底最下一排、腳底那一條的左右中點），
 * 不從動作資料反推：資料被改壞了，這裡才抓得到。
 */
vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => path }));

type DrawCall = [HTMLImageElement, number, number, number, number, number, number, number, number];
class FakeCanvas {
  isConnected = true;
  width = 0;
  height = 0;
  style: Record<string, string> = {};
  draws: DrawCall[] = [];
  setAttribute(): void {}
  getContext() {
    return {
      setTransform: vi.fn(), clearRect: vi.fn(),
      drawImage: (...args: DrawCall) => this.draws.push(args),
    };
  }
}

let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
function step(time: number): void {
  const callbacks = [...rafs.values()];
  rafs.clear();
  for (const callback of callbacks) callback(time);
}
beforeEach(() => {
  rafs = new Map(); nextRaf = 1;
  vi.stubGlobal('Image', class { src = ''; complete = true; });
  vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
  vi.stubGlobal('window', { devicePixelRatio: 2,
    requestAnimationFrame: (callback: FrameRequestCallback) => { const id = nextRaf++; rafs.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => rafs.delete(id),
  });
});
afterEach(() => vi.unstubAllGlobals());

// 量圖：hit＝挨打圖、idle＝新版待機第 1 格（格內座標）。top／sole＝可見的最上一排／腳底最下一排，feetMid＝腳底那一條的左右中點
const CASES = [
  { kind: 'qiuqiu', size: [366, 410], hit: { top: 1, sole: 408, feetMid: 218 }, idle: { top: 1, sole: 405, feetMid: 185 } },
  { kind: 'feifei', size: [293, 308], hit: { top: 1, sole: 307, feetMid: 178.5 }, idle: { top: 0, sole: 304, feetMid: 143.5 } },
  { kind: 'dangdang', size: [212, 220], hit: { top: 0, sole: 219, feetMid: 125.5 }, idle: { top: 0, sole: 227, feetMid: 91 } },
  { kind: 'fengfeng', size: [319, 317], hit: { top: 1, sole: 315, feetMid: 190 }, idle: { top: 0, sole: 304, feetMid: 138 } },
] as const;

/** 無損 webp（VP8L）檔頭裡的寬高：確認上面量到的數字真的是這張圖的 */
function webpSize(path: string): [number, number] {
  const bytes = readFileSync(path);
  expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe('VP8L');
  const [b1, b2, b3, b4] = [bytes[21]!, bytes[22]!, bytes[23]!, bytes[24]!];
  return [1 + (b1 | ((b2 & 0x3f) << 8)), 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10))];
}

/** 這一筆畫圖呼叫裡，某張圖（格內座標）的一個點畫到畫布的哪裡 */
function at(draw: DrawCall, x: number, y: number): [number, number] {
  const [, , , sw, sh, dx, dy, dw, dh] = draw;
  return [dx + x * dw / sw, dy + y * dh / sh];
}

it.each(CASES)('$kind 挨打時停滿 650 毫秒、用新畫風挨打圖，腳底與新版待機一致', ({ kind, size, hit, idle }) => {
  const texture = `assets/motion/${kind}/hit_recoil.webp`;
  expect(webpSize(`public/${texture}`)).toEqual(size);
  expect(kind === 'qiuqiu' ? qiuqiuMotionDuration('hurt') : companionMotionDuration(kind, 'hurt')).toBe(650);
  for (const height of [252, 126]) {
    const actor = kind === 'qiuqiu' ? createQiuqiuActor({ height }) : createCompanionMotionActor(kind, { height });
    const canvas = actor.element as unknown as FakeCanvas;
    actor.play('idle');
    const idleDraw = canvas.draws.at(-1)!;
    expect(idleDraw[0].src).not.toContain('hit_recoil');
    const [idleFeetX, idleSoleY] = at(idleDraw, idle.feetMid, idle.sole);
    const idleHeight = (idle.sole - idle.top + 1) * idleDraw[8] / idleDraw[4];
    actor.play('idle', { elapsed: 3100 });
    expect(actor.element.style.scale).not.toBe('1');   // 待機在呼吸
    const placement = actor.element.style.transform;
    actor.play('hurt');
    const drawnAtHit = canvas.draws.length;
    for (const elapsed of [0, 200, 500, 649]) {
      step(elapsed);
      const draw = canvas.draws.at(-1)!;
      expect(draw[0].src).toBe(texture);
      expect(draw.slice(1, 5)).toEqual([0, 0, ...size]);
      // 腳底那一排踩在待機的腳底線上，兩腳中點跟待機時在同一個位置（容許 1.5 個遊戲單位的取整誤差）
      const [feetX, soleY] = at(draw, hit.feetMid, hit.sole);
      expect(Math.abs(soleY - idleSoleY)).toBeLessThanOrEqual(height / 252);
      expect(Math.abs(feetX - idleFeetX)).toBeLessThanOrEqual(1.5 * height / 252);
      // 身高跟新版待機一致（±10%）：挨打往後仰會矮一點，但不能整隻變大或縮水
      const ratio = (hit.sole - hit.top + 1) * draw[8] / draw[4] / idleHeight;
      expect(ratio).toBeGreaterThanOrEqual(.9);
      expect(ratio).toBeLessThanOrEqual(1.1);
      // 挨打不呼吸、不換位置，畫布一直在跑直到 650 毫秒
      expect(actor.element.style.scale).toBe('1');
      expect(actor.element.style.transform).toBe(placement);
      expect(rafs.size).toBe(1);
    }
    expect(canvas.draws).toHaveLength(drawnAtHit);   // 同一張圖不重畫
    step(650);
    expect(rafs.size).toBe(0);
    expect(canvas.draws).toHaveLength(drawnAtHit);
    actor.play('idle');
    expect(canvas.draws.at(-1)![0].src).not.toContain('hit_recoil');
    actor.dispose();
    expect(rafs.size).toBe(0);
  }
});

it('舊版靜態演出（?motion=0）的挨打立繪還留著：退路不動', () => {
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as { sprites: Record<string, string> };
  for (const key of ['ninja', 'feifei', 'dangdang', 'fengfeng']) {
    expect(manifest.sprites[`hero/${key}_hit`]).toBe(`assets/sprites/hero/${key}_hit.webp`);
    expect(new TextDecoder().decode(readFileSync(`public/assets/sprites/hero/${key}_hit.webp`).subarray(8, 12))).toBe('WEBP');
  }
});
