import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { sharpenVerb } from '../src/engine/hero';

/**
 * 畫面上不可以再有寫死的球球用語。
 *
 * 這條掃的是**原始碼裡的字串**而不是跑起來的畫面：換角色的漏網之魚
 *（「到手了喵！」「磨爪之後」）不會讓任何測試變紅，也不會報錯，
 * 只有玩菲菲的人讀到會出戲。掃原始碼是唯一抓得到的方法。
 *
 * 2026-09-12 第一次跑就抓到四處「喵」與一處「磨爪之後」。
 *
 * 放在 `tools/` 是因為 tsconfig 的 include 不含 tools，用 `node:fs` 的測試只能放這裡
 *（跟 `event_result_art.test.ts` 同一個理由）。
 */

/**
 * 先把註解整段拿掉再掃。註解裡本來就會提到「喵」「磨爪」（那是在解釋為什麼要換），
 * 不排掉的話這條測試會被自己的說明文字絆倒——第一版就是這樣，八個誤報全是註解。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function uiFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts')) out.push(p);
    }
  };
  walk('src/ui');
  return out;
}

/** 掃每一行有問題的程式碼（註解已去掉），回傳「檔案:行號  內容」 */
function scan(hit: RegExp, skip: RegExp): string[] {
  const bad: string[] = [];
  for (const f of uiFiles()) {
    stripComments(readFileSync(f, 'utf-8')).split('\n').forEach((code, i) => {
      if (!hit.test(code) || skip.test(code)) return;
      bad.push(`${f}:${i + 1}  ${code.trim().slice(0, 70)}`);
    });
  }
  return bad;
}

describe('畫面文案不可以寫死球球的用語', () => {
  it('顯示用的字串裡不可以有沒過 lineFor 的「喵」', () => {
    // 過了 `lineFor`、拿來比對說話者、或是句尾檢查函式的都可以
    const bad = scan(/喵/, /lineFor|speaker|=== '球球'|feifeiLineOk|qiuqiuLineOk/);
    expect(bad, `這幾行的「喵」沒過 lineFor：\n${bad.join('\n')}`).toEqual([]);
  });

  it('「磨爪」不可以寫死在按鈕上（她磨的是針）', () => {
    expect(sharpenVerb('feifei')).toBe('磨針');
    expect(sharpenVerb('ninja')).toBe('磨爪');
    // `'磨爪'` 當引擎的值是可以的（`rest(run, '磨爪')`、型別聯集）；夾在其他字裡的才是文案
    const bad = scan(/磨爪/, /'磨爪'|sharpenVerb/);
    expect(bad, `這幾行寫死了磨爪：\n${bad.join('\n')}`).toEqual([]);
  });
});
