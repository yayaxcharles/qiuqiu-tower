import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoopSession, MAX_RESYNC, SNAP_PART, SNAP_WAIT_MS, snapParts } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { startCombat } from '../../src/engine/combat';
import { newCoopRun } from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';
import type { CombatState, PlayerCombat, RunState } from '../../src/engine/types';

/*
 * 重新同步（2026-09-25 使用者：「先做重新同步」）。原本兩台一對不上整場就停；
 * 現在主機把「最近一次回到地圖時的整局狀態」（存檔點）傳給對方，兩台都載入同一份、一起回到那一層的地圖。
 * 這裡用對接的假傳輸跑兩台：誰先發現都會收斂到同一輪、同一份；上一輪的訊息一律丟；
 * 存檔點太大會切段；沒有存檔點、次數用完、等不到主機，照舊停下。
 */
function twoPlayerCombat(seed: string): CombatState {
  const cs = startCombat({
    hp: 70, maxHp: 70,
    deck: ['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: 'rats3', rng: new Rng(seedFromString(seed)),
  });
  const p2 = blankPlayer(['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'], 1);
  p2.energy = 3;
  p2.hand = p2.drawPile.splice(0, 5);
  cs.players.push(p2);
  return cs;
}

interface Side { s: CoopSession; resynced: { run: string; why: string }[]; desync: string[] }
function table(opts: { hook?: boolean } = {}) {
  const link = new LoopbackPair();
  const mk = (isHost: boolean): Side => {
    const side: Side = { s: null as unknown as CoopSession, resynced: [], desync: [] };
    side.s = new CoopSession(isHost ? link.a : link.b, {
      isHost, seat: isHost ? 0 : 1,
      onDesync: (w) => side.desync.push(w),
      ...(opts.hook === false ? {} : { onResync: (run: string, why: string) => side.resynced.push({ run, why }) }),
    });
    return side;
  };
  const host = mk(true);
  const guest = mk(false);
  const hostRun = newCoopRun('resync', 1, 'ninja', 'feifei');
  const guestRun = newCoopRun('resync', 1, 'ninja', 'feifei');
  host.s.useRun(hostRun); guest.s.useRun(guestRun);
  host.s.checkpoint(hostRun); guest.s.checkpoint(guestRun);
  return { link, host, guest, hostRun, guestRun };
}
/** 主機的重新同步排在下一拍（推前稽核 高-1）：走一拍讓它做完 */
const settle = (): void => { vi.advanceTimersByTime(1); };

/** 兩台各開一場一樣的戰鬥，然後讓客戶端那份偷偷不一樣（模擬引擎在某台算歪了），各自收回合 → 對帳對不上 */
function diverge(t: ReturnType<typeof table>): void {
  const a = twoPlayerCombat('fight'); const b = twoPlayerCombat('fight');
  t.host.s.attach(a); t.guest.s.attach(b);
  b.enemies[0]!.hp -= 1;
  t.host.s.endOfTurn();
  t.guest.s.endOfTurn();
  settle();
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('對不上時：主機的存檔點傳過去，兩台一起回到地圖', () => {
  it('客戶端先發現：請主機重新同步；兩台都載入主機那一份（不是客戶端自己的），都沒有停下', () => {
    const t = table();
    t.hostRun.players[0]!.fish = 777;   // 主機那份才有的記號：兩台最後都要是它
    t.host.s.checkpoint(t.hostRun);
    diverge(t);
    expect(t.host.desync).toEqual([]);
    expect(t.guest.desync).toEqual([]);
    expect(t.host.resynced).toHaveLength(1);
    expect(t.guest.resynced).toHaveLength(1);
    expect(t.guest.resynced[0]!.run).toBe(t.host.resynced[0]!.run);
    expect((JSON.parse(t.guest.resynced[0]!.run) as RunState).players[0]!.fish).toBe(777);
    expect(t.host.s.stopped || t.guest.s.stopped).toBe(false);
  });

  it('重新同步之後照樣玩得下去：新的一場，主機出一張牌兩邊都套上', () => {
    const t = table();
    diverge(t);
    const a = twoPlayerCombat('fight2'); const b = twoPlayerCombat('fight2');
    t.host.s.attach(a); t.guest.s.attach(b);
    const uid = (a.players[0] as PlayerCombat).hand[0]!.uid;
    expect(t.host.s.submit({ t: 'card', seat: 0, u: uid, g: a.enemies[0]!.uid })).toBe(true);
    expect((a.players[0] as PlayerCombat).hand.some((c) => c.uid === uid)).toBe(false);
    expect((b.players[0] as PlayerCombat).hand.some((c) => c.uid === uid)).toBe(false);
    // 下一回合對帳也要對得上（場次、流水號都從同一個起點重新數）
    t.host.s.endOfTurn(); t.guest.s.endOfTurn();
    expect(t.host.desync).toEqual([]); expect(t.guest.desync).toEqual([]);
    expect(t.host.resynced).toHaveLength(1);
  });

  it('上一輪（重新同步之前）還在路上的訊息一律丟掉', () => {
    const t = table();
    t.link.hold = true;
    const a = twoPlayerCombat('old'); const b = twoPlayerCombat('old');
    t.host.s.attach(a); t.guest.s.attach(b);
    const uid = (a.players[0] as PlayerCombat).hand[0]!.uid;
    t.host.s.submit({ t: 'card', seat: 0, u: uid, g: a.enemies[0]!.uid });   // 第 0 輪的 act，卡在路上
    t.link.hold = false;
    b.enemies[0]!.hp -= 1;
    t.host.s.endOfTurn(); t.guest.s.endOfTurn();   // 對不上 → 重新同步到第 1 輪
    settle();
    t.link.flush();   // 上一輪那則 act 現在才到
    expect((b.players[0] as PlayerCombat).hand.some((c) => c.uid === uid), '舊的那張沒被套進客戶端').toBe(true);
    expect(t.guest.desync).toEqual([]);
  });

  it('兩台同時發現：只重新同步一次（客戶端那則請求屬於舊的一輪，主機不理）', () => {
    const t = table();
    t.link.hold = true;
    const a = twoPlayerCombat('both'); const b = twoPlayerCombat('both');
    t.host.s.attach(a); t.guest.s.attach(b);
    b.enemies[0]!.hp -= 1;
    t.host.s.endOfTurn(); t.guest.s.endOfTurn();
    t.link.flush();
    t.link.flush();
    t.link.hold = false;
    settle();
    expect(t.host.resynced.length + t.guest.resynced.length).toBeGreaterThan(0);
    expect(t.host.resynced).toHaveLength(1);
    expect(t.guest.resynced).toHaveLength(1);
  });

  it('存檔點太大：切成好幾段送，收齊了才用；每一段包成訊息之後都在中繼上限（16,384 字）以內', () => {
    const t = table();
    // 滿滿的引號：包成訊息時每個都要再跳脫一次，照原長切會超過上限（推前稽核 低-1）
    t.hostRun.flags['big'] = '"'.repeat(SNAP_PART * 2 + 10) as never;
    t.host.s.checkpoint(t.hostRun);
    const sent: { m: string }[] = [];
    const orig = t.link.a.send;
    t.link.a.send = (m) => { sent.push(m); orig(m); };
    diverge(t);
    const snaps = sent.filter((m) => m.m === 'snap');
    expect(snaps.length).toBeGreaterThan(3);
    for (const m of snaps) expect(JSON.stringify(m).length).toBeLessThan(16_384);
    expect(t.guest.resynced[0]!.run).toBe(t.host.resynced[0]!.run);
  });

  it('切段：接回去跟原本一字不差（切在表情符號中間也一樣）', () => {
    const json = JSON.stringify({ s: '🐟'.repeat(SNAP_PART), q: '"\\'.repeat(3000) });
    const parts = snapParts(json);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((p) => JSON.parse(JSON.stringify(p)) as string).join('')).toBe(json);
  });

  it('主機在畫面流程裡發現對不上（走進格子時對帳）：當下不換掉整局，下一拍才換', () => {
    const t = table();
    const a = twoPlayerCombat('tick'); const b = twoPlayerCombat('tick');
    t.host.s.attach(a); t.guest.s.attach(b);
    b.enemies[0]!.hp -= 1;
    t.guest.s.endOfTurn();   // 客戶端的對帳先到主機
    t.host.s.endOfTurn();    // 主機收回合時比對：對不上
    expect(t.host.resynced, '同一個呼叫裡還沒換：叫的那段畫面流程先跑完').toHaveLength(0);
    settle();
    expect(t.host.resynced).toHaveLength(1);
    expect(t.guest.resynced).toHaveLength(1);
  });
});

describe('救不回來的情況：照舊停下', () => {
  it('還沒有存檔點（第一次回到地圖之前）：停下', () => {
    const link = new LoopbackPair();
    const desync: string[] = [];
    const host = new CoopSession(link.a, { isHost: true, seat: 0, onResync: () => undefined, onDesync: (w) => desync.push(w) });
    const guest = new CoopSession(link.b, { isHost: false, seat: 1, onResync: () => undefined, onDesync: (w) => desync.push(w) });
    const a = twoPlayerCombat('nocp'); const b = twoPlayerCombat('nocp');
    host.attach(a); guest.attach(b);
    b.enemies[0]!.hp -= 1;
    host.endOfTurn(); guest.endOfTurn();
    expect(desync.length).toBeGreaterThan(0);
  });

  it('畫面沒接重新同步：照舊停下（舊的測試、舊的呼叫端行為不變）', () => {
    const t = table({ hook: false });
    diverge(t);
    expect(t.guest.desync.length + t.host.desync.length).toBeGreaterThan(0);
  });

  it(`一直對不上：重新同步最多 ${MAX_RESYNC} 次，之後停下`, () => {
    const t = table();
    for (let i = 0; i < MAX_RESYNC; i++) {
      diverge(t);
      t.host.s.checkpoint(t.hostRun); t.guest.s.checkpoint(t.guestRun);
    }
    expect(t.host.resynced).toHaveLength(MAX_RESYNC);
    diverge(t);
    expect(t.host.desync.length + t.guest.desync.length).toBeGreaterThan(0);
  });

  it(`客戶端請了、主機一直沒回：等 ${SNAP_WAIT_MS / 1000} 秒後停下；等的期間什麼都不送`, () => {
    const t = table();
    const a = twoPlayerCombat('mute'); const b = twoPlayerCombat('mute');
    t.host.s.attach(a); t.guest.s.attach(b);
    t.host.s.endOfTurn();
    t.link.hold = true;   // 從這裡起客戶端送的都到不了主機
    b.enemies[0]!.hp -= 1;
    t.guest.s.endOfTurn();
    expect(t.guest.desync).toEqual([]);
    vi.advanceTimersByTime(SNAP_WAIT_MS + 1);
    expect(t.guest.desync).toHaveLength(1);
    expect(t.guest.desync[0]).toContain('等不到主機的存檔點');
  });
});
