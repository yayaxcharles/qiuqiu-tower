/**
 * 慢網路修正（2026-09-30，量測報告 `docs/量測_慢網路聲音與卡頓_20260930.md`；修正報告 `docs/修正_慢網路載入_20260930.md`）。
 *
 * 釘住五件事（拿掉修正會紅）：
 *  1. 開局（`warmRun`）的下載順序：地圖底圖 → 節點圖示 → 全部音效 → （戰鬥程式、配音）→ 才輪到原本的背景那批；
 *     第一步走得到的魔物與起手牌面要等這一層到齊才開始。
 *  2. 開打前（`startFight`）不再等主角三十張姿勢，姿勢改背景暖；戰鬥畫面程式有上限。
 *  3. 下一步走得到的戰鬥格：魔物（含召喚、換階段）插隊預載，只挑下一步、同一張不重送。
 *  4. 條件式進度條：快網路（250 毫秒內齊）完全不出現；慢網路出現、齊了收；進地圖前最多 8 秒放行。
 *  5. 全部音效開局就抓：第一次點地圖格子的腳步聲不必現抓（原本 500 毫秒沒到就整個不播）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import APP_RAW from '../../src/ui/app.ts?raw';
import MAP_RAW from '../../src/ui/screens/map.ts?raw';
import { _setManifestForTest, warmed, releaseHeldArt, type Manifest } from '../../src/ui/assets';
import { enemies } from '../../src/content/enemies';
import { cards } from '../../src/content/cards';
import { newRun } from '../../src/engine/run';
import { nextChoices } from '../../src/engine/map';
import { encounterById } from '../../src/content/enemies';
import { pick, planPick } from '../../src/content/dialogue';

const log = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock('../../src/ui/screens/combat', () => ({}));
vi.mock('../../src/ui/voicegate', async (orig) => ({
  ...(await orig<typeof import('../../src/ui/voicegate')>()),
  warmVoice: () => { log.order.push('voice'); return Promise.resolve(); },
}));
vi.mock('../../src/ui/preload', async (orig) => ({
  ...(await orig<typeof import('../../src/ui/preload')>()),
  preloadHeroArt: () => { log.order.push('background'); return Promise.resolve(); },
}));

const { warmRun, runProgress, gateProgress, MAP_GATE_MS, FIRST_POSES } = await import('../../src/ui/netload');
const { NODE_ICON, nextFightUrls, preloadNextFights } = await import('../../src/ui/preload');

const APP = APP_RAW.replace(/\r\n/g, '\n');
const MAP = MAP_RAW.replace(/\r\n/g, '\n');
const A = (p: string): string => `assets/${p}.webp`;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
const POSES = ['idle', 'attack', 'hurt', 'block', 'down'] as const;

/** 假清單：地圖底圖、節點與地圖上的貓、全部牌面、全部魔物（含換階段那組）都有圖 */
function fakeManifest(): Manifest {
  const monsters: Manifest['monsters'] = {};
  for (const e of enemies) {
    for (const key of [e.art, ...(e.phases ?? []).map((_, i) => `${e.art}_p${i + 2}`)]) {
      monsters[key] = Object.fromEntries(POSES.map((p) => [p, A(`monsters/${key.replace(/\//g, '_')}_${p}`)]));
    }
  }
  return {
    ...EMPTY,
    bg: { 'bg/map_tall': A('bg/map_tall') },
    sprites: Object.fromEntries(FIRST_POSES.map((k) => [k, A(`sprites/${k}`)])),
    icons: Object.fromEntries([...Object.values(NODE_ICON), 'icon/map_hero_low'].map((k) => [k, A(`icons/${k}`)])),
    cards: Object.fromEntries(cards.map((c) => [c.art, A(`cards/${c.art}`)])),
    monsters,
  };
}

