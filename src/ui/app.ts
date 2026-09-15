import { victoryLinesFor, dialogue, lineFor, pick, storyFor, type DialogueLine } from '../content/dialogue';
import { playSlides, slidesReady } from './slides';
import { actClearSlides, endingSlides, prologueSlides } from './storyslides';
import { playVideo, type VideoName } from './video';
import { preloadAct, preloadHeroArt, warmEncounter } from './preload';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { resolvePendingAfterFight, type RunGain } from '../engine/run';
import { enemyById, encounterById } from '../content/enemies';
import { hasBossDoor } from './screenbg';
import type { CoopSession } from '../net/session';
import { nodeById } from '../engine/map';
import { ACTS, beginCombat, chooseNode, currentNode, finishCombat, makeShops, newRun as engineNewRun } from '../engine/run';
import { clearSave, loadRun, recordBest, saveRun } from '../engine/save';
import type { CombatState, RunState } from '../engine/types';
import { type BgmName, setBgm } from './bgm';
import { computeScale, heroSpriteUrls, monsterUrl, setLocalHero } from './assets';
import { setSfxHero } from './audio';
import type { Hero } from '../engine/hero';
import { playDialogue, toast, bubbleAt, heroSpeaker } from './dialogue';
import { clear, el } from './dom';
import { setOverlayRoot } from './overlay';
import { hideTooltip } from './tooltip';
import { me } from '../engine/runplayer';

export type ScreenName = 'title' | 'heroselect' | 'map' | 'combat' | 'reward' | 'event' | 'shop' | 'rest' | 'chest' | 'bossdoor' | 'actclear' | 'result' | 'lobby' | 'debug';
type Renderer = (app: App, root: HTMLElement, props: unknown) => void;

const screens = new Map<ScreenName, Renderer>();
export function registerScreen(name: ScreenName, render: Renderer): void { screens.set(name, render); }


/** 開頭影片照角色挑（`public/video/<檔名>.mp4`）；沒列的角色（鐵爪機關貓）沒有片子，直接進幻燈片 */
const OPENING_CLIP: Partial<Record<Hero, VideoName>> = { ninja: 'opening', feifei: 'opening_feifei' };

export class App {
  run: RunState | null = null;
  cs: CombatState | null = null;
  /** 外框：固定 1280×720，整個等比縮放去貼合視窗 */
  stage: HTMLElement;
  /** 換畫面時要一起拆掉的東西（例如戰鬥畫面掛在 window 上的鍵盤監聽器） */
  disposers: Array<() => void> = [];
  /**
   * 連線用的會話（單機是 null）。
   *
   * **掛在 app 而不是傳給每個畫面**：整局裡會換好幾次畫面（地圖→戰鬥→獎勵→地圖），
   * 每換一次都重新傳一份很容易漏掉一個，而漏掉的那個畫面就會靜靜變成單機——
   * 自己動了、對面不知道，等到下一次對帳才發現分岔。
   */
  coop: CoopSession | null = null;
  /** 我是第幾位（單機永遠 0） */
  seat = 0;
  /**
   * 現在這一局是除錯模式「跳進畫面」開的**臨時局**（2026-09-14 夜間稽核 高-1）。
   *
   * 跳進貓窩／紙箱／罐頭鋪之後照畫面按「打盹」「繼續」「離開」，那三個畫面收尾都走 `backToMap()`，
   * 而它第一件事是 `save()`——臨時局（種子 `debug`、0F、難度 1）就把玩家真正的續玩存檔蓋掉了。
   * 探針實測：23F 的菲菲存檔讀回來變成 0F 的 debug 局。存檔只有一格，沒有備份。
   *
   * 有這個旗標時：不存檔、`backToMap()` 改成回除錯頁、Esc 也回除錯頁。
   * Esc 監聽掛在 App 上只掛一次、每次看旗標——原本掛在 window 上等按 Esc 才自己拆，
   * 走別的路離開就永遠留著，之後玩真正的一局按 Esc 關圖鑑會被踢回除錯畫面。
   */
  sandbox = false;
  /** 畫面層：每次 show() 就整個清空重畫，畫面渲染函式拿到的 root 就是它 */
  screen: HTMLElement;
  /** 疊層：吐槽、對白、名詞提示、牌組視窗住這裡，換畫面時不會被清掉 */
  overlay: HTMLElement;

