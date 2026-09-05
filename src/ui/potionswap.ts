import { potionById } from '../content/potions';
import { replacePotion } from '../engine/run';
import type { RunState } from '../engine/types';
import { artUrl } from './assets';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';
import { hideTooltip } from './tooltip';

/**
 * 忍具帶滿了、又拿到一支：問要換掉哪一支（使用者 2026-09-02：「滿的話新拿到的可以把舊的替換掉」）。
 * 列出身上的每一支（圖、名字、效果）當按鈕，點了就換；「不換」就放棄新的那支。
 * 疊層規矩同 confirm.ts：疊層貼上去之後才 lockScreen。
 * `onDone(index)`：換掉了第幾支；不換回 -1。呼叫端自己決定要不要真的換（罐頭鋪要先付錢）。
 */
export function showPotionSwap(run: RunState, newId: string, onDone: (index: number) => void, opts: { apply?: boolean; progress?: string } = {}): void {
  const layer = overlayRoot();
  const def = potionById[newId];
  if (!layer || !def) { onDone(-1); return; }
  hideTooltip();
  const overlay = el('div', { class: 'modal-overlay' });
  const dismiss = (index: number): void => {
    overlay.remove();
    unlockScreen();
    hideTooltip();
    if (index >= 0 && opts.apply !== false) replacePotion(run, index, newId);
    onDone(index);
  };
  const icon = (art: string, alt: string): Node | string => {
    const url = artUrl('icons', art);
    return url.startsWith('data:') ? '' : el('img', { src: url, alt });
  };
  const list = el('div', { class: 'swap-list' });
  run.potions.forEach((id, i) => {
    const p = potionById[id];
    if (!p) return;
    list.append(el('button', { class: 'swap-item', onclick: () => dismiss(i) },
      icon(p.art, p.name),
      el('div', { class: 'swap-text' }, el('b', {}, p.name), el('em', {}, p.text)),
      el('span', { class: 'swap-go' }, '換掉這支')));
  });
  overlay.append(el('div', { class: 'modal swap-modal' },
    // 一次收到兩支以上時標「第 1／2 支」：玩家才知道換完這支還有下一支要問（使用者 2026-09-06：以為換完一支就結束）
    el('h2', { class: 'modal-title' }, `忍具帶滿了。要用「${def.name}」換掉哪一支？${opts.progress ? `（${opts.progress}）` : ''}`),
    el('div', { class: 'swap-new' }, icon(def.art, def.name), el('div', { class: 'swap-text' }, el('b', {}, def.name), el('em', {}, def.text))),
    list,
    el('div', { class: 'modal-foot' }, el('button', { class: 'btn', onclick: () => dismiss(-1) }, '不換，放棄新的'))));
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) dismiss(-1); });
  layer.append(overlay);
  lockScreen();
}
