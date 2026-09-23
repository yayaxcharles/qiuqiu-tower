import { castLineFor, lineFor } from '../content/dialogue';
import type { DialogueLine } from '../content/dialogue';
import { artUrl, hasHeroSprite, heroArtUrl, localHero, localPartner, monsterUrl } from './assets';
import { el, stageFrame } from './dom';
import { eventNow, gateAccept, newClickGate } from './clickgate';
import { closeWithStory, lockScreen, overlayRoot, unlockScreen } from './overlay';

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
export function heroSpeaker(): string {
  const h = localHero();
  if (h === 'fengfeng') return '封封';
  return h === 'feifei' ? '菲菲' : h === 'dangdang' ? '噹噹' : '球球';
}

/**
 * 四隻貓的臉：新版待機動作第 1 格裁出來的那張（2026-09-22，`tools/make_dialogue_portraits.py`）。
 * 戰鬥裡已經全是新版逐格動作，對白再掛舊版立繪，同一個畫面就有兩種長相。
 * 清單裡還沒有這張（舊清單、剛換版）就退回舊立繪——寧可舊畫風也不要灰剪影。
 * 大小不用另外調：框是 screens.css 的 `.dialogue-overlay .dialogue-portrait`（高 290、等比縮進框裡），
 * 新圖貼著身體裁、舊立繪四周留一圈透明，放進同一個框站出來都是 280 上下，朝向也一樣面向右（臉朝對白與畫面中央）。
 */
function heroPortrait(hero: string): string {
  return heroArtUrl(hero, hasHeroSprite(hero, 'hero/ninja_portrait') ? 'hero/ninja_portrait' : 'hero/ninja');
}

/**
 * `literal`＝這一組已經是最終文字，說話者就是本人（搭檔關主接話那幾組）。
 * 2026-09-17 稽核 高-1：原本只有木牌上的名字認 `literal`，臉沒認——
 * 連線打大俠貓時「球球：……喵！」木牌寫球球、臉卻是我自己，下一句我自己又是同一張臉。
 */
export function portraitOf(speaker: DialogueLine['speaker'], literal = false): string | null {
  const hero = portraitHero(speaker, literal);
  if (hero) return heroPortrait(hero);
  if (speaker === '塔主') return artUrl('sprites', 'boss/idle1');
  if (speaker === '黑貓忍者頭目') return monsterUrl('codex/monster_ninja_boss', 'idle');
  return null;   // 旁白沒有臉
}

/**
 * 這張臉是**哪一隻貓主角**（旁白、村貓、塔主、魔物回 null）。
 * 劇本寫「球球」＝這一局本機那一位（`literal` 時才是球球本人）；她、他、封封的劇本自己寫名字
 *（四隻在連線版會同框，名字不能混）。
 */
export function portraitHero(speaker: DialogueLine['speaker'], literal = false): string | null {
  if (speaker === '球球') return literal ? 'ninja' : localHero();
  if (speaker === '菲菲') return 'feifei';
  if (speaker === '噹噹') return 'dangdang';
  if (speaker === '封封') return 'fengfeng';
  return null;
}

/**
 * 這一句**放不放頭像、戰場上要藏哪一格**（2026-09-22，兩件使用者看到的事）。
 *
 * - 畫面上的插圖裡已經畫了這隻貓（`artCast`，事件插圖由 `event.ts` 標上 `data-art-cast`）→ 不放頭像。
 *   不然左邊一隻新畫風頭像、正中間插圖又一隻另一種畫法的同一隻貓（畫面盤點 問題 5）。
 * - 戰場上**只有真的放了頭像才藏**：旁白、村貓沒有臉，一格都不藏——倒下時旁白一出來，
 *   倒地的貓不能整隻不見（畫面盤點 問題 3）。放了頭像的時候藏兩種：
 *   `mine`／`mate`＝頭像就是這一格那隻貓（同一隻不要同時出現兩次；同角色雙人兩格都藏）；
 *   `slot`＝頭像疊在左邊那一格（座位 0）身上，照 2026-09-02 的理由先讓位——關主落敗那段是關主的臉，
 *   不藏的話貓會從關主頭像後面露半截出來（實機看過）。
 */
