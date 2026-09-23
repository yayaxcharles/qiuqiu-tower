import { afterEach, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { MOTION_OVERRUN_MS, motionStillPlaying } from '../../src/ui/qiuqiu-combat-motion';

/*
 * 2026-09-23 連線稽核 低-1：同伴補最後一刀時我這台分頁在背景，那一刀的逐格動作 `active` 只在畫面刷新回呼（rAF）裡收，
 * 背景分頁不給畫面刷新 → 收場每 80 毫秒重排一次，一直停在打完的戰鬥畫面，同伴早在戰利品頁等我。
 */
afterEach(() => { vi.unstubAllGlobals(); });

describe('motionStillPlaying：演完沒不能只看 active', () => {
  const playing = [{ active: true, endsAt: 1000 }];
  it('前景、還沒到預定結束：還在演（正常演出不能被提早切掉）', () => {
    expect(motionStillPlaying(playing, 900, false)).toBe(true);
  });
  it('前景、剛過預定結束、刷新回呼晚一點才收：還是等它', () => {
    expect(motionStillPlaying(playing, 1000 + MOTION_OVERRUN_MS - 1, false)).toBe(true);
  });
  it('前景、超過預定結束一段還沒收（刷新回呼卡住）：當演完', () => {
    expect(motionStillPlaying(playing, 1000 + MOTION_OVERRUN_MS + 1, false)).toBe(false);
  });
  it('背景分頁：一律當演完', () => {
    expect(motionStillPlaying(playing, 0, true)).toBe(false);
  });
  it('沒寫背景旗標時照 document.hidden 判斷', () => {
    vi.stubGlobal('document', { hidden: true });
    expect(motionStillPlaying(playing, 0)).toBe(false);
    vi.stubGlobal('document', { hidden: false });
    expect(motionStillPlaying(playing, 0)).toBe(true);
  });
  it('沒有在演的：不擋', () => {
    expect(motionStillPlaying([{ active: false, endsAt: 99_999 }], 0, false)).toBe(false);
  });
});

describe('收場（checkOver 的 finish）在背景分頁也會交棒給戰利品畫面', () => {
  function sourceBetween(start: string, end: string): string {
    const s = SRC.replace(/\r\n/g, '\n');
    const a = s.indexOf(start);
    const b = s.indexOf(end, a + start.length);
    if (a < 0 || b < 0) throw new Error(`找不到這一段：${start}`);
    return s.slice(a, b);
  }
  const body = sourceBetween('  const playMotion = (', '  const motionForCard =')
    + sourceBetween('  function checkOver(): void', '  function phaseBurst(') + '\ncheckOver();';

  /** 照真的 checkOver／finish 跑，計時器照時間撥；**畫面刷新回呼一次都不跑**（背景分頁就是這樣） */
  async function wrapUp(endsAt: number): Promise<number | null> {
    let now = 0;
    let leftAt: number | null = null;
    const timers: Array<{ at: number; fn: () => void }> = [];
    const players = [{ seat: 0, hero: 'ninja', hp: 20, down: false }, { seat: 1, hero: 'feifei', hp: 20, down: false }];
    // 同伴（座位 1）補的最後一刀還掛著 active：它的收尾要等畫面刷新回呼
    const states = new Map(players.map((q) => [q.seat, {
      source: q.seat === 0 ? 'qiuqiu' : 'feifei', action: q.seat === 1 ? 'attack1' : 'idle', active: q.seat === 1, away: false,
      winAt: undefined, raf: 0, endsAt: q.seat === 1 ? endsAt : 0, actor: { play() {} }, layer: { style: {}, remove() {} },
    }]));
    const cs = { phase: 'won', players, encounterId: 'fight' };
    const app = { cs, afterCombat() { leftAt = now; } };
    const js = (await transformWithOxc(body, 'background-finish.ts')).code;
    const bindings = {
      cs, app, ended: false, session: { attach() {} },
      encounterById: { fight: { pool: 'normal' } }, my: () => players[0], mySeat: 0,
      storyFor: () => ({ battleWin: [] }), toast() {}, pick() {}, heroSpeaker() {}, mySpeech() {},
      el: () => ({ remove() {} }), root: { append() {} },
      motionActors: states, motionStillPlaying, motionEnabled: true, motionState: (q: { seat: number }) => states.get(q.seat),
      motionSourceFor: () => undefined, motionDuration: () => 0, lastMotionEndAt: 0,
      qiuqiuCombatMotionDecision: () => 'play', qiuqiuVictoryLinger: () => 0, heroOf: (q: { hero: string }) => q.hero,
      refreshMotion() {}, render() {}, performance: { now: () => now }, bonusFish: 0, bonusUpgrades: 0,
      window: {
        cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
        setTimeout: (fn: () => void, ms: number) => { timers.push({ at: now + ms, fn }); return timers.length; },
      },
    };
    new Function(...Object.keys(bindings), js)(...Object.values(bindings));
    for (let guard = 0; leftAt === null && timers.length > 0 && guard < 500; guard++) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers.shift()!;
      now = next.at;
      next.fn();
    }
    return leftAt;
  }

  it('背景分頁：同伴那一刀的動作收不掉也照樣收場（原本永遠停在打完的戰鬥畫面）', async () => {
    vi.stubGlobal('document', { hidden: true });
    expect(await wrapUp(2000)).toBe(1300);
  });

  it('前景：同伴那一刀還沒演完就等它，不提早切掉；刷新回呼卡住的話過了預定結束一段才收', async () => {
    vi.stubGlobal('document', { hidden: false });
    const left = await wrapUp(2000);
    expect(left, '動作預定 2000 毫秒才收招').not.toBeNull();
    expect(left!).toBeGreaterThanOrEqual(2000 + MOTION_OVERRUN_MS);
    expect(left!).toBeLessThan(2000 + MOTION_OVERRUN_MS + 200);
  });
});
