import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import APP_RAW from '../../src/ui/app.ts?raw';
import MAP_RAW from '../../src/ui/screens/map.ts?raw';

/*
 * 走進事件格要等事件畫面與主圖都到了才換畫面（2026-09-23 內容擴充第〇批 0-1、0-2，`app.ts` 的 `enterEvent`）。
 *
 * 事件畫面（連同三份角色事件文案）改成按需載入、主圖改成照地圖現抓之後，第一次走進事件格時兩樣都可能還在路上。
 * 直接換畫面會先掛「正在準備事件……」再跳出真的畫面、主圖也空一格；連線時地圖的投票處理還掛著，
 * 同伴早一步送來的地圖票會讓我在還沒跑事件結果之前就走進下一格。
 *
 * 照 `adopt_run_0923.test.ts` 的作法：把 `enterEvent` 原封不動切出來跑（畫面模組與暖圖換成手上控制得到的 Promise）。
 */
const APP = APP_RAW.replace(/\r\n/g, '\n');
const MAP = MAP_RAW.replace(/\r\n/g, '\n');

function method(start: string): string {
  const a = APP.indexOf(start);
  if (a < 0) throw new Error(`找不到這一段：${start}`);
  return APP.slice(a, APP.indexOf('\n  }\n', a) + 4);
}

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((y, n) => { resolve = y; reject = n; });
  return { promise, resolve, reject };
}

interface Fake {
  run: unknown; coop: { clearScreenHooks: (s: string) => void } | null; fightPending: boolean;
  stage: { classList: { add: (c: string) => void; remove: (c: string) => void; has: (c: string) => boolean } };
  screen: { querySelector: (s: string) => { textContent: string } | null };
  show: ReturnType<typeof vi.fn>;
  enterEvent(id: string | undefined): void;
}

async function harness(load: Promise<unknown>, warm: Promise<void>) {
  const calls: string[] = [];
  const body = method('  private enterEvent(eventId: string | undefined): void {')
    .replace("import('./screens/event')", 'loadEvent()');
  expect(body, '畫面模組要在這一支裡等（換成可控的 Promise 才測得到）').toContain('loadEvent()');
  const js = (await transformWithOxc(`class A { run: unknown = null; coop: unknown = null; fightPending = false; stage: unknown; screen: unknown; show: unknown; ${body} }\nreturn A;`, 'enter.ts')).code;
  const A = new Function('warmEventArt', 'loadEvent', 'window', js)(
    (_run: unknown, id: string) => { calls.push(`warm:${id}`); return warm; },
    () => { calls.push('load'); return load; },
    { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t) },
  ) as new () => Fake;
  const app = new A();
  const cls = new Set<string>();
  const hint = { textContent: '選下一層要去哪' };
  app.run = { id: 'run' };
  app.coop = { clearScreenHooks: (s: string) => { calls.push(`clear:${s}`); } };
  app.stage = { classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c), has: (c: string) => cls.has(c) } };
  app.screen = { querySelector: (s: string) => (s === '.map-hint' ? hint : null) };
  app.show = vi.fn((name: string) => { calls.push(`show:${name}`); });
  return { app, calls, cls, hint };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('走進事件格：畫面模組與主圖都到了才換畫面', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('先拆地圖的投票處理、鎖住舞台，兩樣都好了才換到事件畫面', async () => {
    const load = deferred(); const warm = deferred();
    const { app, calls, cls } = await harness(load.promise, warm.promise);
    app.enterEvent('toll');
    // 連線：地圖那支投票處理當下就拆（等的這段時間同伴的地圖票不能讓我走進下一格）
    expect(calls[0]).toBe('clear:event');
    expect(calls).toContain('load');
    expect(calls).toContain('warm:toll');
    expect(cls.has('fight-pending'), '等的時候舞台點不動').toBe(true);
    expect(app.fightPending).toBe(true);
    load.resolve(); await flush();
    expect(app.show, '主圖還沒好就不換').not.toHaveBeenCalled();
    warm.resolve(); await flush();
    expect(app.show).toHaveBeenCalledExactlyOnceWith('event', { eventId: 'toll' });
    expect(cls.has('fight-pending')).toBe(false);
    expect(app.fightPending).toBe(false);
  });

  it('主圖先好也一樣：畫面模組沒到之前不換（不然會先掛載入畫面）', async () => {
    const load = deferred(); const warm = deferred();
    const { app } = await harness(load.promise, warm.promise);
    app.enterEvent('toll');
    warm.resolve(); await flush();
    expect(app.show).not.toHaveBeenCalled();
    load.resolve(); await flush();
    expect(app.show).toHaveBeenCalledExactlyOnceWith('event', { eventId: 'toll' });
  });

  it('畫面模組抓不到也要換過去：交給載入畫面顯示「重新整理」，不能停在地圖上點不動', async () => {
    const load = deferred(); const warm = deferred();
    const { app, cls } = await harness(load.promise, warm.promise);
    app.enterEvent('toll');
    load.reject(new Error('404')); warm.resolve(); await flush();
    expect(app.show).toHaveBeenCalledExactlyOnceWith('event', { eventId: 'toll' });
    expect(cls.has('fight-pending')).toBe(false);
  });

  it('等的時候這一局丟了（連線斷了回標題）：不換畫面', async () => {
    const load = deferred(); const warm = deferred();
    const { app } = await harness(load.promise, warm.promise);
    app.enterEvent('toll');
    app.run = null;
    load.resolve(); warm.resolve(); await flush();
    expect(app.show).not.toHaveBeenCalled();
  });

  it('等超過 0.4 秒才把地圖下方的提示換成「正在準備事件……」；很快就好的不換', async () => {
    const slow = await harness(new Promise(() => undefined), Promise.resolve());
    slow.app.enterEvent('toll');
    vi.advanceTimersByTime(399);
    expect(slow.hint.textContent).toBe('選下一層要去哪');
    vi.advanceTimersByTime(1);
    expect(slow.hint.textContent).toBe('正在準備事件……');

    const fast = await harness(Promise.resolve(), Promise.resolve());
    fast.app.enterEvent('toll');
    await flush();
    vi.advanceTimersByTime(1000);
    expect(fast.hint.textContent).toBe('選下一層要去哪');
    expect(fast.app.show).toHaveBeenCalledOnce();
  });

  it('單機（沒有連線會話）照樣走得通', async () => {
    const { app } = await harness(Promise.resolve(), Promise.resolve());
    app.coop = null;
    app.enterEvent('toll');
    await flush();
    expect(app.show).toHaveBeenCalledExactlyOnceWith('event', { eventId: 'toll' });
  });
});

describe('接線', () => {
  it('地圖上走進事件格一律走 `enterEvent`，不直接 `show(\'event\')`', () => {
    const enter = method('  enterNode(nodeId: string): void {');
    expect(enter).toContain("case '事件': this.enterEvent(node.eventId); break;");
    expect(enter).not.toContain("this.show('event'");
  });

  it('地圖畫面一出來就在背景先抓事件畫面與這張地圖的事件主圖', () => {
    expect(MAP).toContain("void import('./event')");
    expect(MAP).toContain('void preloadMapEvents(run);');
  });
});
