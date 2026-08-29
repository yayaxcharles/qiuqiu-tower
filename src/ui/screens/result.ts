import { dialogue } from '../../content/dialogue';
import { relicById } from '../../content/relics';
import { clearSave, recordBest } from '../../engine/save';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { showDeckPicker } from '../deckview';
import { el } from '../dom';

registerScreen('result', (app, root) => {
  const run = app.run;
  if (!run) { app.show('title'); return; }
  const won = run.status === 'won';
  // 先記成績再清存檔：這一局到此為止，「續玩」從結算之後就該是反灰的
  const best = recordBest(run);
  clearSave();

  const relics = el('div', { class: 'result-relics' });
  for (const id of run.relics) {
    const d = relicById[id];
    if (!d) continue;
    const url = artUrl('icons', d.art);
    // 圖示還沒生好就寫名字，不要排一列認不出來的灰剪影
    const node = url.startsWith('data:')
      ? el('div', { class: 'result-relic name-only' }, d.name)
      : el('div', { class: 'result-relic' }, el('img', { src: url, alt: d.name }));
    node.title = `${d.name}：${d.text}`;
    relics.append(node);
  }

  const lastWords = won ? dialogue.victoryTeaser : (dialogue.defeat.find((l) => l.speaker === '球球')?.text ?? '');

  root.append(el('div', { class: `screen result ${won ? 'won' : 'lost'}` },
    el('img', { class: 'result-cat', src: artUrl('sprites', won ? 'ninja/04' : 'ninja/36'), alt: '' }),
    el('h1', {}, won ? '通關' : '任務失敗'),
    el('div', { class: 'result-stats' },
      `到達 ${run.floor}F　擊倒 ${run.stats.kills} 隻　${run.stats.turns} 回合　出牌 ${run.stats.cardsPlayed} 張　牌組 ${run.deck.length} 張`),
    el('div', { class: 'result-stats small' }, `種子 ${run.seed}`),
    relics,
    el('div', { class: 'result-actions' },
      el('button', {
        class: 'btn',
        onclick: () => showDeckPicker({ title: `最終牌組（${run.deck.length} 張）`, cards: run.deck, pickable: false, cancellable: true, onPick: () => { /* 只是看看 */ } }),
      }, '看牌組'),
      el('button', { class: 'btn primary', onclick: () => { app.run = null; app.cs = null; app.show('title'); } }, '回到村子')),
    el('div', { class: 'result-best' }, `最佳成績：${best.floor}F${best.won ? `（通關，${best.turns} 回合）` : ''}`),
    lastWords ? el('p', { class: 'teaser' }, `球球：「${lastWords}」`) : ''));
});
