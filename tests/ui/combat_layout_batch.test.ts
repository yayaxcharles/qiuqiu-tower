// 發牌、收牌先量完再寫，瞄準箭頭每一格最多算一次（清理 2026-09-22 C8）。
// 直接跑戰鬥畫面的原始碼片段：這幾支是畫面內部的函式，不是公開介面。
import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { COLLECT_FLY, collectTiming } from '../../src/ui/collect';

function sourceBetween(start: string, end: string): string {
  const normalized = SRC.replace(/\r\n/g, '\n');
  const first = normalized.indexOf(start);
  const last = normalized.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到戰鬥畫面片段：${start}`);
  return normalized.slice(first, last);
}

async function run<T>(code: string, bindings: Record<string, unknown>): Promise<T> {
  const compiled = await transformWithOxc(code, 'combat-layout-batch.ts');
  return new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as T;
}

const stageFrame = () => ({ left: 0, top: 0, k: 1 });
const rect = (left: number, top: number, width = 100, height = 140) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe('發牌：每張的定位點全部量完才寫位移', () => {
  it('讀在前、寫在後，算出來的位移跟一張一張算的一樣', async () => {
    const log: string[] = [];
    const cards = [0, 1, 2].map((i) => ({
      get offsetLeft() { log.push(`讀${i}`); return 100 * i; },
      offsetTop: 10, offsetWidth: 100, offsetHeight: 140,
      style: { setProperty: (name: string, value: string) => { log.push(`寫${i}`); (cards[i] as { set: Record<string, string> }).set[name] = value; } },
      set: {} as Record<string, string>,
    }));
    const box = {
      querySelectorAll: () => cards,
      querySelector: (sel: string) => (sel === '.hand' ? { getBoundingClientRect: () => rect(0, 500) } : { getBoundingClientRect: () => rect(-60, 560, 40, 40) }),
    };
    const dealFrom = await run<(b: unknown) => void>(
      `${sourceBetween('  function dealFrom(box: HTMLElement): void {', '  /**\n   * 發牌動畫跑完')}\nreturn dealFrom;`,
      { stageFrame, app: { stage: {} } });
    dealFrom(box);
    expect(log).toEqual(['讀0', '讀1', '讀2', '寫0', '寫0', '寫1', '寫1', '寫2', '寫2']);
    // 牌堆中心（-40, 80）減掉每張中心（50＋100i, 80）
    expect(cards.map((c) => c.set['--deal-dx'])).toEqual(['-90px', '-190px', '-290px']);
    expect(cards.map((c) => c.set['--deal-dy'])).toEqual(['0px', '0px', '0px']);
  });
});

describe('收牌：每張的位置全部量完才一起起飛', () => {
  it('讀在前、掛動畫在後', async () => {
    const log: string[] = [];
    const cards = [0, 1, 2].map((i) => ({
      getBoundingClientRect: () => { log.push(`讀${i}`); return rect(100 * i, 500); },
      animate: () => { log.push(`飛${i}`); return {}; },
    }));
    const hand = { classList: { add: vi.fn() } };
    const btn = { getBoundingClientRect: () => rect(1100, 600, 120, 60), setAttribute: vi.fn() };
    const root = {
      querySelector: (sel: string) => (sel === '.hand' ? hand : btn),
      querySelectorAll: () => cards,
    };
    const collectHand = await run<() => number>(
      `${sourceBetween('  function collectHand(): number {', '  function onEndTurn(): void {')}\nreturn collectHand;`,
      { stageFrame, app: { stage: {} }, root, collectTiming, COLLECT_FLY });
    expect(collectHand()).toBeGreaterThan(0);
    expect(log).toEqual(['讀0', '讀1', '讀2', '飛0', '飛1', '飛2']);
  });
});

describe('瞄準箭頭：一格裡的好幾次滑鼠移動只算最後一次', () => {
  async function arrow(connected = true) {
    let onMove: ((ev: { clientX: number; clientY: number }) => void) | undefined;
    const frames: Array<() => void> = [];
    const box = { isConnected: connected, addEventListener: (_t: string, cb: typeof onMove) => { onMove = cb; } };
    const draw = vi.fn();
    const elementFromPoint = vi.fn(() => null);
    const listener = sourceBetween('    let aimAt:', '  }\n\n  // ===== 操作 =====');
    await run(listener, {
      box, draw, centreOf: vi.fn(), toStage: (x: number, y: number) => ({ x, y }),
      document: { elementFromPoint },
      window: { requestAnimationFrame: (cb: () => void) => { frames.push(cb); return frames.length; } },
    });
    return { move: (x: number, y: number) => onMove!({ clientX: x, clientY: y }), frames, draw, elementFromPoint };
  }

  it('同一格三次移動：只排一次、只找一次滑鼠底下是誰、用最後的座標', async () => {
    const a = await arrow();
    a.move(10, 10); a.move(20, 20); a.move(30, 40);
    expect(a.frames).toHaveLength(1);
    expect(a.elementFromPoint).not.toHaveBeenCalled();
    a.frames[0]!();
    expect(a.elementFromPoint).toHaveBeenCalledTimes(1);
    expect(a.draw).toHaveBeenCalledWith({ x: 30, y: 40 }, false);
    a.move(50, 50);
    expect(a.frames).toHaveLength(2);   // 處理完之後的下一次移動再排下一格
  });

  it('排到的那一格畫面已經重畫換掉：什麼都不做', async () => {
    const a = await arrow(false);
    a.move(10, 10);
    a.frames[0]!();
    expect(a.elementFromPoint).not.toHaveBeenCalled();
    expect(a.draw).not.toHaveBeenCalled();
  });
});
