import { afterEach, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import { CoopSession, MATE_ABSENT_MS } from '../../src/net/session';
import { combatFingerprint } from '../../src/net/hash';
import { LoopbackPair } from '../../src/net/transport';
import { IDLE_FORCE_MS, allReady } from '../../src/engine/combat';
import { beginCombat, newCoopRun } from '../../src/engine/run';

/*
 * 2026-09-23 連線稽核 中-1：第三關關主前的塔頂段落照本機角色挑，混搭時兩台長度差很多
 *（封封二十多句、噹噹是空的）。噹噹那台先進場，等滿一分鐘「替他收回合」就亮了，
 * 封封一進戰鬥第一回合就被收掉。修法：同伴進場時送一則 `here`，閒置計時從兩邊都進場才起算，
 * 他還沒進場之前會話也不收「替他收回合」。
 *
 * 照 coop_flow_0914 的做法把「一台先、一台後」做出來：`LoopbackPair.hold` 讓訊息先留在路上。
 */
function table() {
  const link = new LoopbackPair();
  const host = new CoopSession(link.a, { isHost: true, seat: 0 });
  const guest = new CoopSession(link.b, { isHost: false, seat: 1 });
  const hostCs = beginCombat(newCoopRun('mate-here-0923', 1, 'dangdang', 'fengfeng'), 'rats2');
  const guestCs = beginCombat(newCoopRun('mate-here-0923', 1, 'dangdang', 'fengfeng'), 'rats2');
  return { link, host, guest, hostCs, guestCs };
}

describe('中-1：同伴還沒進場，不能替他收回合', () => {
  it('先進場的那台：同伴 attach 之前 mateHere 是 false、替他收回合送不出去；他進場的那一則到了才可以', () => {
    const t = table();
    t.link.hold = true;
    t.host.attach(t.hostCs);                  // 噹噹那台幾秒就進場
    t.link.flush();
    expect(t.host.submit({ t: 'ready', seat: 0, on: true }), '自己舉手照常').toBe(true);
    expect(t.host.mateHere, '封封還在讀塔頂段落').toBe(false);
    expect(t.host.submit({ t: 'force', seat: 0, w: 1 }), '這時送出去，封封一進場第一回合就被收掉').toBe(false);

    t.guest.attach(t.guestCs);                // 封封讀完進場：他那一則還在路上
    expect(t.guest.mateHere, '主機那一則早就到了').toBe(true);
    expect(t.host.mateHere, '他那一則還沒到').toBe(false);
    t.link.flush();
    expect(t.host.mateHere).toBe(true);
    expect(allReady(t.guestCs), '封封進場後第一回合還是他的').toBe(false);
    expect(t.host.submit({ t: 'force', seat: 0, w: 1 }), '兩邊都進場了才可以替他收').toBe(true);
    t.link.flush();
    expect(allReady(t.hostCs) && allReady(t.guestCs)).toBe(true);
  });

  describe('推前審查 低-2：同伴一直掛著不進場的長上限', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('我進場滿三分鐘他還沒進來，就可以替他收回合；他那台時鐘不同也照樣套得進去', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-23T12:00:00+08:00'));
      const t = table();
      t.link.hold = true;
      t.host.attach(t.hostCs);                // 我進場
      t.link.flush();
      expect(t.host.submit({ t: 'ready', seat: 0, on: true })).toBe(true);
      vi.setSystemTime(Date.now() + MATE_ABSENT_MS - 1000);
      expect(t.host.mayForce, '還差一秒').toBe(false);
      expect(t.host.submit({ t: 'force', seat: 0, w: 1 })).toBe(false);
      vi.setSystemTime(Date.now() + 2000);
      expect(t.host.mateHere, '他還掛在劇情裡').toBe(false);
      expect(t.host.mayForce).toBe(true);
      expect(t.host.submit({ t: 'force', seat: 0, w: 1 }), '滿三分鐘了：不用再乾等或回標題').toBe(true);
      // 他那台的時鐘比我慢十分鐘，終於點完劇情進場：排隊的動作照編號套下去，兩台一致
      vi.setSystemTime(Date.now() - 600_000);
      t.guest.attach(t.guestCs);
      t.link.flush();
      expect(allReady(t.hostCs) && allReady(t.guestCs)).toBe(true);
      expect(combatFingerprint(t.guestCs)).toBe(combatFingerprint(t.hostCs));
    });

    it('他進場了就回到原本的規矩（進場這件事本身不擋，閒置夠久由畫面那一層判斷）', () => {
      const t = table();
      t.host.attach(t.hostCs);
      expect(t.host.mayForce).toBe(false);
      t.guest.attach(t.guestCs);
      expect(t.host.mayForce).toBe(true);
    });
  });

  it('下一場重新算：上一場的 here 不算這一場的', () => {
    const t = table();
    t.host.attach(t.hostCs);
    t.guest.attach(t.guestCs);
    expect(t.host.mateHere).toBe(true);
    t.host.attach(null); t.guest.attach(null);
    const next = beginCombat(newCoopRun('mate-here-0923-2', 1, 'dangdang', 'fengfeng'), 'rats2');
    t.link.hold = true;
    t.host.attach(next);
    expect(t.host.mateHere, '同伴還在上一格收尾').toBe(false);
  });
});