/** 假 Image：設網址那一刻記下（連同優先權），`decode` 立刻好 */
class FakeImage {
  fetchPriority: string | undefined;
  private v = '';
  set src(v: string) { this.v = v; log.order.push(`img:${v}`); if (this.fetchPriority) log.order.push(`prio:${this.fetchPriority}`); }
  get src(): string { return this.v; }
  decode(): Promise<void> { return Promise.resolve(); }
}

async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); }

beforeEach(() => {
  log.order.length = 0;
  warmed.clear();
  releaseHeldArt();
  vi.stubGlobal('Image', FakeImage);
  _setManifestForTest(fakeManifest());
});
afterEach(() => {
  _setManifestForTest(EMPTY);
  warmed.clear();
  releaseHeldArt();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('1. 開局的下載順序（warmRun）', () => {
  it('地圖底圖 → 節點圖示 → 全部音效 → 配音，都比原本的背景那批先送出；全部插隊', () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn((u: string) => { fetched.push(u); log.order.push(`fetch:${u}`); return new Promise<Response>(() => undefined); }));
    const run = newRun('netload-order', 1, 'ninja');
    warmRun(run, 0);
    const o = log.order.filter((x) => !x.startsWith('prio:'));
    expect(o[0], '第一個就是地圖底圖').toBe('img:/assets/bg/map_tall.webp');
    const icons = o.slice(1, 9);
    expect(new Set(icons)).toEqual(new Set([...Object.values(NODE_ICON), 'icon/map_hero_low'].map((k) => `img:/assets/icons/${k}.webp`)));
    const sfx = o.slice(9, 9 + 28);
    expect(sfx.every((x) => x.startsWith('fetch:/assets/sfx/')), '接著是 28 個音效').toBe(true);
    expect(sfx[0], '腳步聲排第一（慢網路最常被跳過的）').toBe('fetch:/assets/sfx/step.mp3');
    expect(o.slice(9 + 28)).toEqual(['voice', 'background']);
    // 圖片全部插隊（高優先）
    expect(log.order.filter((x) => x.startsWith('prio:')).length).toBe(9);
    expect(log.order.filter((x) => x.startsWith('prio:')).every((x) => x === 'prio:high')).toBe(true);
  });

  it('第一步走得到的魔物與起手牌面要等 A 層到齊才開始（不跟音效、程式搶）', async () => {
    const pending: ((r: Response) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => { pending.push(res); })));
    const run = newRun('netload-b', 1, 'ninja');
    warmRun(run, 0);
    await flush();
    const monsterish = (): string[] => log.order.filter((x) => x.includes('/monsters/') || x.includes('/cards/') || x.includes('/sprites/'));
    expect(monsterish(), 'A 還沒到齊').toEqual([]);
    const w = runProgress(run)!;
    expect(w.pr.total, '底圖＋8 圖示＋28 音效＋戰鬥畫面程式＋主角動作資料＋配音').toBe(1 + 8 + 28 + 1 + 1 + 1);
    expect(w.pr.done).toBeLessThan(w.pr.total);
    for (const res of pending) res({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response);
    await vi.waitFor(() => expect(w.pr.done).toBe(w.pr.total));
    await flush();
    const got = monsterish();
    expect(got.length).toBeGreaterThan(0);
    const floor1 = nextFightUrls(run).map((u) => `img:${u}`);
    for (const u of floor1) expect(got, '第一層三格的魔物').toContain(u);
    expect(got.some((x) => x.includes('/cards/')), '起手牌面').toBe(true);
    // 主角第一場最先換到的幾張姿勢（開打前不再等全部姿勢，改成這幾張先插隊）
    for (const k of FIRST_POSES) expect(got, k).toContain(`img:/assets/sprites/${k}.webp`);
  });
});

