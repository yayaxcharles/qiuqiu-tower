import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasLongDeath, SIDE_MOTION_KINDS, type EnemyMotionKind } from '../../src/ui/enemy-motion';
import { bossDeathMotionLeft, BOSS_DEATH_HOLD_MS, BOSS_DEATH_POLL_MS, qiuqiuEnemyMotionKind, summonIdsOf } from '../../src/ui/qiuqiu-combat-motion';
import { enemyById } from '../../src/content/enemies';

/*
 * 橫向捲軸搬來的魔物逐格動作（2026-09-28：兩隻魔王試做 → 全接）。
 * 守三件事：①魔物 → 動作套的對照還在（誰拿掉一行就紅）②圖集與格子資料**不進開場下載**，只在那一場動態載入
 * ③節奏：出招 ≤ 1.4 秒；一般魔物倒下 ≤ 0.9 秒；塔主、大魔物倒下 ≤ 3 秒，而且打完等它演完、背景分頁不等。
 */
const ROOT = resolve(__dirname, '../..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/** 這批接上的魔物（第一階段, 第二階段）。要拿掉某一隻，這張表跟 qiuqiu-combat-motion.ts 要一起改 */
const EXPECTED: Record<string, [string, string?]> = {
  iron_claw: ['iron_claw', 'iron_claw_p2'], roomba_king: ['roomba_king'],
  frog_daimyo: ['frog_daimyo', 'frog_daimyo_p2'], orange_king: ['orange_king', 'orange_king_p2'], tanuki_lord: ['tanuki_lord', 'tanuki_lord_p2'],
  drum_tanuki: ['drum_tanuki'], guardian_statue: ['guardian_statue'], iron_arhat: ['iron_arhat'], mask_dancer: ['mask_dancer'],
  armor_ghost: ['armor_ghost'], kappa: ['kappa'], lantern_ghost: ['lantern_ghost'], orange_bandit: ['orange_bandit'],
  plated_beetle: ['plated_beetle'], tengu: ['tengu'], vacuum: ['vacuum'], wraith_samurai: ['wraith_samurai'],
};

type Motion = { texture: string; loop: boolean; frames: { duration: number }[] };
const dataOf = (kind: string): { actions: Record<string, Motion> } => JSON.parse(read(`src/ui/side-motion/${kind}.json`));
const seconds = (m: Motion): number => m.frames.reduce((sum, f) => sum + f.duration, 0);

describe('橫向捲軸動作：對照表', () => {
  it.each(Object.entries(EXPECTED))('%s 對到自己的動作套（有第二階段的變身後換套）', (enemyId, [first, second]) => {
    expect(enemyById[enemyId], `爪破魔塔裡沒有 ${enemyId}`).toBeDefined();
    expect(qiuqiuEnemyMotionKind(enemyId)).toBe(first);
    expect(qiuqiuEnemyMotionKind(enemyId, 1)).toBe(second ?? first);
  });

  it('退回舊圖的七隻沒有逐格動作（使用者 2026-09-28 看過對照圖）', () => {
    for (const id of ['fox_miko', 'paper_crane', 'tadpole', 'wild_boar', 'kasa_obake', 'mini_broom', 'tanuki_kid']) {
      expect(qiuqiuEnemyMotionKind(id), id).toBeUndefined();
      expect(existsSync(join(ROOT, `src/ui/side-motion/${id}.json`)), id).toBe(false);
      expect(readdirSync(join(ROOT, 'public/assets/motion/side')).filter((f) => f.startsWith(`${id}-`)), id).toEqual([]);
    }
  });

  it('接上的一共 17 隻', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(17);
  });

  it('開打時連會被叫出來的魔物編號也找得到（小掃把、狸小弟、蝌蚪兵；牠們目前沒有逐格，照舊靜態）', () => {
    expect(summonIdsOf(enemyById.roomba_king)).toContain('mini_broom');
    expect(summonIdsOf(enemyById.tanuki_lord)).toContain('tanuki_kid');
    expect(summonIdsOf(enemyById.frog_daimyo)).toContain('tadpole');
  });

  it('老鼠、黑貓忍者照舊用原本那兩套；小鴉群、掃把蜈蚣沒接（跟舊圖形狀差太多）', () => {
    expect(qiuqiuEnemyMotionKind('rat')).toBe('rat');
    expect(qiuqiuEnemyMotionKind('black_ninja')).toBe('ninja');
    expect(qiuqiuEnemyMotionKind('crow_small')).toBeUndefined();
    expect(qiuqiuEnemyMotionKind('broom_centipede')).toBeUndefined();
  });

  it('每一套都有格子資料與圖集檔案、有循環的待機、放在 motion/side 底下', () => {
    const files = readdirSync(join(ROOT, 'src/ui/side-motion')).map((f) => f.replace(/\.json$/, '')).sort();
    expect(files).toEqual([...SIDE_MOTION_KINDS].sort());
    for (const kind of SIDE_MOTION_KINDS) {
      const data = dataOf(kind);
      expect(data.actions.idle?.loop, `${kind} 待機`).toBe(true);
      for (const [action, motion] of Object.entries(data.actions)) {
        expect(motion.texture.startsWith('assets/motion/side/'), `${kind} ${action}`).toBe(true);
        expect(existsSync(join(ROOT, 'public', motion.texture)), motion.texture).toBe(true);
      }
    }
  });

  it('節奏：出招 ≤ 1.4 秒；一般魔物倒下 ≤ 0.9 秒；塔主、大魔物倒下 ≤ 3 秒', () => {
    for (const kind of SIDE_MOTION_KINDS) {
      const { actions } = dataOf(kind);
      if (actions.attack) expect(seconds(actions.attack), `${kind} 出招`).toBeLessThanOrEqual(1.4);
      if (actions.knockdown) {
        expect(actions.knockdown.loop).toBe(false);
        expect(seconds(actions.knockdown), `${kind} 倒下`).toBeLessThanOrEqual(hasLongDeath(kind) ? 3.01 : 0.9);
      }
    }
  });

  it('長倒下只給塔主與大魔物', () => {
    for (const [enemyId, kinds] of Object.entries(EXPECTED)) {
      const pool = enemyById[enemyId]!.pool;
      for (const kind of kinds) if (kind) expect(hasLongDeath(kind as EnemyMotionKind), `${enemyId}（${pool}）`).toBe(pool === '塔主' || pool === '大魔物');
    }
  });
});

