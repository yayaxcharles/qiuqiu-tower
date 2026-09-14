import { describe, expect, it } from 'vitest';
import { potions } from '../../src/content/potions';
import { cards } from '../../src/content/cards';

/**
 * 忍具對每個職業都要有用（使用者 2026-09-12：「忍具圖不用改，但會不會有些對菲菲沒用可能得看看」）。
 *
 * 查過了，35 支**沒有一支對她沒用**：沒有任何一支牽到牌池或職業，效果種類全是通用的。
 * 反而有幾支對她更好——貓步粉（貓步是加在蜷縮上的，她每張攻擊都帶蜷縮）、
 * 順手牽羊爪與以彼之道（吃蜷縮）、加倍奉還與胡椒罐（吃毒）。
 * 只有分身油（下一張攻擊傷害加倍）對她略差，她單張傷害低——但那是**比較弱**不是沒效果，
 * 跟秘寶那兩件的判準一致（見 `RelicDef.notFor`），所以不鎖。
 *
 * 這條測試釘住的是**前提**：忍具不分職業。哪天有人給忍具加上 `hero` 那類欄位，
 * 或讓某支忍具去翻牌池，這裡就會紅，提醒他回來想一遍「這支對另外兩位還有用嗎」。
 */
describe('忍具不分職業', () => {
  it('沒有一支忍具綁職業', () => {
    const bound = potions.filter((p) => 'hero' in p || 'notFor' in p).map((p) => p.name);
    expect(bound, `這幾支綁了職業：${bound.join('、')}——要想一遍對另外兩位還有沒有用`).toEqual([]);
  });

  it('沒有一支忍具的效果會去翻牌池', () => {
    // 牌池是分職業的（`CardDef.hero`），忍具一碰到牌池就會因職業而異
    const bad = potions.filter((p) => p.effects.some((f) => 'pool' in f)).map((p) => p.name);
    expect(bad, `這幾支會翻牌池：${bad.join('、')}`).toEqual([]);
  });

  it('每一支的效果種類，在三個職業的牌裡都找得到同樣的種類（＝引擎對誰都認）', () => {
    const kindsInCards = new Set(cards.flatMap((c) => [
      ...c.effects.map((f) => f.kind),
      ...(c.upgrade.effects ?? []).map((f) => f.kind),
    ]));
    // 只挑忍具特有的幾種當白名單：這幾種牌上沒有，是忍具專屬的一次性效果
    const potionOnly = new Set(['immuneThisTurn', 'skipEnemyTurn', 'recoverFromDiscard', 'damageScatter']);
    const orphan = [...new Set(potions.flatMap((p) => p.effects.map((f) => f.kind)))]
      .filter((k) => !kindsInCards.has(k) && !potionOnly.has(k));
    expect(orphan, `這幾種效果只有忍具有，牌上沒有：${orphan.join('、')}——確認引擎對三個職業都一樣處理`).toEqual([]);
  });
});
