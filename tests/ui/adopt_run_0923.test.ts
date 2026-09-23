import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import APP_RAW from '../../src/ui/app.ts?raw';
import LOBBY_RAW from '../../src/ui/screens/lobby.ts?raw';
import { newCoopRun, newRun } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';

/*
 * 「本機這一位是誰」收成 `App.adoptRun`（2026-09-23 health H-3）。
 *
 * 立繪、貓叫、劇情情境、專屬圖四件事原本在新的一局、續玩、連線開局三個入口各抄一份，
 * 連線那份就漏過聲音（推前審查 高-1：只設了圖沒設聲）。這裡把 adoptRun 原封不動切出來跑，
 * 確認四件事都照**這個座位**的角色設；再釘住三個入口都叫它、兩個檔裡沒有第二份。
 */
const APP = APP_RAW.replace(/\r\n/g, '\n');
const LOBBY = LOBBY_RAW.replace(/\r\n/g, '\n');

function method(start: string): string {
  const a = APP.indexOf(start);
  if (a < 0) throw new Error(`找不到這一段：${start}`);
  return APP.slice(a, APP.indexOf('\n  }\n', a) + 4);
}

async function adopt(run: ReturnType<typeof newRun>, seat: number) {
  const calls: string[] = [];
  const body = method('  adoptRun(run: RunState, seat: number): void {');
  const js = (await transformWithOxc(`class A { seat = 0; run: unknown = null; syncStory(run: unknown) { calls.push('story:' + (run === this.run)); } ${body} }\nreturn A;`, 'adopt.ts')).code;
  const A = new Function('me', 'setLocalHero', 'setSfxHero', 'preloadHeroArt', 'calls', js)(
    me,
    (h: string | undefined) => { calls.push(`art:${h ?? 'ninja'}`); },
    (h: string | undefined) => { calls.push(`sfx:${h ?? 'ninja'}`); },
    (hs: (string | undefined)[]) => { calls.push(`preload:${hs.map((h) => h ?? 'ninja').join(',')}`); return Promise.resolve(); },
    calls,
  ) as new () => { seat: number; run: unknown; adoptRun(run: unknown, seat: number): void };
  const app = new A();
  app.adoptRun(run, seat);
  return { app, calls };
}

describe('adoptRun：四件事照這個座位設', () => {
  it('連線坐 1 號的菲菲：立繪、貓叫是她的，劇情跟著這一局，兩位的專屬圖都補', async () => {
    const run = newCoopRun('adopt-1', 1, 'ninja', 'feifei');
    const { app, calls } = await adopt(run, 1);
    expect(app.run).toBe(run);
    expect(app.seat).toBe(1);
    expect(calls).toEqual(['art:feifei', 'sfx:feifei', 'story:true', 'preload:ninja,feifei']);
  });

  it('單機的噹噹：坐 0 號', async () => {
    const run = newRun('adopt-2', 1, 'dangdang');
    const { calls } = await adopt(run, 0);
    expect(calls).toEqual(['art:dangdang', 'sfx:dangdang', 'story:true', 'preload:dangdang']);
    expect(me(run, 0).hero).toBe('dangdang');
  });
});

describe('三個入口都走 adoptRun，沒有第二份', () => {
  it('新的一局、續玩、連線開局', () => {
    expect(method('  newRun(seed?: string')).toContain('this.adoptRun(');
    expect(method('  continueRun(from?: RunState): boolean {')).toContain('this.adoptRun(run, 0)');
    expect(LOBBY).toContain('app.adoptRun(run, seat);');
  });

  it('app.ts 與 lobby.ts 裡設貓叫、設立繪只剩 adoptRun 那一處', () => {
    expect(APP.match(/setSfxHero\(/g)).toHaveLength(1);
    expect(APP.match(/setLocalHero\(/g)).toHaveLength(1);
    expect(LOBBY).not.toContain('setSfxHero(');
    expect(LOBBY).not.toContain('setLocalHero(');
  });
});
