import { cardById } from '../content/cards';
import { eventById } from '../content/events';
import { canPlay, endTurn, playCard, resolveChoice, usePotion } from './combat';
import { nextChoices } from './map';
import { Rng, seedFromString } from './rng';
import { aliveEnemies } from './actions';
import { addCard, applyRunEffects, beginCombat, buyCard, buyRemove, chooseNode, finishCombat, makeShop, newRun, openChest, removeCard, rest, takeCardReward, upgradeCard, type RunEffectOutcome } from './run';
import { potionById } from '../content/potions';
import type { CombatState, RunState } from './types';

export interface BotStats { seed: string; won: boolean; floor: number; turns: number; kills: number; deckSize: number }

export function playCombat(cs: CombatState, rng: Rng, maxTurns: number): void {
  while (cs.phase === 'player') {
    if (cs.turn > maxTurns) throw new Error(`戰鬥超過 ${maxTurns} 回合：${cs.encounterId}`);
    if (cs.pending) {
      const pd = cs.pending;
      const n = rng.int(pd.min, pd.max);
      const picks = rng.shuffle(pd.cards).slice(0, n).map((c) => c.uid);
      if (!resolveChoice(cs, picks)) throw new Error('resolveChoice 被拒');
      continue;
    }
    const enemies = aliveEnemies(cs);
    if (cs.potions.length > 0 && rng.chance(0.3)) {
      const pid = rng.pick(cs.potions);
      const def = potionById[pid]!;
      usePotion(cs, pid, def.target === 'enemy' ? rng.pick(enemies).uid : undefined);
      continue;
    }
    const playable = cs.player.hand.filter((c) => {
      const def = cardById[c.cardId]!;
      return canPlay(cs, c.uid, def.target === 'enemy' ? enemies[0]?.uid : undefined).ok;
    });
    if (playable.length === 0 || rng.chance(0.15)) { endTurn(cs); continue; }
    const card = rng.pick(playable);
    const def = cardById[card.cardId]!;
    const target = def.target === 'enemy' ? rng.pick(aliveEnemies(cs)).uid : undefined;
    if (!playCard(cs, card.uid, target)) endTurn(cs);
  }
}

function handleOutcome(run: RunState, rng: Rng, outcome: RunEffectOutcome, maxTurns: number): void {
  if (!outcome) return;
  if ('needs' in outcome) {
    const cands = run.deck.filter((c) => (outcome.needs === 'removeCard') || (!c.upgraded && cardById[c.cardId]?.pool !== '壞毛病'));
    if (cands.length) { const c = rng.pick(cands); outcome.needs === 'removeCard' ? removeCard(run, c.uid) : upgradeCard(run, c.uid); }
  } else if ('chooseCard' in outcome) {
    if (outcome.chooseCard.length) addCard(run, rng.pick(outcome.chooseCard).id);
  } else if ('fight' in outcome) {
    const cs = beginCombat(run, outcome.fight.encounterId);
    playCombat(cs, rng, maxTurns);
    const r = finishCombat(run, cs, outcome.fight.bonusFish);
    if (r && r.cards.length) takeCardReward(run, r, rng.chance(0.7) ? rng.pick(r.cards).id : null);
  }
}

export function playRun(seed: string, opts: { maxTurnsPerCombat?: number } = {}): BotStats {
  // 上限 300：亂打會把牌組用「告退」耗到只剩沒有輸出的牌，再靠隱身跟魔物僵持，
  // 一萬七百局實測最長的一場是 134 回合（scan-4485 的巨型飯糰），留兩倍餘裕；真的卡死仍會被抓到
  const maxTurns = opts.maxTurnsPerCombat ?? 300;
  const run = newRun(seed);
  const rng = new Rng(seedFromString('bot:' + seed));
  let guard = 0;
  while (run.status === 'playing') {
    if (++guard > 40) throw new Error('節點推進超過 40 次');
    const node = chooseNode(run, rng.pick(nextChoices(run.map, run.currentNode)).id);
    switch (node.type) {
      case '戰鬥': case '大魔物': case '塔主': {
        const cs = beginCombat(run);
        playCombat(cs, rng, maxTurns);
        const r = finishCombat(run, cs);
        if (r && r.cards.length) takeCardReward(run, r, rng.chance(0.7) ? rng.pick(r.cards).id : null);
        break;
      }
      case '事件': {
        const ev = eventById[node.eventId!]!;
        const options = ev.choices.filter((c) => (c.costFish ?? 0) <= run.fish);
        const c = rng.pick(options.length ? options : ev.choices);
        if (c.costFish) run.fish -= c.costFish;
        handleOutcome(run, rng, applyRunEffects(run, c.outcome), maxTurns);
        break;
      }
      case '罐頭鋪': {
        const shop = makeShop(run);
        for (let i = 0; i < shop.cards.length; i++) if (rng.chance(0.4)) buyCard(run, shop, i);
        if (rng.chance(0.5) && run.deck.length > 0) buyRemove(run, rng.pick(run.deck).uid);
        break;
      }
      case '貓窩': {
        const up = run.deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病');
        if (run.hp < run.maxHp * 0.6 || up.length === 0) rest(run, '打盹'); else rest(run, '磨爪', rng.pick(up).uid);
        break;
      }
      case '紙箱': openChest(run); break;
    }
  }
  return { seed, won: run.status === 'won', floor: run.floor, turns: run.stats.turns, kills: run.stats.kills, deckSize: run.deck.length };
}
