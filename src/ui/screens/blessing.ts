import { play } from '../audio';
import { blessingById, type BlessingDef } from '../../content/blessings';
import { BLESS_COOP_TOOK, BLESS_COOP_WAIT, BLESS_NAMES, BLESS_OPENING, blessCardText, blessTakeLine } from '../../content/blessing-text';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { anyBlessingPending, blessChoices, blessPickable, blessPickCount, offeredBlessing, takeBlessing, type BlessPick } from '../../engine/blessing';
import { heroName, type Hero } from '../../engine/hero';
import { runMods, type RunGain } from '../../engine/run';
import { me } from '../../engine/runplayer';
import type { RunState } from '../../engine/types';
import { registerScreen, type App } from '../app';
import { artUrl, eventArtKey } from '../assets';
import { attachCardPeek } from '../cardpeek';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { heroSpeaker, notice, toast } from '../dialogue';
import { el } from '../dom';
import { renderHud } from '../hud';
import { sceneView } from '../scene';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';

/**
 * 開局祝福：大俠貓留下的包袱（2026-09-23 內容擴充第三批 新A，設計稿 design3 第二節）。**延後載入**（`main.ts` 的 `registerLazyScreen`；
 * 序章播放時 `preload.ts` 的 `warmBlessing` 就在背景抓這一塊、主圖與四樣的圖示）。
 *
 * 版面：底是事件畫面的底圖、中上是這一位的祝福主圖、下面一排四張（格子借罐頭鋪的 `.shop-item`），對白框是旁白＋角色一句。
 * **點一張就生效**，沒有確認框、沒有「跳過」（設計稿 2-1）；要挑牌的（移除、升級、換牌、三選一）當場跳選牌窗，
 * 選牌窗按「不選」只是回到這四張、還沒選（不是跳過）。挑好了才一起送出——連線一個動作就結案（`{ t: 'bless', … }`）。
 *
 * 連線：各選各的。同伴那四張縮小排在對白框上方，他選好的那張亮起來、旁邊一行「某某從包袱裡拿了……」；
 * 兩個人都選好才一起進地圖，先選好的看到「等某某挑……」（跟罐頭鋪「逛好了」同一套：狀態在引擎裡，動作繞回來才算）。
 */

/** 選完回地圖：角色一句（吐司）＋實際拿到什麼（提示）。畫面換過去之後才叫，疊層不會被換畫面清掉 */
function farewell(def: BlessingDef, hero: string | undefined, notes: readonly string[], gains: readonly RunGain[]): void {
  toast(blessTakeLine(def.id, def.cls, hero), heroSpeaker());
  const got = gains.filter((g) => !g.missed).map((g) => `拿到${g.kind}「${(g.kind === '秘寶' ? relicById[g.id]?.name : potionById[g.id]?.name) ?? g.id}」`);
  const missed = gains.filter((g) => g.missed).length;
  const all = [...notes, ...got, ...(missed ? [`忍具帶滿了，還有 ${missed} 個收不下`] : [])];
  // `potions` 那一支已經自己寫了「帶滿了」那一句，不重複
  const lines = [...new Set(all)].filter((t, i, arr) => !(t.startsWith('忍具帶滿了') && arr.findIndex((x) => x.startsWith('忍具帶滿了')) !== i));
  if (lines.length) window.setTimeout(() => notice(lines.join('；')), 300);
}

