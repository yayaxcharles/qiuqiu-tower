import { cards, inHeroCollection, starterDeckFor } from '../../content/cards';
import { actClearSlides, endingSlides, prologueSlides } from '../storyslides';
import { newRun as engineNewRun } from '../../engine/run';
import { actVariantKey } from '../screenbg';
import { events } from '../../content/events';
import { enemyNameFor } from '../../content/enemies';
import { storyFor, dialogue, lineFor, FEIFEI_BOSS_LINES } from '../../content/dialogue';
import { eventTextFor, FEIFEI_EVENT_LINES } from '../../content/event-text';
import { registerScreen } from '../app';
import { artUrl, eventArtKey, hasHeroSprite, heroArtUrl, setLocalHero, localHero } from '../assets';
import { setSfxHero } from '../audio';
import { cardNode } from '../cardview';
import { el } from '../dom';
import { HEROES, heroName, type Hero } from '../../engine/hero';

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
type Tab = '事件' | '牌' | '台詞' | '立繪' | '劇情' | '場景';

const POSES = [
  ['hero/ninja', '站著'], ['hero/ninja_attack', '出招'], ['hero/ninja_claw', '貓抓'],
  ['hero/ninja_curl', '蜷縮'], ['hero/ninja_hit', '挨打'], ['hero/ninja_dodge', '閃避'],
  ['hero/ninja_win', '贏了'], ['hero/ninja_lose', '倒下'], ['hero/ninja_hungry', '餓扁'],
  ['hero/ninja_hurt', '掛彩'], ['hero/ninja_power', '氣勢'], ['hero/ninja_skill', '施術'],
  ['hero/ninja_throw', '擲'], ['hero/ninja_stealth', '隱身'], ['hero/ninja_belly', '翻肚'],
  ['hero/ninja_lazy', '懶洋洋'], ['hero/ninja_puff', '炸毛'], ['hero/ninja_iron', '鐵布衫'],
  ['hero/ninja_dash', '衝'], ['hero/ninja_guard', '格擋'], ['hero/ninja_choke', '被掐'],
] as const;

/**
 * 進除錯模式**之前**是誰（離開時要還原）。放在模組外層、只記第一次（稽核 低-2）：
 * 跳進畫面再按 Esc 回來會重進這一頁，那時 `localHero()` 已經被頁上的切換鈕改掉了，
 * 每次進來都重記的話原值就丟了。
 */
let heroBeforeDebug: string | null = null;

