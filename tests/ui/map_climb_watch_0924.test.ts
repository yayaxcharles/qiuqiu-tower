/**
 * 地圖往上爬那段平滑捲動期間，換畫面要記「現在的位置」還是「要去的那一層」（`watchClimb`，dragscroll.ts）。
 * 推前稽核 2026-09-24 低-2：點節點投票的按下會冒泡到捲軸，不能算「自己捲過」。
 * 複審中-1：第一版只認滾輪、手指、鍵盤、按捲軸本身，漏了桌機最常見的「滑鼠拖地圖」。
 * 複審低：鍵盤只認會捲的鍵，在節點上按 Enter 投票不算。
 *
 * 不用 happy-dom（雲端 `npm ci` 不會裝它，複審高）：假捲軸只記監聽、依掛上的順序叫，
 * 事件自己帶 `target`，當成從底下的元素冒泡上來。
 */
import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, attachDragScroll, watchClimb } from '../../src/ui/dragscroll';

function setup() {
  const listeners: Array<[string, (e: unknown) => void]> = [];
  const cls = new Set<string>();
  const scroll = {
    scrollTop: 0, offsetWidth: 1280, clientWidth: 1260,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 664 }),
    classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c), contains: (c: string) => cls.has(c) },
    setPointerCapture: () => {}, hasPointerCapture: () => false, releasePointerCapture: () => {},
    addEventListener: (type: string, fn: (e: unknown) => void) => { listeners.push([type, fn]); },
  };
  const bg = {}, node = {};
  const el = scroll as unknown as HTMLElement;
  attachDragScroll(el);             // 跟 map.ts 一樣：拖曳先掛
  const trust = watchClimb(el, 400);
  const fire = (type: string, e: Record<string, unknown>) => {
    for (const [t, fn] of listeners) if (t === type) fn({ target: scroll, ...e });
  };
  const ptr = (type: string, target: object, y: number, buttons = 1) =>
    fire(type, { target, pointerType: 'mouse', button: 0, buttons, clientX: 0, clientY: y, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  return { scroll, bg, node, trust, fire, ptr };
}

describe('watchClimb：爬升途中換畫面，記現在的位置還是要去的那一層', () => {
  it('什麼都沒碰、還在半路：不可照實記', () => {
    const { scroll, trust, fire } = setup();
    scroll.scrollTop = 250;
    fire('scroll', {});
    expect(trust()).toBe(false);
  });

  it('點節點投票（按下冒泡上來、沒移動）：不算自己捲過', () => {
    const { node, trust, ptr } = setup();
    ptr('pointerdown', node, 300);
    ptr('pointerup', node, 300, 0);
    expect(trust()).toBe(false);
  });

  it('滑鼠在地圖上按住拖過門檻：算自己捲過', () => {
    const { bg, trust, ptr } = setup();
    ptr('pointerdown', bg, 300);
    ptr('pointermove', bg, 300 + DRAG_THRESHOLD + 2);   // 過門檻：拖曳那支先掛上 dragging
    ptr('pointermove', bg, 330);
    expect(trust()).toBe(true);
  });

  it('滑鼠按住但沒動到門檻：不算', () => {
    const { bg, trust, ptr } = setup();
    ptr('pointerdown', bg, 300);
    ptr('pointermove', bg, 302);
    expect(trust()).toBe(false);
  });

  it('滾輪、手指滑、方向鍵、按在捲軸本身：都算', () => {
    for (const [type, e] of [['wheel', {}], ['touchmove', {}], ['keydown', { key: 'PageDown' }], ['keydown', { key: 'ArrowUp' }], ['pointerdown', { pointerType: 'mouse' }]] as const) {
      const { trust, fire } = setup();
      fire(type, e);
      expect(trust(), `${type} ${JSON.stringify(e)}`).toBe(true);
    }
  });

  it('鍵盤：在節點上按 Enter、空白鍵投票、按 Esc：不算；焦點在捲軸本身按空白鍵才算', () => {
    const { node, trust, fire } = setup();
    fire('keydown', { key: 'Enter', target: node });
    fire('keydown', { key: ' ', target: node });
    fire('keydown', { key: 'Escape' });
    expect(trust()).toBe(false);
    fire('keydown', { key: ' ' });
    expect(trust()).toBe(true);
  });

  it('爬升捲到了之後：怎麼捲都照實記', () => {
    const { scroll, trust, fire } = setup();
    scroll.scrollTop = 399.6;
    fire('scroll', {});
    expect(trust()).toBe(true);
  });
});
