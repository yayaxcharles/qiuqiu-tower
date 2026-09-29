import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-09-29 效能（使用者朋友的 MacBook i5 內建顯示晶片卡）：特效全部保留、換省力的做法。
// 戰鬥的火光、暖光、浮塵畫在一張畫布上；地圖與其他畫面的火光改成「底圖不動、上面一層暖光只變透明度」。
// 這幾條擋的是有人又把「整張底圖跑濾鏡動畫」或「五層蓋滿畫面的浮塵」加回去。
const src = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('背景火光與浮塵：省力做法', () => {
  it('戰鬥畫面用 ambient 畫布，不再掛 .motes 三層', () => {
    const combat = src('src/ui/screens/combat.ts');
    expect(combat).toContain('box.append(bg, ambientCanvas());');
    expect(combat).not.toContain("class: 'motes'");
    const css = src('src/ui/styles/combat.css');
    expect(css).not.toMatch(/\.battle-bg\s*\{[^}]*animation:/);
    expect(css).not.toContain('.battle-bg::after');
    expect(css).not.toContain('@keyframes torchlight');
  });

  it('地圖、事件等畫面與封面的火光關鍵影格只動透明度，不對底圖跑濾鏡', () => {
    const map = src('src/ui/styles/map.css');
    const screens = src('src/ui/styles/screens.css');
    for (const [css, name] of [[map, 'map-torchlight'], [screens, 'bg-torchlight'], [screens, 'night-drift']] as const) {
      const i = css.indexOf(`@keyframes ${name}`);
      expect(i, name).toBeGreaterThan(-1);
      const body = css.slice(i, css.indexOf('\n}', i));
      expect(body, name).not.toContain('filter');
      expect(body, name).toContain('opacity');
    }
    expect(map).not.toMatch(/\.map-bg\s*\{[^}]*animation:/);
    expect(screens).not.toMatch(/\.screen-bg\s*\{[^}]*animation:/);
  });

  it('畫布的節奏跟原本的關鍵影格一樣（5.7 秒火光、4.3 秒暖光、41／63／89 秒浮塵）', () => {
    const amb = src('src/ui/ambient.ts');
    expect(amb).toContain('track(LIGHT, 5.7, now)');
    expect(amb).toContain('track(GLOW_OP, 4.3, now)');
    for (const s of ['sec: 41', 'sec: 63', 'sec: 89']) expect(amb).toContain(s);
  });
});
