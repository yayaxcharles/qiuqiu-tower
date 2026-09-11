import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const combatSrc = readFileSync('src/ui/screens/combat.ts', 'utf-8');
const cardSrc = readFileSync('src/content/cards.ts', 'utf-8');

/**
 * 立繪鍵有沒有對到真的檔案。
 *
 * 牌面插圖早就有這條把關（`cards.test.ts`），立繪一直沒有。少一條的後果很安靜：
 * `POSE` 裡打錯一個字（`hero/ninja_bely`）→ `hasSprite` 回 false → `idlePoseKey` 往下一條退 →
 * 測試全過、線上不報錯、那個狀態永遠顯示站姿，沒有人會發現（稽核 2026-09-10 低-4）。
 */
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as {
  sprites: Record<string, string>;
};

/** `combat.ts` 的 POSE 表。改那邊要改這邊——這條測試的用途就是逼你想起來 */
const POSE_KEYS = [
  'hero/ninja', 'hero/ninja_attack', 'hero/ninja_hit', 'hero/ninja_dodge',
  'hero/ninja_hungry', 'hero/ninja_win', 'hero/ninja_lose', 'hero/ninja_curl',
  'hero/ninja_power', 'hero/ninja_hurt', 'hero/ninja_skill', 'hero/ninja_throw',
  'hero/ninja_claw', 'hero/ninja_kick', 'hero/ninja_dash', 'hero/ninja_punch',
  'hero/ninja_guard', 'hero/ninja_eat', 'hero/ninja_choke', 'hero/ninja_dizzy',
  'hero/ninja_focus', 'hero/ninja_scroll',
  'hero/ninja_belly', 'hero/ninja_lazy', 'hero/ninja_puff', 'hero/ninja_stealth', 'hero/ninja_iron',
  // 2026-09-11 的三個招式家族
  'hero/ninja_roar', 'hero/ninja_taiji', 'hero/ninja_qinggong',
];

/** 抓 `combat.ts` 裡某張對照表的所有牌 id */
function idsIn(table: 'ATTACK_POSE' | 'SKILL_POSE'): string[] {
  const start = combatSrc.indexOf(`const ${table}: Readonly<Record<string, PoseKey>> = {`);
  expect(start, `${table} 不見了`).toBeGreaterThan(-1);
  const end = combatSrc.indexOf('};', start);
  const body = combatSrc.slice(start, end);
  return [...body.matchAll(/(\w+): '(\w+)'/g)].map((m) => m[1]!).filter((k) => k !== 'PoseKey');
}
/** 抓 `combat.ts` 裡某張對照表用到的所有家族名 */
function famsIn(table: 'ATTACK_POSE' | 'SKILL_POSE'): string[] {
  const start = combatSrc.indexOf(`const ${table}: Readonly<Record<string, PoseKey>> = {`);
  const end = combatSrc.indexOf('};', start);
  return [...new Set([...combatSrc.slice(start, end).matchAll(/\w+: '(\w+)'/g)].map((m) => m[1]!))];
}
const cardIds = new Set([...cardSrc.matchAll(/\{ id: '([a-z0-9_]+)', name: '/g)].map((m) => m[1]!));
const poseKeys = new Set([...combatSrc.slice(combatSrc.indexOf('const POSE = {'), combatSrc.indexOf('type PoseKey'))
  .matchAll(/(\w+): 'hero\//g)].map((m) => m[1]!));

describe('立繪清單', () => {
  it('每一個姿勢鍵都在 manifest 裡，而且檔案真的存在', () => {
    const missingKey = POSE_KEYS.filter((k) => manifest.sprites[k] === undefined);
    expect(missingKey).toEqual([]);
    const missingFile = POSE_KEYS.filter((k) => !existsSync(`public/${manifest.sprites[k]}`));
    expect(missingFile).toEqual([]);
  });

  /*
   * 招式家族的對照表是**手寫的牌 id**，打錯一個字不會報錯：`ATTACK_POSE['taijiX']` 查不到 →
   * 退回掌推、`SKILL_POSE` 查不到 → 退回施術圖，測試全過、線上不報錯，
   * 那張牌永遠用錯的動作，沒有人會發現（跟 2026-09-10 低-4 同一種安靜的錯）。
   */
  it('兩張招式家族對照表裡的牌 id 都真的存在', () => {
    for (const table of ['ATTACK_POSE', 'SKILL_POSE'] as const) {
      const bad = idsIn(table).filter((id) => !cardIds.has(id));
      expect(bad, `${table} 裡這幾個 id 在 cards.ts 找不到：${bad.join('、')}`).toEqual([]);
    }
    expect(idsIn('ATTACK_POSE').length).toBeGreaterThan(30);
    expect(idsIn('SKILL_POSE').length).toBeGreaterThan(10);
  });

  it('兩張對照表用到的家族名都在 POSE 表裡', () => {
    for (const table of ['ATTACK_POSE', 'SKILL_POSE'] as const) {
      const bad = famsIn(table).filter((f) => !poseKeys.has(f));
      expect(bad, `${table} 用到 POSE 表沒有的家族：${bad.join('、')}`).toEqual([]);
    }
  });

  it('SKILL_POSE 只收非攻擊牌：攻擊牌要走 ATTACK_POSE，不然 cardPose 永遠先被攻擊那條攔走', () => {
    const attackIds = new Set([...cardSrc.matchAll(/\{ id: '([a-z0-9_]+)', name: '[^']+', cost: \d+, type: 攻/g)].map((m) => m[1]!));
    const wrong = idsIn('SKILL_POSE').filter((id) => attackIds.has(id));
    expect(wrong, `這幾張是攻擊牌卻寫進 SKILL_POSE，那幾條是死碼：${wrong.join('、')}`).toEqual([]);
  });

  it('manifest 裡的立繪檔案沒有一個是空的', () => {
    const bad = Object.entries(manifest.sprites).filter(([, rel]) => !existsSync(`public/${rel}`));
    expect(bad).toEqual([]);
  });
});
