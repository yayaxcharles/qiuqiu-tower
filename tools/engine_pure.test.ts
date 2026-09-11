// 引擎裡不准有亂數與「現在幾點」——連線版整個架構的地基。
//
// 鎖步連線只傳動作不傳狀態（一個動作二十幾個位元組，延遲完全不是問題），
// 前提是兩台機器各自照著算會得到同一個答案。只要引擎裡冒出一個 Math.random
// 或一個 Date.now()，兩邊就會悄悄分岔——分岔的當下不會報錯，要等好幾回合之後
// 畫面對不上才發現，是最難查的一種錯。
//
// 2026-09-11 之前這件事是靠人工 grep 確認的，沒有東西擋得住哪天有人順手加一個。
// 強制收回合那顆按鈕整個設計都靠這條性質（計時放在畫面層、引擎只收明確的動作）。
//
// 放在 tools/ 是因為 tsconfig 的 include 不含 tools，用 node:fs 的測試只能放這裡。
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE_DIR = join(__dirname, '../src/engine');

/** save.ts 是唯一的例外：它記成績要蓋時間戳，跟戰鬥算式無關 */
const TIME_ALLOWED = new Set(['save.ts']);

function engineFiles(): string[] {
  return readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.ts'));
}

/** 去掉註解再找：檔頭講到這些字的說明文字不該被當成違規 */
function codeOf(file: string): string {
  return readFileSync(join(ENGINE_DIR, file), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('引擎純不純（連線版的地基）', () => {
  it('底下沒有任何 Math.random', () => {
    const bad = engineFiles().filter((f) => codeOf(f).includes('Math.random'));
    expect(bad, '亂數一律走 rng.ts 的 sfc32（狀態可存檔、可重現）').toEqual([]);
  });

  it('底下沒有任何時間相依（save.ts 記成績的時間戳除外）', () => {
    const bad: string[] = [];
    for (const f of engineFiles()) {
      if (TIME_ALLOWED.has(f)) continue;
      const code = codeOf(f);
      for (const pat of ['Date.now', 'new Date', 'performance.now', 'setTimeout', 'setInterval']) {
        if (code.includes(pat)) bad.push(`${f}：${pat}`);
      }
    }
    expect(bad, '引擎裡出現「現在幾點」，鎖步連線兩邊就會分岔').toEqual([]);
  });

  it('這條測試本身有在看東西（掃到的檔案數要合理）', () => {
    expect(engineFiles().length, '路徑寫錯會掃到空目錄然後永遠綠').toBeGreaterThan(10);
  });
});
