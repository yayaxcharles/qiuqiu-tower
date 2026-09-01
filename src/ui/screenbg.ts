import { artUrl } from './assets';
import { clear, el } from './dom';

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

/**
 * 清掉畫面內容，但把底圖那一層留著。
 *
 * 畫面內部重畫（事件選完、貓窩做完事、罐頭鋪買完東西）一律用這個，不要用 clear(root)——
 * 底圖是 root 的第一個子節點，clear 會把它一起清掉，畫面就變成一片米白、中間浮一小塊面板，
 * 看起來像當掉。2026-08-30 加底圖時漏掉這件事，事件選完真的被當成當機回報過。
 */
export function clearKeepBg(root: HTMLElement): void {
  const bg = root.querySelector('.screen-bg');
  clear(root);
  if (bg) root.append(bg);
}

/**
 * 樓層對應的戰鬥背景（1–5 塔下、6–10 塔中、11+ 塔頂）。
 * 戰鬥與緊接其後的獎勵畫面共用同一張。
 *
 * 每個層級有三張，用樓層挑——**不能用亂數**：戰鬥畫面每出一張牌就重畫一次，
 * 用亂數的話背景會一直換。用樓層當索引，同一層永遠是同一張，
 * 但相鄰的樓層會不一樣，走五層就不會一直看同一面牆（那正是本來的毛病）。
 */
const BG_VARIANTS = ['', '_b', '_c'] as const;
/**
 * `floor` 是跨關累計的樓層。三關制之後一關一個色調：
 * 塔下（1–15）石牢、塔中（16–30）木造、塔頂（31–45）夜空石台——
 * 原本 15 層內就把三種跑完，改成一關一種，「越爬越高」才有感。
 * 同一關內仍用樓層輪三張變化圖。
 */
export function tierBgKey(floor: number): string {
  const tier = floor <= 15 ? 'low' : floor <= 30 ? 'mid' : 'top';
  return `bg/${tier}${BG_VARIANTS[Math.abs(floor) % BG_VARIANTS.length]}`;
}

/**
 * 每張戰鬥背景要放多大，角色才踩得到地板。
 *
 * 立繪框的底（＝腳踩的那條線）固定在舞台 y=403，而九張背景畫的「牆腳」高低不一
 * （最高 400、最低 444）。不調的話角色一律浮在地板上方，塔頂那張更誇張——
 * 腳踩在石欄杆上，地磚在更下面（使用者：「應該是地上那磁磚上才對，你太上面」）。
 *
 * 背景原尺寸就是 1280x720、跟舞台一樣大，所以單純往上位移會在下緣開天窗。
 * 改成「放大＋貼齊下緣」：放大多少由各自的牆腳算出來，讓牆腳正好落在 403。
 * 代價是上緣（天空、天花板）裁掉一截，數字寫在下面。牆腳本來就在 403 以上的
 * 那兩張（low_b、mid_b）維持 100%，不做無謂的裁切。
 *
 * 2026-09-01 更新：原本九張的牆腳散在 402～476（塔頂那張要放大到 145% 才站得住，
 * 月亮塔樓全被裁光），所以照「牆與地板交界必須在第 400 條掃描線」重生了七張。
 * 現在牆腳都落在 390～410，放大率只要 106～113%，上緣只裁掉一成、場景幾乎全留。
 *
 * 牆腳的 y 是看圖定的（`tools/_floor_sheet3.png` 那張原尺寸對照表）：換背景圖要重看一次。
 */
const BG_ZOOM: Record<string, number> = {
  'bg/low': 106, 'bg/low_b': 109, 'bg/low_c': 111,
  'bg/mid': 109, 'bg/mid_b': 106, 'bg/mid_c': 108,
  'bg/top': 108, 'bg/top_b': 113, 'bg/top_c': 109,
};
export function tierBgZoom(key: string): number {
  return BG_ZOOM[key] ?? 100;
}

/**
 * 純裝飾用的素材（牌的底紋、地圖的腳印、介面的木樑與牌子）交給 CSS 用。
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
    // 這裡本來還有四個 `--corner-*`（面板與對白框四個角掛的角花）。
    // 2026-09-01 拿掉：事件那幾張圖的邊框跟角花疊在一起很雜，而且只拿掉事件的話
    // 各畫面會變成有的有、有的沒有。素材檔還留著，要復原就把四行加回來、
    // 再把 screens.css 的 `.screen` 與 base.css 的 `.dialogue-box` 那幾層背景圖補回去。
    '--paw': 'icon/paw',
    // 介面裝飾素材（木樑、名牌、六種意圖木牌、說明框的紙片）
    '--ui-beam': 'icon/ui_beam',
    '--ui-nameplate': 'icon/ui_nameplate',
    '--ui-note': 'icon/ui_note',
    '--ui-intent-attack': 'icon/ui_intent_attack',
    '--ui-intent-block': 'icon/ui_intent_block',
    '--ui-intent-buff': 'icon/ui_intent_buff',
    '--ui-intent-debuff': 'icon/ui_intent_debuff',
    '--ui-intent-special': 'icon/ui_intent_special',
    '--ui-intent-idle': 'icon/ui_intent_idle',
    '--cardframe-rare': 'icon/cardframe_rare',
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
