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

/**
 * 2026-09-12 稽核的中低風險四條。全部是**靜音**的：不丟例外、畫面照樣有東西，
 * 玩家看到的是「按鈕按不動」或「提示寫的是別人的事」。
 */
describe('連線的四個靜音卡死點', () => {
  const reward = readFileSync('src/ui/screens/reward.ts', 'utf-8');
  const chest = readFileSync('src/ui/screens/chest.ts', 'utf-8');
  const deckview = readFileSync('src/ui/deckview.ts', 'utf-8');
  const event = readFileSync('src/ui/screens/event.ts', 'utf-8');

  it('戰利品：分不到秘寶的座位也要算完成（不然兩個人一起卡死）', () => {
    expect(reward, '沒有 markRelicSeat').toContain('markRelicSeat');
    expect(reward, '沒有把分不到的座位記成完成')
      .toMatch(/run\.players\.forEach\(\(_, i\) => \{ if \(!got\[i\]\) markRelicSeat\(i\)/);
  });

  it('紙箱：開不出秘寶時直接當結算完（不然繼續永遠按不下去）', () => {
    expect(chest, 'settled 沒處理空紙箱').toContain('let settled = offers.length === 0');
  });

  it('挑牌疊層：沒給 onPickMany 就退回 onPick（不然疊層關掉、呼叫端永遠不叫）', () => {
    expect(deckview, '還在用 onPickMany?.() 的靜默寫法')
      .toContain('if (many > 1 && opts.onPickMany)');
  });

  it('連線的秘笈結果文案要過 evText（不然玩菲菲會留著球球與喵）', () => {
    const i = event.indexOf("kind === 'evlearn'");
    expect(i, '找不到 evlearn 的處理').toBeGreaterThan(0);
    const body = event.slice(i, i + 900);
    expect(body, 'takeLearn 收到的是原文不是 evText').toContain('evText(c.result)');
  });

  it('打贏附帶的獎勵提示認的是「我」不是座位 0', () => {
    const run = readFileSync('src/engine/run.ts', 'utf-8');
    expect(run, 'resolvePendingAfterFight 還在寫死 i === 0').not.toMatch(/i === 0 \? notes : undefined/);
    expect(run, '沒有 forSeat 參數').toContain('forSeat = 0');
    expect(app, 'app.ts 沒把 seat 傳進去').toContain('afterGains, this.seat)');
  });
});
