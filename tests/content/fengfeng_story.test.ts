import { describe, expect, test, beforeEach } from 'vitest';
import {
  coopBossLines,
  hasCoopScene,
  setCoopStory,
  storyFor,
} from '../../src/content/dialogue';
import { eventTextFor } from '../../src/content/event-text';
import { eventById } from '../../src/content/events';
import { fengfengCoopScenes } from '../../src/content/fengfeng-dialogue';

beforeEach(() => setCoopStory(null));

describe('封封劇情內容', () => {
  test('單人主線使用提案中的封封文字與完整初遇表', () => {
    const story = storyFor('fengfeng');
    expect(story.prologue).toHaveLength(6);
    expect(story.prologue[0]?.text).toBe('第三天下午，封封帶著商隊回村。村外多了一座魔塔，原本曬魚乾的空地只剩倒下的竹架。');
    expect(story.actClear1).toHaveLength(4);
    expect(story.actClear2).toHaveLength(6);
    expect(story.victory).toHaveLength(16);
    expect(Object.keys(story.firstMeet)).toHaveLength(111);
    expect(story.firstMeet['white_duelist']).toBeTruthy();
  });

  test.each([
    ['ninja', 'fengfeng+ninja'],
    ['feifei', 'feifei+fengfeng'],
    ['dangdang', 'dangdang+fengfeng'],
  ] as const)('連線路線 %s 在兩個座位都使用同一組場景與關主接話', (other, key) => {
    setCoopStory({ partner: other });
    const fengfeng = storyFor('fengfeng');
    expect(hasCoopScene('fengfeng')).toBe(true);
    expect(fengfeng.prologue.length).toBeGreaterThan(0);
    expect(fengfeng.actClear1.length).toBeGreaterThan(0);
    expect(fengfeng.actClear2.length).toBeGreaterThan(0);
    expect(fengfeng.victory.length).toBeGreaterThan(0);
    expect(fengfeng.defeat.length).toBeGreaterThan(0);
    expect(coopBossLines('tower_master', 'intro', 'fengfeng')).not.toBeNull();

    setCoopStory({ partner: 'fengfeng' });
    const otherStory = storyFor(other);
    expect(hasCoopScene(other)).toBe(true);
    expect(otherStory.prologue).toEqual(fengfeng.prologue);
    expect(otherStory.actClear1).toEqual(fengfeng.actClear1);
    expect(otherStory.actClear2).toEqual(fengfeng.actClear2);
    expect(otherStory.victory).toEqual(fengfeng.victory);
    expect(otherStory.defeat).toEqual(fengfeng.defeat);
    expect(coopBossLines('tower_master', 'phase2', other)).not.toBeNull();
    expect(key.split('+')).toContain('fengfeng');
  });

  test('未配對時既有角色仍保留原主線', () => {
    const ninja = storyFor('ninja');
    const feifei = storyFor('feifei');
    const dangdang = storyFor('dangdang');
    expect(ninja.prologue[0]?.text).toBe('球球是大俠貓的徒弟。每次練習蜷縮，他總是縮到一半就歪倒。師父抱著胸，看得直笑，接著又示範了一次，讓他照著練。');
    expect(feifei.prologue[0]?.text).toContain('菲菲');
    expect(dangdang.prologue[0]?.text).toContain('噹噹');
  });

  test('封封共用事件文字只在封封路線替換', () => {
    const original = '球球把厚布折進護臂，磨平刮手的銅邊。';
    expect(eventTextFor('fengfeng', original)).toBe(original);
    const story = storyFor('fengfeng');
    expect(story.firstMeet).toBeDefined();
  });
});


describe('封封合作路線說話者', () => {
  const line = (route: keyof typeof fengfengCoopScenes, scene: keyof (typeof fengfengCoopScenes)[keyof typeof fengfengCoopScenes], text: string) => {
    const found = fengfengCoopScenes[route]?.[scene]?.find((item) => item.text === text);
    expect(found, `${route}/${scene}/${text}`).toBeDefined();
    return found;
  };

  test.each([
    ['fengfeng+ninja', 'prologue', '球球，出了什麼事？', '封封'],
    ['fengfeng+ninja', 'prologue', '師父的眼睛變紫了，誰叫他都不理喵！', '球球'],
    ['fengfeng+ninja', 'topScene', '球球，你從右邊上。我這一劍要往左邊揮。', '封封'],
    ['feifei+fengfeng', 'prologue', '我今天要進塔。這些藥先放屋裡，讓村貓來拿。', '菲菲'],
    ['feifei+fengfeng', 'topScene', '師妹，先別過來！師父還認不得我們喵！', '球球'],
    ['feifei+fengfeng', 'bossPhase2', '封封，他要轉身了！', '菲菲'],
    ['dangdang+fengfeng', 'prologue', '我跟你去。這批藥讓村裡先用。', '封封'],
    ['dangdang+fengfeng', 'prologue', '水袋裝滿。上面不知道有沒有水。', '噹噹'],
    ['dangdang+fengfeng', 'topScene', '我接著，你們先過去！', '噹噹'],
  ] as const)('%s %s ?????', (route, scene, text, speaker) => {
    expect(line(route, scene, text)?.speaker).toBe(speaker);
  });

  test('?????????????', () => {
    expect(line('fengfeng+ninja', 'prologue', '魔塔亮起紫光時，封封剛把貨送到村口。球球從院子跑出來，朝塔頂喊著師父。')?.speaker).toBe('旁白');
    expect(line('fengfeng+ninja', 'bossIntro', '難逢敵手。')?.speaker).toBe('塔主');
  });
});

describe('封封專屬事件', () => {
  test.each([
    ['fengfeng_stuck_scabbard', [1, 2]],
    ['fengfeng_lost_medicine', [1, 2]],
    ['fengfeng_fallen_rack', [2]],
    ['fengfeng_broken_bridge', [2, 3]],
  ] as const)('事件 %s 具備指定章節、待補圖標記與三個可結算選項', (id, acts) => {
    const event = eventById[id];
    expect(event).toBeDefined();
    expect(event?.hero).toBe('fengfeng');
    expect(event?.acts).toEqual(acts);
    expect(event?.artPending).toBeUndefined();
    expect(event?.choices).toHaveLength(3);
    expect(event?.choices.every((choice) => choice.result.length > 0)).toBe(true);
  });

  test('專屬事件使用既有結算效果與封封卡牌識別字', () => {
    const scabbard = eventById['fengfeng_stuck_scabbard'];
    expect(scabbard?.choices[0]?.outcome).toEqual([{ kind: 'upgradeCard' }]);
    expect(scabbard?.choices[1]?.outcome).toEqual([
      { kind: 'damage', n: 6 },
      { kind: 'addCard', cardId: 'fengfeng_tabu' },
    ]);
    const bridge = eventById['fengfeng_broken_bridge'];
    expect(bridge?.choices[2]?.outcome).toEqual([{ kind: 'addCard', cardId: 'fengfeng_tuibu' }]);
    expect(eventById['fengfeng_stuck_scabbard']?.choices[2]?.resultArt).toBeUndefined();
    expect(eventById['fengfeng_fallen_rack']?.choices[2]?.resultArt).toBeUndefined();
  });
});
