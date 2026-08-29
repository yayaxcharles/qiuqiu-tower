import type { DialogueLine } from '../content/dialogue';
import { el } from './dom';

function stageEl(): HTMLElement | null { return document.getElementById('stage'); }

/** 全螢幕對白疊層，點一下下一句；播完自己移除再叫 onDone */
export function playDialogue(lines: DialogueLine[], onDone: () => void): void {
  const stage = stageEl();
  if (!stage || lines.length === 0) { onDone(); return; }
  let i = 0;
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
  box.addEventListener('click', () => {
    i += 1;
    if (i >= lines.length) { box.remove(); onDone(); } else render();
  });
  render();
  stage.append(box);
}

/** 戰鬥吐槽小氣泡，兩秒後自己淡掉 */
export function toast(text: string, speaker = ''): void {
  if (!text) return;
  const stage = stageEl();
  if (!stage) return;
  const t = el('div', { class: 'toast' }, speaker ? el('b', {}, `${speaker}：`) : '', text);
  stage.append(t);
  setTimeout(() => t.classList.add('out'), 1800);
  setTimeout(() => t.remove(), 2300);
}
