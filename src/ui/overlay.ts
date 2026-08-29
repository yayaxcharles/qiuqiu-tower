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
