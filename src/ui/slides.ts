import type { DialogueLine } from '../content/dialogue';
import { artUrl } from './assets';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';

/**
 * 插圖幻燈片：整張劇情圖鋪滿舞台、台詞盒壓在下緣，點一下推進一句，
 * 一張圖的台詞講完換下一張（交叉淡入）。序章與通關結局用。
 *
 * 圖沒生好（灰剪影）就整段退回文字對白——呼叫端用 `slidesReady` 先問，
 * 拿不到圖的舊存檔、離線快取都還能把劇情看完。
 * 鎖畫面規矩跟對白疊層一樣（見 dialogue.ts 的說明）。
 */
/**
 * `box`＝台詞框貼在畫面的上緣還是下緣。預設貼上緣：這批劇情圖的主角幾乎都畫在畫面下半
 * （球球站在樓梯口、師父跪在地上），框壓在下面正好把主角遮掉——使用者 2026-09-02：
 * 「對話框在正下方擋住投影片圖了有點可惜」。框本身也改成半透明的漸層，不是不透明的木牌，圖整張都看得到。
 */
export interface Slide { img: string; lines: DialogueLine[]; box?: 'top' | 'bottom' }

export function slidesReady(slides: Slide[]): boolean {
  return slides.every((s) => !artUrl('bg', s.img).startsWith('data:'));
}

export function playSlides(slides: Slide[], onDone: () => void): void {
  const layer = overlayRoot();
  const flat = slides.flatMap((s, si) => s.lines.map((l) => ({ l, si })));
  if (!layer || flat.length === 0) { onDone(); return; }
  let i = 0;
  let ended = false;
  const imgA = el('img', { class: 'slide-img show', alt: '' }) as HTMLImageElement;
  const imgB = el('img', { class: 'slide-img', alt: '' }) as HTMLImageElement;   // 交叉淡入用的第二層
  const speaker = el('div', { class: 'dialogue-speaker' });
  const text = el('div', { class: 'dialogue-text' });
  const hint = el('div', { class: 'dialogue-hint' }, el('span', {}, '點一下繼續'), el('i', { class: 'paw' }));
  const box = el('div', { class: 'slide-overlay' },
    imgA, imgB, el('div', { class: 'dialogue-box slide-box' }, speaker, text, hint));
  let front = imgA;
  let shownSlide = -1;
  const render = (): void => {
    const cur = flat[i];
    if (!cur) return;
    if (cur.si !== shownSlide) {
      shownSlide = cur.si;
      const url = artUrl('bg', slides[cur.si]!.img);
      const back = front === imgA ? imgB : imgA;
      back.src = url;
      back.classList.add('show');
      front.classList.remove('show');
      front = back;
      box.querySelector('.slide-box')?.classList.toggle('at-bottom', slides[cur.si]!.box === 'bottom');
    }
    speaker.textContent = cur.l.speaker === '旁白' ? '' : cur.l.speaker;
    text.textContent = cur.l.text;
    box.classList.toggle('narration', cur.l.speaker === '旁白');
  };
  const end = (): void => {
    if (ended) return;
    ended = true;
    box.remove();
    unlockScreen();
    onDone();
  };
  box.addEventListener('click', () => { i += 1; if (i >= flat.length) end(); else render(); });
  render();
  layer.append(box);
  lockScreen();
}
