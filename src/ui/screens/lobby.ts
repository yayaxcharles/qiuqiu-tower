import { registerScreen } from '../app';
import { clear, el } from '../dom';
import { clearKeepBg, screenBg } from '../screenbg';
import { hostRoom as hostDirect, joinRoom as joinDirect } from '../../net/rtc';
import { hostRoom as hostRelay, joinRoom as joinRelay } from '../../net/ws';
import { CoopSession } from '../../net/session';
import { newCoopRun } from '../../engine/run';
import type { App } from '../app';
import type { LinkStatus, Transport } from '../../net/transport';
import { preloadCoopArt, warmBlessing } from '../preload';
import { rollBlessings } from '../../engine/blessing';
import { me } from '../../engine/runplayer';
import { HEROES, heroName, type Hero } from '../../engine/hero';
import { DIFFICULTY_NAMES, DIFFICULTY_TEXT, MAX_DIFFICULTY } from '../../content/difficulty';
import { checkRun, selectedDifficulty, setSelectedDifficulty, unlockedDifficulty } from '../../engine/save';
import type { RunState } from '../../engine/types';

/**
 * 開房畫面：兩台瀏覽器直連，**不經過任何伺服器**。
 *
 * 為什麼要玩家手動貼兩次碼：WebRTC 連得起來之前，雙方得先交換一段「我在哪個網路位置」
 * 的描述。正常做法是架一台伺服器幫忙轉交——但那樣就不再是純靜態網頁，要租、要維護、
 * 要擔心它哪天掛掉。手動貼＝**玩家自己當那台轉交的伺服器**。開局麻煩一點，
 * 換到的是零費用、零維護，而且遊戲本體照樣是一包丟到 GitHub Pages 就好的靜態檔。
 *
 * 這一頁的重點**不是好看，是講清楚現在該做什麼**。連線這件事對玩家來說是黑盒子，
 * 卡住的時候如果畫面只說「連線失敗」，他不會知道是自己貼錯、對方還沒貼、還是網路不通。
 * 所以每一步都只露出「現在該做的那一件事」，而且每個錯誤都講人話。
 */

type Step = 'pick' | 'hosting' | 'joining' | 'connected' | 'failed';

interface LobbyState {
  step: Step;
  /** 房號中繼（預設，`net/ws.ts`）或貼碼直連（備用，中繼掛了才用，`net/rtc.ts`） */
  mode: 'relay' | 'direct';
  /** 主機：我的房號 */
  room?: string;
  /** 還在等的那條連線怎麼收掉（離開畫面時叫；連上之後清掉，不然進地圖會把遊戲連線一起關了） */
  cancel?: () => void;
  /** 主機：我的邀請碼 */
  invite?: string;
  /** 加入者：我的回應碼 */
  answer?: string;
  /** 收到回應碼之後要叫的那一支（主機用） */
  accept?: (code: string) => Promise<Transport>;
  msg?: string;
  busy?: boolean;
}

/**
 * 連上之後開一局兩個人的。
 *
 * 進地圖而不是直接跳戰鬥：整局流程（選路、戰鬥、獎勵、回地圖）都走同一套，
 * 路線由兩個人投票決定（見 `engine/vote.ts`）。
 */
/**
 * 連線出問題（分岔、斷線）就在畫面最上方壓一條橫幅。
 *
 * **一定要做成全域的**：原本只有戰鬥畫面接 `onTrouble`，而它把訊息寫進自己的閉包再重畫。
 * 一旦離開戰鬥（獎勵、地圖、商店），那個閉包指向的節點早就被丟掉了——
 * 於是連線斷掉的當下**畫面上什麼都不會發生**，玩家只看到「點什麼都沒反應」。
 * 實測就是這樣：獎勵畫面點牌毫無動靜，主控台也一片乾淨。
 *
 * 掛在 `document.body` 而不是舞台裡：舞台每換一個畫面就被清空一次。
 */
