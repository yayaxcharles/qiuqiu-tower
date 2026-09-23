import { describe, expect, it } from 'vitest';
import EVENT_RAW from '../../src/ui/screens/event.ts?raw';

/*
 * 事件畫面的兩處收尾（2026-09-23 b2fin，第二批事件的收尾清單）。倉庫測試不能開 DOM，照原始碼守接線；
 * 行為本身在 `tests/engine/event_relic_ids_0923.test.ts`（舊木劍說明寫集到幾件）與
 * `tests/engine/cond_result_seat_0923.test.ts`（條件選項照誰的版本寫）。
 */
const EV = EVENT_RAW.replace(/\r\n/g, '\n');
/** 從 `head` 那一行到它的收尾（照縮排找：頂層函式收在 `\n}\n`，畫面裡的內部函式收在 `\n  }\n`，箭頭函式多一個分號） */
function body(head: string, indent = '', semi = ''): string {
  const i = EV.indexOf(head);
  expect(i, `找不到 ${head}`).toBeGreaterThanOrEqual(0);
  const j = EV.indexOf(`\n${indent}}${semi}\n`, i);
  expect(j, `${head} 找不到收尾`).toBeGreaterThan(i);
  return EV.slice(i, j);
}

describe('「拿到了什麼」那一欄的秘寶說明走 relicLongText（師門寫集到幾件）', () => {
  it('說明只有一個出口：秘寶走 relicLongText、照身上現在的秘寶數', () => {
    expect(body('function gainText(')).toContain('relicLongText(r, owned)');
  });

  it('放大彈出的那一顆、對白框那一列都用它，不再直接寫 d.text', () => {
    for (const f of ['function gainsNode(', 'function gainRows(']) {
      const b = body(f);
      expect(b, f).toContain('gainText(g, owned)');
      expect(b, f).not.toMatch(/\bd\.text\b/);
    }
  });

  it('兩處都傳本機這一位身上的秘寶（效果已經套完，剛拿到的那件也算）', () => {
    expect(EV).toContain('gainsNode(gains, me(run, seat).relics)');
    expect(EV).toContain('gainRows(gains, me(run, seat).relics)');
  });
});

describe('連線時同伴讓條件選項出現：結果文字寫同伴做的事', () => {
  it('take() 先問 resultSeat、再套效果（鈴鐺那條套完就問不到了）', () => {
    const take = body('  function take(index: number): void {', '  ');
    const ask = take.indexOf('resultHero = me(run, resultSeat(run, c, seat)).hero;');
    expect(ask, 'take() 沒有問照誰的版本寫').toBeGreaterThan(0);
    expect(ask, '套完效果才問').toBeLessThan(take.indexOf('applyRunEffects('));
  });

  it('三條結果路（一般結算、連線學招、連線學招都不要）都照 resultHero 寫；沒有漏掉的', () => {
    expect(EV).toContain('const resultText = evText(rawResult, resultHero);');
    expect(EV.split('evText(raw, resultHero)').length - 1).toBe(2);
    expect(EV).not.toMatch(/evText\(raw(?:Result)?\)/);
  });

  it('evText 的角色參數只換「照誰的版本」，連線的稱呼記號照舊站在本機這一位', () => {
    const f = body('  const evText = (t: string, hero = me(run, seat).hero): string => {', '  ', ';');
    expect(f).toContain('eventTextFor(hero, t)');
    expect(f).toContain('coopFill(mine, me(run, seat).hero, partner.hero)');
  });
});
