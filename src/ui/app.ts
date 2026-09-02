import { dialogue, type DialogueLine } from '../content/dialogue';
import { playSlides, slidesReady } from './slides';
import { playVideo } from './video';
import { enemyById, encounterById } from '../content/enemies';
import { nodeById } from '../engine/map';
import { ACTS, beginCombat, chooseNode, finishCombat, newRun as engineNewRun } from '../engine/run';
import { clearSave, loadRun, recordBest, saveRun } from '../engine/save';
import type { CombatState, RunState } from '../engine/types';
import { type BgmName, setBgm } from './bgm';
import { computeScale, monsterUrl } from './assets';
import { playDialogue, toast } from './dialogue';
import { clear, el } from './dom';
import { setOverlayRoot } from './overlay';
import { hideTooltip } from './tooltip';

export type ScreenName = 'title' | 'map' | 'combat' | 'reward' | 'event' | 'shop' | 'rest' | 'chest' | 'actclear' | 'result';
type Renderer = (app: App, root: HTMLElement, props: unknown) => void;

const screens = new Map<ScreenName, Renderer>();
export function registerScreen(name: ScreenName, render: Renderer): void { screens.set(name, render); }

export class App {
  run: RunState | null = null;
  cs: CombatState | null = null;
  /** 外框：固定 1280×720，整個等比縮放去貼合視窗 */
  stage: HTMLElement;
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
    const fit = (): void => {
      this.stage.style.transform = `scale(${computeScale(window.innerWidth, window.innerHeight)})`;
    };
    window.addEventListener('resize', fit);
    fit();
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
      case 'map': case 'event': case 'chest': case 'actclear': case 'reward': return actTrack;
      case 'shop': return 'shop';
      case 'rest': return 'rest';
      default: return null;   // combat 在 startFight 裡自己設
    }
  }

  show(name: ScreenName, props: unknown = {}): void {
    const r = screens.get(name);
    if (!r) throw new Error(`畫面尚未登記：${name}`);
    const track = this.bgmFor(name);
    if (track) setBgm(track);
    hideTooltip();   // 提示框的錨點就要被清掉了，不先關掉會變成孤兒黏在畫面上
    clear(this.screen);
    this.stage.dataset['screen'] = name;
    r(this, this.screen, props);
    // 換畫面淡一下。用 animate() 不用 CSS 類別：元素本身永遠是最終樣子，
    // 動畫被節流或中斷也不會卡在半透明。戰鬥中的重畫不走這裡（那是直接改 screen 的內容），
    // 所以出一張牌不會整個畫面閃一次。
    if (typeof this.screen.animate === 'function') {
      this.screen.animate([{ opacity: 0, transform: 'scale(.988)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: 'ease-out' });
    }
  }

  newRun(seed?: string): void {
    this.run = engineNewRun(seed && seed.trim() ? seed.trim() : `${Date.now()}`);
    this.cs = null;
    // 序章播完存一次：此時 currentNode 還是 null，存的是乾淨的開局狀態，「續玩」從一開局就能用
    // 序章幻燈片：四張劇情圖配台詞；圖還沒裝（舊快取）就退回純文字對白
    const proSlides = [
      { img: 'bg/still_teach', lines: dialogue.prologue.slice(0, 1) },
      { img: 'bg/still_corrupt', lines: dialogue.prologue.slice(1, 2) },
      { img: 'bg/still_rush', lines: dialogue.prologue.slice(2, 3) },
      { img: 'bg/still_depart', lines: dialogue.prologue.slice(3) },
    ];
    const after = (): void => { this.save(); this.show('map'); };
    if (this.run && !this.run.flags['prologue']) {
      this.run.flags['prologue'] = true;   // 旗標規矩同 playOnce：不在這裡存檔
      // 使用者自製的開頭影片先播（沒檔就直接略過），再接序章幻燈片
      playVideo('opening', () => {
        if (slidesReady(proSlides)) playSlides(proSlides, after);
        else playDialogue(dialogue.prologue, after);
      });
    } else after();
  }

  continueRun(): boolean {
    const run = loadRun();
    if (!run) return false;
    this.run = run;
    this.cs = null;
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
  save(): void { if (this.run && this.run.status === 'playing') saveRun(this.run); }

  /**
   * 節點結算完的收尾：存檔再回地圖。事件、罐頭鋪、貓窩、紙箱、戰鬥的獎勵挑完牌都走這裡，
   * 也是遊戲進行中唯一的存檔點。只播一次的劇情旗標寫在 run.flags 裡、不自己存檔，
   * 就是靠這一次存檔帶走。
   */
  backToMap(): void { this.save(); this.show('map'); }

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
    // 這裡不存檔（見 save() 的註解）：節點結算完才存，重整就回到上一個結算過的節點重選。
    // 曾經在這裡插過一秒的走路過場（參考《Take Me To The Dungeon!!》），
    // 實際玩起來每一場都要等、很卡節奏，拆掉了；換場的感覺交給畫面淡入就好
    switch (node.type) {
      case '戰鬥': case '大魔物': case '塔主':
        if (node.encounterId) this.startFight(node.encounterId, node.type === '塔主');
        break;
      case '事件': this.show('event', { eventId: node.eventId }); break;
      case '罐頭鋪': this.show('shop'); break;
      case '貓窩': this.show('rest'); break;
      case '紙箱': this.show('chest'); break;
    }
  }

  startFight(encounterId: string, isBoss = false, bonusFish = 0): void {
    const run = this.run;
    if (!run) return;
    // 戰鬥配樂分四級：影球球鏡像戰＞最終戰（第三關關主）＞一般關主＞精英，其餘出征曲
    const pool = encounterById[encounterId]?.pool;
    setBgm(encounterId === 'shadow_cat' ? 'shadow'
      : isBoss ? (run.act >= ACTS ? 'finalboss' : 'boss')
        : pool === '大魔物' ? 'elite' : 'battle');
    const go = (): void => {
      this.cs = beginCombat(run, encounterId);
      const firstNew = (encounterById[encounterId]?.enemies ?? []).find((id) => !run.flags[`seen:${id}`]);
      this.show('combat', { bonusFish });
      if (firstNew) {
        run.flags[`seen:${firstNew}`] = true;   // 不存檔：戰鬥中不存，旗標由獎勵挑完那次存檔帶走
        toast(dialogue.firstMeet[firstNew] ?? '', '球球');
      } else {
        toast(dialogue.battleStart[Math.floor(Math.random() * dialogue.battleStart.length)] ?? '', '球球');
      }
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
  afterCombat(bonusFish = 0): void {
    const run = this.run;
    const cs = this.cs;
    if (!run || !cs) { this.show('title'); return; }
    const rewards = finishCombat(run, cs, bonusFish);
    this.cs = null;
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
    if (run.status !== 'playing') { recordBest(run); clearSave(); }
    if (!rewards) { playDialogue(dialogue.defeat, () => this.show('result')); return; }
    if (rewards.kind === '塔主') {
      // 第三關的關主倒下才是通關；前兩關的關主打完走過場對白 → 過關畫面（回滿血、挑秘寶、進下一關）。
      // 過關那條路 status 還是 playing，存檔規矩跟一般獎勵一樣：等過關畫面收尾的 backToMap() 才寫。
      if (run.status === 'won') {
        // 通關結局幻燈片：相擁、回家路；圖沒到就退回對白
        const endSlides = [
          { img: 'bg/still_embrace', lines: dialogue.victory.slice(0, 4) },
          { img: 'bg/still_home', lines: dialogue.victory.slice(4) },
        ];
        // 使用者自製的結尾影片先播（沒檔就直接略過），再接結局幻燈片
        playVideo('ending', () => {
          if (slidesReady(endSlides)) playSlides(endSlides, () => this.show('result'));
          else playDialogue(dialogue.victory, () => this.show('result'));
        });
        return;
      }
      playDialogue(run.act === 1 ? dialogue.actClear1 : dialogue.actClear2, () => this.show('actclear'));
      return;
    }
    // 事件獎金已經加進 run.fish，但戰利品與獎金要分兩行顯示，所以一起帶給獎勵畫面
    const go = (): void => this.show('reward', { ...rewards, bonusFish });
    if (rewards.kind === '大魔物') this.playOnce('firstElite', dialogue.afterFirstElite, go);
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