describe('2. 開打前（startFight）', () => {
  const fight = APP.slice(APP.indexOf('  startFight(encounterId'), APP.indexOf('  afterCombat('));
  it('等的那批只有這場魔物與手牌，主角姿勢改背景暖（不等）', () => {
    const call = fight.slice(fight.indexOf('warmEncounter('), fight.indexOf('\n', fight.indexOf('warmEncounter(')));
    expect(call).not.toContain('heroSpriteUrls');
    expect(fight).toContain('void decodeAll(heroSpriteUrls(run.players.map((p) => p.hero)), 3, false);');
    expect(APP).toContain('const ENCOUNTER_WAIT_MS = 3000;');
  });
  it('戰鬥畫面程式有上限（8 秒），到了照樣換過去', () => {
    expect(fight).toContain('Promise.race([combatScreenReady, new Promise<void>((r) => window.setTimeout(r, COMBAT_CODE_WAIT_MS))])');
    expect(APP).toContain('const COMBAT_CODE_WAIT_MS = 8000;');
  });
  it('這場的吐槽先抽好、先抓配音（只抓這一場的四句）', () => {
    expect(fight).toMatch(/prefetch\(\[\.\.\.\(firstNew \? \[\] : \[st\.battleStart\]\), st\.battleWin, st\.hungry, st\.lowHp\]\.map\(\(xs\) => \(\{ group: heroVoice\(heroSpeaker\(\)\), text: planPick\(xs\) \}\)\)\);/);
  });
  it('先抽好的那句，講的時候 pick 就是那一句；講完照舊不連抽同一句', () => {
    const xs = ['一', '二', '三', '四'];
    for (let n = 0; n < 20; n++) {
      const plan = planPick(xs);
      expect(planPick(xs), '還沒講之前再問一次也是同一句').toBe(plan);
      expect(pick(xs)).toBe(plan);
      expect(planPick(xs), '下一句不會跟剛講的一樣').not.toBe(plan);
      pick(xs);
    }
  });
});

describe('3. 下一步走得到的戰鬥格先預載', () => {
  it('開局＝第一層三格的魔物（含召喚、換階段），不含第二層', () => {
    const run = newRun('netload-next', 1, 'ninja');
    const urls = new Set(nextFightUrls(run));
    const first = nextChoices(run.map, null);
    expect(first.length).toBeGreaterThan(0);
    for (const n of first) for (const id of encounterById[n.encounterId!]!.enemies) {
      const art = enemies.find((e) => e.id === id)!.art;
      expect([...urls].some((u) => u.includes(`/monsters/${art.replace(/\//g, '_')}_idle`)), id).toBe(true);
    }
    const second = new Set(first.flatMap((n) => n.next));
    const onlySecond = [...second].flatMap((id) => encounterById[run.map.nodes.find((m) => m.id === id)!.encounterId ?? '']?.enemies ?? [])
      .filter((id) => !first.some((n) => encounterById[n.encounterId!]!.enemies.includes(id)));
    for (const id of onlySecond) {
      const art = enemies.find((e) => e.id === id)!.art;
      expect([...urls].some((u) => u.includes(`/monsters/${art.replace(/\//g, '_')}_`)), `第二層才有的 ${id}`).toBe(false);
    }
  });
  it('走了一步就換成那一格接下去的；插隊；同一張不重送（連線每投一票地圖重畫一次）', async () => {
    const run = newRun('netload-next2', 1, 'ninja');
    await preloadNextFights(run);
    const firstBatch = log.order.filter((x) => x.startsWith('img:'));
    expect(firstBatch.length).toBe(new Set(nextFightUrls(run)).size);
    expect(log.order.filter((x) => x.startsWith('prio:')).every((x) => x === 'prio:high')).toBe(true);
    log.order.length = 0;
    warmed.clear();   // 就算還沒解完（在路上），同一張也不重送
    await preloadNextFights(run);
    expect(log.order).toEqual([]);
    run.currentNode = nextChoices(run.map, null)[0]!.id;
    const next = nextFightUrls(run);
    for (const n of nextChoices(run.map, run.currentNode)) expect(n.floor).toBe(2);
    await preloadNextFights(run);
    expect(log.order.filter((x) => x.startsWith('img:')).length).toBeLessThanOrEqual(next.length);
  });
  it('地圖畫面每次畫出來都叫它', () => {
    expect(MAP).toContain('void preloadNextFights(run);');
  });
});

