import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import cueTable from '../../src/ui/fx/cues.json';
import report from '../../tools/pack_side_motion.report.json';
import { enemyById } from '../../src/content/enemies';
import { SIDE_MOTION_KINDS } from '../../src/ui/enemy-motion';
import { createFxLayer, fxBounds, fxCueDelay, fxCuesFor, fxFrameAt, fxNamesFor, fxOwnersOf, playFx, _setFxForTest, type FxCue, type FxEnv } from '../../src/ui/fx-layer';

/*
 * 2026-10-01 魔物特效圖層（盤點裁決第 2 題）＋四隻一階塔主倒下＋橘皮大王二階龍捲滾、蓄力。
 * 素材：F:\ClaudeWork\爪破_大冒險素材盤點_20261001\新片段\（Flow 新生，紀錄在同資料夾的 Flow補片紀錄.md）。
 */

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const fxExists = (name: string): boolean => existsSync(`src/ui/fx/sprites/${name}.json`);
const fxData = (name: string) => readJson(`src/ui/fx/sprites/${name}.json`) as { texture: string; frames: { duration: number }[] };
type SideData = { actions: Record<string, { marks?: Record<string, number>; texture: string }>; extras?: Record<string, { marks?: Record<string, number>; texture: string }>;
  late?: Record<string, { marks?: Record<string, number>; texture: string }>; moves?: Record<string, string> };
const side = (kind: string): SideData => readJson(`src/ui/side-motion/${kind}.json`) as SideData;
const cues = (cueTable as { cues: FxCue[] }).cues;
const kindsReport = (report as { kinds: Record<string, Record<string, { src_frames?: number[] }>> }).kinds;

/** 這隻魔物（含各階段）有沒有這一招 */
function labelsOf(enemyId: string): Set<string> {
  const def = enemyById[enemyId] as unknown as { moves: { label: string }[]; phases?: { moves?: { label: string }[] }[] };
  return new Set([...def.moves, ...(def.phases ?? []).flatMap((p) => p.moves ?? [])].map((m) => m.label));
}
const ENEMY_OF: Record<string, string> = { iron_claw: 'iron_claw', iron_claw_p2: 'iron_claw', roomba_king: 'roomba_king', lantern_ghost: 'lantern_ghost',
  orange_king: 'orange_king', orange_king_p2: 'orange_king', frog_daimyo: 'frog_daimyo', tanuki_lord: 'tanuki_lord',
  daxia_p1: 'tower_master', daxia_p2: 'tower_master', daxia_p3: 'tower_master' };

