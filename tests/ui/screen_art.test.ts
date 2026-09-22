import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import record from '../../docs/screen-art-assets.json';
import manifest from '../../public/assets/manifest.json';

/**
 * 選角、結算、過關、特殊獎勵、標題五個畫面的主角立繪換新畫風（批次 screens，2026-09-22）。
 *
 * 盤點報告第 4 項：戰鬥、對白、走路轉場是新版畫風，這五個畫面還是舊立繪，同一趟流程長相來回換；
 * 第 12 項：封封結算落敗圖在暗底上有一圈灰白毛邊。做法是同檔名、同畫布覆蓋 24 張
 *（`tools/pack_screen_art.py`，量到的數字在 `docs/screen-art-assets.json`），程式與清單都沒動。
 *
 * 這裡守四件事（把任何一張換回舊圖，第一條就紅）：
 *  1. 遊戲裡那 24 個檔案＝打包紀錄裡的那 24 張（雜湊一致）；
 *  2. 畫布大小、腳底線跟舊圖一樣——封封那幾張在 `combat.css` 有照舊圖腳底算好的位移，
 *     選角、結算的版面也是照舊畫布排的，畫布或腳底一變就會浮起來或沉下去；
 *  3. 頭的大小跟新版待機第 1 格同比例（±6%），量不準的那幾張要有人眼並排看過的結論；
 *  4. 沒有暗底白毛邊（舊封封落敗圖是 3.52，現在每張都要在 0.3 以下）。
 * 另外確認這五個畫面讀的立繪鍵，在清單裡對到的就是這 24 個檔：換了鍵或清單指到別的檔，新圖等於沒上。
 */

type Entry = {
  key: string; file: string; sha256: string; canvas: number[]; box: number[]; soleLine: number;
  sizeBy: 'headFit' | 'eye'; eye?: string; headFinal?: { scale: number; corr: number }; halo?: number;
};
const FILES = record.files as unknown as Record<string, Entry>;
const HEROES = ['qiuqiu', 'feifei', 'dangdang', 'fengfeng'] as const;
const POSES = ['idle', 'win', 'lose', 'eat', 'dizzy', 'cover'] as const;

// 舊圖（換圖前 a4e6d19）的畫布與腳底線（alpha > 16 的最下一排＋1；標題貼圖是拿掉題字後煙塵的最下一排＋1）。
// 直接量舊檔得來，不從紀錄抄：紀錄被改壞了這裡才抓得到
const OLD: Record<string, { canvas: [number, number]; sole: Record<(typeof POSES)[number], number> }> = {
  qiuqiu: { canvas: [560, 547], sole: { idle: 543, win: 541, lose: 541, eat: 543, dizzy: 543, cover: 533 } },
  feifei: { canvas: [560, 547], sole: { idle: 545, win: 545, lose: 545, eat: 543, dizzy: 543, cover: 536 } },
  dangdang: { canvas: [560, 547], sole: { idle: 543, win: 543, lose: 543, eat: 543, dizzy: 543, cover: 536 } },
  fengfeng: { canvas: [560, 560], sole: { idle: 533, win: 534, lose: 534, eat: 530, dizzy: 532, cover: 531 } },
};

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** 有透明度的 webp（VP8X）檔頭裡的畫布寬高 */
function webpCanvas(path: string): [number, number] {
  const b = readFileSync(path);
  expect(new TextDecoder().decode(b.subarray(12, 16)), path).toBe('VP8X');
  const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
  const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
  return [w, h];
}

