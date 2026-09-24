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
    // 2026-09-14 同一行多擋了除錯模式的臨時局（`this.coop || this.sandbox`），所以允許後面接其他條件
    expect(m![1], 'save() 沒擋連線——兩人局會蓋掉單機存檔').toMatch(/if \(this\.coop(?: \|\| [^)]+)?\) return/);
  });

  /*
   * **`recordBest` 與 `clearSave` 有兩個呼叫點，兩個都要擋**（2026-09-13 第二輪稽核 高-1）。
   *
   * 第一輪只擋了 `app.ts`，而 `result.ts` 自己也叫了一次——那一行從「無害的第二次呼叫」
   * 變成**唯一的那一次**：連線打完一局走到結算畫面，你單機打到 30F 的存檔就被刪了。
   * 第一版的測試只讀 `app.ts` 這一個字串，漏洞就在測試視野外。
   *
   * 所以這條改成掃**每一個呼叫點**：出現幾次就要有幾處守門。
   */
  it('記成績與刪存檔：每一個呼叫點都擋掉連線', () => {
    const sources: [string, string][] = [['src/ui/app.ts', app], ['src/ui/screens/result.ts', result]];
    const bad: string[] = [];
    for (const [name, src] of sources) {
      const lines = src.split('\n');
      lines.forEach((l, i) => {
        if (!/recordBest\(|clearSave\(/.test(l)) return;
        if (/^\s*(import|\*|\/\/)/.test(l)) return;                 // 匯入與註解不算
        // 守門條件可能寫在上一兩行（三元運算子換行寫），所以看一小段範圍不是單行
        const near = lines.slice(Math.max(0, i - 2), i + 1).join(' ');
        if (!/coop/.test(near)) bad.push(`${name}:${i + 1}  ${l.trim().slice(0, 70)}`);
      });
    }
    expect(bad, `這幾個呼叫點沒擋連線：\n${bad.join('\n')}`).toEqual([]);
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
      .toMatch(/run\.players\.forEach\(\(p, i\) => \{ const id = got\[i\]; if \(!id \|\| p\.down \|\| p\.relics\.includes\(id\)\) markRelicSeat\(i\)/);   // 2026-09-15 審查 高-2：倒下、本來就有那件的也算完成
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
    // 2026-09-23 內容擴充第二批起，結果原文照本機這一位的視角挑（連線限定事件的「我拿／我付」）：`raw = resultRaw(index)`
    // 2026-09-23 b2fin 起多帶 `resultHero`（同伴讓條件選項出現時照同伴的版本寫，見 tests/ui/b2fin_event_0923.test.ts）
    expect(body, 'takeLearn 收到的是原文不是 evText').toContain('evText(raw, resultHero)');
    expect(event, '結果原文不是照本機這一位的視角挑').toContain('const raw = resultRaw(index);');
  });

  it('打贏附帶的獎勵提示認的是「我」不是座位 0', () => {
    const run = readFileSync('src/engine/run.ts', 'utf-8');
    expect(run, 'resolvePendingAfterFight 還在寫死 i === 0').not.toMatch(/i === 0 \? notes : undefined/);
    expect(run, '沒有 forSeat 參數').toContain('forSeat = 0');
    expect(app, 'app.ts 沒把 seat 傳進去').toContain('afterGains, this.seat)');
  });
});
