import { TURN_DECAY, type StatusName, type Unit } from './types';

export function getStatus(u: Unit, name: StatusName): number {
  return u.statuses[name] ?? 0;
}

export function addStatus(u: Unit, name: StatusName, amount: number): void {
  const v = getStatus(u, name) + amount;
  if (v <= 0) delete u.statuses[name];
  else u.statuses[name] = v;
}

export function removeStatus(u: Unit, name: StatusName): void {
  delete u.statuses[name];
}

export function decayTurnStatuses(u: Unit): void {
  for (const name of TURN_DECAY) if (getStatus(u, name) > 0) addStatus(u, name, -1);
}

export function tickPoison(u: Unit): number {
  const n = getStatus(u, '噎到');
  if (n <= 0) return 0;
  u.hp = Math.max(0, u.hp - n);
  addStatus(u, '噎到', -1);
  return n;
}

export function computeAttack(base: number, attacker: Unit, defender: Unit, opts: { noStrength?: boolean } = {}): number {
  let v = base + (opts.noStrength ? 0 : getStatus(attacker, '爪力'));
  if (getStatus(attacker, '懶洋洋') > 0) v *= 0.75;
  if (getStatus(defender, '翻肚') > 0) v *= 1.5;
  return Math.max(0, Math.floor(v));
}

export function computeBlock(base: number, u: Unit): number {
  let v = base + getStatus(u, '貓步');
  if (getStatus(u, '炸毛') > 0) v *= 0.75;
  return Math.max(0, Math.floor(v));
}
