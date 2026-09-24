import { describe, expect, it } from 'vitest';
import { potionById, potions } from '../../src/content/potions';
import { relicById, relics } from '../../src/content/relics';

describe('秘寶', () => {
  it('120 件（另有淨化版 6 件）、池數正確、id 不重複', () => {
    // 77＝2026-09-20 封封的起始秘寶「舊劍穗」；95＝2026-09-23 內容擴充第一批 +18；111＝第二批 +16；120＝第三批 +9（design3 第七節）
    // 淨化版 6 件（`淨化` 池，抽不到、只從淨化換來）不算進 120，資料表上一共 126 筆
    expect(relics.length).toBe(126);
    const n = (p: string) => relics.filter((r) => r.pool === p).length;
    expect(relics.length - n('淨化')).toBe(120);
    expect(n('起始')).toBe(4);   // 藍頭巾（球球）＋毒針袋（菲菲）＋銅護臂（噹噹）＋舊劍穗（封封）
    // 2026-09-04 代價秘寶：常見 +2、大魔物 +3；2026-09-23 第一批：常見 +5、大魔物 +5、塔主 +8；
    // 第二批：常見 +3（木人樁、沙漏、撲滿）、大魔物 +4（線香、暗器匣、收鞘墜、鐵壁）、塔主 +3（滿月劍意、五毒譜、影分身卷軸），
    // 兩個限定池各 3 件；第三批：常見 +4（藥簍、夢枕、平安繩、探路杖）、大魔物 +2（箱中箱、魔氣燈籠）、塔主 +1（鎮魔符）、
    // 罐頭鋪 +1（集章卡）、事件 +1（沾了魔氣的舊護腕）
    expect(n('常見')).toBe(42); expect(n('大魔物')).toBe(35); expect(n('塔主')).toBe(31);
    expect(n('罐頭鋪')).toBe(4); expect(n('事件')).toBe(4); expect(n('淨化')).toBe(6);
    expect(new Set(relics.map((r) => r.id)).size).toBe(126);
    expect(relicById['blue_headband']?.hooks.firstTurnDraw).toBe(2);   // 2026-09-23 平衡（bal）1 → 2
    expect(relicById['old_sword_tassel']?.hooks.combatStart).toEqual([{ kind: 'gainQi', n: 2 }]);
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
  // 散毒粉（2026-09-23）是第一支用它的忍具：`effects.ts` 的 `spreadStatus` 走 `targetsOf(cs, ctx, false)`
  'spreadStatus',
  // 迷魂香（2026-09-23 第二批）：掛在指定的那一隻身上
  'daze',
  // 這個不走 `targetsOf`、直接讀 `ctx.targetUid`，照「走 targetsOf」去抓會漏掉（稽核 2026-09-11 低-5）
  'drawIfTargetStatus'] as const;

describe('忍具', () => {
  it('51 種、id 不重複、目標與效果一致', () => {
    expect(potions.length).toBe(51);   // 45＝2026-09-23 內容擴充第一批 +10；51＝第二批 +6
    expect(new Set(potions.map((p) => p.id)).size).toBe(51);
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
