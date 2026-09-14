import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * 總稽核 2026-09-14（併回單機版前）修掉的幾條，行為本身在畫面接線層、單元測試搆不到，這裡守原始碼。
 */
describe('總稽核 2026-09-14 的畫面層修正', () => {
  it('B 中-1：離開連線就撕掉紅色橫幅，不然回標題開單機它還壓在最上緣', () => {
    const src = readFileSync('src/ui/app.ts', 'utf-8');
    const body = src.slice(src.indexOf('leaveCoop(): void'), src.indexOf('backToMap(): void'));
    expect(body).toContain(".net-trouble");
  });

  it('B 中-2：貓窩連線版回地圖只由 onRunApplied 那一邊排，而且進 disposers', () => {
    const src = readFileSync('src/ui/screens/rest.ts', 'utf-8');
    expect(src).toContain('if (coop) return;');
    expect(src).not.toMatch(/if \(coop\) \{ if \(allDone\(\)\) window\.setTimeout/);
    expect(src).toMatch(/const back = window\.setTimeout\(\(\) => app\.backToMap\(\), didMine \? 900 : 700\);\s*\n\s*app\.disposers\.push/);
  });

  it('F 中-1：開場預載跳過角色專屬的鍵，三個入口選好角色都補載', () => {
    expect(readFileSync('src/ui/assets.ts', 'utf-8')).toContain('if (heroOfKey(key)) continue;');
    expect(readFileSync('src/ui/app.ts', 'utf-8')).toContain('preloadHeroArt([hero])');
    expect(readFileSync('src/ui/app.ts', 'utf-8')).toContain('preloadHeroArt(run.players.map((p) => p.hero))');
    expect(readFileSync('src/ui/screens/lobby.ts', 'utf-8')).toContain('preloadHeroArt(app.run.players.map((p) => p.hero))');
    expect(readFileSync('src/ui/app.ts', 'utf-8')).toContain('heroSpriteUrls(run.players.map((p) => p.hero))');
  });
});
