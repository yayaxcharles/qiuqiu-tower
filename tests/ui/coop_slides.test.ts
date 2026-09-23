import { afterEach, describe, expect, it } from 'vitest';
import { setCoopStory, storyFor } from '../../src/content/dialogue';
import { actClearSlides, endingSlides, prologueSlides, topSceneSlides } from '../../src/ui/storyslides';
import { slidesReady } from '../../src/ui/slides';

/*
 * 連線的共用場景不可以配單人的插圖（2026-09-17 稽核 中-3、中-4）。
 *
 * 這兩條會靜靜壞掉：`actClearSlides`／`endingSlides` 走的是 `stillKey(hero, …)`，
 * 回的是**單人版**的圖鍵，而那些圖全都在倉裡——所以不擋的話 `slidesReady` 回 true，
 * 兩隻貓的對話就被鋪到「一隻貓自己站在那裡」的圖上，測試照樣全綠、線上照樣不報錯。
 * 使用者實測過同一類問題（「菲菲說牠長出鱗甲，可是牠長得一模一樣」）。
 */
afterEach(() => { setCoopStory(null); });

describe('連線的共用場景：寧可少一段幻燈片，不要放別人的故事', () => {
  it('單人局照常有幻燈片（這條先證明這把尺是活的）', () => {
    setCoopStory(null);
    expect(actClearSlides('ninja', 1).length).toBeGreaterThan(0);
    expect(endingSlides('ninja', [], 1).length).toBeGreaterThan(0);
  });

  it('兩個不同角色一起爬時，過關與結局只配連線圖，絕不借單人的圖', () => {
    // 噹噹＋球球是 `MIXED_SCENES` 裡真的寫了共用場景的那一組。
    // 2026-09-23 這一組有了自己的連線劇情圖（原本回空陣列、退回純對白）；清單裡沒有連線圖時的退路
    // 改由 coop_story_art.test.ts 的「舊快取」那條守。這裡守的還是同一件事：不可以配到單人版的鍵。
    setCoopStory({ partner: 'ninja' });
    const imgs = [...actClearSlides('dangdang', 1), ...actClearSlides('dangdang', 2), ...endingSlides('dangdang', [], 1)].map((s) => s.img);
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) expect(img, img).toMatch(/^bg\/dangdang_coop_ninja_/);
  });

  /*
   * 上面那條回空陣列之後，**一定要有這條頂著**：`[].every(...)` 是 `true`，
   * 少了 `length > 0` 那一半，「退回純對白」會變成「整段一個字都不播」。
   */
  it('空陣列算「圖沒到齊」，不然退回純對白會變成整段跳過', () => {
    expect(slidesReady([])).toBe(false);
  });

  it.each([
    ['ninja', 'bg/fengfeng_coop_ninja_prologue', 'bg/fengfeng_coop_ninja_top', 'bg/fengfeng_coop_ninja_victory'],
    ['feifei', 'bg/fengfeng_coop_feifei_prologue', 'bg/fengfeng_coop_feifei_top', 'bg/fengfeng_coop_feifei_victory'],
    ['dangdang', 'bg/fengfeng_coop_dangdang_prologue', 'bg/fengfeng_coop_dangdang_top', 'bg/fengfeng_coop_dangdang_victory'],
  ] as const)('封封與 %s 的雙席位都使用同一套序章、塔頂與結局圖', (partner, prologue, top, victory) => {
    setCoopStory({ partner });
    expect(prologueSlides('fengfeng')[0]?.img).toBe(prologue);
    expect(topSceneSlides('fengfeng')[0]?.img).toBe(top);
    expect(endingSlides('fengfeng', [], 1)[0]?.img).toBe(victory);
    expect(prologueSlides('fengfeng').flatMap((s) => s.lines)).toEqual(storyFor('fengfeng').prologue);

    setCoopStory({ partner: 'fengfeng' });
    expect(prologueSlides(partner)[0]?.img).toBe(prologue);
    expect(topSceneSlides(partner)[0]?.img).toBe(top);
    expect(endingSlides(partner, [], 1)[0]?.img).toBe(victory);
  });
});
