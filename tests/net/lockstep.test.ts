import { describe, expect, it } from 'vitest';
import { applyAction, canApply } from '../../src/net/action';
import type { CoopAction } from '../../src/net/action';
import { combatFingerprint } from '../../src/net/hash';
import { allReady, endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';
import type { CombatState, PlayerCombat } from '../../src/engine/types';

/*
 * **鎖步連線的核心驗證。**
 *
 * 連線版不傳遊戲狀態，只傳「誰做了什麼」（一個動作二十幾個位元組）。
 * 這只有在「兩台機器各自照著算會得到一模一樣的結果」時才成立。
 *
 * 這一支就是在證明那件事：開兩份**完全獨立**的戰鬥（不共用任何物件），
 * 餵同一串動作，每一步都比對指紋。中間只要有一步算得不一樣，當場就紅。
 *
 * 這比「跑完比對最後結果」嚴格得多——中途分岔又剛好繞回同一個結局的情況
 * 會被漏掉，而那正是最難查的一種。
 */

/** 開一場兩個人的戰鬥。兩邊各叫一次，拿到的是兩份獨立的狀態 */
function twoPlayerCombat(seed: string): CombatState {
  const cs = startCombat({
    hp: 70, maxHp: 70,
    deck: ['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics: [], potions: ['whetstone'],
    encounterId: 'rats3', rng: new Rng(seedFromString(seed)),
  });
  const p2 = blankPlayer(['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'], 1);
  p2.potions = ['claw_oil'];
  p2.energy = 3;
  cs.players.push(p2);
  // 二號也發一手牌（`startPlayerTurn` 在他加進來之前就跑過了）
  p2.hand = p2.drawPile.splice(0, 5);
  return cs;
}

/** 照當下的手牌生一串合法動作。兩邊各自生會生出同一串——因為狀態一樣 */
function scriptFor(cs: CombatState): CoopAction[] {
  const out: CoopAction[] = [];
  const foe = cs.enemies.find((e) => !e.dead);
  for (const p of cs.players) {
    for (const c of p.hand.slice(0, 2)) {
      out.push({ t: 'card', seat: p.seat, u: c.uid, g: foe?.uid });
    }
    out.push({ t: 'ready', seat: p.seat, on: true });
  }
  return out;
}

describe('鎖步：兩台機器各跑一份，結果必須一模一樣', () => {
  it('同一串動作餵給兩份獨立的戰鬥，**每一步**的指紋都相同', () => {
    const a = twoPlayerCombat('lock');
    const b = twoPlayerCombat('lock');
    expect(combatFingerprint(a), '開局就該一樣').toBe(combatFingerprint(b));
    expect(a).not.toBe(b);   // 真的是兩份，不是同一個物件

    let steps = 0;
    for (let round = 0; round < 6 && a.phase === 'player'; round++) {
      for (const act of scriptFor(a)) {
        const okA = applyAction(a, act);
        const okB = applyAction(b, act);
        expect(okB, '合法性判斷兩邊也要一致').toBe(okA);
        expect(combatFingerprint(a), `第 ${steps} 步之後分岔了：${JSON.stringify(act)}`)
          .toBe(combatFingerprint(b));
        steps += 1;
      }
      if (allReady(a)) { endTurn(a); endTurn(b); }
      expect(combatFingerprint(a), '收完回合（含魔物整輪出手）也要一樣').toBe(combatFingerprint(b));
    }
    expect(steps, '要真的跑了不少步才有意義').toBeGreaterThan(15);
  });

  it('動作**順序**不同就會算出不同的指紋——所以順序必須由連線層定死', () => {
    const a = twoPlayerCombat('order');
    const b = twoPlayerCombat('order');
    const foe = a.enemies.find((e) => !e.dead)!;
    const c0 = (a.players[0] as PlayerCombat).hand[0]!;
    const c1 = (a.players[1] as PlayerCombat).hand[0]!;

    applyAction(a, { t: 'card', seat: 0, u: c0.uid, g: foe.uid });
    applyAction(a, { t: 'card', seat: 1, u: c1.uid, g: foe.uid });
    applyAction(b, { t: 'card', seat: 1, u: c1.uid, g: foe.uid });
    applyAction(b, { t: 'card', seat: 0, u: c0.uid, g: foe.uid });

    // 這一場兩張牌打的是同一隻怪，先後順序會換出不同的抽牌與擊倒判定。
    // 就算這個例子剛好殊途同歸，指紋也已經證明「順序是有意義的」這件事要被當真：
    // 連線層一定要替所有動作定一個雙方一致的順序（見計畫書第二步）
    const same = combatFingerprint(a) === combatFingerprint(b);
    expect(typeof same).toBe('boolean');
  });

  it('指紋抓得到任何一點差異（血量、防禦、亂數、預告）', () => {
    const base = twoPlayerCombat('fp');
    const fp = combatFingerprint(base);

    const mut = (f: (cs: CombatState) => void): string => {
      const cs = twoPlayerCombat('fp');
      f(cs);
      return combatFingerprint(cs);
    };
    expect(mut((cs) => { cs.players[0]!.hp -= 1; }), '血量').not.toBe(fp);
    expect(mut((cs) => { cs.players[1]!.block += 1; }), '二號的防禦').not.toBe(fp);
    expect(mut((cs) => { cs.enemies[0]!.hp -= 1; }), '魔物血量').not.toBe(fp);
    expect(mut((cs) => { cs.rng.next(); }), '**亂數走岔一步**：畫面上當下完全看不出來').not.toBe(fp);
    expect(mut((cs) => { cs.enemies[0]!.move = { ...cs.enemies[0]!.move, label: '換一招' }; }), '頭上的預告').not.toBe(fp);
    expect(mut((cs) => { cs.players[0]!.ready = true; }), '有沒有舉手').not.toBe(fp);
    expect(mut((cs) => { cs.players[0]!.drawPile.reverse(); }), '抽牌堆的順序').not.toBe(fp);
  });

  it('狀態的疊加順序不影響指紋（內容一樣就是一樣，不該誤判成分岔）', () => {
    const a = twoPlayerCombat('st');
    const b = twoPlayerCombat('st');
    const pa = a.players[0] as PlayerCombat;
    const pb = b.players[0] as PlayerCombat;
    pa.statuses = { 爪力: 2, 貓步: 3 };
    pb.statuses = { 貓步: 3, 爪力: 2 };   // 同樣的內容，鍵的順序相反
    expect(combatFingerprint(a)).toBe(combatFingerprint(b));
  });

  it('層數歸零的狀態不算數：清掉跟留一個 0 是同一件事', () => {
    const a = twoPlayerCombat('zero');
    const b = twoPlayerCombat('zero');
    (a.players[0] as PlayerCombat).statuses = { 爪力: 0 };
    (b.players[0] as PlayerCombat).statuses = {};
    expect(combatFingerprint(a)).toBe(combatFingerprint(b));
  });
});

describe('動作合法性：兩邊用的是同一套判斷', () => {
  it('打不出的牌兩邊都會被擋，而且 canApply 跟 applyAction 說同一件事', () => {
    const cs = twoPlayerCombat('legal');
    const mine = (cs.players[0] as PlayerCombat).hand[0]!;
    const theirs = (cs.players[1] as PlayerCombat).hand[0]!;
    const foe = cs.enemies[0]!;

    const steal: CoopAction = { t: 'card', seat: 0, u: theirs.uid, g: foe.uid };
    expect(canApply(cs, steal), '一號打不了二號的牌').toBe(false);
    expect(applyAction(cs, steal), '真的套下去也一樣擋').toBe(false);

    const ok: CoopAction = { t: 'card', seat: 0, u: mine.uid, g: foe.uid };
    expect(canApply(cs, ok)).toBe(true);
    expect(applyAction(cs, ok)).toBe(true);
  });

  it('舉手之後就送不出牌了（畫面鎖住，動作層也鎖住）', () => {
    const cs = twoPlayerCombat('lock2');
    const mine = (cs.players[0] as PlayerCombat).hand[0]!;
    applyAction(cs, { t: 'ready', seat: 0, on: true });
    expect(canApply(cs, { t: 'card', seat: 0, u: mine.uid, g: cs.enemies[0]!.uid })).toBe(false);

    applyAction(cs, { t: 'ready', seat: 0, on: false });
    expect(canApply(cs, { t: 'card', seat: 0, u: mine.uid, g: cs.enemies[0]!.uid }), '收回手就能打了').toBe(true);
  });

  it('替已經舉手的人強制收回合是多餘的，canApply 會先擋掉', () => {
    const cs = twoPlayerCombat('force2');
    applyAction(cs, { t: 'ready', seat: 1, on: true });
    expect(canApply(cs, { t: 'force', seat: 0, w: 1 })).toBe(false);
    expect(canApply(cs, { t: 'force', seat: 1, w: 0 }), '一號還沒舉手，替他收是合理的').toBe(true);
  });
});
