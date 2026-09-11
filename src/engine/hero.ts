import { cards } from '../content/cards';
import type { CardDef, RunPlayer } from './types';

/**
 * 職業（2026-09-05 拍板）。同一隻球球的兩種打法，不是兩個角色。
 *
 * - `ninja`：現況。靠隱身與潛水閃掉傷害，蜷縮每回合重新賺、回合末歸零＝流動防禦。
 * - `samurai`：穿重甲。沒有任何閃避手段，改用「甲」硬吃——甲不歸零、被打永久扣，
 *   整場就那些，得規劃著用（見 `PlayerCombat.armour` 與 `damagePlayer` 的受傷順序）。
 *
 * 分流深度是**中分流**：大部分牌共用，各自有一批獨占牌（`CardDef.hero`）。
 */
export type Hero = 'ninja' | 'samurai';

/**
 * 這一位的職業。沒寫＝忍者。
 *
 * 連線版之後職業是**每個人各自的**（規則一那一批的自然結果），所以收的是
 * 一位玩家而不是整局。兩個人各玩各的職業也就順便成立了。
 */
export function heroOf(p: Pick<RunPlayer, 'hero'>): Hero {
  return p.hero ?? 'ninja';
}

/** 這個職業拿得到的牌：沒標 `hero` 的是共用，標了的只有那個職業拿得到。 */
export function cardsForHero(hero: Hero): CardDef[] {
  return cards.filter((c) => !c.hero || c.hero === hero);
}
