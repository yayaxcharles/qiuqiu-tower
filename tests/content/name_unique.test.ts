import { describe, expect, it } from 'vitest';
import { cardNameFor, cards } from '../../src/content/cards';
import { relics } from '../../src/content/relics';
import { potions } from '../../src/content/potions';
import type { StatusName } from '../../src/engine/types';

/**
 * **玩家看得到的名字不能重複**（2026-09-16 使用者裁定「改名」）。
 *
 * 既有的 `cards.test.ts` 只檢查資料裡的 `name` 不重複，所以下面這四種撞法它一種都抓不到：
 *
 * 1. **顯示名互撞**：菲菲手上會把「忍術·」前綴拿掉（`cardNameFor`），
 *    所以她的「忍術·影子分身」顯示出來就是「影子分身」，跟球球那張一字不差。
 * 2. **跟秘寶撞**：牌「絕學·護心」對秘寶「護心短褂」（那件上一次改名就是為了閃絕學牌）。
 * 3. **跟忍具撞**：菲菲的牌「針雨」對忍具「針雨」——單體連打對全體下毒兼防禦，
 *    而且兩個都是她會碰到的東西，戰鬥紀錄還分不出是哪個。
 * 4. **跟狀態撞**：她的「忍術·反彈」顯示成「反彈」，跟狀態牌子上的「反彈」同名。
 *
 * 這一條把四邊丟進同一個集合檢查唯一，下次再撞就會紅。
 */
/**
 * 狀態名沒有現成的執行期清單（`StatusName` 只是型別），所以這裡自己列一份。
 * 下面那一行是**型別層的漏網檢查**：新增狀態卻忘了加進來，`tsc` 會直接紅。
 */
const STATUSES = [
  '爪力', '貓步', '翻肚', '懶洋洋', '炸毛', '中毒', '隱身', '定身', '反彈', '潛水',
  '縮殼', '飛行', '鱗甲', '沉睡', '消散', '虛化', '不壞身', '鐵布衫',
] as const satisfies readonly StatusName[];
type 漏掉的狀態 = Exclude<StatusName, (typeof STATUSES)[number]>;
const _沒漏: 漏掉的狀態 extends never ? true : false = true;

describe('玩家看得到的名字', () => {
  it('牌（兩位各自看到的）、秘寶、忍具、狀態四邊都不重複', () => {
    const seen = new Map<string, string>();
    const add = (name: string, where: string): void => {
      const prev = seen.get(name);
      expect(prev === undefined || prev === where, `「${name}」同時是 ${prev} 與 ${where}`).toBe(true);
      seen.set(name, where);
    };
    for (const c of cards) {
      add(c.name, `牌 ${c.id}`);
      const hers = cardNameFor(c, 'feifei');
      if (hers !== c.name) add(hers, `牌 ${c.id}（菲菲看到的）`);
    }
    for (const r of relics) add(r.name, `秘寶 ${r.id}`);
    for (const p of potions) add(p.name, `忍具 ${p.id}`);
    for (const s of STATUSES) add(s, '狀態');
    expect(_沒漏, '狀態清單漏了').toBe(true);
  });
});
