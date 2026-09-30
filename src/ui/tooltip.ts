import { getLang, glossText, langVersion, term, zhGlossary } from '../i18n';
import { el } from './dom';
import { overlayRoot } from './overlay';
import { tipTop } from './tippos';

/**
 * 名詞表照目前的語言換（多語系第一片，2026-09-29）：比對的是**畫面上的譯名**（Curl、丸まり），
 * 查說明時換回中文詞當鍵。英文加字界，免得「Claw」吃到別的字中間。換語言時整組重建。
 */
let built = -1;
let RE: RegExp = /(?!)/g;
let back = new Map<string, string>();   // 畫面上的詞 → 中文詞
function terms(): { re: RegExp; back: Map<string, string> } {
  if (built !== langVersion()) {
    built = langVersion();
    back = new Map(Object.keys(zhGlossary()).map((zh) => [term(zh), zh]));
    // 長的排前面，「大魔物」才不會被「魔物」之類的短詞先吃掉
    const words = [...back.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const b = getLang() === 'en' ? '\\b' : '';
    RE = words.length ? new RegExp(words.map((w) => `${b}${w}${b}`).join('|'), 'g') : /(?!)/g;   // 名詞表空的時候不要變成「什麼都比對得到」
  }
  return { re: RE, back };
}
/** 中文詞的說明（譯文缺就退回中文） */
function gloss(zh: string): string | undefined { return glossText(zh); }

let tip: HTMLElement | null = null;

/**
 * 自由文字的提示（魔物意圖、藥水、能力牌）裡出現的名詞，在提示框底下各補一行白話說明——
 * 意圖寫「給你 2 層炸毛、1 層翻肚」、藥水寫「給目標 2 層翻肚」，玩家滑上去卻看不到翻肚是什麼（使用者 2026-09-06）。
 * 提示框裡不再套一層提示（滑不進去），直接把說明寫進來。太常見、解釋了只是噪音的詞跳過；最多補三個。
 */
// 「保留」也跳過：它是牌面關鍵字，但守護符的說明把它當白話動詞用（「最多保留 8 點蜷縮」），自動展開會講錯東西（稽核 2026-09-06 介面 中-1）
const APPENDIX_SKIP = new Set(['飽足', '飯糰', '防禦', '蜷縮', '小魚乾', '本局代碼', '秘寶', '忍具', '罐頭鋪', '貓窩', '紙箱', '大魔物', '塔主', '魔氣暴走', '叼著小魚乾', '保留']);
function glossaryLines(body: string, skip: string): HTMLElement[] {
  const { re, back: toZh } = terms();
  const seen: string[] = [];
  for (const m of body.matchAll(re)) {
    const zh = toZh.get(m[0]);
    if (!zh || zh === skip || m[0] === skip || APPENDIX_SKIP.has(zh) || seen.includes(zh) || !gloss(zh)) continue;
    seen.push(zh);
    if (seen.length >= 3) break;
  }
  const colon = getLang() === 'en' ? ': ' : '：';
  return seen.map((zh) => el('div', { class: 'tip-term' }, el('span', { class: 'tip-term-name' }, term(zh) + colon), gloss(zh)!));
}

/** `word` 可以是中文詞（狀態列、牌面關鍵字傳進來的）或已經譯好的標題（自由文字提示） */
function showTip(anchor: HTMLElement, word: string, body?: string): void {
  hideTooltip();
  const layer = overlayRoot();
  if (!layer) return;
  const zh = terms().back.get(word) ?? word;
  tip = el('div', { class: 'tooltip' }, el('b', {}, body ? word : term(zh)), el('div', {}, body ?? gloss(zh) ?? ''), ...(body ? glossaryLines(body, zh) : []));
  layer.append(tip);
  const r = anchor.getBoundingClientRect();
  const s = layer.getBoundingClientRect();   // 疊層鋪滿整個舞台（inset: 0），量到的框跟 #stage 一模一樣
  const scale = s.width / 1280;   // 舞台被 transform 縮過，量到的座標要換算回 1280×720
  tip.style.left = `${Math.max(0, Math.min(1280 - 280, (r.left - s.left) / scale))}px`;
  // 框高要掛上去才量得到；下緣會出舞台就換位置（`tippos.ts`），放得下的照原樣
  tip.style.top = `${tipTop((r.top - s.top) / scale, tip.offsetHeight)}px`;
}

/**
 * 關掉還浮著的名詞提示。沒有提示時呼叫也沒事，所以「錨點可能被拿掉」的地方就放心叫：
 * 換畫面（App.show）、收掉牌組疊層、之後戰鬥打出一張牌把手牌節點移除的時候都要叫。
 * 只靠 mouseleave 不夠——節點被從 DOM 拿掉時 mouseleave 不會發生，提示框就變孤兒。
 */
export function hideTooltip(): void { tip?.remove(); tip = null; }

export function attachTooltip(node: HTMLElement, term: string): void {
  node.classList.add('has-tip');
  node.addEventListener('mouseenter', () => showTip(node, term));
  node.addEventListener('mouseleave', hideTooltip);
}

/**
 * 自由文字版的提示框（不查名詞表）。魔物頭上的意圖用這個：
 * 那裡只寫得下「攻 4」這種短標籤，滑上去才講得完「牠這一下實際會做什麼」。
 */
export function attachTextTooltip(node: HTMLElement, title: string, body: string): void {
  node.classList.add('has-tip');
  node.addEventListener('mouseenter', () => showTip(node, title, body));
  node.addEventListener('mouseleave', hideTooltip);
}

/**
 * 把牌面文字裡的名詞包成可提示的 span。
 *
 * `changed`＝升級版才有：這些字元位置跟沒升級的版本不一樣（見 `cardtext.upgradedChangedChars`），
 * 包一層 `.upg` 標色，玩家一眼就看得出升級動到哪裡。名詞本身被改到就直接在 `.kw` 上加 `.upg`，
 * 不要再包一層，不然提示框的滑鼠範圍會被切成兩半。
 */
export function markupKeywords(text: string, changed?: ReadonlySet<number>): DocumentFragment {
  const frag = document.createDocumentFragment();
  const mark = changed && changed.size > 0 ? changed : null;
  /** 名詞以外的普通文字：照「有沒有被改到」切成一段一段 */
  const plain = (from: number, to: number): void => {
    if (from >= to) return;
    if (!mark) { frag.append(text.slice(from, to)); return; }
    let i = from;
    while (i < to) {
      const on = mark.has(i);
      let j = i + 1;
      while (j < to && mark.has(j) === on) j++;
      const part = text.slice(i, j);
      frag.append(on ? el('span', { class: 'upg' }, part) : part);
      i = j;
    }
  };
  let last = 0;
  for (const m of text.matchAll(terms().re)) {
    const word = m[0];
    const at = m.index;
    if (!word || at === undefined) continue;
    plain(last, at);
    let hit = false;
    if (mark) for (let k = 0; k < word.length; k++) if (mark.has(at + k)) { hit = true; break; }
    const span = el('span', { class: hit ? 'kw upg' : 'kw' }, word);
    attachTooltip(span, word);
    frag.append(span);
    last = at + word.length;
  }
  plain(last, text.length);
  return frag;
}
