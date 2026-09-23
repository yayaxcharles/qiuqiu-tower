import { describe, expect, it } from 'vitest';
import {
  DANGDANG_EVENT_TEXT, EVENT_COND_HINTS, FEIFEI_EVENT_TEXT, FENGFENG_EVENT_TEXT, condHint, coopFill, eventTextFor, flagWhy,
} from '../../src/content/event-text';
import { eventById } from '../../src/content/events';
import { batch2Events } from '../../src/content/events-batch2';
import { HEROES, heroName } from '../../src/engine/hero';

/*
 * 內容擴充第二批的事件文字（2026-09-23，劇本 design2 照抄）：
 * 四隻各一份、連線兩人版的稱呼、條件提示句。改回壞寫法（少一段、稱呼寫錯、提示句漏一隻）都要紅。
 */
const OTHERS = ['feifei', 'dangdang', 'fengfeng'] as const;
const TABLE = { feifei: FEIFEI_EVENT_TEXT, dangdang: DANGDANG_EVENT_TEXT, fengfeng: FENGFENG_EVENT_TEXT } as const;
const COND_EVENTS = ['sleeping_guard', 'medicine_cat', 'sparring_cat', 'heavy_door', 'greedy_merchant',
  'old_master_ghost', 'lost_kitten', 'noisy_kitchen', 'pigeon_reply', 'shadow_truth'];

/** 這篇（或條件選項）球球那份的每一段：開頭與每個選項的結果 */
function segments(id: string, condOnly = false): string[] {
  const ev = eventById[id]!;
  const cs = condOnly ? ev.choices.filter((c) => c.requires) : ev.choices;
  return [...(condOnly ? [] : [ev.text]), ...cs.map((c) => c.result)];
}

describe('新事件四隻各一份（整段換掉，不是換名字）', () => {
  it('十八篇都接上了', () => {
    expect(batch2Events.map((e) => e.id)).toEqual(['pigeon_lost', 'pigeon_grandpa', 'pigeon_reply', 'shadow_loose',
      'shadow_study', 'shadow_truth', 'cell_bandit', 'rat_bathhouse', 'bear_cellar', 'library_ladder', 'tower_kitchen',
      'wooden_men_alley', 'fallen_star', 'wind_chimes', 'miasma_crystal', 'coop_rope_bridge', 'coop_seesaw', 'coop_shooting_star']);
    for (const e of batch2Events) expect(eventById[e.id]).toBe(e);
  });

  it.each(OTHERS)('%s：每一段都有自己的版本、寫的是自己的名字', (hero) => {
    const name = heroName({ hero });
    const ids = [...batch2Events.map((e) => [e.id, false] as const), ...COND_EVENTS.slice(0, 8).map((id) => [id, true] as const)];
    for (const [id, condOnly] of ids) {
      for (const raw of segments(id, condOnly)) {
        expect(TABLE[hero][raw], `${hero} ${id} 少一段：${raw.slice(0, 20)}`).toBeTruthy();
        const shown = eventTextFor(hero, raw);
        expect(shown).not.toBe(raw);
        expect(shown, `${hero} ${id}`).toContain(name);
        expect(shown, `${hero} ${id} 還有球球開口`).not.toContain('球球：「');
      }
    }
  });

  it('球球那份：開頭與結果裡他講的每一句句尾都是喵', () => {
    for (const e of batch2Events) {
      for (const t of [e.text, ...e.choices.map((c) => c.result)]) {
        for (const q of t.match(/球球：「([^」]+)」/g) ?? []) expect(q.replace(/[！？。…～」]+$/u, ''), `${e.id}: ${q}`).toMatch(/喵$/u);
      }
    }
  });

  it('噹噹、封封喊大俠貓、不喊師父（標籤裡「師父的斗笠」是秘寶的名字，不算）', () => {
    for (const hero of ['dangdang', 'fengfeng'] as const) {
      for (const e of batch2Events) for (const raw of [e.text, ...e.choices.map((c) => c.result)]) {
        expect(eventTextFor(hero, raw), `${hero} ${e.id}`).not.toContain('師父');
      }
    }
  });

  it('噹噹的選項標籤只換「忍術牌」→「拳腳牌」那兩處；其他人的標籤跟球球一樣', () => {
    for (const e of batch2Events) for (const c of e.choices) {
      const dd = eventTextFor('dangdang', c.label);
      if (c.label.includes('忍術牌')) expect(dd).toBe(c.label.replace('忍術牌', '拳腳牌'));
      else expect(dd).toBe(c.label);
      expect(eventTextFor('feifei', c.label)).toBe(c.label);
      expect(eventTextFor('fengfeng', c.label)).toBe(c.label);
    }
  });
});

