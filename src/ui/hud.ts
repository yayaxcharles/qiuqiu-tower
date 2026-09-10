import type { RunState } from '../engine/types';
import { DIFFICULTY_TEXT, difficultyName } from '../content/difficulty';
import { potionById } from '../content/potions';
import { showCompendium } from './compendium';
import { relicById } from '../content/relics';
import type { App } from './app';
import { artUrl } from './assets';
import { ACT_NAMES, potionCapacity } from '../engine/run';
import { play, soundOn, toggleSound } from './audio';
import { musicOn, musicVolume, setMusicVolume, toggleMusic } from './bgm';
import { showDeckPicker } from './deckview';
import { loadRun } from '../engine/save';
import { encodeRun } from '../engine/sharecode';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';
import { showRelicList } from './reliclist';
import { attachTextTooltip, attachTooltip, hideTooltip } from './tooltip';

/**
 * 上方狀態列：樓層、生命、小魚乾、秘寶、忍具、牌組、種子。
 *
 * 忍具在這裡**只是畫出來給人看**，按不動：規格 §8.4 修訂後忍具搬到戰場的左下角，
 * 而且戰鬥中這一列的生命與忍具兩格是用 CSS 隱藏的（戰鬥途中 `run.potions` 是過期值）。
 */
/**
 * 上一次畫的小魚乾數，用來判斷「這次是不是變了」。
 *
 * 買東西、拿獎勵、事件給錢，原本都只是這個數字**默默換一個值**——
 * 按下去跟沒按下去看起來一樣，這是「只是點擊」感最重的一處。
 * 記在模組層而不是整局狀態裡：這純粹是畫面上的事，不該存進存檔。
 * 連種子一起記，換一局要從頭算，不然新局第一次畫就會平白蹦一下。
 */
let lastFish: { seed: string; n: number } | null = null;
/**
 * 上一次畫到的秘寶清單（連種子一起記，換一局要從頭算）。這一次多出來的那幾件會彈進來。
 *
 * 本來拿到秘寶時狀態列那一格是**無聲出現**的：紙箱、戰利品、事件都會給秘寶，
 * 玩家的視線那時在畫面中央，回到地圖才發現多了一格、卻不知道是哪一次拿的。
 */
let lastRelics: { seed: string; ids: Set<string> } | null = null;

/**
 * `fishDelta`＝戰鬥途中還沒併回整局的小魚乾增減。
 *
 * 戰鬥中賺到或被偷走的小魚乾都先記在 `cs.fishDelta`，**打完才**加進 `run.fish`。
 * 狀態列如果照著 `run.fish` 畫，山賊偷走的當下數字完全不動，玩家看不出自己在失血
 * （使用者的原話：「偷了以後沒有顯示偷了多少小魚乾，上方小魚乾好像沒有看到減少」）。
 * 戰鬥畫面把當下的 delta 傳進來，這裡就畫「現在實際有多少」——偷走馬上少、
 * 打倒牠馬上加回來，本來就有的變動閃光也跟著會亮。
 */
