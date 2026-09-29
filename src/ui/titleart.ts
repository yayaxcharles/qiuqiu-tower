import { artUrl, decodeAll, hasSprite, heroArtUrl } from './assets';
import { getLang } from '../i18n';

/**
 * 封面那幾張圖（2026-09-29 效能：封面早一點出來）。
 *
 * 封面畫出來那一刻，四隻「參上」與底圖才開始下載；原本背景預載也在同一刻開抓（一次六張），
 * 慢網路下封面四隻貓得跟幾百張背景圖搶頻寬，量到封面出現 2.4 秒、四隻到齊 4.3 秒。
 * 所以主程式先等這幾張到齊（最多 `TITLE_ART_CAP_MS`）才開始背景預載（`main.ts`）。
 *
 * 網址跟封面畫面（`screens/title.ts`）**走同一條路**：語言版本由 `titleCoverKey` 挑、沒進倉的退回同一張替代圖。
 * 兩邊算法不一樣的話，這裡等的是一張、畫面畫的是另一張，等於沒等。
 */

/** 「參上」貼圖照語言換（英日版的題字是 `tools/gen_cover_i18n.py` 重寫的，貓與煙塵同一張）；沒有那一版就用中文原圖 */
export function titleCoverKey(key: string): string {
  const lang = getLang();
  return lang !== 'zh' && hasSprite(`${key}_${lang}`) ? `${key}_${lang}` : key;
}

/** 封面四隻貓的圖（排法照畫面：菲菲、球球、噹噹、封封），她們的「參上」沒進倉時退回的那一張也照畫面 */
export function titleCatUrls(): string[] {
  return [
    hasSprite('hero/feifei_cover') ? artUrl('sprites', titleCoverKey('hero/feifei_cover')) : artUrl('sprites', 'hero/feifei_win'),
    artUrl('sprites', titleCoverKey('hero/cover')),
    hasSprite('hero/dangdang_cover') ? artUrl('sprites', titleCoverKey('hero/dangdang_cover')) : heroArtUrl('dangdang', 'hero/ninja_win'),
    hasSprite('hero/fengfeng_cover') ? artUrl('sprites', titleCoverKey('hero/fengfeng_cover')) : heroArtUrl('fengfeng', 'hero/ninja_win'),
  ];
}

/** 封面要等的全部：底圖＋四隻貓 */
export function titleArtUrls(): string[] {
  return [artUrl('bg', 'bg/screen_title'), ...titleCatUrls()];
}

/** 最多等多久：網路整個卡住時，背景預載也不能永遠不開始 */
export const TITLE_ART_CAP_MS = 6000;

/**
 * 等封面那幾張下載＋解碼好（插隊），最多 `capMs`。不留參照：畫面上的 `<img>` 自己握著。
 * 跟畫面上的 `<img>` 是同一個網址，瀏覽器只抓一次。
 */
export function whenTitleArtReady(capMs = TITLE_ART_CAP_MS): Promise<void> {
  const work = decodeAll(titleArtUrls(), 5, false, undefined, 'high');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((r) => { timer = setTimeout(r, capMs); });
  return Promise.race([work, cap]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}
