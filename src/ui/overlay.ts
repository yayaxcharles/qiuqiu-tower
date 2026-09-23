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

/**
 * **跟著畫面走的疊層**（牌組、挑牌、秘寶清單）：換到**別的畫面**時由 `App.show()` 收掉（2026-09-22 畫面盤點 補查）。
 *
 * 連線時畫面不一定是自己換的：同伴挑完牌、投票湊齊，我這邊就被帶到下一格。原本開著的牌組視窗會整個留在新畫面上，
 * 底下被 `inert` 鎖住（實機看過：戰利品頁開著牌組，同伴一挑完牌，回到地圖視窗還在）。
 * 收掉時**不叫呼叫端的回呼**：那是上一格畫面的處理函式，叫下去會對新畫面動手。
 * 同一個畫面只是重畫（同伴投了一票）不收——戰利品頁那個不能取消的升級視窗要一直留著。
 */
const screenModals = new Set<() => void>();
/** 登記一個跟著畫面走的疊層；回傳「自己關掉了，不用再收」 */
export function closeWithScreen(close: () => void): () => void {
  screenModals.add(close);
  return () => { screenModals.delete(close); };
}
/** 換畫面時收掉所有登記過的疊層（`App.show()` 在換到別的畫面時叫） */
export function closeScreenModals(): void {
  const all = [...screenModals];
  screenModals.clear();
  for (const close of all) close();
}

/**
 * **劇情疊層**（幻燈片、對白、過場影片）：丟掉這一局的時候整批收掉（2026-09-23 稽核 高-1）。
 *
 * 這三種平常刻意**不**跟著換畫面收（收掉的話 onDone 永遠不會叫，流程靜靜卡死，見檔頭）。
 * 可是連線斷了、按紅色橫幅「回標題」的時候，它們的 onDone 接著就是 `show('map')`、開打、進過關畫面——
 * 那一局已經丟了，接下去只會把兩人局當成單機玩、再把它寫進單機存檔。
 * 實際踩到的是序章：幻燈片蓋在標題上，把剩下幾張點完就以單機模式進了兩人局的地圖。
 *
 * 所以這一批收掉時**不叫 onDone**，只拆節點、解鎖。由 `App.leaveCoop()` 在離開連線局時叫。
 */
const storyOverlays = new Set<() => void>();
/** 登記一段劇情疊層；回傳「自己演完了，不用再收」 */
export function closeWithStory(close: () => void): () => void {
  storyOverlays.add(close);
  return () => { storyOverlays.delete(close); };
}
/** 收掉所有還在演的劇情疊層，不叫它們的 onDone */
export function closeStoryOverlays(): void {
  const all = [...storyOverlays];
  storyOverlays.clear();
  for (const close of all) close();
}
