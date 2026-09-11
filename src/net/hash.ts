import type { CombatState, StatusName, Unit } from '../engine/types';

/**
 * 戰鬥狀態的指紋——**鎖步連線最重要的一道保險**。
 *
 * 鎖步的毛病是：兩邊一旦算出不同的結果，**當下不會有任何錯誤**。
 * 你這邊那隻怪剩 3 滴血、對方那邊已經倒了，兩邊各自繼續跑，
 * 要好幾回合之後畫面明顯對不上才發現，那時已經沒救、也查不出是哪一步走岔的。
 *
 * 所以每回合結束互相對一次指紋：對不上就**當場停下來**告訴玩家，
 * 而不是讓兩個人繼續玩兩份不一樣的遊戲。
 *
 * 要涵蓋「會影響之後計算」的每一個欄位，**亂數狀態也要算進去**——
 * 亂數走岔一步，畫面上當下可能完全看不出來，下一次抽牌才爆開。
 */

/** FNV-1a（32 位元）。挑它是因為夠短、夠快，而且不吃任何外部相依 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 狀態列要**排序後**再串：物件的鍵順序跟疊上去的先後有關，兩邊順序不同但內容相同時不該判成分岔 */
function statusOf(u: Unit): string {
  const names = Object.keys(u.statuses).sort() as StatusName[];
  return names.filter((n) => (u.statuses[n] ?? 0) !== 0).map((n) => `${n}:${u.statuses[n]}`).join(',');
}

function pile(cards: { uid: number; cardId: string; upgraded: boolean }[]): string {
  // 抽牌堆與棄牌堆的**順序有意義**（下一張抽到什麼），所以不排序
  return cards.map((c) => `${c.uid}.${c.cardId}${c.upgraded ? '+' : ''}`).join(' ');
}

/**
 * 這一刻的戰鬥指紋。兩邊算出來不一樣＝已經分岔了。
 *
 * 回傳八位十六進位字串，短到可以塞進每回合的訊息裡，也短到人眼看得出不同。
 */
export function combatFingerprint(cs: CombatState): string {
  const parts: string[] = [
    `t${cs.turn}`, cs.phase, cs.encounterId,
    // 亂數狀態：走岔一步當下看不出來，下一次抽牌才爆開
    `r${cs.rng.state.a},${cs.rng.state.b},${cs.rng.state.c},${cs.rng.state.d}`,
    `k${cs.kills}`, `c${cs.cardsPlayed}`, `f${cs.fishDelta}`, `s${cs.stolenFish}`,
  ];
  for (const p of cs.players) {
    parts.push([
      `P${p.seat}`, `hp${p.hp}/${p.maxHp}`, `b${p.block}`, `a${p.armour}`, `e${p.energy}/${p.maxEnergy}`,
      p.down ? 'DOWN' : '', p.ready ? 'RDY' : '',
      statusOf(p),
      `h[${pile(p.hand)}]`, `d[${pile(p.drawPile)}]`, `x[${pile(p.discardPile)}]`, `z[${pile(p.exhaustPile)}]`,
      `rel[${[...p.relics].sort().join(',')}]`, `pot[${p.potions.join(',')}]`,
      `pw${p.powers.length}`, `dn${p.doubleNext}`,
    ].join('|'));
  }
  for (const e of cs.enemies) {
    parts.push([
      `E${e.uid}`, e.enemyId, `hp${e.hp}/${e.maxHp}`, `b${e.block}`,
      e.dead ? 'DEAD' : '', e.escaped ? 'GONE' : '',
      `ph${e.phase}`, `mi${e.moveIndex}`, `tc${e.turnCount}`, `rv${e.reviveIn}`, `iv${e.invulnIn}`,
      // 頭上預告的那一招：兩邊預告不同，下一拍就會打出不一樣的東西
      e.move.label,
      statusOf(e),
    ].join('|'));
  }
  return fnv1a(parts.join('\n')).toString(16).padStart(8, '0');
}
