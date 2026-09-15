import { describe, expect, it } from 'vitest';
import { FEIFEI_EVENT_TEXT, eventTextFor, feifeiDialogue, storyFor } from '../../src/content/dialogue';
import { eventById, events } from '../../src/content/events';

/*
 * 使用者 2026-09-14 早上裁定的四件事，照「改回去要紅」寫。
 */

/*
 * 2026-09-14 使用者裁定「鏡子裡是長得像師兄的假貨」；**2026-09-15 改回「鏡中的自己」**——
 * 使用者決定做影菲菲（鏡貓照被抄那位換外觀、也學她的毒針牌），假師兄的框架不成立了。
 */
describe('鏡子走廊：對菲菲來說，鏡子裡是鏡中的自己（影菲菲）', () => {
  const ev = eventById['mirror_hall']!;
  const all = [ev.text, ...ev.choices.flatMap((c) => [c.label, c.result])];

  it('她看到的敘述、選項、結果都在講鏡中的自己，不再是假師兄', () => {
    const hers = all.map((t) => eventTextFor('feifei', t));
    expect(hers.join('\n')).not.toMatch(/師兄/);   // 鏡子裡是她自己，不是師兄（文案由 GPT 改寫，這裡只釘規矩不釘句子）
    expect(eventTextFor('feifei', ev.text)).toMatch(/倒影|鏡/);
    expect(eventTextFor('feifei', ev.choices[0]!.label)).toContain('鏡中的自己');
    expect(hers.join('\n'), '她的句子不帶喵').not.toContain('喵');
    expect(hers.join('\n'), '球球的名字不能留在她的版本裡').not.toContain('球球');
  });

  it('球球那邊一個字都不動', () => {
    for (const t of all) expect(eventTextFor('ninja', t)).toBe(t);
  });

  it('整句換掉的表，每個鍵都還對得到事件裡的原句（改了球球的字會靜靜失效，所以要盯著）', () => {
    const originals = new Set(events.flatMap((e) => [e.text, ...e.choices.flatMap((c) => [c.label, c.result])]));
    for (const k of Object.keys(FEIFEI_EVENT_TEXT)) expect(originals.has(k), k).toBe(true);
  });

  it('塔頂的影球球（shadow_cat）還是師兄的影子；鏡子走廊那隻對她是鏡中的自己', () => {
    const fm = storyFor('feifei').firstMeet;
    expect(fm['shadow_cat'] ?? '').toContain('師兄');
    expect(fm['mirror_qiuqiu'] ?? '').not.toContain('師兄');
  });
});

describe('師兄的痕跡：標籤照實際效果寫', () => {
  it('第二個選項寫的是扣血、隨機罕見忍術牌、60 條小魚乾，不再寫「下一場更強、小魚乾加倍」', () => {
    const c = eventById['feifei_trace']!.choices[1]!;
    expect(c.label).not.toMatch(/更強|加倍/);
    expect(c.label).toContain('5 點生命');
    expect(c.label).toContain('罕見忍術牌');
    expect(c.label).toContain('60 條小魚乾');
  });
});

describe('全破之後結算畫面的最後一句', () => {
  it('不再是普通戰鬥收尾的「毒疊好了……那我就先走囉」，句尾也不帶喵', () => {
    expect(feifeiDialogue.victoryTeaser).not.toContain('毒疊好了');
    expect(feifeiDialogue.victoryTeaser).not.toContain('喵');
  });
});
