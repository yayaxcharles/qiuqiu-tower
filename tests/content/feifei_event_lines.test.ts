import { describe, expect, it } from 'vitest';
import { FEIFEI_EVENT_LINES, eventTextFor, feifeiLineOk } from '../../src/content/dialogue';
import { events } from '../../src/content/events';

/**
 * **共用事件裡她講的話，她自己的版本**（2026-09-13 使用者逐句改寫交回 82 句）。
 *
 * 這批以前只做「球球→菲菲」加拿掉句尾的「喵」，於是她會講出
 *「價錢讓我心疼，藥倒是有下本。」——那是球球在賣藥三花貓那個事件的台詞。
 * 使用者實測看到的原話是「我覺得好奇怪」。
 *
 * 跟 `FEIFEI_BOSS_LINES` 同一套作法，也繼承同一個脆弱處：
 * **鍵是球球的原句，改了 `events.ts` 裡的字，她這邊會靜靜掉回舊行為、不報錯**。
 * 所以這裡盯的是「每個鍵都還真的找得到對應的原句」。
 */

/** `events.ts` 裡球球開口講的每一句（共用事件才算，她的專屬事件本來就是照她寫的） */
function spokenByQiuqiu(): string[] {
  const out: string[] = [];
  const grab = (text: string): void => {
    const m = /球球：「(.+?)」/su.exec(text);
    if (m) out.push(m[1]!);
  };
  for (const e of events) {
    if (e.hero) continue;
    grab(e.text);
    for (const c of e.choices) if (c.result) grab(c.result);
  }
  return out;
}

describe('共用事件台詞的她版', () => {
  const theirs = spokenByQiuqiu();

  it('抓得到球球那批（抓不到的話底下每一條都是空測）', () => {
    expect(theirs.length, '一句都沒抓到，正規式或文案格式改過了').toBeGreaterThan(60);
  });

  it('她這邊沒有多出來的鍵（球球那邊改過字就會對不上）', () => {
    const set = new Set(theirs);
    const orphan = Object.keys(FEIFEI_EVENT_LINES).filter((k) => !set.has(k));
    expect(orphan, `這幾個鍵在 events.ts 裡找不到對應的原句（是不是改過字？）：\n  ${orphan.join('\n  ')}`).toEqual([]);
  });

  /*
   * **現在要求一句都不能漏**（使用者 2026-09-14：原本維持原樣的 6 句「可以先做」，補完了）。
   * 以前留那 6 句時刻意只要求九成；現在全數補齊，之後新加的事件台詞沒寫她的版本就會變紅。
   */
  it('每一句都有她自己的版本', () => {
    const missing = theirs.filter((t) => FEIFEI_EVENT_LINES[t] === undefined);
    expect(missing, `沒寫她的版本的有 ${missing.length}／${theirs.length} 句`).toEqual([]);
  });

  it('沒有一句原封不動照抄，也沒有只拿掉「喵」了事', () => {
    const lazy = Object.entries(FEIFEI_EVENT_LINES)
      .filter(([k, v]) => v === k || v === k.replace(/喵(?=[！？。…～、,.!?]*$)/u, ''));
    expect(lazy.map(([k]) => k), '這幾句等於沒改').toEqual([]);
  });

  it('她不講「喵」，也不自稱球球', () => {
    const bad = Object.entries(FEIFEI_EVENT_LINES)
      .filter(([, v]) => !feifeiLineOk(v) || v.includes('喵') || v.includes('球球'));
    expect(bad.map(([, v]) => v)).toEqual([]);
  });

  it('`eventTextFor` 真的會換過去，球球那邊一個字都沒動', () => {
    for (const e of events) {
      if (e.hero) continue;
      for (const raw of [e.text, ...e.choices.map((c) => c.result ?? '')]) {
        if (!raw) continue;
        expect(eventTextFor('ninja', raw), '球球那邊被動到了').toBe(raw);
        expect(eventTextFor(undefined, raw)).toBe(raw);
        const m = /球球：「(.+?)」/su.exec(raw);
        const mine = m ? FEIFEI_EVENT_LINES[m[1]!] : undefined;
        if (mine) expect(eventTextFor('feifei', raw)).toContain(`菲菲：「${mine}」`);
      }
    }
  });

  /** 使用者實測抓到的那一句，單獨釘住 */
  it('賣藥的三花貓：她不會講「藥倒是有下本」', () => {
    const ev = events.find((e) => e.id === 'medicine_cat')!;
    const buy = ev.choices.find((c) => c.result?.includes('有下本'))!;
    const shown = eventTextFor('feifei', buy.result!);
    expect(shown, '還是球球的那句').not.toContain('下本');
    expect(shown).toContain('菲菲：「');
  });

  it('敘述句照樣換名字（這一半本來就對，別改壞）', () => {
    const ev = events.find((e) => e.id === 'medicine_cat')!;
    expect(eventTextFor('feifei', ev.choices[0]!.result!)).not.toContain('球球');
  });
});