export function portraitPlan(speaker: DialogueLine['speaker'], literal: boolean,
                             ctx: { artCast: readonly string[]; mine: string; mate?: string | undefined }): { show: boolean; hide: string } {
  const hero = portraitHero(speaker, literal);
  if (hero && ctx.artCast.includes(hero)) return { show: false, hide: '' };
  if (portraitOf(speaker, literal) === null) return { show: true, hide: '' };
  const tokens = ['slot'];
  if (hero && hero === ctx.mine) tokens.push('mine');
  if (hero && hero === ctx.mate) tokens.push('mate');
  return { show: true, hide: tokens.join(' ') };
}

/** 現在畫面上那張插圖畫了哪幾隻貓（只有事件插圖有標；沒有插圖就是空的） */
function screenArtCast(layer: HTMLElement): string[] {
  const art = layer.parentElement?.querySelector<HTMLElement>('#screen [data-art-cast]');
  return (art?.dataset['artCast'] ?? '').split(' ').filter(Boolean);
}

/** 「塔主」這個說話者實際上是誰：關主開場時傳進來，木牌與立繪都換成該關關主本人 */
export interface SpeakerCast { name: string; portrait: string }

export function playDialogue(lines: DialogueLine[], onDone: () => void, cast?: { 塔主?: SpeakerCast },
                             /**
                              * 這一組**已經是最終文字**，不要再換口氣（2026-09-17 搭檔關主接話）。
                              * 連線時「球球：……喵」就是球球本人在講，過 `lineFor` 會被改成我的口氣、
                              * 木牌還會寫成我的名字。
                              */
                             literal = false): void {
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
  // 塔主與旁白講到主角的那幾句也要換（「小兄弟」「看了球球一眼」，夜間稽核 中-3）
  if (!literal) lines = lines.map((l) => ({ ...l, text: l.speaker === '球球' ? lineFor(localHero(), l.text) : castLineFor(localHero(), l.text) }));
  const layer = overlayRoot();
  if (!layer || lines.length === 0) { onDone(); return; }
  /*
   * 戰鬥裡剛冒的吐槽（打贏那句、關主換階段那串）會留一兩秒；對白框一開，說話那隻貓可能被頭像取代而藏起來，
   * 泡泡的尾巴就指著空位（推前審查 2026-09-22 低-2）。有說話者名牌的才是台詞泡泡，一般提示不動。
   */
  layer.querySelectorAll('.toast').forEach((t) => { if (t.querySelector('b')) t.remove(); });
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
    speaker.textContent = l.speaker === '旁白' ? '' : (who?.name ?? (l.speaker === '球球' && !literal ? heroSpeaker() : l.speaker));
    text.textContent = l.text;
    box.classList.toggle('narration', l.speaker === '旁白');
    // 換人講話才重設圖，同一個人連講好幾句時不要每句都重播進場動畫
    const plan = portraitPlan(l.speaker, literal, { artCast: screenArtCast(layer), mine: localHero(), mate: localPartner() });
    const url = plan.show ? (who?.portrait ?? portraitOf(l.speaker, literal)) : null;
    // 戰場上要藏哪一格交給樣式表（screens.css 的 `data-hide`）：沒放頭像就一格都不藏
    if (url && plan.hide) box.dataset['hide'] = plan.hide; else delete box.dataset['hide'];
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
  // 這一局被丟掉（連線斷了回標題）時整段收掉、不叫 onDone（見 overlay.ts 的 `closeWithStory`，2026-09-23 稽核 高-1）
  const forget = closeWithStory(() => { if (ended) return; ended = true; box.remove(); unlockScreen(); });
  /** 收尾只會發生一次：對白住在疊層裡，換畫面不會把它拔走，這個旗標再擋住連點重播 */
  const end = (): void => {
    if (ended) return;
    ended = true;
    forget();
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
export function bubbleAt(text: string, speaker: string, headX: number, headY: number, avoid?: StageRect): void {
  if (!text) return;
  const layer = overlayRoot();
  if (!layer) return;
  const TOP_MIN = 62;   // 再上去就壓到狀態列
  // 特別高的立繪（師父）頭頂離狀態列不到 74 像素，照算會壓在狀態列上：先壓到狀態列下緣，蓋到意圖牌再交給下面挪開（2026-09-22 晚）
  let top = Math.max(TOP_MIN, Math.round(headY - 74));
  const t = el('div', { class: 'toast bubble-at tail-right', style: `right:${Math.round(1280 - headX - 34)}px; top:${top}px` },
    speaker ? el('b', {}, `${speaker}：`) : '', text);
  layer.append(t);
  // 高大魔物頭上的意圖牌正好在泡泡該在的地方（畫面盤點 2026-09-22 低-13）：蓋到就挪開（挪法見 bubbleClearOf）
  const clear = bubbleClearOf({ left: t.offsetLeft, top: t.offsetTop, right: t.offsetLeft + t.offsetWidth, bottom: t.offsetTop + t.offsetHeight }, avoid, TOP_MIN);
  if (clear) {
    top = clear.top; t.style.top = `${top}px`;
    if (clear.right !== undefined) t.style.right = `${clear.right}px`;
  }
  // 兩隻怪一起出場講話，泡泡會疊在一起把前一句蓋掉（2026-09-02 烏天狗＋貓頭鷹那組）：
  // 撞到還在畫面上的泡泡就往上疊一層；上面沒位子了就先收起來，等前一顆消失再冒出來。
  // 用 offset 框比（不含冒出來的位移動畫），單位就是疊層自己的 1280 座標，不用換算縮放。
  const others = [...layer.querySelectorAll<HTMLElement>('.bubble-at:not(.out)')].filter((o) => o !== t);
  const box = (x: HTMLElement): [number, number, number, number] => [x.offsetLeft, x.offsetTop, x.offsetLeft + x.offsetWidth, x.offsetTop + x.offsetHeight];
  const hits = (): boolean => {
    const [l, tp, r, b] = box(t);
    return others.some((o) => { const [ql, qt, qr, qb] = box(o); return l < qr - 2 && r > ql + 2 && tp < qb - 2 && b > qt + 2; });
  };
  for (let i = 0; i < 4 && hits(); i++) {
    const h = t.offsetHeight + 8;
    if (top - h < TOP_MIN) { t.remove(); window.setTimeout(() => bubbleAt(text, speaker, headX, headY, avoid), 1200); return; }
    top -= h; t.style.top = `${top}px`;
  }
  setTimeout(() => t.classList.add('out'), 3300);   // 一句台詞要讀完，留久一點
  setTimeout(() => t.remove(), 3800);
}

/** 舞台座標（1280 × 720）的一個框 */
export interface StageRect { left: number; top: number; right: number; bottom: number }

/** 泡泡底下那根尾巴的長度（combat.css 的 `.toast::before`，往下凸 14 像素） */
const BUBBLE_TAIL = 14;

/**
 * 魔物頭上的泡泡蓋到 `avoid`（牠頭上的意圖牌，連尾巴算）時該挪到哪；沒蓋到回 undefined。
 * - 上面還有位子（不頂到狀態列 `minTop`）：整顆往上挪到牌子上方，尾巴尖離牌子 4 像素；
 * - 沒位子（高大魔物，牌子離狀態列只剩四五十像素）：挪到牌子左邊、牌子底下那一條（牠頭的左側），
 *   尾巴仍在右下角朝著牠。留在上面那一條往左挪的話，會蓋到同一時間貓開場那句（兩句都貼著狀態列下緣）。
 * `top`＝新的上緣；`right`＝新的 CSS `right`（沒給就不動）。
 */
export function bubbleClearOf(bubble: StageRect, avoid: StageRect | undefined, minTop: number): { top: number; right?: number } | undefined {
  if (!avoid) return undefined;
  const overlaps = bubble.left < avoid.right && bubble.right > avoid.left
    && bubble.top < avoid.bottom && bubble.bottom + BUBBLE_TAIL > avoid.top;
  if (!overlaps) return undefined;
  const up = Math.floor(avoid.top - 4 - BUBBLE_TAIL - (bubble.bottom - bubble.top));
  if (up >= minTop) return { top: up };
  return { top: Math.round(avoid.bottom + 6), right: Math.round(1280 - avoid.left + 8) };
}

/**
 * 從戰場上某一隻魔物頭上冒泡泡（開場台詞、關主換階段台詞共用）：量立繪上緣定位，避開牠頭上的意圖牌。
 * 框在**要用的那一刻**才量（泡泡可能晚一兩秒才冒，中途改視窗大小的話先量好的倍率就對不上了）。
 */
export function bubbleOverUnit(stage: Element, unit: Element | null, text: string, speaker: string): boolean {
  const sprite = unit?.querySelector('.sprite');
  if (!unit || !sprite) return false;
  const frame = stageFrame(stage);
  const toStage = (r: DOMRect): StageRect => ({
    left: (r.left - frame.left) * frame.k, top: (r.top - frame.top) * frame.k,
    right: (r.right - frame.left) * frame.k, bottom: (r.bottom - frame.top) * frame.k,
  });
  const body = toStage(sprite.getBoundingClientRect());
  const intent = unit.querySelector('.intent');
  bubbleAt(text, speaker, (body.left + body.right) / 2, body.top + 16, intent ? toStage(intent.getBoundingClientRect()) : undefined);
  return true;
}

/**
 * 系統公告（投票擲骰、秘寶撞件的結果）：畫面正上方一條，壓在對白層上面，兩秒半後淡掉。
 *
 * 不借 `toast`（總稽核 2026-09-16 甲 低-3）：戰鬥畫面把 `.toast` 畫成主角頭上的對話泡泡，
 * 地圖投票完緊接著進戰鬥，就變成角色在講「擲骰選了戰鬥」，還把角色真正的開場白擠到下一格；
 * 進貓窩獨白、5F 秘笈時又被對白層（層級 50）蓋住。
 */
export function notice(text: string): void {
  if (!text) return;
  const layer = overlayRoot();
  if (!layer) return;
  const t = el('div', { class: 'notice' }, text);
  layer.append(t);
  const stay = Math.min(4200, Math.max(2600, [...text].length * 90));   // 照字數留，最短 2.6 秒（推前審查 2026-09-16 低-5）
  setTimeout(() => t.classList.add('out'), stay);
  setTimeout(() => t.remove(), stay + 500);
}

/** 戰鬥吐槽小氣泡，兩秒後自己淡掉 */
export function toast(text: string, speaker = '', at?: { left: number } | { right: number }): void {
  if (!text) return;
  const layer = overlayRoot();
  if (!layer) return;
  const t = el('div', { class: 'toast' }, speaker ? el('b', {}, `${speaker}：`) : '', text);
  // 戰鬥裡的泡泡要從說話那一格冒出來（連線盤點 2026-09-22 問題 5）：樣式表寫死的 left 200 只對得上單機那一格。
  // 給 right 的是右邊那一格：尾巴改到右下角、泡泡往左長（位置算法在 enemylayout.ts 的 speechBubbleAt）
  if (at && 'left' in at) t.style.left = `${Math.round(at.left)}px`;
  if (at && 'right' in at) { t.style.left = 'auto'; t.style.right = `${Math.round(at.right)}px`; t.classList.add('tail-right'); }
  // 畫面上最多同時兩句（樣式表只排得出兩格，`.toast ~ .toast`）：第三句進來就先收掉最舊的那句（魔物頭上的 `bubbleAt` 自己會避讓，不算在內）。
  // 長句留得比較久之後，關主換階段三句連播會第二、三句擠同一格疊在一起（實機複驗 2026-09-16 低-1）
  const showing = [...layer.querySelectorAll<HTMLElement>('.toast:not(.out):not(.bubble-at)')];
  // 戰鬥畫面排得出兩格（留一句舊的）；其他畫面只有一個位置，新的一來舊的就收（實機複驗 低-3：戰利品頁連著幾則疊在同一點）
  const keep = layer.closest('[data-screen="combat"]') ? 1 : 0;
  for (const old of showing.slice(0, Math.max(0, showing.length - keep))) { old.classList.add('out'); setTimeout(() => old.remove(), 500); }
  layer.append(t);
  // 照字數多留一會兒：16 字以內照舊 1.8 秒，最長留到 3.2 秒（總稽核 2026-09-16 丙 中-6：改寫後 20 字以上的有 38 句，1.8 秒讀不完）
  const stay = Math.min(3200, Math.max(1800, [...text].length * 110));
  setTimeout(() => t.classList.add('out'), stay);
  setTimeout(() => t.remove(), stay + 500);
}