describe('特效提示表（fx/cues.json）：寫錯字會紅', () => {
  it('每一條：特效有打包、誰是真的逐格套或魔物編號、招式名是那隻真的有的招、關鍵格查得到', () => {
    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) {
      expect(fxExists(cue.fx), cue.fx).toBe(true);
      const isKind = (SIDE_MOTION_KINDS as readonly string[]).includes(cue.owner);
      const enemyId = isKind ? ENEMY_OF[cue.owner] : /^enemy:([a-z_]+)(@\d+)?$/.exec(cue.owner)?.[1];
      expect(enemyId && enemyById[enemyId], cue.owner).toBeTruthy();
      expect(/^(death|change|attack|aura|seclude|move:.+)$/.test(cue.on), cue.on).toBe(true);
      if (cue.on.startsWith('move:')) expect(labelsOf(enemyId!).has(cue.on.slice(5)), `${cue.owner} ${cue.on}`).toBe(true);
      if (typeof cue.at === 'string') {
        expect(isKind, '關鍵格名只能用在逐格套').toBe(true);
        const data = side(cue.owner);
        const action = cue.on === 'death' ? 'knockdown' : 'attack';
        const motion = data.actions[action] ?? data.late?.[action];
        expect(motion?.marks?.[cue.at], `${cue.owner} ${action} 的 ${cue.at}`).toBeTypeOf('number');
      }
    }
  });

  it('第一批的五個地方都有：鐵爪一二階、掃地機王倒下爆炸，鐵爪二階全開、燈籠妖吐火打到身上', () => {
    expect(fxNamesFor(['iron_claw'])).toContain('blast_large');
    expect(fxCuesFor(['iron_claw_p2'], 'death').map((c) => c.fx)).toContain('blast_large');
    expect(fxCuesFor(['roomba_king'], 'death').length).toBeGreaterThan(0);
    expect(fxCuesFor(['iron_claw_p2'], 'move:全開').every((c) => c.host === 'target')).toBe(true);
    expect(fxCuesFor(['lantern_ghost'], 'move:吐火').every((c) => c.host === 'target')).toBe(true);
    expect(fxCuesFor(['lantern_ghost'], 'move:舔火')).toEqual([]);
  });

  it('提示時間：數字照用，關鍵格名照那一段的 marks', () => {
    const marks = side('iron_claw').late!.knockdown!.marks!;
    expect(fxCueDelay({ owner: 'x', on: 'death', fx: 'f', at: 'spark' }, marks)).toBe(marks.spark);
    expect(marks.spark).toBeGreaterThan(150);   // 第 22 格（片段從第 16 格起、每 2 格取 1）＝第 3 格
    expect(fxCueDelay({ owner: 'x', on: 'death', fx: 'f', at: 250 }, marks)).toBe(250);
    expect(fxCueDelay({ owner: 'x', on: 'death', fx: 'f', at: 'nope' }, marks)).toBe(0);
    expect(fxOwnersOf('tower_master', 2)).toEqual(['enemy:tower_master', 'enemy:tower_master@2']);
  });

  it('倒下的特效在倒下片段演完（＋換場前 300 毫秒）之前就收得差不多：不會被換場砍在半路', () => {
    for (const cue of cues.filter((c) => c.on === 'death')) {
      const data = side(cue.owner);
      const motion = (data.actions.knockdown ?? data.late?.knockdown) as unknown as { frames: { duration: number }[]; marks?: Record<string, number> };
      const clipMs = motion.frames.reduce((a, f) => a + f.duration * 1000, 0);
      const fx = fxData(cue.fx);
      const fxMs = fx.frames.reduce((a, f) => a + f.duration * 1000, 0) / (cue.speed ?? 1);
      expect(fxCueDelay(cue, motion.marks) + fxMs, `${cue.owner} ${cue.fx}`).toBeLessThanOrEqual(clipMs + 300);
    }
  });
});

describe('一階塔主倒下＋橘皮大王二階新片段（打包結果）', () => {
  it('四隻一階都帶倒下，放在 late（不算就緒），長度 ≤ 3 秒', () => {
    for (const kind of ['iron_claw', 'frog_daimyo', 'orange_king', 'tanuki_lord']) {
      const data = side(kind);
      expect(data.actions.knockdown, kind).toBeUndefined();
      const late = data.late?.knockdown as unknown as { texture: string; frames: { duration: number }[] };
      expect(late.texture).toBe(`assets/motion/side/${kind}-down.webp`);
      const ms = late.frames.reduce((a, f) => a + f.duration * 1000, 0);
      expect(ms).toBeGreaterThan(2500);
      expect(ms).toBeLessThanOrEqual(3010);
    }
  });

  it('模型自己加的白光格剪掉：橘皮大王第 62～63 格、狸大人第 55～59 格都不在圖集裡', () => {
    const orange = kindsReport.orange_king!.knockdown!.src_frames!;
    const tanuki = kindsReport.tanuki_lord!.knockdown!.src_frames!;
    for (const f of [62, 63]) expect(orange).not.toContain(f);
    for (const f of [55, 56, 57, 58, 59]) expect(tanuki).not.toContain(f);
    expect(kindsReport.iron_claw!.knockdown!.src_frames![0]).toBe(16);   // 前 16 格只是站著
  });

  it('橘皮大王二階：「龍捲滾」播 roll_p2、「蓄力」播 burst_p2（盤點的爆刺）；其他招照舊', () => {
    const data = side('orange_king_p2');
    expect(data.moves).toEqual({ 龍捲滾: 'roll_p2', 蓄力: 'burst_p2' });
    expect(data.extras?.roll_p2?.texture).toBe('assets/motion/side/orange_king-roll_p2.webp');
    expect(data.extras?.burst_p2?.texture).toBe('assets/motion/side/orange_king-burst_p2.webp');
    for (const label of Object.keys(data.moves!)) expect(labelsOf('orange_king').has(label)).toBe(true);
  });
});