describe('4. 條件式進度條的時機（gateProgress）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  const deferred = (): { p: Promise<void>; ok: () => void } => { let ok = (): void => undefined; const p = new Promise<void>((r) => { ok = r; }); return { p, ok }; };

  it('快網路：250 毫秒內齊了就完全不出現', async () => {
    const d = deferred();
    const show = vi.fn(() => () => undefined);
    const done = gateProgress(d.p, show, MAP_GATE_MS);
    await vi.advanceTimersByTimeAsync(200);
    d.ok();
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(show).not.toHaveBeenCalled();
  });
  it('慢網路：過了 250 毫秒才出現，齊了就收', async () => {
    const d = deferred();
    const hide = vi.fn();
    const show = vi.fn(() => hide);
    let over = false;
    void gateProgress(d.p, show, MAP_GATE_MS).then(() => { over = true; });
    await vi.advanceTimersByTimeAsync(249);
    expect(show).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(show).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(over).toBe(false);
    d.ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(hide).toHaveBeenCalledOnce();
    expect(over).toBe(true);
  });
  it('一直沒齊：進地圖前最多 8 秒就放行', async () => {
    const hide = vi.fn();
    let over = false;
    void gateProgress(new Promise<void>(() => undefined), () => hide, MAP_GATE_MS).then(() => { over = true; });
    await vi.advanceTimersByTimeAsync(7999);
    expect(over).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(over).toBe(true);
    expect(hide).toHaveBeenCalledOnce();
    expect(MAP_GATE_MS).toBe(8000);
  });
});

describe('4b. 進地圖前的門檻（App.gateMap，原封不動切出來跑）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  function method(start: string): string {
    const a = APP.indexOf(start);
    if (a < 0) throw new Error(`找不到這一段：${start}`);
    return APP.slice(a, APP.indexOf('\n  }\n', a) + 4);
  }
  async function build(opts: { speed: 'fast' | 'slow' | null; w: { pr: { done: number; total: number }; ready: Promise<void> } | null }) {
    const body = method('  private gateMap(run: RunState, go: () => void): void {').replace('private ', '');
    const js = (await transformWithOxc(`class G { run: unknown = null; fightPending = false; stage: any; overlay: any; ${body} }\nreturn G;`, 'gate.ts')).code;
    const calls: string[] = [];
    const G = new Function('runProgress', 'knownNetSpeed', 'el', 'gateProgress', 'progressBar', 'i18nT', 'notice', 'MAP_GATE_MS', js)(
      () => opts.w,
      () => opts.speed,
      (_tag: string, attrs: { class: string }) => ({ className: attrs.class, isConnected: true, remove() { this.isConnected = false; calls.push('cover-removed'); } }),
      gateProgress,
      () => { calls.push('bar'); return () => calls.push('bar-hidden'); },
      (s: string) => s,
      (s: string) => calls.push(`notice:${s}`),
      MAP_GATE_MS,
    ) as new () => { run: unknown; fightPending: boolean; stage: unknown; overlay: unknown; gateMap(run: unknown, go: () => void): void };
    const g = new G();
    g.stage = { insertBefore: (c: { className: string }) => calls.push(`cover:${c.className}`), classList: { add: () => calls.push('lock'), remove: () => calls.push('unlock') } };
    return { g, calls };
  }

  it('A 層已經齊了：當下就進地圖，不蓋、不出進度條', async () => {
    const run = {};
    const { g, calls } = await build({ speed: 'slow', w: { pr: { done: 5, total: 5 }, ready: Promise.resolve() } });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go);
    expect(go).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });
  it('量到快網路：不擋（續玩那一下不能比以前慢）', async () => {
    const run = {};
    const { g, calls } = await build({ speed: 'fast', w: { pr: { done: 1, total: 5 }, ready: new Promise(() => undefined) } });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go);
    expect(go).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });
  it('慢網路沒齊：當下先蓋、鎖住，250 毫秒後才出進度條；最多 8 秒放行並公告一次', async () => {
    const run = {};
    const { g, calls } = await build({ speed: 'slow', w: { pr: { done: 1, total: 5 }, ready: new Promise(() => undefined) } });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go);
    expect(calls).toEqual(['cover:net-gate', 'lock']);
    expect(go).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toContain('bar');
    await vi.advanceTimersByTimeAsync(MAP_GATE_MS);
    expect(go).toHaveBeenCalledOnce();
    expect(calls).toContain('unlock');
    expect(calls).toContain('bar-hidden');
    expect(calls.filter((c) => c.startsWith('notice:'))).toHaveLength(1);
  });
  it('等的時候這一局被丟掉（連線斷了回標題拆掉蓋層）：不接', async () => {
    const run = {};
    const d: { ok?: () => void } = {};
    const { g, calls } = await build({ speed: 'slow', w: { pr: { done: 1, total: 5 }, ready: new Promise((r) => { d.ok = r; }) } });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go);
    g.run = null;
    d.ok!();
    await vi.advanceTimersByTimeAsync(10);
    expect(go).not.toHaveBeenCalled();
    expect(calls).toContain('cover-removed');
  });
  it('序章播完、續玩兩個入口都走門檻；換畫面時蓋層算「蓋著」（不淡入、不墊舊畫面）', () => {
    expect(method('  afterPrologue(): void {')).toContain("this.gateMap(run, () => this.show(anyBlessingPending(run) ? 'blessing' : 'map'));");
    expect(method('  continueRun(from?: RunState): boolean {')).toContain("this.gateMap(run, () => this.show(anyBlessingPending(run) ? 'blessing' : 'map'));");
    expect(APP).toContain(".slide-overlay, .cine-overlay, .actwalk-overlay:not(.out), .net-gate'");
  });
});

