import type { DialogueLine } from '../content/dialogue';
import { artUrl } from './assets';
import { el } from './dom';
import { eventNow, gateAccept, newClickGate } from './clickgate';
import { closeWithStory, lockScreen, overlayRoot, unlockScreen } from './overlay';

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

/**
 * 這組幻燈片的圖都到齊了嗎——**空陣列算「沒到齊」**（2026-09-17 稽核 中-4）。
 *
 * 少了 `length > 0` 那一半的後果很安靜：`[].every(...)` 永遠是 `true`，
 * 於是「回空陣列就退回純對白」那條退路實際上變成 `playSlides([])` → `flat.length === 0`
 * → 直接 `onDone()`，**整段劇情一個字都不播**。
 * 好幾處的註解都寫著「回空陣列就會退回純對白」，那句話要成立就靠這一行。
 */
export function slidesReady(slides: Slide[]): boolean {
  return slides.length > 0 && slides.every((s) => !artUrl('bg', s.img).startsWith('data:'));
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
  // 這一局被丟掉（連線斷了回標題）時整段收掉、不叫 onDone（見 overlay.ts 的 `closeWithStory`，2026-09-23 稽核 高-1）
  const forget = closeWithStory(() => { if (ended) return; ended = true; box.remove(); unlockScreen(); });
  const end = (): void => {
    if (ended) return;
    ended = true;
    forget();
    unlockScreen();
    /*
     * **回呼先叫、這一層後收**（2026-09-23 實機驗收 M-2 同型）：回呼換的畫面（過關畫面、地圖）就畫在這一層底下，
     * 這一層再淡出。原本先拔掉這一層再換畫面，換場那一格露出來的是幻燈片底下的舞台——
     * 以前是米白底色，舊畫面改成墊在底下淡出後，會是早就看不到的舊畫面（剛打完的關主戰、選角畫面）。
     * 有這一層蓋著時 `App.show()` 不淡入、也不墊舊畫面（見 app.ts），新畫面一出來就是完整的。
     */
    onDone();
    box.style.pointerEvents = 'none';
    const out = typeof box.animate === 'function'
      ? box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }) : null;
    if (out) out.finished.then(() => box.remove(), () => box.remove());
    else box.remove();
  };
  const gate = newClickGate();   // 連點保護，規則見 clickgate.ts
  box.addEventListener('click', (ev) => {
    const nextSi = flat[i + 1]?.si;
    if (!gateAccept(gate, eventNow(ev), nextSi !== undefined && nextSi !== flat[i]?.si)) return;
    i += 1; if (i >= flat.length) end(); else render();
  });
  render();
  layer.append(box);
  lockScreen();
}
