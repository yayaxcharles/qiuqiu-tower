/**
 * 慢網路修正（2026-09-30，量測報告 `docs/量測_慢網路聲音與卡頓_20260930.md`；修正報告 `docs/修正_慢網路載入_20260930.md`）。
 * 2026-10-01 審查後改寫：能驗行為的都改成驗行為，只剩少數「這一行有沒有接上」用原始碼比對。
 *
 * 釘住的事（拿掉修正會紅，修正報告第 5 節有逐項變異的紅燈數）：
 *  1. 開局（`startRun`）的下載順序：地圖底圖 → 節點圖示 → 全部音效 → 配音 → 才輪到原本的背景那批；
 *     B 層（狀態小圖示 → 第一步魔物 → 起手牌面 → 主角六張姿勢）要等 A 層到齊；六張姿勢第一場開打後放掉。
 *  2. 開打前：只等這場魔物與手牌、插隊、3 秒上限；進度條先收才換戰鬥畫面；吐槽先抽好先抓（四位角色含混搭，陣列是同一個物件）。
 *  3. 下一步走得到的戰鬥格：只挑下一步、同一張不重送、沒抓成的下次再試；戰鬥中那次不插隊。
 *  4. 條件式進度條：250 毫秒寬限、只在慢網路出現、最多 8 秒；進地圖前門檻（序章／續玩兩條路）、離開連線與重新同步拆蓋層並解鎖。
 *  5. 全部音效開局就抓。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import APP_RAW from '../../src/ui/app.ts?raw';
import MAP_RAW from '../../src/ui/screens/map.ts?raw';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import { _setManifestForTest, releaseHeldArt, warmed, type Manifest } from '../../src/ui/assets';
import { encounterById, enemies } from '../../src/content/enemies';
import { cards } from '../../src/content/cards';
import { newRun } from '../../src/engine/run';
import { nextChoices } from '../../src/engine/map';
import { pick, planPick, setCoopStory, storyFor } from '../../src/content/dialogue';
import { NODE_ICON, follow, relatedIds, urlsFor, warmEncounter, type Progress } from '../../src/ui/preload';
import { actVariantKey } from '../../src/ui/screenbg';
import { STATUS_ICON } from '../../src/ui/status-kind';

const log = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock('../../src/ui/screens/combat', () => ({}));

const run$ = await import('../../src/ui/netload-run');
const { ALL_SFX, FIRST_POSES, startRun, useRunDeps, nextFightUrls, preloadNextFights, dropFirstPoses, _heldFirstPosesForTest } = run$;
const { gateProgress, MAP_GATE_MS } = await import('../../src/ui/netload');

const APP = APP_RAW.replace(/\r\n/g, '\n');
const MAP = MAP_RAW.replace(/\r\n/g, '\n');
const COMBAT = COMBAT_RAW.replace(/\r\n/g, '\n');
const A = (p: string): string => `assets/${p}.webp`;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
const POSES = ['idle', 'attack', 'hurt', 'block', 'down'] as const;

/** 假清單：地圖底圖、節點與地圖上的貓、狀態圖示、全部牌面、全部魔物（含換階段那組）、主角六張姿勢都有圖 */
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
    icons: Object.fromEntries([...Object.values(NODE_ICON), 'icon/map_hero_low', ...Object.values(STATUS_ICON)].map((k) => [k, A(`icons/${k}`)])),
    sprites: Object.fromEntries(FIRST_POSES.map((k) => [k, A(`sprites/${k}`)])),
    cards: Object.fromEntries(cards.map((c) => [c.art, A(`cards/${c.art}`)])),
    monsters,
  };
}

/** 假 Image：設網址那一刻記下（連同優先權）；`decode` 預設立刻好，`FakeImage.decode` 可換 */
class FakeImage {
  static decode: (src: string) => Promise<void> = () => Promise.resolve();
  fetchPriority: string | undefined;
  private v = '';
  set src(v: string) { this.v = v; log.order.push(`img:${v}`); log.order.push(`prio:${this.fetchPriority ?? 'auto'}`); }
  get src(): string { return this.v; }
  decode(): Promise<void> { return FakeImage.decode(this.v); }
}

async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await Promise.resolve(); }
const imgs = (): string[] => log.order.filter((x) => x.startsWith('img:'));

