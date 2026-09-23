import { describe, expect, it } from 'vitest';
import { BLESSINGS, BLESS_CLASSES } from '../../src/content/blessings';
import { BLESS_COOP_TOOK, BLESS_COOP_WAIT, BLESS_NAMES, BLESS_OPENING, blessCardText, blessTakeLine } from '../../src/content/blessing-text';
import { HEROES } from '../../src/engine/hero';
import type { RunEffect } from '../../src/engine/types';

/**
 * 開局祝福的文字（2026-09-23 第三批，設計稿 2-2、2-4）。
 * 卡面的數字要跟 `blessings.ts` 的效果對得上（量尺之後調過七處數字，文字漏改就是圖文不符）；
 * 噹噹的卡面寫「拳腳」不寫「忍術」（主控裁決第 10 條）；四隻的台詞照各自的口吻。
 */
const CN = '零一二三四五六七八九十';

/** 這一樣效果裡寫在卡面上的數字（照效果種類挑：生命上限、小魚乾、忍具、掉血、連幾場、幾層、挑幾張、幾成） */
function numbers(effects: readonly RunEffect[]): string[] {
  const out: string[] = [];
  for (const fx of effects) {
    if (fx.kind === 'maxHp' || fx.kind === 'fish' || fx.kind === 'potions' || fx.kind === 'damage') out.push(String(Math.abs(fx.n)));
    if (fx.kind === 'nextFight') { out.push(String(fx.fights ?? 1)); for (const e of fx.effects) if (e.kind === 'status') out.push(String(e.amount)); }
    if (fx.kind === 'gamble') { out.push(`${CN[Math.round(fx.p * 10)]}成`, `${CN[Math.round((1 - fx.p) * 10)]}成`, ...numbers(fx.win), ...numbers(fx.lose)); }
  }
  return out;
}

describe('卡面', () => {
  it('每一樣都有名字與說明，四隻都看得到', () => {
    for (const b of BLESSINGS) {
      expect(BLESS_NAMES[b.id], b.id).toBeTruthy();
      for (const h of HEROES) expect(blessCardText(b.id, h).length, `${b.id}/${h}`).toBeGreaterThan(5);
    }
  });

  it('卡面的數字跟效果對得上（調數字時文字要跟著改）', () => {
    for (const b of BLESSINGS) {
      const text = blessCardText(b.id, 'ninja');
      const want = [...numbers(b.effects), ...(b.dice ?? []).flatMap((t) => numbers(t.effects))];
      if (b.pick) want.push(String(b.pick.n));
      for (const n of want) expect(text, `${b.id} 的卡面少了「${n}」`).toContain(n);
    }
    // 兩張壞毛病那一句要寫「2 張」（第一輪量尺之後從 1 張改的）
    expect(blessCardText('bless_treasure', 'ninja')).toContain('2 張壞毛病');
  });

  it('噹噹的卡面寫「拳腳」、一個「忍術」都沒有；其他三隻照事件的講法寫「忍術」', () => {
    for (const b of BLESSINGS) expect(blessCardText(b.id, 'dangdang'), b.id).not.toContain('忍術');
    expect(blessCardText('bless_moves', 'dangdang')).toContain('稀有拳腳牌');
    expect(blessCardText('bless_scroll', 'dangdang')).toContain('稀有拳腳牌');
    for (const h of ['ninja', 'feifei', 'fengfeng']) expect(blessCardText('bless_moves', h)).toContain('稀有忍術牌');
  });

  it('系統口吻：卡面不加喵、不指名角色', () => {
    for (const b of BLESSINGS) for (const h of HEROES) {
      const t = blessCardText(b.id, h);
      expect(t, b.id).not.toContain('喵');
      for (const name of ['球球', '菲菲', '噹噹', '封封']) expect(t, b.id).not.toContain(name);
    }
  });
});

describe('台詞', () => {
  const linesOf = (h: string): string[] => [BLESS_OPENING[h as keyof typeof BLESS_OPENING].line,
    ...BLESS_CLASSES.map((c) => blessTakeLine('bless_coins', c, h)), blessTakeLine('bless_box', '代價', h), blessTakeLine('bless_bracer', '代價', h)];

  it('四隻都有開場（旁白＋一句）與每一類的那一句；空的寶盒、舊護腕有自己的一句', () => {
    for (const h of HEROES) {
      expect(BLESS_OPENING[h].narration.length, h).toBeGreaterThan(20);
      for (const line of linesOf(h)) expect(line.length, h).toBeGreaterThan(2);
      expect(blessTakeLine('bless_box', '代價', h)).not.toBe(blessTakeLine('bless_stash', '代價', h));
    }
  });

  it('球球每一句最後一個字是「喵」；另外三隻一句都不講喵', () => {
    for (const line of linesOf('ninja')) expect(line.replace(/[。！？……，、]+$/u, '').at(-1), line).toBe('喵');
    for (const h of ['feifei', 'dangdang', 'fengfeng']) {
      for (const line of linesOf(h)) expect(line, `${h}：${line}`).not.toContain('喵');
      expect(BLESS_OPENING[h as 'feifei'].narration).not.toContain('喵');
    }
  });

  it('噹噹、封封叫「大俠貓」不叫「師父」（噹噹跟大俠貓不是師徒）；菲菲叫「師父」', () => {
    for (const h of ['dangdang', 'fengfeng']) {
      const all = [BLESS_OPENING[h as 'dangdang'].narration, ...linesOf(h)].join('');
      expect(all, h).not.toContain('師父');
      expect(all, h).toContain('大俠貓');
    }
    expect([BLESS_OPENING.feifei.narration, ...linesOf('feifei')].join('')).toContain('師父');
  });

  it('連線提示有兩個記號可以換', () => {
    expect(BLESS_COOP_TOOK).toContain('{同伴}');
    expect(BLESS_COOP_TOOK).toContain('{名稱}');
    expect(BLESS_COOP_WAIT).toContain('{同伴}');
  });
});
