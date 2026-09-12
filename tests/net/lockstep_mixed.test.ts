import { describe, expect, it } from 'vitest';
import { beginCombat, finishCombat, newCoopRun, openChestCoop, makeShop, rollActRelics, applyRunEffects } from '../../src/engine/run';
import { combatFingerprint, runFingerprint } from '../../src/net/hash';
import { playCard, endTurn } from '../../src/engine/combat';

/**
 * 鎖步的底線：**同樣的輸入，兩台算出來必須一模一樣**（2026-09-13）。
 *
 * 連線傳的是動作不是狀態，所以只要有一步算出不同的結果，之後每一步都會不同。
 * 這裡不開兩個瀏覽器——**跑兩份引擎餵同一串動作**，比對指紋。
 * 混搭（一人球球一人菲菲）特別容易出事：起手牌、牌名、立繪、專屬事件都不一樣。
 */
const COMBOS = [['ninja', 'ninja'], ['ninja', 'feifei'], ['feifei', 'ninja'], ['feifei', 'feifei']] as const;

describe('鎖步：兩份引擎餵同一串動作', () => {
  it('開局狀態一模一樣', () => {
    for (const [a, b] of COMBOS) {
      for (let i = 0; i < 30; i++) {
        const x = runFingerprint(newCoopRun(`ls-${i}`, ((i % 5) + 1), a, b));
        const y = runFingerprint(newCoopRun(`ls-${i}`, ((i % 5) + 1), a, b));
        expect(y, `${a}＋${b} 種子 ls-${i} 開局就不一樣`).toBe(x);
      }
    }
  });

  it('打一場完整的戰鬥，每一步的指紋都一樣', () => {
    for (const [a, b] of COMBOS) {
      for (let i = 0; i < 12; i++) {
        const fps: string[][] = [[], []];
        for (const side of [0, 1]) {
          const run = newCoopRun(`fight-${i}`, 1, a, b);
          const node = run.map.nodes.find((n) => n.type === '戰鬥');
          if (!node) continue;
          run.currentNode = node.id;
          const cs = beginCombat(run);
          fps[side]!.push(combatFingerprint(cs));
          // 兩邊各打三回合：手上第一張打得出來的就打，然後收回合
          for (let t = 0; t < 3 && cs.phase === 'player'; t++) {
            for (const seat of [0, 1]) {
              const p = cs.players[seat];
              if (!p) continue;
              const c = p.hand[0];
              const foe = cs.enemies.find((e) => !e.dead);
              if (c && foe) playCard(cs, c.uid, foe.uid, seat);
              fps[side]!.push(combatFingerprint(cs));
            }
            endTurn(cs);   // 收回合是整桌一次（兩個座位都舉手之後畫面才叫這支）
            fps[side]!.push(combatFingerprint(cs));
          }
          if (cs.phase !== 'player') finishCombat(run, cs);
          fps[side]!.push(runFingerprint(run));
        }
        expect(fps[1], `${a}＋${b} 種子 fight-${i} 兩邊算出來不一樣`).toEqual(fps[0]);
      }
    }
  });

  it('紙箱、罐頭鋪、過關三選一、事件發秘寶：兩邊一樣', () => {
    for (const [a, b] of COMBOS) {
      for (let i = 0; i < 20; i++) {
        const make = () => {
          const run = newCoopRun(`node-${i}`, 1, a, b);
          run.act = 2;
          const out = [JSON.stringify(openChestCoop(run))];
          out.push(JSON.stringify(makeShop(run).relics.map((r) => r.id)));
          out.push(JSON.stringify(rollActRelics(run)));
          applyRunEffects(run, [{ kind: 'relic', pool: '大魔物' }]);
          out.push(runFingerprint(run));
          return out;
        };
        expect(make(), `${a}＋${b} 種子 node-${i} 節點結算不一樣`).toEqual(make());
      }
    }
  });
});
