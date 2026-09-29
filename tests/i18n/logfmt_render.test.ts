/**
 * 戰鬥紀錄照語言顯示（多語系第二片，2026-09-29）：引擎寫的是「句型＋參數」，畫面用 `logLine(中文句)` 查回來重組。
 * 這裡釘住三種容易漏出中文的寫法：數量詞（伏兵幾隻）、清單裡的小句型（一半的中毒）、帶數字的小句型（2 點爪力）。
 * 繁中永遠是原本那句一字不差；英日不能夾中文量詞、也不能留著「一半的」「點」。
 */
import { afterAll, describe, expect, it } from 'vitest';
import { _setPackForTest } from '../../src/i18n';
import en from '../../src/i18n/en/index';
import ja from '../../src/i18n/ja/index';
import { logLine } from '../../src/i18n/speech';
import { E, log, type LogArg } from '../../src/engine/logfmt';
import type { CombatState } from '../../src/engine/types';

const wolf: LogArg = E({ enemyId: 'yarn_ball', name: '毛線球怪' });

/** 引擎寫紀錄（紀錄本身永遠是繁中） */
function written(): string[] {
  _setPackForTest('zh', null);
  const cs = { log: [] } as unknown as CombatState;
  log(cs, '伏兵！{n} 隻{e}從煙裡跳了出來', { n: 2, e: wolf });
  log(cs, '伏兵！{e}從煙裡跳了出來', { e: wolf });
  log(cs, '{e}調息之際把身上的{ls}化掉了', { e: wolf, ls: { ls: [{ tx: '一半的中毒' }, { st: '定身' }] } });
  log(cs, '{e}震散了{who} {parts}', {
    e: wolf, who: { tx: '你' },
    parts: { ls: [{ sub: '{n} 點{st}', p: { n: 2, st: { st: '爪力' } } }, { sub: '{n} 點{st}', p: { n: 1, st: { st: '貓步' } } }] },
  });
  return cs.log;
}

afterAll(() => _setPackForTest('zh', null));

describe('戰鬥紀錄照語言顯示', () => {
  it('繁中：跟改版前的句子一字不差', () => {
    expect(written()).toEqual([
      '伏兵！2 隻毛線球怪從煙裡跳了出來',
      '伏兵！毛線球怪從煙裡跳了出來',
      '毛線球怪調息之際把身上的一半的中毒、定身化掉了',
      '毛線球怪震散了你 2 點爪力、1 點貓步',
    ]);
  });
  it('英文：數量與單位照句型、沒有中文', () => {
    const zh = written();
    _setPackForTest('en', en);
    expect(zh.map(logLine)).toEqual([
      'Ambush! 2 × Yarn Ball Monster jumped out of the smoke',
      'Ambush! Yarn Ball Monster jumped out of the smoke',
      'Yarn Ball Monster cleared its half of the Poison, Stun while recovering',
      'You had 2 Claw, 1 Catstep shaken loose by Yarn Ball Monster',
    ]);
  });
  it('日文：沒有中文量詞、「一半的」、「點」', () => {
    const zh = written();
    _setPackForTest('ja', ja);
    expect(zh.map(logLine)).toEqual([
      '伏兵だ！毛糸玉怪が2匹、煙の中から飛び出した',
      '伏兵だ！毛糸玉怪が煙の中から飛び出した',
      '毛糸玉怪は息を整えるうちに、身にかかった毒の半分・金縛りを消し去った',
      '毛糸玉怪はあなたの爪力2点・猫足1点をふるい落とした',
    ]);
  });
});
