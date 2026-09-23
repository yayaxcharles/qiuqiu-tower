/**
 * 換畫面時舊畫面留在底下，讓新畫面淡入時透出來的是舊畫面（2026-09-23 實機驗收 M-2）。
 *
 * 原本 `show()` 先把畫面層清空、再讓新畫面從透明淡入 220 毫秒。畫面層底下就是舞台本身，
 * 舞台的底色是米白（base.css 的 `--paper`），所以新畫面第一格（不透明度 0）整片米白：
 * 打贏→戰利品、地圖→戰鬥／事件／貓窩、事件→戰鬥、關主門每一場都有，主執行緒一忙就掛著 70 多毫秒。
 * 回地圖則是從舞台的深色底淡入（地圖把舞台底色換成深色），一樣閃一下黑。
 * 實機對照：把淡入整個關掉，米白一格都沒有（底圖在第一格就畫好了，不是底圖沒解好）。
 *
 * 做法：舊的畫面層**原地不動**，只拿掉 id、改掛 `.screen-leaving`、墊到最底（base.css），
 * 新的畫面層插在它前面接手 `#screen`。不把舊節點搬去別的容器——搬過去 CSS 動畫會從頭重播
 *（面板的 `screen-in` 會從透明再淡入一次）；原地不動，最後那一格長什麼樣，墊在底下就是什麼樣。
 * 舊畫面的排版有幾條是看舞台上的畫面名（貓窩立繪位置、地圖的深色底、戰鬥的狀態列），
 * 所以把舞台當下的 `data-*` 抄一份到舊畫面層，樣式表寫成 `:is(#stage, .screen-leaving)[data-screen=…]`。
 */
export const LEAVING_CLASS = 'screen-leaving';

/**
 * 把現在的畫面層 `old` 改成退場層墊在底下，回傳接手的新畫面層（空的，`id="screen"`）。
 * 要在舞台換上新畫面的 `data-screen` **之前**叫（抄的是舊畫面的）。
 */
export function swapScreen(stage: HTMLElement, old: HTMLElement): HTMLElement {
  // 連續換兩次、上一場淡入還沒完：更底下那層直接撤，正要退場的這一層淡入直接跳到完（不然半透明透出米白）
  stage.querySelectorAll(`.${LEAVING_CLASS}`).forEach((n) => n.remove());
  for (const a of old.getAnimations?.() ?? []) { try { a.finish(); } catch { /* 無限循環的動畫跳不到完，留著 */ } }
  const next = old.cloneNode(false) as HTMLElement;   // 同樣的空殼（`id="screen"`），不帶子節點
  old.removeAttribute('id');
  old.classList.add(LEAVING_CLASS);
  Object.assign(old.dataset, stage.dataset);
  old.inert = true;   // 看得到、點不到也選不到（樣式表另外關掉指標）
  stage.insertBefore(next, old);
  return next;
}

/** 新畫面淡入完才把退場層撤掉（`fade` 被取消也撤；沒有動畫就當場撤） */
export function retireLeavingScreen(old: HTMLElement, fade: Animation | undefined): void {
  const done = (): void => { old.remove(); };
  if (fade?.finished) fade.finished.then(done, done);
  else done();
}
