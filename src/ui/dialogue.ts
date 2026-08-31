import type { DialogueLine } from '../content/dialogue';
import { artUrl, monsterUrl } from './assets';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';

/**
 * 全螢幕對白疊層，點一下下一句；播完自己移除再叫 onDone。
 *
 * 播的時候底下的畫面層要停用（`lockScreen`）：黑幕只擋滑鼠，底下的按鈕還留在 Tab 順序裡，
 * 序章時按 Enter 就會再開一局、塔主戰前按 Enter 會去點地圖節點、5F 秘笈與 14F 貓窩的對白
 * 是蓋在已經畫好的畫面上的，底下那兩顆選項按鈕照樣按得動。
 */
/**
 * 誰在講話就把誰的臉放旁邊。
 *
 * 本來只有名字那塊小木牌在區分說話者，旁白則是整塊不顯示——
 * 使用者的原話：「是旁白還是球球在講話，從對話框中看不出來，缺少故事感」。
 * 放上立繪之後，一眼就知道是誰在講，而旁白**沒有臉**，那個空缺本身就是訊號。
 */
function portraitOf(speaker: DialogueLine['speaker']): string | null {
  if (speaker === '球球') return artUrl('sprites', 'hero/ninja');
  if (speaker === '塔主') return artUrl('sprites', 'boss/idle1');
  if (speaker === '黑貓忍者頭目') return monsterUrl('codex/monster_ninja_boss', 'idle');
  return null;   // 旁白沒有臉
}

export function playDialogue(lines: DialogueLine[], onDone: () => void): void {
  const layer = overlayRoot();
  if (!layer || lines.length === 0) { onDone(); return; }
  let i = 0;
  let ended = false;
  const box = el('div', { class: 'dialogue-overlay' });
  const portrait = el('img', { class: 'dialogue-portrait', alt: '' }) as HTMLImageElement;
  const speaker = el('div', { class: 'dialogue-speaker' });
  const text = el('div', { class: 'dialogue-text' });
  // 提示分成「字」跟「腳印」兩塊：腳印要自己跳，字不要跟著動
  const hint = el('div', { class: 'dialogue-hint' },
    el('span', {}, '點一下繼續'), el('i', { class: 'paw' }));
  box.append(portrait, el('div', { class: 'dialogue-box' }, speaker, text, hint));
  const render = (): void => {
    const l = lines[i];
    if (!l) return;
    speaker.textContent = l.speaker === '旁白' ? '' : l.speaker;
    text.textContent = l.text;
    box.classList.toggle('narration', l.speaker === '旁白');
    // 換人講話才重設圖，同一個人連講好幾句時不要每句都重播進場動畫
    const url = portraitOf(l.speaker);
    if (url && portrait.dataset['who'] !== l.speaker) {
      portrait.src = url;
      portrait.dataset['who'] = l.speaker;
      portrait.classList.remove('in');
      // 強制重排，動畫才會重播（不讀一次 offsetWidth 的話瀏覽器會把移除與加入合併掉）
      void portrait.offsetWidth;
      portrait.classList.add('in');
    }
    if (!url) { portrait.removeAttribute('data-who'); portrait.removeAttribute('src'); }
    portrait.hidden = !url;
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