function troubleBanner(app: App, why: string): void {
  /*
   * **第一則留著，後面的不覆蓋。**
   *
   * 分岔的處理順序是「先報原因、再關掉連線」，而關掉連線又會觸發一次通知
   *（訊息是「自己關掉了」）。覆蓋的話，畫面上留下的永遠是那句沒有資訊量的
   * 「自己關掉了」，真正的病根——第一則寫著的那句——就被蓋掉了。
   * 實測就是這樣：兩邊都只看到「自己關掉了」，查不出是哪裡對不上。
   */
  if (document.querySelector('.net-trouble')) return;
  document.querySelectorAll('.net-link').forEach((n) => n.remove());   // 接回放棄了：琥珀色那條撕掉，只留紅的（審查 2026-09-15 低-5）
  // 戰鬥畫面沒有別的出口：斷線之後要能回標題（審查 中-3）
  // 原因裡常常夾著只有寫程式的人看得懂的東西：英文動作代號（card／buy／swap）與八碼指紋。
  // 玩家看到「第 7 回合的戰況對不上（3a7f2b01 / 9c14ef22）」只會以為是自己弄壞的，
  // 而且整句話沒告訴他現在該做什麼（介面稽核 2026-09-16 高-2）。
  // 所以畫面上只留人話＋下一步，純英數的括號拿掉；完整原因留在主控台與滑鼠提示裡，回報時照樣查得到。
  const plain = why.replace(/（[\x20-\x7E\s/]+）/g, '');   // 括號裡全是英數符號＝技術細節，拿掉
  // eslint-disable-next-line no-console
  console.error('[連線] 停下來了：', why);
  const bar = el('div', { class: 'net-trouble' },
    `連線出問題：${plain}　這一局沒辦法繼續，兩個人都按「回標題」重開一局就好，存檔不會壞。`,
    el('button', { class: 'btn small', onclick: () => { app.leaveCoop(); app.show('title'); } }, '回標題'));
  bar.title = why;
  document.body.append(bar);
}

/**
 * 線路暫時斷了的琥珀色橫幅（2026-09-15 中途斷線接回）。跟紅色那條不同：這條**會自己撕掉**——
 * 接回來（back）或對方回來（peerBack）就拿掉。斷線期間傳輸層自己在接、自己在補，畫面只要讓玩家知道「等一下」。
 */
function linkBanner(_app: App, s: LinkStatus): void {
  /*
   * 自己那條與對方那條分開記（推前審查 2026-09-22 低-3）：以前一律先撕掉全部，
   * 自己一報「接回來了」，對方還在斷線的那條也被一起撕掉。
   * 自己那條的文字不說「正在重新連線」：網頁端心跳 3.5 秒收不到回音就會先報，那時線還沒真的斷。
   */
  const who = s === 'away' || s === 'back' ? 'me' : 'peer';
  document.querySelectorAll(`.net-link[data-who="${who}"]`).forEach((n) => n.remove());
  if (s === 'back' || s === 'peerBack') return;
  document.body.append(el('div', { class: 'net-link', 'data-who': who },
    who === 'me' ? '連線不穩，等待回應中…（接回來就繼續，會等幾分鐘）' : '對方斷線了，等對方回來…（會等幾分鐘）'));
}

/*
 * 兩個座位各玩誰（2026-09-12）。**開房的人替兩位都挑**。
 *
 * 不做成「各自挑自己的」是因為協定裡沒有「開局前再來回一趟」的機會：
 * 連上的那一瞬間主機就得宣布種子與難度，客戶端照著開。要讓加入者自己挑，
 * 得先加一輪「我挑好了」的訊息、主機收齊才宣布——那是另一件事，不是今晚的事。
 * 難度本來就是主機決定的，角色跟著同一套規矩走，至少是一致的。
 */
const coopHeroes: [Hero, Hero] = ['ninja', 'ninja'];

/**
 * 重新同步了（2026-09-25 使用者：「先做重新同步」）：載入主機傳來的存檔點（最近一次兩個人都回到地圖時的整局狀態），
 * 清掉戰鬥與蓋在上面的劇情層，兩個人一起回到那一層的地圖。讀不回來（存檔點壞了）才照舊停下。
 * 告訴玩家「剛剛那一格要重來」，技術原因放在滑鼠提示與主控台。
 */
