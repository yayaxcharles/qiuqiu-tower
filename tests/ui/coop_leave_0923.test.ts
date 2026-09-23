import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import APP_RAW from '../../src/ui/app.ts?raw';
import { newCoopRun, newRun } from '../../src/engine/run';
import type { RunState } from '../../src/engine/types';

/*
 * 2026-09-23 連線稽核 高-1：連線序章播到一半、同伴斷線，按紅色橫幅「回標題」之後，
 * 幻燈片點完就以單機模式進了兩人局的地圖，走完第一格把單機存檔蓋掉。
 *
 * `App` 要整個舞台才建得起來，這裡照 flow_fixes_0922 的做法：把那幾支方法原封不動切出來，
 * 包進一個最小的類別裡跑（切法有變就會在 `sourceBetween` 那裡直接丟例外，不會默默測空氣）。
 */
const APP = APP_RAW.replace(/\r\n/g, '\n');

function sourceBetween(start: string, end: string): string {
  const a = APP.indexOf(start);
  const b = APP.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`找不到這一段：${start}`);
  return APP.slice(a, b);
}

/** 把 `body`（一支或幾支方法）塞進只有那幾個欄位的類別，`deps` 是那幾支方法用到的模組層級名字 */
async function appClass(body: string, deps: Record<string, unknown>): Promise<new () => Record<string, unknown>> {
  const src = `class A { run = null; cs = null; coop = null; seat = 0; sandbox = false;\n${body}\n}\nreturn A;`;
  const js = (await transformWithOxc(src, 'app-slice.ts')).code;
  return new Function(...Object.keys(deps), js)(...Object.values(deps)) as new () => Record<string, unknown>;
}

const coopRun = (): RunState => newCoopRun('leave-0923', 1, 'fengfeng', 'dangdang');
const soloRun = (): RunState => newRun('leave-0923', 1, 'ninja');

describe('高-1（c）：兩人局不管 coop 還在不在，一律不寫進單機存檔', () => {
  const body = sourceBetween('  save(): void {', '  /**\n   * 離開連線');

  it('連線已經離開（coop 是 null）、局面還是兩人局：不存', async () => {
    const saveRun = vi.fn();
    const A = await appClass(body, { saveRun });
    const app = new A() as { run: RunState | null; save(): void };
    app.run = coopRun();
    app.save();
    expect(saveRun, '兩人局被寫進單機那一格，單機存檔就被蓋掉了').not.toHaveBeenCalled();
  });

  it('單機局照存（不能連單機一起擋掉）', async () => {
    const saveRun = vi.fn();
    const A = await appClass(body, { saveRun });
    const app = new A() as { run: RunState | null; save(): void };
    app.run = soloRun();
    app.save();
    expect(saveRun).toHaveBeenCalledTimes(1);
  });
});

describe('高-1（a）：離開連線時，那一局一起丟掉、還在演的劇情疊層收掉', () => {
  const body = sourceBetween('  leaveCoop(): void {', '  /**\n   * 節點結算完的收尾');
  const deps = (closeStoryOverlays: () => void) => ({
    setCoopStory: () => {}, closeStoryOverlays,
    document: { querySelectorAll: () => [] },
  });

  it('連線局按「回標題」：run／cs 清掉、劇情疊層收掉、線路關掉', async () => {
    const close = vi.fn();
    const A = await appClass(body, deps(close));
    const app = new A() as { run: RunState | null; cs: unknown; coop: unknown; seat: number; leaveCoop(): void };
    const leave = vi.fn();
    app.coop = { leave };
    app.seat = 1;
    app.run = coopRun();
    app.cs = {};
    const remove = vi.fn();
    Object.assign(app, { stage: { classList: { remove } }, fightPending: true });
    app.leaveCoop();
    expect(leave).toHaveBeenCalledTimes(1);
    // 開打前等牌面時斷線回標題：舞台的「點不動」一起解開（2026-09-23 推前審查二 中-1）
    expect(remove).toHaveBeenCalledWith('fight-pending');
    expect((app as unknown as { fightPending: boolean }).fightPending).toBe(false);
    expect(app.run, '兩人局還留著，序章點完就會以單機模式開起它').toBeNull();
    expect(app.cs).toBeNull();
    expect(close, '幻燈片還蓋在標題上').toHaveBeenCalledTimes(1);
    expect(app.seat).toBe(0);
  });

  it('單機的「新的一局」「續玩」也會先叫它：那時沒有連線，局面與疊層都不動', async () => {
    const close = vi.fn();
    const A = await appClass(body, deps(close));
    const app = new A() as { run: RunState | null; leaveCoop(): void };
    const run = soloRun();
    app.run = run;
    Object.assign(app, { stage: { classList: { remove: vi.fn() } } });
    app.leaveCoop();
    expect(app.run).toBe(run);
    expect(close).not.toHaveBeenCalled();
  });
});

describe('高-1（b）：序章、只播一次的劇情播完時，這一局已經丟了就不接下去', () => {
  it('連線序章播到一半離開連線：點完幻燈片不叫 after（原本會 show("map")）', async () => {
    const body = sourceBetween('  playPrologue(hero: Hero', '  /**\n   * 這一局的敘事情境');
    let slidesDone: (() => void) | null = null;
    const A = await appClass(body, {
      storyFor: () => ({ prologue: [{ speaker: '旁白', text: '…' }] }), prologueSlides: () => [{ img: 'x', lines: [] }],
      slidesReady: () => true, playSlides: (_s: unknown, done: () => void) => { slidesDone = done; },
      playDialogue: () => {}, hasCoopScene: () => true, OPENING_CLIP: {}, playVideo: () => {}, setBgm: () => {},
    });
    const app = new A() as { run: RunState | null; playPrologue(h: string, after: () => void, o: { video?: boolean }): void };
    const after = vi.fn();
    app.run = coopRun();
    app.playPrologue('fengfeng', after, { video: false });
    app.run = null;   // 同伴斷線、按橫幅「回標題」：leaveCoop 把這一局丟了
    slidesDone!();
    expect(after, '以單機模式進了兩人局的地圖').not.toHaveBeenCalled();

    // 同一局照常接下去
    const again = vi.fn();
    app.run = coopRun();
    app.playPrologue('fengfeng', again, { video: false });
    slidesDone!();
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('塔頂段落（playOnce）播到一半離開連線：不接關主開場與開打', async () => {
    const body = sourceBetween('  playOnce(flag: string', '  enterNode(nodeId: string)');
    let dialogueDone: (() => void) | null = null;
    const A = await appClass(body, {
      slidesReady: () => false, playSlides: () => {},
      playDialogue: (_l: unknown, done: () => void) => { dialogueDone = done; },
    });
    const app = new A() as { run: RunState | null; playOnce(f: string, l: unknown[], done: () => void): void };
    const onDone = vi.fn();
    app.run = coopRun();
    app.playOnce('topScene:3', [{ speaker: '旁白', text: '…' }], onDone);
    app.run = null;
    dialogueDone!();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('關主開場播完才開打的 go、打完記成績那一行，也看同一局／局面人數', () => {
    const go = sourceBetween('    const go = (): void => {\n      if (this.run !== run) return;', '      this.cs = beginCombat(run, encounterId);');
    expect(go).toContain('if (this.run !== run) return;');
    expect(APP, '打完整局記成績、清存檔只給單機局').toMatch(/!this\.coop && run\.players\.length === 1\) \{ recordBest\(run\); clearSave\(\); \}/);
  });
});
