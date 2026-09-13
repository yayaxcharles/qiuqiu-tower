import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { eventTextFor } from '../src/content/dialogue';
import { events } from '../src/content/events';

/*
 * **共用事件的文字要交給人重寫成她的口氣**（2026-09-13 使用者要求：「我要這一批，我才能修」）。
 *
 * 現況：38 個共用事件只做機械替換（「球球」→「菲菲」、句尾的「喵」拿掉），
 * 引號裡的口氣還是球球的。使用者實測抓到的
 *「價錢讓我心疼，藥倒是有下本。」就是這樣來的。
 *
 * 這支只倒**引號裡她講的那幾句**，因為敘述句（「菲菲把受傷的村貓救到安全的角落」）
 * 換個主角照樣成立，不必重寫；真正出戲的是**她開口講的話**。
 * 每一句附上球球的原句當對照，底下留一行空白給人填。
 */
const MD = 'docs/菲菲_事件台詞_待重寫.md';

/** 從一段文案裡抓出「球球：「……」」那一句（沒有就回 null） */
function spoken(text: string): string | null {
  // **兩個名字都要收**：轉換過的文案裡已經是「菲菲：「…」」，
  // 只寫「球球」的話對照那一欄永遠是空的（第一版就是這樣印出一整排空引號）
  const m = /(?:球球|菲菲)：「(.+?)」/su.exec(text);
  return m ? m[1]! : null;
}

it('dump', () => {
  const out: string[] = [];
  const p = (s = '') => out.push(s);
  let n = 0;

  p('# 菲菲・事件台詞待重寫');
  p('');
  p('這批是**共用事件**裡她開口講的話。現在只是把球球的句子換個名字、拿掉句尾的「喵」，');
  p('所以口氣還是球球的（衝、嘴硬、愛算計）。她應該是先道歉、先退開、怕痛、話講一半。');
  p('');
  p('**怎麼填**：每一條的「**改成**」那一行直接寫你要的句子，不用動別的。填完把檔案給我，我照著改進程式。');
  p('留空＝維持現狀。敘述句（不在引號裡的）不用管，換個主角照樣通順。');
  p('');
  p('---');
  p('');

  for (const e of events) {
    if (e.hero) continue;                      // 她的專屬事件本來就是照她寫的，不在這一批
    const rows: string[] = [];
    const push = (where: string, raw: string): void => {
      const his = spoken(raw);
      if (!his) return;
      const now = spoken(eventTextFor('feifei', raw));
      n += 1;
      rows.push(`**${where}**`);
      rows.push('');
      rows.push(`- 球球原句：「${his}」`);
      rows.push(`- 現在菲菲講：「${now ?? ''}」`);
      rows.push('- **改成**：');
      rows.push('');
    };
    push('事件開頭', e.text);
    for (const c of e.choices) if (c.result) push(`選項「${c.label}」的結果`, c.result);
    if (!rows.length) continue;
    p(`## ${e.title}`);
    p('');
    p(`> ${eventTextFor('feifei', e.text).split('菲菲：「')[0]!.trim()}`);
    p('');
    for (const r of rows) p(r);
  }

  out.splice(2, 0, `共 **${n} 句**要看。`, '');
  writeFileSync(MD, out.join('\n'), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`寫好了：${MD}（${n} 句）`);
});
