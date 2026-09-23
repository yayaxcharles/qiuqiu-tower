import { afterEach, describe, expect, it } from 'vitest';
import {
  castLineFor, DANGDANG_BOSS_LINES, defeatLastWord, dialogue,
  FEIFEI_BOSS_LINES, firstMeetLine, lineFor,
  MIXED_FIRST_MEET, MIXED_LINES, setCoopStory, storyFor, type DialogueLine,
} from '../../src/content/dialogue';
import { DANGDANG_EVENT_TEXT, eventTextFor, FEIFEI_EVENT_LINES, FEIFEI_EVENT_TEXT, MIRROR_EVENT_TEXT, FENGFENG_EVENT_TEXT } from '../../src/content/event-text';
import { events } from '../../src/content/events';
import {
  FENGFENG_BOSS_LINES, FENGFENG_YARD_FIRST, fengfengVictory, fengfengVictoryTeaser,
} from '../../src/content/fengfeng-dialogue';
import { HEROES, heroName, type Hero } from '../../src/engine/hero';
import { actClearSlides, endingSlides, prologueSlides } from '../../src/ui/storyslides';
import APP from '../../src/ui/app.ts?raw';
import STORYSLIDES from '../../src/ui/storyslides.ts?raw';

/**
 * 2026-09-23 劇情稽核（`scratchpad/audit/story.md`）中 4 條、低 6 條，加上連線鏡子走廊的已知項。
 *
 * 共同的病根是「同伴不在身邊才成立的句子」：連線時同伴明明就站在旁邊，
 * 單人劇本那句照樣印出來。這種錯不會報錯、別的測試也照樣綠，只有玩家看得出來。
 */
afterEach(() => setCoopStory(null));

const OTHERS = (me: Hero): Hero[] => HEROES.filter((h) => h !== me);

/** 關主、秘笈、關主前貓窩那批共用台詞，照 `playDialogue` 入口的規矩換成這一位看到的樣子 */
function sharedShown(hero: string): string[] {
  const d = dialogue;
  const all: DialogueLine[] = [
    ...Object.values(d.bossIntroById), d.bossIntroGeneric, ...Object.values(d.bossDefeatById),
    ...Object.values(d.bossPhase2ById), d.bossPhase2Generic, ...Object.values(d.bossPhase3ById), d.bossPhase3Generic,
    d.secretScroll, d.afterFirstElite, ...d.restBeforeBossByAct,
  ].flat();
  return all.map((l) => (l.speaker === '球球' ? lineFor(hero, l.text) : castLineFor(hero, l.text)));
}

/** 共用事件（敘述、選項、結果）這一位讀到的樣子；專屬事件連線不排 */
function eventsShown(hero: string): string[] {
  return events.filter((e) => !e.hero)
    .flatMap((e) => [e.text, ...e.choices.flatMap((c) => [c.label, c.result ?? ''])])
    .map((t) => eventTextFor(hero, t));
}

const resultOf = (eventId: string, has: string): string =>
  events.find((e) => e.id === eventId)!.choices.find((c) => c.result.includes(has))!.result;

describe('中-1：封封跟人一起爬，不會說同伴「沒回村」', () => {
  const NEKOMATA = '婆婆，我來找大俠貓和他的兩個徒弟。他們都沒回村。';

  it('一個人玩照舊是原句（反向：這條測試真的有讀到那一句）', () => {
    expect(sharedShown('fengfeng')).toContain(NEKOMATA);
    expect(eventsShown('fengfeng').join('')).toContain('朋友還沒回來');
  });

  it('封封＋球球：婆婆那句、住持那句、哭牆、古井都換成只少大俠貓的版本', () => {
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    const text = [...sharedShown('fengfeng'), ...eventsShown('fengfeng')].join('\n');
    for (const bad of ['兩個徒弟', '都沒回村', '朋友還沒回來', '把他們找到', '他的徒弟沒有放棄']) {
      expect(text, `封封＋球球還讀到「${bad}」`).not.toContain(bad);
    }
    expect(sharedShown('fengfeng')).toContain('婆婆，我陪球球來找大俠貓。他中了魔氣，跑上塔頂了。');
  });

  it('封封＋菲菲：大俠貓跟球球三天沒回來，不再說「兩個徒弟」', () => {
    setCoopStory({ partner: 'feifei', mirror: 'feifei' });
    const text = sharedShown('fengfeng').join('\n');
    expect(text).not.toContain('兩個徒弟');
    expect(text).not.toContain('他的徒弟沒有放棄');
    expect(text).toContain('婆婆，我陪菲菲來找大俠貓和球球。他們三天沒回村了。');
  });

  it('封封＋噹噹：球球、菲菲都在塔裡，原句成立，只把婆婆面前的人換成兩個', () => {
    setCoopStory({ partner: 'dangdang', mirror: 'dangdang' });
    expect(sharedShown('fengfeng')).toContain('婆婆，我和噹噹來找大俠貓和他的兩個徒弟。他們都沒回村。');
  });

  it('封封那層不影響另外三隻', () => {
    for (const hero of ['ninja', 'feifei', 'dangdang'] as const) {
      setCoopStory({ partner: 'fengfeng', mirror: 'fengfeng' });
      expect(sharedShown(hero).join(''), hero).not.toContain('我陪球球來找大俠貓');
    }
  });
});

