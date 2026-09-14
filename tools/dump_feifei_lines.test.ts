import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { dialogue, eventTextFor, feifeiDialogue, lineFor, storyFor, FEIFEI_BOSS_LINES, FEIFEI_EVENT_LINES } from '../src/content/dialogue';
import { events } from '../src/content/events';
import { enemyById } from '../src/content/enemies';

/*
 * 把**菲菲實際會看到的每一句話**倒成一份 MD 給人審（2026-09-13 使用者要求）。
 *
 * 重點不是「有哪些句子」，是**哪些句子是她自己的字、哪些只是球球的句子機械轉過來的**。
 * 後者唸起來就是球球的口氣配她的名字——使用者實測抓到的
 *「價錢讓我心疼，藥倒是有下本。」就是這樣來的（那本來是球球在賣藥三花貓那個事件講的）。
 *
 * 判準寫死在 `own()`：跟球球那份不一樣、或球球那份根本沒有，就算她自己的。
 * 走 `lineFor` 只被拿掉句尾「喵」的，一律標成「球球的句子」。
 */
const MD = 'docs/菲菲_全部台詞_檢查用.md';

/** 這一句是不是「她自己的字」：跟球球的原句不同就是 */
const own = (mine: string, his?: string): boolean => his === undefined || mine !== his;

const tag = (isOwn: boolean): string => (isOwn ? '' : '　⚠️球球的句子');

/*
 * **只有帶 `DUMP_FEIFEI=1` 才重寫**（2026-09-14 夜間稽核 低-8）。
 * 原本是一般測試，每跑一次全部測試（含推送閘門、線上部署）就把這份 MD 整份重寫——
 * 這份是給人逐句審、在上面做記號的，人改到一半跑一次測試就被蓋掉。
 * 要重新匯出：`DUMP_FEIFEI=1 npx vitest run tools/dump_feifei_lines.test.ts`
 */
