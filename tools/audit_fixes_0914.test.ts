import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RUN_KEY } from '../src/engine/save';

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

  it('併回：網址路徑與存檔前綴照部署的倉庫自動決定，拿不到時退回單機版的', () => {
    expect(RUN_KEY, '測試環境的 BASE_URL 是「/」，要退回單機版的前綴').toBe('qiuqiu-tower/run');
    const vite = readFileSync('vite.config.ts', 'utf-8');
    expect(vite).toContain("process.env['SITE_NAME']");
    expect(vite).toMatch(/qiuqiu-tower-coop\$\/\.test\(process\.env\['GITHUB_REPOSITORY'\]/);
    expect(vite).toContain('base: SITE_BASE');
    // 閘門傳的是倉庫名，不是帶斜線的路徑（Git Bash 會把路徑樣子的環境變數換成 Windows 路徑）
    expect(readFileSync('tools/prepush_gate.sh', 'utf-8')).toContain('SITE_NAME="$site_name"');
    expect(readFileSync('src/engine/save.ts', 'utf-8')).toContain("const PREFIX = BASE_PATH || 'qiuqiu-tower';");
  });

  it('F 中-1：開場預載跳過角色專屬的鍵，三個入口選好角色都補載', () => {
    // 2026-09-16 總稽核戊 M3：首頁就出現的菲菲參上封面（TITLE_ART）是例外，其餘角色專屬的鍵照舊跳過
    expect(readFileSync('src/ui/assets.ts', 'utf-8')).toContain('if (heroOfKey(key) && !TITLE_ART.has(key)) continue;');
    // 2026-09-23 health H-3：三個入口（新的一局、續玩、連線開局）收成 `adoptRun`，補載只寫在那一支。
    // 原本逐一比對三個入口各自那行補載；現在守「補載在 adoptRun 裡，三個入口都叫它」
    const app = readFileSync('src/ui/app.ts', 'utf-8').replace(/\r\n/g, '\n');
    const body = (start: string): string => {
      const at = app.indexOf(start);
      expect(at, start).toBeGreaterThanOrEqual(0);
      return app.slice(at, app.indexOf('\n  }\n', at));
    };
    expect(body('  adoptRun(run: RunState, seat: number): void {')).toContain('preloadHeroArt(run.players.map((p) => p.hero))');
    expect(body('  newRun(seed?: string')).toContain('this.adoptRun(');
    expect(body('  continueRun(from?: RunState): boolean {')).toContain('this.adoptRun(run, 0)');
    expect(readFileSync('src/ui/screens/lobby.ts', 'utf-8')).toContain('app.adoptRun(run, seat);');
    expect(readFileSync('src/ui/app.ts', 'utf-8')).toContain('heroSpriteUrls(run.players.map((p) => p.hero))');
  });
});
