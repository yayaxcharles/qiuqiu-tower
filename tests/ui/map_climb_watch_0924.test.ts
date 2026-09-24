// @vitest-environment happy-dom
/**
 * 地圖往上爬那段平滑捲動期間，換畫面要記「現在的位置」還是「要去的那一層」（`watchClimb`，dragscroll.ts）。
 * 推前稽核 2026-09-24 低-2：點節點投票的按下會冒泡到捲軸，不能算「自己捲過」。
 * 複審中-1：第一版只認滾輪、手指、鍵盤、按捲軸本身，漏了桌機最常見的「滑鼠拖地圖」。
 */
import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, attachDragScroll, watchClimb } from '../../src/ui/dragscroll';

function setup() {
  const scroll = document.createElement('div');
  const bg = document.createElement('div');
  const node = document.createElement('button');
  scroll.append(bg, node);
  document.body.append(scroll);
  attachDragScroll(scroll);             // 跟 map.ts 一樣：拖曳先掛
  const trust = watchClimb(scroll, 400);
  const ptr = (type: string, target: Element, y: number, buttons = 1) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', button: 0, buttons, clientX: 0, clientY: y, pointerId: 1 }));
  return { scroll, bg, node, trust, ptr };
}

describe('watchClimb：爬升途中換畫面，記現在的位置還是要去的那一層', () => {
  it('什麼都沒碰、還在半路：不可照實記', () => {
    const { scroll, trust } = setup();
    scroll.scrollTop = 250;
    scroll.dispatchEvent(new Event('scroll'));
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

  it('滾輪、手指滑、鍵盤、按在捲軸本身：都算', () => {
    for (const fire of [
      (s: HTMLElement) => s.dispatchEvent(new Event('wheel')),
      (s: HTMLElement) => s.dispatchEvent(new Event('touchmove')),
      (s: HTMLElement) => s.dispatchEvent(new Event('keydown')),
      (s: HTMLElement) => s.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' })),
    ]) {
      const { scroll, trust } = setup();
      fire(scroll);
      expect(trust()).toBe(true);
    }
  });

  it('爬升捲到了之後：怎麼捲都照實記', () => {
    const { scroll, trust } = setup();
    scroll.scrollTop = 399.6;
    scroll.dispatchEvent(new Event('scroll'));
    expect(trust()).toBe(true);
  });
});
