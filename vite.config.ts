import { defineConfig } from 'vite';

export default defineConfig({
  base: '/qiuqiu-tower/',
  build: {
    target: 'es2022',
    rollupOptions: {
      // 兩個獨立的進入點。相對路徑寫法，不用 node:path——
      // 這個專案的 tsconfig 沒有 node 的型別（`types: []`），加進來只為了兩行路徑不划算
      input: {
        main: './index.html',
        // 連線測試頁：只確認兩台機器的瀏覽器連不連得起來，不含遊戲內容。
        // **不會被主程式載到**（各自是獨立的進入點），所以不吃首載預算
        nettest: './nettest.html',
      },
    },
  },
});
