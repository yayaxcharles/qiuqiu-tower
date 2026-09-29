/**
 * 繁中的底子（2026-09-29 多語系第一片）：牌面文字產生器與名詞說明。
 * 開場時跟語言包一起載（`initLang`），不管選哪個語言都要——英日缺譯時退回的就是這一份。
 * 從首載程式搬出來，才讓得出位置給英日的架構（首載預算 680 KB）。
 */
import { glossary } from '../content/glossary';
import { describeCard } from '../ui/cardtext';

export default { describeCard, glossary };