/* ---------- 晚下載的倒下：圖到了才算有 ---------- */

class FakeImage {
  static instances: FakeImage[] = [];
  constructor() { FakeImage.instances.push(this); }
  complete = true;
  naturalWidth = 100;
  private value = '';
  set src(value: string) { this.value = value; }
  get src(): string { return this.value; }
  async decode(): Promise<void> {}
}

describe('一階倒下晚下載（late）：圖到了才算有倒下，沒到就一致退回靜態倒下', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeImage.instances = [];
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null, setAttribute() {}, style: {} }) });
    vi.stubGlobal('window', { devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  });
  afterEach(() => vi.unstubAllGlobals());
  const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

  it('就緒不等倒下那張；排了才下載；下載好之前 enemyMotionHas／playsLongDeath 都說沒有', async () => {
    const motion = await import('../../src/ui/enemy-motion');
    (await import('../../src/ui/heavy-lane'))._resetHeavyLaneForTest();
    await motion.preloadEnemyMotion(['iron_claw']);
    expect(motion.enemyMotionReady('iron_claw')).toBe(true);
    expect(FakeImage.instances.some((i) => i.src.includes('iron_claw-down.webp'))).toBe(false);
    expect(motion.enemyMotionHas('iron_claw', 'knockdown')).toBe(false);
    expect(motion.playsLongDeath('iron_claw')).toBe(false);
    await motion.prefetchEnemyMotionLate('iron_claw');
    await flush();
    const down = FakeImage.instances.find((i) => i.src.includes('iron_claw-down.webp'))!;
    expect(down).toBeDefined();
    expect(motion.enemyMotionHas('iron_claw', 'knockdown')).toBe(true);
    expect(motion.playsLongDeath('iron_claw')).toBe(true);
    expect(motion.enemyMotionDuration('iron_claw', 'knockdown')).toBeGreaterThan(2500);
    expect(motion.enemyMotionMarks('iron_claw', 'knockdown')?.spark).toBeTypeOf('number');
    // 下載壞掉（或還在抓）：又說沒有，倒下照舊靜態
    down.naturalWidth = 0;
    expect(motion.enemyMotionHas('iron_claw', 'knockdown')).toBe(false);
    expect(motion.playsLongDeath('iron_claw')).toBe(false);
  });
});

/* ---------- 特效圖層本身（假的畫布、假的宿主） ---------- */

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

function fakeEnv() {
  let nextId = 1;
  const rafs = new Map<number, (t: number) => void>();
  const timers = new Map<number, { cb: () => void; at: number }>();
  let now = 0;
  const draws: number[] = [];
  const env: FxEnv = {
    createCanvas: () => {
      const node = fakeNode() as unknown as HTMLCanvasElement & Node;
      Object.assign(node, {
        style: {}, className: '', width: 0, height: 0,
        classList: { contains: (k: string) => (node as unknown as { className: string }).className.split(' ').includes(k) },
        setAttribute() {},
        getContext: () => ({ setTransform() {}, clearRect() {}, drawImage: () => { draws.push(now); } }),
      });
      return node;
    },
    hostHeight: () => 280,
    dpr: () => 2,
    requestFrame: (cb) => { const id = nextId++; rafs.set(id, cb); return id; },
    cancelFrame: (id) => { rafs.delete(id); },
    setTimer: (cb, ms) => { const id = nextId++; timers.set(id, { cb, at: now + ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
  };
  const advance = (ms: number, step = 16): void => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + step);
      for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.cb(); }
      const pending = [...rafs.values()];
      rafs.clear();
      for (const cb of pending) cb(now);
    }
  };
  return { env, advance, draws };
}