export function renderHud(app: App, root: HTMLElement, fishDelta = 0): HTMLElement {
  const run = app.run;
  const hud = el('div', { class: 'hud' });
  root.append(hud);
  if (!run) return hud;   // 沒有整局就掛個空殼，不要讓畫面整個掛掉
  const fishNow = Math.max(0, run.fish + fishDelta);

  const pct = run.maxHp > 0 ? Math.max(0, Math.round((run.hp / run.maxHp) * 100)) : 0;
  const hp = el('div', { class: 'hud-hp' },
    el('div', { class: 'hud-hp-bar', style: `width:${pct}%` }),
    el('span', {}, `${run.hp} / ${run.maxHp} 生命`));

  const fish = el('div', { class: 'hud-fish' },
    el('img', { src: artUrl('icons', 'icon/fish'), alt: '' }),
    el('span', {}, String(fishNow)));
  attachTooltip(fish, '小魚乾');
  const diff = lastFish && lastFish.seed === run.seed ? fishNow - lastFish.n : 0;
  if (diff !== 0) {
    fish.classList.add(diff > 0 ? 'gain' : 'spend');
    fish.append(el('span', { class: 'hud-fish-diff' }, `${diff > 0 ? '+' : ''}${diff}`));
  }
  lastFish = { seed: run.seed, n: fishNow };

  const relics = el('div', { class: 'hud-relics' });
  // 同一局才比得出「新拿到的」；換一局（或第一次畫）就整份當成已知，不演
  const seenRelics = lastRelics && lastRelics.seed === run.seed ? lastRelics.ids : null;
  lastRelics = { seed: run.seed, ids: new Set(run.relics) };
  // 最多畫 8 件、最新的排前面，其餘收成「+N」（使用者 2026-09-06：秘寶沒有上限，十幾件會把狀態列擠爆）；
  // 點任何一件或「+N」開「本局秘寶」清單，一行一件看得完整
  const MAX_ICONS = 8;
  const shown = [...run.relics].reverse().slice(0, MAX_ICONS);
  for (const id of shown) {
    const r = relicById[id];
    if (!r) continue;
    // 圖還沒生好的秘寶用名字前兩個字當牌子，不畫灰剪影
    const url = artUrl('icons', r.art);
    const fresh = seenRelics !== null && !seenRelics.has(id);
    const node = el('div', { class: `hud-relic${fresh ? ' fresh' : ''}` }, url.startsWith('data:') ? el('span', { class: 'hud-relic-name' }, r.name.slice(0, 2)) : el('img', { src: url, alt: r.name }));
    // 原本掛瀏覽器原生的 `title`：要停住一秒才跳出來、長相也跟遊戲裡其他提示不一樣，
    // 玩家滑過去等不到就以為「這格根本沒有說明」。改用遊戲自己的提示框，滑到就立刻出現。
    // 名稱走標題、說明走內文，不再串成「名稱：說明」一長條——秘寶說明有時兩三句，擠成一行讀不動。
    attachTextTooltip(node, r.name, r.text);
    node.addEventListener('click', () => showRelicList(run));
    relics.append(node);
  }
  if (run.relics.length > MAX_ICONS) relics.append(el('button', { class: 'btn small hud-relic-more', onclick: () => showRelicList(run) }, `+${run.relics.length - MAX_ICONS}`));
  // 秘寶滿 8 格又帶九命鈴／忍具袋（忍具 5～6 格）時整列放不下：圖示與間距縮一級（.hud.crowded）
  if (shown.length + Math.max(potionCapacity(run), 3) >= 10) hud.classList.add('crowded');

  const potions = el('div', { class: 'hud-potions' });
  // 格數隨難度與忍具袋變（見習～高手 3、宗師起 2、忍具袋 +1、九命鈴 +2）。畫面上至少畫 3 格：
  // 宗師起少掉的那一格畫成鎖住的格子而不是消失，格數才不會一局兩格一局三格（使用者 2026-09-06）
  const cap = potionCapacity(run);
  for (let i = 0; i < Math.max(cap, 3); i++) {
    const locked = i >= cap;
    const id = locked ? undefined : run.potions[i];
    const p = id ? potionById[id] : undefined;
    const slot = el('div', { class: `hud-potion${p ? '' : locked ? ' locked' : ' empty'}` }, locked ? '🔒' : '');
    // 提示只掛在有東西或鎖住的格子上：空格掛了也只會跳出一個沒內容的框，反而讓人以為那格有東西。
    if (id && p) {
      slot.append(el('img', { src: artUrl('icons', p.art), alt: p.name }));
      attachTextTooltip(slot, p.name, p.text);
    } else if (locked) attachTextTooltip(slot, '這一格鎖住了', '宗師以上只能帶兩支忍具；拿到忍具袋或九命鈴會多出格子。');
    potions.append(slot);
  }

  const deckBtn = el('button', {
    class: 'btn small',
    onclick: () => showDeckPicker({
      title: `牌組（${run.deck.length} 張）`, cards: run.deck, pickable: false, cancellable: true, onPick: () => { /* 只是看看 */ },
    }),
  }, `牌組 ${run.deck.length}`);

  /**
   * 音效開關。放在右上角、本局代碼旁邊——那裡是整場都在的位置，
   * 不會因為進戰鬥就被藏起來（生命與忍具那兩格在戰鬥中是隱藏的）。
   * 狀態記在瀏覽器裡，換一局也記得。按下去順便播一聲，讓玩家知道「開了」是什麼音量。
   */
  const sound = el('button', { class: 'btn small hud-sound' }, soundOn() ? '🔊 音效' : '🔇 音效');
  sound.title = '開關音效';
  sound.addEventListener('click', () => {
    const on = toggleSound();
    sound.textContent = on ? '🔊 音效' : '🔇 音效';
    if (on) play('click');
  });
  // 音樂另一顆開關：有人想聽音效不聽音樂，反過來也有，不能綁在一起
  const music = el('button', { class: 'btn small hud-sound' }, musicOn() ? '🎵 音樂' : '🔇 音樂');
  music.title = '開關音樂';
  music.addEventListener('click', () => {
    music.textContent = toggleMusic() ? '🎵 音樂' : '🔇 音樂';
  });
  // 音量拉桿：拉了立刻生效、直接記住，不經過任何重畫
  const vol = el('input', { class: 'hud-vol', type: 'range', min: '0', max: '100', value: String(musicVolume()) }) as HTMLInputElement;
  vol.title = '音樂音量';
  vol.addEventListener('input', () => setMusicVolume(Number(vol.value)));

  // 圖鑑：整個牌庫一覽＋升級版勾選（使用者點名）。放牌組鈕旁邊——都是「查牌」的入口
  const compBtn = el('button', { class: 'btn small' }, '📖 圖鑑');
  compBtn.title = '全部卡牌與效果一覽，可切換看升級版';
  compBtn.addEventListener('click', () => showCompendium());

  hud.append(
    // 還沒踏上這一關的第一個節點時顯示關名（塔下／塔中／塔頂），之後顯示累計樓層
    el('div', { class: 'hud-floor' }, run.currentNode ? `${run.floor}F` : (ACT_NAMES[run.act - 1] ?? '塔下')),
    diffBadge(run),
    hp, fish, relics, potions, deckBtn, compBtn,
    // 每個畫面都給分享鈕（使用者 2026-09-07：「戰鬥中也能隨手按一下比較方便」）。
    // 戰鬥中按是安全的——分享的是上一個存檔點（見 seedTag 裡的說明），不是還沒打完的這一格
    seedTag(run.seed, false, run), music, vol, sound);
  return hud;
}

