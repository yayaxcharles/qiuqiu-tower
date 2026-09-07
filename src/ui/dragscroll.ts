/**
 * 按住左鍵拖著地圖走。
 *
 * 起因：玩家反應大地圖只能拉捲軸或滾滑鼠滾輪，很不習慣（使用者 2026-09-07 轉述）。
 * 地圖本來就是個可捲動容器，拖曳只是在按住時把捲動位置跟著滑鼠的移動量反向推。
 *
 * 四件事要小心：
 * 1. **不能吃掉點節點**。按下到放開之間移動不到門檻就當成普通點擊，照舊進節點；
 *    超過門檻才算拖曳，並且把緊接著那一下 click 攔掉（不然拖完手一放就走進節點了）。
 *    門檻取 6 像素——想點東西的時候手本來就不太會動，這個距離不會誤判。
 * 2. **座標有兩種尺度，不能混用**。舞台整層被 `transform: scale()` 放大（見 base.css 的 `#stage`），
 *    所以滑鼠給的是螢幕像素，`scrollTop`／`clientWidth` 是版面像素，中間差一個倍率。
 *    混用的後果：1080p 全螢幕下地圖會比手快三成，右側四分之一還會整片拖不動
 *    （被誤判成「按在捲軸上」）。門檻是唯一例外——它量的是手移動了多少，本來就該用螢幕像素。
 * 3. **只接滑鼠**。手機平板本來就能用手指滑，接管觸控只會變成兩套邏輯打架。
 *    按在捲軸上的那一下也放給瀏覽器原生處理。
 * 4. **收不到 pointerup 的路要自己補**。在容器外放開、按住時切走視窗，都收不到；
 *    不補的話狀態會留著，下次空手滑回地圖就會從舊起點算位移、地圖憑空跳一段。
 */
export const DRAG_THRESHOLD = 6;

export interface DragState {
  /** 按下時的**螢幕**座標（門檻拿它算） */
  startX: number;
  startY: number;
  /** 按下時的**版面**捲動位置 */
  startTop: number;
  /** 移動距離已經超過門檻＝這次是拖曳，不是點擊 */
  moved: boolean;
}

export function beginDrag(x: number, y: number, top: number): DragState {
  return { startX: x, startY: y, startTop: top, moved: false };
}

/**
 * 指標移到 (x, y) 時該捲到哪裡。滑鼠往下拉＝內容跟著往下跑＝捲動位置要往上減，所以是反向。
 *
 * `scale`＝這個容器在畫面上被放大幾倍。位移是螢幕像素、捲動位置是版面像素，要除掉倍率才對得上。
 * `moved` 一旦為真就不再變回去：拖回原點附近也算拖過，那一下 click 照樣要攔掉。
 */
export function dragTo(s: DragState, x: number, y: number, scale = 1): { top: number; moved: boolean } {
  const dx = x - s.startX;
  const dy = y - s.startY;
  if (!s.moved && Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD) s.moved = true;
  return { top: s.startTop - dy / (scale || 1), moved: s.moved };
}

/** 把拖曳平移掛到一個可捲動容器上（只做垂直：地圖是 `overflow-x: hidden`，橫向根本沒得捲） */
export function attachDragScroll(node: HTMLElement): void {
  let state: DragState | null = null;

  /** 這個容器被放大幾倍：量到的螢幕寬除以版面寬 */
  const scaleOf = (): number => {
    const laid = node.offsetWidth;
    const shown = node.getBoundingClientRect().width;
    return laid > 0 && shown > 0 ? shown / laid : 1;
  };

  /** 收尾。真的拖過就把緊接著那一下 click 攔掉，不然手一放就走進游標底下那個節點 */
  const finish = (pointerId: number, dragged: boolean): void => {
    state = null;
    node.classList.remove('dragging');
    try {
      if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    } catch { /* 沒抓到就沒得放 */ }
    if (!dragged) return;
    // 用捕獲階段才擋得到節點自己的監聽；那一下沒發生（放開時在容器外）就下一輪自己拆掉
    const swallow = (e: Event): void => { e.stopPropagation(); e.preventDefault(); };
    node.addEventListener('click', swallow, true);
    setTimeout(() => node.removeEventListener('click', swallow, true), 0);
  };

  node.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    // 按在捲軸上：交給瀏覽器原生，不然拖捲軸會變成雙重捲動。
    // clientWidth 是版面像素，指標位移要先除掉舞台縮放才比得起來
    if ((ev.clientX - node.getBoundingClientRect().left) / scaleOf() > node.clientWidth) return;
    state = beginDrag(ev.clientX, ev.clientY, node.scrollTop);
  });

  node.addEventListener('pointermove', (ev) => {
    const s = state;
    if (!s) return;
    // 鍵已經放開卻沒收到 pointerup（在容器外放開、按住時切走視窗）：這裡補收尾
    if (ev.buttons === 0) { finish(ev.pointerId, s.moved); return; }
    const to = dragTo(s, ev.clientX, ev.clientY, scaleOf());
    if (!to.moved) return;
    if (!node.classList.contains('dragging')) {
      node.classList.add('dragging');
      // 抓指標是為了「拖到容器外面手還沒放」也繼續跟著走。抓不到就算了，照樣拖得動
      try { node.setPointerCapture(ev.pointerId); } catch { /* 抓不到就不抓 */ }
      // 過關爬升的平滑捲動可能還在跑：等真的開始拖才把起點對到現在，
      // 不然第一下會把地圖拉回按下那一刻的位置
      s.startX = ev.clientX;
      s.startY = ev.clientY;
      s.startTop = node.scrollTop;
      return;
    }
    node.scrollTop = to.top;
  });

  const end = (ev: PointerEvent): void => {
    const s = state;
    if (!s) return;
    // 滑鼠三顆鍵共用同一個 pointerId：中鍵／右鍵放開不能把左鍵按著的拖曳打斷，
    // 打斷了不只地圖不動，最後放開左鍵時也不會攔 click，直接走進節點
    if (ev.type === 'pointerup' && ev.button !== 0) return;
    finish(ev.pointerId, s.moved);
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
}
