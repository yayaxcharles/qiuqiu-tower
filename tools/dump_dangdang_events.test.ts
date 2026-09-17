import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { eventTextFor } from '../src/content/dialogue';
import { events } from '../src/content/events';

/*
 * **F 批（共用事件插圖的噹噹版）要照他那一版的文字畫**（2026-09-17）。
 *
 * 他那 121 段是稿子逐篇重寫的，不是換名字——同一篇事件裡他做的事跟球球不一樣
 *（撿卷軸那篇：球球是腳一滑滾下去，他是腳下木板翻起把他摔到另一側）。
 * 照球球那版畫等於畫錯，所以生圖之前先把「他看到的那一版」整份倒出來對。
 *
 * 倒出來的鍵就是圖檔的鍵：場景圖用事件編號、結果圖用 `resultArt`
 *（`ui/assets.ts` 的 `eventArtKey()`：`bg/event_dangdang_<X>`，查不到才退回球球那張）。
 *
 * 跟 `dump_feifei_events.test.ts` 同一個規矩：**只有帶 `DUMP_DANGDANG=1` 才寫檔**，
 * 不然每跑一次全部測試就重寫一份工作檔。
 *   DUMP_DANGDANG=1 npx vitest run tools/dump_dangdang_events.test.ts
 */
const OUT = 'tools/dangdang_event_text.json';

it.skipIf(!process.env['DUMP_DANGDANG'])('dump', () => {
  const table: Record<string, { kind: string; title: string; ninja: string; dangdang: string }> = {};
  for (const e of events) {
    if (e.hero) continue;                       // 專屬事件（他自己那四篇已經在 E 批做完）不在這批
    table[e.id] = {
      kind: 'scene', title: e.title,
      ninja: e.text, dangdang: eventTextFor('dangdang', e.text),
    };
    for (const c of e.choices) {
      if (!c.resultArt || !c.result) continue;
      table[c.resultArt] = {
        kind: `result／選項「${c.label}」`, title: e.title,
        ninja: c.result, dangdang: eventTextFor('dangdang', c.result),
      };
    }
  }
  writeFileSync(OUT, JSON.stringify(table, null, 1), 'utf-8');
  const same = Object.entries(table).filter(([, v]) => v.ninja === v.dangdang);
  // eslint-disable-next-line no-console
  console.log(`寫好了：${OUT}（${Object.keys(table).length} 段；其中 ${same.length} 段沒有他的版本、退回球球原文：${same.map(([k]) => k).join(' ')}）`);
});
