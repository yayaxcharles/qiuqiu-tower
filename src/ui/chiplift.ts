/**
 * 狀態牌子折成好幾排時，角色的腳底不動（使用者 2026-09-25：「噹噹、封封有時候被狀態到或是某些情況，
 * 角色會突然往上移，變成不是站在地上，角色會突然變高、腳離地」）。
 *
 * 病根：戰場上的角色格（`.combat .unit`）是貼著戰場底邊往上疊的——由上往下是立繪框、名字、血條、狀態牌子列。
 * 牌子列會折行（`flex-wrap`），牌子一多折成第二排，列高 24 → 50，整格變高 26 像素，立繪就被往上頂 26 像素、
 * 腳離開畫上的地板。噹噹開場就有銅護臂的蜷縮＋反彈、封封永遠掛著蓄氣牌子（寬 72），所以最常中；魔物同一套、一樣會浮。
 *
 * 做法：牌子列多出來的高度（比「一排」高出的部分）寫到角色格的 `--chips-lift`，立繪框用等量的負下邊距吃掉
 *（`combat.css` 的 `.combat .unit > .sprite-box`）。整格高度不變，立繪框的位置就不變；
 * 名字、血條、牌子整塊往上長、蓋在腳上。
 *
 * 為什麼往上長、不往下溢出：戰場下緣（470）緊貼著手牌（475 起）與左下角的飯糰列（486 起），
 * 那幾層的疊放順序比戰場高。往下溢出的牌子會被手牌、飯糰壓在底下——魔物多出來那排整排看不到（實測）。
 * 往上長只蓋到自己的立繪，不會碰到任何按得到的東西。
 *
 * 「一排」＝牌子列的最小高度（`min-height`，沒有牌子時它就是這麼高）：以零個牌子時的位置為準，
 * 一排球球的牌子比最小高度高 1～2 像素那一點也一起吃掉，連一排都不會晃。
 *
 * 為什麼要程式量、不能純 CSS：CSS 沒辦法讓立繪框的邊距參照兄弟節點（牌子列）的實際高度；
 * 改成固定高度的外框則要照角色、魔物、手機、師父各寫一個數字，哪天字級一改就悄悄錯位。
 */

/** 角色格上的 CSS 變數：牌子列比一排多出來的高度 */
export const CHIPS_LIFT_VAR = '--chips-lift';

/** 牌子列比一排高出多少（像素，四捨五入到 0.01）。一排以內（或還沒排版、量到 0）回 0 */
export function chipsLift(rowHeight: number, oneRow: number): number {
  if (!(rowHeight > oneRow)) return 0;
  return Math.round((rowHeight - oneRow) * 100) / 100;
}

/** 量一排牌子列：實際高度（排版後的值，帶小數）與最小高度 */
export type ChipsMeasure = (row: HTMLElement) => { height: number; minHeight: number };

const domMeasure: ChipsMeasure = (row) => {
  const cs = getComputedStyle(row);
  const h = parseFloat(cs.height);
  return { height: Number.isFinite(h) ? h : row.offsetHeight, minHeight: parseFloat(cs.minHeight) || 0 };
};

/** 寫到牌子列的上一層（角色格）。值沒變就不寫：寫一次 style 就會弄髒版面，下一個量位置的人得重排一次 */
function write(row: HTMLElement, lift: number): void {
  const unit = row.parentElement;
  if (!unit) return;
  const want = lift > 0 ? `${lift}px` : '';
  if (unit.style.getPropertyValue(CHIPS_LIFT_VAR) === want) return;
  if (want) unit.style.setProperty(CHIPS_LIFT_VAR, want);
  else unit.style.removeProperty(CHIPS_LIFT_VAR);
}

export type ChipsLift = {
  /** 牌子列一建好就掛上：之後折行有變（字型、手機橫拿換字級……）瀏覽器在畫出來之前會通知，自動補 */
  watch(row: HTMLElement): void;
  /**
   * 節點剛放進畫面就**同步**量一次、寫上去。戰鬥畫面好幾處在重畫的同一拍就量立繪位置
   *（瞄準箭頭、近戰衝刺的起點），光靠 `watch` 的通知要等到這一拍跑完，那幾處會量到被頂高的舊位置。
   * `scope` 可以是整個戰場或一格角色。先全部量完再一起寫，只逼瀏覽器排一次版。
   */
  settle(scope: ParentNode): void;
  /** 換畫面時拆掉 */
  disconnect(): void;
};

type ResizeWatcher = { observe(t: Element): void; unobserve(t: Element): void; disconnect(): void };
export type ResizeWatcherCtor = new (cb: (entries: readonly { target: Element }[]) => void) => ResizeWatcher;

/**
 * 一個戰鬥畫面一份。`RO`、`measure` 只給測試換掉（倉庫測試不裝畫面環境）；
 * 沒有 ResizeObserver 的環境 `watch` 什麼都不做，`settle` 照樣能用。
 */
export function createChipsLift(opts: { RO?: ResizeWatcherCtor | null; measure?: ChipsMeasure } = {}): ChipsLift {
  const measure = opts.measure ?? domMeasure;
  const Ctor = opts.RO === undefined ? (globalThis as { ResizeObserver?: ResizeWatcherCtor }).ResizeObserver : opts.RO;
  const liftOf = (row: HTMLElement): number => { const m = measure(row); return chipsLift(m.height, m.minHeight); };
  /** 先全部量完再一起寫：量一個寫一個，每寫一次下一個量的就得重排一次 */
  const apply = (rows: readonly HTMLElement[]): void => {
    const lifts = rows.map((row) => [row, liftOf(row)] as const);
    for (const [row, lift] of lifts) write(row, lift);
  };
  let ro: ResizeWatcher | undefined;
  if (typeof Ctor === 'function') {
    ro = new Ctor((entries) => {
      const live: HTMLElement[] = [];
      for (const { target } of entries) {
        // 被整排換掉的舊牌子列：不再量，順手放掉
        if (target.isConnected) live.push(target as HTMLElement);
        else ro?.unobserve(target);
      }
      apply(live);
    });
  }
  return {
    watch: (row) => ro?.observe(row),
    settle: (scope) => apply([...scope.querySelectorAll<HTMLElement>('.unit > .chips')].filter((row) => row.isConnected)),
    disconnect: () => ro?.disconnect(),
  };
}
