import type { StatusName, Unit } from '../engine/types';
import { getStatus } from '../engine/statuses';

/** 待機時可能用到的姿勢鍵。值就是 manifest 的 sprites 鍵（`combat.ts` 的 `POSE`） */
export interface IdlePoses {
  idle: string; hurt: string; choke: string; dizzy: string;
  belly: string; stealth: string; lazy: string; puff: string;
  power: string; iron: string;
}

/**
 * 待機時球球擺什麼姿勢。
 *
 * **順序＝「這一刻最該讓玩家知道的那件事」**，由痛到不痛：
 * 快死了 → 會掉血的中毒 → 攻擊牌全鎖的定身 → 挨打 ×1.5 的翻肚 → 隱身（只撐到下一次挨打）
 * → 攻防被砍幾成的懶洋洋／炸毛 → 堆起來的爪力／貓步。
 *
 * 2026-09-10 補了翻肚、隱身、懶洋洋、炸毛、貓步高疊五張（使用者：「補足球球的動作跟狀態」）——
 * 這五個狀態本來都用同一張站姿，玩家整場可能都沒發現自己身上掛著什麼。
 *
 * `has` ＝「這張圖生好了沒」（`hasSprite`）。每一條都查，圖沒生好就往下一條退，
 * 不會畫成灰剪影——這也是為什麼判斷不能寫成一張查表。
 */
export function idlePoseKey(p: Unit, poses: IdlePoses, has: (key: string) => boolean): string {
  const pick = (key: string): string | null => (has(key) ? key : null);
  const st = (name: StatusName): number => getStatus(p, name);
  return (
    (p.hp <= Math.ceil(p.maxHp * 0.3) ? pick(poses.hurt) : null)
    ?? (st('中毒') > 0 ? pick(poses.choke) : null)
    ?? (st('定身') > 0 ? pick(poses.dizzy) : null)
    // 翻肚排在減益裡最前面：它是「挨打 ×1.5」，比攻防被砍幾成痛得多
    ?? (st('翻肚') > 0 ? pick(poses.belly) : null)
    // 隱身排在懶洋洋／炸毛前面：它只撐到下一次被打，看得到才來得及用
    ?? (st('隱身') > 0 || st('潛水') > 0 ? pick(poses.stealth) : null)
    ?? (st('懶洋洋') > 0 ? pick(poses.lazy) : null)
    ?? (st('炸毛') > 0 ? pick(poses.puff) : null)
    ?? (st('爪力') >= 5 ? pick(poses.power) : null)
    // 貓步堆高（防禦流）跟爪力堆高對稱，本來只有攻擊流看得到自己變強
    ?? (st('貓步') >= 5 ? pick(poses.iron) : null)
    ?? poses.idle
  );
}