describe('橫向捲軸動作：不進開場下載', () => {
  it('格子資料只用動態載入（enemy-motion.ts 用 import.meta.glob，沒有靜態 import）', () => {
    const src = read('src/ui/enemy-motion.ts');
    expect(src).toMatch(/import\.meta\.glob<[^>]*>\('\.\/side-motion\/\*\.json'\)/);
    expect(src).not.toMatch(/^import[^(\n]*side-motion/m);
    expect(src).not.toMatch(/import\.meta\.glob[^;]*eager/);
  });

  it('除了 enemy-motion.ts，程式裡沒有別的地方提到這些圖集或格子資料（開場預載、快取清單都不會帶到）', () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${name.name}`;
        if (name.isDirectory()) { walk(rel); continue; }
        if (!/\.(ts|js|mjs|html)$/.test(name.name) || rel === 'src/ui/enemy-motion.ts') continue;
        if (/side-motion|motion\/side/.test(read(rel))) hits.push(rel);
      }
    };
    walk('src');
    for (const rel of ['index.html', 'public/sw.js']) if (/side-motion|motion\/side/.test(read(rel))) hits.push(rel);
    expect(hits).toEqual([]);
  });
});

describe('長倒下：演完才換場', () => {
  const long = (kind: EnemyMotionKind): boolean => hasLongDeath(kind);
  const dying = new Map([[7, { kind: 'roomba_king' as EnemyMotionKind, action: 'knockdown' as const, busyUntil: 3000 }]]);
  it('還在演就回剩下的時間（含最後一格停一下）', () => {
    expect(bossDeathMotionLeft(dying, 1000, new Set(), false, long)).toBe(2000 + BOSS_DEATH_HOLD_MS);
    expect(bossDeathMotionLeft(dying, 3000 + BOSS_DEATH_HOLD_MS, new Set(), false, long)).toBe(0);
  });
  it('最後一下還在飛、倒下還沒開始的也要等（稽核 2026-09-28 低-4）', () => {
    const waiting = new Map([[7, { kind: 'roomba_king' as EnemyMotionKind, action: 'idle' as const, busyUntil: 0 }]]);
    expect(bossDeathMotionLeft(waiting, 1000, new Set([7]), false, long)).toBe(BOSS_DEATH_POLL_MS);
    expect(bossDeathMotionLeft(waiting, 1000, new Set(), false, long)).toBe(0);
  });
  it('背景分頁不等；一般魔物、老鼠的倒下不算', () => {
    expect(bossDeathMotionLeft(dying, 1000, new Set(), true, long)).toBe(0);
    expect(bossDeathMotionLeft(new Map([[1, { kind: 'rat' as EnemyMotionKind, action: 'knockdown' as const, busyUntil: 3000 }]]), 1000, new Set(), false, long)).toBe(0);
    expect(bossDeathMotionLeft(new Map([[1, { kind: 'kappa' as EnemyMotionKind, action: 'knockdown' as const, busyUntil: 3000 }]]), 1000, new Set([1]), false, long)).toBe(0);
  });
  it('塔主第一階段那一套不帶倒下（不會一開打就載第二階段的爆炸圖集）', () => {
    for (const kind of ['iron_claw', 'frog_daimyo', 'orange_king', 'tanuki_lord']) {
      expect(dataOf(kind).actions.knockdown, kind).toBeUndefined();
      expect(dataOf(`${kind}_p2`).actions.knockdown, `${kind}_p2`).toBeDefined();
    }
  });
});

/*
 * 打包後的首頁（稽核 2026-09-28 低-6）：開場預載清單裡不能有這批動作的格子資料或圖集。
 * 要先打包（npm run build）才驗得到；沒打包就跳過。
 */
describe.skipIf(!existsSync(join(ROOT, 'dist/index.html')))('打包後的首頁', () => {
  it('index.html 的預載清單沒有橫向捲軸動作的 json／webp', () => {
    const html = read('dist/index.html');
    const preloads = [...html.matchAll(/<link[^>]+rel="(?:modulepreload|preload|prefetch)"[^>]*>/g)].map((m) => m[0]);
    for (const tag of preloads) expect(tag).not.toMatch(/side-motion|motion\/side|iron_claw|roomba_king|kappa-/);
    expect(html).not.toMatch(/motion\/side\//);
  });
});