const SPRITE = {
  texture: 'assets/motion/fx/test.webp', scale: 1,
  frames: Array.from({ length: 10 }, (_, i) => ({ rect: [i * 10, 0, 100, 80] as [number, number, number, number], pivot: [50, 40] as [number, number], duration: 1 / 12 })),
};

describe('特效圖層：掛上去、跟著框搬家、播完收掉、不擋點擊、在名字血條底下', () => {
  beforeEach(() => { _setFxForTest('test', SPRITE, { complete: true, naturalWidth: 100 } as unknown as HTMLImageElement); });

  it('純計算：外框與中心點、第幾格（循環繞回、不循環播完回 -1）', () => {
    expect(fxBounds(SPRITE, 2)).toEqual({ width: 200, height: 160, cx: 100, cy: 80 });
    expect(fxFrameAt(SPRITE, 0, 1, false)).toBe(0);
    expect(fxFrameAt(SPRITE, 840, 1, false)).toBe(-1);
    expect(fxFrameAt(SPRITE, 840, 1, true)).toBe(0);
    expect(fxFrameAt(SPRITE, 420, 2, false)).toBe(-1);
  });

  it('延遲後掛進宿主前面一層（z-index 1、不吃點擊）；框被重畫換掉就搬到新框；播完自己拿掉', () => {
    const { env, advance } = fakeEnv();
    let box = fakeNode();
    const handle = playFx({ owner: 'x', on: 'death', fx: 'test', at: 100, x: 0.1, y: 0.5 }, () => box as unknown as HTMLElement, 100, env)!;
    const canvas = handle.element as unknown as Node & { style: Record<string, string>; className: string };
    expect(canvas.parentNode).toBe(null);
    advance(120);
    expect(canvas.parentNode).toBe(box);
    expect(canvas.style.pointerEvents).toBe('none');
    expect(canvas.style.zIndex).toBe('1');
    expect(canvas.className).toBe('fx-layer');
    // 中心點在腳底往上 0.5×280、往右 0.1×280：bottom＝140－(80－40)、translateX＝28－50
    expect(canvas.style.bottom).toBe('100px');
    expect(canvas.style.transform).toBe('translateX(-22px)');
    const moved = fakeNode();
    box = moved;
    advance(32);
    expect(canvas.parentNode).toBe(moved);
    advance(1000);
    expect(canvas.parentNode).toBe(null);
    expect(handle.done).toBe(true);
  });

  it('前面那層一直排在框的最後：主角或魔物的逐格畫布（同樣 z-index 1）後來才掛上去，也不會把爆炸蓋掉', () => {
    const { env, advance } = fakeEnv();
    const box = fakeNode();
    const handle = playFx({ owner: 'x', on: 'death', fx: 'test' }, () => box as unknown as HTMLElement, 0, env)!;
    advance(16);
    const heroCanvas = fakeNode();
    box.append(heroCanvas);   // 主角換姿勢重掛逐格畫布
    advance(32);
    expect(box.children.at(-1)).toBe(handle.element as unknown as Node);
  });

  it('兩支前層特效同框：只排在非特效的東西後面，彼此不互相搬來搬去', () => {
    const { env, advance } = fakeEnv();
    const box = fakeNode();
    const one = playFx({ owner: 'x', on: 'death', fx: 'test' }, () => box as unknown as HTMLElement, 0, env)!;
    const two = playFx({ owner: 'x', on: 'death', fx: 'test' }, () => box as unknown as HTMLElement, 0, env)!;
    advance(16);
    const order = (): Node[] => [...box.children];
    const first = order();
    let moves = 0;
    const origAppend = box.append.bind(box);
    box.append = (n: Node) => { moves += 1; origAppend(n); };
    advance(160);
    expect(moves).toBe(0);
    expect(order()).toEqual(first);
    expect(first).toEqual([one.element as unknown as Node, two.element as unknown as Node]);
  });

  it('延遲是負的（倒下片段比特效早開演）：從該有的進度接著播，不從第一格重來', () => {
    const { env, advance } = fakeEnv();
    const box = fakeNode();
    const late = playFx({ owner: 'x', on: 'death', fx: 'test' }, () => box as unknown as HTMLElement, -500, env)!;
    advance(16);
    // 10 格×83 毫秒＝833 毫秒；已經過了 500，再 400 毫秒就該播完
    advance(400);
    expect(late.done).toBe(true);
  });

  it('後面那層插在地上的影子後面、立繪前面（z-index 0）', () => {
    const { env, advance } = fakeEnv();
    const box = fakeNode();
    const shadow = fakeNode();
    const sprite = fakeNode();
    box.append(shadow);
    box.append(sprite);
    const handle = playFx({ owner: 'x', on: 'death', fx: 'test', layer: 'back' }, () => box as unknown as HTMLElement, 0, env)!;
    advance(16);
    expect(box.children.indexOf(handle.element as unknown as Node)).toBe(1);
    expect((handle.element as unknown as { style: Record<string, string> }).style.zIndex).toBe('0');
  });

  it('圖集還沒到：這一次不放（不等、不卡）', () => {
    _setFxForTest('test', SPRITE, { complete: false, naturalWidth: 0 } as unknown as HTMLImageElement);
    const { env } = fakeEnv();
    expect(playFx({ owner: 'x', on: 'death', fx: 'test' }, () => fakeNode() as unknown as HTMLElement, 0, env)).toBeUndefined();
  });

  it('宿主不見了（那一格被拿掉）：收掉', () => {
    const { env, advance } = fakeEnv();
    let box: Node | null = fakeNode();
    const handle = playFx({ owner: 'x', on: 'death', fx: 'test' }, () => box as unknown as HTMLElement, 0, env)!;
    advance(16);
    box = null;
    advance(32);
    expect(handle.done).toBe(true);
  });

  it('氣場（aura，給師父）：補上一次就一直循環、重畫不重來、框換了跟著搬；換階段（表上沒了）淡出收掉', () => {
    const { env, advance } = fakeEnv();
    const layer = createFxLayer(env);
    let box = fakeNode();
    const aura: FxCue = { owner: 'enemy:tower_master@0', on: 'aura', fx: 'test', fadeOutMs: 200 };
    layer.syncAura('e3', [aura], () => box as unknown as HTMLElement);
    advance(16);
    const first = box.children[0];
    expect(first).toBeDefined();
    advance(2000);   // 遠超過一輪（830 毫秒）：還在
    expect(first!.parentNode).toBe(box);
    box = fakeNode();
    layer.syncAura('e3', [aura], () => box as unknown as HTMLElement);   // 重畫：不重來
    advance(16);
    expect(box.children).toEqual([first]);
    expect(layer.size).toBe(1);
    layer.syncAura('e3', [], () => box as unknown as HTMLElement);   // 換階段：表上沒了
    expect(first!.parentNode).toBe(box);   // 淡出中
    advance(260);
    expect(first!.parentNode).toBe(null);
    expect(layer.size).toBe(0);
  });

  it('換場：全部停下、不拔（舊畫面墊在底下淡出時還看得到）', () => {
    const { env, advance } = fakeEnv();
    const layer = createFxLayer(env);
    const box = fakeNode();
    layer.fire([{ owner: 'x', on: 'death', fx: 'test' }], () => () => box as unknown as HTMLElement);
    advance(16);
    expect(box.children.length).toBe(1);
    layer.dispose();
    advance(2000);
    expect(box.children.length).toBe(1);
  });
});

