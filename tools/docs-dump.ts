/**
 * docs/ 底下那四份「從程式倒出來給人看」的文件（牌池總表、事件文案、怪物工作檯、分關載入）怎麼寫檔（2026-10-02）。
 *
 * 原本 `npx vitest run` 每跑一次就把四份全部重寫，內容還會跟著日期、手上改到一半的東西變，
 * 提交前得一份一份還原（6a781915 就是專門還原它們的一筆），使用者裁定：**跑測試只檢查、不寫檔**。
 *
 * 要更新文件：`npm run docs:dump`（只跑那四支倒檔測試，並且真的寫檔），改完一起提交。
 * 另一種開法：環境變數 `QIUQIU_WRITE_DOCS=1`。
 *
 * 分關載入那份不一樣：`tools/check_size.py` 靠它把二三關的圖排除在首載之外，過期了首載量會量錯，
 * 所以那支測試在不寫檔的時候改成**比對**，過期就紅、叫你跑 `npm run docs:dump`。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const WRITE_DOCS = process.env.npm_lifecycle_event === 'docs:dump' || process.env.QIUQIU_WRITE_DOCS === '1';

/** 只有 `npm run docs:dump`（或 QIUQIU_WRITE_DOCS=1）才真的寫；平常跑測試什麼都不做 */
export function writeDoc(path: string, text: string): void {
  if (!WRITE_DOCS) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf-8');
}

/** 檔案內容跟這份一不一樣（換行統一成 LF 再比：這兩台 git 取出來是 CRLF、雲端是 LF） */
export function docUpToDate(path: string, text: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf-8').replace(/\r\n/g, '\n') === text.replace(/\r\n/g, '\n');
}
