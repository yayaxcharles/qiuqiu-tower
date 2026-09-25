// 事件的「結果圖」：每個填了 `resultArt` 的選項都要對得到真的檔案。
//
// 使用者 2026-09-11：「事件的結果圖全做」。38 個事件、83 個選項裡有 60 個值得配一張——
// 「什麼都不做」與「進戰鬥」那兩類沿用原插圖就好。
//
// 為什麼要這條：`eventArt()` 查不到鍵就**靜靜回空字串**（見 `ui/screens/event.ts`），
// 那個選項的結果畫面會變成沒有插圖、只剩一段文字，測試全過、線上不報錯，
// 只有玩家覺得「怎麼這個選項沒圖」。命名打錯一個字就是這個下場。
//
// 放在 tools/ 是因為 tsconfig 的 include 不含 tools，用 node:fs 的測試只能放這裡。
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { events } from '../src/content/events';

const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as { bg: Record<string, string> };

describe('事件結果圖', () => {
  it('每個 resultArt 都對得到 manifest 的鍵，而且檔案真的在', () => {
    const missingKey: string[] = [];
    const missingFile: string[] = [];
    for (const ev of events) {
      // 插圖還沒生好的整篇跳過（2026-09-17）：那幾篇也不會排進任何人的地圖（`map.ts` 同一道閘門），
      // 所以玩家看不到破圖。圖生好、旗標拿掉之後，這裡就自然開始盯著它們
      if (ev.artPending) continue;
      for (const c of ev.choices) {
        if (!c.resultArt) continue;
        const path = manifest.bg[`bg/event_${c.resultArt}`];
        if (!path) { missingKey.push(`${ev.title}／${c.resultArt}`); continue; }
        if (!existsSync(`public/${path}`)) missingFile.push(c.resultArt);
      }
    }
    expect(missingKey, `這幾個結果圖 manifest 裡沒有：${missingKey.join('、')}`).toEqual([]);
    expect(missingFile, `manifest 指到不存在的檔案：${missingFile.join('、')}`).toEqual([]);
  });

  it('命名照規則：<事件 id>_r<選項序號>', () => {
    // 規則一致才能用腳本一次產生全部工單（`tools/codex_jobs/event_result_art.json`）。
    // 手寫名字的話下次補圖又要逐一對照
    for (const ev of events) {
      for (const [i, c] of ev.choices.entries()) {
        if (!c.resultArt) continue;
        expect(c.resultArt, `${ev.title} 第 ${i + 1} 個選項`).toBe(`${ev.id}_r${i}`);
      }
    }
  });

  /**
   * 哪些選項**該**配一張結果圖。
   *
   * 判準是「這個選項有沒有真的發生事」——`costFish` 也算（稽核 2026-09-11 中-1）：
   * 山賊讓路、三隻山賊蹲在路邊分錢，`outcome` 濾掉旗標之後是空的，
   * 但玩家真的付了 30／45 條，而且結果文字有明確畫面。
   * 漏掉的話那兩個選項會沿用原插圖——而 `event_toll` 畫的是山賊**舉著木棒擋路**，
   * 跟「已經讓開了」正好相反。
   *
   * 進戰鬥的不強制配（可以配，見下面 `mayHaveArt`）。
   */
  const shouldHaveArt = (c: { outcome: { kind: string }[]; costFish?: number; bySeat?: { kind: string }[][] }): boolean => {
    // 座位不對稱的選項（連線限定事件，2026-09-23）效果寫在 `bySeat`、`outcome` 是空的：兩個座位的都要算
    const kinds = [...c.outcome, ...(c.bySeat?.flat() ?? [])].map((o) => o.kind).filter((k) => k !== 'flag');
    if (kinds.includes('fight')) return false;
    return kinds.length > 0 || (c.costFish ?? 0) > 0;
  };

  it('該配結果圖的選項一個都不能漏', () => {
    // **反向檢查**（稽核 2026-09-11 中-2）：原本只防「多填」不防「漏填」，
    // 所以那兩個付錢選項漏掉時整套測試一聲都沒出
    const missing = events.flatMap((ev) => ev.choices
      .filter((c) => shouldHaveArt(c) && !c.resultArt)
      .map((c) => `${ev.title}／${c.label.slice(0, 16)}`));
    expect(missing, `這幾個選項有發生事卻沒配結果圖：${missing.join('、')}`).toEqual([]);
  });

  /*
   * 進戰鬥的選項**可以**配（2026-09-26 第四輪重審）：選完其實會先停在結果畫面——文字加一顆「開打」鈕
   * （`src/ui/screens/event.ts` 的 `outcome.fight` 那段），沒配圖時頂著主圖。主圖畫的是守衛還在睡、
   * 老鼠還在招手，文字卻已經寫「睜開眼睛擋住去路」「掀翻矮桌」，所以補了十個選項。不強制：
   * 其他進戰鬥的選項主圖本來就是對峙的畫面，頂著也說得通。
   */
  const mayHaveArt = (c: Parameters<typeof shouldHaveArt>[0]): boolean =>
    shouldHaveArt(c) || [...c.outcome, ...(c.bySeat?.flat() ?? [])].some((o) => o.kind === 'fight');

  it('沒發生事的選項不該有專屬結果圖', () => {
    const extra = events.flatMap((ev) => ev.choices
      .filter((c) => !mayHaveArt(c) && c.resultArt)
      .map((c) => `${ev.title}／${c.label.slice(0, 16)}`));
    expect(extra, `這幾個選項不該配結果圖：${extra.join('、')}`).toEqual([]);
  });
});
