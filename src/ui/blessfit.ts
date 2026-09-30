/*
 * 開局祝福：旁白讓位給卡片說明（2026-09-30 英日極端版面檢查 高-4）。
 *
 * 卡片架釘在畫面上面、旁白框貼底往上長，兩塊各自定位、互相看不到高度。繁中旁白兩行、留得下；
 * 英文旁白四行，最多蓋住第四張卡的說明 64 像素（手機 76），代價類祝福的「Max HP −8」就被旁白壓住讀不出來。
 * 作法同罐頭鋪的 `fitGoods`：畫好之後量現場，撞到了才一級一級退讓，沒撞到一個像素都不動（繁中不受影響）。
 * 不動主圖與卡片本身的大小以外的東西：先縮旁白的字與行距、再收下內距與主角那句話，最後才把卡片排整排縮一點（原點在上緣）。
 * 純判斷放這裡（測試直接呼叫），量版面的那一段在 `fitBlessing`。
 */

/** 卡片底邊跟旁白第一行至少隔幾像素（舞台座標） */
export const BLESS_GAP = 4;
/** 卡片排最多縮到幾倍：再小 13 像素的說明字就讀不到了 */
export const BLESS_MIN_SCALE = 0.85;
/** 退讓的類別級數（`.bless-fit-1`、`.bless-fit-2`；第 3 級是縮卡片排，不是類別） */
export const BLESS_CLASS_LEVELS = 2;

/** 從第 1 級起挑第一個不撞的級（0 是原樣、已經量過撞了）；`overlap(level)` 套上那一級後回傳還蓋住幾像素 */
export function pickBlessLevel(overlap: (level: number) => number, max = BLESS_CLASS_LEVELS): number {
  for (let l = 1; l <= max; l++) if (overlap(l) <= 0) return l;
  return max;
}

/** 卡片排要縮成幾倍才不撞：`overlap` 是還蓋住幾像素，`rowHeight` 是卡片排現在的高（原點在上緣，底邊上移量＝高×(1−倍數)） */
export function blessRowScale(overlap: number, rowHeight: number, min = BLESS_MIN_SCALE): number {
  if (overlap <= 0 || rowHeight <= 0) return 1;
  return Math.max(min, Math.min(1, 1 - overlap / rowHeight));
}

/** 目前舞台被縮放多少倍（`#stage` 的 `transform: scale()`） */
function stageScale(): number {
  const w = document.getElementById('stage')?.getBoundingClientRect().width ?? 0;
  return w > 0 ? w / 1280 : 1;
}

/**
 * 量現場：卡片的最底邊（含連線時同伴那一排；卡片高度是最長那張的說明決定的，框都不能被字壓到）跟旁白框第一個看得見的元素（名牌或第一行字）的上緣，
 * 蓋住多少像素（負數＝還有空隙；已經留了 `BLESS_GAP`）。旁白框有一段從下面滑上來的彈入動畫，量到的字比實際低，扣掉現在的位移。
 */
export function measureBlessOverlap(scene: HTMLElement): number {
  const box = scene.querySelector<HTMLElement>('.scene-box');
  const stage = scene.querySelector<HTMLElement>('.bless-stage');
  if (!box || !stage) return 0;
  const k = stageScale();
  const t = getComputedStyle(box).transform;
  const lift = t && t !== 'none' && typeof DOMMatrixReadOnly === 'function' ? new DOMMatrixReadOnly(t).m42 : 0;
  let cardsBottom = -Infinity;
  for (const e of stage.querySelectorAll('.bless-card')) cardsBottom = Math.max(cardsBottom, e.getBoundingClientRect().bottom);
  for (const e of stage.querySelectorAll('.bless-mate')) cardsBottom = Math.max(cardsBottom, e.getBoundingClientRect().bottom);
  if (cardsBottom === -Infinity) return 0;
  const first = box.querySelector<HTMLElement>('.dialogue-speaker:not(:empty), .scene-text');
  if (!first) return 0;
  let top = Infinity;
  const range = document.createRange();
  range.selectNodeContents(first);
  for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) top = Math.min(top, r.top);
  if (top === Infinity) top = first.getBoundingClientRect().top;
  return (cardsBottom - (top - lift * k)) / k + BLESS_GAP;
}

/** 畫好之後叫（節點要已經在文件裡）：撞到了才退讓 */
export function fitBlessing(scene: HTMLElement): void {
  const row = scene.querySelector<HTMLElement>('.bless-row');
  if (!row || !scene.isConnected) return;
  row.style.removeProperty('scale');
  for (let i = 1; i <= BLESS_CLASS_LEVELS; i++) scene.classList.remove(`bless-fit-${i}`);
  if (measureBlessOverlap(scene) <= 0) return;
  const level = pickBlessLevel((l) => {
    for (let i = 1; i <= BLESS_CLASS_LEVELS; i++) scene.classList.toggle(`bless-fit-${i}`, i <= l);
    return measureBlessOverlap(scene);
  });
  const left = measureBlessOverlap(scene);
  if (left <= 0 || level < BLESS_CLASS_LEVELS) return;
  const k = stageScale();
  const s = blessRowScale(left, row.getBoundingClientRect().height / k);
  if (s < 1) row.style.scale = String(Math.floor(s * 1000) / 1000);
}
