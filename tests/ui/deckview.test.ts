import { describe, expect, it } from 'vitest';
import type { CardInstance } from '../../src/engine/types';
import { deckPickerLayout } from '../../src/ui/deckview';

const deck: CardInstance[] = [
  { uid: 1, cardId: 'sanjo', upgraded: false },
  { uid: 2, cardId: 'sanjo', upgraded: true },
  { uid: 3, cardId: 'tanding', upgraded: true },
];

describe('挑牌疊層的開場狀態', () => {
  it('有得挑就照原本的規矩：不給關就是不給關', () => {
    const l = deckPickerLayout({ cards: deck, pickable: true, cancellable: false, filter: (c) => !c.upgraded });
    expect(l.choices).toBe(1);
    expect(l.closable).toBe(false);
    expect(l.note).toBe(null);
  });

  it('濾網一張都不合的時候一定要能關，不然玩家鎖死在疊層裡', () => {
    // 磨爪：整副牌都升級過了
    const l = deckPickerLayout({ cards: deck, pickable: true, cancellable: false, filter: (c) => !c.upgraded && c.uid !== 1 });
    expect(l.choices).toBe(0);
    expect(l.closable).toBe(true);
    expect(l.note).toBe('（沒有可以挑的牌）');
  });

  it('牌組是空的也一樣要能關', () => {
    const l = deckPickerLayout({ cards: [], pickable: true, cancellable: false });
    expect(l.choices).toBe(0);
    expect(l.closable).toBe(true);
    expect(l.note).toBe('（沒有牌）');
  });

  it('沒有濾網就是每張都能挑', () => {
    const l = deckPickerLayout({ cards: deck, pickable: true, cancellable: true });
    expect(l.choices).toBe(3);
    expect(l.closable).toBe(true);
    expect(l.note).toBe(null);
  });

  it('只是翻牌組來看：不算挑的張數，也不用補說明', () => {
    const l = deckPickerLayout({ cards: deck, pickable: false, cancellable: true });
    expect(l.choices).toBe(0);
    expect(l.closable).toBe(true);
    expect(l.note).toBe(null);
  });
});
