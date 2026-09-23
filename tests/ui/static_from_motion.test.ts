/**
 * 戰鬥靜態立繪換新畫風（2026-09-23，批次 statics；美術盤點 D1，工具 `tools/pack_static_from_motion.py`）。
 *
 * 四隻貓各 24 種靜態立繪原本是舊畫風，一般網址下在「逐格圖集還沒下載好／延後下載的狀態圖還沒到／?motion=0」時露出來。
 * 這一批從同一隻貓的新版逐格圖集裁代表格覆蓋（同檔名，程式與清單不動），這裡守：
 *  1. 24 種 × 四隻都換了、圖檔跟打包紀錄一致（有人把舊圖放回來、或重裁沒重記，這裡會紅）；
 *  2. 真的放不下才縮，而且縮不超過 15%（換姿勢會看得出變小）；
 *  3. 封封那幾張舊圖靠 `combat.css` 補的腳底位移，換圖的那幾張要拿掉（新圖底邊貼畫布底，不拿掉會往下沉），
 *     沒換的四張（09-22 換的頭暈、倒地、待機、落敗）要留著。
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import record from '../../docs/static-from-motion-assets.json';
import manifest from '../../public/assets/manifest.json';

type Row = { hero: string; pose: string; action: string; file: string; shrink: number; sha256: string };
const rows = record.assets as Row[];
const POSES = ['attack', 'belly', 'choke', 'claw', 'dash', 'dodge', 'focus', 'guard', 'hit', 'hungry', 'hurt', 'iron',
  'kick', 'lazy', 'power', 'puff', 'punch', 'qinggong', 'roar', 'scroll', 'skill', 'stealth', 'taiji', 'throw'];

describe('戰鬥靜態立繪（從新版逐格動作裁）', () => {
  it('四隻各 24 種都換了，檔名就是清單指的那張', () => {
    const sprites = manifest.sprites as Record<string, string>;
    for (const hero of ['ninja', 'feifei', 'dangdang', 'fengfeng']) {
      const mine = rows.filter((r) => r.hero === hero);
      expect(mine.map((r) => r.pose).sort(), hero).toEqual([...POSES].sort());
      for (const r of mine) expect(r.file, `${hero}/${r.pose}`).toBe(sprites[`hero/${hero}_${r.pose}`]);
    }
  });

  it('圖檔跟打包紀錄一致', () => {
    for (const r of rows) {
      const sha = createHash('sha256').update(readFileSync(`public/${r.file}`)).digest('hex');
      expect(sha, r.file).toBe(r.sha256);
    }
  });

  it('真的放不下才縮，縮不超過 15%', () => {
    for (const r of rows) expect(r.shrink, `${r.hero}/${r.pose}`).toBeGreaterThanOrEqual(0.85);
    // 打包當下 96 張裡縮了 6 張（0.90～0.99：翻肚、炸毛、鐵布衫、太極、踢、封封的重劈），其餘都是原大小
    expect(rows.filter((r) => r.shrink < 1).length).toBeLessThanOrEqual(8);
  });

  it('封封換了圖的那幾張拿掉舊的腳底位移，沒換的留著', () => {
    const css = readFileSync('src/ui/styles/combat.css', 'utf-8').replace(/\r\n/g, '\n');
    for (const name of ['belly_clean', 'choke_clean', 'lazy_clean', 'puff_clean', 'stealth', 'iron', 'hit', 'hurt', 'power']) {
      expect(css, name).not.toContain(`/fengfeng_${name}"]`);
    }
    for (const name of ['dizzy_clean', 'down', 'idle', 'lose']) expect(css, name).toContain(`/fengfeng_${name}"]`);
  });
});
