// 產生 docs/怪物分關.json：每張魔物立繪最早在第幾關會用到（tools/check_size.py 拿它把二三關的圖歸「分關載入」）。
// `npx vitest run` 會一起跑到（tools/ 也在測試範圍），所以檔案不會過期；改了遭遇或關主池跑完測試把 docs/怪物分關.json 一起提交就好
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { monsterArtKeysForAct } from '../src/ui/preload';

it('dump monster acts', () => {
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as { monsters: Record<string, Record<string, string>> };
  const minAct = new Map<string, number>();
  for (const act of [3, 2, 1]) for (const key of monsterArtKeysForAct(act)) minAct.set(key, act);
  const out: Record<string, number> = {};
  for (const [key, poses] of Object.entries(manifest.monsters)) {
    const act = minAct.get(key) ?? 9;   // 9＝目前沒有任何遭遇用到（例如只在事件裡出現的），當作分關載入
    for (const path of Object.values(poses)) out[path] = act;
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync('docs/怪物分關.json', JSON.stringify(sorted, null, 1) + '\n', 'utf-8');
  const n = (a: number) => Object.values(sorted).filter((v) => v === a).length;
  console.log(`怪物分關：第一關 ${n(1)} 檔、第二關 ${n(2)}、第三關 ${n(3)}、沒用到 ${n(9)}`);
});
