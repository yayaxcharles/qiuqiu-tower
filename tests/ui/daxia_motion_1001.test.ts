import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import NETLOAD_SRC from '../../src/ui/netload-run.ts?raw';
import cueTable from '../../src/ui/fx/cues.json';
import report from '../../tools/pack_side_motion.report.json';
import { enemyById, BOSS_ART } from '../../src/content/enemies';
import { enemyMoveClipOf, hasLongDeath, staticIdle } from '../../src/ui/enemy-motion';
import { bossDeathMotionLeft, BOSS_DEATH_HOLD_MS, qiuqiuEnemyMotionKind } from '../../src/ui/qiuqiu-combat-motion';
import { createFxLayer, fxCuesFor, fxNamesFor, fxOpacityAt, fxOwnersOf, _setFxForTest, type FxCue, type FxEnv } from '../../src/ui/fx-layer';

/*
 * 2026-10-01 師父（tower_master，art daxia）三階段逐格＋走火入魔特效＋戰敗（使用者核准三項）。
 * 使用者提醒：「師父三階段長相不同要小心」——每一階段只用那一階段自己的片段，絕不跨階段混用。
 * 素材：F:\ClaudeWork\爪破_大冒險素材盤點_20261001\新片段\（紀錄在同資料夾的「師父補片紀錄.md」）。
 */

type Motion = { texture: string; loop: boolean; scale: number; marks?: Record<string, number>; frames: { rect: number[]; pivot: number[]; duration: number }[] };
type SideData = { actions: Record<string, Motion>; extras?: Record<string, Motion>; late?: Record<string, Motion>; moves?: Record<string, string> };
const side = (kind: string): SideData => JSON.parse(readFileSync(`src/ui/side-motion/${kind}.json`, 'utf8')) as SideData;
const seconds = (m: Motion): number => m.frames.reduce((sum, f) => sum + f.duration, 0);
const cues = (cueTable as { cues: FxCue[] }).cues;
const kindsReport = (report as { kinds: Record<string, Record<string, { src?: string; src_frames?: number[]; seconds?: number }>> }).kinds;
const PHASE_KINDS = ['daxia_p1', 'daxia_p2', 'daxia_p3'] as const;
const phaseMoves = (phase: number): string[] => {
  const def = enemyById.tower_master!;
  return (phase === 0 ? def.moves : def.phases![phase - 1]!.moves).map((m) => m.label);
};
const allTextures = (d: SideData): string[] => [...Object.values(d.actions), ...Object.values(d.extras ?? {}), ...Object.values(d.late ?? {})].map((m) => m.texture);

