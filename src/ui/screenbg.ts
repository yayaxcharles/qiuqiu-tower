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

/**
 * 純裝飾用的素材（牌的底紋、面板四角的角花、地圖的腳印）交給 CSS 用。
 *
 * 這些是樣式表要用的圖，但網址得從 manifest 查、還要帶 BASE 前綴，CSS 自己拿不到。
 * 開場讀完 manifest 呼叫一次，把網址寫進 :root 的自訂屬性，樣式表就能 var() 取用。
 * 素材沒生好時 artUrl 會回一張灰剪影的 data URI，那種情況寧可什麼都不設，
 * 免得整疊牌背後浮出一堆灰貓頭。
 */
export function applyArtVars(): void {
  const vars: Record<string, string> = {
    '--paper-attack': 'bg/card_paper_attack',
    '--paper-skill': 'bg/card_paper_skill',
    '--paper-power': 'bg/card_paper_power',
  };
  const icons: Record<string, string> = {
    '--corner-tl': 'icon/corner_tl',
    '--corner-tr': 'icon/corner_tr',
    '--corner-bl': 'icon/corner_bl',
    '--corner-br': 'icon/corner_br',
    '--paw': 'icon/paw',
  };
  const root = document.documentElement;
  for (const [name, key] of Object.entries(vars)) {
    const url = artUrl('bg', key);
    if (!url.startsWith('data:')) root.style.setProperty(name, `url(${url})`);
  }
  for (const [name, key] of Object.entries(icons)) {
    const url = artUrl('icons', key);
    if (!url.startsWith('data:')) root.style.setProperty(name, `url(${url})`);
  }
}
