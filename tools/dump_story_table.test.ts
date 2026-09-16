import { it } from 'vitest';
import { buildRows, writeTable } from './story_table_lib';

/*
 * **兩個角色的全部劇情與對白各倒成一張「改寫表」**（2026-09-15 使用者：「她的劇情不像人寫的，出一個所有劇情的表，
 * 我讓 GPT 整個改寫」；稍後：「球球也要給我一個劇情表讓他一起改」）。
 *
 * 產物（每個角色兩個檔）：
 *   - `docs/<角色>_劇情改寫表_2026-09-15.md`：給人／GPT 看的表，每句一列、有編號，「改寫」欄留白。
 *   - `docs/<角色>_劇情改寫表_2026-09-15.keys.json`：每個編號對應到程式裡哪個檔、哪個字串（人不用看），
 *     回填腳本 `tools/apply_story_table.py` 照它把改寫寫回 `src/content/`。
 *
 * 只有帶 `DUMP_STORY=1` 才重寫（理由同 `dump_feifei_lines.test.ts`：這份是給人填的，不能被一般測試蓋掉）：
 *   DUMP_STORY=1 npx vitest run tools/dump_story_table.test.ts
 */
it.skipIf(!process.env['DUMP_STORY'])('dump story tables', () => {
  for (const hero of ['feifei', 'ninja'] as const) {
    const me = hero === 'feifei' ? '菲菲' : '球球';
    const rows = buildRows(hero);
    // 第二輪起換一個日期，舊表是 GPT 那一輪的底稿，不能蓋掉：
    //   DUMP_STORY=1 STORY_DATE=2026-09-16 npx vitest run tools/dump_story_table.test.ts
    const date = process.env['STORY_DATE'] ?? '2026-09-15';
    const md = `docs/${me}_劇情改寫表_${date}.md`;
    writeTable(hero, rows, md, `docs/${me}_劇情改寫表_${date}.keys.json`);
    // eslint-disable-next-line no-console
    console.log(`寫好了：${md}（${rows.length} 句）`);
  }
});
