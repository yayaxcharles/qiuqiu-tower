import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (path: string): string => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');

describe('封封非戰鬥共用介面', () => {
  it('選角保留既定人物文案與蓄氣定位', () => {
    const code = src('src/ui/screens/heroselect.ts');
    expect(code).toContain("hero: 'fengfeng'");
    expect(code).toContain('往返山路的橘白劍客，替村子護送藥材與糧食。這次回村，三位朋友都進了魔塔。他放下貨物，帶著劍去找人。');
    expect(code).toContain('蓄氣');
  });

  it('合作雙座位與圖鑑從正式角色清單列出封封', () => {
    expect(src('src/ui/screens/lobby.ts')).toMatch(/HEROES\.filter\(\(h\) => h !== 'samurai'\)/);
    expect(src('src/ui/compendium.ts')).toMatch(/HEROES\.filter\(\(h\) => h !== 'samurai'\)/);
  });

  it('首頁使用封封參上圖，四角色版面有獨立縮放', () => {
    const title = src('src/ui/screens/title.ts');
    const css = src('src/ui/styles/base.css') + src('src/ui/styles/screens.css');
    expect(title).toContain("hero/fengfeng_cover");
    expect(title).toContain('title-cat-box four');
    expect(css).toMatch(/\.title-cat-box\.four\s+\.title-cat\s*\{/);
  });

  it('除錯頁仍由正式角色清單產生按鈕', () => {
    expect(src('src/ui/screens/debug.ts')).toMatch(/HEROES\.filter\(\(h\) => h !== 'samurai'\)/);
  });
});
