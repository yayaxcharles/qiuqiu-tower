/*
 * 版面退讓的掛鉤與「轉向重量」登記（2026-10-01 審查後修正）。
 *
 * ① 掛鉤：事件文字讓位、祝福旁白讓位、牌名換行與牌圖讓高度、魔物意圖牌與名字牌縮字，只有英日才會走到（繁中量過放得下、明擺著跳過），
 *    這些程式放在英日語言包旁邊（`src/i18n/layout.ts`，語言包載入時才掛上來），首載只留這幾個空位，不多下載繁中玩家用不到的字。
 * ② 轉向重量：手機直拿時舞台雖然還在，但手機橫拿專用的樣式（`phone.css` 只在 `data-orient="landscape"` 生效）沒套上，
 *    這時量到的是錯的尺寸；轉橫之後不重量，畫面就停在直拿時決定的退讓級數上。
 *    所以每個退讓都：直拿時不量、先登記；`app.ts` 偵測到裝置或方向改變就叫 `relayout()`，對還在畫面上的那些重跑一次。
 */

export interface LayoutHooks {
  /** 事件文字太長壓到插圖：對白框與插圖該讓位時縮字、收內距、捲動（`limit` 不給＝照事件插圖的下限） */
  scene?: (scene: HTMLElement, box: HTMLElement, limit?: number) => void;
  /** 中間放牌或獲得物展示的畫面，對白框不能壓到那一塊 */
  showcase?: (scene: HTMLElement, box: HTMLElement) => void;
  /** 開局祝福旁白蓋到卡片說明 */
  bless?: (scene: HTMLElement) => void;
  /** 戰場上的意圖牌與名字牌放不下 */
  labels?: (field: ParentNode) => void;
  /** 狀態列放不下：逐級退讓（量與改的轉接器；英日語言包掛好，繁中第一次畫狀態列時按需載入） */
  hud?: (hud: HTMLElement, relics: HTMLElement, moreBtn: (n: number) => HTMLElement, total: number) => void;
  /** 提示框縱向位置（下緣不出舞台）：英日才掛，繁中維持原位 */
  tipTop?: (anchorTop: number, height: number) => number | undefined;
  /** 牌面：`name`＝牌名縮到 9px 還放不下（換兩行）、`text`＝文字縮到 10px 還被切（收行距、讓牌圖高度） */
  card?: (node: HTMLElement, step: 'name' | 'text') => void;
}
export const layoutHooks: LayoutHooks = {};

/** 現在量得準嗎：手機直拿時手機橫拿專用的樣式沒套上，量到的尺寸不作數（桌機、平板把視窗拉成直的，樣式不變，照量） */
export const layoutOk = (): boolean => { if (typeof document === 'undefined') return true; const d = document.documentElement.dataset; return !(d['device'] === 'phone' && d['orient'] === 'portrait'); };

const live = new Set<{ n: Node; f: () => void }>();
/** 登記：畫面轉向／換裝置後，對還連在畫面上的 `node` 重跑 `fn`（節點離開畫面就自動撤掉） */
export function watchLayout(n: Node, f: () => void): void {
  if (live.size > 48) for (const e of live) if (!e.n.isConnected) live.delete(e);
  live.add({ n, f });
}
/** 重跑全部登記過的退讓（量測都是冪等的：先還原再量） */
export function relayout(): void {
  for (const e of [...live]) { if (!e.n.isConnected) live.delete(e); else e.f(); }
}
