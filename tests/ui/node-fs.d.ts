// 測試刻意不裝 @types/node（tsconfig 的 types 是空的，process 那類都是自己宣告最小型別）。
// phased.test.ts 要讀樣式檔原文，而 `.css?raw` 在 vitest 底下會被它的 CSS 處理換成空字串，
// 只好用 fs——這裡只宣告用到的那一個函式，不把整套 Node 型別拉進來。
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: string): string;
}
