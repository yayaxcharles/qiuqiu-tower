import { dialogue, type DialogueLine } from '../content/dialogue';
import { enemyById, encounterById } from '../content/enemies';
import { nodeById } from '../engine/map';
import { beginCombat, chooseNode, newRun as engineNewRun } from '../engine/run';
import { loadRun, saveRun } from '../engine/save';
import type { CombatState, RunState } from '../engine/types';
import { computeScale } from './assets';
import { playDialogue, toast } from './dialogue';
import { clear, el } from './dom';

export type ScreenName = 'title' | 'map' | 'combat' | 'reward' | 'event' | 'shop' | 'rest' | 'chest' | 'result';
type Renderer = (app: App, root: HTMLElement, props: unknown) => void;

const screens = new Map<ScreenName, Renderer>();
export function registerScreen(name: ScreenName, render: Renderer): void { screens.set(name, render); }

export class App {
  run: RunState | null = null;
  cs: CombatState | null = null;
  stage: HTMLElement;

  constructor(root: HTMLElement) {
    this.stage = el('div', { id: 'stage' });
    root.append(this.stage);
    const fit = (): void => {
      this.stage.style.transform = `scale(${computeScale(window.innerWidth, window.innerHeight)})`;
    };
    window.addEventListener('resize', fit);
    fit();
  }

  show(name: ScreenName, props: unknown = {}): void {
    const r = screens.get(name);
    if (!r) throw new Error(`畫面尚未登記：${name}`);
    clear(this.stage);
    this.stage.dataset['screen'] = name;
    r(this, this.stage, props);
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
   * 存檔時機鐵則：**只有一個節點結算完才可以呼叫**——任務 5 的 afterCombat（獎勵拿完）、
   * 任務 6 的 backToMap（事件／罐頭鋪／貓窩／紙箱收尾），再加上開局那一次（見 newRun）。
   * 規格 §3：「每離開一個節點就自動存檔」「戰鬥中途關掉，下次從該場戰鬥開頭重打」。
   *
   * 進節點時、戰鬥進行中、播對白時**一律不要存**。進節點就存的話，chooseNode() 已經把
   * currentNode 推到新節點、但那個節點的內容還沒消化，重整回來就會整個跳過它（白吃一場戰鬥
   * 或一個紙箱）。不存反而自洽：run.rng 沒被推進，重進去的罐頭鋪存貨、紙箱秘寶都一模一樣。
   */
  save(): void { if (this.run && this.run.status === 'playing') saveRun(this.run); }

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
        run.flags[`seen:${firstNew}`] = true;   // 不存檔：戰鬥中不存，旗標由戰後結算那次帶走
        toast(dialogue.firstMeet[firstNew] ?? '', '球球');
      } else {
        toast(dialogue.battleStart[Math.floor(Math.random() * dialogue.battleStart.length)] ?? '', '球球');
      }
    };
    if (isBoss) playDialogue(dialogue.bossIntro, go); else go();
  }

  nodeTitle(nodeId: string): string {
    const run = this.run;
    if (!run) return '';
    const n = nodeById(run.map, nodeId);
    if (n.encounterId) return (encounterById[n.encounterId]?.enemies ?? []).map((id) => enemyById[id]?.name ?? id).join('、');
    return n.type;
  }
}
