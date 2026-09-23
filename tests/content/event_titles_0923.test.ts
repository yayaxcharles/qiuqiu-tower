import { afterEach, describe, expect, it } from 'vitest';
import { setCoopStory } from '../../src/content/dialogue';
import { eventTextFor } from '../../src/content/event-text';
import { events } from '../../src/content/events';
import { HEROES } from '../../src/engine/hero';
import EVENT_RAW from '../../src/ui/screens/event.ts?raw';
import DEBUG_RAW from '../../src/ui/screens/debug.ts?raw';

/*
 * 事件標題也照角色換口吻（2026-09-23 主控裁定）。
 *
 * 原本標題直接印 `ev.title`：噹噹、封封走進 5F 看到的是「師父留下的秘笈」「師父的舊木箱」，
 * 走進「師父的影子」也一樣——他們跟大俠貓不是師徒，本文早就改成喊「大俠貓」，只剩標題漏掉。
 * 做法跟本文同一條：標題過 `eventTextFor`，噹噹、封封那兩張整段對照表多幾個標題的鍵；查不到就原樣。
 * 連線混搭照本機這一位（`eventTextFor` 本來就是照本機這一位）。
 * 顯示事件標題的地方只有事件畫面（名牌）與除錯總覽；地圖格、結算、圖鑑都不顯示事件標題（2026-09-23 查過）。
 */
afterEach(() => setCoopStory(null));

/** 這一位排得到的事件：共用的＋自己的專屬 */
const reachable = (hero: string) => events.filter((e) => !e.hero || e.hero === hero);

describe('事件標題照角色換口吻', () => {
  it.each(['dangdang', 'fengfeng'])('%s：讀到的所有事件標題都不喊「師父」，也不留球球的名字', (hero) => {
    const bad = reachable(hero).map((e) => eventTextFor(hero, e.title)).filter((t) => /師父|球球/u.test(t));
    expect(bad).toEqual([]);
  });

  it.each(['dangdang', 'fengfeng'])('%s：原本寫「師父」的那幾個換成「大俠貓」', (hero) => {
    const withMaster = events.filter((e) => !e.hero && e.title.includes('師父'));
    expect(withMaster.map((e) => e.id).sort(), '共用事件裡標題寫「師父」的就這三篇（多了要補對照）').toEqual(['daxia_chest', 'daxia_teach', 'old_master_ghost']);
    for (const e of withMaster) expect(eventTextFor(hero, e.title), e.id).toBe(e.title.replace('師父', '大俠貓'));
  });

  it.each(HEROES.flatMap((me) => HEROES.filter((p) => p !== me).map((p) => [me, p] as const)))(
    '連線混搭（%s＋%s）：照本機這一位', (me, partner) => {
      setCoopStory({ partner, mirror: partner });
      for (const e of events.filter((x) => !x.hero)) {
        const shown = eventTextFor(me, e.title);
        if (me === 'dangdang' || me === 'fengfeng') expect(shown, `${me}＋${partner} ${e.id}`).not.toMatch(/師父/u);
        else expect(shown, `${me}＋${partner} ${e.id}`).toBe(e.title);
      }
    });

  it('球球、菲菲的標題一個字都不動（菲菲本來就喊師父）', () => {
    for (const hero of ['ninja', 'feifei']) {
      for (const e of reachable(hero)) expect(eventTextFor(hero, e.title), `${hero} ${e.id}`).toBe(e.title);
    }
  });

  it('事件畫面與除錯總覽真的拿換過口吻的標題來印（沒接上的話上面幾條再綠也沒用）', () => {
    expect(EVENT_RAW).toMatch(/const title = eventTextFor\(me\(run, app\.seat\)\.hero, ev\.title\);/);
    expect(EVENT_RAW).not.toMatch(/const title = ev\.title;/);
    expect(DEBUG_RAW).toContain('eventTextFor(hero, e.title)');
  });
});
