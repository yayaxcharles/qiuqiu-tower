// 英文語言包（延後載入，見 `src/i18n/index.ts`）。譯文在同資料夾的 JSON，牌面文字是 `cardtext.ts` 的英文規則
import type { LangPack } from '../index';
import '../layout';   // 英日才用得到的版面退讓，語言包載入時才掛上去（見 src/ui/layouthooks.ts）
import ui from './ui.json';
import content from './content.json';
import lines from './lines.json';
import events from './events.json';
import { describeCardEn } from './cardtext';

// 台詞與事件文案都是「畫面上最後那句中文 → 譯文」，併成同一張表查
const line = { ...lines, ...events };
const pack: LangPack = { ui, ...content, line, describeCard: describeCardEn } as unknown as LangPack;
export default pack;
