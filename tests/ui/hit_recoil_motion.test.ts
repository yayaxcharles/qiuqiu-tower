import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQiuqiuActor, qiuqiuMotionDuration } from '../../src/ui/qiuqiu-motion';
import { companionMotionDuration, createCompanionMotionActor } from '../../src/ui/companion-motion';
import hitData from '../../src/ui/hit-recoil-motion-data.json';

/**
 * 挨打那一下（2026-09-22 換成新畫風）：一張挨打立繪停滿 650 毫秒（09-20 依使用者「挨打看不清楚」拉長的，不能縮），
 * 貼圖是 `assets/motion/<角色>/hit_recoil.webp`（舊寫法借 `assets/sprites/hero/<代號>_hit.webp`，這裡會失敗），
 * 而且兩隻腳踩的位置、腳底那一排像素要跟新版待機第 1 格一樣——一挨打就橫移或浮起來，玩家看得出來。
 *
 * 下面的數字是直接量圖檔得來的（alpha > 16 的最上一排、腳底最下一排、腳底那一條的左右中點），
 * 不從動作資料反推：資料被改壞了，這裡才抓得到。
 *
 * **大小**（2026-09-22 下午改）：原本守的是「外框身高跟待機差不到一成」，但外框量不出身體大小——
 * 封封外框 1.035 倍、看起來合格，頭和身體其實大了一成五（往後仰、膝蓋彎，外框本來就該變矮）。
 * 現在每隻有一個人眼並排訂的大小修正（`tools/pack_hit_recoil_motion.py` 的 `SIZE_FIX`），這裡守兩件事：
 *  1. 修正倍率還在（`sizeFix`）；打包工具拿掉修正、重新打包，這裡會紅；
 *  2. 畫出來的外框身高 ＝ 生圖時畫的身高（`drawn`，量生圖原檔得來）× 修正倍率——只改資料檔的倍率、
 *     或換了圖沒重算，這裡也會紅。
 * 挨打的姿勢和表情跟待機差太多，自動比對頭部大小不準，所以沒有做成測試；並排圖在
 * `docs/審查報告/挨打大小修正_2026-09-22.png`（不進版控，要看就重出）。
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

// 量圖：hit＝挨打圖、idle＝新版待機第 1 格（格內座標）。top／sole＝可見的最上一排／腳底最下一排，feetMid＝腳底那一條的左右中點。
// sizeFix＝大小修正（封封頭與身體大一成五、球球頭大約 5%），drawn＝生圖原檔裡挨打外框身高 ÷ 參考圖待機外框身高（修正前）
const CASES = [
  { kind: 'qiuqiu', size: [347, 390], hit: { top: 1, sole: 388, feetMid: 206.5 }, idle: { top: 1, sole: 405, feetMid: 185 }, sizeFix: .95, drawn: 1.007 },
  { kind: 'feifei', size: [293, 308], hit: { top: 1, sole: 307, feetMid: 178.5 }, idle: { top: 0, sole: 304, feetMid: 143.5 }, sizeFix: 1, drawn: 1.003 },
  { kind: 'dangdang', size: [212, 220], hit: { top: 0, sole: 219, feetMid: 125.5 }, idle: { top: 0, sole: 227, feetMid: 91 }, sizeFix: 1, drawn: .960 },
  { kind: 'fengfeng', size: [274, 273], hit: { top: 0, sole: 272, feetMid: 163.5 }, idle: { top: 0, sole: 304, feetMid: 138 }, sizeFix: .86, drawn: 1.035 },
] as const;
const HIT = hitData.heroes as unknown as Record<string, { sizeFix?: number; drawnHeightRatio?: number }>;

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

it.each(CASES)('$kind 挨打時停滿 650 毫秒、用新畫風挨打圖，腳底與新版待機一致、大小修正有套上', ({ kind, size, hit, idle, sizeFix, drawn }) => {
  const texture = `assets/motion/${kind}/hit_recoil.webp`;
  // 修正倍率還在，而且跟這裡記的一樣（打包工具拿掉修正重新打包，資料檔會變成 1 或沒有這一欄）
  expect(HIT[kind]?.sizeFix).toBe(sizeFix);
  expect(HIT[kind]?.drawnHeightRatio).toBeCloseTo(drawn, 2);
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
      // 畫出來的外框身高＝生圖時畫的身高 × 修正倍率（容許 1.5%：待機外框不一定剛好 252、取整誤差）。
      // 外框只是防呆，大小對不對靠修正倍率；往後仰、膝蓋彎本來就比待機矮（封封修正後 0.89）
      const ratio = (hit.sole - hit.top + 1) * draw[8] / draw[4] / idleHeight;
      expect(Math.abs(ratio - drawn * sizeFix)).toBeLessThanOrEqual(.015);
      expect(ratio).toBeGreaterThanOrEqual(.8);
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
