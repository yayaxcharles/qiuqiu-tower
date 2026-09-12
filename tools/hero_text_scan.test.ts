import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 掃原始碼找「換角色沒換乾淨」的暗病（2026-09-12 使用者實測連抓三個之後補的）。
 *
 * 這一類的共同特徵是**靜音**：畫面照樣有東西、測試照樣全綠、主控台不叫，
 * 只有人眼看得出「牌面寫絕學·絆索、下面卻寫學會了絕學·擒拿手」。
 * 一個一個修不會有終點，要有東西擋著。
 *
 * 三條規則：
 *   1. 畫面層拿牌名一律走 `cardNameFor`（她的牌名跟球球分家）
 *   2. 系統說明不指名角色（詞彙表那批）
 *   3. 句尾的「喵」要過 `lineFor`
 *
 * 忍具與秘寶**不在此限**：那是道具不是角色，磨爪石在她手上還是磨爪石。
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (n.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = walk('src/ui').map((p) => ({ p, src: readFileSync(p, 'utf-8') }));

/**
 * 把註解拿掉再掃：說明文字裡本來就會提到這些寫法。
 * **行數要保住**——整段刪掉會讓報出來的行號往前位移，照著去看會看到別行（第一版就這樣）。
 */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

function scan(re: RegExp, allow?: RegExp): string[] {
  const bad: string[] = [];
  for (const { p, src } of files) {
    strip(src).split('\n').forEach((l, i) => {
      if (re.test(l) && !(allow && allow.test(l))) bad.push(`${p}:${i + 1}  ${l.trim().slice(0, 100)}`);
    });
  }
  return bad;
}

describe('換角色沒換乾淨的暗病', () => {
  it('畫面層不可以直接拿牌表的 name（要過 cardNameFor）', () => {
    // `cardById[...]`.name` 與 `cardStats(...).name` 是兩個直接來源
    const bad = scan(/cardById\[[^\]]*\]\??\.name|cardStats\([^)]*\)\.name/, /cardNameFor/);
    expect(bad, `這幾行的牌名沒過 cardNameFor：\n${bad.join('\n')}`).toEqual([]);
  });

  it('確認框與能力牌的標題也要過（那幾支的 def 是牌不是忍具）', () => {
    for (const f of ['src/ui/confirm.ts', 'src/ui/screens/combat.ts']) {
      const src = strip(readFileSync(f, 'utf-8'));
      const bad = src.split('\n')
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /磨利嗎|要放生|能力，這場戰鬥/.test(l) && !/cardNameFor/.test(l));
      expect(bad.map((b) => `${f}:${b.i + 1}`), `${f} 有標題沒過 cardNameFor`).toEqual([]);
    }
  });

  it('「喵」不可以寫死在畫面上（要過 lineFor）', () => {
    const bad = scan(/喵/, /lineFor|speaker:\s*'球球'|\.speaker ===|=== '球球'|feifeiLineOk|qiuqiuLineOk/);
    expect(bad, `這幾行的「喵」沒過 lineFor：\n${bad.join('\n')}`).toEqual([]);
  });

  it('「磨爪」不可以寫死（她磨的是針）', () => {
    const bad = scan(/磨爪(?!石|油)/, /sharpenVerb|'磨爪'/);
    expect(bad, `這幾行寫死了磨爪：\n${bad.join('\n')}`).toEqual([]);
  });
});