describe('中-2、低-3：菲菲、噹噹那兩層漏的同類句', () => {
  it('菲菲＋球球：哭牆敲磚那句不再說師兄沒回來（反向：一個人玩還是原句）', () => {
    const brick = resultOf('crying_wall', '敲開牆腳的磚');
    expect(eventTextFor('feifei', brick)).toContain('師父和師兄都還沒回來');
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    const shown = eventTextFor('feifei', brick);
    expect(shown).not.toContain('師兄都還沒回來');
    expect(shown).toContain('師兄，我們一起上去');
  });

  it('菲菲＋球球：古井許願不再替站在旁邊的師兄求平安', () => {
    const wish = resultOf('old_well', '小魚乾落進井裡');
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    expect(eventTextFor('feifei', wish)).toContain('我們三個都平安回家');
    // 跟噹噹、封封一起時師兄確實不在，原句照舊
    setCoopStory({ partner: 'dangdang', mirror: 'dangdang' });
    expect(eventTextFor('feifei', wish)).toContain('讓師父和師兄平安就好');
  });

  it('噹噹＋球球／菲菲：住持倒下後不再說「他的兩個徒弟都在找他」', () => {
    const shownWith = (partner: string): string => {
      setCoopStory({ partner, mirror: partner });
      return sharedShown('dangdang').join('\n');
    };
    expect(shownWith('ninja')).not.toContain('他的兩個徒弟都在找他');
    expect(shownWith('ninja')).toContain('球球一路找他找到這裡');
    expect(shownWith('feifei')).not.toContain('他的兩個徒弟都在找他');
    // 跟封封一起時球球、菲菲都在塔裡找師父，原句成立
    expect(shownWith('fengfeng')).toContain('他的兩個徒弟都在找他');
  });
});

describe('改口表的鍵都還對得到原句', () => {
  /** 這一位（單人）會經過 `mixedLine` 的所有原句：劇本、收尾、關主台詞的改句、事件的改句 */
  function sourcesOf(hero: string): Set<string> {
    setCoopStory(null);
    const s = storyFor(hero);
    const out = [...s.prologue, ...s.actClear1, ...s.actClear2, ...s.topScene, ...s.defeat, ...s.victory].map((l) => l.text);
    out.push(s.hardModeEpilogue, s.victoryTeaser, ...Object.values(s.victoryNarration).map(String));
    if (hero === 'feifei') out.push(...Object.values(FEIFEI_BOSS_LINES), ...Object.values(FEIFEI_EVENT_LINES), ...Object.values(FEIFEI_EVENT_TEXT));
    if (hero === 'dangdang') out.push(...Object.values(DANGDANG_BOSS_LINES), ...Object.values(DANGDANG_EVENT_TEXT));
    if (hero === 'fengfeng') out.push(...Object.values(FENGFENG_BOSS_LINES), ...Object.values(FENGFENG_EVENT_TEXT));
    return new Set(out);
  }

  it('MIXED_LINES：外層、第二層都是角色，最裡面的鍵是這一位真的會講到的句子', () => {
    for (const [me, byPartner] of Object.entries(MIXED_LINES)) {
      expect(HEROES as readonly string[], me).toContain(me);
      const src = sourcesOf(me);
      for (const [partner, table] of Object.entries(byPartner)) {
        expect(OTHERS(me as Hero) as string[], `${me}.${partner}`).toContain(partner);
        for (const key of Object.keys(table)) expect(src.has(key), `${me}.${partner} 的鍵查不到原句：${key}`).toBe(true);
      }
    }
  });

  it('MIRROR_EVENT_TEXT／MIXED_FIRST_MEET：鍵是鏡子走廊那篇的原句、角色是四隻貓', () => {
    const hall = events.find((e) => e.id === 'mirror_hall')!;
    const originals = new Set([hall.text, ...hall.choices.flatMap((c) => [c.label, c.result])]);
    for (const [me, byMirror] of Object.entries(MIRROR_EVENT_TEXT)) {
      for (const [mirror, table] of Object.entries(byMirror)) {
        expect(OTHERS(me as Hero) as string[], `${me}.${mirror}`).toContain(mirror);
        for (const key of Object.keys(table)) expect(originals.has(key), `${me}.${mirror}：${key}`).toBe(true);
      }
    }
    for (const [me, byMirror] of Object.entries(MIXED_FIRST_MEET)) {
      for (const mirror of Object.keys(byMirror)) expect(OTHERS(me as Hero) as string[], `${me}.${mirror}`).toContain(mirror);
    }
  });
});

