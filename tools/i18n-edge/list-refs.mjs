// 列出報告引用到的檔案（給 git add 用）：node tools/i18n-edge/list-refs.mjs
import { readFileSync, existsSync } from 'node:fs';
const md = readFileSync('docs/檢查_英日極端版面_20260930.md', 'utf8');
const refs = new Set();
for (const m of md.matchAll(/\]\(檢查_英日極端版面_20260930\/([^)]+)\)/g)) refs.add(m[1]);
for (const f of [...refs].sort()) console.log(existsSync('docs/檢查_英日極端版面_20260930/' + f) ? 'OK ' : 'MISSING ', f);
