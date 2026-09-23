import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { allReady, endTurn } from '../../src/engine/combat';
import { beginCombat, newCoopRun } from '../../src/engine/run';
import { cardStats } from '../../src/engine/deck';
import { applyAction } from '../../src/net/action';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { combatFingerprint } from '../../src/net/hash';
import type { CombatState } from '../../src/engine/types';

function sourceBetween(start: string, end: string): string {
  const first = SRC.indexOf(start);
  const last = SRC.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Missing combat branch: ${start}`);
  return SRC.slice(first, last);
}

function snapshot(cs: CombatState) {
  return {
    enemies: new Map(cs.enemies.map((enemy) => [enemy.uid, {
      hp: enemy.hp, dead: enemy.dead, stealth: 0,
    }])),
    logN: cs.log.length,
    hitN: cs.hits.length,
  };
}

describe('連線批次演出與回合暫停', () => {
  it('補齊批次內的最後舉手時立即暫停同步，等演出結束才套用下一回合的牌', async () => {
    const source = sourceBetween('      const alreadyShown =', '      let ownCard: CardInstance | undefined;')
      + '\nfinishApplied();';
    const transformed = await transformWithOxc(source, 'combat-batch-hold.ts');
    const link = new LoopbackPair();
    const hostCs = beginCombat(newCoopRun('batch-hold-race'), 'rats2');
    const guestCs = beginCombat(newCoopRun('batch-hold-race'), 'rats2');
    for (const cs of [hostCs, guestCs]) for (const enemy of cs.enemies) {
      enemy.hp = 9999; enemy.maxHp = 9999;
    }
    const failures: string[] = [];
    const host = new CoopSession(link.a, { isHost: true, seat: 0, onDesync: (why) => failures.push(why) });
    const guest = new CoopSession(link.b, { isHost: false, seat: 1, onDesync: (why) => failures.push(why) });
    host.attach(hostCs);
    guest.attach(guestCs);
    const presentation: Array<{ kind: string; play?: () => void; run?: () => void }> = [];
    let before = snapshot(guestCs);
    let replay = structuredClone(guestCs);
    replay.rng = guestCs.rng.clone();
    guest.beforeApply(() => {
      before = snapshot(guestCs);
      replay = structuredClone(guestCs);
      replay.rng = guestCs.rng.clone();
    });
    host.onApplied(() => {
      if (allReady(hostCs) && !hostCs.pending) { host.endOfTurn(); host.hold(); }
    });
    guest.onApplied((applied) => {
      const bindings = {
        applied, turn: {}, mine: false, session: guest, cs: guestCs, app: { cs: guestCs }, mySeat: 1,
        my: () => guestCs.players[1], remoteBefore: before, remoteCombatBefore: replay,
        remotePresentationRunning: false, allReady, checkOver() {}, syncPicker() {},
        root: { querySelector: () => undefined }, sfx() {}, collectHand: () => 0,
        runEnemyTurn: () => { endTurn(guestCs); guest.release(); }, collecting: false,
        snap: snapshot, applyAction, cardStats, locallyPlayedMotion: { take: () => undefined },
        motionForCard: () => 'attack1', motionSourceFor: () => 'qiuqiu', prepareMelee: () => undefined,
        qiuqiuMotionBatchBoundaries: (points: ReturnType<typeof snapshot>[]) => points.slice(1).map((point, index) => ({
          logStart: points[index]!.logN, logEnd: point.logN,
          hitStart: points[index]!.hitN, hitEnd: point.hitN,
        })),
        qiuqiuConsumedStealth: () => 0, buildCombatMotionImpactPlan: () => [{}],
        motionDuration: () => 650, motionImpactDelay: () => 200,
        combatMotionPresentationWait: () => 650, motionHeldSprites: new Map(),
        fallingUids: new Set(), motionPendingDamage: new Map(),
        enqueueRemotePresentation: (...items: typeof presentation) => presentation.push(...items),
      };
      new Function(...Object.keys(bindings), transformed.code)(...Object.values(bindings));
    });

    link.hold = true;
    const first = hostCs.players[0]!.hand.find((card) => cardStats(card).def.type === '攻擊')!;
    expect(host.submit({ t: 'card', seat: 0, u: first.uid, g: hostCs.enemies[0]!.uid })).toBe(true);
    expect(host.submit({ t: 'ready', seat: 0, on: true })).toBe(true);
    expect(host.submit({ t: 'force', seat: 0, w: 1 })).toBe(true);
    link.flush({ reverse: true });
    expect(presentation.filter((item) => item.kind === 'step')).toHaveLength(3);
    expect(allReady(guestCs)).toBe(true);
    expect(combatFingerprint(guestCs)).toBe(combatFingerprint(hostCs));

    // 快端已發新手牌，慢端仍在播放舊回合的三步演出。
    endTurn(hostCs);
    host.release();
    link.hold = false;
    const next = hostCs.players[0]!.hand.find((card) => cardStats(card).def.type === '攻擊')!;
    expect(host.submit({ t: 'card', seat: 0, u: next.uid, g: hostCs.enemies[0]!.uid })).toBe(true);
    expect(guestCs.turn).toBe(1);
    expect(failures).toEqual([]);
    expect(guest.stopped).toBe(false);
    presentation.find((item) => item.kind === 'done')!.run!();
    expect(guestCs.turn).toBe(hostCs.turn);
    expect(combatFingerprint(guestCs)).toBe(combatFingerprint(hostCs));
  });
});
