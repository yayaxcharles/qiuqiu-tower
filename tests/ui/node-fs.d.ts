// 測試刻意不裝 @types/node（tsconfig 的 types 是空的，process 那類都是自己宣告最小型別）。
// phased.test.ts 要讀樣式檔原文，而 `.css?raw` 在 vitest 底下會被它的 CSS 處理換成空字串，
// 只好用 fs——這裡只宣告用到的那兩個函式，不把整套 Node 型別拉進來。
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: string): string;
  export function existsSync(path: string | URL): boolean;   // hero_video.test：確認菲菲的開頭影片檔在
  // motion_asset_build.test：用獨立暫存目錄驗證真正打包後的素材。
  export function copyFileSync(source: string, destination: string): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function dirname(path: string): string;
}
