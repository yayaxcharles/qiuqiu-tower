// 日文語言包（延後載入，見 `src/i18n/index.ts`）。譯文在同資料夾的 JSON，牌面文字是 `cardtext.ts` 的日文規則
import type { LangPack } from '../index';
import ui from './ui.json';
import content from './content.json';
import { describeCardJa } from './cardtext';

const pack: LangPack = { ui, ...content, describeCard: describeCardJa } as LangPack;
export default pack;
