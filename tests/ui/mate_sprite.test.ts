import { describe, expect, it } from 'vitest';
import SRC from '../../src/ui/screens/combat.ts?raw';

/*
 * **同伴的立繪不能被我的蓋掉**（2026-09-13 開兩個分頁玩出來的）。
 *
 * 戰鬥畫面有六個地方寫 `root.querySelector('.unit.player …')`——沒帶座位。
 * `querySelector` 拿的永遠是畫面上第一格，也就是 0 號座位；那幾行接著又往裡面
 * 寫 `heroArt(my(), …)`，等於把**我的**立繪蓋到同伴身上。
 *
 * 玩家看到的：球球開房、菲菲加入時，菲菲那台兩隻都畫成菲菲，只有名牌還寫
 *「球球（同伴）」。球球那台完全正常——他就是 0 號，第一格剛好是他自己。
 * 所以單機沒事、開房那位沒事，**只有加入的那一位看得到**；
 * 不報錯、不破圖，一千多條測試全綠。
 *
 * 為什麼用讀原始碼的方式測：這幾行是 `setTimeout` 裡的就地換圖，
 * 要在測試裡走到那一拍得先把整個連線與動畫時序都架起來，成本高到不會有人維護。
 * 這條盯的是**規矩**——畫面上凡是「我自己那一格」的選擇器一律要帶 `data-seat`，
 * 少一個就變紅。真的要放行某一行，就在這裡把它列進 `ALLOW` 並寫清楚理由。
 */


/** 帶座位的寫法：`[data-seat="…"]` 或用 `MINE`／`q.seat` 組出來的樣板字串 */
const SEATED = /\.unit\.player\[data-seat=/;

describe('戰鬥畫面「我自己那一格」的選擇器', () => {
  it('沒有任何一個沒帶座位的 .unit.player 選擇器', () => {
    const bad: string[] = [];
    SRC.split('\n').forEach((line, i) => {
      // 註解不算（`MINE` 上面那段說明就在講這個壞寫法，會自己踩到自己）
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      // 只看真的在查 DOM 的那幾行，`class:` 那一行是在組類別名不是選擇器
      if (!/querySelector/.test(line)) return;
      if (!/\.unit\.player/.test(line)) return;
      if (SEATED.test(line)) return;              // 直接寫了 data-seat
      bad.push(`${i + 1}: ${line.trim()}`);
    });
    expect(bad, '這幾行會抓到畫面上第一格（0 號座位），不是我自己那一格').toEqual([]);
  });

  it('MINE 這個常數確實是照 mySeat 組出來的', () => {
    expect(SRC, 'MINE 不見了或改寫法了，上面那條就白測了')
      .toMatch(/const MINE = `\.unit\.player\[data-seat="\$\{mySeat\}"\]`/);
  });

  it('就地換圖那一行用的是 MINE', () => {
    expect(SRC, '收回待機那一拍會把我的立繪寫到同伴身上')
      .toMatch(/const cat = root\.querySelector<HTMLImageElement>\(`\$\{MINE\} \.sprite`\)/);
  });
});
