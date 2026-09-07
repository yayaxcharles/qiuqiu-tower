/**
 * 按住牌往上拉，放開就打出去。
 *
 * 起因：玩家反應現在只能「單怪點兩下」或「點牌再點怪」，習慣拖曳的人會卡住（使用者 2026-09-07 轉述）。
 * 這裡是**加一條路**，不是取代——移動不到門檻的那一下原封不動走既有的點擊流程。
 *
 * 規則（使用者 2026-09-07 拍板）：
 * 1. 按住牌移動超過門檻才算拖，沒超過就是普通點擊。
 * 2. 要選目標的牌：放開時壓在哪隻魔物身上就打誰；沒壓到就退回手牌，不消耗飯糰。
 * 3. 不用選目標的牌（防禦、抽牌、給自己上狀態）：拖離手牌區放開就打出，壓到誰都無所謂。
 * 4. 打不出來的牌根本不給拖（呼叫端不掛），維持點下去抖一下加說明的行為。
 *
 * 座標一律照地圖拖曳那邊的教訓處理：舞台整層被 `transform: scale()` 放大，
 * 滑鼠給的是螢幕像素、版面座標是 1280×720，牌要跟著手走就得先除掉倍率
 *（不除的話視窗越大牌跑得越快，手感是壞的）。門檻例外，它量的是手移動了多少。
 */
export const DRAG_PLAY_THRESHOLD = 8;

export interface CardDragState {
  /** 按下時的**螢幕**座標（門檻拿它算） */
  startX: number;
  startY: number;
  moved: boolean;
}

export function beginCardDrag(x: number, y: number): CardDragState {
  return { startX: x, startY: y, moved: false };
}

/** 牌現在該偏移多少（**版面**像素），以及有沒有超過門檻 */
export function cardDragTo(s: CardDragState, x: number, y: number, scale = 1)
  : { dx: number; dy: number; moved: boolean } {
  const rawX = x - s.startX;
  const rawY = y - s.startY;
  if (!s.moved && Math.abs(rawX) + Math.abs(rawY) >= DRAG_PLAY_THRESHOLD) s.moved = true;
  const k = scale || 1;
  return { dx: rawX / k, dy: rawY / k, moved: s.moved };
}

export type DropAction = { kind: 'play'; targetUid?: number } | { kind: 'cancel' };

/**
 * 手放開時該怎麼辦。
 *
 * `overEnemyUid`＝放開的位置壓在哪隻活著的魔物身上（呼叫端用 `elementFromPoint` 查，沒壓到給 null）。
 * `leftHand`＝牌已經拉離手牌區。不用選目標的牌靠這個判斷「是要打出去還是只是挪一下位子」，
 * 沒拉出去就當成反悔，退回手上——這樣玩家想取消時只要放回原處就好，不必記什麼特殊操作。
 */
export function dropDecision(opts: { needsTarget: boolean; overEnemyUid: number | null; leftHand: boolean }): DropAction {
  if (opts.needsTarget) {
    return opts.overEnemyUid === null ? { kind: 'cancel' } : { kind: 'play', targetUid: opts.overEnemyUid };
  }
  return opts.leftHand ? { kind: 'play' } : { kind: 'cancel' };
}

export interface CardDragHooks {
  /** 這張牌要不要選目標（攻擊牌要，防禦抽牌那些不用） */
  needsTarget: boolean;
  /** 舞台被放大幾倍（螢幕像素 ÷ 這個 ＝ 版面像素） */
  scale: () => number;
  /** 這個座標壓在哪隻活著的魔物身上；沒壓到回 null */
  enemyAt: (clientX: number, clientY: number) => number | null;
  /** 牌是不是已經拉離手牌區 */
  leftHand: (clientY: number) => boolean;
  /** 真的要打出去 */
  onPlay: (targetUid: number | undefined) => void;
  /** 拖曳開始（收提示框、把牌提到最上層之類的收尾交給呼叫端） */
  onStart?: () => void;
  /**
   * 拖曳中游標現在壓在哪隻魔物上（沒壓到給 null）。呼叫端拿它把目標高亮起來——
   * 拖著的牌會把底下的魔物遮住，不高亮的話多怪時根本看不出會打誰。
   * 只有真的換了目標才叫，不會每一格都叫一次。
   */
  onHover?: (uid: number | null) => void;
  /** 沒打成，牌要退回原位 */
  onCancel?: () => void;
}

