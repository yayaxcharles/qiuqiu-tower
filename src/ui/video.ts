import { fileUrl } from './assets';
import { pauseBgm, resumeBgm, setBgm } from './bgm';
import { t } from '../i18n';
import { el } from './dom';
import { closeWithStory, lockScreen, overlayRoot, unlockScreen } from './overlay';

/**
 * 全螢幕過場影片（開頭／結尾，`public/video/<名字>.mp4`，720p 各一兩 MB；球球的兩支是使用者自製，
 * 菲菲的開頭是 2026-09-15 用 Remotion 拿遊戲立繪拼的，原始檔在 `tools/video/feifei_opening/`）。
 *
 * 規矩：**有就播、沒有就當作沒這回事**——檔案不在（404）、瀏覽器擋自動播放、解碼失敗、
 * 八秒內還沒開始播，全部直接走 onDone，劇情照原本的幻燈片走。點「跳過」隨時可收。
 * 影片是點到才載（<video> 自己抓），不進素材預算。
 * 配樂**烤在影片檔裡**（`ffmpeg` 把遊戲自己的曲子混進去：開頭配塔下曲 act1、結尾配通關曲 ending，
 * 尾端淡出）——2026-09-02 使用者兩次回報「影片沒音樂」：靠播放時切背景音樂會被解鎖時機、快取版本等因素吃掉，
 * 烤進檔案裡最穩。播的時候把背景音樂停住免得兩首疊在一起，播完再把背景音樂切到同一首，銜接不會斷。
 * 鎖畫面規矩跟對白疊層一樣（見 dialogue.ts）。
 */
export type VideoName = 'ending';   // 開頭影片 2026-09-29 移除（見 app.ts 的 `OPENING_CLIP`）

export function playVideo(name: VideoName, onDone: () => void): void {
  const layer = overlayRoot();
  if (!layer) { onDone(); return; }
  // 不標 muted、但檔案裡留一條靜音音軌：Chrome 把「靜音或沒聲音」的影片當省電對象，分頁一到背景就直接暫停
  // （AbortError: video-only background media was paused to save power），標 muted 或拿掉音軌都會中招。
  // 有聲音軌又不靜音的影片，只要玩家點過畫面（按「新的一局」就算）就准自動播放；被拒絕的話 catch 會直接跳過。
  const v = el('video', { class: 'cine-video', playsinline: '', preload: 'auto' });
  v.src = fileUrl(`video/${name}.mp4`);
  const skip = el('button', { class: 'btn small cine-skip' }, '跳過 ▸');
  const box = el('div', { class: 'cine-overlay' }, v, skip);
  let ended = false;
  /*
   * 收掉影片**要連下載一起停**（2026-09-23 主控派工：慢網路下牌圖、結果圖排很久）。
   * 只拿掉 `src` 不會停：媒體元素要再叫一次 `load()` 才會重設、把還在傳的那條連線放掉。
   * 實測（限速約 1.6 Mbps）：按了跳過之後，開頭影片（1.8 MB）還在背景一直下載，佔住 6 條連線的其中一條好幾十秒。
   */
  const stopDownload = (): void => { v.pause(); v.removeAttribute('src'); v.load(); };
  // 這一局被丟掉（連線斷了回標題）時整段收掉、不叫 onDone（見 overlay.ts 的 `closeWithStory`，2026-09-23 稽核 高-1）
  const forget = closeWithStory(() => {
    if (ended) return;
    ended = true;
    window.clearTimeout(watchdog);
    stopDownload();
    box.remove();
    unlockScreen();
  });
  const end = (): void => {
    if (ended) return;
    ended = true;
    forget();
    window.clearTimeout(watchdog);
    stopDownload();
    box.remove();
    unlockScreen();
    setBgm(name === 'ending' ? 'ending' : 'act1');   // 接影片裡那一首，下一幕本來就是它
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

/**
 * 封面的「介紹影片」（2026-09-29 使用者：「V2 可以了，放到封面上讓玩家可以點來看」）。
 * 跟上面的劇情過場不一樣：玩家自己點開、有播放控制列、隨時可關（按鈕、Esc、播完自動收），不鎖畫面、不接劇情。
 * 檔案 `public/video/trailer.mp4`（720p 約 11 MB，配樂與音效烤在檔案裡）；點了才下載，關掉連下載一起停。
 * 原始專案在 `F:\ClaudeWork\remotion-video\src\qiuqiu\Trailer2.tsx`（遊戲自己的角色動作圖、魔物圖重演＋三段實機錄影）。
 */
export function playTrailer(): void {
  const layer = overlayRoot();
  if (!layer || layer.querySelector('.trailer-overlay')) return;
  const v = el('video', { class: 'cine-video', playsinline: '', controls: '', preload: 'auto' });
  v.src = fileUrl('video/trailer.mp4');
  const close = el('button', { class: 'btn small cine-skip' }, t('關閉'));
  const box = el('div', { class: 'cine-overlay trailer-overlay' }, v, close);
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') end(); };
  let ended = false;
  const end = (): void => {
    if (ended) return;
    ended = true;
    v.pause(); v.removeAttribute('src'); v.load();   // 連下載一起停（見 playVideo 的 stopDownload）
    box.remove();
    window.removeEventListener('keydown', onKey);
    resumeBgm();
  };
  close.addEventListener('click', end);
  v.addEventListener('ended', end);
  window.addEventListener('keydown', onKey);
  layer.append(box);
  pauseBgm();
  const pl = v.play();
  if (pl) pl.catch(() => { /* 被擋就留著控制列讓玩家自己按播放 */ });
}