describe('鏡子走廊照的是同伴：十二組都叫得出是誰', () => {
  const hall = events.find((e) => e.id === 'mirror_hall')!;
  const fight = hall.choices.find((c) => c.outcome.some((o) => o.kind === 'fight'))!;
  /** 我怎麼稱呼對方：師兄妹互稱，其他叫名字 */
  const callName = (me: Hero, other: Hero): string =>
    me === 'ninja' && other === 'feifei' ? '師妹' : me === 'feifei' && other === 'ninja' ? '師兄' : heroName({ hero: other });

  it.each(HEROES.flatMap((me) => OTHERS(me).map((mirror) => [me, mirror] as const)))('%s 看到鏡中的 %s', (me, mirror) => {
    // 鏡中那隻照座位 0 變裝：我坐 1 號、同伴坐 0 號
    setCoopStory({ partner: mirror, mirror });
    const name = callName(me, mirror);
    expect(eventTextFor(me, hall.text), '開頭').toContain(name);
    expect(eventTextFor(me, fight.label), '按鈕').toContain(`假${name}`);
    expect(eventTextFor(me, fight.label), '按鈕還寫「鏡中的自己」').not.toContain('自己');
    expect(eventTextFor(me, fight.result), '打一場的結果').toContain(name);
    expect(firstMeetLine(me, 'mirror_qiuqiu'), '戰鬥開場那句').toContain(name);
  });

  it('封封坐 0 號時，另外三位不會再讀到自己那份「鏡中的自己」（連線盤點已知項）', () => {
    for (const me of ['ninja', 'feifei', 'dangdang'] as const) {
      setCoopStory({ partner: 'fengfeng', mirror: 'fengfeng' });
      expect(eventTextFor(me, hall.text), me).toContain('封封');
      expect(eventTextFor(me, hall.text), me).not.toContain('鏡中的球球');
    }
  });

  it('鏡子照的是自己時照舊（單人、同角色雙人）', () => {
    setCoopStory({ partner: 'fengfeng', mirror: 'fengfeng' });
    expect(eventTextFor('fengfeng', fight.label)).toBe(FENGFENG_EVENT_TEXT[fight.label]);
    setCoopStory(null);
    expect(eventTextFor('ninja', hall.text)).toBe(hall.text);
  });
});

describe('中-3、中-4：封封單人幻燈片的圖跟句子對得上', () => {
  it('序章：封封問、村貓答配在兩隻貓對話那張；走到塔下那句配塔下那張', () => {
    const slides = prologueSlides('fengfeng');
    expect(slides.map((s) => s.img)).toEqual([
      'bg/fengfeng_still_return', 'bg/fengfeng_still_shop', 'bg/fengfeng_still_meet', 'bg/fengfeng_still_tower', 'bg/fengfeng_story_p05',
    ]);
    expect(slides[2]!.lines.map((l) => l.speaker), '對話那張').toEqual(['封封', '村貓']);
    expect(slides[3]!.lines.map((l) => l.text).join(''), '塔下撿魚乾那張').toContain('他走到塔下');
    expect(slides[4]!.lines.map((l) => l.text)).toEqual(['是從村裡搶來的。人應該也往這裡走了。']);
    expect(slides.flatMap((s) => s.lines), '一句都不能少').toEqual(storyFor('fengfeng').prologue);
  });

  it('第二關過關：噹噹講話的句子不配在封封獨自望著月光樓梯那張', () => {
    const slides = actClearSlides('fengfeng', 2);
    expect(slides.map((s) => s.img)).toEqual([
      'bg/fengfeng_still_act2_smoke', 'bg/fengfeng_still_act2_voice', 'bg/fengfeng_still_act2_moonstairs',
    ]);
    expect(slides[0]!.lines.map((l) => l.speaker), '接包袱那張').toEqual(['旁白', '封封']);
    expect(slides[1]!.lines.map((l) => l.speaker), '三隻貓一起站在樓梯上那張').toEqual(['噹噹', '封封', '噹噹']);
    expect(slides[2]!.lines.some((l) => l.speaker === '噹噹'), '月光樓梯那張只有封封').toBe(false);
    expect(slides.flatMap((s) => s.lines)).toEqual(storyFor('fengfeng').actClear2);
  });

  it('沒標切點的過關照舊一張一句（另外三隻一個字都沒動）', () => {
    for (const hero of ['ninja', 'feifei', 'dangdang']) {
      for (const act of [1, 2]) {
        const slides = actClearSlides(hero, act);
        expect(slides.length, `${hero} 第 ${act} 關`).toBe(3);
        expect(slides[0]!.lines.length, `${hero} 第 ${act} 關第一張`).toBe(1);
      }
    }
  });

  it('結局：大俠貓扶起球球、拉過菲菲那幾句配塔頂相擁那張，打法插句接在收劍那句後面', () => {
    const slides = endingSlides('fengfeng', [], 1);
    const [embrace, home, yard] = slides.map((s) => s.lines.map((l) => l.text));
    const sheathe = embrace!.indexOf('您認得我了。先坐下，我把劍收好。');
    expect(embrace![sheathe + 1], '插句接在 FG-V-03 後面').toBe('劍鞘碰到腰側的傷，封封皺了皺眉，把腰帶鬆開一格。');
    expect(embrace!.join(''), '塔頂相擁那幾句').toContain('又將菲菲拉到身邊');
    expect(embrace!.at(-1)).toBe('手給我看看。這些傷都得包起來。');
    expect(home!.join(''), '村口喝熱湯那張').not.toContain('球球扶著牆走過來');
    expect(home![0]).toContain('下樓時');
    expect(yard![0]).toBe(FENGFENG_YARD_FIRST);
  });
});

