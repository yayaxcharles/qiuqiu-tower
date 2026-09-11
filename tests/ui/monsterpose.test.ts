import { describe, expect, it } from 'vitest';
import type { MonsterPose } from '../../src/ui/assets';
import { monsterPose } from '../../src/ui/monsterpose';

/** 這隻的姿勢生好了哪幾張；預設四張都有 */
const has = (...poses: MonsterPose[]) => (p: MonsterPose): boolean => poses.includes(p);
const ALL = has('idle', 'attack', 'hurt', 'block');
const base = { attacking: false, hurt: false, dead: false, block: 0, passiveBlock: false, has: ALL };

describe('魔物選圖', () => {
  it('沒事就是待機', () => {
    expect(monsterPose(base)).toBe('idle');
  });

  it('身上有防禦就畫防禦圖，不必是出防禦招那一拍', () => {
    // 縮殼是被打痛才觸發、鱗甲是牠回合結束才長，兩個都不在出招那一步
    expect(monsterPose({ ...base, block: 14 })).toBe('block');
  });

  it('出招優先於挨打：牠出招那一拍同時掉血（中毒、反彈）也要畫出招圖', () => {
    expect(monsterPose({ ...base, attacking: true, hurt: true })).toBe('attack');
  });

  it('挨打優先於防禦：擋著的時候被打穿，要看得出牠痛了', () => {
    expect(monsterPose({ ...base, hurt: true, block: 14 })).toBe('hurt');
  });

  it('倒下就換倒地圖；沒生那張的照舊回待機', () => {
    // 有生：趴平、眼睛變叉那張。倒下優先於挨打與防禦（牠已經不在戰鬥裡了）
    expect(monsterPose({ ...base, dead: true, hurt: true, block: 14, has: has('idle', 'hurt', 'block', 'down') })).toBe('down');
    // 沒生（一般小怪）：回待機，靠 `gone` 的溶解演出。**一場打掉五六隻小怪，
    // 每一隻都演一次倒地會變成過場稅**（使用者的鐵則：拉長節奏的動畫一律不做）
    expect(monsterPose({ ...base, dead: true, hurt: true, block: 14 })).toBe('idle');
  });

  it('出招優先於倒下：這是防迴歸的護欄', () => {
    // 今天走不到這個組合：`combat.ts` 的 `acting` 迴圈寫 `if (... || e.dead || ...) continue`，
    // 死掉的魔物進不了那張表，所以 `attacking` 對已死的永遠是 false（稽核 2026-09-11 低-1）。
    // 留著這條是為了哪天有人放寬那個 continue——招式圖不能被倒地圖蓋掉，
    // 不然「出招那一拍同時被反彈打死」整套出招演出就白做了
    expect(monsterPose({ ...base, attacking: true, dead: true, has: has('idle', 'down') })).toBe('attack');
  });

  it('鱗甲／不壞身那種被動長的防禦不畫防禦圖', () => {
    // 鱗甲是牠自己回合結束長、要到牠下一個回合開始才歸零，所以整個玩家回合都掛著防禦。
    // 照畫的話那隻魔物從第二回合起再也看不到待機圖（稽核 2026-09-10 中-1）
    expect(monsterPose({ ...base, block: 6, passiveBlock: true })).toBe('idle');
    expect(monsterPose({ ...base, block: 6, passiveBlock: false })).toBe('block');
    // 挨打仍然優先，被動防禦不影響
    expect(monsterPose({ ...base, hurt: true, block: 6, passiveBlock: true })).toBe('hurt');
  });

  it('姿勢沒生好就往下退，不會叫出灰剪影', () => {
    expect(monsterPose({ ...base, hurt: true, has: has('idle') })).toBe('idle');
    expect(monsterPose({ ...base, block: 14, has: has('idle') })).toBe('idle');
    // 有挨打圖沒防禦圖：挨打照畫，防禦退回待機
    expect(monsterPose({ ...base, hurt: true, has: has('idle', 'hurt') })).toBe('hurt');
    expect(monsterPose({ ...base, block: 14, has: has('idle', 'hurt') })).toBe('idle');
  });

  it('出招圖不查有沒有生：monsterUrl 自己會退回待機', () => {
    expect(monsterPose({ ...base, attacking: true, has: has('idle') })).toBe('attack');
  });
});