/** 開局要的那幾支：首載那幾支照真的給，只把「背景那批」與「配音」換成記錄 */
function deps(preloadSfx: (names: readonly string[]) => Promise<unknown>[]): Parameters<typeof startRun>[3] {
  return {
    NODE_ICON, follow, relatedIds, urlsFor, actVariantKey,
    preloadSfx: preloadSfx as never,
    preloadHeroArt: () => { log.order.push('background'); return Promise.resolve(); },
    warmVoice: () => { log.order.push('voice'); return Promise.resolve(); },
  };
}
/** 音效：不經音訊環境，照 `audio.ts` 還沒解鎖那條路直接 fetch（這裡要驗的是順序） */
const sfxFetch = (names: readonly string[]): Promise<unknown>[] => names.map((n) => fetch(`/assets/sfx/${n}.mp3`));

beforeEach(() => {
  log.order.length = 0;
  warmed.clear();
  releaseHeldArt();
  FakeImage.decode = () => Promise.resolve();
  vi.stubGlobal('Image', FakeImage);
  _setManifestForTest(fakeManifest());
});
afterEach(() => {
  _setManifestForTest(EMPTY);
  warmed.clear();
  releaseHeldArt();
  setCoopStory(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('1. 開局的下載順序（startRun）', () => {
  it('地圖底圖 → 節點圖示 → 全部音效 → 配音，都比原本的背景那批先送出；圖片全部插隊', () => {
    vi.stubGlobal('fetch', vi.fn((u: string) => { log.order.push(`fetch:${u}`); return new Promise<Response>(() => undefined); }));
    void startRun(newRun('netload-order', 1, 'ninja'), 0, { done: 0, total: 0 }, deps(sfxFetch));
    const o = log.order.filter((x) => !x.startsWith('prio:'));
    expect(o[0], '第一個就是地圖底圖').toBe('img:/assets/bg/map_tall.webp');
    expect(new Set(o.slice(1, 9))).toEqual(new Set([...Object.values(NODE_ICON), 'icon/map_hero_low'].map((k) => `img:/assets/icons/${k}.webp`)));
    const sfx = o.slice(9, 9 + 28);
    expect(sfx.every((x) => x.startsWith('fetch:/assets/sfx/')), '接著是 28 個音效').toBe(true);
    expect(sfx[0], '腳步聲排第一（慢網路最常被跳過的）').toBe('fetch:/assets/sfx/step.mp3');
    expect(o.slice(9 + 28)).toEqual(['voice', 'background']);
    expect(log.order.filter((x) => x.startsWith('prio:')).every((x) => x === 'prio:high')).toBe(true);
  });

  it('B 層等 A 層到齊才開始：狀態小圖示排最前、只抓第一步魔物會上的；接著魔物、起手牌面、主角六張姿勢', async () => {
    const pending: ((r: Response) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => { pending.push(res); })));
    const run = newRun('netload-b', 1, 'ninja');
    const pr: Progress = { done: 0, total: 0 };
    const ready = startRun(run, 0, pr, deps(sfxFetch));
    await flush();
    const later = (): string[] => imgs().filter((x) => /\/(monsters|cards|sprites)\/|\/icons\/icon\/status_/.test(x));
    expect(later(), 'A 還沒到齊').toEqual([]);
    expect(pr.total, '底圖＋8 圖示＋28 音效＋戰鬥畫面程式＋主角動作資料＋配音').toBe(1 + 8 + 28 + 1 + 1 + 1);
    for (const res of pending) res({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response);
    await ready;
    await flush();
    expect(pr.done).toBe(pr.total);
    const got = later();
    expect(got[0], 'B 層第一張是狀態小圖示').toMatch(/\/icons\/icon\/status_/);
    const status = got.filter((x) => x.includes('/icons/icon/status_'));
    expect(status.length, '只抓會用到的，不是十七張全抓').toBeLessThan(new Set(Object.values(STATUS_ICON)).size);
    for (const u of nextFightUrls(run)) expect(got, '第一層三格的魔物').toContain(`img:${u}`);
    expect(got.some((x) => x.includes('/cards/')), '起手牌面').toBe(true);
    for (const k of FIRST_POSES) expect(got, k).toContain(`img:/assets/sprites/${k}.webp`);
    expect(got.findIndex((x) => x.includes('/monsters/'))).toBeLessThan(got.findIndex((x) => x.includes('/sprites/')));
  });

  it('主角六張姿勢：記進共用的「解過了」（開打前背景那批就不重抓）；第一場戰鬥自己留住之後放掉參照', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response)));
    await startRun(newRun('netload-pose', 1, 'ninja'), 0, { done: 0, total: 0 }, deps(sfxFetch));
    await flush();
    for (const k of FIRST_POSES) expect(warmed.has(`/assets/sprites/${k}.webp`), k).toBe(true);
    expect(_heldFirstPosesForTest()).toHaveLength(FIRST_POSES.length);
    dropFirstPoses();
    expect(_heldFirstPosesForTest()).toEqual([]);
  });
});

