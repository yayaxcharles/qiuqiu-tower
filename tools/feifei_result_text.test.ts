import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { events } from '../src/content/events';
import { eventTextFor } from '../src/content/dialogue';

/**
 * 把「選完選項之後那段文字」的她版匯出成 JSON，給生圖腳本用（2026-09-13）。
 *
 * **為什麼要匯出而不是在 Python 那邊自己轉一次**：`eventTextFor` 的規則以後會長
 *（現在是「球球→菲菲、拿掉句尾的喵」，之前已經為了收尾引號修過一次）。
 * Python 那邊照抄一份的話，兩邊會慢慢分岔，而分岔的症狀是**靜音的**：
 * 圖照生、只是圖裡演的跟玩家讀到的那段話對不上，要並排看才知道。
 * 所以正本只有一份，就是玩家真的會讀到的那一份。
 *
 * 這支預設只**檢查**檔案是不是最新的；要更新就帶環境變數：
 *   UPDATE_FEIFEI_TEXT=1 npx vitest run tools/feifei_result_text.test.ts
 */
const OUT = 'tools/codex_jobs/_feifei_result_text.json';

/** `resultArt` 鍵 → 她讀到的那段結果文案。只收共用事件（她專屬的本來就是她的字）。 */
const dump: Record<string, string> = {};
for (const ev of events) {
  if (ev.hero) continue;                       // 專屬事件不轉
  for (const c of ev.choices) {
    if (!c.resultArt || !c.result) continue;
    dump[c.resultArt] = eventTextFor('feifei', c.result);
  }
}

describe('事件結果文案的她版', () => {
  it('匯出檔是最新的', () => {
    const next = `${JSON.stringify(dump, null, 1)}\n`;
    if (process.env.UPDATE_FEIFEI_TEXT) {
      writeFileSync(OUT, next, 'utf-8');
      return;
    }
    let now = '';
    try { now = readFileSync(OUT, 'utf-8'); } catch { now = ''; }
    /*
     * **換行要先正規化再比**（2026-09-13 稽核 中-9）。
     * 這個倉庫 `core.autocrlf=true` 而且沒有 `.gitattributes`，所以別台機器 checkout
     * 出來的 JSON 是 CRLF，而 `JSON.stringify` 產生的永遠是 LF——直接比會整條紅，
     * 錯誤訊息還會叫人去跑更新，跑完 checkout 一次又紅一次。
     */
    const lf = (s: string): string => s.replace(/\r\n/g, '\n');
    expect(lf(now), `${OUT} 過期了——跑 UPDATE_FEIFEI_TEXT=1 npx vitest run tools/feifei_result_text.test.ts`)
      .toBe(lf(next));
  });

  it('轉出來的文字裡沒有球球、也沒有句尾的喵', () => {
    const bad = Object.entries(dump)
      .filter(([, t]) => t.includes('球球') || /喵[！？。…～、,.!?]*[」』》）)"'’”]*$/u.test(t))
      .map(([k, t]) => `${k}: ${t.slice(0, 40)}`);
    expect(bad, `這幾段還留著球球的字眼：\n${bad.join('\n')}`).toEqual([]);
  });

  it('每一段都真的換過（不是整批空的）', () => {
    expect(Object.keys(dump).length, '一段都沒收到——events 的欄位名是不是改了？')
      .toBeGreaterThan(50);
  });
});