/**
 * 「本局代碼」做成點一下就複製的按鈕。
 *
 * 代碼的用途就是抄給別人（或自己下一局貼上）重玩同一座塔，
 * 但它只是一行字、選取起來又小又難按（使用者的原話：「不能複製耶」）。
 * 剪貼簿權限包在 try 裡：不安全的來源或舊瀏覽器沒有 `navigator.clipboard`，
 * 失敗就退回「選取那段文字」讓人自己按複製，不能什麼都不發生。
 */
/** 難度牌子：難度 1 不掛（跟現在一樣）；2 起掛「難度 N·名字」，滑上去列出這局多了哪些懲罰 */
function diffBadge(run: RunState): HTMLElement | string {
  const level = run.difficulty ?? 1;
  if (level <= 1) return '';
  const node = el('div', { class: `hud-diff d${level}` }, `難度 ${level}·${difficultyName(level)}`);
  attachTextTooltip(node, `難度 ${level} ${difficultyName(level)}`, DIFFICULTY_TEXT.slice(1, level).map((t, i) => `${i + 2}：${t}`).join('\n'));
  return node;
}

/**
 * `full`＝結算畫面用的整串版本，複製的是**地圖種子**（同一張地圖從頭再來一次）。
 * 遊戲進行中的狀態列版本複製的是**局面碼**：連牌組、秘寶、忍具、血量、走到第幾層一起打包，
 * 別人貼上就從你這個點接著打（使用者 2026-09-07：「讓三個人用同一種牌組跟秘寶打王看看」）。
 *
 * 之前狀態列這顆叫「存檔」，使用者自己也以為按了就能把進度傳給別人——名字承諾的比做的多。
 * 現在名實相符了：進行中＝分享局面，結算後＝分享地圖種子（那時人已經死了或通關了，局面沒有意義）。
 */
