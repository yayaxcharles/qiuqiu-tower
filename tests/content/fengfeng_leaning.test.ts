import { describe, expect, it } from 'vitest';
import { FENGFENG_STARTER_DECK } from '../../src/content/cards';
import { deckLeaning } from '../../src/content/dialogue';

describe('封封結局的打法判斷', () => {
  it('只帶起手十張時不算任何一派（起手牌要排掉，否則幾乎每局都被判成蜷縮流）', () => {
    expect(deckLeaning(FENGFENG_STARTER_DECK, 'fengfeng')).toBe(deckLeaning([], 'fengfeng'));
  });
});
