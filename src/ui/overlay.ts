/**
 * 疊層容器的門牌。舞台分兩層：畫面層（`#screen`）每次換畫面就整個清空重畫，
 * 疊層（`#overlay`）留著不動——吐槽、對白、名詞提示、牌組視窗都貼在這裡，
 * 才不會被 `App.show()` 一起掃掉（對白被掃掉的話 onDone 永遠不會叫，整個流程就卡住）。
 *
 * 各疊層元件不要自己去 `document.getElementById('stage')` 找位置，一律問這裡。
 */
let root: HTMLElement | null = null;

/** 由 App 建好舞台之後掛上來 */
export function setOverlayRoot(node: HTMLElement | null): void { root = node; }

/** 疊層容器；舞台還沒建好就回 null，呼叫端自己決定要怎麼退場 */
export function overlayRoot(): HTMLElement | null { return root; }

/**
 * 疊層開著的時候，把底下的畫面層整個停用。
 *
 * 全螢幕黑幕只擋得住滑鼠，畫面層的按鈕還留在 Tab 順序裡，按 Enter 照樣會被觸發：事件的選項會
 * 再跑一次效果（劫富濟貧就會再砍一半小魚乾、再回一次血、再開一個挑牌視窗），罐頭鋪的「離開」
 * 會把地圖畫到底下去。`inert` 連鍵盤焦點與點擊一起擋掉，正好是這裡要的。挑牌疊層與對白疊層
 * 都要上這道鎖。
 *
 * **用計數不用布林**：兩個疊層同時開著（5F 的秘笈對白蓋在事件畫面上、序章對白時按下「新的一局」）
 * 的時候，關掉上面那個不能把下面那個的鎖一起解掉。
 *
 * `#screen` 每次換畫面只是被清空、元素本身不會被換掉，所以每次現查是安全的。
 */
let locks = 0;
function screenLayer(): HTMLElement | null {
  return root?.parentElement?.querySelector<HTMLElement>('#screen') ?? null;
}
/** 上鎖**一定要排在疊層貼上去之後**：中途丟例外的話至少不會鎖著一個沒有疊層可關的畫面 */
export function lockScreen(): void {
  locks += 1;
  if (locks === 1) screenLayer()?.setAttribute('inert', '');
}
/** 解鎖要排在呼叫端的回呼之前：回呼裡就會重畫畫面、擺上新的按鈕（清空重畫不會把 inert 帶走） */
export function unlockScreen(): void {
  if (locks === 0) return;
  locks -= 1;
  if (locks === 0) screenLayer()?.removeAttribute('inert');
}
