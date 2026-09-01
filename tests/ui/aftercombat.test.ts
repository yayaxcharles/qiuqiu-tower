import { beforeEach, describe, expect, it } from 'vitest';
import { beginCombat, chooseNode, newRun } from '../../src/engine/run';
import { hasSave, saveRun, setStore } from '../../src/engine/save';
import type { CombatState, RunState } from '../../src/engine/types';
import { App, type ScreenName } from '../../src/ui/app';

/**
 * 這一組測的是「整局結束就當場定案」：afterCombat() 判定陣亡／通關之後要立刻把存檔清掉，
 * 不能拖到結算畫面。拖到結算畫面的話，中間那段交棒＋對白就是一段免費復活的空窗。
 *
 * 測試環境是 node、沒有 DOM，所以這裡**不建 App 實例**（建構子要 document 與 window），
 * 改用 Object.create(App.prototype) 直接拿到方法、再把 show() 換成假的收訊器。
 * afterCombat() 本身只碰 run／cs／存檔與 show()，不碰舞台那三個元素，所以這樣叫得通。
 * 另外疊層根節點沒有掛上去（overlayRoot() 是 null），playDialogue() 會直接走完叫 onDone，
 * 也就是說**對白在這裡是瞬間播完的**——真正那段對白時間差要靠瀏覽器實測，這裡負責的是
 * 「clearSave 在 show('result') 之前就發生了、而且不是結算畫面幫忙清的」。
 */
function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}
beforeEach(() => { setStore(memStore()); });

/** 一個假的 App：只有 afterCombat 需要的東西，show() 換成記帳用的假貨 */
function stubApp(run: RunState, cs: CombatState) {
  const app = Object.create(App.prototype) as App;
  app.run = run;
  app.cs = cs;
  const shown: { name: ScreenName; saveStillThere: boolean }[] = [];
  // 真的結算畫面自己也會 clearSave()，這裡換成假的，才能證明存檔是 afterCombat 清的
  app.show = (name: ScreenName): void => { shown.push({ name, saveStillThere: hasSave() }); };
  return { app, shown };
}

/** 開一局、走進第一個節點、把那場戰鬥打到指定結局 */
function fightTo(seed: string, phase: 'won' | 'lost', nodeId?: string): { run: RunState; cs: CombatState } {
  const run = newRun(seed);
  saveRun(run);   // 磁碟上先有一筆「這場戰鬥之前」的存檔，就是漏洞會被退回去的那一筆
  chooseNode(run, nodeId ?? run.map.start[0]!);
  const cs = beginCombat(run);
  if (phase === 'lost') { cs.player.hp = 0; cs.phase = 'lost'; } else {
    for (const e of cs.enemies) e.dead = true;
    cs.phase = 'won';
    cs.kills = cs.enemies.length;
  }
  return { run, cs };
}

describe('afterCombat：整局結束當場定案', () => {
  it('陣亡：走到結算畫面之前，存檔就已經沒了', () => {
    const { run, cs } = fightTo('death', 'lost');
    expect(hasSave()).toBe(true);
    const { app, shown } = stubApp(run, cs);
    app.afterCombat();
    expect(run.status).toBe('lost');
    expect(shown.map((s) => s.name)).toEqual(['result']);
    // 關鍵：進結算畫面的當下存檔就不在了＝不是結算畫面清的，是 afterCombat 清的
    expect(shown[0]!.saveStillThere).toBe(false);
    expect(hasSave()).toBe(false);
  });

  it('打贏第三關的塔主：一樣當場清掉，不能退回去重打塔主', () => {
    const { run, cs } = fightTo('boss', 'won');
    run.act = 3;                       // 三關制：只有第三關的關主倒下才算通關
    cs.encounterId = 'tower_master';   // 讓 finishCombat 判成塔主，run.status 會變 'won'
    const { app, shown } = stubApp(run, cs);
    app.afterCombat();
    expect(run.status).toBe('won');
    expect(shown.map((s) => s.name)).toEqual(['result']);
    expect(shown[0]!.saveStillThere).toBe(false);
    expect(hasSave()).toBe(false);
  });

  it('打贏第一關的塔主：整局還在進行、走過關畫面，存檔不清', () => {
    const { run, cs } = fightTo('boss', 'won');
    cs.encounterId = 'nekomata';
    const { app, shown } = stubApp(run, cs);
    app.afterCombat();
    expect(run.status).toBe('playing');
    expect(shown.map((s) => s.name)).toEqual(['actclear']);
    // 存檔規矩跟一般獎勵一樣：等過關畫面收尾的 backToMap() 才寫，這裡不清也不寫
    expect(hasSave()).toBe(true);
  });

  it('一般戰鬥打贏：存檔照舊留著，這次改動不動進行中的一局', () => {
    const { run, cs } = fightTo('normal', 'won');
    const { app, shown } = stubApp(run, cs);
    app.afterCombat();
    expect(run.status).toBe('playing');
    expect(shown.map((s) => s.name)).toEqual(['reward']);
    // 獎勵畫面本來就是一段沒有存檔的空窗（重整＝整場重打），但**舊的那筆存檔不可以被清掉**
    expect(shown[0]!.saveStillThere).toBe(true);
    expect(hasSave()).toBe(true);
  });
});
