import { describe, expect, it } from 'vitest';
import { events } from '../../src/content/events';
// 球球第二批的開頭與結果延後載入，這支一載入才填回（2026-09-23 b2fin）；不載的話那十八篇是空字串、靜靜跳過
import '../../src/content/event-text-b2';

/**
 * 共用事件結果句裡，主角講的那句話擺在哪（2026-09-16 第三輪回填踩到）。
 *
 * 她那版的引號句是另外寫的（`dialogue.ts` 的 `FEIFEI_EVENT_LINES`，鍵是球球的原句），
 * 寫的時候是照**當時的前後文**寫的。外部改寫如果把球球那句從段尾搬到段首，
 * 鍵會跟著換、測試也不會紅，可是她那句就講在還沒發生的事情前面——
 * 第三輪就出過一次：「欠村貓的那一份」她先謝了傷藥，村貓下一句才拿出傷藥。
 *
 * 所以這條只做一件事：**引號句搬過位置就讓它紅**，逼人回去重讀她那版。
 * 共用事件現行的引號句除了下面這個例外，全都落在 47%～66%。
 */
const 允許擺在前面 = new Set([
  // 球球一邊遞小魚乾一邊講話，這樣寫比擺段尾自然；她那版已經跟著改過了
  'rescue_return_fish',
]);

describe('主角講的那句話擺在段落哪裡', () => {
  it('沒有引號句被搬到段落前段（搬了就要重讀菲菲的對照版）', () => {
    const moved: string[] = [];
    for (const e of events) {
      if (e.hero) continue;   // 角色專屬事件沒有對照版，怎麼擺都不會分岔
      for (const t of [e.text, ...e.choices.map((c) => c.result ?? '')]) {
        const i = t.search(/(?:球球|菲菲)：「/);
        if (i < 0 || t.length < 20) continue;
        if (i / t.length < 0.35 && !允許擺在前面.has(e.id)) moved.push(`${e.id}（${Math.round((i / t.length) * 100)}%）`);
      }
    }
    expect(moved, '這幾句的引號被搬到前面了，去確認 FEIFEI_EVENT_LINES 那版在新位置還讀得通').toEqual([]);
  });
});
