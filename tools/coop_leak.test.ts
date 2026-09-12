import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 連線的狀態不可以外溢到單機（2026-09-12 稽核抓到兩個高風險）。
 *
 * 兩個都是**靜音**的：
 *   1. `app.coop`／`app.seat` 全專案沒有一行清掉 → 連線打完一局、回標題、開單機，
 *      地圖點任何一格走的是已經斷掉的 `coop.pick()`，那支只印 console.error 就 return，
 *      畫面一動也不動，只能重新整理。當過座位 1 的更慘，`me(run, 1)` 會丟例外。
 *   2. `save()` 不看 `coop` → 兩人局寫進單機那一格存檔（同一份建置共用同一把鑰匙），
 *      單機進度被蓋掉；收尾還會把成績記進單機最佳成績、並 `clearSave()` 直接刪掉存檔。
 *
 * 這裡掃原始碼而不是跑畫面：`tests/ui/` 底下沒有任何一支測試碰得到畫面的連線分岔，
 * 那正是這兩條能活到現在的原因。
 */
const app = readFileSync('src/ui/app.ts', 'utf-8');
const result = readFileSync('src/ui/screens/result.ts', 'utf-8');

describe('連線狀態不可以外溢到單機', () => {
  it('App 有一支 leaveCoop，會把 coop 與 seat 都清掉', () => {
    const m = /leaveCoop\(\): void \{([^}]*)\}/.exec(app);
    expect(m, 'App 沒有 leaveCoop').toBeTruthy();
    expect(m![1], 'leaveCoop 沒把 coop 設回 null').toMatch(/coop\s*=\s*null/);
    expect(m![1], 'leaveCoop 沒把 seat 設回 0').toMatch(/seat\s*=\s*0/);
  });

  it('newRun 與 continueRun 開頭都會清掉連線', () => {
    for (const fn of ['newRun', 'continueRun']) {
      const i = app.indexOf(`  ${fn}(`);
      expect(i, `找不到 ${fn}`).toBeGreaterThan(0);
      const body = app.slice(i, i + 600);
      expect(body, `${fn} 沒有叫 leaveCoop——連線打完再開單機會整局點不動`).toContain('leaveCoop()');
    }
  });

  it('「回到村子」也會清掉連線', () => {
    expect(result, 'result.ts 的回到村子沒清連線').toContain('leaveCoop()');
  });

  it('save() 連線時直接不存', () => {
    const m = /  save\(\): void \{([\s\S]*?)\n  \}/.exec(app);
    expect(m, '找不到 save()').toBeTruthy();
    expect(m![1], 'save() 沒擋連線——兩人局會蓋掉單機存檔').toMatch(/if \(this\.coop\) return/);
  });

  it('記成績與刪存檔也擋掉連線', () => {
    const line = app.split('\n').find((l) => l.includes('recordBest(run)'));
    expect(line, '找不到 recordBest').toBeTruthy();
    expect(line!, 'recordBest／clearSave 沒擋連線——連線局會把單機存檔刪掉').toContain('!this.coop');
  });
});
