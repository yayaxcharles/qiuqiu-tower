/*
 * 牌面放不下時的後兩級（2026-09-30 英日極端版面檢查 高-3、中-5；量版面的轉接器在 `src/i18n/layout.ts`，只有英日語言包才會載入）。
 * 前面縮字的幾輪還在 `cardview.ts` 的 `fitCardText`（首載，每張牌都走）；縮到底還放不下才走到這裡：
 *   牌名：縮到 9px 還放不下，換成兩行、字級為原本的 `NAME_WRAP_SIZE` 倍（不再切掉字母）；
 *   規則文字：縮到 10px 還被切，先把行距 1.3 收到 1.2，再一次 2 像素把牌圖高度讓給文字（最多縮到 `ART_MIN_RATIO`）。牌圖是裝飾，最後才動它。
 */

export const NAME_WRAP_SIZE = 0.85;   // 換兩行時牌名字級是原本的幾成
export const ART_MIN_RATIO = 0.7;     // 牌圖最多縮到原高的幾成

export interface NameWrapAdapter {
  /** 原本的牌名字級（已清掉前面縮字留下的） */
  base: number;
  /** 改成可換行（兩行） */
  wrap(): void;
  setSize(px: number): void;
  /** 還有單字比框寬 */
  tooWide(): boolean;
  /** 字級 `ws` 時是不是超過兩行 */
  tooTall(ws: number): boolean;
}

/** 牌名換兩行，回傳最後的字級；兩行還放不下（單字太長、還是三行）再縮，最低 10 */
export function runNameWrap(a: NameWrapAdapter): number {
  a.wrap();
  let ws = Math.round(a.base * NAME_WRAP_SIZE * 2) / 2;
  a.setSize(ws);
  for (let i = 0; i < 6 && ws > 10 && (a.tooWide() || a.tooTall(ws)); i++) { ws -= 0.5; a.setSize(ws); }
  return ws;
}

export interface TextSpaceAdapter {
  /** 規則文字放不下（被切） */
  overflow(): boolean;
  /** 行距收到 1.2 */
  tighten(): void;
  /** 牌圖現在的高、設牌圖的高 */
  artHeight(): number;
  setArt(h: number): void;
}

/** 行距、牌圖讓位，回傳牌圖縮了幾像素（沒動牌圖＝0） */
export function runTextSpace(a: TextSpaceAdapter): number {
  a.tighten();
  if (!a.overflow()) return 0;
  const full = a.artHeight();
  let h = full;
  for (let i = 0; i < 16 && a.overflow() && h - 2 >= full * ART_MIN_RATIO; i++) { h -= 2; a.setArt(h); }
  return full - h;
}
