import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * 這個專案刻意不裝 `@types/node`（`tsconfig.json` 的 `types` 是空陣列），
 * `node:` 模組用到的函式都得自己在 `tests/ui/node-fs.d.ts`／`tools/node-build.d.ts` 宣告，
 * 不然本機因為 node_modules 裡有別的套件間接拉進 `@types/node`、撿到型別會過，
 * 雲端 `npm ci` 之後撿不到就整支紅（`tools/node-build.d.ts` 檔頭記的就是這件事，
 * 2026-09-16 第一次推就踩到）。
 *
 * 以前只能等 `npx tsc --noEmit` 去抓，而且**推送閘門借的是本機整個 node_modules**，
 * 裡面就有那份 `@types/node`，所以閘門的 tsc 一路是綠的、看不出問題
 * （2026-09-23 稽核 中-2）。閘門改成只借鎖檔套件之後這個洞已經補了，
 * 這條測試是第二層：不靠 tsc、直接掃原始碼裡每一個 `node:` 具名匯入，
 * 逐一比對兩份宣告檔有沒有這個名字。就算哪天閘門的 node_modules 做法又跟著
 * 本機走鐘，這裡還是擋得住，而且訊息比 tsc 的報錯更直接指到「哪個名字沒宣告」。
 */

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walkTs(p));
    else if (n.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** 從宣告檔擷取「node:模組 → 已宣告的匯出名稱」 */
function declaredNames(src: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const blockRe = /declare module '(node:[a-z_]+)'\s*\{([\s\S]*?)\n\}/g;
  for (let m = blockRe.exec(src); m; m = blockRe.exec(src)) {
    const names = out.get(m[1]!) ?? new Set<string>();
    const fnRe = /export function ([A-Za-z0-9_]+)/g;
    for (let f = fnRe.exec(m[2]!); f; f = fnRe.exec(m[2]!)) names.add(f[1]!);
    out.set(m[1]!, names);
  }
  return out;
}

function mergeDecls(...srcs: string[]): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>();
  for (const src of srcs) {
    for (const [mod, names] of declaredNames(src)) {
      const set = merged.get(mod) ?? new Set<string>();
      for (const n of names) set.add(n);
      merged.set(mod, set);
    }
  }
  return merged;
}

/** 掃一支檔案裡每一行具名匯入 `node:` 模組的寫法，回傳用到的每個名稱與行號 */
function usedImports(path: string): { mod: string; name: string; line: number }[] {
  const out: { mod: string; name: string; line: number }[] = [];
  const src = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');   // 這台 git 是 autocrlf=true，原始碼取出來是 CRLF
  const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](node:[a-z_]+)['"]/g;
  for (let m = importRe.exec(src); m; m = importRe.exec(src)) {
    const mod = m[2]!;
    const line = src.slice(0, m.index).split('\n').length;
    for (const raw of m[1]!.split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0]!.trim();
      if (name) out.push({ mod, name, line });
    }
  }
  return out;
}

const declared = mergeDecls(
  readFileSync('tests/ui/node-fs.d.ts', 'utf-8'),
  readFileSync('tools/node-build.d.ts', 'utf-8'),
);

describe('node: 具名匯入都要有宣告（雲端沒有 @types/node）', () => {
  it('tests／tools 底下每個 node: 具名匯入都能在兩份宣告檔找到', () => {
    const files = [...walkTs('tests'), ...walkTs('tools')].map((p) => p.replace(/\\/g, '/'));
    expect(files.length, '要真的掃到檔案，不然這條等於沒測').toBeGreaterThan(100);
    const bad: string[] = [];
    for (const f of files) {
      for (const { mod, name, line } of usedImports(f)) {
        if (!declared.get(mod)?.has(name)) bad.push(`${f}:${line}  ${mod} 的 ${name} 沒有宣告`);
      }
    }
    expect(bad, `這幾個 node: 匯入在 tests/ui/node-fs.d.ts、tools/node-build.d.ts 都找不到宣告：\n${bad.join('\n')}`)
      .toEqual([]);
  });
});