describe('2. 開打前（startFight）', () => {
  const fight = APP.slice(APP.indexOf('  startFight(encounterId'), APP.indexOf('  afterCombat('));

  it('等的那批只有這場魔物與手牌；插隊；最多 3 秒就放行', async () => {
    vi.useFakeTimers();
    FakeImage.decode = () => new Promise<void>(() => undefined);   // 網路整個卡住
    const pr: Progress = { done: 0, total: 0 };
    let over = false;
    void warmEncounter('wood_dummy', 3000, ['/assets/cards/card/x.webp'], 'ninja', pr).then(() => { over = true; });
    expect(imgs().length).toBe(pr.total);
    expect(imgs()).toContain('img:/assets/cards/card/x.webp');
    expect(log.order.filter((x) => x.startsWith('prio:')).every((x) => x === 'prio:high')).toBe(true);
    await vi.advanceTimersByTimeAsync(2999);
    expect(over).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(over).toBe(true);
    // 呼叫端：不帶主角姿勢（改背景暖），上限是 3 秒那個常數
    const call = fight.slice(fight.indexOf('warmEncounter('), fight.indexOf('\n', fight.indexOf('warmEncounter(')));
    expect(call).toContain('ENCOUNTER_WAIT_MS');
    expect(call).not.toContain('heroSpriteUrls');
    expect(APP).toContain('const ENCOUNTER_WAIT_MS = 3000;');
    expect(APP).toContain('const COMBAT_CODE_WAIT_MS = 8000;');
    expect(fight).toContain('Promise.race([combatScreenReady, new Promise<void>((r) => window.setTimeout(r, COMBAT_CODE_WAIT_MS))])');
  });

  it('進度條先收，才換戰鬥畫面（接在 gateProgress 後面）', async () => {
    vi.useFakeTimers();
    const seq: string[] = [];
    let ok = (): void => undefined;
    const ready = new Promise<void>((r) => { ok = r; });
    void gateProgress(ready, () => { seq.push('bar'); return () => seq.push('bar-hidden'); }).then(() => seq.push('show-combat'));
    void ready.then(() => seq.push('ready'));
    await vi.advanceTimersByTimeAsync(300);
    ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(seq.slice(0, 1)).toEqual(['bar']);
    expect(seq.indexOf('bar-hidden')).toBeLessThan(seq.indexOf('show-combat'));
    expect(fight).toContain(".then(proceed);");
    expect(fight).toMatch(/gateProgress\(ready, \(\) => progressBar\(this\.screen, i18nT\('正在準備戰鬥……'\), pr\)\)\.then\(proceed\);/);
  });

  it('有進度條時不再把地圖右下那行字改成「正在準備戰鬥」', () => {
    expect(fight).toContain("if (hint && !this.screen.querySelector('.net-progress')) hint.textContent = i18nT('正在準備戰鬥……');");
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

  it('四位角色（含連線混搭）的四組吐槽，每次拿到的都是同一個陣列——不然先抽好的那句講的時候查不到、預抓落空', () => {
    const heroes = ['ninja', 'feifei', 'dangdang', 'fengfeng'];
    for (const partner of [undefined, ...heroes]) {
      for (const h of heroes) {
        setCoopStory(partner ? { partner, mirror: h } : null);
        const a = storyFor(h);
        const b = storyFor(h);
        for (const k of ['battleStart', 'battleWin', 'hungry', 'lowHp'] as const) expect(a[k], `${h}＋${partner ?? '單人'} ${k}`).toBe(b[k]);
        const plan = planPick(a.hungry);
        expect(pick(storyFor(h).hungry), `${h}＋${partner ?? '單人'}：講的就是先抽好的那句`).toBe(plan);
      }
    }
  });
});

describe('3. 下一步走得到的戰鬥格先預載', () => {
  beforeEach(() => { useRunDeps(deps(sfxFetch)); });

  it('開局＝第一層三格的魔物（含召喚、換階段），不含第二層才有的', () => {
    const run = newRun('netload-next', 1, 'ninja');
    const urls = new Set(nextFightUrls(run));
    const first = nextChoices(run.map, null);
    const artOf = (id: string): string => enemies.find((e) => e.id === id)!.art.replace(/\//g, '_');
    for (const n of first) for (const id of encounterById[n.encounterId!]!.enemies) expect([...urls].some((u) => u.includes(`/monsters/${artOf(id)}_idle`)), id).toBe(true);
    const onlySecond = [...new Set(first.flatMap((n) => n.next))].flatMap((id) => encounterById[run.map.nodes.find((m) => m.id === id)!.encounterId ?? '']?.enemies ?? [])
      .filter((id) => !first.some((n) => encounterById[n.encounterId!]!.enemies.includes(id)));
    for (const id of onlySecond) expect([...urls].some((u) => u.includes(`/monsters/${artOf(id)}_`)), `第二層才有的 ${id}`).toBe(false);
  });

  it('插隊；同一張不重送；走了一步換成那一格接下去的；要不插隊也可以（第二個參數）', async () => {
    const run = newRun('netload-next2', 1, 'ninja');
    await preloadNextFights(run);
    expect(imgs().length).toBe(new Set(nextFightUrls(run)).size);
    expect(log.order.filter((x) => x.startsWith('prio:')).every((x) => x === 'prio:high')).toBe(true);
    log.order.length = 0;
    await preloadNextFights(run);
    expect(log.order, '同一張不重送（連線每投一票地圖重畫一次）').toEqual([]);
    run.currentNode = nextChoices(run.map, null)[0]!.id;
    await preloadNextFights(run, false);
    expect(imgs().length).toBeGreaterThan(0);
    expect(log.order.filter((x) => x.startsWith('prio:')).every((x) => x === 'prio:auto'), '第二個參數給 false 就不插隊').toBe(true);
  });

  it('沒抓成的下次再試（審查 低-6）', async () => {
    const run = newRun('netload-retry', 1, 'ninja');
    FakeImage.decode = () => Promise.reject(new Error('斷線'));
    await preloadNextFights(run);
    const first = imgs().length;
    expect(first).toBeGreaterThan(0);
    FakeImage.decode = () => Promise.resolve();
    log.order.length = 0;
    await preloadNextFights(run);
    expect(imgs().length, '失敗的那幾張重送').toBe(first);
  });

  it('接線：地圖每次畫出來叫它；戰鬥畫面等主角姿勢解好（最多 8 秒）才叫（照樣插隊）', () => {
    expect(MAP).toContain("void import('../netload-run').then((m) => m.preloadNextFights(run), () => undefined);");
    expect(COMBAT).toMatch(/const heroesWarm = warmHeroes\(\);[\s\S]{0,700}Promise\.race\(\[heroesWarm, new Promise<void>\(\(r\) => window\.setTimeout\(r, 8000\)\)\]\)\.then\(\(\) => \{\n\s*app\.warmNextFights\?\.\(\);/);
    const warm = APP.slice(APP.indexOf('  warmNextFights(): void {'), APP.indexOf('\n  }\n', APP.indexOf('  warmNextFights(): void {')));
    expect(warm).toContain('m.dropFirstPoses();');
    expect(warm).toContain('m.preloadNextFights(run);');
  });
});

describe('4. 條件式進度條的時機（gateProgress）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  const deferred = (): { p: Promise<void>; ok: () => void } => { let ok = (): void => undefined; const p = new Promise<void>((r) => { ok = r; }); return { p, ok }; };

  it('250 毫秒內齊了就完全不出現', async () => {
    const d = deferred();
    const show = vi.fn(() => () => undefined);
    const done = gateProgress(d.p, show, MAP_GATE_MS);
    await vi.advanceTimersByTimeAsync(200);
    d.ok();
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(show).not.toHaveBeenCalled();
  });
  it('過了 250 毫秒才出現，齊了就收', async () => {
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
  it('量出來不是慢網路就不出現', async () => {
    const show = vi.fn(() => () => undefined);
    void gateProgress(new Promise(() => undefined), show, MAP_GATE_MS, 250, () => Promise.resolve(false));
    await vi.advanceTimersByTimeAsync(5000);
    expect(show).not.toHaveBeenCalled();
  });
  it('一直沒齊：最多 8 秒就放行', async () => {
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

/** 把 app.ts 的幾支方法原封不動切出來，包進最小的類別跑（切法變了會直接丟例外，不會默默測空氣） */
function method(start: string): string {
  const a = APP.indexOf(start);
  if (a < 0) throw new Error(`找不到這一段：${start}`);
  return APP.slice(a, APP.indexOf('\n  }\n', a) + 4);
}
async function appClass(body: string, names: Record<string, unknown>): Promise<new () => Record<string, unknown>> {
  const js = (await transformWithOxc(`class G { run: unknown = null; cs: unknown = null; coop: unknown = null; seat = 0; fightPending = false; stage: any; overlay: any; ${body} }\nreturn G;`, 'gate.ts')).code;
  return new Function(...Object.keys(names), js)(...Object.values(names)) as new () => Record<string, unknown>;
}

describe('4b. 進地圖前的門檻（App.gateMap）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  type G = { run: unknown; fightPending: boolean; stage: unknown; overlay: unknown; gateMap(run: unknown, go: () => void, coverNow?: boolean): void };
  async function build(opts: { known: 'fast' | 'slow' | null; verdict: Promise<'fast' | 'slow'>; w: { pr: Progress; ready: Promise<void>; over: boolean } | null }) {
    const calls: string[] = [];
    const G = await appClass(method('  private gateMap(run: RunState, go: () => void, coverNow = false): void {').replace('private ', ''), {
      runProgress: () => opts.w,
      knownNetSpeed: () => opts.known,
      netSpeed: () => opts.verdict,
      el: (_tag: string, attrs: { class: string }) => ({ className: attrs.class, isConnected: true, remove() { this.isConnected = false; calls.push('cover-removed'); } }),
      gateProgress,
      progressBar: () => { calls.push('bar'); return () => calls.push('bar-hidden'); },
      i18nT: (s: string) => s,
      notice: (s: string) => calls.push(`notice:${s}`),
      MAP_GATE_MS,
    });
    const g = new G() as unknown as G;
    g.stage = { insertBefore: (c: { className: string }) => calls.push(`cover:${c.className}`), classList: { add: () => calls.push('lock'), remove: () => calls.push('unlock') } };
    return { g, calls };
  }
  const never = <T>(): Promise<T> => new Promise<T>(() => undefined);
  const slowW = () => ({ pr: { done: 1, total: 5 }, ready: never<void>(), over: false });

  it('A 層已經齊了：當下就進地圖，不蓋、不出進度條', async () => {
    const run = {};
    const { g, calls } = await build({ known: 'slow', verdict: Promise.resolve('slow'), w: { pr: { done: 5, total: 5 }, ready: Promise.resolve(), over: true } });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go, true);
    expect(go).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });
  it('已經量到快網路：當下就進', async () => {
    const run = {};
    const { g, calls } = await build({ known: 'fast', verdict: Promise.resolve('fast'), w: slowW() });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go);
    expect(go).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });
  it('續玩、網速還在量、量出來是快的：不蓋、不出進度條，量完就進（審查 中-2）', async () => {
    const run = {};
    let fast = (_: 'fast'): void => undefined;
    const opts = { known: null as 'fast' | 'slow' | null, verdict: new Promise<'fast' | 'slow'>((r) => { fast = r; }), w: slowW() };
    const { g, calls } = await build(opts);
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go);
    expect(calls).toEqual(['lock']);
    await vi.advanceTimersByTimeAsync(600);
    expect(calls, '還在量的時候不出現').toEqual(['lock']);
    opts.known = 'fast';
    fast('fast');
    await vi.advanceTimersByTimeAsync(0);
    expect(go).toHaveBeenCalledOnce();
    expect(calls).toEqual(['lock', 'unlock']);
  });
  it('續玩、A 層 250 毫秒內就齊了：不蓋', async () => {
    const run = {};
    let ok = (): void => undefined;
    const { g, calls } = await build({ known: 'slow', verdict: Promise.resolve('slow'), w: { pr: { done: 1, total: 5 }, ready: new Promise((r) => { ok = r; }), over: false } });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go);
    await vi.advanceTimersByTimeAsync(200);
    ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(go).toHaveBeenCalledOnce();
    expect(calls.filter((c) => c.startsWith('cover') || c === 'bar')).toEqual([]);
  });
  it('續玩、慢網路沒齊：250 毫秒後蓋層跟進度條一起出現；最多 8 秒放行並公告一次', async () => {
    const run = {};
    const { g, calls } = await build({ known: 'slow', verdict: Promise.resolve('slow'), w: slowW() });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go);
    expect(calls).toEqual(['lock']);
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toEqual(['lock', 'cover:net-gate', 'bar']);
    await vi.advanceTimersByTimeAsync(MAP_GATE_MS);
    expect(go).toHaveBeenCalledOnce();
    expect(calls).toContain('bar-hidden');
    expect(calls).toContain('unlock');
    expect(calls.filter((c) => c.startsWith('notice:'))).toHaveLength(1);
  });
  it('序章那條路：蓋層當下就放（接幻燈片淡出），進度條照樣等 250 毫秒', async () => {
    const run = {};
    const { g, calls } = await build({ known: 'slow', verdict: Promise.resolve('slow'), w: slowW() });
    g.run = run;
    g.gateMap(run, vi.fn(), true);
    expect(calls).toEqual(['cover:net-gate', 'lock']);
    await vi.advanceTimersByTimeAsync(249);
    expect(calls).not.toContain('bar');
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toContain('bar');
  });
  it('等的時候這一局被丟掉：不接', async () => {
    const run = {};
    let ok = (): void => undefined;
    const { g, calls } = await build({ known: 'slow', verdict: Promise.resolve('slow'), w: { pr: { done: 1, total: 5 }, ready: new Promise((r) => { ok = r; }), over: false } });
    g.run = run;
    const go = vi.fn();
    g.gateMap(run, go, true);
    g.run = null;
    ok();
    await vi.advanceTimersByTimeAsync(10);
    expect(go).not.toHaveBeenCalled();
    expect(calls).toContain('cover-removed');
  });
  it('序章播完、續玩兩個入口都走門檻（序章那條當下蓋）；換畫面時蓋層算「蓋著」', () => {
    expect(method('  afterPrologue(): void {')).toContain("this.gateMap(run, () => this.show(anyBlessingPending(run) ? 'blessing' : 'map'), true);");
    expect(method('  continueRun(from?: RunState): boolean {')).toContain("this.gateMap(run, () => this.show(anyBlessingPending(run) ? 'blessing' : 'map'));");
    expect(APP).toContain(".slide-overlay, .cine-overlay, .actwalk-overlay:not(.out), .net-gate'");
  });
});

describe('4c. 離開連線、重新同步：拆掉蓋層並解鎖', () => {
  function world() {
    const removed: string[] = [];
    const cover = { remove: () => removed.push('net-gate') };
    const document = { querySelectorAll: (sel: string) => (sel.includes('.net-gate') ? [cover] : []) };
    return { removed, document };
  }
  it('leaveCoop', async () => {
    const w = world();
    const A = await appClass(method('  leaveCoop(): void {'), { setCoopStory: () => undefined, closeStoryOverlays: () => undefined, clearRejoin: () => undefined, document: w.document });
    const app = new A() as unknown as { fightPending: boolean; stage: unknown; leaveCoop(): void };
    const remove = vi.fn();
    app.stage = { classList: { remove } };
    app.fightPending = true;
    app.leaveCoop();
    expect(w.removed).toEqual(['net-gate']);
    expect(app.fightPending).toBe(false);
    expect(remove).toHaveBeenCalledWith('fight-pending');
  });
  it('dropPendingFlows', async () => {
    const w = world();
    const A = await appClass(method('  dropPendingFlows(): void {'), { closeStoryOverlays: () => undefined, document: w.document });
    const app = new A() as unknown as { fightPending: boolean; stage: unknown; dropPendingFlows(): void };
    const remove = vi.fn();
    app.stage = { classList: { remove } };
    app.fightPending = true;
    app.dropPendingFlows();
    expect(w.removed).toEqual(['net-gate']);
    expect(app.fightPending).toBe(false);
    expect(remove).toHaveBeenCalledWith('fight-pending');
  });
});

describe('5. 全部音效開局就抓', () => {
  it('名單 28 個一個不漏（對 public/assets/sfx 的檔案）；還沒解鎖只下載、不解碼', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { fetched.push(u); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response; }));
    vi.resetModules();
    const audio = await import('../../src/ui/audio');
    audio.preloadSfx(ALL_SFX);
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
    audio.preloadSfx(ALL_SFX);
    await flush();
    net = false;   // 之後網路整個卡住：沒預載的話 `step` 會等下載、500 毫秒後整個不播
    audio.play('step');
    expect(starts, '緩衝已在手上，當下就播').toHaveLength(1);
  });
});
