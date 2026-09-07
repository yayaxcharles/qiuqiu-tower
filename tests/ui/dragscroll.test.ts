import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, beginDrag, dragTo } from '../../src/ui/dragscroll';

describe('地圖拖曳平移', () => {
  it('沒動到門檻就不算拖曳（那一下要留給點節點）', () => {
    const s = beginDrag(100, 100, 300);
    expect(dragTo(s, 102, 103).moved).toBe(false);   // 位移 2+3=5 < 6
    expect(s.moved).toBe(false);
  });

  it('超過門檻就算拖曳', () => {
    const s = beginDrag(100, 100, 300);
    expect(dragTo(s, 100, 100 + DRAG_THRESHOLD).moved).toBe(true);
  });

  it('門檻用的是橫豎相加，不是直線距離', () => {
    // 斜著移動 4+4：相加是 8（過門檻），直線只有 5.66（不過）。
    // 這一題是用來釘住算法的——改成 Math.hypot 就會紅。
    const s = beginDrag(100, 100, 300);
    expect(dragTo(s, 104, 104).moved).toBe(true);
  });

  it('滑鼠往下拉，捲動位置往上減（內容跟著手走）', () => {
    const s = beginDrag(100, 100, 300);
    expect(dragTo(s, 100, 180).top).toBe(220);
    expect(dragTo(s, 100, 40).top).toBe(360);
  });

  it('舞台放大時要把螢幕位移除回版面位移', () => {
    // 倍率 2＝畫面上放大兩倍：手移動 80 螢幕像素，內容只該捲 40 版面像素，
    // 這樣看起來才剛好是「內容黏在手上」。不除的話地圖會跑得比手快一倍。
    const s = beginDrag(100, 100, 300);
    expect(dragTo(s, 100, 180, 2).top).toBe(260);
    expect(dragTo(s, 100, 180, 1).top).toBe(220);
  });

  it('倍率給 0 或沒給都當成 1，不會算出 Infinity', () => {
    const s = beginDrag(100, 100, 300);
    expect(dragTo(s, 100, 180, 0).top).toBe(220);
  });

  it('拖回原點附近仍算拖過（那一下 click 照樣要攔）', () => {
    const s = beginDrag(100, 100, 300);
    dragTo(s, 100, 160);
    expect(dragTo(s, 100, 101).moved).toBe(true);
  });
});