describe('低-1、低-2、低-5、低-6', () => {
  it('低-1：六組搭檔、兩個座位的落敗結算都有主角自己講的最後一句', () => {
    for (const me of HEROES) {
      for (const partner of OTHERS(me)) {
        setCoopStory({ partner, mirror: me });
        expect(defeatLastWord(me), `${me}＋${partner}`).not.toBe('');
      }
    }
    setCoopStory({ partner: 'dangdang', mirror: 'dangdang' });
    expect(defeatLastWord('feifei')).toContain('我們再去找師父和師兄');
  });

  it('低-2：山賊回禮那句不會讀成「封封的母親」', () => {
    const shown = eventTextFor('fengfeng', resultOf('toll_again_paid', '改把自己母親傳下的調息法'));
    expect(shown).toContain('把自己母親傳下的調息法教給封封');
    expect(shown).not.toContain('教封封母親');
  });

  it('低-5：劇情段落退回純對白時照字面播（說話者寫球球就是球球）', () => {
    const src = APP.replace(/\r\n/g, '\n');
    expect(src).toContain('const STORY_LITERAL = true;');
    // 檔頭註解會提到它（寫成「hasCoopScene(…)」），所以只抓真的帶參數的呼叫
    expect(src, '又拿 hasCoopScene 決定照不照字面播：單人時是 false').not.toMatch(/hasCoopScene\(\w/);
    for (const call of [
      'playDialogue(pro, done, undefined, STORY_LITERAL)',   // `done`＝播完還是同一局才接下去（連線稽核 高-1，同日合併）
      'playOnce(`topScene:${run.act}`, top, playBoss, STORY_LITERAL, topSlides)',
      "playDialogue(storyFor(mine).defeat, () => this.show('result'), undefined, STORY_LITERAL)",
      "playDialogue(vic, () => this.show('result'), undefined, STORY_LITERAL)",
      "playDialogue(lines, () => this.show('actclear', { bossRelic }), undefined, STORY_LITERAL)",
    ]) expect(src, call).toContain(call);
    // 單人封封的塔頂段確實有球球本人的句子——照字面播的理由
    expect(storyFor('fengfeng').topScene.some((l) => l.speaker === '球球')).toBe(true);
  });

  it('低-6：結算收尾句另寫一句，不是結局裡剛演過的句子；院子那段用具名常數找', () => {
    expect(storyFor('fengfeng').victoryTeaser).toBe(fengfengVictoryTeaser);
    expect(fengfengVictory.map((l) => l.text), '收尾句跟結局重複').not.toContain(fengfengVictoryTeaser);
    expect(fengfengVictoryTeaser).not.toContain('喵');
    expect(fengfengVictory.filter((l) => l.text === FENGFENG_YARD_FIRST)).toHaveLength(1);
    expect(STORYSLIDES, '又用陣列位置抓院子那段').not.toMatch(/\.victory\[\d+\]/);
  });
});
