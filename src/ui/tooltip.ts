import { glossary } from '../content/glossary';
import { el } from './dom';
import { overlayRoot } from './overlay';

// 長的排前面，「大魔物」才不會被「魔物」之類的短詞先吃掉
const TERMS = Object.keys(glossary).sort((a, b) => b.length - a.length);
const RE = TERMS.length
  ? new RegExp(TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
  : /(?!)/g;   // 名詞表空的時候不要變成「什麼都比對得到」

let tip: HTMLElement | null = null;

/**
 * 自由文字的提示（魔物意圖、藥水、能力牌）裡出現的名詞，在提示框底下各補一行白話說明——
 * 意圖寫「給你 2 層炸毛、1 層翻肚」、藥水寫「給目標 2 層翻肚」，玩家滑上去卻看不到翻肚是什麼（使用者 2026-09-06）。
 * 提示框裡不再套一層提示（滑不進去），直接把說明寫進來。太常見、解釋了只是噪音的詞跳過；最多補三個。
 */
const APPENDIX_SKIP = new Set(['飽足', '飯糰', '防禦', '蜷縮', '小魚乾', '本局代碼', '秘寶', '忍具', '罐頭鋪', '貓窩', '紙箱', '大魔物', '塔主', '魔氣暴走', '叼著小魚乾']);
function glossaryLines(body: string, skip: string): HTMLElement[] {
  const seen: string[] = [];
  for (const m of body.matchAll(RE)) {
    const w = m[0];
    if (!w || w === skip || APPENDIX_SKIP.has(w) || seen.includes(w) || !glossary[w]) continue;
    seen.push(w);
    if (seen.length >= 3) break;
  }
  return seen.map((w) => el('div', { class: 'tip-term' }, el('span', { class: 'tip-term-name' }, w + '：'), glossary[w]!));
}

function showTip(anchor: HTMLElement, term: string, body?: string): void {
  hideTooltip();
  const layer = overlayRoot();
  if (!layer) return;
  tip = el('div', { class: 'tooltip' }, el('b', {}, term), el('div', {}, body ?? glossary[term] ?? ''), ...(body ? glossaryLines(body, term) : []));
  layer.append(tip);
  const r = anchor.getBoundingClientRect();
  const s = layer.getBoundingClientRect();   // 疊層鋪滿整個舞台（inset: 0），量到的框跟 #stage 一模一樣
  const scale = s.width / 1280;   // 舞台被 transform 縮過，量到的座標要換算回 1280×720
  tip.style.left = `${Math.max(0, Math.min(1280 - 280, (r.left - s.left) / scale))}px`;
  tip.style.top = `${Math.max(0, (r.top - s.top) / scale - 90)}px`;
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

/** 把牌面文字裡的名詞包成可提示的 span */
export function markupKeywords(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const word = m[0];
    const at = m.index;
    if (!word || at === undefined) continue;
    frag.append(text.slice(last, at));
    const span = el('span', { class: 'kw' }, word);
    attachTooltip(span, word);
    frag.append(span);
    last = at + word.length;
  }
  frag.append(text.slice(last));
  return frag;
}
