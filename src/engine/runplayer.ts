import type { RunPlayer, RunState } from './types';

/**
 * 「我」這一位在整局裡的家當（連線版 2026-09-11）。
 *
 * 血量、牌組、秘寶、忍具、小魚乾這些以前直接掛在 `RunState` 上，兩個人一起玩之後
 * 變成各一份，搬進了 `RunState.players`。這支就是「拿第 seat 位的那一份」，
 * 不指定就是自己（第 0 位）。
 *
 * 為什麼不做成 `run.hp` 那種別名：`RunState` **會被存進瀏覽器**，
 * getter 存下去讀回來會變成一份獨立的死資料，之後兩邊各改各的就悄悄分岔了。
 * `CombatState` 可以用別名，是因為它從頭到尾不存檔。
 */
export function me(run: RunState, seat = 0): RunPlayer {
  const p = run.players[seat];
  if (!p) throw new Error(`這一局沒有第 ${seat} 個座位`);
  return p;
}

/** 這一局還站著的人（倒下的人要等別人在打盹點扶他起來，見規則四） */
export function standing(run: RunState): RunPlayer[] {
  return run.players.filter((p) => !p.down);
}
