import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import { CoopSession } from '../../src/net/session';
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
});
