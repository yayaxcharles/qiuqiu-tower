import { potionById } from '../content/potions';
import { showCompendium } from './compendium';
import { relicById } from '../content/relics';
import type { App } from './app';
import { artUrl } from './assets';
import { ACT_NAMES } from '../engine/run';
import { play, soundOn, toggleSound } from './audio';
import { musicOn, musicVolume, setMusicVolume, toggleMusic } from './bgm';
import { showDeckPicker } from './deckview';
import { el } from './dom';
import { attachTextTooltip, attachTooltip } from './tooltip';

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
  for (const id of run.relics) {
    const r = relicById[id];
    if (!r) continue;
    const node = el('div', { class: 'hud-relic' }, el('img', { src: artUrl('icons', r.art), alt: r.name }));
    // 原本掛瀏覽器原生的 `title`：要停住一秒才跳出來、長相也跟遊戲裡其他提示不一樣，
    // 玩家滑過去等不到就以為「這格根本沒有說明」。改用遊戲自己的提示框，滑到就立刻出現。
    // 名稱走標題、說明走內文，不再串成「名稱：說明」一長條——秘寶說明有時兩三句，擠成一行讀不動。
    attachTextTooltip(node, r.name, r.text);
    relics.append(node);
  }

  const potions = el('div', { class: 'hud-potions' });
  for (let i = 0; i < 3; i++) {
    const id = run.potions[i];
    const p = id ? potionById[id] : undefined;
    const slot = el('div', { class: `hud-potion${p ? '' : ' empty'}` });
    // 提示只掛在有東西的格子上：空格掛了也只會跳出一個沒內容的框，反而讓人以為那格有東西。
    if (id && p) {
      slot.append(el('img', { src: artUrl('icons', p.art), alt: p.name }));
      attachTextTooltip(slot, p.name, p.text);
    }
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
    hp, fish, relics, potions, deckBtn, compBtn,
    seedTag(run.seed), music, vol, sound);
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
export function seedTag(seed: string): HTMLElement {
  const node = el('button', { class: 'hud-seed seed-copy' }, `本局代碼 ${seed} ⧉`);
  node.title = '點一下複製代碼';
  node.addEventListener('click', () => {
    const done = (): void => {
      play('click');
      node.textContent = '已複製！';
      window.setTimeout(() => { node.textContent = `本局代碼 ${seed} ⧉`; }, 1200);
    };
    try {
      void navigator.clipboard.writeText(seed).then(done, () => selectFallback(node));
    } catch {
      selectFallback(node);
    }
  });
  return node;
}

/** 複製失敗的退路：把整段文字選起來，使用者自己按複製就好 */
function selectFallback(node: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
