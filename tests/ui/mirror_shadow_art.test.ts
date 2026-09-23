/**
 * 鏡中封封五張重生（2026-09-23，批次 mirror；美術盤點 C1，工具 `tools/gen_shadow_fengfeng.py`）。
 *
 * 09-20 進倉的那一批是一隻灰虎斑貓穿封封的衣服：沒有影子化、角色只佔畫布 58～68%（另外三隻影子 95～100%），
 * 戰場上小一圈、也看不出是「影子」。打包時量兩個數字記在 `packed.json`，這裡守住它們、並核對圖檔雜湊
 *（換了圖卻沒重量，這裡會紅）：
 *  - `heightShare`：主體高 ÷ 畫布高。站著的四張至少九成（舊圖 0.58～0.68），倒地至少五成五（舊圖 0.32）；
 *  - `darkShare`：不透明像素裡接近黑的比例。影子是黑紫煙霧，至少九成（舊圖 0.62～0.68，另外三隻影子 0.96 以上）。
 * 讀 webp 像素要解碼器，測試環境沒有，所以數字在打包那一刻量好寫進紀錄，這裡比對紀錄與雜湊。
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import packed from '../../tools/motion-art-source/mirror/packed.json';
import manifest from '../../public/assets/manifest.json';

type Row = { pose: string; heightShare: number; darkShare: number; sha256: string };
const rows = packed as Row[];

describe('鏡中封封', () => {
  it('五個姿勢都重生過，清單還是指到同一組檔', () => {
    expect(rows.map((r) => r.pose)).toEqual(['idle', 'attack', 'hurt', 'block', 'down']);
    const entry = (manifest.monsters as Record<string, Record<string, string>>)['codex/monster_shadow_fengfeng']!;
    for (const r of rows) expect(entry[r.pose]).toBe(`assets/monsters/shadow_fengfeng_${r.pose}.webp`);
  });

  it('圖檔跟打包紀錄一致', () => {
    for (const r of rows) {
      const sha = createHash('sha256').update(readFileSync(`public/assets/monsters/shadow_fengfeng_${r.pose}.webp`)).digest('hex');
      expect(sha, r.pose).toBe(r.sha256);
    }
  });

  it('跟另外三隻影子一樣塞滿畫布、整隻是黑紫的影子', () => {
    for (const r of rows) {
      expect(r.heightShare, r.pose).toBeGreaterThanOrEqual(r.pose === 'down' ? 0.55 : 0.9);
      expect(r.darkShare, r.pose).toBeGreaterThanOrEqual(0.9);
    }
  });
});

/**
 * 菲菲單人的鏡子走廊主圖（美術盤點 C2，工具 `tools/gen_feifei_mirror_hall.py`）：09-14 那張鏡子裡是
 *「綁頭巾的黑影」（她那時打影球球），09-15 起她打鏡中菲菲、文字也寫她自己的倒影抬起握針的手。
 * 換成她自己的黑影之後，選定紀錄記下檔案大小；有人把舊圖放回來（或重生沒記紀錄）這裡會紅。
 */
describe('菲菲的鏡子走廊主圖', () => {
  it('是 2026-09-23 重生、選定紀錄對得上的那一張', async () => {
    const picks = (await import('../../tools/motion-art-source/mirror/picks.json')).default as Record<string, { bytes?: number }>;
    const bytes = readFileSync('public/assets/bg/event_feifei_mirror_hall.webp').length;
    expect(picks.feifei_mirror_hall?.bytes).toBe(bytes);
  });
});
