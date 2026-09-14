import { describe, expect, it } from 'vitest';
import { FEIFEI_EVENT_TEXT, eventTextFor, feifeiDialogue, storyFor } from '../../src/content/dialogue';
import { eventById, events } from '../../src/content/events';

/*
 * 使用者 2026-09-14 早上裁定的四件事，照「改回去要紅」寫。
 */

describe('鏡子走廊：對菲菲來說，鏡子裡是長得像師兄的假貨', () => {
  const ev = eventById['mirror_hall']!;
  const all = [ev.text, ...ev.choices.flatMap((c) => [c.label, c.result])];

  it('她看到的敘述、選項、結果都在講假的師兄，不是「鏡中的自己」', () => {
    const hers = all.map((t) => eventTextFor('feifei', t));
    expect(hers.join('\n')).not.toMatch(/鏡中的菲菲|鏡中的自己|這麼多個我/);
    expect(eventTextFor('feifei', ev.text)).toContain('師兄');
    expect(eventTextFor('feifei', ev.choices[0]!.label)).toContain('假師兄');
    expect(hers.join('\n'), '她的句子不帶喵').not.toContain('喵');
  });

  it('球球那邊一個字都不動', () => {
    for (const t of all) expect(eventTextFor('ninja', t)).toBe(t);
  });

  it('整句換掉的表，每個鍵都還對得到事件裡的原句（改了球球的字會靜靜失效，所以要盯著）', () => {
    const originals = new Set(events.flatMap((e) => [e.text, ...e.choices.flatMap((c) => [c.label, c.result])]));
    for (const k of Object.keys(FEIFEI_EVENT_TEXT)) expect(originals.has(k), k).toBe(true);
  });

  it('影球球的初見台詞也對齊：是假的師兄，不是「那是……我？」', () => {
    const line = storyFor('feifei').firstMeet['shadow_cat'] ?? '';
    expect(line).toContain('師兄');
    expect(line).not.toContain('那是……我');
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
