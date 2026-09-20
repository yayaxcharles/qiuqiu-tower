import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/manifest.json';
import audit from '../../docs/enemy-facing-audit.json';
import { enemies, enemyArtFor, BOSS_ART, BOSS_HURT_ART, BOSS_MOVE_ART, BOSS_MOVE_ART_PHASE } from '../../src/content/enemies';
import { _setManifestForTest, monsterPhaseKey, monsterUrl, type MonsterPose } from '../../src/ui/assets';

const reviewed = new Map(audit.stills.map((entry) => [entry.file, entry]));
const bossKeys = new Set([
  ...Object.values(BOSS_ART), ...BOSS_HURT_ART, ...Object.values(BOSS_MOVE_ART),
  ...BOSS_MOVE_ART_PHASE.flatMap(Object.values),
]);

describe('全怪物朝向稽核覆蓋', () => {
  it('所有怪物姿勢和塔主招式都有逐圖確認紀錄', () => {
    const sprites = manifest.sprites as Record<string, string>;
    const files = new Set([
      ...Object.values(manifest.monsters).flatMap(Object.values),
      ...[...bossKeys].map((key) => sprites[key]!),
    ]);
    expect(new Set(reviewed.keys())).toEqual(files);
    expect(reviewed.size).toBe(audit.stills.length);
    expect(audit.stills.filter((entry) => entry.facing === 'right' && !entry.displayMirror)).toEqual([]);
  });

  it('換圖後要求重新目視確認，不能沿用舊版朝向結論', () => {
    for (const entry of [...audit.stills, ...audit.motionTextures]) {
      const bytes = readFileSync(new URL(`../../public/${entry.file}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex'), entry.file).toBe(entry.sha256);
    }
  });

  it('四位角色、各怪物階段與缺圖退路都使用已檢查的立繪', () => {
    _setManifestForTest(manifest);
    for (const enemy of enemies) {
      if (enemy.art === 'daxia') continue;
      for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng']) {
        for (let phase = 0; phase <= (enemy.phases?.length ?? 0); phase++) {
          const art = monsterPhaseKey(enemyArtFor(enemy.id, hero), phase);
          for (const pose of ['idle', 'attack', 'hurt', 'block', 'down'] as MonsterPose[]) {
            const url = monsterUrl(art, pose);
            const file = url.slice(url.indexOf('assets/'));
            expect(reviewed.has(file), `${enemy.id}/${hero}/${phase}/${pose}`).toBe(true);
          }
        }
      }
    }
  });
});
