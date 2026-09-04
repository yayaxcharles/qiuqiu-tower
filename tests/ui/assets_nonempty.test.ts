// 2026-09-05：`public/assets/sprites/hero/ninja_attack.webp` 被批次壓圖腳本壓成 0 位元組，
// 而且跟著上線了一整天——球球每打一張攻擊牌要載的立繪是空的。
// 空檔載不出來但也不會拋錯，所以沒有任何測試會紅，只能靠這條守著。
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = 'public/assets';

function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allFiles(join(dir, e.name)) : [join(dir, e.name)]);
}

describe('資產檔不可以是空的', () => {
  it('public/assets 底下沒有 0 位元組的檔案', () => {
    const files = allFiles(ROOT);
    expect(files.length, '要真的掃到檔案，不然這條等於沒測').toBeGreaterThan(100);
    const empty = files.filter((f) => statSync(f).size === 0);
    expect(empty, '被批次壓圖腳本壓成空的檔案').toEqual([]);
  });
});
