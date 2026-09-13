import { describe, expect, it } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { applyAction, canApply, chooserOf } from '../../src/net/action';
import { combatFingerprint } from '../../src/net/hash';
import { allReady, endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';
import type { CombatState, PlayerCombat } from '../../src/engine/types';

/*
 * 連線的流程時機（2026-09-14 夜間稽核 高-3～高-7）。
 *
 * 這幾條在測試裡全都不會出事、一開兩個分頁就斷線，原因都一樣：測試是**同步**的，
 * 兩台永遠同一時間進場、同一時間演完魔物回合。真實的兩台差好幾秒。
 * 所以這裡刻意把「一台先、一台後」做出來。
 */

function twoPlayerCombat(seed: string, prep?: (cs: CombatState) => void): CombatState {
  const cs = startCombat({
    hp: 70, maxHp: 70,
    deck: ['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics: [], potions: [],
    encounterId: 'rats3', rng: new Rng(seedFromString(seed)),
  });
  const p2 = blankPlayer(['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'], 1);
  p2.energy = 3;
  p2.hand = p2.drawPile.splice(0, 5);
  cs.players.push(p2);
  prep?.(cs);
  return cs;
}

interface Side { cs: CombatState; s: CoopSession; desync: string[]; dropped: number }

function table(seed: string, opts: { prep?: (cs: CombatState) => void; attachGuest?: boolean } = {}): { link: LoopbackPair; host: Side; guest: Side } {
  const link = new LoopbackPair();
  const mk = (tx: LoopbackPair['a'], isHost: boolean): Side => {
    const side: Side = { cs: twoPlayerCombat(seed, opts.prep), s: null as unknown as CoopSession, desync: [], dropped: 0 };
    side.s = new CoopSession(tx, { isHost, seat: isHost ? 0 : 1, onDesync: (w) => side.desync.push(w) });
    side.s.onDropped(() => { side.dropped += 1; });
    return side;
  };
  const host = mk(link.a, true);
  const guest = mk(link.b, false);
  host.s.attach(host.cs);
  if (opts.attachGuest !== false) guest.s.attach(guest.cs);
  return { link, host, guest };
}

const firstCard = (cs: CombatState, seat: number): number => (cs.players[seat] as PlayerCombat).hand[0]!.uid;
const foeOf = (cs: CombatState): number => cs.enemies.find((e) => !e.dead)!.uid;
/** 兩個人都舉手，兩台畫面都做了「最後一個人舉手那一刻」該做的事：記對帳單、叫會話先別套 */
function bothReady(t: { host: Side; guest: Side }): void {
  t.host.s.submit({ t: 'ready', seat: 0, on: true });
  t.guest.s.submit({ t: 'ready', seat: 1, on: true });
  expect(allReady(t.host.cs) && allReady(t.guest.cs), '兩台都看到兩個人舉手了').toBe(true);
  t.host.s.endOfTurn(); t.host.s.hold();
  t.guest.s.endOfTurn(); t.guest.s.hold();
}

describe('高-5：對帳比的是兩邊各自記下的那一張，不是收到當下的狀態', () => {
  it('手上沒牌的那台先演完魔物回合，晚到的對帳單不可以誤判成分岔', () => {
    const t = table('late-sync');
    t.host.s.submit({ t: 'ready', seat: 0, on: true });
    t.guest.s.submit({ t: 'ready', seat: 1, on: true });
    // 客戶端手上沒牌：記下單子就當場收回合（不用等收牌動畫）
    t.guest.s.endOfTurn();
    endTurn(t.guest.cs);
    // 主機還在演收牌，晚一拍才記
    t.host.s.endOfTurn();
    endTurn(t.host.cs);
    expect(t.host.desync.concat(t.guest.desync), '倒下的人手上永遠沒牌：原本這裡必定斷線').toEqual([]);
    expect(combatFingerprint(t.guest.cs)).toBe(combatFingerprint(t.host.cs));
  });

  it('真的算出不一樣，照樣抓得到（不能為了不誤判就變成什麼都不比）', () => {
    const t = table('late-sync-bad');
    t.guest.cs.players[1]!.hp -= 3;
    t.guest.s.endOfTurn();
    t.host.s.endOfTurn();
    expect(t.host.desync.length + t.guest.desync.length).toBe(1);
    expect(t.host.s.stopped && t.guest.s.stopped).toBe(true);
  });
});

describe('高-6：進場時間不一樣，動作要照場次排隊', () => {
  it('客戶端還沒進場（整局第一場）時主機先出牌：先排著，進場那一刻才套', () => {
    const t = table('late-join', { attachGuest: false });
    expect(t.host.s.submit({ t: 'card', seat: 0, u: firstCard(t.host.cs, 0), g: foeOf(t.host.cs) })).toBe(true);
    expect(combatFingerprint(t.guest.cs), '還沒進場，什麼都還沒套').not.toBe(combatFingerprint(t.host.cs));
    t.guest.s.attach(t.guest.cs);
    expect(combatFingerprint(t.guest.cs), '原本這一張被靜靜丟掉，佇列卡在那一號').toBe(combatFingerprint(t.host.cs));
    expect(t.guest.desync).toEqual([]);
  });

  it('客戶端還停在上一場（對白還在點）時主機在下一場出牌：不可以套進上一場', () => {
    const t = table('next-fight');
    // 第一場打完了。客戶端的畫面還沒走到下一場，連 `attach(null)` 都還沒叫（最慢的情況）
    t.host.cs.phase = 'won'; t.guest.cs.phase = 'won';
    t.host.s.attach(null);
    const hostNext = twoPlayerCombat('next-fight-2');
    const guestNext = twoPlayerCombat('next-fight-2');
    t.host.s.attach(hostNext);
    expect(t.host.s.submit({ t: 'card', seat: 0, u: firstCard(hostNext, 0), g: foeOf(hostNext) })).toBe(true);
    expect(t.guest.desync, '原本：套進已經打完的上一場 → 做不出來 → 整場斷線').toEqual([]);
    t.guest.s.attach(guestNext);
    expect(combatFingerprint(guestNext)).toBe(combatFingerprint(hostNext));
    expect(t.guest.desync.concat(t.host.desync)).toEqual([]);
  });

  it('客戶端比主機先進場先出牌：主機先排著，不可以回「沒算數」', () => {
    const t = table('guest-first');
    t.host.cs.phase = 'won'; t.guest.cs.phase = 'won';
    t.host.s.attach(null); t.guest.s.attach(null);
    const hostNext = twoPlayerCombat('guest-first-2');
    const guestNext = twoPlayerCombat('guest-first-2');
    t.guest.s.attach(guestNext);
    expect(t.guest.s.submit({ t: 'card', seat: 1, u: firstCard(guestNext, 1), g: foeOf(guestNext) })).toBe(true);
    expect(t.guest.dropped, '原本主機拿上一場來判、回「沒算數」，客戶端的牌點了沒反應').toBe(0);
    t.host.s.attach(hostNext);
    expect(t.guest.dropped).toBe(0);
    expect(combatFingerprint(hostNext), '主機進場後那張牌真的打出去了（不是兩邊都沒動所以剛好一樣）')
      .not.toBe(combatFingerprint(twoPlayerCombat('guest-first-2')));
    expect(combatFingerprint(guestNext)).toBe(combatFingerprint(hostNext));
    expect(t.guest.desync.concat(t.host.desync)).toEqual([]);
  });

  it('上一場最後一刻送出、到得太晚的請求，不可以被套進下一場（每場的牌號都一樣）', () => {
    const t = table('stale-req');
    t.link.hold = true;
    const u = firstCard(t.guest.cs, 1);
    const g = foeOf(t.guest.cs);
    expect(t.guest.s.submit({ t: 'card', seat: 1, u, g })).toBe(true);   // 還在路上
    // 主機這邊第一場已經分出勝負、也進了下一場
    t.host.cs.phase = 'won';
    t.host.s.attach(null);
    const hostNext = twoPlayerCombat('stale-req');   // 同一副牌：下一場手上真的有同一個牌號
    t.host.s.attach(hostNext);
    const before = combatFingerprint(hostNext);
    t.link.hold = false;
    t.link.flush();
    expect(combatFingerprint(hostNext), '原本：上一場的牌在下一場被打出去了').toBe(before);
    expect(t.guest.dropped, '回一則「沒算數」讓客戶端把手放開').toBe(1);
    expect(t.host.desync).toEqual([]);
  });
});

describe('高-7：魔物回合演出中，同伴下一回合的動作先排隊', () => {
  it('客戶端演得比較慢：主機發到新手牌就出牌，客戶端演完才套', () => {
    const t = table('hold-guest');
    bothReady(t);
    endTurn(t.host.cs); t.host.s.release();   // 主機先演完
    expect(t.host.s.submit({ t: 'card', seat: 0, u: firstCard(t.host.cs, 0), g: foeOf(t.host.cs) })).toBe(true);
    expect(t.guest.desync, '原本：新手牌還沒抽，這張牌套不進去 → 整場斷線').toEqual([]);
    endTurn(t.guest.cs); t.guest.s.release();
    expect(combatFingerprint(t.guest.cs)).toBe(combatFingerprint(t.host.cs));
    expect(t.guest.desync.concat(t.host.desync)).toEqual([]);
  });

  it('主機演得比較慢：客戶端的請求先排著，不可以拿演到一半的狀態判成「來不及」', () => {
    const t = table('hold-host');
    bothReady(t);
    endTurn(t.guest.cs); t.guest.s.release();   // 客戶端先演完
    expect(t.guest.s.submit({ t: 'card', seat: 1, u: firstCard(t.guest.cs, 1), g: foeOf(t.guest.cs) })).toBe(true);
    expect(t.guest.dropped, '合法的牌被當成來不及丟掉，玩家看到的是點了沒反應').toBe(0);
    endTurn(t.host.cs); t.host.s.release();
    expect(t.guest.dropped).toBe(0);
    expect(combatFingerprint(t.guest.cs)).toBe(combatFingerprint(t.host.cs));
    expect(t.guest.desync.concat(t.host.desync)).toEqual([]);
  });

  it('演出中自己也送不出動作（畫面鎖住之外，會話這層也鎖）', () => {
    const t = table('hold-self');
    bothReady(t);
    endTurn(t.host.cs);   // 引擎走完了，但畫面還沒放開
    expect(t.host.s.submit({ t: 'card', seat: 0, u: firstCard(t.host.cs, 0), g: foeOf(t.host.cs) })).toBe(false);
  });
});

describe('審查 低-3：上一回合送出、演出期間才輪到的請求不算', () => {
  it('客戶端按「替他收回合」的同一刻主機自己結束回合：那一則不可以把主機的新回合直接收掉', () => {
    const t = table('stale-turn');
    expect(t.guest.s.submit({ t: 'ready', seat: 1, on: true })).toBe(true);   // 客戶端先舉手在等
    t.link.hold = true;
    expect(t.guest.s.submit({ t: 'force', seat: 1, w: 0 })).toBe(true);        // 等太久按了「替他收回合」（還在路上）
    expect(t.host.s.submit({ t: 'ready', seat: 0, on: true })).toBe(true);     // 同一刻主機自己按了結束回合
    t.host.s.endOfTurn(); t.host.s.hold();
    endTurn(t.host.cs); t.host.s.release();
    const newTurn = t.host.cs.turn;
    t.link.hold = false;
    t.link.flush();
    expect(t.host.cs.turn).toBe(newTurn);
    expect(t.host.cs.players[0]!.ready, '原本：新回合一開始主機就被收回合').toBe(false);
    expect(t.guest.dropped, '回一則「沒算數」').toBe(1);
    expect(t.host.desync).toEqual([]);
  });
});

describe('審查 範圍外：晚到的畫面要補跑票（倒下那台晚一步進地圖會永遠卡住）', () => {
  const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

  it('同伴的票在我進畫面之前就到了：掛上處理函式的下一拍補跑一次', async () => {
    const t = table('replay');
    t.host.s.pick('map', 'n5');   // 站著的那位先投；倒下那台還停在事件結果頁，沒人在聽
    const seen: string[] = [];
    t.guest.s.clearScreenHooks('map');
    t.guest.s.onPick((k) => { seen.push(k); });
    expect(seen, '註冊的當下不跑（畫面還沒畫完）').toEqual([]);
    await tick();
    expect(seen, '原本：之後再也不會有票進來，永遠不結算').toEqual(['map']);
  });

  it('處理函式每次都重畫、重新註冊：同一個畫面只補一次，不會無限迴圈', async () => {
    const t = table('replay-loop');
    t.host.s.pick('map', 'n5');
    let calls = 0;
    const register = (): void => {
      t.guest.s.clearScreenHooks('map');
      t.guest.s.onPick(() => { calls += 1; register(); });
    };
    register();
    for (let i = 0; i < 5; i++) await tick();
    expect(calls).toBe(1);
  });

  it('換到別的畫面才重新補；結算清掉票之後不再補', async () => {
    const t = table('replay-screen');
    t.host.s.pick('map', 'n5');
    const seen: string[] = [];
    t.guest.s.clearScreenHooks('event');
    t.guest.s.onPick((k) => { seen.push(`event:${k}`); });   // 事件結果頁收到會忽略
    await tick();
    t.guest.s.clearScreenHooks('map');
    t.guest.s.onPick((k) => { seen.push(`map:${k}`); });     // 地圖畫面出來要再補給它
    await tick();
    expect(seen).toEqual(['event:map', 'map:map']);
    t.guest.s.clearPicks('map');
    t.guest.s.clearScreenHooks('event');
    t.guest.s.onPick((k) => { seen.push(`again:${k}`); });
    await tick();
    expect(seen.length, '票清掉了就沒東西可補').toBe(2);
  });
});

describe('高-3：戰鬥中的忍具走連線，而且是自己袋子裡的那瓶', () => {
  it('客戶端喝的是座位 1 的那瓶，兩台一起生效，主機的袋子不動', () => {
    const t = table('potion', {
      prep: (cs) => {
        cs.players[0]!.potions.push('catgrass_tea');
        cs.players[1]!.potions.push('catgrass_tea');
        cs.players[1]!.hp = 40;
      },
    });
    expect(t.guest.s.submit({ t: 'potion', seat: 1, id: 'catgrass_tea' })).toBe(true);
    for (const side of [t.host, t.guest]) {
      expect(side.cs.players[1]!.potions, '座位 1 那瓶用掉了').toEqual([]);
      expect(side.cs.players[1]!.hp).toBe(50);
      expect(side.cs.players[0]!.potions, '座位 0 的沒被喝掉').toEqual(['catgrass_tea']);
    }
    expect(combatFingerprint(t.guest.cs)).toBe(combatFingerprint(t.host.cs));
  });

  it('袋子裡沒有的、目標不存在的：連送都不送（原本主機發了號碼才在套用時被拒，整場停掉）', () => {
    const t = table('no-potion', { prep: (cs) => { cs.players[1]!.potions.push('shuriken'); } });
    expect(canApply(t.host.cs, { t: 'potion', seat: 1, id: 'catgrass_tea' }), '座位 1 沒有貓草茶').toBe(false);
    expect(canApply(t.host.cs, { t: 'potion', seat: 0, id: 'shuriken' }), '手裡劍在座位 1 的袋子裡，不是座位 0 的').toBe(false);
    expect(canApply(t.host.cs, { t: 'potion', seat: 1, id: 'shuriken', g: 987654 }), '沒有這隻魔物').toBe(false);
    expect(canApply(t.host.cs, { t: 'potion', seat: 1, id: 'shuriken', g: foeOf(t.host.cs) })).toBe(true);
  });
});

describe('高-4：選牌只有打出那張牌的人選得了', () => {
  const prep = (cs: CombatState): void => { cs.players[1]!.hand.push(inst('gaotui', 1999)); };

  it('座位 1 打出「告退」：兩台都在等座位 1 選，主機替他選不算數', () => {
    const t = table('choose', { prep });
    expect(t.guest.s.submit({ t: 'card', seat: 1, u: 1999 })).toBe(true);
    expect(chooserOf(t.host.cs)).toBe(1);
    expect(chooserOf(t.guest.cs)).toBe(1);
    const pick = t.host.cs.pending!.cards[0]!.uid;
    expect(t.host.s.submit({ t: 'choose', seat: 0, u: [pick] }), '主機的畫面不該跳視窗，會話這層也擋').toBe(false);
    expect(applyAction(t.host.cs, { t: 'choose', seat: 0, u: [pick] }), '硬塞進引擎也不算數').toBe(false);
    expect(t.guest.s.submit({ t: 'choose', seat: 1, u: [424242] }), '挑了清單裡沒有的牌：連送都不送').toBe(false);

    expect(t.guest.s.submit({ t: 'choose', seat: 1, u: [pick] })).toBe(true);
    expect(t.host.cs.pending).toBeNull();
    expect(t.guest.cs.pending).toBeNull();
    expect(combatFingerprint(t.guest.cs)).toBe(combatFingerprint(t.host.cs));
    expect(t.host.desync.concat(t.guest.desync)).toEqual([]);
  });

  it('沒有待選時問「誰在選」回 -1', () => {
    const t = table('choose-none');
    expect(chooserOf(t.host.cs)).toBe(-1);
  });
});
