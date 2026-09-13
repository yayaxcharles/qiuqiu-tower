import { cards } from '../../content/cards';
import { events } from '../../content/events';
import { enemyById } from '../../content/enemies';
import { eventTextFor, storyFor, dialogue, lineFor, FEIFEI_EVENT_LINES, FEIFEI_BOSS_LINES } from '../../content/dialogue';
import { registerScreen } from '../app';
import { artUrl, eventArtKey, hasHeroSprite, heroArtUrl, setLocalHero, localHero } from '../assets';
import { cardNode } from '../cardview';
import { el } from '../dom';

/**
 * **除錯模式**（2026-09-14 使用者要求：「讓我能自由選擇或是移動到場景上，
 * 看事件的文字跟圖片，卡牌的圖片等等，讓我能一個一個檢查」）。
 *
 * 在標題畫面的「本局代碼」欄輸入 `mimi36985` 就進來。
 *
 * **為什麼要這個東西**：這個專案的錯幾乎都是「靜音」的——圖生錯角色、
 * 台詞沒換口氣、插圖跟文字對不起來，畫面照樣正常、測試照樣全綠，
 * 只有人眼看得出來。可是要看到某一張事件插圖，得真的玩到那一格，
 * 三十八個事件配上兩個角色就是七十六次。這個畫面把它們一次攤開。
 *
 * **只讀不寫**：這裡不碰存檔、不開局、不動任何遊戲狀態，
 * 唯一的例外是 `setLocalHero`（切換要看誰的圖），離開時會還原。
 */

/** 目前在看哪一頁 */
type Tab = '事件' | '牌' | '台詞' | '立繪';

const POSES = [
  ['hero/ninja', '站著'], ['hero/ninja_attack', '出招'], ['hero/ninja_claw', '貓抓'],
  ['hero/ninja_curl', '蜷縮'], ['hero/ninja_hit', '挨打'], ['hero/ninja_dodge', '閃避'],
  ['hero/ninja_win', '贏了'], ['hero/ninja_lose', '倒下'], ['hero/ninja_hungry', '餓扁'],
  ['hero/ninja_hurt', '掛彩'], ['hero/ninja_power', '氣勢'], ['hero/ninja_skill', '施術'],
  ['hero/ninja_throw', '擲'], ['hero/ninja_stealth', '隱身'], ['hero/ninja_belly', '翻肚'],
  ['hero/ninja_lazy', '懶洋洋'], ['hero/ninja_puff', '炸毛'], ['hero/ninja_iron', '鐵布衫'],
  ['hero/ninja_dash', '衝'], ['hero/ninja_guard', '格擋'], ['hero/ninja_choke', '被掐'],
] as const;

