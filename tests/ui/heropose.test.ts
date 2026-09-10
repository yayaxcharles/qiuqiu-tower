import { describe, expect, it } from 'vitest';
import { idlePoseKey, type IdlePoses } from '../../src/ui/heropose';
import { addStatus } from '../../src/engine/statuses';
import type { StatusName, Unit } from '../../src/engine/types';
import { blankUnit } from '../helpers';

const POSES: IdlePoses = {
  idle: 'idle', hurt: 'hurt', choke: 'choke', dizzy: 'dizzy',
  belly: 'belly', stealth: 'stealth', lazy: 'lazy', puff: 'puff',
  power: 'power', iron: 'iron',
};
const ALL = (): boolean => true;
/** 只有這幾張生好了 */
const only = (...keys: string[]) => (k: string): boolean => keys.includes(k);

function hero(statuses: Partial<Record<StatusName, number>> = {}, hp = 100): Unit {
  const u = blankUnit(100);
  u.hp = hp;
  for (const [name, v] of Object.entries(statuses)) addStatus(u, name as StatusName, v as number);
  return u;
}

describe('球球的待機姿勢', () => {
  it('沒事就是站著', () => {
    expect(idlePoseKey(hero(), POSES, ALL)).toBe('idle');
  });

  it('五個新狀態各有自己的圖', () => {
    expect(idlePoseKey(hero({ 翻肚: 2 }), POSES, ALL)).toBe('belly');
    expect(idlePoseKey(hero({ 隱身: 1 }), POSES, ALL)).toBe('stealth');
    expect(idlePoseKey(hero({ 潛水: 1 }), POSES, ALL)).toBe('stealth');   // 潛水是「下回合變隱身」，同一張
    expect(idlePoseKey(hero({ 懶洋洋: 2 }), POSES, ALL)).toBe('lazy');
    expect(idlePoseKey(hero({ 炸毛: 2 }), POSES, ALL)).toBe('puff');
    expect(idlePoseKey(hero({ 貓步: 5 }), POSES, ALL)).toBe('iron');
  });

  it('原本那四個沒被擠掉', () => {
    expect(idlePoseKey(hero({}, 30), POSES, ALL)).toBe('hurt');   // 三成血
    expect(idlePoseKey(hero({ 噎到: 1 }), POSES, ALL)).toBe('choke');
    expect(idlePoseKey(hero({ 定身: 1 }), POSES, ALL)).toBe('dizzy');
    expect(idlePoseKey(hero({ 爪力: 5 }), POSES, ALL)).toBe('power');
  });

  it('堆高的門檻是 5，4 層還不算', () => {
    expect(idlePoseKey(hero({ 爪力: 4 }), POSES, ALL)).toBe('idle');
    expect(idlePoseKey(hero({ 貓步: 4 }), POSES, ALL)).toBe('idle');
  });

  it('順序＝這一刻最該讓玩家知道的那件事，由痛到不痛', () => {
    // 快死了壓過一切
    expect(idlePoseKey(hero({ 噎到: 3, 翻肚: 3, 爪力: 9 }, 20), POSES, ALL)).toBe('hurt');
    // 會掉血的噎到壓過會鎖牌的定身
    expect(idlePoseKey(hero({ 噎到: 1, 定身: 1 }), POSES, ALL)).toBe('choke');
    // 定身壓過翻肚
    expect(idlePoseKey(hero({ 定身: 1, 翻肚: 3 }), POSES, ALL)).toBe('dizzy');
    // 翻肚（挨打 ×1.5）壓過只砍幾成的懶洋洋、炸毛
    expect(idlePoseKey(hero({ 翻肚: 1, 懶洋洋: 3, 炸毛: 3 }), POSES, ALL)).toBe('belly');
    // 隱身壓過懶洋洋、炸毛：它只撐到下一次挨打，來不及看就沒了
    expect(idlePoseKey(hero({ 隱身: 1, 懶洋洋: 3, 炸毛: 3 }), POSES, ALL)).toBe('stealth');
    // 減益壓過「我變強了」
    expect(idlePoseKey(hero({ 炸毛: 1, 爪力: 9, 貓步: 9 }), POSES, ALL)).toBe('puff');
  });

  it('圖沒生好就往下一條退，不會叫出灰剪影', () => {
    // 只有站姿：全部退回站姿
    expect(idlePoseKey(hero({ 翻肚: 2 }), POSES, only('idle'))).toBe('idle');
    // 翻肚圖沒生、炸毛圖生了：退到炸毛那一條
    expect(idlePoseKey(hero({ 翻肚: 2, 炸毛: 2 }), POSES, only('idle', 'puff'))).toBe('puff');
    // 低血圖沒生，但噎到圖生了：退到噎到
    expect(idlePoseKey(hero({ 噎到: 1 }, 20), POSES, only('idle', 'choke'))).toBe('choke');
  });
});
