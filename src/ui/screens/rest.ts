import { play } from '../audio';
import { cardById } from '../../content/cards';
import { dialogue, pick } from '../../content/dialogue';
import { REVIVE_RATIO, fullPrepAvailable, fullPrepHeal, napHeal, rest, revivePartner } from '../../engine/run';
import type { RunAction } from '../../net/runaction';
import type { CardInstance, RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';
import { showUpgradeConfirm } from '../confirm';
import { showDeckPicker } from '../deckview';
import { toast } from '../dialogue';
import { el } from '../dom';
import { burst } from '../fx';
import { cardNode } from '../cardview';
import { renderHud } from '../hud';
import { sceneView } from '../scene';
import { me } from '../../engine/runplayer';

/** 球球蜷在貓窩旁的立繪；圖還沒生好就不放 */
function heroPortrait(): string | undefined {
  const url = artUrl('sprites', 'hero/ninja_curl');
  return url.startsWith('data:') ? undefined : url;
}

registerScreen('rest', (app, root) => {
  root.append(screenBg(actVariantKey('bg/screen_rest', app.run?.act ?? 1, app.run?.floor)));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  /*
   * 兩個人一起休息（連線版 2026-09-11）。
   *
   * **一人一份**：各自挑自己要打盹還是磨爪，互不影響。多出來的第三個選項是
   * 「扶起倒下的同伴」——扶人的那位**用掉自己這一格的機會**（規則四），
   * 所以一個貓窩要嘛自己回血、要嘛救人，兩個人得商量。
   */
  const seat = app.seat;
  const coop = app.coop;
  if (coop) app.disposers.push(() => coop.attachShop(null));   // 保險：上一格若是商店，這裡一定斷乾淨
  /** 誰做完了。兩個人都做完才一起上樓 */
  const done = new Set<number>();
  const allDone = (): boolean => run.players.every((p, i) => p.down || done.has(i));
  const act = (a: RunAction, local: () => boolean): boolean => (coop ? coop.submitRun(a) : local());
  /** 倒下、等人扶的那一位（沒有就 -1） */
  const fallen = (): number => run.players.findIndex((p) => p.down);

  /**
   * 顯示用的回復量：貓草那類秘寶會加倍，而且不會超過缺的血（算法跟引擎共用）。
   *
   * **每次重畫都要重算**：同伴把我扶起來之後血量變了，用進畫面那一刻（生命 0）算出來的
   * 數字會偏高，按鈕上寫的回復量對不上實際回的（稽核第三輪 低-2）。
   */
  const healNow = (): number => Math.min(me(run, seat).maxHp - me(run, seat).hp, napHeal(run, seat));
  const upgradable = (c: CardInstance): boolean => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病';
  let used = false;   // 一個貓窩只能做一件事
  let napped = 0;     // 打盹按下去那一刻算出來的回復量（動作繞回來才演得到）

  /** 做完事就換成結果版面（按鈕跟著消失），球球吐一句槽，停一下再回地圖 */
  function afterAction(text: string, line: string, card?: CardInstance): void {
    clearKeepBg(root);
    renderHud(app, root);
    // 磨好的牌放大秀出來、打鐵發金光（本來只有一行字，使用者：「不太有回饋感」）
    let art: HTMLElement | '' = '';
    if (card) {
      const node = cardNode(card);
      node.classList.add('showcase-card', 'upgrade', 'forged');
      // 跟事件那邊同一個理由：牌是 `overflow: hidden`，特效要包一層才不會被裁（稽核 2026-09-10 低-1）
      const host = el('span', { class: 'fx-host' }, node);
      art = el('div', { class: 'showcase' }, host);
      window.setTimeout(() => burst(host, 'buff'), 60);
    }
    root.append(sceneView({ art, portrait: heroPortrait(), text: coop && !allDone() ? `${text}（等同伴弄完就一起上樓）` : text }));
    toast(line, '球球');
    // 連線版：兩個人都做完才走，先做完的那位在這裡等（由 onRunApplied 接手）
    if (coop) { if (allDone()) window.setTimeout(() => app.backToMap(), card ? 1500 : 900); return; }
    window.setTimeout(() => app.backToMap(), card ? 1500 : 900);
  }

  function show(): void {
    // 重畫前一定要先清（只留底圖）：`renderHud` 是直接 append，不先清會疊出第二條狀態列
    // 與第二個對白框（稽核 2026-09-11 中-6：對方先做完時看得到）
    clearKeepBg(root);
    renderHud(app, root);
    const finalRest = run.act >= 3 && run.floor === 44;   // 師父前一格：回滿（引擎 napHeal 同一條規則）
    const heal = healNow();   // 每次重畫都重算：被扶起來之後血量變了，寫死的數字會對不上
    const nap = el('button', { class: 'btn primary' }, heal > 0 ? (finalRest ? `打盹（上樓前好好睡一覺：回滿 ${heal} 點生命）` : `打盹（回復 ${heal} 點生命）`) : '打盹（生命已經滿了）');
    nap.addEventListener('click', () => {
      if (used) return;
      napped = heal;   // 送出之前先記下來：連線要等動作繞回來才演，那時血已經回過了
      if (!act({ t: 'rest', seat, c: '打盹' }, () => rest(run, '打盹', undefined, seat))) { napped = 0; return; }
      used = true;
      if (coop) return;   // 連線的等動作繞回來才演（見 onRunApplied）
      play('heal');
      afterAction(`球球睡了一下，回復 ${heal} 點生命。`, pick(dialogue.restNapLines));
    });

    const sharpen = el('button', { class: 'btn' }, '磨爪（升級一張牌，順便回一成血）');
    // rest(run, '磨爪') 沒有 uid 會回 false，所以一定要先挑牌再叫
    /** 開牌堆挑一張。「再看看」要回到這裡重挑，不是退回貓窩再選一次打盹／磨爪（使用者 2026-09-02 回報）。
     *  磨爪與全力準備共用這條，差在結算叫哪個 choice、結束那句話怎麼寫 */
    const pickCard = (choice: '磨爪' | '全力準備' = '磨爪'): void => {
      showDeckPicker({
        title: `${choice}：選一張牌升級`, cards: me(run, seat).deck, pickable: true, cancellable: true, filter: upgradable,
        previewUpgrade: true,
        onPick: (uid) => {
          const c = uid === null ? undefined : me(run, seat).deck.find((x) => x.uid === uid);
          if (uid === null || !c || used) return;   // 按取消才真的回貓窩
          // 先讓玩家看到升級後長什麼樣再決定。按「再看看」就回到牌堆重挑，不算用掉這次機會。
          showUpgradeConfirm(c, (ok) => {
            if (used) return;
            if (!ok) { pickCard(choice); return; }
            const name = cardById[c.cardId]?.name ?? c.cardId;
            const fish = me(run, seat).fish;
            const hpBefore = me(run, seat).hp;
            /*
             * **要在 `act()` 之前存**（稽核 2026-09-11 中-7）。
             * 主機的動作是同步套用的：`onRunApplied` 在 `act()` 裡面就被叫到了，
             * 擺在後面的話那一刻這兩個還是 null，主機會看到「「」磨利了，變成「＋」」。
             */
            pendingCard = c;
            pendingLine = { name, fish, hpBefore, choice };
            if (!act({ t: 'rest', seat, c: choice, u: uid }, () => rest(run, choice, uid, seat))) {
              pendingCard = null; pendingLine = null;   // 沒送出去就收回來，免得下一次用到舊的
              return;
            }
            used = true;
            if (coop) return;
            play('upgrade');
            const line = choice === '全力準備'
              ? `「${name}」磨利了，變成「${name}＋」；${fish} 條小魚乾全吃了，回復 ${me(run, seat).hp - hpBefore} 點生命。`
              : `「${name}」磨利了，變成「${name}＋」。`;
            afterAction(line, pick(dialogue.restSharpenLines), c);
          });
        },
      });
    };
    sharpen.addEventListener('click', () => { if (!used) pickCard(); });
    if (!me(run, seat).deck.some(upgradable)) sharpen.setAttribute('disabled', 'disabled');

    // 全力準備（44F、難度 4 起；玩家 2026-09-08 建議）：升級一張牌＋回一成血，再把全部小魚乾換成生命（÷10）、魚乾歸零。
    // 打盹照舊回滿，這個給「上樓前想升級又想多回一點」的人。血滿或魚乾不到 10 條時跟磨爪沒差，就不擺出來
    let prep: HTMLElement | null = null;
    if (fullPrepAvailable(run) && me(run, seat).fish >= 10 && me(run, seat).hp < me(run, seat).maxHp) {
      const h = fullPrepHeal(run, seat);
      const gain = Math.min(h.total, me(run, seat).maxHp - me(run, seat).hp);
      prep = el('button', { class: 'btn two-line' },
        el('span', {}, '全力準備（升級一張牌）'),
        el('span', { class: 'sub' }, `回 ${gain} 點：一成 ${h.tenth} ＋ ${me(run, seat).fish} 條小魚乾換 ${h.fromFish}${gain < h.total ? '（回到滿）' : ''}，魚乾歸零`));
      prep.addEventListener('click', () => { if (!used) pickCard('全力準備'); });
      if (!me(run, seat).deck.some(upgradable)) prep.setAttribute('disabled', 'disabled');
    }

    /*
     * 扶起倒下的同伴（規則四，使用者 2026-09-11：「打盹可以救回來」）。
     * 扶人的那位這一格就不能睡也不能磨爪了——救人本身要有重量。
     */
    const hurt = fallen();
    const actions = prep ? [nap, sharpen, prep] : [nap, sharpen];
    if (coop && hurt >= 0 && hurt !== seat) {
      const back = Math.max(1, Math.floor((run.players[hurt]?.maxHp ?? 0) * REVIVE_RATIO));
      const lift = el('button', { class: 'btn two-line' },
        el('span', {}, '扶起同伴'),
        el('span', { class: 'sub' }, `他回 ${back} 點生命站起來；你這一格就不能睡也不能磨爪了`));
      lift.addEventListener('click', () => {
        if (used) return;
        if (!act({ t: 'revive', seat, w: hurt }, () => revivePartner(run, hurt))) return;
        used = true;
      });
      actions.unshift(lift);
    }

    /*
     * **自己倒下的時候什麼都不能做**（規則四）。
     *
     * 引擎本來就擋著（`rest` 看到 `down` 直接回 false），可是畫面照樣把
     * 「打盹」「磨爪」兩顆亮著的按鈕擺出來——按下去毫無反應，玩家只會以為當掉了。
     * 倒下的人要看到的是「等同伴來扶」，不是兩顆按不動的鈕。
     */
    if (me(run, seat).down) {
      root.append(sceneView({
        portrait: heroPortrait(),
        speaker: '貓窩',
        text: '球球躺在貓窩旁邊動不了……得等同伴過來扶一把。',
        actions: [],
      }));
      return;
    }

    // 劇場版面：底圖就是貓窩本身，球球蜷在左邊，對白框裡直接放兩個選項
    root.append(sceneView({
      portrait: heroPortrait(),
      speaker: '貓窩',
      text: coop ? '貓窩暖暖的，一人只能挑一件事做。' : '貓窩暖暖的，只能挑一件事做。',
      actions,
    }));
  }

  /** 連線時「磨好的那張牌」要等動作繞回來才演，先存在這裡 */
  let pendingCard: CardInstance | null = null;
  let pendingLine: { name: string; fish: number; hpBefore: number; choice: '磨爪' | '全力準備' } | null = null;

  if (coop) {
    coop.onRunApplied((applied) => {
      let didMine = false;
      for (const one of applied) {
        if (one.a.seat === seat && (one.a.t === 'rest' || one.a.t === 'revive')) didMine = true;
        const a = one.a;
        if (a.t === 'rest' || a.t === 'revive') done.add(a.seat);
        if (a.seat !== seat) continue;
        if (a.t === 'revive') { play('heal'); afterAction('球球把同伴拍醒了，牠搖搖晃晃地站起來。', pick(dialogue.restNapLines)); continue; }
        if (a.t !== 'rest') continue;
        if (a.c === '打盹') { play('heal'); afterAction(`球球睡了一下，回復 ${napped} 點生命。`, pick(dialogue.restNapLines)); continue; }
        play('upgrade');
        const pl = pendingLine;
        const line = pl && pl.choice === '全力準備'
          ? `「${pl.name}」磨利了，變成「${pl.name}＋」；${pl.fish} 條小魚乾全吃了，回復 ${me(run, seat).hp - pl.hpBefore} 點生命。`
          : `「${pl?.name ?? ''}」磨利了，變成「${pl?.name ?? ''}＋」。`;
        afterAction(line, pick(dialogue.restSharpenLines), pendingCard ?? undefined);
      }
      /*
       * **不能用 `used` 判斷要不要重畫**（實測撞到的坑）：主機的動作是同步套用的，
       * 所以這支在 `act()` 裡面就被叫到了，而 `used = true` 是 `act()` **回來之後**才設的——
       * 那一刻 `used` 還是 false，於是又 `show()` 一次，畫面上疊出兩份狀態列與兩份對白框。
       * 改看「這一批裡有沒有我做的事」，那是當下就確定的事實。
       */
      if (didMine) { if (allDone()) window.setTimeout(() => app.backToMap(), 700); return; }
      if (allDone()) { window.setTimeout(() => app.backToMap(), 700); return; }
      show();   // 還沒做的那位：對方扶了誰、按鈕要跟著變
    });
  }

  // 先把貓窩畫出來，14F 塔主戰前那段獨白再蓋上去播（只播一次，旗標在 run.flags，由結算那次存檔帶走）。
  // 反過來先播的話，玩家會對著一片空白的舞台看獨白。
  show();
  // 「floor === 14」在跨關累計後只會中第一關（第二三關是 29、44）——用關內樓層判斷，
  // 獨白內容也依關數換（前兩關的關主不是師父，師父的戲留到第三關）
  if (run.floor % 15 === 14) {
    const monologue = dialogue.restBeforeBossByAct[run.act - 1] ?? dialogue.restBeforeBossByAct[0]!;
    app.playOnce(`restBeforeBoss${run.act}`, monologue, () => { /* 看完就選 */ });
  }
});
