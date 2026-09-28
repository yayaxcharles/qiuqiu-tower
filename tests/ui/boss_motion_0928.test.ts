import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import bossData from '../../src/ui/boss-motion-data.json';
import { bossDeathMotionLeft, BOSS_DEATH_HOLD_MS, qiuqiuEnemyMotionKind, qiuqiuEnemyMotionKinds } from '../../src/ui/qiuqiu-combat-motion';

/*
 * 兩隻魔王（鐵爪機關貓、掃地機器人王）換成逐格動作（2026-09-28 試做）。
 * 守三件事：①對照表還在（誰拿掉就紅）②圖集與格子資料**不進開場下載**，只在那一場動態載入
 * ③倒地的爆炸演完才換場，但背景分頁不等。
 */
const ROOT = resolve(__dirname, '../..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

describe('魔王逐格動作：對照表', () => {
  it('鐵爪兩個階段、掃地機器人王都對到自己的動作套', () => {
    expect(qiuqiuEnemyMotionKind('iron_claw')).toBe('iron_claw');
    expect(qiuqiuEnemyMotionKind('iron_claw', 1)).toBe('iron_claw_p2');
    expect(qiuqiuEnemyMotionKind('roomba_king')).toBe('roomba_king');
    expect(qiuqiuEnemyMotionKinds('iron_claw')).toEqual(['iron_claw', 'iron_claw_p2']);
    expect(qiuqiuEnemyMotionKinds('roomba_king')).toEqual(['roomba_king']);
    // 其他魔物不受影響
    expect(qiuqiuEnemyMotionKind('mini_broom')).toBeUndefined();
    expect(qiuqiuEnemyMotionKind('rat')).toBe('rat');
  });

  it('每一套都有待機（循環）、出招、倒地，圖集檔案都在，而且都放在 motion/bosses 底下', () => {
    const kinds = bossData.kinds as Record<string, { actions: Record<string, { texture: string; loop: boolean; frames: { duration: number }[] }> }>;
    expect(Object.keys(kinds).sort()).toEqual(['iron_claw', 'iron_claw_p2', 'roomba_king']);
    for (const [kind, data] of Object.entries(kinds)) {
      for (const action of ['idle', 'attack', 'knockdown']) {
        const motion = data.actions[action];
        expect(motion, `${kind} ${action}`).toBeDefined();
        expect(motion!.texture.startsWith('assets/motion/bosses/')).toBe(true);
        expect(existsSync(join(ROOT, 'public', motion!.texture)), motion!.texture).toBe(true);
      }
      expect(data.actions.idle!.loop).toBe(true);
      expect(data.actions.knockdown!.loop).toBe(false);
      const seconds = (action: string): number => data.actions[action]!.frames.reduce((sum, f) => sum + f.duration, 0);
      // 節奏守門：出招片段不能長到拖住魔物回合，倒地爆炸不超過 3 秒
      expect(seconds('attack')).toBeLessThan(1.8);
      expect(seconds('knockdown')).toBeLessThanOrEqual(3);
    }
  });
});

describe('魔王逐格動作：不進開場下載', () => {
  it('格子資料只用動態載入（enemy-motion.ts 裡沒有靜態 import）', () => {
    const src = read('src/ui/enemy-motion.ts');
    expect(src).toMatch(/import\(\s*'\.\/boss-motion-data\.json'\s*\)/);
    expect(src).not.toMatch(/^import[^(\n]*boss-motion-data/m);
  });

  it('除了 enemy-motion.ts，程式裡沒有別的地方提到魔王圖集或格子資料（開場預載、快取清單都不會帶到）', () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${name.name}`;
        if (name.isDirectory()) { walk(rel); continue; }
        if (!/\.(ts|js|mjs|html)$/.test(name.name) || rel === 'src/ui/enemy-motion.ts') continue;
        if (/boss-motion-data|motion\/bosses/.test(read(rel))) hits.push(rel);
      }
    };
    walk('src');
    for (const rel of ['index.html', 'public/sw.js']) if (/boss-motion-data|motion\/bosses/.test(read(rel))) hits.push(rel);
    expect(hits).toEqual([]);
  });
});

describe('魔王倒地：演完才換場', () => {
  const dying = { kind: 'roomba_king' as const, action: 'knockdown' as const, busyUntil: 3000 };
  it('爆炸還在演就回剩下的時間（含最後一格停一下）', () => {
    expect(bossDeathMotionLeft([dying], 1000, false)).toBe(2000 + BOSS_DEATH_HOLD_MS);
    expect(bossDeathMotionLeft([dying], 3000 + BOSS_DEATH_HOLD_MS, false)).toBe(0);
  });
  it('背景分頁不等；老鼠、忍者的倒地不算', () => {
    expect(bossDeathMotionLeft([dying], 1000, true)).toBe(0);
    expect(bossDeathMotionLeft([{ kind: 'rat', action: 'knockdown', busyUntil: 3000 }], 1000, false)).toBe(0);
  });
});