describe('中-1：戰鬥畫面的閒置計時從同伴進場那一刻才起算', () => {
  // 切出戰鬥畫面裡那三行（`mateActAt`、`mateTurnSeen`、`mateIdleMs`）照原樣跑，時鐘自己撥
  const SRC = COMBAT_RAW.replace(/\r\n/g, '\n');
  const start = SRC.indexOf('  let mateActAt = Date.now();');
  const end = SRC.indexOf('  /** 有連線時，把動作送出去', start);
  if (start < 0 || end < 0) throw new Error('找不到 mateIdleMs 那一段');
  const body = SRC.slice(start, end);

  it('我先進場 70 秒、同伴才進場：他進場後滿 60 秒才亮，不是一進場就亮', async () => {
    let now = 0;
    const session = { mateHere: false };
    const out: { idle?: () => number } = {};
    const js = (await transformWithOxc(`${body}\nout.idle = mateIdleMs;`, 'mate-idle.ts')).code;
    new Function('Date', 'cs', 'session', 'out', js)({ now: () => now }, { turn: 1 }, session, out);
    // 每秒那一支在「只剩同伴沒舉手」時才開始問：我進場第 5 秒就舉手了，從這裡開始每秒問一次
    now = 5_000;
    out.idle!();
    now = 70_000;
    expect(out.idle!(), '他還在看劇情，不算閒置').toBeLessThan(IDLE_FORCE_MS);
    session.mateHere = true;                  // 他進場了
    expect(out.idle!()).toBeLessThan(1000);
    now = 70_000 + IDLE_FORCE_MS - 1000;
    expect(out.idle!(), '進場才 59 秒').toBeLessThan(IDLE_FORCE_MS);
    now = 70_000 + IDLE_FORCE_MS + 1000;
    expect(out.idle!(), '進場後真的一分鐘沒動，才可以替他收').toBeGreaterThanOrEqual(IDLE_FORCE_MS);
  });

  it('推前審查 低-2：他一直不進場，滿三分鐘長上限之後照常再數一分鐘就亮（不是永遠不亮）', async () => {
    let now = 0;
    const session = { mateHere: false, mayForce: false };
    const out: { idle?: () => number } = {};
    const js = (await transformWithOxc(`${body}\nout.idle = mateIdleMs;`, 'mate-idle-absent.ts')).code;
    new Function('Date', 'cs', 'session', 'out', js)({ now: () => now }, { turn: 1 }, session, out);
    // 每秒那一支從我舉手（第 5 秒）起一直問
    for (now = 5_000; now < MATE_ABSENT_MS; now += 1000) out.idle!();
    expect(out.idle!(), '長上限還沒到：他在看劇情不算閒置').toBeLessThan(1000);
    session.mayForce = true;                  // 會話說：滿三分鐘了
    const since = now;
    now = since + IDLE_FORCE_MS - 2000;
    expect(out.idle!()).toBeLessThan(IDLE_FORCE_MS);
    now = since + IDLE_FORCE_MS + 1000;
    expect(out.idle!(), '原本的一分鐘規矩照舊，只是起算點補了這條退路').toBeGreaterThanOrEqual(IDLE_FORCE_MS);
  });
});
