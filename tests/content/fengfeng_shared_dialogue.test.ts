import { beforeEach, expect, it } from 'vitest';
import { castLineFor, dialogue, lineFor, setCoopStory } from '../../src/content/dialogue';
import { eventTextFor, FENGFENG_EVENT_TEXT } from '../../src/content/event-text';
import { events } from '../../src/content/events';
import { FENGFENG_BOSS_LINES, FENGFENG_CAST_LINES } from '../../src/content/fengfeng-dialogue';

const sharedScenes = [
  dialogue.secretScroll, dialogue.afterFirstElite, ...dialogue.restBeforeBossByAct,
  ...Object.values(dialogue.bossIntroById), dialogue.bossIntroGeneric,
  ...Object.values(dialogue.bossPhase2ById), dialogue.bossPhase2Generic,
  ...Object.values(dialogue.bossPhase3ById), dialogue.bossPhase3Generic,
  ...Object.values(dialogue.bossDefeatById),
].flat();
// 標題也收（2026-09-23 起標題跟本文走同一張表）
const sharedEventTexts = events.filter((event) => !event.hero).flatMap((event) =>
  [event.title, event.text, ...event.choices.flatMap((choice) => [choice.label, choice.result])]);

beforeEach(() => setCoopStory(null));

it('封封拾到秘笈時說自己的台詞，旁白也使用封封視角', () => {
  const rendered = dialogue.secretScroll.map((line) => line.speaker === '球球'
    ? lineFor('fengfeng', line.text) : castLineFor('fengfeng', line.text));
  expect(rendered).toEqual([
    '樓梯間掉著一本秘笈。封封撿起來，拍掉封面上的灰，翻開第一頁。',
    '這本書上的字，我在大俠貓的院子裡見過。',
    '書掉在這裡，人應該往上走了。',
  ]);
});

it('封封的共用場景主角台詞不會漏回球球口氣', () => {
  const leaked = sharedScenes.filter((line) => line.speaker === '球球')
    .map((line) => lineFor('fengfeng', line.text)).filter((text) => text.includes('喵'));
  expect(leaked).toEqual([]);
});

it('封封的共用場景對照仍對得上目前原句', () => {
  const speakers = new Set(sharedScenes.filter((line) => line.speaker === '球球').map((line) => line.text));
  const cast = new Set(sharedScenes.filter((line) => line.speaker !== '球球').map((line) => line.text));
  expect(Object.keys(FENGFENG_BOSS_LINES).filter((text) => !speakers.has(text))).toEqual([]);
  expect(Object.keys(FENGFENG_CAST_LINES).filter((text) => !cast.has(text))).toEqual([]);
});

it('封封的共用事件敘述、選項與結果不會漏回球球口氣', () => {
  const leaked = sharedEventTexts.map((text) => eventTextFor('fengfeng', text))
    .filter((text) => /喵|球球[：:]/u.test(text));
  expect(leaked).toEqual([]);
  const originals = new Set(sharedEventTexts);
  expect(Object.keys(FENGFENG_EVENT_TEXT).filter((text) => !originals.has(text))).toEqual([]);
});
