import type { CardInstance, PlayerCombat, Unit } from '../src/engine/types';

export function blankUnit(hp = 50): Unit {
  return { hp, maxHp: hp, block: 0, statuses: {} };
}

export function inst(cardId: string, uid: number, upgraded = false): CardInstance {
  return { uid, cardId, upgraded };
}

export function blankPlayer(deckIds: string[] = []): PlayerCombat {
  return {
    hp: 70, maxHp: 70, block: 0, statuses: {},
    energy: 3, maxEnergy: 3,
    hand: [], drawPile: deckIds.map((id, i) => inst(id, i + 1)), discardPile: [], exhaustPile: [],
    retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
    noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
    firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false,
  };
}
