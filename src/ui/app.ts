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
    this.playOnce('prologue', dialogue.prologue, () => { this.show('map'); });
  }

  continueRun(): boolean {
    const run = loadRun();
    if (!run) return false;
    this.run = run;
    this.cs = null;
    this.show('map');
    return true;
  }

  save(): void { if (this.run && this.run.status === 'playing') saveRun(this.run); }

  /**
   * 只播一次的劇情：旗標寫在 run.flags 裡並立刻存檔，所以中途重整回來不會再播一次。
   * 之後的 firstElite、secretScroll 也走這個。
   */
  playOnce(flag: string, lines: DialogueLine[], onDone: () => void): void {
    const run = this.run;
    if (!run || run.flags[flag]) { onDone(); return; }
    run.flags[flag] = true;
    this.save();
    playDialogue(lines, onDone);
  }

  enterNode(nodeId: string): void {
    const run = this.run;
    if (!run) return;
    const node = chooseNode(run, nodeId);
    this.save();   // 位置已經前進了，先寫進存檔，免得重整後停在上一層
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
        run.flags[`seen:${firstNew}`] = true;
        this.save();
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
