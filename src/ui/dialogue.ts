import type { DialogueLine } from '../content/dialogue';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';

/**
 * 全螢幕對白疊層，點一下下一句；播完自己移除再叫 onDone。
 *
 * 播的時候底下的畫面層要停用（`lockScreen`）：黑幕只擋滑鼠，底下的按鈕還留在 Tab 順序裡，
 * 序章時按 Enter 就會再開一局、塔主戰前按 Enter 會去點地圖節點、5F 秘笈與 14F 貓窩的對白
 * 是蓋在已經畫好的畫面上的，底下那兩顆選項按鈕照樣按得動。
 */
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
    // 換下一句時讓框輕輕彈一下：不然只有文字默默換掉，玩家不確定自己剛剛那一下有沒有點到
    const inner = box.querySelector('.dialogue-box');
    if (i > 0 && inner && typeof inner.animate === 'function') {
      inner.animate([{ transform: 'translateY(6px)', opacity: .55 }, { transform: 'none', opacity: 1 }],
        { duration: 160, easing: 'ease-out' });
    }
  };
  /** 收尾只會發生一次：對白住在疊層裡，換畫面不會把它拔走，這個旗標再擋住連點重播 */
  const end = (): void => {
    if (ended) return;
    ended = true;
    box.remove();
    unlockScreen();   // 排在 onDone 之前：回呼裡就會換畫面、擺上新的按鈕
    onDone();
  };
  box.addEventListener('click', () => {
    i += 1;
    if (i >= lines.length) end(); else render();
  });
  render();
  layer.append(box);
  lockScreen();   // 跟挑牌疊層同一個規矩：貼上去之後才鎖
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