describe('師父：三個階段各一套，不跨階段', () => {
  it('第一、二、三階段各對到自己那一套（超過三階段用最後一套）', () => {
    expect(qiuqiuEnemyMotionKind('tower_master', 0)).toBe('daxia_p1');
    expect(qiuqiuEnemyMotionKind('tower_master', 1)).toBe('daxia_p2');
    expect(qiuqiuEnemyMotionKind('tower_master', 2)).toBe('daxia_p3');
    expect(qiuqiuEnemyMotionKind('tower_master', 5)).toBe('daxia_p3');
    // 只有兩個階段的照舊（第三階段以後用第二套）
    expect(qiuqiuEnemyMotionKind('iron_claw', 2)).toBe('iron_claw_p2');
  });

  it('每一套的圖集只來自自己那一階段的素材（daxia_pN-*），來源資料夾也是自己那一階段', () => {
    PHASE_KINDS.forEach((kind) => {
      for (const texture of allTextures(side(kind))) expect(texture, kind).toMatch(new RegExp(`^assets/motion/side/${kind}-[a-z_0-9]+\\.webp$`));
      for (const [name, entry] of Object.entries(kindsReport[kind]!)) if (!name.startsWith('_')) expect(entry.src, `${kind} ${name}`).toBeTypeOf('string');
    });
  });

  it('招式 → 片段：每一階段只對自己那一階段的招（出招表上的原文），對照一招都不能錯', () => {
    expect(side('daxia_p1').moves).toEqual({ 金鐘罩: 'guard', 鐵頭功: 'headbutt', 拆招: 'palm', 沾衣十八跌: 'palm', 獅吼功: 'shout' });
    expect(side('daxia_p2').moves).toEqual({ 穿心掌: 'palm', 拆招: 'palm', 沾衣十八跌: 'palm', 十二連環: 'combo', 金鐘罩: 'guard', 狂風連掌: 'flurry' });
    expect(side('daxia_p3').moves).toEqual({ 亡命一擊: 'lunge', 破功: 'doublepalm', 看破: 'doublepalm', 狂風連掌: 'flurry', 氣沉丹田: 'meditate' });
    // 第一、三階段：對到的招全是自己那一階段出招表上的
    for (const label of Object.keys(side('daxia_p1').moves!)) expect(phaseMoves(0), label).toContain(label);
    for (const label of Object.keys(side('daxia_p3').moves!)) expect(phaseMoves(2), label).toContain(label);
    // 第二階段自己的招都有；拆招、沾衣十八跌是血量跨線那一拍才會出的上一階段的招，也用第二階段的穿心掌片段（不退回第一階段的樣子）
    for (const label of Object.keys(side('daxia_p2').moves!)) expect([...phaseMoves(1), '拆招', '沾衣十八跌'], label).toContain(label);
  });

  it('醉拳沒有合格片：第二階段對不到片段（照舊畫靜態 drunk2）', () => {
    expect(enemyMoveClipOf(side('daxia_p2'), '醉拳')).toBeUndefined();
    expect(Object.keys(side('daxia_p2').extras!)).not.toContain('drunk');
  });

  it('沒有預設出招片段（每一招各自一段），待機畫靜態立繪（不播原地走路），待機那一格只是借片段第 0 格佔位', () => {
    for (const kind of PHASE_KINDS) {
      const d = side(kind);
      expect(d.actions.attack, kind).toBeUndefined();
      expect(staticIdle(kind), kind).toBe(true);
      expect(d.actions.idle!.frames.length, kind).toBe(1);
      expect(Object.values(d.extras!).map((m) => m.texture), kind).toContain(d.actions.idle!.texture);
    }
  });

  it('節奏：招式片段 ≤ 1.4 秒、變身 ≤ 2 秒；變身放在換階段之前那一套（一→二在第一套、二→三在第二套），第三套沒有變身', () => {
    for (const kind of PHASE_KINDS) for (const [name, m] of Object.entries(side(kind).extras!)) {
      expect(m.loop, `${kind} ${name}`).toBe(false);
      expect(seconds(m), `${kind} ${name}`).toBeLessThanOrEqual(name === 'change' ? 2.0 : 1.4);
    }
    expect(side('daxia_p1').extras!.change!.texture).toBe('assets/motion/side/daxia_p1-to_p2.webp');
    expect(side('daxia_p2').extras!.change!.texture).toBe('assets/motion/side/daxia_p2-to_p3.webp');
    expect(side('daxia_p3').extras!.change).toBeUndefined();
  });

  it('大小與腳底：每一套的倍率＝立繪框（320／340／350）÷ 560；變身片段用下一階段的框（換階段那一刻框已經變大）', () => {
    const wanted = { daxia_p1: 320 / 560, daxia_p2: 340 / 560, daxia_p3: 350 / 560 };
    for (const kind of PHASE_KINDS) {
      const d = side(kind);
      for (const [name, m] of Object.entries(d.extras!)) {
        const display = name === 'change' ? (kind === 'daxia_p1' ? wanted.daxia_p2 : wanted.daxia_p3) : wanted[kind];
        // 第 0 格＝那一階段的待機姿勢：來源裡身體高 480 上下（立繪 560×493 的第 6～487 列），畫上戰場要剛好是 高×倍率；
        // 腳底（畫布原點）到這一格頂端＝（493－頂端那一列）×倍率，也就是跟靜態立繪底邊對齊
        const [, , , h] = m.frames[0]!.rect;
        const drawnH = (h ?? 0) * m.scale;
        expect(drawnH / display, `${kind} ${name} 第 0 格的高`).toBeGreaterThan(460);
        expect(drawnH / display, `${kind} ${name} 第 0 格的高`).toBeLessThan(500);
        const footToTop = m.frames[0]!.pivot[1]! * m.scale / display;
        expect(footToTop, `${kind} ${name} 腳底到頂`).toBeGreaterThan(470);
        expect(footToTop, `${kind} ${name} 腳底到頂`).toBeLessThan(492);
      }
    }
    // 打包報告記的 spriteBox 對位：pack_side_motion.py 的 sprite_box 模式（腳底＝立繪底邊中點）
    const py = readFileSync('tools/pack_side_motion.py', 'utf8').replace(/\r\n/g, '\n');
    expect(py).toContain('ax, ay = fr["ax"] + sb["x"] + sb["w"] / 2, fr["ay"] + sb["y"] + sb["h"]');
    expect(py).toMatch(/"daxia_p1": \{"src": "daxia_p1", "display": 320 \/ 560, "change_display": 340 \/ 560, "sprite_box": True/);
    expect(py).toMatch(/"daxia_p2": \{"src": "daxia_p2", "display": 340 \/ 560, "change_display": 350 \/ 560, "sprite_box": True/);
    expect(py).toMatch(/"daxia_p3": \{"src": "daxia_p3", "display": 350 \/ 560, "sprite_box": True/);
  });
});

describe('師父：戰敗（全遊戲最華麗）', () => {
  it('只在第三套、晚一點才下載（不算就緒）、整段照原速 4 秒、停在最後一格（第 95 格＝defeat3 跪姿）', () => {
    expect(side('daxia_p1').late).toBeUndefined();
    expect(side('daxia_p2').late).toBeUndefined();
    const defeat = side('daxia_p3').late!.knockdown!;
    expect(defeat.texture).toBe('assets/motion/side/daxia_p3-defeat.webp');
    expect(defeat.loop).toBe(false);
    expect(seconds(defeat)).toBeGreaterThanOrEqual(3.95);
    expect(seconds(defeat)).toBeLessThanOrEqual(4.05);
    const frames = kindsReport.daxia_p3!.knockdown!.src_frames!;
    expect(frames[0]).toBe(0);
    expect(frames.at(-1)).toBe(94);   // 每 2 格取 1：最後一格是第 94 格（第 78 格起就跟 defeat3 一樣）
    expect(defeat.marks?.kneel).toBeGreaterThan(3000);
    expect(hasLongDeath('daxia_p3')).toBe(true);
    expect(hasLongDeath('daxia_p1')).toBe(false);
    expect(hasLongDeath('daxia_p2')).toBe(false);
    // 靜態那邊打死畫 defeat3（圖沒到時退回這張）
    expect(BOSS_ART.defeat3).toBe('boss/defeat3');
    expect(SRC.replace(/\r\n/g, '\n')).toContain('if (e.dead) return artUrl(\'sprites\', e.phase >= 2 && hasSprite(BOSS_ART.defeat3) ? BOSS_ART.defeat3 : BOSS_DEFEAT);');
  });

  it('勝利等戰敗演完（沿用 bossDeathMotionLeft）：4 秒＋最後一格停一下', () => {
    const states = new Map([[9, { kind: 'daxia_p3' as const, action: 'knockdown' as const, busyUntil: 5000 }]]);
    expect(bossDeathMotionLeft(states, 1000, new Set(), false, (k) => k === 'daxia_p3')).toBe(4000 + BOSS_DEATH_HOLD_MS);
  });
});

/* ---------- 真的 enemy-motion 模組：圖沒到退回靜態、戰敗圖到了才算有、背景下載一次一張 ---------- */

class FakeImage {
  static instances: FakeImage[] = [];
  complete = false;
  naturalWidth = 0;
  private value = '';
  fetchPriority = '';
  private handlers: Record<string, (() => void)[]> = {};
  constructor() { FakeImage.instances.push(this); }
  set src(value: string) { this.value = value; }
  get src(): string { return this.value; }
  addEventListener(type: string, fn: () => void): void { (this.handlers[type] ??= []).push(fn); }
  removeEventListener(): void {}
  /** 測試：這一張下載好了 */
  finish(): void { this.complete = true; this.naturalWidth = 100; for (const fn of this.handlers.load ?? []) fn(); }
  async decode(): Promise<void> {}
}

describe('師父：圖集還沒到退回靜態、到了才播', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeImage.instances = [];
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null, setAttribute() {}, style: {} }) });
    vi.stubGlobal('window', { devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  });
  afterEach(() => vi.unstubAllGlobals());
  const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

  it('格子資料一到就算就緒（不等任何圖集）；招式片段、變身、戰敗的圖集沒到之前一律說沒有（畫面照舊靜態立繪）', async () => {
    const motion = await import('../../src/ui/enemy-motion');
    (await import('../../src/ui/heavy-lane'))._resetHeavyLaneForTest();
    await motion.preloadEnemyMotion(['daxia_p1', 'daxia_p3']);
    expect(motion.enemyMotionReady('daxia_p1')).toBe(true);
    expect(FakeImage.instances.length).toBe(0);   // 待機不下載（畫靜態立繪），基本動作也沒有別的圖集
    expect(motion.enemyMotionMoveClip('daxia_p1', '鐵頭功')).toBeUndefined();
    expect(motion.enemyMotionChangeReady('daxia_p1')).toBe(false);
    expect(motion.enemyMotionHas('daxia_p3', 'knockdown')).toBe(false);
    expect(motion.playsLongDeath('daxia_p3')).toBe(false);
    const extras = motion.prefetchEnemyMotionExtras('daxia_p1', false);
    const late = motion.prefetchEnemyMotionLate('daxia_p3', false);
    await flush();
    expect(motion.enemyMotionMoveClip('daxia_p1', '鐵頭功')).toBeUndefined();   // 還在下載
    for (const image of FakeImage.instances) image.finish();
    await extras;
    await late;
    await flush();
    expect(motion.enemyMotionMoveClip('daxia_p1', '鐵頭功')).toBe('headbutt');
    // 待機佔位借的那一段（第一階段的金鐘罩）也要下載：原本被當成「基本動作的圖集」扣掉、永遠沒人抓（實機抓到的）
    expect(motion.enemyMotionMoveClip('daxia_p1', '金鐘罩')).toBe('guard');
    expect(FakeImage.instances.some((i) => i.src.includes('daxia_p1-guard'))).toBe(true);
    expect(motion.enemyMotionMoveClip('daxia_p1', '亡命一擊')).toBeUndefined();   // 第三階段的招，第一套對不到
    expect(motion.enemyMotionChangeReady('daxia_p1')).toBe(true);
    expect(motion.enemyMotionHas('daxia_p3', 'knockdown')).toBe(true);
    expect(motion.playsLongDeath('daxia_p3')).toBe(true);
    expect(motion.enemyMotionDuration('daxia_p3', 'knockdown')).toBeGreaterThan(3900);
    // 下載壞掉：又退回靜態
    for (const image of FakeImage.instances) image.naturalWidth = 0;
    expect(motion.enemyMotionMoveClip('daxia_p1', '鐵頭功')).toBeUndefined();
    expect(motion.playsLongDeath('daxia_p3')).toBe(false);
  });

  it('進第三關的背景下載（prefetchEnemyMotionAhead）：一次只排一張、排在最後（大檔那一條），離開這一局就不再排', async () => {
    const motion = await import('../../src/ui/enemy-motion');
    const lane = await import('../../src/ui/heavy-lane');
    lane._resetHeavyLaneForTest();
    lane.armHeavyLane(2);
    const release = lane.holdHeavyLane();   // 開場那一批還沒抓完：大檔那一條先擋著，看排了幾張
    let alive = true;
    const run = motion.prefetchEnemyMotionAhead(['daxia_p1', 'daxia_p2', 'daxia_p3'], () => alive);
    await flush();
    expect(lane._heavyLaneStateForTest().waiting.length).toBe(1);
    expect(lane._heavyLaneStateForTest().waiting[0]).toMatch(/daxia_p1-/);
    // 之後才排進來的一般魔物：前面只多這一張師父的
    const other = new FakeImage();
    void lane.loadHeavy(other as unknown as HTMLImageElement, 'monster.webp');
    expect(lane._heavyLaneStateForTest().waiting).toHaveLength(2);
    release();
    await flush();
    // 放行：第一張與一般魔物開抓；第一張下載好之前不排第二張
    expect(lane._heavyLaneStateForTest().waiting).toHaveLength(0);
    expect(FakeImage.instances.filter((i) => /daxia_/.test(i.src))).toHaveLength(1);
    FakeImage.instances.find((i) => /daxia_/.test(i.src))!.finish();
    await flush();
    expect(FakeImage.instances.filter((i) => /daxia_/.test(i.src))).toHaveLength(2);
    alive = false;   // 換了一局
    FakeImage.instances.filter((i) => /daxia_/.test(i.src)).at(-1)!.finish();
    await flush();
    expect(FakeImage.instances.filter((i) => /daxia_/.test(i.src))).toHaveLength(2);
    await run;
    lane._resetHeavyLaneForTest();
  });
});

