import { MIASMA_PURE, relicById } from '../content/relics';
import { artUrl } from './assets';
import { el } from './dom';
import { closeWithStory, lockScreen, overlayRoot, unlockScreen } from './overlay';
import { purifyChangeLines } from './purifyreveal';
import { hideTooltip } from './tooltip';

/**
 * 身上兩件以上沾了魔氣的秘寶、只能淨化一件時，挑哪一件（2026-09-23 內容擴充第三批，design3 6-2）。
 * 跟換忍具那個視窗同一種（`potionswap.ts`，同一套 `.swap-*` 樣式）：一件一列，圖示＋「拿掉什麼／代價」（`purifyChangeLines`）。
 * `cancellable`＝可以按「先不要」（貓窩：回去選打盹或磨爪）；事件裡那一步一定要挑一件（`onDone` 不會收到 null）。
 * 疊層規矩同 confirm.ts：疊層貼上去之後才 lockScreen。
 */
export function showPurifyPick(ids: readonly string[], onDone: (id: string | null) => void, opts: { cancellable?: boolean } = {}): void {
  const layer = overlayRoot();
  if (!layer || !ids.length) { onDone(ids[0] ?? null); return; }
  hideTooltip();
  const overlay = el('div', { class: 'modal-overlay' });
  let done = false;
  // 整局被換掉（重新同步、離開連線）時一起收掉、不叫 onDone（推前稽核 2026-09-25 低-1，理由同 potionswap.ts）
  const forget = closeWithStory(() => { if (done) return; done = true; overlay.remove(); unlockScreen(); hideTooltip(); });
  const dismiss = (id: string | null): void => { if (done) return; done = true; forget(); overlay.remove(); unlockScreen(); hideTooltip(); onDone(id); };
  const icon = (art: string, alt: string): Node | string => {
    const url = artUrl('icons', art);
    return url.startsWith('data:') ? '' : el('img', { src: url, alt });
  };
  const list = el('div', { class: 'swap-list' });
  for (const id of ids) {
    const r = relicById[id];
    const pure = relicById[MIASMA_PURE[id] ?? ''];
    if (!r || !pure) continue;
    // 說明改成跟淨化結果視窗同一套「拿掉什麼（綠）／代價（橘）」（2026-09-25）：原本兩行全文要自己比，
    // 而且只寫得出最大生命加回來的（血契短刀），舊護腕、魔氣殘片淨化當下會扣最大生命卻沒寫
    list.append(el('button', { class: 'swap-item', onclick: () => dismiss(id) },
      icon(r.art, r.name),
      el('div', { class: 'swap-text' },
        el('b', {}, `${r.name} → ${pure.name}`),
        ...purifyChangeLines(id)),
      el('span', { class: 'swap-go' }, '淨化這件')));
  }
  overlay.append(el('div', { class: 'modal swap-modal' },
    el('h2', { class: 'modal-title' }, '要淨化哪一件？'),
    list,
    opts.cancellable ? el('div', { class: 'modal-foot' }, el('button', { class: 'btn', onclick: () => dismiss(null) }, '先不要')) : ''));
  if (opts.cancellable) overlay.addEventListener('click', (ev) => { if (ev.target === overlay) dismiss(null); });
  layer.append(overlay);
  lockScreen();
}
