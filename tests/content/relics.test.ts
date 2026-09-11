import { describe, expect, it } from 'vitest';
import { potionById, potions } from '../../src/content/potions';
import { relicById, relics } from '../../src/content/relics';

describe('秘寶', () => {
  it('35 件、池數正確、id 不重複', () => {
    expect(relics.length).toBe(65);   // 60＝2026-09-02 擴充（36 → 60）；65＝2026-09-04 五件代價秘寶
    const n = (p: string) => relics.filter((r) => r.pool === p).length;
    expect(n('起始')).toBe(1); expect(n('常見')).toBe(30); expect(n('大魔物')).toBe(24); expect(n('塔主')).toBe(10);   // 2026-09-04 代價秘寶：常見 +2、大魔物 +3
    expect(new Set(relics.map((r) => r.id)).size).toBe(65);
    expect(relicById['blue_headband']?.hooks.firstTurnDraw).toBe(1);
  });
  it('每件至少一個掛鉤且有說明', () => {
    for (const r of relics) {
      expect(Object.keys(r.hooks).length, r.name).toBeGreaterThan(0);
      expect(r.text.length, r.name).toBeGreaterThan(3);
      expect(r.art, r.name).toMatch(/^codex\/relic_[a-z_]+$/);
    }
  });
});

/**
 * **要玩家指著一隻魔物打的效果**——這份名單的正本是 `engine/effects.ts`：
 * 凡是需要玩家指著一隻魔物的效果（多數走 `targetsOf(cs, ctx, false)`），沒有 `ctx.targetUid` 就會拿到空陣列、整個效果靜靜不發生。
 *
 * 2026-09-11 從「手抄 damage 與 status 兩種」改成完整名單（那時新增五支對敵忍具，
 * 用的是 stealBlock／removeStatuses／doubleStatus／damageRandom／damageEqualBlock，
 * 舊判準一種都認不出來、會把它們算成 self）。
 * 加新效果時這裡要跟著加——漏了的症狀是「忍具點下去什麼都沒發生」，很難查。
 */
const NEEDS_TARGET = ['damageEqualBlock', 'damageRamp', 'damageRandom', 'doubleStatus',
  'removeStatuses', 'stealBlock', 'transferDebuffs',
  // 這個不走 `targetsOf`、直接讀 `ctx.targetUid`，照「走 targetsOf」去抓會漏掉（稽核 2026-09-11 低-5）
  'drawIfTargetStatus'] as const;

describe('忍具', () => {
  it('32 種、id 不重複、目標與效果一致', () => {
    expect(potions.length).toBe(32);
    expect(new Set(potions.map((p) => p.id)).size).toBe(32);
    for (const p of potions) {
      expect(potionById[p.id]).toBe(p);
      const hitsAll = p.effects.some((e) => 'target' in e && e.target === 'all');
      const hitsOne = p.effects.some((e) => (e.kind === 'damage' && e.target !== 'all')
        || (e.kind === 'status' && e.target === 'enemy')
        || (NEEDS_TARGET as readonly string[]).includes(e.kind));
      expect(p.target, p.name).toBe(hitsAll ? 'all' : hitsOne ? 'enemy' : 'self');
      expect(p.art, p.name).toMatch(/^codex\/potion_[a-z_]+$/);
    }
  });
});
