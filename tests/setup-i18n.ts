// 多語系（2026-09-29）：繁中牌面產生器與名詞說明改成開場才載（src/i18n/zh.ts），測試一開始先載好，畫面測試照舊拿得到牌面文字
import { loadZhBase } from '../src/i18n';

await loadZhBase();
