import { lineFor } from '../content/dialogue';
import type { DialogueLine } from '../content/dialogue';
import { artUrl, heroArtUrl, localHero, monsterUrl } from './assets';
import { el } from './dom';
import { eventNow, gateAccept, newClickGate } from './clickgate';
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
/*
 * 劇本裡說話者寫的是「球球」（那是舊有的 86 段台詞）。換角色時**臉與木牌上的名字**
 * 一起換掉（`localHero`），台詞本身由 `content/dialogue` 依角色挑。
 */
/** 劇本寫「球球」時，這一局實際上是誰在講話 */
export function heroSpeaker(): string { return localHero() === 'feifei' ? '菲菲' : '球球'; }

function portraitOf(speaker: DialogueLine['speaker']): string | null {
  if (speaker === '球球') return heroArtUrl(localHero(), 'hero/ninja');
  // 她的劇本自己寫「菲菲」，不走「球球」那條（兩隻在連線版會同框，名字不能混）
  if (speaker === '菲菲') return heroArtUrl('feifei', 'hero/ninja');
  if (speaker === '塔主') return artUrl('sprites', 'boss/idle1');
  if (speaker === '黑貓忍者頭目') return monsterUrl('codex/monster_ninja_boss', 'idle');
  return null;   // 旁白沒有臉
}

/** 「塔主」這個說話者實際上是誰：關主開場時傳進來，木牌與立繪都換成該關關主本人 */
export interface SpeakerCast { name: string; portrait: string }

export function playDialogue(lines: DialogueLine[], onDone: () => void, cast?: { 塔主?: SpeakerCast }): void {
  /*
   * **入口統一過一次「換角色的口氣」**（稽核 2026-09-12 中-10）。
   *
   * 塔主開場 16 句、換階段 11 句、倒下 7 句、上樓 10 句、秘笈 2 句……那批都寫死
   * `speaker: '球球'`，而畫面會把臉換成菲菲、木牌也寫「菲菲」，然後她開口講「……喵！」。
   * 玩她的人整趟最有戲的幾個場面，看到的都是球球在講話。
   *
   * 在這裡過一次最省事：球球那條路 `lineFor` 一個字都不動，所以他完全不受影響。
   * 她專屬、真的重寫過的那幾段（序章、過關、落敗、結局）本來就沒有「喵」，過這一層也沒差。
   */
  lines = lines.map((l) => (l.speaker === '球球' ? { ...l, text: lineFor(localHero(), l.text) } : l));
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
    // 「塔主」有指定本人時換成本人：第一關打貓又婆婆，卻掛師父的臉跟「塔主」木牌，
    // 玩家會以為在跟師父講話（使用者實玩回報）
    const who = l.speaker === '塔主' ? cast?.['塔主'] : undefined;
    speaker.textContent = l.speaker === '旁白' ? '' : (who?.name ?? (l.speaker === '球球' ? heroSpeaker() : l.speaker));
    text.textContent = l.text;
    box.classList.toggle('narration', l.speaker === '旁白');
    // 換人講話才重設圖，同一個人連講好幾句時不要每句都重播進場動畫
    const url = who?.portrait ?? portraitOf(l.speaker);
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
  const gate = newClickGate();   // 連點保護，規則見 clickgate.ts
  box.addEventListener('click', (ev) => {
    if (!gateAccept(gate, eventNow(ev))) return;
    i += 1;
    if (i >= lines.length) end(); else render();
  });
  render();
  layer.append(box);
  lockScreen();   // 跟挑牌疊層同一個規矩：貼上去之後才鎖
}

/**
 * 掛在指定位置的對話泡泡（舞台座標）：魔物開場那句「塔主有令，閒貓勿入」本來只寫在左上角的紀錄裡，
 * 使用者 2026-09-02：「非常好但左上角不顯眼」→ 改成從魔物頭上冒出來。尾巴在右下角指向頭。
 */
export function bubbleAt(text: string, speaker: string, headX: number, headY: number): void {
  if (!text) return;
  const layer = overlayRoot();
  if (!layer) return;
  let top = Math.round(headY - 74);
  const t = el('div', { class: 'toast bubble-at tail-right', style: `right:${Math.round(1280 - headX - 34)}px; top:${top}px` },
    speaker ? el('b', {}, `${speaker}：`) : '', text);
  layer.append(t);
  // 兩隻怪一起出場講話，泡泡會疊在一起把前一句蓋掉（2026-09-02 烏天狗＋貓頭鷹那組）：
  // 撞到還在畫面上的泡泡就往上疊一層；上面沒位子了就先收起來，等前一顆消失再冒出來。
  // 用 offset 框比（不含冒出來的位移動畫），單位就是疊層自己的 1280 座標，不用換算縮放。
  const others = [...layer.querySelectorAll<HTMLElement>('.bubble-at:not(.out)')].filter((o) => o !== t);
  const box = (x: HTMLElement): [number, number, number, number] => [x.offsetLeft, x.offsetTop, x.offsetLeft + x.offsetWidth, x.offsetTop + x.offsetHeight];
  const hits = (): boolean => {
    const [l, tp, r, b] = box(t);
    return others.some((o) => { const [ql, qt, qr, qb] = box(o); return l < qr - 2 && r > ql + 2 && tp < qb - 2 && b > qt + 2; });
  };
  const TOP_MIN = 62;   // 再上去就壓到狀態列
  for (let i = 0; i < 4 && hits(); i++) {
    const h = t.offsetHeight + 8;
    if (top - h < TOP_MIN) { t.remove(); window.setTimeout(() => bubbleAt(text, speaker, headX, headY), 1200); return; }
    top -= h; t.style.top = `${top}px`;
  }
  setTimeout(() => t.classList.add('out'), 3300);   // 一句台詞要讀完，留久一點
  setTimeout(() => t.remove(), 3800);
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