/* ---------- combat.ts 的接線（跑真正那幾段） ---------- */

function sourceBetween(start: string, end: string): string {
  const normalized = SRC.replace(/\r\n/g, '\n');
  const first = normalized.indexOf(start);
  const last = normalized.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到 combat.ts 的這一段：${start}`);
  return normalized.slice(first, last);
}

describe('combat.ts：什麼時候放、放在誰身上', () => {
  const helpers = sourceBetween('  const fireDeathFx = ', '  const mountEnemyMotion = (');
  const targetsSrc = sourceBetween('    fxTargetSeats = () => ', '    // 換階段的變身要在重畫之前登記');

  async function run(opts: { stateAction?: string; label: string; attacked: boolean; seats: { seat: number; was: [number, number]; now: [number, number] }[]; call: string }) {
    const fired: { cues: FxCue[]; host: string | undefined; marks: unknown }[] = [];
    const bindings: Record<string, unknown> = {
      enemyMotionActors: new Map(opts.stateAction ? [[7, { kind: 'iron_claw_p2', action: opts.stateAction, clip: undefined }]] : []),
      fxLayer: { fire: (cues: FxCue[], hostOf: (c: FxCue) => (() => unknown) | undefined, marks: unknown) => {
        for (const c of cues) { const h = hostOf(c); fired.push({ cues: [c], host: h ? String(h()) : undefined, marks }); }
      } },
      fxCuesFor, fxOwnersOf,
      enemyBoxOf: (uid: number) => () => `enemy${uid}`,
      playerBoxOf: (seat: number) => () => `player${seat}`,
      enemyMotionMarks: (kind: string, action: string) => ({ kind, action, hit: 491, spark: 243 }),
      enemyMotionMoveClip: () => undefined,
      qiuqiuEnemyMotionKind: (id: string, phase: number) => (id === 'iron_claw' ? (phase > 0 ? 'iron_claw_p2' : 'iron_claw') : id),
      cs: { players: opts.seats.map((s) => ({ seat: s.seat, hp: s.now[0], block: s.now[1] })) },
      before: { players: new Map(opts.seats.map((s) => [s.seat, { hp: s.was[0], block: s.was[1] }])) },
      comparison: undefined,
      fxTargetSeats: () => [],
    };
    const code = (await transformWithOxc(`${helpers}\n${targetsSrc}\n${opts.call}`, 'fx-wiring.ts')).code;
    new Function(...Object.keys(bindings), 'e', 'act', code)(...Object.values(bindings), { uid: 7, enemyId: 'iron_claw', phase: 1 }, { label: opts.label, attacked: opts.attacked });
    return fired;
  }

  it('鐵爪二階「全開」：爆炸打在這一拍血或蜷縮少了的那一位身上（看引擎狀態），時間照雷射片段的 hit', async () => {
    const fired = await run({ label: '全開', attacked: true, call: 'fireMoveFx(e, 1, act);',
      seats: [{ seat: 0, was: [50, 0], now: [50, 0] }, { seat: 1, was: [40, 5], now: [33, 0] }] });
    expect(fired.map((f) => f.host)).toEqual(['player1']);
    expect(fired[0]!.cues[0]!.fx).toBe('blast_small');
    expect((fired[0]!.marks as { hit: number }).hit).toBe(491);
  });

  it('閃過（血與蜷縮都沒少）：不放；別的招（卡住）：不放', async () => {
    expect(await run({ label: '全開', attacked: true, call: 'fireMoveFx(e, 1, act);', seats: [{ seat: 0, was: [50, 0], now: [50, 0] }] })).toEqual([]);
    expect(await run({ label: '卡住', attacked: false, call: 'fireMoveFx(e, 1, act);', seats: [{ seat: 0, was: [50, 0], now: [40, 0] }] })).toEqual([]);
  });

  it('倒下片段比這裡早開演（分段擊殺）：特效扣掉片段已經演的時間', async () => {
    const offsets: number[] = [];
    const bindings: Record<string, unknown> = {
      enemyMotionActors: new Map([[7, { kind: 'iron_claw_p2', action: 'knockdown', busyUntil: 10_000 }]]),
      fxLayer: { fire: (_c: unknown, _h: unknown, _m: unknown, played: number) => { offsets.push(played); } },
      fxCuesFor, fxOwnersOf,
      enemyBoxOf: () => () => 'box', playerBoxOf: () => () => 'p',
      enemyMotionMarks: () => ({}), enemyMotionMoveClip: () => undefined,
      enemyMotionDuration: () => 2667,
      performance: { now: () => 10_000 - 2667 + 450 },   // 片段已經演了 450 毫秒
      qiuqiuEnemyMotionKind: () => 'iron_claw_p2',
    };
    const code = (await transformWithOxc(`${helpers}\nfireDeathFx(e);`, 'fx-death-offset.ts')).code;
    new Function(...Object.keys(bindings), 'e', code)(...Object.values(bindings), { uid: 7, enemyId: 'iron_claw', phase: 1 });
    expect(offsets).toEqual([450]);
  });

  it('倒下：逐格倒下真的在演才放那一套的提示（照倒下的關鍵格），退回靜態倒下的不放', async () => {
    const playing = await run({ stateAction: 'knockdown', label: '', attacked: false, call: 'fireDeathFx(e);', seats: [] });
    expect(playing.map((f) => `${f.cues[0]!.owner}:${f.cues[0]!.fx}@${f.host}`)).toEqual(['iron_claw_p2:blast_large@enemy7', 'iron_claw_p2:blast_small@enemy7']);
    expect((playing[0]!.marks as { action: string }).action).toBe('knockdown');
    expect(await run({ label: '', attacked: false, call: 'fireDeathFx(e);', seats: [] })).toEqual([]);
    expect(await run({ stateAction: 'idle', label: '', attacked: false, call: 'fireDeathFx(e);', seats: [] })).toEqual([]);
  });
});

describe('combat.ts：一階倒下的下載排在哪', () => {
  const prefetchSource = sourceBetween('    for (const enemy of cs.enemies) {\n      const now = ', '\n  }\n\n  const refreshMotion');
  async function order(phaseChangesBeforeLate: boolean, fightEndsAfterExtras = false): Promise<string[]> {
    const got: string[] = [];
    const boss = { uid: 1, enemyId: 'iron_claw', phase: 0 };
    const cs = { enemies: [boss] };
    const app = { cs: cs as unknown };
    const bindings: Record<string, unknown> = {
      cs, app, ended: false,
      qiuqiuEnemyMotionKind: (id: string, phase: number) => (phase > 0 ? `${id}_p2` : id),
      preloadEnemyMotion: () => Promise.resolve(),
      prefetchEnemyMotion: (k: string) => { got.push(`先下載:${k}`); return Promise.resolve(); },
      prefetchEnemyMotionExtras: (k: string) => {
        got.push(`片段:${k}`);
        if (phaseChangesBeforeLate && k === 'iron_claw') boss.phase = 1;
        if (fightEndsAfterExtras && k === 'iron_claw') app.cs = null;   // 打完換畫面了
        return Promise.resolve();
      },
      prefetchEnemyMotionLate: (k: string) => { got.push(`倒下:${k}`); return Promise.resolve(); },
      fxOwnersOf, fxNamesFor,
      syncAllAuras() {},   // 特效圖集到了補一次氣場（師父，2026-10-01）
      prefetchFx: (names: string[]) => { got.push(`特效:${names.join(',')}`); return Promise.resolve(); },
    };
    const code = (await transformWithOxc(prefetchSource, 'fx-prefetch.ts')).code;
    new Function(...Object.keys(bindings), code)(...Object.values(bindings));
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    return got;
  }

  it('第二階段出招爆炸 → 這一階段招式片段 → 一階倒下 → 這一場的特效 → 第二階段招式片段', async () => {
    expect(await order(false)).toEqual(['先下載:iron_claw_p2', '片段:iron_claw', '倒下:iron_claw', '特效:blast_large,blast_small', '片段:iron_claw_p2']);
  });

  it('排到一階倒下時已經打到第二階段（慢網路常見）：不抓一階倒下，特效照排', async () => {
    expect(await order(true)).toEqual(['先下載:iron_claw_p2', '片段:iron_claw', '特效:blast_large,blast_small', '片段:iron_claw_p2']);
  });

  it('這一場已經打完（換了畫面）：一階倒下、特效、二階招式片段都不再排', async () => {
    expect(await order(false, true)).toEqual(['先下載:iron_claw_p2', '片段:iron_claw']);
  });
});
