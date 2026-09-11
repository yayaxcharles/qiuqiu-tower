import { registerScreen } from '../app';
import { clear, el } from '../dom';
import { hostRoom, joinRoom } from '../../net/rtc';
import { CoopSession } from '../../net/session';
import { beginCombat, newCoopRun } from '../../engine/run';
import type { App } from '../app';
import type { Transport } from '../../net/transport';

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
function startCoop(app: App, tx: Transport, isHost: boolean): void {
  const seat = isHost ? 0 : 1;
  const session = new CoopSession(tx, { isHost, seat });
  app.coop = session;
  app.seat = seat;
  const begin = (seed: string, diff: number): void => {
    // 兩邊各自跑同一支、餵同一顆種子——傳的是種子不是狀態（鎖步的整個重點）
    app.run = newCoopRun(seed, diff);
    app.cs = null;
    app.show('map');
  };
  if (isHost) {
    const seed = `coop-${Math.floor(Math.random() * 1e9).toString(36)}`;
    session.start(seed, 1, '');
    begin(seed, 1);
  } else {
    // 客戶端等主機宣布，收到才開——不能自己挑種子，那樣兩邊一定不一樣
    session.onStartRun((seed, diff) => begin(seed, diff));
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
  const st: LobbyState = { step: 'pick' };

  const fail = (e: unknown): void => {
    st.step = 'failed';
    st.busy = false;
    // 連線的例外訊息多半是英文的原始錯誤，玩家看不懂。`rtc.ts` 與 `code.ts`
    // 丟的都是講人話的訊息，其他的一律收斂成一句「說得出下一步」的話
    const raw = e instanceof Error ? e.message : String(e);
    st.msg = /[一-鿿]/.test(raw) ? raw : '連不起來。兩邊都重新整理一次、重新開房試試看。';
    render();
  };

  const render = (): void => {
    clear(root);
    const box = el('div', { class: 'lobby' });
    box.append(el('h1', {}, '兩個人一起爬塔'));

    if (st.step === 'pick') {
      box.append(
        el('p', { class: 'lobby-lead' }, '一個人開房、一個人加入。開房的人先按下面那顆。'),
        el('div', { class: 'lobby-row' },
          el('button', {
            class: 'btn primary',
            onclick: () => {
              st.step = 'hosting'; st.busy = true; st.msg = '正在問路由器「我的對外位置是什麼」，最多五秒…'; render();
              hostRoom().then((r) => { st.invite = r.invite; st.accept = r.accept; st.busy = false; st.msg = undefined; render(); }).catch(fail);
            },
          }, '我開房'),
          el('button', { class: 'btn', onclick: () => { st.step = 'joining'; render(); } }, '我要加入')),
        el('p', { class: 'lobby-note' },
          '兩台機器會直接連線，中間不經過任何伺服器，所以要互相貼一次代碼（用 LINE 傳就好）。'));
    }

    if (st.step === 'hosting') {
      if (st.invite) {
        box.append(
          codeBox('① 把這串邀請碼傳給對方', st.invite, '整串複製，不要只複製看得到的那一段'),
          pasteBox('② 對方會傳一串回應碼回來，貼在這裡', '貼完按這顆就連上了', '連上', (code) => {
            if (!st.accept) return;
            st.busy = true; st.msg = '正在接上…'; render();
            st.accept(code).then((tx) => {
              st.step = 'connected'; st.busy = false; st.msg = undefined; render();
              startCoop(app, tx, true);
            }).catch(fail);
          }));
      }
    }

    if (st.step === 'joining') {
      box.append(pasteBox('① 貼上對方給你的邀請碼', '按下去會產生你的回應碼', '產生回應碼', (code) => {
        st.busy = true; st.msg = '正在讀邀請碼、問自己的對外位置，最多五秒…'; render();
        joinRoom(code).then((r) => {
          st.answer = r.answer; st.busy = false; st.msg = undefined; render();
          // 對方貼完我們的回應碼，通道就會自己開起來
          r.ready.then((tx) => { st.step = 'connected'; render(); startCoop(app, tx, false); }).catch(fail);
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
        el('button', { class: 'btn', onclick: () => { st.step = 'pick'; st.msg = undefined; st.invite = undefined; st.answer = undefined; render(); } }, '重來一次'));
    }

    if (st.busy && st.msg) box.append(el('p', { class: 'lobby-busy' }, st.msg));

    box.append(el('button', { class: 'btn small lobby-back', onclick: () => app.show('title') }, '← 回標題'));
    root.append(box);
  };

  render();
});
