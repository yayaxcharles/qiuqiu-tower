import type { CardInstance, PlayerCombat, Unit } from '../src/engine/types';

export function blankUnit(hp = 50): Unit {
  return { hp, maxHp: hp, block: 0, statuses: {} };
}

export function inst(cardId: string, uid: number, upgraded = false): CardInstance {
  return { uid, cardId, upgraded };
}

export function blankPlayer(deckIds: string[] = [], seat = 0): PlayerCombat {
  return {
    seat, relics: [], potions: [],
    hp: 70, maxHp: 70, block: 0, armour: 0, statuses: {},
    energy: 3, maxEnergy: 3,
    // uid 加上座位偏移：真實遊戲裡 `RunState.nextUid` 是整局共用的，兩個人的牌不會撞號，
    // 測試也得照這條走——撞號的話「打對方的牌」會誤打成自己同號的那張，測出假的結果
    hand: [], drawPile: deckIds.map((id, i) => inst(id, seat * 1000 + i + 1)), discardPile: [], exhaustPile: [],
    retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
    noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
    firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false, freshDebuffs: {}, fishDelta: 0, range: 0,
  };
}