export function seedTag(seed: string, full = false, run?: RunState): HTMLElement {
  // 代碼是玩家自己打的、長度沒有上限（局面碼本來就一千多字，不能限制輸入框），
  // 但**按鈕上不能整串印出來**（稽核 2026-09-10 低-4）：實測用 300 字的代碼開局，
  // 結算畫面那顆按鈕量出來寬 2897，是舞台寬度的 2.4 倍，整行字被切在畫面右緣、
  // 連後面的複製記號都看不到。舞台是 overflow: hidden 所以頁面不會壞，只是那顆按鈕沒法用。
  // 複製出去的還是完整的字串，只有顯示會截斷。
  const shown = seed.length > 28 ? `${seed.slice(0, 16)}…${seed.slice(-6)}` : seed;
  const label = full ? `本局代碼 ${shown} ⧉` : run ? '📤 分享局面' : '🎲 本局代碼';
  const node = el('button', { class: full ? 'hud-seed seed-copy' : 'btn small hud-seed seed-copy' }, label);
  if (full || !run) {
    attachTextTooltip(node, `本局代碼 ${seed}`, '點一下複製。貼到首頁的「本局代碼」欄，可以重玩這一局（同一張地圖、同樣的怪）。');
  } else {
    attachTextTooltip(node, '分享目前的局面',
      '點一下複製一長串局面碼（十幾行，正常）。別人貼到首頁的「本局代碼」欄，就會從你的位置接著打——'
      + '同一套牌組、秘寶、忍具、血量、樓層。適合幾個人拿一樣的條件比誰打得好。'
      + '分享的是你最近一次離開節點的狀態，也就是按「續玩」會回到的那個點——'
      + '在地圖上按就是你現在站的位置；戰鬥打到一半按，給出去的是進這場戰鬥之前，這樣對方才打得到同一場。'
      + '你自己的進度本來就會自動存，回首頁按「續玩」即可，不需要這串。');
  }
  let resetTimer = 0;
  const copy = (text: string): void => {
    const done = (): void => {
      play('click');
      // **改的是「現在畫面上那一顆」，不是按下當時那一顆**（稽核 2026-09-10 低-2）：
      // 壓縮局面碼是非同步的，戰鬥畫面每動一次就整頁重畫、`renderHud` 會生一顆全新的分享鈕，
      // 按下那顆早就被丟掉了。原本的寫法會讓玩家看到「產生中…」之後按鈕跳回「分享局面」——
      // 其實剪貼簿已經寫進去了，但看起來像沒成功、於是再按一次。
      // 全畫面只會有一顆 `.seed-copy`：結算畫面不呼叫 `renderHud`，所以狀態列那顆與結算那顆
      // 不會同時存在（稽核 2026-09-10 低-3 實測）。哪天結算畫面補上狀態列，這裡要改成
      // 只在同一個畫面根節點裡找，不然 1.4 秒後的計時器會把文字寫到另一顆上。
      const live = document.querySelector<HTMLElement>('.seed-copy') ?? node;
      live.textContent = '已複製！';
      // 連點時舊的計時器會在新的一次還顯示「產生中…」時把字改回去，看起來像沒反應
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        const back = document.querySelector<HTMLElement>('.seed-copy') ?? node;
        back.textContent = label;
      }, 1400);
    };
    const fallback = (): void => {
      // 老方法退路：塞一個看不見的輸入框、選起來、叫瀏覽器複製。剪貼簿 API 被擋（非安全來源、
      // 權限沒給）時多半這條還通得過
      if (execCopy(text)) { done(); return; }
      // 短的地圖種子可以整串印在按鈕上讓人自己選；**局面碼一千多字元不行**——
      // 塞進狀態列這顆小按鈕會把整條狀態列撐爆（2026-09-07 實測撞到）。改開一個視窗給人選取
      if (text.length <= 40) { node.textContent = text; selectFallback(node); return; }
      showCopyBox(text);
      node.textContent = label;
    };
    try {
      void navigator.clipboard.writeText(text).then(done, fallback);
    } catch {
      fallback();
    }
  };
  node.addEventListener('click', () => {
    if (full || !run) { copy(seed); return; }
    // 壓縮是非同步的，先把按鈕改成「產生中」，免得玩家以為沒反應又點一次
    node.textContent = '產生中…';
    // **分享的是「上一個存檔點」，不是此刻的 run**（稽核 2026-09-07 高 1）。
    // 進節點時 `currentNode` 就被推到新節點，但那個節點還沒結算——存檔機制特地避開這一刻
    //（見 app.ts 的 save() 註解）。壓當下的 run 會出兩種事：收到的人站在一個還沒打的節點上，
    // 直接點下一層就跳過去、白賺一層；更糟的是在**關主戰**按分享（正是「三個人打同一隻王」會做的事），
    // 塔主節點沒有下一層可走、地圖上一顆能點的都沒有、又沒有回首頁的鈕，收到的人只能重整，
    // 重整後「續玩」又回到同一個死局，而他自己的進度已經被蓋掉了。
    // 改成分享存檔裡那一份：那正是「續玩」會回到的位置，收到的人自己走進那場戰鬥，條件一樣可比。
    const shared = loadRun() ?? run;
    void encodeRun(shared).then((code) => {
      if (code) { copy(code); return; }
      // 壓不動（太舊的瀏覽器）就退回分享種子，並且講清楚差別，不要默默給一串意思不同的東西
      node.textContent = '改複製地圖代碼';
      window.setTimeout(() => copy(seed), 900);
    });
  });
  return node;
}