it.skipIf(!process.env['DUMP_FEIFEI'])('dump', () => {
  const out: string[] = [];
  const p = (s = '') => out.push(s);

  p('# 菲菲・全部台詞（檢查用）');
  p('');
  p('這份是**遊戲裡實際會顯示給玩家看的字**，不是原始碼。由 `tools/dump_feifei_lines.test.ts` 產生，改完程式重跑就會更新。');
  p('');
  p('標著 ⚠️ 的是**球球的句子機械轉過來的**：只把「球球」換成「菲菲」、句尾的「喵」拿掉，口氣還是球球的。');
  p('沒有標記的是她自己寫過一份的。');
  p('');

  const story = storyFor('feifei');

  // ---- 一、序章 ----
  p('## 一、序章');
  p('');
  for (const l of story.prologue) p(`- **${l.speaker}**：${l.text}`);
  p('');

  // ---- 二、口頭禪 ----
  p('## 二、口頭禪（隨機挑一句）');
  p('');
  const chat: [string, readonly string[], readonly string[]][] = [
    ['開打時', story.battleStart, dialogue.battleStart],
    ['打贏時', story.battleWin, dialogue.battleWin],
    ['飢餓（沒飯糰）', story.hungry, dialogue.hungry],
    ['血剩很少', story.lowHp, dialogue.lowHp],
    ['開紙箱', story.chestLines, dialogue.chestLines],
    ['貓窩・睡覺', story.restNapLines, dialogue.restNapLines],
    ['貓窩・磨針', story.restSharpenLines, dialogue.restSharpenLines],
  ];
  for (const [name, mine, his] of chat) {
    p(`### ${name}（${mine.length} 句）`);
    p('');
    for (const s of mine) p(`- ${s}${tag(own(s, his.includes(s) ? s : undefined))}`);
    p('');
  }

  // ---- 三、過關與結局 ----
  p('## 三、過關、落敗、結局');
  p('');
  const beats: [string, readonly { speaker: string; text: string }[]][] = [
    ['第一關打完', story.actClear1],
    ['第二關打完', story.actClear2],
    ['輸了', story.defeat],
    ['通關', story.victory],
  ];
  for (const [name, lines] of beats) {
    p(`### ${name}`);
    p('');
    for (const l of lines) p(`- **${l.speaker}**：${l.text}`);
    p('');
  }
  p('### 通關旁白（依牌組傾向擇一）');
  p('');
  // 派別寫中文：這份是給使用者逐句檢查的，鍵名（strength、poison…）他看不懂
  const LEANING: Record<string, string> = { strength: '爪力流', stealth: '隱身流', poison: '毒流', block: '蜷縮流' };
  for (const [k, v] of Object.entries(story.victoryNarration)) p(`- **${LEANING[k] ?? k}**：${v}`);
  p('');
  p(`### 高難度後日談\n\n- ${story.hardModeEpilogue}`);
  p('');
  // 這句是**全破之後**結算畫面的最後一句（result.ts），不是打完第一關——標題寫錯過，結果照錯的位置寫了台詞
  p(`### 通關結算畫面的最後一句（全破之後）\n\n- ${story.victoryTeaser}`);
  p('');

  // ---- 四、魔物初遇 ----
  p('## 四、第一次看到每種魔物');
  p('');
  const fm = story.firstMeet;
  const hisFm = dialogue.firstMeet as Record<string, string>;
  for (const [id, line] of Object.entries(fm)) {
    const name = enemyById[id]?.name ?? id;
    p(`- **${name}**：${line}${tag(own(line, hisFm[id]))}`);
  }
  p('');

  // ---- 五、關主與上樓那批 ----
  p('## 五、關主、換階段、上樓（走 `lineFor`）');
  p('');
  p('這一批在原始碼裡寫的是球球的句子，玩菲菲時由 `lineFor` 換掉——');
  p('在 `FEIFEI_BOSS_LINES` 名單裡的整句換成她的，不在名單裡的只拿掉句尾的「喵」。');
  p('');
  /*
   * 第三欄＝**沒有標 `speaker` 的純字串是誰講的**。
   *
   * 少了這一欄會誤標（第一版就誤標了 14 句）：`masterFirstWords` 是**師父**說的
   *（「難逢敵手。」），`shopkeeper` 是**罐頭鋪老闆**說的，兩組都是沒有 speaker 的
   * 字串陣列，當成球球的話就會整批印「⚠️球球的句子」——可是那本來就不該是她的字。
   */
  const bossGroups: [string, unknown, string][] = [
    ['秘笈（5F）', dialogue.secretScroll, '球球'],
    ['打完第一隻精英', dialogue.afterFirstElite, '球球'],
    ['關主前的貓窩', dialogue.restBeforeBossByAct, '球球'],
    ['關主開場', dialogue.bossIntroById, '球球'],
    ['關主開場（通用）', dialogue.bossIntroGeneric, '球球'],
    ['關主被打倒', dialogue.bossDefeatById, '球球'],
    ['關主第二階段', dialogue.bossPhase2ById, '球球'],
    ['關主第二階段（通用）', dialogue.bossPhase2Generic, '球球'],
    ['關主第三階段', dialogue.bossPhase3ById, '球球'],
    ['關主第三階段（通用）', dialogue.bossPhase3Generic, '球球'],
    ['師父的第一句話', dialogue.masterFirstWords, '師父'],
    ['罐頭鋪老闆', dialogue.shopkeeper, '老闆'],
  ];
  const walk = (v: unknown, into: (line: { speaker?: string; text?: string } | string) => void): void => {
    if (typeof v === 'string') { into(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, into); return; }
    if (v && typeof v === 'object') {
      const o = v as { speaker?: string; text?: string };
      if (typeof o.text === 'string') { into(o); return; }
      for (const x of Object.values(v as Record<string, unknown>)) walk(x, into);
    }
  };
  for (const [name, group, bare] of bossGroups) {
    const rows: string[] = [];
    walk(group, (l) => {
      const raw = typeof l === 'string' ? l : (l.text ?? '');
      const who = typeof l === 'string' ? bare : (l.speaker ?? bare);
      if (!raw) return;
      // 只有球球那邊的句子才會被換；旁白、魔物、師父、老闆的台詞原樣顯示
      if (who !== '球球') { rows.push(`- **${who}**：${raw}`); return; }
      const shown = lineFor('feifei', raw);
      rows.push(`- ${shown}${tag(FEIFEI_BOSS_LINES[raw] !== undefined)}`);
    });
    if (!rows.length) continue;
    p(`### ${name}`);
    p('');
    for (const r of rows) p(r);
    p('');
  }

  // ---- 六、事件 ----
  p('## 六、事件（38 個共用 ＋ 她的專屬）');
  p('');
  p('**敘述句是機械替換**（「球球」換成「菲菲」），那部分換個主角照樣通順。');
  p('**引號裡她講的話**在 2026-09-13 由使用者逐句改寫過 82 句；剩下標 ⚠️ 的那幾句是他看過決定維持原樣的。');
  p('');
  for (const e of events) {
    if (e.hero && e.hero !== 'feifei') continue;
    const mine = e.hero === 'feifei';
    p(`### ${e.title}${mine ? '（她專屬）' : ''}`);
    p('');
    const evSaid = /球球：「(.+?)」/su.exec(e.text);
    const evOk = mine || !evSaid || FEIFEI_EVENT_LINES[evSaid[1]!] !== undefined;
    p(`> ${eventTextFor('feifei', e.text)}${evOk ? '' : '　⚠️球球的句子'}`);
    p('');
    for (const c of e.choices) {
      p(`- **選項**：${c.label}`);
      if (!c.result) continue;
      // 標記看的是**她講的那一句有沒有她自己的版本**，不是看整個事件是不是她專屬的。
      // 照事件標的話，82 句改寫進去之後整批還是印「球球的句子」——文件自己說謊。
      const said = /球球：「(.+?)」/su.exec(c.result);
      const rewritten = mine || !said || FEIFEI_EVENT_LINES[said[1]!] !== undefined;
      p(`  - 結果：${eventTextFor('feifei', c.result)}${rewritten ? '' : '　⚠️球球的句子'}`);
    }
    p('');
  }

  writeFileSync(MD, out.join('\n'), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`寫好了：${MD}（${out.length} 行）`);
});