registerScreen('debug', (app, root) => {
  const before = localHero();               // 離開時要還原（見檔頭：只讀不寫）
  let hero: string = before;
  let tab: Tab = '事件';

  const body = el('div', { class: 'dbg-body' });

  /** 目前選的角色下，這張圖的網址（沒有就回 null，讓畫面標「缺圖」） */
  const bg = (key: string): string | null => {
    const url = artUrl('bg', key);
    return url.startsWith('data:') ? null : url;
  };

  const shot = (key: string, caption: string): HTMLElement => {
    const url = bg(key);
    return el('div', { class: 'dbg-shot' },
      url ? el('img', { src: url, alt: caption, loading: 'lazy' })
        : el('div', { class: 'dbg-missing' }, '缺圖'),
      el('div', { class: 'dbg-cap' }, caption),
      el('code', {}, key));
  };

  // ---- 事件：文字、插圖、每個選項的結果文字與結果圖 ----
  function renderEvents(): void {
    const mine = events.filter((e) => !e.hero || e.hero === hero);
    body.append(el('p', { class: 'dbg-note' },
      `${mine.length} 個事件（這位角色遇得到的）。⚠️ 標示的是「還在用球球的句子」。`));
    for (const e of mine) {
      const ownEvent = e.hero === hero;
      const said = (t: string): boolean => {
        const m = /球球：「(.+?)」/su.exec(t);
        return !m || ownEvent || hero !== 'feifei' || FEIFEI_EVENT_LINES[m[1]!] !== undefined;
      };
      const box = el('div', { class: 'dbg-event' },
        el('h3', {}, e.title, e.hero ? el('span', { class: 'dbg-tag' }, `${e.hero === 'feifei' ? '菲菲' : '球球'}專屬`) : '',
          e.fixedFloor ? el('span', { class: 'dbg-tag' }, `固定 ${e.fixedFloor}F`) : ''),
        el('div', { class: 'dbg-row' },
          shot(eventArtKey(e.id), '事件插圖'),
          el('div', { class: 'dbg-text' },
            el('p', {}, eventTextFor(hero, e.text)),
            said(e.text) ? '' : el('span', { class: 'dbg-warn' }, '⚠️ 球球的句子'))));
      for (const c of e.choices) {
        const artKey = c.resultArt ? eventArtKey(c.resultArt) : null;
        box.append(el('div', { class: 'dbg-choice' },
          el('div', { class: 'dbg-row' },
            artKey ? shot(artKey, '結果圖') : el('div', { class: 'dbg-shot dbg-noart' }, el('div', { class: 'dbg-cap' }, '這個選項沒有結果圖')),
            el('div', { class: 'dbg-text' },
              el('b', {}, `選項：${c.label}`),
              el('p', {}, eventTextFor(hero, c.result)),
              said(c.result) ? '' : el('span', { class: 'dbg-warn' }, '⚠️ 球球的句子')))));
      }
      body.append(box);
    }
  }

  // ---- 牌：整副牌的牌面（照這位角色的圖與牌名） ----
  function renderCards(): void {
    const mine = cards.filter((c) => !c.combatOnly && !c.hidden && (!c.hero || c.hero === hero));
    body.append(el('p', { class: 'dbg-note' }, `${mine.length} 張（這位角色拿得到的）。左邊基礎、右邊升級版。`));
    const grid = el('div', { class: 'dbg-cards' });
    const rank: Record<string, number> = { 常見: 0, 罕見: 1, 稀有: 2 };
    for (const def of [...mine].sort((a, b) => (a.pool < b.pool ? -1 : a.pool > b.pool ? 1 : (rank[a.rarity] ?? 9) - (rank[b.rarity] ?? 9)))) {
      grid.append(el('div', { class: 'dbg-pair' },
        cardNode(def, { small: true, hero }),
        cardNode(def, { small: true, upgraded: true, hero }),
        el('code', {}, `${def.pool}・${def.rarity}${def.coop ? '・雙人' : ''}　${def.art}`)));
    }
    body.append(grid);
  }

  // ---- 台詞：口頭禪、序章、過關、結局、魔物初遇、關主 ----
  function renderLines(): void {
    const s = storyFor(hero);
    const sec = (title: string, rows: (string | HTMLElement)[]): void => {
      if (!rows.length) return;
      body.append(el('div', { class: 'dbg-lines' }, el('h3', {}, title),
        ...rows.map((r) => el('div', { class: 'dbg-line' }, r))));
    };
    sec('序章', s.prologue.map((l) => `${l.speaker}：${l.text}`));
    sec('開打時', [...s.battleStart]);
    sec('打贏時', [...s.battleWin]);
    sec('飢餓', [...s.hungry]);
    sec('血剩很少', [...s.lowHp]);
    sec('開紙箱', [...s.chestLines]);
    sec('貓窩・睡覺', [...s.restNapLines]);
    sec('貓窩・磨針（磨爪）', [...s.restSharpenLines]);
    sec('第一關打完', s.actClear1.map((l) => `${l.speaker}：${l.text}`));
    sec('第二關打完', s.actClear2.map((l) => `${l.speaker}：${l.text}`));
    sec('輸了', s.defeat.map((l) => `${l.speaker}：${l.text}`));
    sec('通關', s.victory.map((l) => `${l.speaker}：${l.text}`));
    sec('第一次看到每種魔物', Object.entries(s.firstMeet).map(([id, t]) => `${enemyById[id]?.name ?? id}：${t}`));
    // 關主那批在原始碼裡寫的是球球的句子，玩菲菲時由 `lineFor` 換掉
    const bossRows: HTMLElement[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) { for (const x of v) walk(x); return; }
      if (!v || typeof v !== 'object') return;
      const l = v as { speaker?: string; text?: string };
      if (l.speaker === '球球' && typeof l.text === 'string') {
        const shown = lineFor(hero, l.text);
        const rewritten = hero !== 'feifei' || FEIFEI_BOSS_LINES[l.text] !== undefined;
        bossRows.push(el('div', {}, shown, rewritten ? '' : el('span', { class: 'dbg-warn' }, '⚠️ 只拿掉了「喵」')));
        return;
      }
      for (const x of Object.values(v)) walk(x);
    };
    for (const [k, v] of Object.entries(dialogue)) {
      if (['prologue', 'actClear1', 'actClear2', 'defeat', 'victory', 'battleStart', 'battleWin',
        'hungry', 'lowHp', 'chestLines', 'restNapLines', 'restSharpenLines', 'firstMeet', 'firstMeetFeifei'].includes(k)) continue;
      walk(v);
    }
    sec('關主、換階段、上樓（走 lineFor）', bossRows);
  }

  // ---- 立繪：這位角色的每一個姿勢 ----
  function renderPoses(): void {
    body.append(el('p', { class: 'dbg-note' }, '灰底＝這位角色沒有自己的那一張，遊戲裡會退回別的姿勢。'));
    const grid = el('div', { class: 'dbg-poses' });
    for (const [key, name] of POSES) {
      const own = hasHeroSprite(hero, key);
      const url = heroArtUrl(hero, key);
      grid.append(el('div', { class: `dbg-shot${own ? '' : ' dbg-fallback'}` },
        url.startsWith('data:') ? el('div', { class: 'dbg-missing' }, '缺圖') : el('img', { src: url, alt: name, loading: 'lazy' }),
        el('div', { class: 'dbg-cap' }, name),
        el('code', {}, own ? key : `${key}（退回）`)));
    }
    body.append(grid);
  }

  const render = (): void => {
    setLocalHero(hero);            // 牌面、事件插圖都靠它決定要拿誰的圖
    body.replaceChildren();
    if (tab === '事件') renderEvents();
    else if (tab === '牌') renderCards();
    else if (tab === '台詞') renderLines();
    else renderPoses();
    body.scrollTop = 0;
  };

  const tabBtn = (name: Tab): HTMLElement => {
    const b = el('button', { class: 'btn small dbg-tab', onclick: () => { tab = name; refresh(); } }, name);
    if (tab === name) b.classList.add('on');
    return b;
  };
  const heroBtn = (h: string, label: string): HTMLElement => {
    const b = el('button', { class: 'btn small dbg-tab', onclick: () => { hero = h; refresh(); } }, label);
    if (hero === h) b.classList.add('on');
    return b;
  };

  const bar = el('div', { class: 'dbg-bar' });
  const refresh = (): void => {
    bar.replaceChildren(
      el('span', { class: 'dbg-title' }, '除錯模式'),
      tabBtn('事件'), tabBtn('牌'), tabBtn('台詞'), tabBtn('立繪'),
      el('span', { class: 'dbg-sep' }, '｜'),
      heroBtn('ninja', '球球'), heroBtn('feifei', '菲菲'),
      el('button', {
        class: 'btn small dbg-close',
        onclick: () => { setLocalHero(before); app.show('title'); },
      }, '✕ 回標題'));
    render();
  };

  refresh();
  root.append(el('div', { class: 'debug-screen' }, bar, body));
});
