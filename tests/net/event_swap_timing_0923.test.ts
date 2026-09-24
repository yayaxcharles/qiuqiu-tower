import { describe, expect, it } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { runFingerprint } from '../../src/net/hash';
import { applyRunEffects, newCoopRun, potionCapacity, type RunGain } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import type { RunEffect, RunState } from '../../src/engine/types';

/*
 * 推前審查 高-1（2026-09-23）的時機：事件的效果一定要在「票結算那一拍」套，不能等結果圖。
 *
 * 選項給兩支忍具、主機的袋子只剩一格：主機拿到一支、另一支收不下，跳「要不要換」，
 * 換掉剛拿到的那一支＝送出 `swap`（第 i 格）。加入方那台要是**還沒套效果**（原本等結果圖最多 6 秒），
 * 第 i 格還不存在，`replacePotion` 拒絕 → 加入方整局停掉。
 *
 * 用 `LoopbackPair.hold` 做出「一台先一台後」：票照真的順序送（可靠、照順序的通道），
 * 兩台各掛一個跟事件畫面一樣的處理：票湊齊的那一拍結算（`take()` 套效果那一段）。
 */
const EFFECT: RunEffect[] = [{ kind: 'potions', n: 2 }];

/** 事件畫面的 `take()` 套效果那一段：座位由小到大各跑一次；回傳座位 0 拿到什麼 */
function settle(run: RunState): RunGain[] {
  const gains0: RunGain[] = [];
  for (const i of [0, 1]) applyRunEffects(run, EFFECT, undefined, i === 0 ? gains0 : undefined, i);
  return gains0;
}

/**
 * `deferGuest`：加入方湊齊票之後**不當場套效果**，先記著（修前：等結果圖最多 6 秒才 `take()`）。
 */
function setup(deferGuest = false) {
  const a = newCoopRun('swap-timing', 1, 'ninja', 'feifei');
  const b = newCoopRun('swap-timing', 1, 'ninja', 'feifei');
  // 主機（座位 0）的袋子只剩一格：兩台做一樣的布置
  for (const run of [a, b]) {
    const p = me(run, 0);
    while (p.potions.length < potionCapacity(run, 0) - 1) p.potions.push('smoke_bomb');
  }
  const link = new LoopbackPair();
  const desync: string[] = [];
  const host = new CoopSession(link.a, { isHost: true, seat: 0, onDesync: (w) => desync.push(`主機：${w}`) });
  const guest = new CoopSession(link.b, { isHost: false, seat: 1, onDesync: (w) => desync.push(`加入方：${w}`) });
  host.useRun(a); guest.useRun(b);
  const out = { hostGains: null as RunGain[] | null, guestLater: null as (() => void) | null };
  const onSettled = (s: CoopSession, run: RunState, isHost: boolean) => (kind: string): void => {
    if (kind !== 'event') return;
    const votes = s.picks('event', 2);
    if (votes.some((v) => v === null)) return;
    s.clearPicks('event');
    if (isHost) {
      out.hostGains = settle(run);
      // 主機的結果圖先到、跳換忍具視窗，玩家換掉剛拿到的那一支（最後一格）
      const missed = out.hostGains.find((g) => g.missed)!;
      host.submitRun({ t: 'swap', seat: 0, i: me(run, 0).potions.length - 1, id: missed.id });
    } else if (deferGuest) out.guestLater = () => { settle(run); };
    else settle(run);
  };
  host.onPick(onSettled(host, a, true));
  guest.onPick(onSettled(guest, b, false));
  return { a, b, link, host, guest, desync, out };
}

describe('事件效果在票結算那一拍套（推前審查 高-1）', () => {
  it.each([['主機先投', true], ['加入方先投', false]] as const)('現在的做法（%s）：主機換忍具不會分岔', (_label, hostFirst) => {
    const { a, b, link, host, guest, desync, out } = setup();
    link.hold = true;
    if (hostFirst) { host.pick('event', '0'); link.flush(); guest.pick('event', '0'); link.flush(); }
    else { guest.pick('event', '0'); link.flush(); host.pick('event', '0'); link.flush(); }
    link.flush();
    expect(out.hostGains?.some((g) => g.missed), '布置：兩支只收得下一支，主機換了一支').toBe(true);
    expect(desync).toEqual([]);
    expect(runFingerprint(a)).toBe(runFingerprint(b));
  });

  it('修前的做法（加入方等結果圖才套效果）：主機換忍具那一筆先到，加入方當場整局停掉', () => {
    const { a, b, link, host, guest, desync, out } = setup(true);
    link.hold = true;
    host.pick('event', '0'); link.flush();
    guest.pick('event', '0'); link.flush();   // 加入方湊齊了，但還在等結果圖
    link.flush();                             // 主機的圖先到：套效果、換忍具，swap 送到加入方
    expect(desync.some((d) => d.startsWith('加入方')), '加入方整局停掉').toBe(true);
    out.guestLater?.();                       // 圖終於到了才套：來不及了
    expect(runFingerprint(a)).not.toBe(runFingerprint(b));
  });
});
