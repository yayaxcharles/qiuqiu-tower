// 大魔物與塔主的倒地圖（趴平、眼睛變叉）有沒有生齊。
//
// 為什麼要這條：少一張的後果很安靜——`monsterPose` 查不到 `down` 就默默退回待機，
// 那隻關主被打倒時畫面上是一張站得直挺挺的圖慢慢變透明，跟旁邊那隻趴著的完全不同調，
// 測試全過、線上不報錯，只有玩家會覺得「怎麼這隻怪怪的」。
// 日後加新關主、新大魔物時，這條會在忘記生圖的當下就變紅。
//
// 放在 tools/ 是因為 tsconfig 的 include 不含 tools，用 node:fs 的測試只能放這裡
//（`f4b082a` 的教訓）。
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as {
  monsters: Record<string, Record<string, string>>;
};
const src = readFileSync('src/content/enemies.ts', 'utf-8');

/**
 * 讀 WebP 的畫布寬高，不拉圖形函式庫進來（測試環境沒有瀏覽器，Node 也沒有內建解碼器）。
 * 這批全是 VP8L（無損，`add_sprite.py` 存的是有損 VP8 還是 VP8L 由 Pillow 決定），
 * 所以三種容器格式都認：VP8L、VP8（有損）、VP8X（帶 alpha 的擴充容器）。
 */
function webpSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  expect(b.slice(0, 4).toString('ascii'), `${path} 不是 RIFF`).toBe('RIFF');
  expect(b.slice(8, 12).toString('ascii'), `${path} 不是 WEBP`).toBe('WEBP');
  const fourcc = b.slice(12, 16).toString('ascii');
  if (fourcc === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
  if (fourcc === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`${path} 認不得的 WebP 格式：${fourcc}`);
}

/** 大魔物與塔主的美術鍵（`codex/monster_<name>` 去掉前綴的部分） */
function bigOnes(): string[] {
  const out = new Set<string>();
  const re = /pool: '([^']+)'[^\n]*?art: 'codex\/monster_([a-z0-9_]+)'/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[1] === '大魔物' || m[1] === '塔主') out.add(m[2]!);
  }
  return [...out].sort();
}

describe('倒地圖', () => {
  it('清單本身要抓得到 26 隻：正規表達式對不上會讓整組測試靜靜空跑', () => {
    // `bigOnes()` 要求 pool 與 art 在同一行、pool 在前。有人把某隻的定義換行，
    // 那隻就會默默從清單消失、三條測試照樣全綠——正是這支測試要防的那種「安靜的少一張」
    expect(bigOnes().length).toBe(26);
  });

  it('大魔物與塔主每一隻都有，而且檔案真的存在', () => {
    const missing: string[] = [];
    const broken: string[] = [];
    for (const art of bigOnes()) {
      const path = manifest.monsters[`codex/monster_${art}`]?.down;
      if (!path) { missing.push(art); continue; }
      if (!existsSync(`public/${path}`)) broken.push(art);
    }
    expect(missing, `這幾隻沒有倒地圖（生圖用 tools/build_down_queue.py）：${missing.join('、')}`).toEqual([]);
    expect(broken, `manifest 指到不存在的檔案：${broken.join('、')}`).toEqual([]);
  });

  it('一般小怪**刻意**沒有倒地圖', () => {
    // 使用者的鐵則：拉長節奏的動畫一律不做。一場打掉五六隻小怪，每一隻都演一次倒地就變成過場稅；
    // 大魔物與塔主一局只遇得到幾隻，那一下才換得起。
    // 哪天真的要幫小怪補，改這條測試的同時要先想清楚節奏，不是順手加圖。
    const big = new Set(bigOnes());
    const withDown = Object.entries(manifest.monsters)
      .filter(([, poses]) => poses.down)
      .map(([key]) => key.replace('codex/monster_', ''));
    const extra = withDown.filter((a) => !big.has(a));
    expect(extra, `這幾隻不是大魔物／塔主卻有倒地圖：${extra.join('、')}`).toEqual([]);
  });

  it('倒地圖的畫布**高度**跟待機圖一樣：這才是撐住版面的不變量', () => {
    /*
     * 為什麼比的是高度不是整個尺寸（稽核 2026-09-11 中-2）：
     * `add_sprite.py` 有一行 `cw = max(cw, round(ch * box_aspect(mid)))`——待機畫布特別窄的
     * （忍者頭目 341×490）會被放寬到框的長寬比（402×490），跟牠自己的挨打、防禦圖一致。
     * 所以「寬高都一樣」會誤報。真正讓「原地趴下、比站著矮一截」成立的是：
     * 畫布高度相同 → `object-fit: contain` 兩張的縮放率相同 → `--drawn-h` 相同 → 腳印不變。
     *
     * 這條原本寫成兩個 `length > 0`，名字叫「畫布一樣大」卻一個尺寸都沒比——
     * 而且上一條已經 `existsSync` 過，真檔案不可能是 0 位元組，等於永遠會綠。
     */
    let checked = 0;
    for (const art of bigOnes()) {
      const poses = manifest.monsters[`codex/monster_${art}`];
      if (!poses?.down || !poses.idle) continue;
      const a = webpSize(`public/${poses.idle}`);
      const b = webpSize(`public/${poses.down}`);
      expect(b.h, `${art}：倒地畫布高 ${b.h}、待機 ${a.h}，不一樣就會飄或沉`).toBe(a.h);
      // 趴著的一定比站著的橫（寬高比更大），不然就是生圖生成站姿了
      expect(b.w / b.h, `${art}：倒地圖比待機還瘦，可能不是趴著的`).toBeGreaterThanOrEqual(a.w / a.h);
      checked++;
    }
    expect(checked, '一張都沒比到＝這條測試在空跑').toBe(26);
  });
});