/**
 * 把「拖出去打」掛到一張手牌上。
 *
 * 拖曳中直接動行內樣式的 `translate` 獨立屬性——手牌的扇形角度是寫在 `transform` 上的，
 * 動 `transform` 會把扇形抹平（`components.css` 那段註解記過這個坑），獨立屬性則是疊加上去。
 */
export function attachCardDrag(node: HTMLElement, hooks: CardDragHooks): void {
  let state: CardDragState | null = null;
  let hovered: number | null = null;

  const reset = (): void => {
    node.classList.remove('dragging');
    node.style.translate = '';
    node.style.zIndex = '';
    if (hovered !== null) { hovered = null; hooks.onHover?.(null); }
  };

  node.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    state = beginCardDrag(ev.clientX, ev.clientY);
  });

  node.addEventListener('pointermove', (ev) => {
    const s = state;
    if (!s) return;
    // 鍵已經放開卻沒收到 pointerup（在畫面外放開、切走視窗）：補收尾，
    // 不然下次滑過這張牌會從舊起點算位移，牌會憑空跳一段（地圖拖曳踩過同一個坑）
    if (ev.buttons === 0) {
      // 手牌是扇形疊著的，在一張牌邊緣按下、還沒到門檻就滑到隔壁再放開，這張牌永遠收不到 pointerup。
      // 這裡補收尾，但**沒真的拖過就不要叫 onCancel**：那條路會觸發整頁重畫，
      // 把正在飄的傷害數字砍在半路（稽核 2026-09-07 低 1）
      const dragged = s.moved;
      state = null;
      reset();
      if (dragged) hooks.onCancel?.();
      return;
    }
    const to = cardDragTo(s, ev.clientX, ev.clientY, hooks.scale());
    if (!to.moved) return;
    if (!node.classList.contains('dragging')) {
      node.classList.add('dragging');
      node.style.zIndex = '999';
      try { node.setPointerCapture(ev.pointerId); } catch { /* 抓不到就不抓 */ }
      hooks.onStart?.();
    }
    node.style.translate = `${to.dx.toFixed(1)}px ${to.dy.toFixed(1)}px`;
    if (hooks.onHover) {
      const now = hooks.needsTarget ? hooks.enemyAt(ev.clientX, ev.clientY) : null;
      if (now !== hovered) { hovered = now; hooks.onHover(now); }
    }
  });

  const end = (ev: PointerEvent): void => {
    const s = state;
    if (!s) return;
    // 滑鼠三顆鍵共用一個 pointerId：中鍵／右鍵放開不能把左鍵的拖曳打斷
    if (ev.type === 'pointerup' && ev.button !== 0) return;
    state = null;
    // `pointercancel`＝這次手勢被瀏覽器作廢，玩家沒有放手也沒有確認，
    // 一律當成反悔退回。照原路走下去的話，牌壓在魔物身上就會被真的打出去、飯糰扣掉，
    // 而且不可逆（稽核 2026-09-07 中 1）
    if (ev.type === 'pointercancel') {
      const dragged = s.moved;
      reset();
      if (dragged) hooks.onCancel?.();
      return;
    }
    try {
      if (node.hasPointerCapture(ev.pointerId)) node.releasePointerCapture(ev.pointerId);
    } catch { /* 沒抓到就沒得放 */ }
    if (!s.moved) return;   // 沒拖到門檻：這一下留給既有的點擊流程
    const act = dropDecision({
      needsTarget: hooks.needsTarget,
      overEnemyUid: hooks.enemyAt(ev.clientX, ev.clientY),
      leftHand: hooks.leftHand(ev.clientY),
    });
    reset();
    // 拖過就把緊接著那一下 click 攔掉：不攔的話放開瞬間會再觸發一次既有的點擊流程
    //（要選目標的牌會進入「選目標」模式、不用選目標的牌會直接再打一次）
    const swallow = (e: Event): void => { e.stopPropagation(); e.preventDefault(); };
    node.addEventListener('click', swallow, true);
    setTimeout(() => node.removeEventListener('click', swallow, true), 0);
    if (act.kind === 'play') hooks.onPlay(act.targetUid);
    else hooks.onCancel?.();
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
}
