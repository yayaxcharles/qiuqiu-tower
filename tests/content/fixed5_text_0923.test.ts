import { afterEach, describe, expect, it } from 'vitest';
import { setCoopStory } from '../../src/content/dialogue';
import { DANGDANG_EVENT_TEXT, FEIFEI_EVENT_LINES, FENGFENG_EVENT_TEXT, eventTextFor } from '../../src/content/event-text';
import { eventById } from '../../src/content/events';
import { HEROES } from '../../src/engine/hero';

/*
 * 5F 第二、三關那兩版的四份文字（2026-09-23 內容擴充第一批），照 `daxia_teach` 的寫法：
 * 球球原文在 `events.ts`；菲菲換名字＋引號句對照；噹噹、封封整段改寫。
 * 角色聲音（共同規則第 7 條）：噹噹跟大俠貓不是師徒、封封不講喵——兩位都喊「大俠貓」不喊「師父」。
 */
afterEach(() => setCoopStory(null));

const FIVE_F = ['daxia_chest', 'daxia_lastpage'];
const paragraphs = (id: string): string[] => {
  const e = eventById[id]!;
  return [e.text, ...e.choices.map((c) => c.result)];
};
const labels = (id: string): string[] => eventById[id]!.choices.map((c) => c.label);

describe('5F 兩版的四份文字', () => {
  it('噹噹、封封：每一段都有自己的整段改寫，講的是自己、喊的是大俠貓', () => {
    for (const [hero, table, name] of [['dangdang', DANGDANG_EVENT_TEXT, '噹噹'], ['fengfeng', FENGFENG_EVENT_TEXT, '封封']] as const) {
      for (const id of FIVE_F) {
        for (const p of paragraphs(id)) {
          expect(table[p], `${hero} 少了這段：${p.slice(0, 20)}`).toBeDefined();
          const shown = eventTextFor(hero, p);
          expect(shown).toContain(name);
          expect(shown, `${hero}：${shown}`).not.toMatch(/球球|喵|師父/u);
        }
        // 標籤裡寫「師父」的那顆也要換（按鈕跟正文一樣過 `eventTextFor`）
        for (const l of labels(id)) expect(eventTextFor(hero, l), `${hero} 的按鈕：${l}`).not.toContain('師父');
      }
    }
  });

  it('菲菲：每一句引號都有她自己的版本，敘述換成她的名字', () => {
    for (const id of FIVE_F) {
      for (const p of paragraphs(id)) {
        const m = /球球：「(.+?)」/su.exec(p);
        if (m) expect(FEIFEI_EVENT_LINES[m[1]!], `${id} 缺她那句：${m[1]}`).toBeDefined();
        const shown = eventTextFor('feifei', p);
        expect(shown).toContain('菲菲');
        expect(shown).not.toMatch(/球球|喵/u);
      }
    }
  });

  it('球球：結果句都是他開口、句尾帶喵；四隻讀到的每一段都不一樣（不是照抄換名字）', () => {
    for (const id of FIVE_F) {
      for (const c of eventById[id]!.choices) expect(c.result).toMatch(/球球：「[^」]+喵[！？。…]*」$/u);
      for (const p of paragraphs(id)) {
        const shown = HEROES.map((h) => eventTextFor(h, p));
        expect(new Set(shown).size, `${id}：${p.slice(0, 16)}`).toBe(4);
      }
    }
  });

  it.each(HEROES.flatMap((me) => HEROES.filter((p) => p !== me).map((p) => [me, p] as const)))(
    '連線混搭（%s＋%s）：5F 兩版沒有「同伴不在身邊」才成立的句子', (me, partner) => {
      setCoopStory({ partner, mirror: partner });
      const text = FIVE_F.flatMap((id) => [...paragraphs(id), ...labels(id)]).map((t) => eventTextFor(me, t)).join('\n');
      for (const bad of ['師兄', '師妹', '還沒回來', '沒回村', '找不到', '朋友', '他們']) {
        expect(text, `${me}＋${partner} 讀到「${bad}」`).not.toContain(bad);
      }
    });
});
