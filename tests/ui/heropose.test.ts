import { describe, expect, it } from 'vitest';
import { idlePoseKey, type IdlePoses } from '../../src/ui/heropose';
import { addStatus } from '../../src/engine/statuses';
import type { StatusName, Unit } from '../../src/engine/types';
import { blankUnit } from '../helpers';
import { readFileSync } from 'node:fs';
import COMBAT_SRC from '../../src/ui/screens/combat.ts?raw';

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
    // 潛水是「下回合才變隱身」，這回合不擋：不擺隱身姿勢（使用者 2026-09-24 深夜：看起來在隱身卻一直被打）
    expect(idlePoseKey(hero({ 潛水: 1 }), POSES, ALL)).toBe('idle');
    expect(idlePoseKey(hero({ 懶洋洋: 2 }), POSES, ALL)).toBe('lazy');
    expect(idlePoseKey(hero({ 炸毛: 2 }), POSES, ALL)).toBe('puff');
    expect(idlePoseKey(hero({ 貓步: 5 }), POSES, ALL)).toBe('iron');
  });

  /*
   * 鐵布衫那張圖畫的就是鐵布衫，卻只有貓步堆到 5 才看得到；真的掛著鐵布衫反而跟平常站姿一樣
   *（2026-09-18 補）。它只撐一回合，所以排在貓步前面。
   */
  it('掛著鐵布衫就擺鐵布衫那張，而且排在貓步前面', () => {
    expect(idlePoseKey(hero({ 鐵布衫: 1 }), POSES, ALL)).toBe('iron');
    expect(idlePoseKey(hero({ 鐵布衫: 1, 貓步: 1 }), POSES, ALL)).toBe('iron');
    // 圖沒生好就往下退，不會變成灰剪影
    expect(idlePoseKey(hero({ 鐵布衫: 1 }), POSES, only('idle'))).toBe('idle');
    // 爪力堆高仍然贏鐵布衫：那是「我變強了」，比只撐一回合的防禦值得先講
    expect(idlePoseKey(hero({ 鐵布衫: 1, 爪力: 5 }), POSES, ALL)).toBe('power');
  });

  it('原本那四個沒被擠掉', () => {
    expect(idlePoseKey(hero({}, 30), POSES, ALL)).toBe('hurt');   // 三成血
    expect(idlePoseKey(hero({ 中毒: 1 }), POSES, ALL)).toBe('choke');
    expect(idlePoseKey(hero({ 定身: 1 }), POSES, ALL)).toBe('dizzy');
    expect(idlePoseKey(hero({ 爪力: 5 }), POSES, ALL)).toBe('power');
  });

  it('堆高的門檻是 5，4 層還不算', () => {
    expect(idlePoseKey(hero({ 爪力: 4 }), POSES, ALL)).toBe('idle');
    expect(idlePoseKey(hero({ 貓步: 4 }), POSES, ALL)).toBe('idle');
  });

  it('順序＝這一刻最該讓玩家知道的那件事，由痛到不痛', () => {
    // 快死了壓過一切
    expect(idlePoseKey(hero({ 中毒: 3, 翻肚: 3, 爪力: 9 }, 20), POSES, ALL)).toBe('hurt');
    // 會掉血的中毒壓過會鎖牌的定身
    expect(idlePoseKey(hero({ 中毒: 1, 定身: 1 }), POSES, ALL)).toBe('choke');
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
    // 低血圖沒生，但中毒圖生了：退到中毒
    expect(idlePoseKey(hero({ 中毒: 1 }, 20), POSES, only('idle', 'choke'))).toBe('choke');
  });
});

// 使用者 2026-09-24 深夜：影忍頭帶「顯示我有隱身卻一直被打」——下回合隱身的牌子跟隱身同一個圖示。
// 下回合才生效的狀態（潛水、鐵布衫）掛 .later：淡色虛線框
describe('下回合才生效的狀態牌子分得出來', () => {
  it('STATUS_LABEL 裡的（下回合隱身、下回合蜷縮）掛 later，樣式表是淡色虛線', () => {
    const src = COMBAT_SRC.replace(/\r\n/g, '\n');
    expect(src).toContain("const later = STATUS_LABEL[name] ? ' later' : '';");
    expect(src).toContain('`${tone}${later}`.trim()');
    const css = readFileSync('src/ui/styles/combat.css', 'utf8');
    // 點線：虛線已經是能力牌的記號（推前稽核 低-2）
    expect(css).toContain('.combat .chip.later { opacity: .7; border-style: dotted; }');
    expect(css).toContain('.combat .chip.power { border-style: dashed; }');
  });
});