registerScreen('debug', (app, root) => {
  heroBeforeDebug ??= localHero();
  let hero: string = localHero();
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
        el('h3', {}, eventTextFor(hero, e.title), e.hero ? el('span', { class: 'dbg-tag' }, `${heroName({ hero: e.hero })}專屬`) : '',
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
              // 選項也要過 `eventTextFor`：鏡子走廊的選項會換字，照原文印會跟遊戲裡看到的不一樣（審查 中-2）
              el('b', {}, `選項：${eventTextFor(hero, c.label)}`),
              el('p', {}, eventTextFor(hero, c.result)),
              said(c.result) ? '' : el('span', { class: 'dbg-warn' }, '⚠️ 球球的句子')))));
      }
      body.append(box);
    }
  }

  // ---- 牌：整副牌的牌面（照這位角色的圖與牌名） ----
  function renderCards(): void {
    // 判準跟圖鑑同一支（稽核 中-2）：起手區照起手十張認，貓抓、淡定才不會算進菲菲拿得到的牌
    const mine = cards.filter((c) => !c.combatOnly && !c.hidden && inHeroCollection(c, hero));
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
    sec('第一次看到每種魔物', Object.entries(s.firstMeet).map(([id, t]) => `${enemyNameFor(id, hero)}：${t}`));
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

  // ---- 劇情投影片：序章四張、過關各三張、結局兩張，圖旁邊就是那一張配的台詞 ----
  function renderStory(): void {
    body.append(el('p', { class: 'dbg-note' },
      '每一張旁邊就是它在遊戲裡配的台詞——圖跟字對不對得上要一起看才判斷得出來。'
      + '切法跟遊戲裡是同一支，一張圖配幾句就列幾句。'));
    /*
     * **切法不自己寫，叫遊戲用的那一支**（稽核 中-5）。原本這裡一張圖只配一句，
     * 結局第二張配成「塔主：承讓。」、第一張只列一句（遊戲裡是四到六句），照這頁檢查會被誤導。
     */
    const group = (title: string, slides: { img: string; lines: { speaker: string; text: string }[] }[]): void => {
      body.append(el('h3', {}, title));
      const row = el('div', { class: 'dbg-poses' });
      slides.forEach((sl, i) => {
        row.append(el('div', { class: 'dbg-slide' },
          shot(sl.img, `第 ${i + 1} 張`),
          el('div', { class: 'dbg-text' }, ...(sl.lines.length
            ? sl.lines.map((l) => el('p', {}, `${l.speaker}：${l.text}`))
            : [el('span', { class: 'dbg-cap' }, '（這張沒有對應的台詞）')]))));
      });
      body.append(row);
    };
    group('序章（四張）', prologueSlides(hero));
    group('第一關打完（三張）', actClearSlides(hero, 1));
    group('第二關打完（三張）', actClearSlides(hero, 2));
    // 結局第一句依打法換、難度 4 起多一句旁白：這裡列起手牌組、難度 1 的那一版
    group('結局（兩張，起手牌組・難度 1 的版本）', endingSlides(hero, [...starterDeckFor(hero)], 1));
  }

  // ---- 場景：所有非事件的底圖，外加「直接跳到那個畫面」的按鈕 ----
  function renderScenes(): void {
    body.append(el('p', { class: 'dbg-note' },
      '上面那排會真的開那個畫面（角色會站上去），看完按 Esc 或照常按畫面上的按鈕都會回這裡，不會動到你的存檔。底下是純底圖。'));
    /*
     * 跳進真正的畫面：用一局**臨時的**局（不存檔、不碰現有進度），
     * 只為了讓那幾個畫面有東西可畫。角色坐得對不對只有這樣才看得出來——
     * 光看底圖看不出立繪擺在哪（2026-09-14 貓窩那件就是這樣來回三次）。
     */
    /*
     * **臨時局一定要標成沙盒**（2026-09-14 夜間稽核 高-1）：那三個畫面收尾都走 `backToMap()`，
     * 原本會照常存檔、把玩家真正的續玩存檔蓋成這一局。沙盒時不存檔、收尾與 Esc 都回這一頁
     *（見 `App.sandbox`）。先 `leaveCoop`：剛從連線大廳退出來的話座位可能還是 1，
     * 單人的臨時局沒有座位 1，換畫面時會丟例外。
     */
    const jump = (screen: 'rest' | 'chest' | 'shop' | 'result', act: number, label: string): HTMLElement =>
      el('button', { class: 'btn small', onclick: () => {
        // 照清單認，不要一個一個 if——第三隻貓進來時這一行漏改，除錯頁就永遠跳不到他的畫面
        const run = engineNewRun('debug', 1, HEROES.includes(hero as Hero) ? hero as Hero : 'ninja');
        run.act = act;
        run.flags['prologue'] = true;          // 別播序章
        app.leaveCoop();
        app.sandbox = true;
        app.run = run;
        app.show(screen);
      } }, label);

    const bar1 = el('div', { class: 'dbg-jump' }, el('b', {}, '跳進畫面：'));
    for (const a of [1, 2, 3]) bar1.append(jump('rest', a, `貓窩 第${a}關`));
    for (const a of [1, 2, 3]) bar1.append(jump('chest', a, `紙箱 第${a}關`));
    for (const a of [1, 2, 3]) bar1.append(jump('shop', a, `罐頭鋪 第${a}關`));
    body.append(bar1);

    const sec = (title: string, keys: string[]): void => {
      body.append(el('h3', {}, title));
      const row = el('div', { class: 'dbg-poses' });
      for (const key of keys) row.append(shot(key, key.replace('bg/', '')));
      body.append(row);
    };
    const acts = [1, 2, 3];
    sec('貓窩（各關與變體）', acts.flatMap((a) => ['', '_b', '_c'].map((v) => actVariantKey('bg/screen_rest', a) + v)));
    sec('紙箱', acts.flatMap((a) => ['', '_b', '_c'].map((v) => actVariantKey('bg/screen_chest', a) + v)));
    sec('罐頭鋪', acts.flatMap((a) => ['', '_b', '_c'].map((v) => actVariantKey('bg/screen_shop', a) + v)));
    sec('事件畫面的底', acts.map((a) => actVariantKey('bg/screen_event', a)));
    sec('戰場', ['bg/low', 'bg/low_b', 'bg/low_c', 'bg/mid', 'bg/mid_b', 'bg/mid_c', 'bg/top', 'bg/top_b', 'bg/top_c']);
    sec('關主戰場', ['bg/boss1', 'bg/boss2', 'bg/boss3']);
    sec('關主門', ['bg/door_act1', 'bg/door_act2', 'bg/door_act3']);
    sec('地圖', ['bg/map_tall', 'bg/map_tall_mid', 'bg/map_tall_top']);
    sec('標題與結算', ['bg/screen_title', 'bg/screen_result_win', 'bg/screen_result_lose']);
    sec('牌背紙', ['bg/card_paper_attack', 'bg/card_paper_skill', 'bg/card_paper_power']);
  }

  const render = (): void => {
    setLocalHero(hero);            // 牌面、事件插圖都靠它決定要拿誰的圖
    setSfxHero(hero);
    body.replaceChildren();
    if (tab === '事件') renderEvents();
    else if (tab === '牌') renderCards();
    else if (tab === '台詞') renderLines();
    else if (tab === '劇情') renderStory();
    else if (tab === '場景') renderScenes();
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
      tabBtn('事件'), tabBtn('牌'), tabBtn('台詞'), tabBtn('立繪'), tabBtn('劇情'), tabBtn('場景'),
      el('span', { class: 'dbg-sep' }, '｜'),
      ...HEROES.map((h) => heroBtn(h, heroName({ hero: h }))),
      el('button', {
        class: 'btn small dbg-close',
        onclick: () => { setLocalHero(heroBeforeDebug ?? 'ninja'); setSfxHero(heroBeforeDebug ?? 'ninja'); heroBeforeDebug = null; app.show('title'); },
      }, '✕ 回標題'));
    render();
  };

  refresh();
  root.append(el('div', { class: 'debug-screen' }, bar, body));
});