/** 老方法複製：看不見的輸入框＋execCommand。剪貼簿 API 被擋時多半還通得過 */
function execCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/**
 * 兩條退路都不通時的最後一手：開一個視窗把整串碼放進可選取的文字框。
 * 局面碼一千多字元，不能像地圖種子那樣印在按鈕上。
 */
function showCopyBox(text: string): void {
  const layer = overlayRoot();
  if (!layer) return;
  // 疊層蓋上來時 mouseleave 不會發生，分享鈕的提示框會卡在畫面上（deckview／confirm 都記過這個坑）
  hideTooltip();
  const overlay = el('div', { class: 'modal-overlay' });
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.readOnly = true;
  ta.className = 'copy-box';
  const close = el('button', { class: 'btn', onclick: () => { overlay.remove(); unlockScreen(); } }, '關閉');
  overlay.append(el('div', { class: 'modal' },
    el('h2', { class: 'modal-title' }, '自動複製沒成功'),
    el('div', { class: 'copy-hint' }, '框裡已經整串選起來了，按 Ctrl+C（Mac 是 Cmd+C）複製。'),
    ta,
    el('div', { class: 'modal-foot' }, close)));
  layer.append(overlay);
  lockScreen();
  ta.focus();
  ta.select();
}

/** 複製失敗的退路：把整段文字選起來，使用者自己按複製就好 */
function selectFallback(node: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
