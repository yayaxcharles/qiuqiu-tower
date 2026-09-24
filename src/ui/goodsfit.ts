/*
 * 罐頭鋪的貨架讓位給對白（2026-09-24 實機驗收五 中）。
 *
 * 貨架釘在上面、對白框釘在下面，兩塊各自定位、彼此看不見高度。長毛掌櫃那間一定有店長私藏，
 * 私藏那件（集章卡）的說明很長，把秘寶那一排撐高，最下面那排價錢就沉進對白框：
 * 桌機第二關三格被店主那句字蓋掉 22～26 像素，手機兩三格。說明長度、對白行數、手機的大字都會動，
 * 一條寫死的樣式顧不到每一種組合，所以跟事件插圖的 `fitArt` 同一個作法：畫好之後量現場，
 * 價錢跟蓋在它上面的字（名牌、店主那句、自己回那句、按鈕）撞到了，就把整座貨架從上緣往上縮一點。
 * 純計算放這裡（測試直接呼叫），量版面的那一段在 `scene.ts` 的 `fitGoods`。
 */

/** 價錢底邊跟底下那一行字至少隔幾像素（舞台座標） */
export const GOODS_GAP = 6;
/** 最多縮到幾成：再小手機上的字就讀不到了，那時寧可撞一點也不要縮成一團（量測會抓到、要另外處理） */
export const GOODS_MIN_SCALE = 0.8;

export interface Box { x: number; y: number; w: number; h: number }

/** 兩個矩形左右有沒有交集（上下不管）：左右錯開的字蓋不到那個價錢 */
function sideBySide(a: Box, b: Box): boolean {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5;
}

/**
 * 貨架要再縮成現在的幾倍：`goodsTop` 是貨架上緣（縮放的基準點，上緣不動），`prices` 是每一格價錢現在的位置，
 * `covers` 是對白框裡每一行字與每一顆按鈕的位置（全部舞台座標、已經套著現在的縮放）。
 * 回傳 1＝不用再縮；小於 1 就是乘上去的倍數（呼叫端乘完再量一次，左右位置縮完會跟著動）。
 */
export function goodsShrink(goodsTop: number, prices: readonly Box[], covers: readonly Box[], gap = GOODS_GAP): number {
  let need = 1;
  for (const p of prices) {
    const bottom = p.y + p.h;
    const span = bottom - goodsTop;
    if (span <= 0) continue;
    for (const c of covers) {
      if (!sideBySide(p, c) || c.y + c.h <= p.y || bottom + gap <= c.y) continue;
      need = Math.min(need, (c.y - gap - goodsTop) / span);
    }
  }
  return need;
}

/** 下一輪要設的縮放：現在的縮放 × 還要縮的倍數，最小 `GOODS_MIN_SCALE` */
export function nextGoodsScale(current: number, shrink: number, min = GOODS_MIN_SCALE): number {
  return Math.max(min, Math.min(1, current * shrink));
}