/* ---------- combat.ts 那幾段（假的立繪框、假的畫布） ---------- */

function sourceBetween(start: string, end: string): string {
  const normalized = SRC.replace(/\r\n/g, '\n');
  const first = normalized.indexOf(start);
  const last = normalized.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到 combat.ts 的這一段：${start}`);
  return normalized.slice(first, last);
}
const mountSource = sourceBetween('  const MOTION_DEATH_FADE_MS', '  app.disposers.push(() => {');

type FakeEl = { parentNode: FakeEl | null; children: FakeEl[]; classes: Set<string>; append(c: FakeEl): void; remove(): void;
  classList: { add(k: string): void; remove(k: string): void; contains(k: string): boolean }; closest(): FakeEl | null; style: Record<string, string>; animate(): void };
function fakeEl(): FakeEl {
  const node: FakeEl = {
    parentNode: null, children: [], classes: new Set(),
    append(c) { c.remove(); c.parentNode = node; node.children.push(c); },
    remove() { const p = node.parentNode; if (p) { p.children = p.children.filter((x) => x !== node); node.parentNode = null; } },
    classList: { add: (k) => { node.classes.add(k); }, remove: (k) => { node.classes.delete(k); }, contains: (k) => node.classes.has(k) },
    closest: () => node.parentNode,
    style: {},
    animate() {},
  };
  return node;
}

/** 只有師父一隻的戰場：真的階段→套對照、真的提示表，逐格與圖集用假的 */
async function field(opts: { phase: number; invulnIn?: number; acting?: Map<number, { label: string; attacked: boolean }>;
  drawable?: (kind: string, clip: string) => boolean; changeReady?: boolean; dead?: boolean; lateReady?: boolean }) {
  const unit = fakeEl();
  const box = fakeEl();
  unit.append(box);
  const played: [string, string, string | undefined][] = [];
  const created: string[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const auraCalls: string[][] = [];
  let now = 1000;
  const e = { uid: 7, enemyId: 'tower_master', phase: opts.phase, dead: !!opts.dead, reviveIn: 0, invulnIn: opts.invulnIn ?? 0 };
  const enemyMotionActors = new Map<number, { kind: string; action: string; actor: { element: FakeEl } }>();
  const enemyPhaseChanges = new Map<number, { kind: string; until: number }>();
  const data = (kind: string): SideData => side(kind);
  const bindings: Record<string, unknown> = {
    enemyMotionActors, enemyPhaseChanges, phaseSmoke: new Map(),
    root: { querySelector: (sel: string) => (sel.endsWith('.sprite-box') ? box : unit) },
    qiuqiuEnemyMotionAllowed: () => true, motionEnabled: true, heroOf: () => 'ninja',
    qiuqiuEnemyMotionKind, enemyMotionReady: () => true, ensureEnemyMotion() {},
    enemyMotionChangeReady: () => opts.changeReady ?? true,
    enemyMotionChangeFade: () => 0,
    // 這一招對到的片段（真的資料），圖集到了才回（drawable）
    enemyMotionMoveClip: (kind: string, label: string) => {
      const clip = enemyMoveClipOf(data(kind), label);
      return clip !== undefined && (opts.drawable?.(kind, clip) ?? true) ? clip : undefined;
    },
    fallingUids: new Set(), willRevive: () => false,
    createEnemyMotionActor: (kind: string) => {
      created.push(kind);
      const canvas = fakeEl();
      return { element: canvas, play: (a: string, clip?: string) => { played.push([kind, a, clip]); }, pause() {},
        holdLast() {}, dispose() {} };
    },
    isSideMotionKind: () => true, hurtSet: new Set(), acting: opts.acting ?? new Map(), enemyStaticPose: () => 'idle',
    staticIdle, playsLongDeath: (k: string) => k === 'daxia_p3' && !!opts.lateReady,
    // 師父三套沒有預設出招；戰敗只有第三套、圖集到了才算有
    enemyMotionHas: (k: string, a: string) => (a === 'knockdown' ? k === 'daxia_p3' && !!opts.lateReady : a === 'idle'),
    enemyMotionDuration: (_k: string, a: string) => (a === 'change' ? 1900 : a === 'knockdown' ? 4000 : 1350),
    qiuqiuEnemyMotionHold: (_k: string, a: string) => (a === 'change' ? 1900 : a === 'knockdown' ? 4000 : 1350), BOSS_DEATH_HOLD_MS: 300,
    motionImpactTimers: new Set(), performance: { now: () => now },
    window: { setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} },
    fxLayer: { syncAura: (_key: string, list: FxCue[]) => { auraCalls.push(list.map((c) => `${c.on}:${c.fx}`)); }, fire() {} },
    fxCuesFor, fxOwnersOf, enemyBoxOf: () => () => box, fxTargetSeats: () => [], enemyMotionMarks: () => undefined, playerBoxOf: () => () => null,
  };
  const cs = { phase: 'combat', players: [], enemies: [e] };
  bindings.cs = cs;
  bindings.app = { cs };
  const code = (await transformWithOxc(`${mountSource}\nreturn { mountEnemyMotion, startPhaseChange, playEnemyMotion, enemyAuraCues, finishEnemyMotion };`, 'daxia.ts')).code;
  const api = new Function(...Object.keys(bindings), code)(...Object.values(bindings)) as {
    mountEnemyMotion(e: unknown, box: FakeEl): void; startPhaseChange(e: unknown, from: number): void; playEnemyMotion(uid: number, a: string, clip?: string): void;
    enemyAuraCues(e: unknown): FxCue[]; finishEnemyMotion(uid: number): void;
  };
  return {
    e, box, played, created, timers, enemyPhaseChanges, auraCalls, api,
    mount: () => api.mountEnemyMotion(e, box),
    advance: (ms: number) => { now += ms; },
    canvasShown: () => box.children.length > 0 && box.classList.contains('has-enemy-motion'),
  };
}

describe('師父：戰鬥畫面', () => {
  it('每一階段出招播自己那一套的片段（第二階段的狂風連掌不會播第三階段的，反之亦然）', async () => {
    const cases: [number, string, string, string][] = [
      [0, '鐵頭功', 'daxia_p1', 'headbutt'], [0, '獅吼功', 'daxia_p1', 'shout'], [0, '金鐘罩', 'daxia_p1', 'guard'],
      [1, '十二連環', 'daxia_p2', 'combo'], [1, '狂風連掌', 'daxia_p2', 'flurry'], [1, '金鐘罩', 'daxia_p2', 'guard'],
      [2, '狂風連掌', 'daxia_p3', 'flurry'], [2, '亡命一擊', 'daxia_p3', 'lunge'], [2, '氣沉丹田', 'daxia_p3', 'meditate'],
    ];
    for (const [phase, label, kind, clip] of cases) {
      const f = await field({ phase, acting: new Map([[7, { label, attacked: true }]]) });
      f.mount();
      expect(f.played, `${phase} ${label}`).toEqual([[kind, 'attack', clip]]);
      expect(f.canvasShown(), `${phase} ${label}`).toBe(true);
    }
  });

  it('醉拳（沒有合格片）：不掛畫布，交還靜態的出招立繪（drunk2）', async () => {
    const f = await field({ phase: 1, acting: new Map([[7, { label: '醉拳', attacked: true }]]) });
    f.mount();
    expect(f.played.some(([, a]) => a === 'attack')).toBe(false);
    expect(f.canvasShown()).toBe(false);
  });

  it('片段圖集還沒到（慢網路）：照舊靜態出招立繪，不卡、不空白；到了下一次出招就播', async () => {
    const f = await field({ phase: 0, acting: new Map([[7, { label: '鐵頭功', attacked: true }]]), drawable: () => false });
    f.mount();
    expect(f.played.some(([, a]) => a === 'attack')).toBe(false);
    expect(f.canvasShown()).toBe(false);
    const g = await field({ phase: 0, acting: new Map([[7, { label: '鐵頭功', attacked: true }]]), drawable: () => true });
    g.mount();
    expect(g.played).toEqual([['daxia_p1', 'attack', 'headbutt']]);
  });

  it('待機（含挨打）：不掛畫布，畫靜態立繪', async () => {
    const f = await field({ phase: 2 });
    f.mount();
    expect(f.canvasShown()).toBe(false);
    expect(f.played).toEqual([]);
  });

  it('換階段：播上一套的變身（一→二在第一套），演完交還下一階段的靜態立繪，那一刻補上閉關氣場', async () => {
    const f = await field({ phase: 1, invulnIn: 1 });
    f.api.startPhaseChange(f.e, 0);
    expect(f.enemyPhaseChanges.get(7)?.kind).toBe('daxia_p1');
    f.mount();
    expect(f.played).toEqual([['daxia_p1', 'change', undefined]]);
    expect(f.canvasShown()).toBe(true);   // 沒有先閃第二階段的原圖
    // 變身中：閉關氣場還不出來（身上已經是黑煙）
    expect(f.api.enemyAuraCues(f.e).map((c) => c.on)).not.toContain('seclude');
    f.advance(1950);
    f.timers.find((t) => t.ms >= 1900)!.fn();
    expect(f.enemyPhaseChanges.has(7)).toBe(false);
    expect(f.created.at(-1)).toBe('daxia_p2');
    expect(f.canvasShown()).toBe(false);   // 交還第二階段的靜態立繪
    expect(f.auraCalls.at(-1)).toContain('seclude:daxia_seclude_aura');
  });

  it('二→三：播第二套的變身（斗笠飛走），演完交還第三階段的靜態立繪', async () => {
    const f = await field({ phase: 2, invulnIn: 1 });
    f.api.startPhaseChange(f.e, 1);
    expect(f.enemyPhaseChanges.get(7)?.kind).toBe('daxia_p2');
    f.mount();
    expect(f.played).toEqual([['daxia_p2', 'change', undefined]]);
    f.advance(1950);
    f.timers.find((t) => t.ms >= 1900)!.fn();
    expect(f.created.at(-1)).toBe('daxia_p3');
    expect(f.canvasShown()).toBe(false);
  });

  it('他自己回合開頭被中毒打光血條（回合推進了、沒出招、當場閉關）：變身照演，不被當成「輪到牠出手」收掉', async () => {
    const f = await field({ phase: 1, invulnIn: 1, acting: new Map([[7, { label: '拆招', attacked: false }]]) });
    f.api.startPhaseChange(f.e, 0);
    f.mount();
    expect(f.played).toEqual([['daxia_p1', 'change', undefined]]);
    expect(f.canvasShown()).toBe(true);
    // 換階段那一拍的判斷（settle 裡）也一樣：有出手且不在閉關才擋
    const c = SRC.replace(/\r\n/g, '\n');
    expect(c).toContain("(a?.phase ?? e.phase) > b.phase && !(acting.has(e.uid) && !((a?.secluding ?? e.invulnIn > 0)))) startPhaseChange(e, b.phase);");
    // 真的出手（閉關已經結束）照舊收掉變身
    const g = await field({ phase: 1, invulnIn: 0, acting: new Map([[7, { label: '十二連環', attacked: true }]]) });
    g.api.startPhaseChange(g.e, 0);
    g.mount();
    expect(g.played.some(([, a]) => a === 'change')).toBe(false);
  });

  it('變身圖集還沒到：不登記，照舊閃白＋直接換下一階段立繪；閉關氣場馬上就有', async () => {
    const f = await field({ phase: 1, invulnIn: 1, changeReady: false });
    f.api.startPhaseChange(f.e, 0);
    expect(f.enemyPhaseChanges.size).toBe(0);
    f.mount();
    expect(f.canvasShown()).toBe(false);
    expect(f.api.enemyAuraCues(f.e).map((c) => c.on)).toContain('seclude');
  });

  it('閉關氣場：閉關中（invulnIn）才有、起身（invulnIn 歸零）就沒有；黑氣一直都有；倒下全部收掉', async () => {
    const f = await field({ phase: 2, invulnIn: 1 });
    const on = (): string[] => f.api.enemyAuraCues(f.e).map((c) => `${c.on}:${c.fx}`);
    expect(on()).toContain('seclude:daxia_seclude_aura');
    expect(on()).toContain('aura:daxia_black_qi');
    f.e.invulnIn = 0;
    expect(on()).not.toContain('seclude:daxia_seclude_aura');
    expect(on()).toContain('aura:daxia_black_qi');
    f.e.dead = true;
    expect(on()).toEqual([]);
  });

  it('戰敗：圖集到了就播長倒下（停在最後一格、不收畫布）；沒到就交還靜態（defeat3）', async () => {
    const f = await field({ phase: 2, lateReady: true });
    f.mount();   // 站著：靜態立繪
    expect(f.canvasShown()).toBe(false);
    f.e.dead = true;
    f.mount();
    expect(f.played).toEqual([['daxia_p3', 'knockdown', undefined]]);
    expect(f.canvasShown()).toBe(true);
    const g = await field({ phase: 2, lateReady: false });
    g.mount();
    g.e.dead = true;
    g.mount();
    expect(g.played.some(([, a]) => a === 'knockdown')).toBe(false);
    expect(g.canvasShown()).toBe(false);
  });
});

describe('師父：走火入魔特效（提示表）', () => {
  it('黑氣：三個階段都有、一階淡二階中三階濃（同一支特效、用不透明度分，不另外出圖），畫在身體後面', () => {
    const qi = (kind: string): FxCue[] => fxCuesFor([kind], 'aura').filter((c) => c.fx === 'daxia_black_qi');
    const [a, b, c] = PHASE_KINDS.map(qi);
    for (const list of [a, b, c]) {
      expect(list!.length).toBeGreaterThan(0);
      for (const cue of list!) expect(cue.layer).toBe('back');
    }
    expect(a![0]!.opacity!).toBeLessThan(b![0]!.opacity!);
    expect(b![0]!.opacity!).toBeLessThan(c![0]!.opacity!);
  });

  it('換階段黑氣爆發：一→二、二→三都有、比待機大很多；閉關氣場只在第二、三階段（換階段之後才有閉關）', () => {
    for (const kind of ['daxia_p2', 'daxia_p3']) {
      const burst = fxCuesFor([kind], 'change');
      expect(burst.length, kind).toBeGreaterThan(0);
      for (const cue of burst) expect(cue.scale!, kind).toBeGreaterThanOrEqual(1.8);
      expect(fxCuesFor([kind], 'seclude').map((c) => c.fx), kind).toEqual(['daxia_seclude_aura']);
    }
    expect(fxCuesFor(['daxia_p1'], 'seclude')).toEqual([]);
    expect(fxNamesFor(['daxia_p1', 'daxia_p2', 'daxia_p3']).sort()).toEqual(['daxia_black_qi', 'daxia_seclude_aura']);
    // 只掛在師父自己身上（不打在主角身上）
    for (const cue of cues.filter((x) => x.owner.startsWith('daxia_'))) expect(cue.host ?? 'self').toBe('self');
  });

  it('濃淡計算：淡入、不循環的播完前淡出、底數乘不透明度', () => {
    const cue: FxCue = { owner: 'x', on: 'change', fx: 'f', opacity: 0.8, fadeInMs: 200, fadeOutMs: 500 };
    expect(fxOpacityAt(cue, 0, 2000, false)).toBe(0);
    expect(fxOpacityAt(cue, 100, 2000, false)).toBe(0.4);
    expect(fxOpacityAt(cue, 1000, 2000, false)).toBe(0.8);
    expect(fxOpacityAt(cue, 1750, 2000, false)).toBe(0.4);
    // 循環的（氣場）不在播完前淡出，停下時才淡
    expect(fxOpacityAt(cue, 1750, 2000, true)).toBe(0.8);
  });
});

/* ---------- 特效圖層：半透明的氣場收掉時從現在的濃淡淡出（不先閃一下全黑） ---------- */

type Node = { parentNode: Node | null; children: Node[]; firstChild: Node | null; append(c: Node): void; insertBefore(c: Node, ref: Node | null): void; remove(): void; nextSibling: Node | null };
function fakeNode(): Node {
  const n: Node = {
    parentNode: null, children: [],
    get firstChild() { return n.children[0] ?? null; },
    get nextSibling() { const p = n.parentNode; if (!p) return null; return p.children[p.children.indexOf(n) + 1] ?? null; },
    append(c) { c.remove(); c.parentNode = n; n.children.push(c); },
    insertBefore(c, ref) { c.remove(); c.parentNode = n; const at = ref ? n.children.indexOf(ref) : -1; if (at < 0) n.children.push(c); else n.children.splice(at, 0, c); },
    remove() { const p = n.parentNode; if (p) { p.children = p.children.filter((x) => x !== n); n.parentNode = null; } },
  };
  return n;
}

describe('閉關氣場：出現、一直循環、起身時淡出', () => {
  const SPRITE = { texture: 'assets/motion/fx/aura-test.webp', scale: 1,
    frames: Array.from({ length: 6 }, (_, i) => ({ rect: [i * 10, 0, 100, 80] as [number, number, number, number], pivot: [50, 40] as [number, number], duration: 1 / 12 })) };
  beforeEach(() => {
    _setFxForTest('daxia_seclude_aura', SPRITE, { complete: true, naturalWidth: 100 } as unknown as HTMLImageElement);
    _setFxForTest('daxia_black_qi', SPRITE, { complete: true, naturalWidth: 100 } as unknown as HTMLImageElement);
  });
  afterEach(() => { _setFxForTest('daxia_seclude_aura', undefined); _setFxForTest('daxia_black_qi', undefined); });

  it('真的提示表：閉關中補上金環（淡入）、跟黑氣一起循環；起身那一拍從 0.9 淡到 0、淡完才拿掉；黑氣不重來', () => {
    let nextId = 1;
    const rafs = new Map<number, (t: number) => void>();
    const timers = new Map<number, { cb: () => void; at: number }>();
    let now = 0;
    const animations: { keyframes: unknown; options: unknown }[] = [];
    const env: FxEnv = {
      createCanvas: () => {
        const node = fakeNode() as unknown as HTMLCanvasElement & Node;
        Object.assign(node, { style: {}, className: '', width: 0, height: 0, setAttribute() {},
          classList: { contains: (k: string) => (node as unknown as { className: string }).className.split(' ').includes(k) },
          getContext: () => ({ setTransform() {}, clearRect() {}, drawImage() {} }),
          animate: (keyframes: unknown, options: unknown) => { animations.push({ keyframes, options }); } });
        return node;
      },
      hostHeight: () => 340, dpr: () => 1,
      requestFrame: (cb) => { const id = nextId++; rafs.set(id, cb); return id; },
      cancelFrame: (id) => { rafs.delete(id); },
      setTimer: (cb, ms) => { const id = nextId++; timers.set(id, { cb, at: now + ms }); return id; },
      clearTimer: (id) => { timers.delete(id); },
    };
    const advance = (ms: number): void => {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.cb(); }
        const pending = [...rafs.values()];
        rafs.clear();
        for (const cb of pending) cb(now);
      }
    };
    const layer = createFxLayer(env);
    const box = fakeNode();
    const owners = fxOwnersOf('tower_master', 1, 'daxia_p2');
    const secluding = [...fxCuesFor(owners, 'aura'), ...fxCuesFor(owners, 'seclude')];
    layer.syncAura('e7', secluding, () => box as unknown as HTMLElement);
    advance(16);
    const canvases = (): (Node & { style: Record<string, string>; className: string })[] => box.children as never;
    expect(canvases().length).toBe(3);   // 黑氣左右兩縷＋金環
    for (const c of canvases()) expect(Number(c.style.opacity)).toBeLessThan(0.1);   // 淡入，不是一下子冒出來
    advance(800);   // 淡入 500～700 毫秒
    const opacities = canvases().map((c) => c.style.opacity).sort();
    expect(opacities).toEqual(['0.55', '0.55', '0.9']);
    const qi = canvases().filter((c) => c.style.opacity === '0.55');
    advance(3000);   // 遠超過一輪：都還在
    expect(canvases().length).toBe(3);
    // 起身：只剩黑氣
    layer.syncAura('e7', fxCuesFor(owners, 'aura'), () => box as unknown as HTMLElement);
    expect(animations).toEqual([{ keyframes: [{ opacity: 0.9 }, { opacity: 0 }], options: { duration: 700, fill: 'forwards', easing: 'ease-out' } }]);
    advance(400);
    expect(canvases().length).toBe(3);   // 還在淡
    advance(400);
    expect(canvases().length).toBe(2);   // 淡完拿掉了
    expect(canvases()).toEqual(qi);      // 黑氣沒有重來
  });
});

describe('師父：下載', () => {
  it('開打那一串補上第三階段（戰敗、招式片段，只下載不解碼），排在第二階段的招式片段後面', () => {
    const c = SRC.replace(/\r\n/g, '\n');
    const tail = c.slice(c.indexOf('.then(() => (fighting() ? prefetchEnemyMotionExtras(later, false) : undefined))'));
    expect(tail.slice(0, 400)).toContain('.then(() => (fighting() && third ? prefetchEnemyMotionLate(third, false) : undefined))');
    expect(tail.slice(0, 600)).toContain('.then(() => (fighting() && third ? prefetchEnemyMotionExtras(third, false) : undefined))');
  });

  it('進第三關在地圖上就先排（netload-run.ts，按需載入的那一塊，不進首載）；第一、二關不排；?motion=0 不排', () => {
    const n = NETLOAD_SRC.replace(/\r\n/g, '\n');
    expect(n).toContain('prefetchMasterAhead(run, key);');
    expect(n).toContain("if (run.act < 3 || masterAheadKey === key) return;");
    expect(n).toContain("new URLSearchParams(location.search).get('motion') === '0'");
    expect(n).toContain("import('./screens/combat').then((m) => m.prefetchMasterMotionAhead(alive))");
    const c = SRC.replace(/\r\n/g, '\n');
    const fn = c.slice(c.indexOf('export async function prefetchMasterMotionAhead'));
    expect(fn.slice(0, 900)).toContain('await prefetchEnemyMotionAhead([first], alive);\n  if (alive()) await prefetchFx(');
    expect(fn.slice(0, 900)).toContain('await prefetchEnemyMotionAhead(rest, alive);');
  });
});
