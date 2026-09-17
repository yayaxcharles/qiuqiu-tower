import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * **噹噹的事件插圖不准倒退**（2026-09-17，F 批做完當天補的）。
 *
 * 為什麼要有這條：`tools/feifei_stills.test.ts` 那兩條只看得到菲菲。她那邊的
 * `mine()` 會把 `bg/event_dangdang_*` 當成「別人的專屬圖」整批排除掉，所以
 * **他的 114 張一張都沒有被任何測試盯著**——一次沒鎖好的 manifest 覆寫就能
 * 悄悄掉光，而且所有測試照綠。那正是菲菲那支檔頭記下的教訓
 *（「把一對鍵一起刪掉，缺口仍然是 0」），換個角色又成立一次。
 *
 * 兩條分工跟她那邊一樣：
 *   1. **張數只准往上**——擋「整批被覆寫掉」。
 *   2. **缺口只准往下**——擋「球球有、他沒有」，那才是玩家會看到球球的地方。
 *      口徑跟 `ui/assets.ts` 的 `eventArtKey()` 一致：有他的就用他的，沒有才退回球球那張。
 *
 * 2026-09-17 的實際數字：他 114 張（共用事件 101 ＋ 四篇專屬事件 13），缺口 0。
 */
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as {
  bg: Record<string, string>;
};

/** 別的角色的專屬圖不算「球球的」——他們的事件別人走不到，沒有「退回去」這回事 */
const OTHERS = ['feifei', 'samurai', 'dangdang'];
const ownedByOther = (k: string): boolean =>
  OTHERS.some((h) => k.includes(`_${h}_`) || k.startsWith(`bg/event_${h}_`));

describe('噹噹的事件插圖', () => {
  it('張數不准倒退', () => {
    const his = Object.keys(manifest.bg).filter((k) => k.startsWith('bg/event_dangdang_'));
    // eslint-disable-next-line no-console
    console.log(`  他的事件插圖 ${his.length} 張`);
    expect(his.length, '倒退了——是不是有圖被刪掉或改名？').toBeGreaterThanOrEqual(114);
  });

  it('退回球球的事件圖只准變少', () => {
    const bg = Object.keys(manifest.bg);
    const qiuqiu = bg.filter((k) => k.startsWith('bg/event_') && !ownedByOther(k));
    const gap = qiuqiu.filter((k) => !manifest.bg[k.replace('bg/event_', 'bg/event_dangdang_')]);
    // eslint-disable-next-line no-console
    console.log(`  事件插圖 ${qiuqiu.length - gap.length}/${qiuqiu.length}，還退回球球的 ${gap.length} 張`);
    expect(gap.length, `缺口變大了，是不是有圖被刪掉或改名？還缺：\n${gap.slice(0, 10).join('\n')}`)
      .toBeLessThanOrEqual(0);
  });

  it('他那四篇專屬事件的插圖都在', () => {
    for (const k of ['dangdang_lining', 'dangdang_toolbox', 'dangdang_old_dent', 'dangdang_jammed_gate']) {
      expect(manifest.bg[`bg/event_${k}`], `${k} 不見了`).toBeTruthy();
    }
  });
});