function resyncTo(app: App, session: CoopSession, seat: number, json: string, why: string): void {
  let run: RunState | null = null;
  try { run = checkRun(JSON.parse(json) as Partial<RunState>); } catch { run = null; }
  if (!run) { troubleBanner(app, `${why}（存檔點讀不回來）`); session.leave(); return; }
  // 劇情幻燈片、過場影片、關主開場這些蓋在上面的層：演完會自己接下一個畫面，重新同步之後不能再接
  document.querySelectorAll('.slide-overlay, .cine-overlay, .dialogue-overlay, .actwalk-overlay').forEach((n) => n.remove());
  app.adoptRun(run, seat);
  session.useRun(run);
  app.cs = null;
  app.show('map');
  // eslint-disable-next-line no-console
  console.warn('[連線] 已重新同步：', why);
  document.querySelectorAll('.net-link[data-who="resync"]').forEach((n) => n.remove());
  const bar = el('div', { class: 'net-link', 'data-who': 'resync' },
    '兩台的遊戲狀態對不上，已經自動對齊：兩個人一起回到這一層的地圖，剛剛那一格要重來。');
  bar.title = why;
  document.body.append(bar);
  window.setTimeout(() => bar.remove(), 9000);
}

function startCoop(app: App, tx: Transport, isHost: boolean): void {
  const seat = isHost ? 0 : 1;
  const session: CoopSession = new CoopSession(tx, {
    isHost, seat,
    onDesync: (w) => troubleBanner(app, w), onClose: (w) => troubleBanner(app, w), onLink: (s) => linkBanner(app, s),
    onResync: (json, why) => resyncTo(app, session, seat, json, why),
  });
  app.coop = session;
  app.seat = seat;
  const begin = (seed: string, diff: number, heroes?: string[]): void => {
    // 兩邊各自跑同一支、餵同一顆種子——傳的是種子不是狀態（鎖步的整個重點）。
    // 角色也一樣：開房的人挑好兩位，跟種子一起宣布，兩邊算出來的起手牌才會一樣
    // 主機宣布的字串**照清單認**，不要一個一個 if——第三隻貓進來時這一行漏改，
    // 加入的人會安靜地變成球球（2026-09-17）
    const h = (i: number): Hero => (HEROES.includes(heroes?.[i] as Hero) ? heroes![i] as Hero : 'ninja');
    const run = newCoopRun(seed, diff, h(0), h(1));
    // 開局祝福的包袱（2026-09-23 第三批）：**在同伴的動作到得了之前**就摸好（兩台照種子摸出一樣的），
    // 不然他序章點得快、先選好送過來，這邊還沒有包袱，那個動作就套不進去、整場停掉
    rollBlessings(run);
    // 本機角色的立繪、貓叫、劇情情境、兩位的專屬圖一起設（health H-3：這裡原本各寫一行，推前審查 高-1 就是漏了聲音）
    app.adoptRun(run, seat);
    warmBlessing(run, seat);
    // 連線牌的牌面也是開局才補，**只抓這一組搭檔的**（2026-09-23；開打前 `startFight` 會等它抓完）
    void preloadCoopArt(run.players.map((p) => p.hero));
    session.useRun(run);   // 整局只有一份，設一次就不動（見 `useRun`）
    app.cs = null;
    /*
     * 連線也要演序章（2026-09-17 使用者指出「從頭到尾不會播」）。
     * 這裡本來直接 `show('map')`，所以那兩段替搭檔寫的序章一直躺著沒人看得到。
     * **不播開頭影片**：那支三十秒、一個人看另一個人乾等，而且兩位的影片還不一樣；
     * 幻燈片可以自己點過去，影片不行。
     */
    // 序章播完先選開局祝福（兩個人各選各的，都選好才一起進地圖，見 `screens/blessing.ts`）
    app.playPrologue(me(run, seat).hero ?? 'ninja', () => app.afterPrologue(), { video: false });
  };
  if (isHost) {
    const seed = `coop-${Math.floor(Math.random() * 1e9).toString(36)}`;
    const heroes = [coopHeroes[0], coopHeroes[1]];
    /*
     * **難度照開房的人選的開**（使用者 2026-09-14：原本寫死 1，標題畫面選的難度不生效）。
     * 跟標題畫面共用同一個設定，大廳裡改了標題畫面也跟著變；協定本來就帶難度，客戶端照宣布的開。
     */
    const diff = selectedDifficulty();
    session.start(seed, diff, '', heroes);
    begin(seed, diff, heroes);
  } else {
    // 客戶端等主機宣布，收到才開——不能自己挑種子，那樣兩邊一定不一樣
    session.onStartRun((seed, diff, _enc, heroes) => begin(seed, diff, heroes));
  }
}

