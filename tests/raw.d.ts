/**
 * `import x from '…?raw'`＝把那個檔案的**原始文字**讀進來（Vite 的功能）。
 *
 * 專案的 `tsconfig.json` 刻意寫 `"types": []`（不吃 node 的型別），
 * 所以測試裡不能用 `node:fs` 讀檔——`tsc --noEmit` 會紅。
 * 有幾條測試盯的是「原始碼裡不准出現某種寫法」，非讀原始文字不可，
 * 這一份就是給那幾條用的宣告。
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
