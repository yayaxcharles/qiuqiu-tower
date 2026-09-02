import { BASE } from './assets';
import { pauseBgm, setBgm } from './bgm';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';

/**
 * 全螢幕過場影片（使用者自製的開頭／結尾，`public/video/<名字>.mp4`，720p 各一兩 MB）。
 *
 * 規矩：**有就播、沒有就當作沒這回事**——檔案不在（404）、瀏覽器擋自動播放、解碼失敗、
 * 八秒內還沒開始播，全部直接走 onDone，劇情照原本的幻燈片走。點「跳過」隨時可收。
 * 影片是點到才載（<video> 自己抓），不進素材預算。
 * 配樂**烤在影片檔裡**（`ffmpeg` 把遊戲自己的曲子混進去：開頭配塔下曲 act1、結尾配通關曲 ending，
 * 尾端淡出）——2026-09-02 使用者兩次回報「影片沒音樂」：靠播放時切背景音樂會被解鎖時機、快取版本等因素吃掉，
 * 烤進檔案裡最穩。播的時候把背景音樂停住免得兩首疊在一起，播完再把背景音樂切到同一首，銜接不會斷。
 * 鎖畫面規矩跟對白疊層一樣（見 dialogue.ts）。
 */
export function playVideo(name: 'opening' | 'ending', onDone: () => void): void {
  const layer = overlayRoot();
  if (!layer) { onDone(); return; }
  // 不標 muted、但檔案裡留一條靜音音軌：Chrome 把「靜音或沒聲音」的影片當省電對象，分頁一到背景就直接暫停
  // （AbortError: video-only background media was paused to save power），標 muted 或拿掉音軌都會中招。
  // 有聲音軌又不靜音的影片，只要玩家點過畫面（按「新的一局」就算）就准自動播放；被拒絕的話 catch 會直接跳過。
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
    setBgm(name === 'opening' ? 'act1' : 'ending');   // 接影片裡那一首，下一幕本來就是它
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
