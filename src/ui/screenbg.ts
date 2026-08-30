import { artUrl } from './assets';
import { el } from './dom';

/**
 * 節點畫面的底圖層。鋪滿整個舞台（含狀態列後面），放在畫面內容之前 append。
 *
 * 這幾張底圖都是「中央留空、景物在四邊」的構圖，所以畫面內容收進中央一塊米色面板
 * （見 screens.css 的 .screen），面板外面就是景物。文字顏色一律不動——面板與牌本來
 * 就是淺底深字，不必為了配深色底圖去改一堆散落各處的顏色。
 */
export function screenBg(key: string): HTMLElement {
  return el('div', { class: 'screen-bg', style: `background-image:url(${artUrl('bg', key)})` });
}

/** 樓層對應的戰鬥背景（1–5 塔下、6–10 塔中、11+ 塔頂）。戰鬥與緊接其後的獎勵畫面共用同一張。 */
export function tierBgKey(floor: number): string {
  return floor <= 5 ? 'bg/low' : floor <= 10 ? 'bg/mid' : 'bg/top';
}
