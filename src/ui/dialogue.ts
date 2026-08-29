import type { DialogueLine } from '../content/dialogue';
import { el } from './dom';
import { overlayRoot } from './overlay';

/** 全螢幕對白疊層，點一下下一句；播完自己移除再叫 onDone */
export function playDialogue(lines: DialogueLine[], onDone: () => void): void {
  const layer = overlayRoot();
  if (!layer || lines.length === 0) { onDone(); return; }
  let i = 0;
  let ended = false;
  const box = el('div', { class: 'dialogue-overlay' });
  const speaker = el('div', { class: 'dialogue-speaker' });
  const text = el('div', { class: 'dialogue-text' });
  const hint = el('div', { class: 'dialogue-hint' }, '點一下繼續');
  box.append(el('div', { class: 'dialogue-box' }, speaker, text, hint));
  const render = (): void => {
    const l = lines[i];
    if (!l) return;
    speaker.textContent = l.speaker === '旁白' ? '' : l.speaker;
    text.textContent = l.text;
    box.classList.toggle('narration', l.speaker === '旁白');
  };
  /** 收尾只會發生一次：對白住在疊層裡，換畫面不會把它拔走，這個旗標再擋住連點重播 */
  const end = (): void => {
    if (ended) return;
    ended = true;
    box.remove();
    onDone();
  };
  box.addEventListener('click', () => {
    i += 1;
    if (i >= lines.length) end(); else render();
  });
  render();
  layer.append(box);
}

/** 戰鬥吐槽小氣泡，兩秒後自己淡掉 */
export function toast(text: string, speaker = ''): void {
  if (!text) return;
  const layer = overlayRoot();
  if (!layer) return;
  const t = el('div', { class: 'toast' }, speaker ? el('b', {}, `${speaker}：`) : '', text);
  layer.append(t);
  setTimeout(() => t.classList.add('out'), 1800);
  setTimeout(() => t.remove(), 2300);
}
