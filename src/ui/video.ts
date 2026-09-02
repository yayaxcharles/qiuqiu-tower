import { BASE } from './assets';
import { pauseBgm, resumeBgm } from './bgm';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';

/**
 * 全螢幕過場影片（使用者自製的開頭／結尾，`public/video/<名字>.mp4`，720p 各一兩 MB）。
 *
 * 規矩：**有就播、沒有就當作沒這回事**——檔案不在（404）、瀏覽器擋自動播放、解碼失敗、
 * 八秒內還沒開始播，全部直接走 onDone，劇情照原本的幻燈片走。點「跳過」隨時可收。
 * 影片是點到才載（<video> 自己抓），不進素材預算；播的時候背景音樂先停，播完再接回。
 * 鎖畫面規矩跟對白疊層一樣（見 dialogue.ts）。
 */
export function playVideo(name: 'opening' | 'ending', onDone: () => void): void {
  const layer = overlayRoot();
  if (!layer) { onDone(); return; }
  const v = el('video', { class: 'cine-video', playsinline: '', preload: 'auto' });
  v.src = `${BASE}video/${name}.mp4`;
  const skip = el('button', { class: 'btn small cine-skip' }, '跳過 ▸');
  const box = el('div', { class: 'cine-overlay' }, v, skip);
  let ended = false;
  const end = (): void => {
    if (ended) return;
    ended = true;
    window.clearTimeout(watchdog);
    v.pause();
    v.removeAttribute('src');
    box.remove();
    unlockScreen();
    resumeBgm();
    onDone();
  };
  v.addEventListener('ended', end);
  v.addEventListener('error', end);
  skip.addEventListener('click', end);
  layer.append(box);
  lockScreen();
  pauseBgm();
  // 八秒內還沒開始播（檔案不在、網路慢到離譜）就放棄，不讓玩家對著黑畫面等
  const watchdog = window.setTimeout(() => { if (v.readyState < 2) end(); }, 8000);
  v.addEventListener('playing', () => window.clearTimeout(watchdog), { once: true });
  const p = v.play();
  if (p) p.catch(end);   // 自動播放被擋就當作沒有影片
}