describe('五個畫面的主角立繪換成新版畫風', () => {
  it('24 張全在，而且遊戲裡的檔就是打包紀錄那一張', () => {
    expect(Object.keys(FILES).sort()).toEqual(HEROES.flatMap((h) => POSES.map((p) => `${h}/${p}`)).sort());
    for (const [job, e] of Object.entries(FILES)) expect(sha(e.file), job).toBe(e.sha256);
  });

  it('畫布大小與腳底線跟舊圖一樣', () => {
    for (const hero of HEROES) {
      const old = OLD[hero]!;
      for (const pose of POSES) {
        const e = FILES[`${hero}/${pose}`]!;
        const canvas = pose === 'cover' ? [560, 560] : old.canvas;
        expect(webpCanvas(e.file), `${hero}/${pose}`).toEqual(canvas);
        // 腳底線：成品可見像素的最下一排（縮圖的反鋸齒可能少一排，容許 1 像素）
        const [x0, y0, x1, y1] = e.box as [number, number, number, number];
        expect(e.soleLine, `${hero}/${pose} 擺放的腳底線`).toBe(old.sole[pose]);
        expect(Math.abs(y1 - old.sole[pose]), `${hero}/${pose} 腳底 ${y1}`).toBeLessThanOrEqual(1);
        // 角色整隻在畫布裡（上左右各留 2 像素以上），沒被切到
        expect(Math.min(x0, y0, canvas[0]! - x1), `${hero}/${pose} 外框 ${e.box}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('頭的大小跟新版待機同比例（±6%），量不準的有人眼結論', () => {
    for (const [job, e] of Object.entries(FILES)) {
      if (e.sizeBy === 'eye') {
        expect(e.eye ?? '', job).not.toBe('');
        continue;
      }
      expect(Math.abs(e.headFinal!.scale - 1), `${job} 頭 ${e.headFinal!.scale}`).toBeLessThanOrEqual(0.06);
      expect(e.headFinal!.corr, job).toBeGreaterThanOrEqual(0.87);
    }
    // 人眼訂的只能是自動量頭量不準的姿勢（低頭跪坐、蚊香眼、正面的標題貼圖），不能拿來繞過閘門
    const byEye = Object.entries(FILES).filter(([, e]) => e.sizeBy === 'eye').map(([job]) => job).sort();
    expect(byEye).toEqual(['dangdang/cover', 'dangdang/dizzy', 'dangdang/lose', 'feifei/cover', 'fengfeng/cover',
      'qiuqiu/cover', 'qiuqiu/lose']);
  });

  it('沒有暗底白毛邊（盤點第 12 項：舊封封落敗圖 3.52）', () => {
    for (const [job, e] of Object.entries(FILES)) {
      if (job.endsWith('/cover')) continue;   // 標題貼圖的煙塵本來就是米白色
      expect(e.halo!, job).toBeLessThanOrEqual(0.3);
    }
    expect(FILES['fengfeng/lose']!.file).toBe('public/assets/sprites/hero/fengfeng_lose.webp');
  });

  it('五個畫面讀的立繪鍵，清單裡對到的就是這 24 個檔', () => {
    const sprites = manifest.sprites as unknown as Record<string, string>;
    for (const [job, e] of Object.entries(FILES)) expect(`public/${sprites[e.key]}`, job).toBe(e.file);
    const src = (path: string) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
    // 選角：四隻都寫球球版的站姿鍵，`heroArtUrl` 換成各自的 `_idle`（球球是 `hero/ninja`）
    expect(src('src/ui/screens/heroselect.ts').match(/pose: 'hero\/ninja',/g)).toHaveLength(4);
    expect(src('src/ui/screens/result.ts')).toContain("won ? 'hero/ninja_win' : 'hero/ninja_lose'");
    expect(src('src/ui/screens/actclear.ts').match(/heroArtUrl\(me\(run, seat\)\.hero, 'hero\/ninja_win'\)/g)).toHaveLength(2);
    const reward = src('src/ui/screens/reward.ts');
    for (const key of ['hero/ninja_win', 'hero/ninja_dizzy', 'hero/ninja_eat']) expect(reward, key).toContain(`'${key}'`);
    const title = src('src/ui/screens/title.ts');
    for (const key of ['hero/cover', 'hero/feifei_cover', 'hero/dangdang_cover', 'hero/fengfeng_cover']) {
      expect(title, key).toContain(`'${key}'`);
    }
  });
});
