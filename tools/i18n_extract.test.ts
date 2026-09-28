/**
 * 多語系：把要翻的內容抽成一份中文原文（`tools/i18n/source/content.zh.json`），給翻譯批次用。
 * 平常跑測試不會動（要帶 `I18N_EXTRACT=1` 才寫檔）；缺譯檢查在 `tests/i18n/missing_keys.test.ts`，兩邊共用 `contentSource()`。
 *
 *   I18N_EXTRACT=1 npx vitest run tools/i18n_extract.test.ts
 */
import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { contentSource, uiKeys } from '../tests/i18n/source';

declare const process: { env: Record<string, string | undefined> };

describe('多語系原文抽取', () => {
  it.skipIf(!process.env['I18N_EXTRACT'])('寫出 tools/i18n/source/content.zh.json', () => {
    mkdirSync('tools/i18n/source', { recursive: true });
    writeFileSync('tools/i18n/source/content.zh.json', JSON.stringify(contentSource(), null, 1) + '\n', 'utf-8');
    writeFileSync('tools/i18n/source/ui.zh.json', JSON.stringify(Object.fromEntries(uiKeys().map((k) => [k, k])), null, 1) + '\n', 'utf-8');
  });
});
