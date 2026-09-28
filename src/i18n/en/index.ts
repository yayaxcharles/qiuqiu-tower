// 英文語言包（延後載入，見 `src/i18n/index.ts`）。譯文在同資料夾的 JSON，牌面文字是 `cardtext.ts` 的英文規則
import type { LangPack } from '../index';
import ui from './ui.json';
import content from './content.json';
import line from './lines.json';
import { describeCardEn } from './cardtext';

const pack: LangPack = { ui, ...content, line, describeCard: describeCardEn } as unknown as LangPack;
export default pack;
