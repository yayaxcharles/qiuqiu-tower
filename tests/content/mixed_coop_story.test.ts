import { afterEach, describe, expect, it } from 'vitest';
import {
  FEIFEI_TA, dialogue, eventTextFor, feifeiDialogue, lineFor, setCoopStory, storyFor,
} from '../../src/content/dialogue';
import { events, eventById } from '../../src/content/events';

/**
 * 使用者 2026-09-16 裁定的三件（總稽核第五節）：
 * ① 連線混搭（兩個人不同角色）時，個人主線裡「同伴不在身邊」的句子要換掉；鏡子走廊照座位 0 變裝，坐 1 號讀到的要是「假的同伴」。
 * ③ 事件旁白裡指菲菲的「牠」改「她」，別的貓照舊。
 */
afterEach(() => setCoopStory(null));

describe('連線混搭的敘事', () => {
  it('單機與同角色雙人完全不受影響（陣列參照都不動）', () => {
    setCoopStory(null);
    expect(storyFor('ninja').firstMeet).toBe(dialogue.firstMeet);
    expect(storyFor('feifei').victory).toBe(feifeiDialogue.victory);
    setCoopStory({ partner: 'feifei', mirror: 'feifei' });
    expect(storyFor('feifei').victory, '同伴跟自己一樣就當作沒有同伴').toBe(feifeiDialogue.victory);
  });

  it('菲菲配球球：師兄在身邊的那幾句換掉', () => {
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    const s = storyFor('feifei');
    const all = [...s.actClear1, ...s.actClear2, ...s.defeat, ...s.victory].map((l) => l.text).join('\n');
    expect(all, '師兄就在旁邊，不能再說沒消息、不知道在哪').not.toMatch(/連個消息都沒有|你到底在哪裡|師父和球球仍沒有回來/);
    expect(all).toContain('師兄，你也聽見了吧？');
    expect(s.defeat.map((l) => l.text).join('\n')).toContain('還沒……把師父帶回來……');
    // 關主台詞與事件裡那兩句也換
    expect(lineFor('feifei', '婆婆，我也想回去。可是家裡少了兩個人，我不能就這樣走。')).toContain('師父還在上面');
    expect(eventTextFor('feifei', eventById['moon_window']!.choices[0]!.result!)).not.toContain('師父、師兄……你們那邊');
  });

  it('球球配菲菲：結局與後日談不再只寫師徒倆', () => {
    setCoopStory({ partner: 'feifei', mirror: 'feifei' });
    const s = storyFor('ninja');
    expect(s.victory.map((l) => l.text).join('\n')).toContain('三個人帶著找回的小魚乾');
    expect(s.hardModeEpilogue).not.toContain('常向師妹講起');
  });

  it('鏡子走廊：坐 1 號、鏡中照的是同伴時，讀到的是「假的同伴」版', () => {
    const ev = eventById['mirror_hall']!;
    const all = (hero: string): string => [ev.text, ...ev.choices.flatMap((c) => [c.label, c.result ?? ''])].map((t) => eventTextFor(hero, t)).join('\n');
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    const hers = all('feifei');
    expect(hers, '出現的是鏡中球球，不能寫成鏡中的自己').not.toMatch(/鏡中的菲菲|鏡中的自己/);
    expect(hers).toContain('假師兄');
    setCoopStory({ partner: 'feifei', mirror: 'feifei' });
    const his = all('ninja');
    expect(his).toContain('假師妹');
    expect(his, '他的句子照樣要有喵').toMatch(/喵/);
    // 自己就是座位 0（鏡中照自己）時照舊
    setCoopStory({ partner: 'ninja', mirror: 'feifei' });
    expect(all('feifei')).toContain('鏡中的自己');
  });
});

describe('指她的「牠」換成「她」', () => {
  it('每個片語在事件裡都剛好出現一次（改到別人身上會紅）', () => {
    const src = events.flatMap((e) => [e.text, ...e.choices.flatMap((c) => [c.label, c.result ?? ''])]).join('\n');
    for (const key of Object.keys(FEIFEI_TA)) {
      expect(src.split(key).length - 1, key).toBe(1);
    }
  });

  it('她看到的那幾句不再用「牠」指自己；球球那邊一個字都不動', () => {
    for (const e of events) {
      if (e.hero) continue;
      for (const t of [e.text, ...e.choices.map((c) => c.result ?? '')]) {
        const hers = eventTextFor('feifei', t);
        for (const key of Object.keys(FEIFEI_TA)) expect(hers, `${e.id} 還在用牠指她`).not.toContain(key);
        expect(eventTextFor('ninja', t)).toBe(t);
      }
    }
  });

  it('別的貓還是「牠」（村貓、母貓、老鼠）', () => {
    // 「替牠包好傷口」的牠是受傷的村貓，不是她；這種不能跟著改
    expect(eventTextFor('feifei', eventById['rescue']!.text)).toContain('替牠包好傷口');
    expect(eventTextFor('feifei', eventById['gambling_rats']!.text)).toContain('牠們連忙招手');
  });
});
