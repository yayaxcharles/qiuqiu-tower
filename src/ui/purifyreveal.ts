import { MIASMA_PURE, PURIFY_CHANGE, isMiasma, relicById } from '../content/relics';
import { artUrl } from './assets';
import { el } from './dom';
import { burst } from './fx';
import { closeWithStory, lockScreen, overlayRoot, unlockScreen } from './overlay';
import { hideTooltip } from './tooltip';

/**
 * **淨化結果視窗**（2026-09-25 使用者：「淨化完會變怎樣其實看不到，事件也都直接顯示淨化完成，應該要有個畫面讓玩家知道淨化完的變化」）。
 * 貓窩的清心香、玳瑁婆婆、事件三個地方淨化完都叫這一支（使用者選「跳一個視窗」：三處一樣、一次淨化好幾件也排得下）。
 * 一件一列：原件圖示罩紫霧 → 霧散（煙）→ 淨化版從白金光裡彈出來；下面綠字是拿掉的壞處、橘字是代價（`PURIFY_CHANGE`）。
 * 按「收好了」關掉才叫 `onClose`（貓窩等它關掉才回地圖）。疊層規矩同 purifypick.ts：貼上去之後才 lockScreen；
 * 整局被換掉（重新同步、離開連線）時一起收掉、不叫 `onClose`。**不跟著換畫面收**：連線時同伴做完就上樓，看到一半被收掉就白做了。
 */
export function showPurifyReveal(ids: readonly string[], onClose?: () => void): void {
  const layer = overlayRoot();
  const rows = ids.filter((id) => relicById[id] && relicById[MIASMA_PURE[id] ?? '']);
  if (!layer || !rows.length) { onClose?.(); return; }
  hideTooltip();
  const overlay = el('div', { class: 'modal-overlay purify-overlay' });
  let done = false;
  const timers: number[] = [];
  const forget = closeWithStory(() => { if (done) return; done = true; for (const t of timers) window.clearTimeout(t); overlay.remove(); unlockScreen(); });
  const dismiss = (): void => {
    if (done) return;
    done = true; forget();
    for (const t of timers) window.clearTimeout(t);
    overlay.remove(); unlockScreen(); hideTooltip();
    onClose?.();
  };
  const list = el('div', { class: 'purify-list' });
  for (const id of rows) {
    const r = relicById[id]!, pure = relicById[MIASMA_PURE[id]!]!;
    const before = el('span', { class: 'fx-host purify-before' }, icon(r.art, r.name));
    const after = el('span', { class: 'fx-host purify-after' }, icon(pure.art, pure.name));
    list.append(el('div', { class: 'purify-row' },
      el('div', { class: 'purify-icons' }, before, el('span', { class: 'purify-arrow' }, '→'), after),
      el('b', { class: 'purify-names' }, `${r.name} → ${pure.name}`),
      ...purifyChangeLines(id)));
    // 紫霧先罩著一下，散掉（煙）之後淨化版才彈出來（白金光）；兩個特效都要等節點進了文件才量得到位置
    timers.push(window.setTimeout(() => { before.classList.add('cleared'); burst(before, 'smoke'); }, 450));
    timers.push(window.setTimeout(() => { after.classList.add('shown'); burst(after, 'buff'); }, 850));
  }
  overlay.append(el('div', { class: 'modal purify-modal' },
    el('h2', { class: 'modal-title' }, '淨化完成'),
    list,
    el('div', { class: 'modal-foot' }, el('button', { class: 'btn primary', onclick: dismiss }, '收好了'))));
  layer.append(overlay);
  lockScreen();
}

/**
 * 「淨化會變怎樣」那幾行：綠字＝拿掉的壞處、橘字＝代價，沒有代價就寫一行灰字「沒有代價」。
 * 結果視窗與挑選窗（purifypick.ts）共用，兩邊講的一定一樣。
 */
export function purifyChangeLines(id: string): HTMLElement[] {
  const ch = PURIFY_CHANGE[id];
  if (!ch) return [];
  return [
    ...ch.good.map((t) => el('span', { class: 'purify-good' }, `✔ ${t}`)),
    ...(ch.bad.length ? ch.bad.map((t) => el('span', { class: 'purify-bad' }, `代價：${t}`)) : [el('span', { class: 'purify-none' }, '沒有代價')]),
  ];
}

/**
 * 這段期間淨化掉了哪幾件（原件的代號）：之前身上有原件、現在原件不見了而淨化版在身上。
 * 事件畫面用它比對「進事件時」與「結果出來時」的秘寶清單，不管是一件、全部、挑的還是連線投票淨化的都抓得到。
 * 之前就有淨化版的不算（那不是這一次淨化的）。
 */
export function purifiedBetween(before: readonly string[], after: readonly string[]): string[] {
  return before.filter((id) => isMiasma(id) && !after.includes(id) && after.includes(MIASMA_PURE[id]!) && !before.includes(MIASMA_PURE[id]!));
}

function icon(art: string, alt: string): Node {
  const url = artUrl('icons', art);
  return url.startsWith('data:') ? el('span', { class: 'purify-noart' }, alt.slice(0, 2)) : el('img', { src: url, alt });
}