describe('5. 全部音效開局就抓', () => {
  it('28 個一個不漏（對 public/assets/sfx 的檔案）；還沒解鎖只下載、不解碼', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { fetched.push(u); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response; }));
    vi.resetModules();
    const audio = await import('../../src/ui/audio');
    audio.preloadSfx();
    const files = readdirSync('public/assets/sfx').filter((f) => f.endsWith('.mp3')).map((f) => `/assets/sfx/${f}`);
    expect(new Set(fetched)).toEqual(new Set(files));
    expect(fetched).toHaveLength(28);
  });

  it('解鎖之後預載過的腳步聲：網路再卡，點下去當下就播', async () => {
    const starts: unknown[] = [];
    class Ctx {
      state = 'running'; currentTime = 0; destination = {};
      resume = async (): Promise<void> => undefined;
      decodeAudioData = async (): Promise<AudioBuffer> => ({ length: 1 } as AudioBuffer);
      createGain() { return { gain: { value: 0, setTargetAtTime: () => undefined }, connect: (t: unknown) => t }; }
      createBufferSource() { return { buffer: null, playbackRate: { value: 1 }, connect: (t: unknown) => t, start: () => { starts.push(1); } }; }
    }
    const ev = new EventTarget();
    vi.stubGlobal('window', Object.assign(ev, { localStorage: { getItem: () => null, setItem: () => undefined } }));
    vi.stubGlobal('AudioContext', Ctx);
    let net = true;
    vi.stubGlobal('fetch', vi.fn(() => (net ? Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response) : new Promise<Response>(() => undefined))));
    vi.resetModules();
    const audio = await import('../../src/ui/audio');
    audio.unlockOnFirstGesture();
    ev.dispatchEvent(new Event('pointerdown'));
    audio.preloadSfx();
    await flush();
    net = false;   // 之後網路整個卡住：沒預載的話 `step` 會等下載、500 毫秒後整個不播
    audio.play('step');
    expect(starts, '緩衝已在手上，當下就播').toHaveLength(1);
  });
});