function blessingScreen(app: App, root: HTMLElement): void {
  root.append(screenBg(actVariantKey('bg/screen_event', 1)));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;
  const seat = app.seat;
  const coop = app.coop;
  const mine = me(run, seat);
  // 沒有包袱（舊存檔、除錯開局）或大家都選好了：直接回地圖。走 `backToMap`：選完那一刻本來就該存
  if (!mine.bless || !anyBlessingPending(run)) { app.backToMap(); return; }
  const hero: Hero = mine.hero ?? 'ninja';
  const partnerSeat = run.players.findIndex((_, i) => i !== seat);
  const partner = partnerSeat >= 0 ? run.players[partnerSeat] : undefined;
  const partnerName = partner ? heroName(partner) : '';
  /** 我送出去、還沒繞回來（連線）：這段時間四張都點不動 */
  let sent = false;
  /** 我拿到什麼的那幾句（連線時在送出前用複本先算好：效果只看我自己的分支亂數，兩邊算出來一模一樣） */
  let mineNotes: { def: BlessingDef; notes: string[]; gains: RunGain[] } | null = null;
  /** 三選一那張正在挑（畫面換成三張牌＋「返回」） */
  let choosing: number | null = null;

  const leave = (): void => {
    const took = mine.bless?.took ? blessingById[mine.bless.took] : undefined;
    app.backToMap();
    if (took) farewell(took, hero, mineNotes?.notes ?? [], mineNotes?.gains ?? []);
  };

  /** 真的選下去。單機當場套；連線送出去，繞回來才算（`onRunApplied`） */
  function commit(i: number, pick: BlessPick): void {
    const def = offeredBlessing(run, seat, i);
    if (!def) return;
    choosing = null;
    const notes: string[] = []; const gains: RunGain[] = [];
    if (!coop) {
      if (!takeBlessing(run, seat, i, pick, notes, gains)) { render(); return; }
      play('relic');
      mineNotes = { def, notes, gains };
      leave();
      return;
    }
    // 連線：拿一份複本先跑一次，只為了得到「拿到了什麼」那幾句（真正的套用在動作繞回來時由引擎做，見 `runaction.ts`）
    const preview = structuredClone(run);
    if (!takeBlessing(preview, seat, i, pick, notes, gains)) { render(); return; }
    mineNotes = { def, notes, gains };
    if (coop.suspended || !coop.submitRun({ t: 'bless', seat, i, ...(pick.u ? { u: pick.u } : {}), ...(pick.c !== undefined ? { c: pick.c } : {}) })) {
      mineNotes = null;
      notice('現在送不出去，等連線穩一點再選一次');
      render();
      return;
    }
    sent = true;
    render();
  }

  /** 點了第 `i` 張：不用挑的直接選；要挑牌的先開選牌窗，挑好了才選 */
  function choose(i: number): void {
    const def = offeredBlessing(run, seat, i);
    if (!def || sent || mine.bless?.took) return;
    play('click');
    const pk = def.pick;
    if (!pk) { commit(i, {}); return; }
    if (pk.kind === 'choose') { choosing = i; render(); return; }
    const { min, max } = blessPickCount(run, seat, def);
    if (max === 0) { commit(i, { u: [] }); return; }   // 沒牌可挑（到不了：開局一定有牌）
    const verb = pk.kind === 'remove' ? '移除' : pk.kind === 'upgrade' ? '升級' : '換成新的';
    const ok = new Set(blessPickable(run, seat, pk.kind).map((c) => c.uid));
    showDeckPicker({
      title: `${pk.upTo ? '最多' : ''}選 ${max} 張牌${verb}（不選＝回去看包袱裡的其他東西）`,
      cards: mine.deck, pickable: true, cancellable: true, filter: (c) => ok.has(c.uid),
      previewUpgrade: pk.kind === 'upgrade', pickCount: max, minPick: min,
      onPick: (uid) => { if (uid === null) render(); else commit(i, { u: [uid] }); },
      onPickMany: (uids) => { if (uids.length) commit(i, { u: uids }); else render(); },
    });
  }

  /** 一樣東西的卡片：圖示、名稱、類別小牌、效果一兩行（格子借罐頭鋪的 `.shop-item`） */
  function card(def: BlessingDef, opts: { onClick?: () => void; took?: boolean; dim?: boolean }): HTMLElement {
    const url = artUrl('icons', def.art);
    const node = el('div', { class: `shop-item bless-card${opts.took ? ' took' : ''}${opts.dim ? ' sold' : ''}`, 'data-bless': def.id },
      el('div', { class: 'potion-rarity bless-cls', 'data-cls': def.cls }, def.cls),
      url.startsWith('data:') ? '' : el('img', { src: url, alt: BLESS_NAMES[def.id] ?? def.id }),
      el('div', { class: 'shop-name' }, BLESS_NAMES[def.id] ?? def.id),
      el('div', { class: 'small' }, blessCardText(def.id, hero)));
    if (opts.onClick) node.addEventListener('click', opts.onClick);
    // 手機橫拿說明太小：按住放大看，放開不選（同罐頭鋪，設計稿 2-1）
    attachCardPeek(node);
    return node;
  }

  /** 同伴那四張：縮小、灰階，他選好的那張亮起來（設計稿 2-1） */
  function partnerRow(): HTMLElement | string {
    const b = partner?.bless;
    if (!partner || !b) return '';
    const took = b.took;
    const icons = b.offer.map((id) => {
      const d = blessingById[id];
      const url = d ? artUrl('icons', d.art) : '';
      return url && !url.startsWith('data:')
        ? el('img', { class: id === took ? 'took' : '', src: url, alt: BLESS_NAMES[id] ?? id, title: BLESS_NAMES[id] ?? id }) : '';
    });
    const line = took ? BLESS_COOP_TOOK.replace('{同伴}', partnerName).replace('{名稱}', BLESS_NAMES[took] ?? took) : `${partnerName}還在翻包袱……`;
    return el('div', { class: 'bless-mate' }, el('span', {}, `${partnerName}的包袱：`), ...icons, el('span', {}, line));
  }

  function render(): void {
    clearKeepBg(root);
    renderHud(app, root);
    const took = mine.bless?.took;
    const offer = mine.bless?.offer ?? [];
    const open = BLESS_OPENING[hero];   // 開場那一段照本機這一位（連線混搭時各看各的）
    let body: HTMLElement;
    let text: string;
    let actions: (Node | string)[] = [];
    if (choosing !== null) {
      // 三選一（一疊招式圖）：三張牌排在主圖的位置，點一張就是它；「返回」回到包袱四樣
      const i = choosing;
      const def = offeredBlessing(run, seat, i)!;
      const grid = el('div', { class: 'reward-cards' });
      // 選到的是升級版（第一輪量尺之後改的）：照＋版畫，看到的就是會拿到的那一張
      const up = def.pick?.kind === 'choose' && !!def.pick.upgraded;
      for (const c of blessChoices(run, seat, def.id)) {
        grid.append(cardNode(up ? { uid: -1, cardId: c.id, upgraded: true } : c, { onClick: () => commit(i, { c: c.id }) }));
      }
      body = el('div', { class: 'bless-stage' }, grid);
      text = `${BLESS_NAMES[def.id] ?? def.id}：選一張帶走。`;
      actions = [el('button', { class: 'btn', onclick: () => { choosing = null; render(); } }, '返回')];
    } else {
      const row = el('div', { class: 'shop-row bless-row' });
      offer.forEach((id, i) => {
        const def = blessingById[id];
        if (!def) return;
        const locked = sent || !!took;
        row.append(card(def, { ...(locked ? {} : { onClick: () => choose(i) }), took: took === id, dim: locked && took !== id }));
      });
      const art = artUrl('bg', eventArtKey('bless_bundle', hero));
      body = el('div', { class: 'bless-stage' },
        art.startsWith('data:') ? '' : el('img', { class: 'bless-art', src: art, alt: '' }),
        row, partnerRow());
      text = took || sent ? BLESS_COOP_WAIT.replace('{同伴}', partnerName) : open.narration;
    }
    // 難度 4 起的共用提示（同事件畫面）：賭運氣成功率 ×0.7、掉血 ×1.5，卡面寫的是一般難度的數字
    const risky = offer.some((id) => { const d = blessingById[id]; return !!d && (!!d.dice || d.effects.some((e) => e.kind === 'gamble' || e.kind === 'damage')); });
    const extra: (Node | string)[] = [];
    if (choosing === null && !took && !sent) extra.push(el('p', { class: 'bless-say' }, `${heroName(mine)}：「${open.line}」`));
    if (runMods(run).unlucky && risky && !took) extra.push(el('p', { class: 'event-note' }, '這個難度下，賭運氣的成功機率打七折（例如 50% 只剩 35%）、掉血多一半（卡面寫的是一般難度的數字）'));
    root.append(sceneView({ art: body, speaker: choosing === null && !took && !sent ? '' : heroName(mine), text, extra, actions }));
  }

  if (coop) {
    coop.onRunApplied((applied) => {
      for (const one of applied) {
        if (one.a.t !== 'bless') continue;
        if (one.a.seat === seat) { sent = false; play('relic'); }
        else if (one.a.seat === partnerSeat) {
          const id = partner?.bless?.took;
          if (id) notice(BLESS_COOP_TOOK.replace('{同伴}', partnerName).replace('{名稱}', BLESS_NAMES[id] ?? id));
        }
      }
      if (!anyBlessingPending(run)) { leave(); return; }
      render();
    });
  }
  render();
}

registerScreen('blessing', (app, root) => blessingScreen(app, root));
