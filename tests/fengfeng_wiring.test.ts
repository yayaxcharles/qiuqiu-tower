import { beforeEach, describe, expect, it } from 'vitest';
import { FENGFENG_STARTER_DECK } from '../src/content/cards';
import { setCoopStory, storyFor, victoryLinesFor } from '../src/content/dialogue';
import { enemyArtFor, enemyById, enemyNameFor, enemySkin } from '../src/content/enemies';
import { fengfengSelection, fengfengVictoryVariants } from '../src/content/fengfeng-dialogue';
import { startCombat } from '../src/engine/combat';
import { Rng, seedFromString } from '../src/engine/rng';
import { endingSlides } from '../src/ui/storyslides';
import HEROSELECT_SRC from '../src/ui/screens/heroselect.ts?raw';
import { inst } from './helpers';

/*
 * 封封寫好卻沒接上的內容（2026-09-22 接線）。
 *
 * 這幾條在接線之前都是紅的：選角介紹有兩份、結局沒有打法插句、
 * 鏡子走廊對他派出來的是「鏡中球球」。
 */

beforeEach(() => setCoopStory(null));

describe('選角介紹只留一份', () => {
  const blurb = fengfengSelection[0]!.text;

  it('選角畫面讀封封台詞檔那一句，不自己再抄一份', () => {
    expect(fengfengSelection[0]!.speaker).toBe('旁白');
    expect(HEROSELECT_SRC).toContain('fengfengSelection');
    expect(HEROSELECT_SRC, '選角畫面又抄了一份介紹文字').not.toContain(blurb);
  });
});

describe('封封結局的打法插句', () => {
  // 稿子 FG-VAR-04「通用」：沒有明顯傾向的牌組用這一句。
  // 2026-09-25 爪力／隱身／蜷縮三派接上 VAR-01～03（使用者核可），那三條在 `tests/content/story_main_0925.test.ts`
  const generic = fengfengVictoryVariants[3]!.text;

  // 2026-09-23 改：稿子寫「接 FG-V-03 後、FG-V-04 前」，插句講的是他收劍那一下，要等他說「我把劍收好」才接得上
  it('插句用的是通用那句（FG-VAR-04），插在「先坐下，我把劍收好」之後', () => {
    expect(generic).toBe('劍鞘碰到腰側的傷，封封皺了皺眉，把腰帶鬆開一格。');
    for (const deck of [[], [...FENGFENG_STARTER_DECK], ['sanjo'], ['tanding', 'tanding', 'tanding', 'tanding']]) {
      for (const diff of [1, 5]) {
        const lines = victoryLinesFor(deck, diff, 'fengfeng');
        // 2026-09-25：醒來之後的說話者改叫「大俠貓」（劇情草稿第 3 節）
        expect(lines[1]?.speaker, '第二句仍是師父').toBe('大俠貓');
        expect(lines[2]?.text, '第三句仍是封封說要收劍（FG-V-03）').toBe('您認得我了。先坐下，我把劍收好。');
        expect(lines[3], `牌組 ${deck.join('+') || '空'}／難度 ${diff}`).toEqual({ speaker: '旁白', text: generic });
        expect(lines[4]?.text, '插句後面接 FG-V-04').toContain('球球和菲菲從門邊走過來');
        // 一次最多一段插句
        expect(lines.filter((l) => fengfengVictoryVariants.some((v) => v.text === l.text))).toHaveLength(1);
      }
    }
  });

  it('連線合作路線自己收尾，不插單人結局的插句', () => {
    for (const partner of ['ninja', 'feifei', 'dangdang']) {
      setCoopStory({ partner });
      expect(victoryLinesFor([], 1, 'fengfeng').some((l) => l.text === generic), partner).toBe(false);
    }
  });

  it('多了一句插句，回村後院子那段仍整段放在院子那張圖', () => {
    const base = storyFor('fengfeng').victory;
    const slides = endingSlides('fengfeng', [], 1);
    expect(slides.map((s) => s.img)).toEqual(['bg/fengfeng_still_embrace', 'bg/fengfeng_still_home', 'bg/fengfeng_story_ep01']);
    expect(slides[0]!.lines.some((l) => l.text === generic)).toBe(true);
    // 2026-09-25 劇情草稿 2-4：結局縮成基本 8 句，村口那段併成一句（第 6 句）、院子那段是最後兩句
    expect(slides[1]!.lines.at(-1)?.text, '回村那張最後一句是村口熱湯那句').toBe(base[5]!.text);
    expect(slides[2]!.lines.map((l) => l.text), '院子那張是最後兩句').toEqual(base.slice(6).map((l) => l.text));
  });
});

describe('鏡子走廊對封封派出鏡中封封', () => {
  const fight = () => startCombat({
    hp: 80, maxHp: 80, deck: FENGFENG_STARTER_DECK.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: 'mirror_duel', rng: new Rng(seedFromString('fengfeng-mirror')), hero: 'fengfeng',
  });

  it('名字與立繪換成封封的影子，id 不動', () => {
    expect(enemyNameFor('mirror_qiuqiu', 'fengfeng')).toBe('鏡中封封');
    expect(enemyArtFor('mirror_qiuqiu', 'fengfeng')).toBe('codex/monster_shadow_fengfeng');
    const e = fight().enemies[0]!;
    expect(e.enemyId).toBe('mirror_qiuqiu');
    expect(e.name).toBe('鏡中封封');
  });

  it('開場白不會說「是球球的影子」，也沒有另外編新台詞', () => {
    const skin = enemySkin('mirror_qiuqiu', 'fengfeng')!;
    const def = enemyById['mirror_qiuqiu']!;
    const original = [def.line, ...(def.lines ?? [])];
    for (const l of [skin.line, ...skin.lines]) {
      expect(l).not.toContain('球球');
      expect(original, `「${l}」不是鏡中球球原本的句子`).toContain(l);
    }
    const cs = fight();
    expect(cs.enemies[0]!.line ?? '').not.toContain('球球');
    expect(cs.log.some((l) => l.startsWith('鏡中封封：'))).toBe(true);
  });
});