describe('條件提示句（新1）：四隻各一句，照讓條件成立的那一位挑', () => {
  it('十篇條件選項、四隻都有', () => {
    expect(Object.keys(EVENT_COND_HINTS).sort()).toEqual([...COND_EVENTS].sort());
    for (const id of COND_EVENTS) for (const hero of HEROES) expect(condHint(id, hero), `${id} ${hero}`).toBeTruthy();
    expect(condHint('toll', 'ninja'), '沒有條件選項的事件沒有提示句').toBe('');
  });

  it('提示句寫的是那一位（名字對、另外三隻不講喵）', () => {
    for (const id of COND_EVENTS) for (const hero of OTHERS) {
      const h = condHint(id, hero);
      expect(h, `${id} ${hero}`).not.toContain('喵');
      if (id !== 'pigeon_reply') expect(h, `${id} ${hero}`).toContain(heroName({ hero }));
    }
    expect(condHint('medicine_cat', 'feifei'), '菲菲那份用「妳」').toContain('妳肯的話');
    expect(condHint('noisy_kitchen', 'dangdang')).toBe('噹噹的忍具袋塞得滿滿的，蓋子都闔不上。灶邊的紙條下面，還有一行小字：「留一樣東西給下一個人，湯裡就多加一塊肉。」');
  });

  it('影子的真面目：球球的第二集是屋頂那篇（新9），提示句講屋脊，不講練功房', () => {
    expect(condHint('shadow_truth', 'ninja')).toContain('屋脊後面');
    expect(condHint('shadow_truth', 'ninja')).not.toContain('練功房');
    expect(condHint('shadow_truth', 'feifei')).toContain('門縫外');
  });

  it('旗標型的「因為…」寫得出來', () => {
    expect(flagWhy('chain:pigeon_wrote')).toBe('替爺爺寫過回信');
    expect(flagWhy('chain:shadow_2_watched')).toBeTruthy();
    expect(flagWhy('沒有這個')).toBe('');
  });
});

describe('連線限定事件的稱呼（新7，劇本 design2 第二節的表）', () => {
  const coop = batch2Events.filter((e) => e.coopOnly);

  it('師兄妹互稱、其他叫名字；同角色配對旁白寫「同伴」、開頭的稱呼連逗號拿掉', () => {
    expect(coopFill('{同伴}拉繩。球球：「{稱}，誰過去喵？」', 'ninja', 'feifei')).toBe('菲菲拉繩。球球：「師妹，誰過去喵？」');
    expect(coopFill('{同伴}拉繩。菲菲：「{稱}，怎麼辦？」', 'feifei', 'ninja')).toBe('球球拉繩。菲菲：「師兄，怎麼辦？」');
    expect(coopFill('替{對方}許的', 'dangdang', 'fengfeng')).toBe('替封封許的');
    expect(coopFill('{同伴}拉繩。「{稱}，誰過去喵？」替{對方}許的', 'ninja', 'ninja')).toBe('同伴拉繩。「誰過去喵？」替你許的');
    expect(coopFill('沒有記號的句子', 'ninja', 'feifei')).toBe('沒有記號的句子');
  });

  it.each(HEROES.flatMap((me) => HEROES.map((mate) => [me, mate] as const)))('%s＋%s：每一段換完都沒有留下記號', (me, mate) => {
    for (const e of coop) {
      for (const raw of [e.text, ...e.choices.flatMap((c) => [c.label, c.result])]) {
        const shown = coopFill(eventTextFor(me, raw), me, mate);
        expect(shown, `${e.id}：${shown.slice(0, 30)}`).not.toMatch(/[{}]/);
        if (me !== 'ninja') expect(shown).not.toContain('喵');
      }
    }
  });

  it('標籤兩式：「我拿」那個以「我」開頭、「我付」那個以同伴開頭', () => {
    for (const e of coop) {
      expect(e.choices[0]!.label.startsWith('我'), e.id).toBe(true);
      expect(/^(\{同伴\}|讓\{同伴\})/.test(e.choices[1]!.label), e.id).toBe(true);
    }
  });
});
