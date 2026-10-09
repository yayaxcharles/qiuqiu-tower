import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-10-09 效能（使用者朋友的 i5-2400＋1080p 螢幕會卡）：地圖、事件／商店／貓窩、封面那層整片的火光／天色，
// 透明度改成只在跨過 1/255（螢幕顏色差一級）時才換值（step-end），瀏覽器不用每一格都把整個畫面重疊一次。
// 這裡照原本的關鍵影格與 ease-in-out 重算平滑曲線，逐點比對 CSS 裡的值：任何時刻差距超過半級就紅（＝看得出不一樣了）。
// 原始關鍵影格與 tools/perf/torch_steps.py 的 `ANIMS` 同一組，兩邊一起改。
const src = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const ANIMS: Record<string, { file: string; secs: number; keys: [number, number][] }> = {
  'map-torchlight': { file: 'src/ui/styles/map.css', secs: 6.9, keys: [[0, 0], [0.19, 0.045], [0.36, 0], [0.58, 0.034], [0.79, 0.015], [1, 0]] },
  'bg-torchlight': { file: 'src/ui/styles/screens.css', secs: 7.4, keys: [[0, 0], [0.22, 0.0375], [0.41, 0], [0.64, 0.026], [0.83, 0.011], [1, 0]] },
  'night-drift': { file: 'src/ui/styles/screens.css', secs: 22, keys: [[0, 0], [0.5, 0.0375], [1, 0]] },
};

/** CSS 的 cubic-bezier(.42, 0, .58, 1)（＝ease-in-out）：給 x 求 y */
function easeInOut(x: number): number {
  const bx = (t: number): number => 3 * (1 - t) ** 2 * t * 0.42 + 3 * (1 - t) * t ** 2 * 0.58 + t ** 3;
  const by = (t: number): number => 3 * (1 - t) * t ** 2 + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (bx(mid) < x) lo = mid; else hi = mid; }
  return by((lo + hi) / 2);
}

function smooth(keys: [number, number][], p: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1]!, [t1, v1] = keys[i]!;
    if (p <= t1) return v0 + (v1 - v0) * easeInOut(t1 > t0 ? (p - t0) / (t1 - t0) : 1);
  }
  return keys[keys.length - 1]![1];
}

function parse(css: string, name: string): [number, number][] {
  const i = css.indexOf(`@keyframes ${name} {`);
  expect(i, name).toBeGreaterThan(-1);
  const body = css.slice(i, css.indexOf('\n}', i));
  return [...body.matchAll(/^\s*([0-9.]+)% \{ opacity: ([0-9.]+); \}$/gm)].map((m) => [Number(m[1]) / 100, Number(m[2])]);
}

describe('火光／天色那層：跨級才換值，看起來跟平滑版一樣', () => {
  for (const [name, { file, secs, keys }] of Object.entries(ANIMS)) {
    it(name, () => {
      const css = src(file);
      expect(css, '要用 step-end：兩個關鍵影格之間停著不動').toContain(`animation: ${name} ${secs}s step-end infinite;`);
      const frames = parse(css, name);
      expect(frames.length).toBeGreaterThan(2);
      expect(frames[0]![0]).toBe(0);
      expect(frames[frames.length - 1]![0]).toBe(1);
      for (let k = 1; k < frames.length; k++) expect(frames[k]![0], '位置要一路往後').toBeGreaterThan(frames[k - 1]![0]);
      for (const [, v] of frames) expect(Math.abs(v * 255 - Math.round(v * 255)), '每個值都是整級').toBeLessThan(0.002);
      // 平均每秒換值不超過 8 次（原本是每一格、每秒 60 次）
      expect(frames.length / secs).toBeLessThan(8);
      let worst = 0;
      for (let s = 0; s <= 4000; s++) {
        const p = s / 4000;
        let held = frames[0]![1];
        for (const [at, v] of frames) { if (at <= p) held = v; else break; }
        worst = Math.max(worst, Math.abs(held - smooth(keys, p)) * 255);
      }
      // 0.55：四捨五入到整級本來就最多差半級（0.5），加一點取樣與百分比只留兩位小數的誤差（實測約 0.51）。
      // 不要為了讓別的改法過關把它調鬆——超過半級就是螢幕上真的會差一級顏色的時候變多了
      expect(worst, '任何時刻跟原本平滑曲線的差距（單位：螢幕顏色級數）').toBeLessThan(0.55);
    });
  }
});