  constructor(root: HTMLElement) {
    this.screen = el('div', { id: 'screen' });
    this.overlay = el('div', { id: 'overlay' });
    this.stage = el('div', { id: 'stage' }, this.screen, this.overlay);
    root.append(this.stage);
    setOverlayRoot(this.overlay);
    // 手機直立時的提示（舞台是橫的 16:9，直著看只剩一條），放在舞台外面、不隨舞台縮放
    const hint = el('div', { id: 'rotate-hint' }, el('div', { class: 'rotate-card' }, el('div', { class: 'rotate-icon' }, '📱↻'), el('div', {}, '請把手機橫過來玩'), el('small', {}, '這款遊戲是橫向畫面')));
    root.append(hint);
    // 偵測是什麼裝置（粗指標＝觸控）跟現在直的還是橫的，寫在 <html> 上給樣式表用；
    // 縮放一律「等比貼合視窗」，手機用 visualViewport 才算得到扣掉網址列後的真實高度
    const fit = (): void => {
      const vv = window.visualViewport;
      const w = vv?.width ?? window.innerWidth, h = vv?.height ?? window.innerHeight;
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const shortSide = Math.min(window.screen.width, window.screen.height);
      const device = coarse ? (shortSide < 600 ? 'phone' : 'tablet') : 'desktop';
      const html = document.documentElement;
      html.dataset['device'] = device;
      html.dataset['orient'] = h > w ? 'portrait' : 'landscape';
      this.stage.style.transform = `scale(${computeScale(w, h)})`;
    };
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => window.setTimeout(fit, 80));
    fit();
    // 除錯模式的臨時局按 Esc 回除錯頁（見 `sandbox`）。只掛這一次、看旗標，不會殘留到正式的一局
    // 疊層開著（牌組、移除牌、對白）時先讓 Esc 關疊層：直接換畫面的話疊層留在除錯頁上、畫面還被鎖住（夜間審查 低-7）
    window.addEventListener('keydown', (ev) => {
      if (this.sandbox && ev.key === 'Escape' && !this.overlay.querySelector('.modal-overlay, .dialogue-overlay')) this.exitSandbox();
    });
  }

  /** 從除錯模式的臨時局回到除錯頁：臨時局整個丟掉，不存、不留 */
  exitSandbox(): void {
    this.sandbox = false;
    this.run = null;
    this.cs = null;
    this.show('debug');
  }

  /**
   * 換畫面。**只清畫面層**：疊層留著，所以戰鬥畫面每動一次就重畫也不會把吐槽掃掉、
   * 播到一半的對白也不會被拔走（拔走的話它的 onDone 永遠不會叫，流程會靜靜卡死）。
   */
  /** 這個畫面配哪首曲子。戰鬥另外處理（要分一般戰／關主戰，見 startFight） */
  private bgmFor(name: ScreenName): BgmName | null {
    const act = this.run?.act ?? 1;
    const actTrack = (['act1', 'act2', 'act3'] as const)[Math.min(3, Math.max(1, act)) - 1]!;
    switch (name) {
      // 結算分輸贏：贏放通關曲、輸放陣亡曲——原本共用休閒曲，剛死掉卻放輕鬆的曲子，調性不對
      case 'result': return this.run?.status === 'won' ? 'ending' : this.run?.status === 'lost' ? 'defeat' : 'leisure';
      case 'title': return 'leisure';
      case 'map': case 'event': case 'chest': case 'bossdoor': case 'actclear': case 'reward': return actTrack;
      case 'shop': return 'shop';
      case 'rest': return 'rest';
      default: return null;   // combat 在 startFight 裡自己設
    }
  }

  show(name: ScreenName, props: unknown = {}, opts: { quiet?: boolean } = {}): void {
    const r = screens.get(name);
    if (!r) throw new Error(`畫面尚未登記：${name}`);
    const track = this.bgmFor(name);
    if (track) setBgm(track);
    hideTooltip();   // 提示框的錨點就要被清掉了，不先關掉會變成孤兒黏在畫面上
    // 連線的畫面級回呼也要一起斷：不斷的話新畫面會叫到上一格留下來的處理函式
    //（見 `CoopSession.clearScreenHooks`）。新畫面自己會在下面的 `r(...)` 裡重新掛
    this.coop?.clearScreenHooks(name);
    for (const d of this.disposers.splice(0)) d();
    clear(this.screen);
    this.stage.dataset['screen'] = name;
    // 也標上關數：同一個畫面在不同關換底圖時（貓窩的蒲團位置各關不同），樣式表用它換版面
    this.stage.dataset['act'] = String(this.run?.act ?? 1);
    /*
     * 再標上**這一局玩的是誰**（2026-09-14）。
     *
     * 貓窩畫面裡角色坐哪是按關數寫死的 CSS，而**兩隻的立繪大小不一樣**：
     * 球球的蜷縮是小小一團，菲菲整個大一圈。同一個座標，他剛好坐進籃子、
     * 她會滿出來坐到地板上（使用者 2026-09-14 實機看到「她位置完全不對」）。
     * 有了這個屬性，樣式表就能只調她那一條，不動到本來就對的球球。
     */
    this.stage.dataset['hero'] = this.run ? (me(this.run, this.seat).hero ?? 'ninja') : 'ninja';
    r(this, this.screen, props);
    // 換畫面淡一下。用 animate() 不用 CSS 類別：元素本身永遠是最終樣子，
    // 動畫被節流或中斷也不會卡在半透明。戰鬥中的重畫不走這裡（那是直接改 screen 的內容），
    // 所以出一張牌不會整個畫面閃一次。
    // `quiet`：同一頁只因為同伴投了一票而重畫（連線版的獎勵、事件、地圖），不再淡入一次——
    // 不然每投一票整頁閃一下（使用者 2026-09-15：「每次選完牌另一個玩家畫面都會閃一下」）
    if (!opts.quiet && typeof this.screen.animate === 'function') {
      this.screen.animate([{ opacity: 0, transform: 'scale(.988)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: 'ease-out' });
    }
  }

  /** `hero`＝選角畫面挑的那一位（2026-09-12）。沒填就是球球，舊的呼叫端不用改 */
  newRun(seed?: string, difficulty = 1, hero: Hero = 'ninja'): void {
    // 「新的一局」一定是單機，**先把上一場連線的殘留清掉**（見 `leaveCoop`）
    this.leaveCoop();
    this.sandbox = false;
    this.run = engineNewRun(seed && seed.trim() ? seed.trim() : `${Date.now()}`, difficulty, hero);
    this.cs = null;
    // 對白、過關轉場那些單人畫面靠這個知道要畫誰（見 assets.ts 的 `setLocalHero`）
    setLocalHero(hero);
    setSfxHero(hero);   // 貓叫也照角色換（菲菲的受傷、勝利）
    void preloadHeroArt([hero]);   // 這一位專屬的圖開場沒載，現在補（總稽核 F 中-1）
    // 序章播完存一次：此時 currentNode 還是 null，存的是乾淨的開局狀態，「續玩」從一開局就能用
    /*
     * 序章幻燈片：四張劇情圖配台詞；圖還沒裝（舊快取）就退回純文字對白。
     *
     * **每個角色各有一整套**（2026-09-12）：同一座塔，另一隻貓的理由——
     * 球球是「我要把師父帶回家」，菲菲是「師父跟師兄都沒回來」。
     * 圖也各生一套（`feifei_still_*`），只有這四張非換不可：其餘場景（塔、魔物、忍具）共用。
     */
    const pro = storyFor(hero).prologue;
    const proSlides = prologueSlides(hero);   // 圖配哪幾句見 storyslides.ts（除錯頁也叫同一支）
    const after = (): void => { this.save(); this.show('map'); };
    if (this.run && !this.run.flags['prologue']) {
      this.run.flags['prologue'] = true;   // 旗標規矩同 playOnce：不在這裡存檔
      // 開頭影片先播（照角色挑檔名，沒檔就直接略過），再接序章幻燈片
      /*
       * 每個角色只能看自己的片子（2026-09-12 實測到）：球球那支從頭到尾是他，
       * 換成菲菲卻照播，等於一開場就先看別人的故事，後面四張幻燈片再講她的，接不起來。
       * 沒片子的角色直接進幻燈片——寧可少一段，不要放錯的那一段。
       */
      // 沒片子的角色要自己切曲（稽核 中-1）：換成第一關曲原本是影片收尾（`video.ts` 的 `end()`）順手做的，
      // 跳過影片就沒人切，序章整段會配著標題畫面的輕鬆曲
      const clip = OPENING_CLIP[hero];
      const intro = (go: () => void): void => (clip ? playVideo(clip, go) : (setBgm('act1'), go()));
      intro(() => {
        if (slidesReady(proSlides)) playSlides(proSlides, after);
        else playDialogue(pro, after);
      });
    } else after();
  }

  /** `from` 給了就用它接著打（貼進來的局面碼走這條），沒給就讀瀏覽器裡的存檔 */
  continueRun(from?: RunState): boolean {
    this.leaveCoop();   // 續玩讀的是單機存檔，同理（見 `leaveCoop`）
    this.sandbox = false;
    const run = from ?? loadRun();
    if (!run) return false;
    this.run = run;
    this.cs = null;
    setLocalHero(me(run, this.seat).hero);   // 讀檔續玩也要換回那一局的角色
    setSfxHero(me(run, this.seat).hero);
    void preloadHeroArt(run.players.map((p) => p.hero));   // 那一局角色專屬的圖（總稽核 F 中-1）
    void preloadAct(run.act, run.players[0]?.hero);   // 讀檔續玩在二三關的，開場只預載了第一關（稽核 2026-09-04 中 4）
    // 舊存檔的殘局：人站在塔主節點、旗標已標最終戰——地圖上沒有下一格可點，直接開最終戰（審查 #3）。
    // 這個旗標原本由難度 5 的影球球前哨戰設定，2026-09-07 已拿掉；留著這條是為了讓當時存的檔還能接回師父戰
    const node = currentNode(run);
    if (node?.type === '塔主' && node.encounterId && run.flags['final_boss'] && run.status === 'playing') {
      // 這條**刻意不補關主門**（稽核 2026-09-10 低-2）：`final_boss` 這個旗標全專案只有這裡讀、
      // 沒有任何地方寫（2026-09-07 拿掉了），只有那之前存的檔才走得到。為一條走不到的舊路加過場沒有意義，
      // 而且那是「重整後接回殘局」的情境，玩家已經看過門了，再演一次反而怪
      this.startFight(node.encounterId, true);
      return true;
    }
    this.show('map');
    return true;
  }

  /**
   * 存檔時機鐵則：**只有一個節點結算完才可以呼叫**——實際上就是 backToMap()（戰鬥的獎勵挑完、
   * 事件／罐頭鋪／貓窩／紙箱收尾都走它），再加上開局那一次（見 newRun）。
   * 規格 §3：「每離開一個節點就自動存檔」「戰鬥中途關掉，下次從該場戰鬥開頭重打」。
   *
   * 進節點時、戰鬥進行中、播對白時**一律不要存**。進節點就存的話，chooseNode() 已經把
   * currentNode 推到新節點、但那個節點的內容還沒消化，重整回來就會整個跳過它（白吃一場戰鬥
   * 或一個紙箱）。不存反而自洽：run.rng 沒被推進，重進去的罐頭鋪存貨、紙箱秘寶都一模一樣。
   */
  /*
   * **連線局一個字都不寫進存檔**（2026-09-12 稽核 高-2）。
   *
   * 存檔鍵是按建置分的（見 `save.ts`），但**同一份建置裡單機與連線共用同一把鑰匙**。
   * 原本 `save()` 不看 `coop`，於是連線的每一格結算都把兩人局寫進單機那一格：
   * 你單機打到 30F 存著、跟朋友連一場，回來按「續玩」載到的是兩人局——
   * 驗證還過得了（`checkRun` 只要求至少一位），魔物血量照兩人放大 1.5 倍，
   * 第二位站在場上不會動還會被打。收尾時又會把成績記進單機的最佳成績、
   * 並且 `clearSave()` 把單機存檔直接刪掉。
   *
   * 連線本來就沒有「續玩」（斷線就重開），所以直接不存最乾淨。
   */
  save(): void {
    if (this.coop || this.sandbox) return;   // 除錯的臨時局也一個字都不寫（見 `sandbox`）
    if (this.run && this.run.status === 'playing') saveRun(this.run);
  }

  /**
   * 離開連線：把 `coop` 與 `seat` 清回單機的樣子（2026-09-12 稽核 高-1）。
   *
   * 全專案每個畫面都拿 `app.coop` 當「現在是不是連線」的唯一判準，而原本
   * **沒有任何一行把它設回 null**。連線打完一局→回標題→新的一局（單機），
   * `app.coop` 還指著那個已經斷掉的會話：地圖上點任何一格走的是 `coop.pick()`，
   * 而那支第一行就 `if (this.dead) return false`——畫面一動也不動，只能重新整理。
   * 當過座位 1 的更慘，`me(run, 1)` 會丟「這一局沒有第 1 個座位」。
   */
  leaveCoop(): void {
    this.coop?.leave();   // 跟中繼說一聲、關掉線路，對方立刻看到「對方離開了」；不關的話舊線還在跑心跳、對方永遠等不到（審查 2026-09-15 中-1）
    this.coop = null; this.seat = 0;
    // 連線出問題時大廳壓在頁面最上緣的紅色橫幅（`lobby.ts` 的 `troubleBanner`）沒有人會拿掉，
    // 回標題開單機它還在（總稽核 B 中-1）。離開連線就撕掉。
    document.querySelectorAll('.net-trouble, .net-link').forEach((n) => n.remove());
  }

  /**
   * 節點結算完的收尾：存檔再回地圖。事件、罐頭鋪、貓窩、紙箱、戰鬥的獎勵挑完牌都走這裡，
   * 也是遊戲進行中唯一的存檔點。只播一次的劇情旗標寫在 run.flags 裡、不自己存檔，
   * 就是靠這一次存檔帶走。
   */
  backToMap(): void {
    if (this.sandbox) { this.exitSandbox(); return; }   // 除錯臨時局收尾回除錯頁，不存檔（見 `sandbox`）
    this.save(); this.show('map');
  }

  /**
   * 只播一次的劇情：旗標寫在 run.flags 裡，但**不在這裡存檔**——旗標由下一次節點結算的存檔帶走。
   * 中途重整最多重播一句初見台詞，無害。之後的 firstElite、secretScroll 也走這個。
   */
  playOnce(flag: string, lines: DialogueLine[], onDone: () => void): void {
    const run = this.run;
    if (!run || run.flags[flag]) { onDone(); return; }
    run.flags[flag] = true;
    playDialogue(lines, onDone);
  }

  enterNode(nodeId: string): void {
    const run = this.run;
    if (!run) return;
    const node = chooseNode(run, nodeId);
    /*
     * 走進一格的當下對一次整局的帳（連線版 2026-09-11）。
     *
     * 戰鬥外本來完全沒有對帳點，所以地圖、商店、事件裡的分岔會拖到下一場戰鬥才炸開，
     * 而那時的錯誤訊息指著戰鬥，真正的病根在好幾十秒之前的另一個畫面。
     * 實測撞到的就是這種：兩個人投完票各自走進不一樣的節點，兩邊畫面都很正常。
     *
     * 擺在 `chooseNode` **之後**：那一支會把 `currentNode` 推到新的一格，
     * 對的就是「我們是不是真的走到同一格」——這正是要盯的那件事。
     */
    this.coop?.syncRun(run, nodeId);
    // 這裡不存檔（見 save() 的註解）：節點結算完才存，重整就回到上一個結算過的節點重選。
    // 曾經在這裡插過一秒的走路過場（參考《Take Me To The Dungeon!!》），
    // 實際玩起來每一場都要等、很卡節奏，拆掉了；換場的感覺交給畫面淡入就好
    switch (node.type) {
      case '戰鬥': case '大魔物': case '塔主':
        if (!node.encounterId) break;
        // 關主戰前先擋一扇門（使用者 2026-09-10：「讓玩家有種必須得打開門、打過這隻 BOSS 才能往上」）。
        // 門還沒生好就跳過，直接開打——不要為了一張圖把關主戰卡住
        if (node.type === '塔主' && hasBossDoor(run.act)) this.show('bossdoor', { encounterId: node.encounterId });
        else this.startFight(node.encounterId, node.type === '塔主');
        break;
      case '事件': this.show('event', { eventId: node.eventId }); break;
      case '罐頭鋪': {
        // 各逛各的（使用者 2026-09-15）：貨架在走進來的當下就抽好、先掛到會話上，再開畫面。
        // 同伴比我早一步進店買東西，那一則到的時候貨架已經在了（審查 2026-09-15 投票 低-3）
        const shops = makeShops(run);
        this.coop?.attachShop(shops);
        this.show('shop', { shops });
        break;
      }
      case '貓窩': this.show('rest'); break;
      case '紙箱': this.show('chest'); break;
    }
  }

  /** 開打前暖機那一小段時間的重入鎖：擋住連點「開打」或再點地圖（稽核 2026-09-04 中 7） */
  private fightPending = false;

  startFight(encounterId: string, isBoss = false, bonusFish = 0, bonusUpgrades = 0): void {
    const run = this.run;
    if (!run || this.fightPending) return;
    // 戰鬥配樂分四級：影球球鏡像戰＞最終戰（第三關關主）＞一般關主＞精英，其餘出征曲
    const pool = encounterById[encounterId]?.pool;
    const battleTrack = (['battle', 'battle2', 'battle3'] as const)[Math.min(3, Math.max(1, run.act)) - 1]!;
    setBgm(encounterId.startsWith('shadow_cat') || encounterId.startsWith('mirror_duel') ? 'shadow'
      : isBoss ? (run.act >= ACTS ? 'finalboss' : 'boss')
        : pool === '大魔物' ? 'elite' : battleTrack);
    const go = (): void => {
      this.cs = beginCombat(run, encounterId);
      const cs = this.cs;
      const firstNew = (encounterById[encounterId]?.enemies ?? []).find((id) => !run.flags[`seen:${id}`]);
      // 開打前先把這場魔物（含召喚物）的立繪解碼好，最多等 1.5 秒；沒等到也照開（使用者 2026-09-04：「戰鬥中圖要直接到位，不然會有灰影」）
      this.fightPending = true;
      this.stage.classList.add('fight-pending');
      const proceed = (): void => {
      this.fightPending = false;
      this.stage.classList.remove('fight-pending');
      if (this.cs !== cs) return;
      this.show('combat', { bonusFish, bonusUpgrades });
      // 魔物的開場台詞從頭上冒泡泡（一隻接一隻），左上角的紀錄照舊保留當備查
      window.setTimeout(() => {
        if (this.cs !== cs) return;
        cs.enemies.filter((e) => !e.dead && enemyById[e.enemyId]?.line).forEach((e, i) => {
          window.setTimeout(() => {
            if (this.cs !== cs) return;
            const sprite = this.screen.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite`);
            if (!sprite) return;
            // 舞台的框在**要用的那一刻**才量：泡泡最晚會在 1.8 秒後才冒出來，
            // 中途改視窗大小的話，開頭量好的倍率就對不上了（跟指引箭頭同一個坑，稽核 2026-09-10 中-3）
            const stage = this.stage.getBoundingClientRect();
            const k = stage.width > 0 ? 1280 / stage.width : 1;
            const r = sprite.getBoundingClientRect();
            bubbleAt(e.line ?? enemyById[e.enemyId]?.line ?? '', e.name, (r.left + r.width / 2 - stage.left) * k, (r.top - stage.top) * k + 16);
          }, i * 420);
        });
      }, 500);
      const mine = me(run, this.seat);
      if (firstNew) {
        run.flags[`seen:${firstNew}`] = true;   // 不存檔：戰鬥中不存，旗標由獎勵挑完那次存檔帶走
        toast(storyFor(mine.hero).firstMeet[firstNew] ?? '', heroSpeaker());
      } else {
        toast(pick(storyFor(mine.hero).battleStart), heroSpeaker());
      }
      };
      void warmEncounter(encounterId, 1500, heroSpriteUrls(run.players.map((p) => p.hero)), run.players[0]?.hero).then(proceed, proceed);
    };
    if (isBoss) {
      // 關主開場依「這隻關主是誰」挑：師父的戲只在第三關的 tower_master 身上。
      // 波斯大小姐那場的第一隻是執事貓，所以要挑「塔主池」的那隻當本人。
      const ids = encounterById[encounterId]?.enemies ?? [];
      const bossId = ids.find((id) => enemyById[id]?.pool === '塔主') ?? ids[0] ?? '';
      const bd = enemyById[bossId];
      const cast = bd && bossId !== 'tower_master'
        ? { 塔主: { name: bd.name, portrait: monsterUrl(bd.art, 'idle') } }
        : undefined;   // 師父維持「塔主」木牌與大俠貓立繪
      playDialogue(dialogue.bossIntroById[bossId] ?? dialogue.bossIntroGeneric, go, cast);
    } else go();
  }

  /**
   * 一場戰鬥收尾。**只有戰鬥已經分出勝負才可以叫**（`finishCombat` 對還在打的戰鬥會丟例外）。
   * **這裡不存檔**：finishCombat 已經把小魚乾、秘寶、忍具寫進 run，但三選一的牌還沒挑，
   * 這時候存下去、玩家在獎勵畫面重整，那張牌就無聲無息地不見了。規格 §3 說離開節點才存，
   * 而戰鬥節點要等獎勵拿完才算離開，所以存檔交給獎勵畫面收尾的 backToMap()。
   * 輸掉與打贏塔主不經過獎勵畫面，那兩條路改成當場清存檔（見下面那行的說明）。
   */
  afterCombat(bonusFish = 0, bonusUpgrades = 0): void {
    const run = this.run;
    const cs = this.cs;
    if (!run || !cs) { this.show('title'); return; }
    const rewards = finishCombat(run, cs, bonusFish);
    this.cs = null;
    // 事件「要打一場」附帶的獎勵：打贏才發、輸了清掉（使用者 2026-09-04：秘寶不該還沒打就到手）
    const afterNotes: string[] = []; const afterGains: RunGain[] = [];
    resolvePendingAfterFight(run, cs.phase === 'won', afterNotes, afterGains, this.seat);
    const afterToasts = [
      ...afterGains.map((g) => g.kind === '秘寶' ? `打贏了，拿到秘寶「${relicById[g.id]?.name ?? g.id}」` : g.missed ? `打贏了，可是忍具帶滿了，「${potionById[g.id]?.name ?? g.id}」收不下` : `打贏了，拿到忍具「${potionById[g.id]?.name ?? g.id}」`),
      ...afterNotes.map((n) => `打贏了，${n}`),
    ];
    // 整局結束（陣亡或通關）就**當場定案**，不等結算畫面。
    // 從這裡到結算畫面之間隔著 1300 毫秒的交棒，陣亡還要多播一段玩家自己點過去的對白；
    // 要是等結算畫面才清，玩家在這段空窗關掉分頁再按「續玩」，就會退回這場戰鬥之前重打
    // ＝免費復活。打贏塔主同理，可以退回去重打塔主刷更好的牌組。死了就是死了，當場清掉。
    // 成績也在**同一個時間點**記下來。原本只有結算畫面會記，但存檔是在這裡清的，
    // 中間隔著交棒動畫、陣亡還要玩家自己點完一段對白；玩家在那段空窗關掉分頁，
    // 存檔沒了、成績也沒記＝這一局徹底蒸發。清存檔跟記成績本來就該綁在一起。
    // 結算畫面那兩行留著（它要拿回傳值排版），變成無害的第二次呼叫：
    // 同一局算出同一筆，recordBest 比較後保留舊的；clearSave 只是 removeItem。
    // 其餘存檔時機一律不動：進行中的一局仍然只有 backToMap() 會寫。
    // **連線局不記成績、也不准刪單機的存檔**（2026-09-12 稽核 高-2）：
    // 兩人局的成績寫進單機的最佳成績本來就不對，而 `clearSave()` 會把你單機打到一半的那局刪掉
    if (run.status !== 'playing' && !this.coop) { recordBest(run); clearSave(); }
    if (!rewards) { playDialogue(storyFor(me(this.run!, this.seat).hero).defeat, () => this.show('result')); return; }
    if (rewards.kind === '塔主') {
      // 第三關的關主倒下才是通關；前兩關的關主打完走過場對白 → 過關畫面（回滿血、挑秘寶、進下一關）。
      // 過關那條路 status 還是 playing，存檔規矩跟一般獎勵一樣：等過關畫面收尾的 backToMap() 才寫。
      if (run.status === 'won') {
        // 通關結局幻燈片：相擁、回家路；圖沒到就退回對白
        // 師父醒來的第一句依這一路的打法換（爪力／隱身或毒／蜷縮流，第二派看角色），難度 4 以上多一句旁白（使用者 2026-09-04）
        const vic = victoryLinesFor(me(run, this.seat).deck.map((c) => c.cardId), run.difficulty ?? 1, me(run, this.seat).hero);
        // 圖依角色、切點看 `slideBreak`：理由都寫在 storyslides.ts（除錯頁也叫同一支）
        const endSlides = endingSlides(me(run, this.seat).hero, me(run, this.seat).deck.map((c) => c.cardId), run.difficulty ?? 1);
        /*
         * 使用者自製的結尾影片先播（沒檔就直接略過），再接結局幻燈片。
         *
         * **只有球球有片子**（2026-09-14 使用者：「菲菲打完師傅後還是出現球球的動畫，
         * 菲菲過關的話動畫得先移除，等以後做好再補上」）。
         * 那支片子從頭到尾是他的故事，玩菲菲打完師父卻放他的過場，比沒有過場更糟。
         * 跟開場影片同一個判斷（見上面的 `intro`）——那邊早就擋了，這邊漏掉。
         * 以後生了她的片子，把這條改成照角色挑檔名就好。
         */
        // 沒片子時自己切到結局曲（稽核 中-1）：原本靠影片收尾切，9/14 拿掉她的影片之後，
        // 整段結局幻燈片一直配著最終戰的戰鬥曲，點完進結算畫面才換
        const endVideo = (go: () => void): void => ((me(run, this.seat).hero ?? 'ninja') === 'ninja' ? playVideo('ending', go) : (setBgm('ending'), go()));
        endVideo(() => {
          if (slidesReady(endSlides)) playSlides(endSlides, () => this.show('result'));
          else playDialogue(vic, () => this.show('result'));
        });
        return;
      }
      // 過關過場也走插圖幻燈片（使用者 2026-09-02：「開頭跟結尾的投影片過場很棒，希望每個關卡關主都有」）：
      // 三句台詞配三張圖——樓梯露出來、小魚乾只找回一半、爬上塔中／魔物化煙、師父的聲音、月光下的最後一段樓梯。
      // 圖還沒生好（舊快取）就退回純文字對白，跟序章同一套規矩。
      const story = storyFor(me(run, this.seat).hero);
      const lines = run.act === 1 ? story.actClear1 : story.actClear2;
      // 圖依角色（2026-09-12）：球球在這六張裡都是主角，而她的過關台詞講的是別的事，配他的圖整個對不起來
      const actSlides = actClearSlides(me(run, this.seat).hero, run.act);
      // 關主留下的信物（塔主令牌）帶進過關畫面先亮一次（使用者 2026-09-03：獲得令牌一直沒看到呈現）
      const bossRelic = rewards.relic;
      const toSlides = (): void => {
        if (slidesReady(actSlides)) playSlides(actSlides, () => this.show('actclear', { bossRelic }));
        else playDialogue(lines, () => this.show('actclear', { bossRelic }));
      };
      // 關主倒下後先演牠的收場（被控制的清醒道謝、自願的嘴硬、路過的讓路），再接過關幻燈片（使用者 2026-09-04）
      const ids = encounterById[cs.encounterId]?.enemies ?? [];
      const bossId = ids.find((id) => enemyById[id]?.pool === '塔主') ?? '';
      const outro = dialogue.bossDefeatById[bossId];
      const bd = enemyById[bossId];
      const bossUnit = cs.enemies.find((e) => e.enemyId === bossId);
      if (outro && bd) playDialogue(outro, toSlides, { 塔主: { name: bossUnit?.name ?? bd.name, portrait: monsterUrl(bd.art, 'idle') } });   // 名牌用戰場上的名字（含「暴怒的」前綴，稽核 2026-09-04 中 9）
      else toSlides();
      return;
    }
    // 事件獎金已經加進 run.fish，但戰利品與獎金要分兩行顯示，所以一起帶給獎勵畫面
    const go = (): void => { this.show('reward', { ...rewards, bonusFish, bonusUpgrades }); afterToasts.forEach((t, i) => window.setTimeout(() => toast(t, heroSpeaker()), 400 + i * 1400)); };
    // 「上面那位不是你認識的那隻貓了」是黑貓忍者頭目的台詞，只在打倒他之後演；
    // 其他精英（掃地機器人王、三花貓武僧……）打完不該冒出黑貓頭目的臉講話（使用者 2026-09-02 回報）
    const beatNinjaBoss = (encounterById[cs.encounterId]?.enemies ?? []).includes('ninja_boss');
    if (rewards.kind === '大魔物' && beatNinjaBoss) this.playOnce('firstElite', dialogue.afterFirstElite, go);
    else go();
  }

  nodeTitle(nodeId: string): string {
    const run = this.run;
    if (!run) return '';
    const n = nodeById(run.map, nodeId);
    if (n.encounterId) return (encounterById[n.encounterId]?.enemies ?? []).map((id) => enemyById[id]?.name ?? id).join('、');
    return n.type;
  }
}
