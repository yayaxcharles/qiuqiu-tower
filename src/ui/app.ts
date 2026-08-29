import { dialogue, type DialogueLine } from '../content/dialogue';
import { enemyById, encounterById } from '../content/enemies';
import { nodeById } from '../engine/map';
import { beginCombat, chooseNode, finishCombat, newRun as engineNewRun } from '../engine/run';
import { loadRun, saveRun } from '../engine/save';
import type { CombatState, RunState } from '../engine/types';
import { computeScale } from './assets';
import { playDialogue, toast } from './dialogue';
import { clear, el } from './dom';
import { setOverlayRoot } from './overlay';
import { hideTooltip } from './tooltip';

export type ScreenName = 'title' | 'map' | 'combat' | 'reward' | 'event' | 'shop' | 'rest' | 'chest' | 'result';
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
  show(name: ScreenName, props: unknown = {}): void {
    const r = screens.get(name);
    if (!r) throw new Error(`畫面尚未登記：${name}`);
    hideTooltip();   // 提示框的錨點就要被清掉了，不先關掉會變成孤兒黏在畫面上
    clear(this.screen);
    this.stage.dataset['screen'] = name;
    r(this, this.screen, props);
  }

  newRun(seed?: string): void {
    this.run = engineNewRun(seed && seed.trim() ? seed.trim() : `${Date.now()}`);
    this.cs = null;
    // 序章播完存一次：此時 currentNode 還是 null，存的是乾淨的開局狀態，「續玩」從一開局就能用
    this.playOnce('prologue', dialogue.prologue, () => { this.save(); this.show('map'); });
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
    // 這裡不存檔（見 save() 的註解）：節點結算完才存，重整就回到上一個結算過的節點重選
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
    if (isBoss) playDialogue(dialogue.bossIntro, go); else go();
  }

  /**
   * 一場戰鬥收尾。**只有戰鬥已經分出勝負才可以叫**（`finishCombat` 對還在打的戰鬥會丟例外）。
   * **這裡不存檔**：finishCombat 已經把小魚乾、秘寶、忍具寫進 run，但三選一的牌還沒挑，
   * 這時候存下去、玩家在獎勵畫面重整，那張牌就無聲無息地不見了。規格 §3 說離開節點才存，
   * 而戰鬥節點要等獎勵拿完才算離開，所以存檔交給獎勵畫面收尾的 backToMap()。
   * 輸掉與打贏塔主不經過獎勵畫面，但那兩條路的 `run.status` 已經不是 'playing'，
   * 本來 save() 就會略過（整局結束，存檔留給結算畫面清掉）。
   */
  afterCombat(bonusFish = 0): void {
    const run = this.run;
    const cs = this.cs;
    if (!run || !cs) { this.show('title'); return; }
    const rewards = finishCombat(run, cs, bonusFish);
    this.cs = null;
    if (!rewards) { playDialogue(dialogue.defeat, () => this.show('result')); return; }
    if (rewards.kind === '塔主') { playDialogue(dialogue.victory, () => this.show('result')); return; }
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
