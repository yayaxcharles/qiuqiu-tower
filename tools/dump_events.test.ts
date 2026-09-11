// 產生 docs/事件文案.md：38 個事件的標題、劇情文字、選項文字、結果文字，一次看完。
//
// 使用者 2026-09-11：「你把目前的事件：對話、劇情文字、選項文字都列成 MD 給我整個看看，
// 我想看看有沒有哪些地方可以修正」。
//
// 做成 dump 工具而不是手寫一份：手寫的隔天就過期，而 `npx vitest run` 會一起跑到 tools/，
// 所以改完文案跑一次測試，這份就是最新的（跟 docs/牌池總表.json 同一套作法）。
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { events } from '../src/content/events';
import { cardById } from '../src/content/cards';
import type { RunEffect } from '../src/engine/types';

const cardName = (id: string): string => cardById[id]?.name ?? id;

/** 把結果效果寫成一句人看得懂的話，好對照「文字講的」跟「實際會發生的」有沒有對上 */
function effectText(fx: RunEffect): string {
  switch (fx.kind) {
    case 'heal': return `回 ${fx.n} 點生命`;
    case 'healPercent': return `回 ${Math.round(fx.p * 100)}% 生命`;
    case 'damage': return `扣 ${fx.n} 點生命`;
    case 'maxHp': return `最大生命 ${fx.n > 0 ? '+' : ''}${fx.n}`;
    case 'fish': return `${fx.n > 0 ? '+' : ''}${fx.n} 條小魚乾`;
    case 'fishHalve': return '小魚乾減半';
    case 'relic': return `拿一件${fx.pool}秘寶`;
    case 'loseRelic': return '隨機交出一件秘寶';
    case 'potions': return `拿 ${fx.n} 支忍具`;
    case 'removeCard': return '放生一張牌';
    case 'upgradeCard': return '升級一張牌';
    case 'chooseCard': return `三選一學一張${fx.pool ?? ''}牌`;
    case 'addCard': return `學到「${cardName(fx.cardId)}」`;
    // 稀有度與牌池要一起印：`此路不通` 寫的是「罕見忍術牌」，只印牌池就看不出稀有度有沒有設對
    case 'addRandomCard': return `學到一張${fx.rarity ?? ''}${fx.pool ?? ''}牌`;
    case 'fight': return `打一場（${fx.encounterId}）`;
    case 'flag': return `（記旗標 ${fx.name}）`;
    // 賭一把：把輸贏兩邊都攤開，不然文案寫的機率跟實際對不對得上完全看不出來
    case 'gamble': return `賭 ${Math.round(fx.p * 100)}%：贏→${fx.win.map(effectText).join('、')}／輸→${fx.lose.length ? fx.lose.map(effectText).join('、') : '什麼都沒有'}`;
    default: return (fx as { kind: string }).kind;
  }
}

it('dump events', () => {
  const lines: string[] = [];
  lines.push('# 爪破魔塔：事件文案總表', '');
  lines.push(`共 ${events.length} 個事件。這份是從 \`src/content/events.ts\` 產生的，`);
  lines.push('改完文案跑一次 `npx vitest run tools/dump_events.test.ts` 就會更新。', '');
  lines.push('- **關卡**：沒寫就是三關都可能遇到。');
  lines.push('- **前置**：要先在別的事件做過某個選擇才會出現（前後集）。');
  lines.push('- 每個選項底下的「→」是實際會發生的事，拿來對照文字有沒有講清楚。', '');
  lines.push('---', '');

  for (const [i, ev] of events.entries()) {
    const tags: string[] = [];
    if (ev.acts) tags.push(`關卡 ${ev.acts.join('、')}`);
    if (ev.requiresFlag) tags.push(`前置 ${ev.requiresFlag}`);
    if (ev.fixedFloor !== undefined) tags.push(`固定 ${ev.fixedFloor}F`);
    lines.push(`## ${i + 1}. ${ev.title}`);
    lines.push(`\`${ev.id}\`${tags.length ? ' ｜ ' + tags.join(' ｜ ') : ''}`, '');
    lines.push(`> ${ev.text}`, '');
    for (const c of ev.choices) {
      lines.push(`- **${c.label}**`);
      // `costFish` 是選項本身的代價（`label` 裡多半也寫了），跟 outcome 分開存，不印就會漏掉
      const fx = [
        ...(c.costFish ? [`先付 ${c.costFish} 條小魚乾`] : []),
        ...c.outcome.map(effectText).filter((t) => !t.startsWith('（記旗標')),
      ];
      lines.push(`  - → ${fx.length ? fx.join('、') : '什麼都不會發生'}`);
      // 結果文字自己就帶「」（球球的台詞），外面再包一層會變成雙層引號，改成縮排引用
      if (c.result) lines.push(`  - *${c.result}*`);
    }
    lines.push('');
  }
  writeFileSync('docs/事件文案.md', lines.join('\n'), 'utf-8');
  console.log(`事件文案.md：${events.length} 個事件`);
});
