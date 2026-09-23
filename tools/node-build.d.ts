// 這個專案刻意不裝 `@types/node`（`tsconfig.json` 的 `types` 是空陣列），
// 要用到 Node 的東西就自己宣告最小型別——`tests/ui/node-fs.d.ts` 是同一套做法。
//
// 素材雜湊外掛（`tools/vite-asset-hash.ts`）是打包時跑的，會讀檔、改名、算雜湊，
// 所以用到的比測試那邊多。**本機 `npx tsc --noEmit` 不補這份也會過**（`node_modules`
// 裡有別的套件拉進來的 `@types/node`，被隱式撿到了），可是雲端 `npm ci` 之後撿不到，
// GitHub Actions 的建置就整支紅——2026-09-16 第一次推就踩到，線上停在舊版。
// 所以這份不是為了本機，是為了雲端。

declare module 'node:crypto' {
  interface Hash {
    update(data: Uint8Array | string): Hash;
    digest(encoding: 'hex' | 'base64' | 'base64url'): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module 'node:fs' {
  export function existsSync(path: string | URL): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readdirSync(path: string, options: { withFileTypes: true }): {
    name: string; isDirectory(): boolean; isFile(): boolean;
  }[];
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string | URL): Uint8Array;
  export function readFileSync(path: string | URL, encoding: string): string;
  export function renameSync(oldPath: string, newPath: string): void;
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  /** `tools/assets_nonempty.test.ts`／`feifei_stills.test.ts`／`hero_text_scan.test.ts` 用來探路徑是不是資料夾、檔案是不是 0 位元組 */
  export function statSync(path: string): { size: number; isDirectory(): boolean };
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function extname(p: string): string;
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
}

/** `tools/haze.test.ts` 找一支跑得動 `check_haze.py` 的 python、再跑它 */
declare module 'node:child_process' {
  export function execFileSync(
    file: string,
    args?: string[],
    options?: { stdio?: string; encoding?: string },
  ): string;
}