/** 把長長的碼塞進一個唯讀方框，附一顆「複製」——玩家要整串貼給對方，不能讓他自己框選 */
function codeBox(label: string, code: string, hint: string): HTMLElement {
  const ta = el('textarea', { class: 'lobby-code', readonly: 'readonly', rows: '3' });
  ta.value = code;
  const copy = el('button', { class: 'btn small' }, '複製');
  copy.addEventListener('click', () => {
    ta.select();
    // `navigator.clipboard` 在非 https 的頁面會整支不存在（本機測試就會踩到），
    // 所以留著 `execCommand` 這條舊路：它醜，但每個瀏覽器都吃
    const done = (): void => { copy.textContent = '複製好了'; window.setTimeout(() => { copy.textContent = '複製'; }, 1600); };
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(code).then(done, () => { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
  });
  return el('div', { class: 'lobby-field' },
    el('div', { class: 'lobby-label' }, label),
    ta,
    el('div', { class: 'lobby-row' }, copy, el('span', { class: 'lobby-hint' }, hint)));
}

/** 給玩家貼對方的碼 */
function pasteBox(label: string, hint: string, btnText: string, onGo: (code: string) => void): HTMLElement {
  const ta = el('textarea', { class: 'lobby-code', rows: '3', placeholder: '把對方傳來的那一整串貼在這裡' });
  const go = el('button', { class: 'btn primary' }, btnText);
  go.addEventListener('click', () => { onGo(ta.value); });
  return el('div', { class: 'lobby-field' },
    el('div', { class: 'lobby-label' }, label),
    ta,
    el('div', { class: 'lobby-row' }, go, el('span', { class: 'lobby-hint' }, hint)));
}

registerScreen('lobby', (app, root) => {
  const st: LobbyState = { step: 'pick', mode: 'relay' };
  /*
   * 離開這個畫面就把還在等的連線收掉、之後的回呼全部作廢（審查 高-1）。
   * 不收的話「回標題」之後那條連線還在等：十分鐘逾時會回頭把玩家當下的畫面清掉蓋成失敗框；
   * 朋友這時才輸入舊房號，甚至會 `startCoop` 把單機進行中的那一局蓋掉。
   * `app.show` 換畫面時會叫 `disposers`——**連上之後進地圖也會叫**，所以成功那一刻要先把 `st.cancel` 清掉。
   */
  let left = false;
  app.disposers.push(() => { left = true; st.cancel?.(); st.cancel = undefined; });

  // 村口的夜景鋪在最底下，之後每次重畫都留著它（`render` 用 `clearKeepBg`）
  clear(root);
  root.append(screenBg('bg/screen_lobby'));

  const fail = (e: unknown): void => {
    if (left) return;   // 已經離開大廳，別回頭改別人的畫面
    st.step = 'failed';
    st.busy = false;
    // 連線的例外訊息多半是英文的原始錯誤，玩家看不懂。`rtc.ts` 與 `code.ts`
    // 丟的都是講人話的訊息，其他的一律收斂成一句「說得出下一步」的話
    const raw = e instanceof Error ? e.message : String(e);
    st.msg = /[一-鿿]/.test(raw) ? raw : '連不起來。兩邊都重新整理一次、重新開房試試看。';
    render();
  };

  /** 選角那兩排（只有開房的人按得動；加入的人照主機宣布的開） */
  const heroPicker = (): HTMLElement => {
    const row = (label: string, i: 0 | 1): HTMLElement => el('div', { class: 'lobby-hero-row' },
      el('b', {}, label),
      ...HEROES.map((h) => el('button', {
        class: `btn small${coopHeroes[i] === h ? ' selected' : ''}`,
        onclick: () => { coopHeroes[i] = h; render(); },
      }, heroName({ hero: h }))));
    return el('div', { class: 'lobby-heroes' },
      el('p', { class: 'lobby-note' }, '這兩排只有開房的人選的算數。要加入別人的房，角色和難度都由對方決定：'),
      row('開房的人', 0), row('加入的人', 1));
  };

  /** 難度（跟標題畫面同一個設定；只有開房的人選的算數） */
  const diffPicker = (): HTMLElement => {
    const level = selectedDifficulty();
    const unlocked = unlockedDifficulty();
    const btns = Array.from({ length: MAX_DIFFICULTY }, (_, k) => {
      const i = k + 1;
      const locked = i > unlocked;
      return el('button', {
        class: `btn small diff-btn d${i}${i === level ? ' selected' : ''}${locked ? ' locked' : ''}`,
        ...(locked ? { disabled: 'disabled' } : {}),
        onclick: () => { setSelectedDifficulty(i); render(); },
      }, locked ? `🔒 ${i}` : `${i} ${DIFFICULTY_NAMES[i - 1]}`);
    });
    return el('div', { class: 'lobby-heroes' },
      el('div', { class: 'lobby-hero-row' }, el('b', {}, '難度'), ...btns),
      el('p', { class: 'lobby-note' }, `${DIFFICULTY_NAMES[level - 1]}：${DIFFICULTY_TEXT[level - 1]}${level > 1 ? '（含前面各級）' : ''}`));
  };

  const render = (): void => {
    /*
     * 底圖那一層留著（2026-09-18 加背景時一起改）：這一頁每按一個按鈕就整個重畫，
     * 用 `clear(root)` 會把底圖也清掉，第二次重畫之後就變成一片深色。
     * 其他有底圖的畫面早就是這個規矩，見 `screenbg.ts` 的 `clearKeepBg`。
     */
    clearKeepBg(root);
    const box = el('div', { class: 'lobby' });
    box.append(el('h1', {}, '兩個人一起爬塔'));

    if (st.step === 'pick') {
      const relay = st.mode === 'relay';
      box.append(
        el('p', { class: 'lobby-lead' }, '一個人開房、一個人加入。開房的人先按下面那顆。'),
        el('div', { class: 'lobby-row' },
          el('button', {
            class: 'btn primary',
            onclick: () => {
              if (relay) {
                // 房號中繼（2026-09-14 深夜）：兩台都連到 Cloudflare 上的中繼，手機網路也連得上
                st.step = 'hosting'; st.busy = true; st.msg = '正在拿房號…'; render();
                hostRelay().then((r) => {
                  if (left) { r.cancel(); return; }
                  st.room = r.code; st.cancel = r.cancel; st.busy = true; st.msg = '等對方輸入房號…（對方連上就會自動開局）'; render();
                  r.ready.then((tx) => {
                    if (left) { tx.close(); return; }
                    st.cancel = undefined; st.step = 'connected'; st.busy = false; st.msg = undefined; render();
                    startCoop(app, tx, true);
                  }).catch(fail);
                }).catch(fail);
              } else {
                st.step = 'hosting'; st.busy = true; st.msg = '正在看你這台在網路上的位置，最多五秒…'; render();
                hostDirect().then((r) => { if (left) { r.cancel(); return; } st.invite = r.invite; st.accept = r.accept; st.cancel = r.cancel; st.busy = false; st.msg = undefined; render(); }).catch(fail);
              }
            },
          }, '我開房'),
          el('button', { class: 'btn', onclick: () => { st.step = 'joining'; render(); } }, '我要加入')),
        heroPicker(),
        diffPicker(),
        el('p', { class: 'lobby-note' }, relay
          ? '兩台都連到中繼伺服器、由它轉送，手機網路也能玩。開房的人會拿到六位數房號，用 LINE 講給對方就好。'
          : '備用方式：兩台機器直接連線、不經過伺服器，要互相貼一次代碼。手機網路多半連不上，中繼壞掉時才用。'),
        el('button', { class: 'btn small', onclick: () => { st.mode = relay ? 'direct' : 'relay'; render(); } },
          relay ? '中繼連不上？改用貼碼直連（備用）' : '改回用房號連（推薦）'));
    }

    if (st.step === 'hosting' && st.mode === 'relay') {
      box.append(el('div', { class: 'lobby-field' },
        el('div', { class: 'lobby-label' }, '把這個房號告訴對方'),
        el('div', { class: 'lobby-room' }, st.room ?? '……'),
        el('div', { class: 'lobby-hint' }, '對方在「我要加入」那裡輸入這六位數，連上就自動開局')));
    }

    if (st.step === 'hosting' && st.mode === 'direct') {
      if (st.invite) {
        box.append(
          codeBox('① 把這串邀請碼傳給對方', st.invite, '整串複製，不要只複製看得到的那一段'),
          pasteBox('② 對方會傳一串回應碼回來，貼在這裡', '貼完按這顆就連上了', '連上', (code) => {
            if (!st.accept) return;
            st.busy = true; st.msg = '正在接上…'; render();
            st.accept(code).then((tx) => {
              if (left) { tx.close(); return; }
              st.cancel = undefined; st.step = 'connected'; st.busy = false; st.msg = undefined; render();
              startCoop(app, tx, true);
            }).catch(fail);
          }));
      }
    }

    if (st.step === 'joining' && st.mode === 'relay') {
      const input = el('input', { class: 'lobby-room-input', type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: '六位數房號' }) as HTMLInputElement;
      const go = el('button', { class: 'btn primary', ...(st.busy ? { disabled: 'disabled' } : {}) }, '加入');
      go.addEventListener('click', () => {
        if (st.busy) return;
        const code = input.value;   // 先讀值再重畫：`render()` 會把這顆 input 整個換掉（審查 低-11）
        st.busy = true; st.msg = '正在連上去…'; render();
        const j = joinRelay(code);
        st.cancel = j.cancel;
        j.ready.then((tx) => {
          if (left) { tx.close(); return; }
          st.cancel = undefined; st.step = 'connected'; st.busy = false; st.msg = undefined; render();
          startCoop(app, tx, false);
        }).catch(fail);
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });   // 手機數字鍵盤的送出鍵
      box.append(el('div', { class: 'lobby-field' },
        el('div', { class: 'lobby-label' }, '輸入對方給你的房號'),
        input,
        el('div', { class: 'lobby-row' }, go, el('span', { class: 'lobby-hint' }, '按下去就連上，對方那邊會自動開局'))));
    }

    if (st.step === 'joining' && st.mode === 'direct') {
      box.append(pasteBox('① 貼上對方給你的邀請碼', '按下去會產生你的回應碼', '產生回應碼', (code) => {
        st.busy = true; st.msg = '正在讀邀請碼、看你這台的位置，最多五秒…'; render();
        joinDirect(code).then((r) => {
          if (left) { r.cancel(); return; }
          st.answer = r.answer; st.cancel = r.cancel; st.busy = false; st.msg = undefined; render();
          // 對方貼完我們的回應碼，通道就會自己開起來
          r.ready.then((tx) => { if (left) { tx.close(); return; } st.cancel = undefined; st.step = 'connected'; render(); startCoop(app, tx, false); }).catch(fail);
        }).catch(fail);
      }));
      if (st.answer) {
        box.append(codeBox('② 把這串回應碼傳回去給對方', st.answer, '傳回去之後等一下，對方貼完就連上了'));
      }
    }

    if (st.step === 'connected') {
      box.append(
        el('p', { class: 'lobby-ok' }, '連上了！'),
        el('p', { class: 'lobby-note' }, '正在開一局兩個人的…'));
    }

    if (st.step === 'failed') {
      box.append(
        el('p', { class: 'lobby-bad' }, st.msg ?? '連不起來'),
        el('button', { class: 'btn', onclick: () => { st.step = 'pick'; st.msg = undefined; st.invite = undefined; st.answer = undefined; st.room = undefined; render(); } }, '重來一次'));
    }

    if (st.busy && st.msg) box.append(el('p', { class: 'lobby-busy' }, st.msg));

    box.append(el('button', { class: 'btn small lobby-back', onclick: () => app.show('title') }, '← 回標題'));
    root.append(box);
  };

  render();
});
