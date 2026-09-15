import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  FEIFEI_BOSS_LINES, FEIFEI_CAST_LINES, FEIFEI_EVENT_LINES, FEIFEI_EVENT_TEXT,
  dialogue, eventTextFor, feifeiDialogue, lineFor, storyFor,
} from '../src/content/dialogue';
import { events } from '../src/content/events';
import { enemyById } from '../src/content/enemies';

/*
 * **菲菲的全部劇情與對白倒成一張「改寫表」**（2026-09-15 使用者：「她的劇情不像人寫的，
 * 出一個所有劇情的表，我讓 GPT 整個改寫」）。
 *
 * 兩個產物：
 *   - `docs/菲菲_劇情改寫表_2026-09-15.md`：給人／GPT 看的表，每句一列、有編號，「改寫」欄留白。
 *   - `docs/菲菲_劇情改寫表_2026-09-15.keys.json`：每個編號對應到程式裡哪個檔、哪個字串（人不用看），
 *     回填腳本 `tools/apply_feifei_table.py` 照它把改寫寫回 `src/content/`。
 *
 * 跟 `dump_feifei_lines.test.ts` 的差別：那份是給人「檢查」用的（標哪些是球球的句子機械轉的）；
 * 這份是給人「改」用的——連還沒有她版本的句子（關主 49 句、事件裡的幾句）也列出來，
 * 填了就會**新增**她的版本（keys 裡標 `map-add`），沒填就維持現狀。
 *
 * 只有帶 `DUMP_FEIFEI=1` 才重寫（理由同另外兩支）：
 *   DUMP_FEIFEI=1 npx vitest run tools/dump_feifei_table.test.ts
 */
const MD = 'docs/菲菲_劇情改寫表_2026-09-15.md';
const KEYS = 'docs/菲菲_劇情改寫表_2026-09-15.keys.json';

type Kind = 'literal' | 'map-add';
interface Row { id: string; where: string; who: string; text: string; file: string; kind: Kind; map?: string; key?: string }

/** 從一段文案裡抓出「球球：「……」」那一句（沒有就回 null） */
function spoken(text: string): string | null {
  const m = /(?:球球|菲菲)：「(.+?)」/su.exec(text);
  return m ? m[1]! : null;
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

it.skipIf(!process.env['DUMP_FEIFEI'])('dump table', () => {
  const rows: Row[] = [];
  const DIALOGUE = 'src/content/dialogue.ts';
  const counters = new Map<string, number>();
  const nextId = (prefix: string): string => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${String(n).padStart(2, '0')}`;
  };
  const lit = (prefix: string, where: string, who: string, text: string, file = DIALOGUE): void => {
    if (!text) return;
    rows.push({ id: nextId(prefix), where, who, text, file, kind: 'literal' });
  };

  const story = storyFor('feifei');

  // ---- 一、序章、過關、落敗、結局 ----
  for (const l of story.prologue) lit('P', '序章（開場影片後的四張幻燈片）', l.speaker, l.text);
  for (const l of story.actClear1) lit('A1', '第一關打完', l.speaker, l.text);
  for (const l of story.actClear2) lit('A2', '第二關打完', l.speaker, l.text);
  for (const l of story.defeat) lit('D', '輸了（倒下）', l.speaker, l.text);
  for (const l of story.victory) lit('V', '通關（打贏師父）', l.speaker, l.text);
  const LEANING: Record<string, string> = { strength: '爪力流', stealth: '隱身流', poison: '毒流', block: '蜷縮流' };
  for (const [k, v] of Object.entries(story.victoryNarration)) lit('VN', `通關旁白（依牌組傾向：${LEANING[k] ?? k}）`, '旁白', v);
  lit('VN', '高難度後日談', '旁白', story.hardModeEpilogue);
  lit('VN', '全破後結算畫面的最後一句', '菲菲', story.victoryTeaser);

  // ---- 二、口頭禪 ----
  const chat: [string, string, readonly string[]][] = [
    ['BS', '開打時（隨機一句）', story.battleStart],
    ['BW', '打贏時（隨機一句）', story.battleWin],
    ['HU', '飢餓、沒飯糰（隨機一句）', story.hungry],
    ['LH', '血剩很少（隨機一句）', story.lowHp],
    ['CH', '開紙箱（隨機一句）', story.chestLines],
    ['RN', '貓窩・睡覺（隨機一句）', story.restNapLines],
    ['RS', '貓窩・磨針（隨機一句）', story.restSharpenLines],
  ];
  for (const [prefix, where, list] of chat) for (const s of list) lit(prefix, where, '菲菲', s);

  // ---- 三、第一次看到每種魔物 ----
  const fmMine = (dialogue as unknown as { firstMeetFeifei?: Record<string, string> }).firstMeetFeifei ?? {};
  for (const [id, line] of Object.entries(story.firstMeet)) {
    const name = enemyById[id]?.name ?? id;
    if (fmMine[id] !== undefined) lit('FM', `第一次遇到「${name}」`, '菲菲', line);
    else rows.push({ id: nextId('FM'), where: `第一次遇到「${name}」（現在是球球的句子轉的）`, who: '菲菲', text: line, file: DIALOGUE, kind: 'map-add', map: 'firstMeetFeifei', key: id });
  }

  // ---- 四、關主、換階段、上樓（走 lineFor 的那批） ----
  const bossGroups: [string, unknown][] = [
    ['秘笈（5F）', dialogue.secretScroll], ['打完第一隻精英', dialogue.afterFirstElite],
    ['關主前的貓窩', dialogue.restBeforeBossByAct], ['關主開場', dialogue.bossIntroById],
    ['關主開場（通用）', dialogue.bossIntroGeneric], ['關主被打倒', dialogue.bossDefeatById],
    ['關主第二階段', dialogue.bossPhase2ById], ['關主第二階段（通用）', dialogue.bossPhase2Generic],
    ['關主第三階段', dialogue.bossPhase3ById], ['關主第三階段（通用）', dialogue.bossPhase3Generic],
  ];
  const seenBoss = new Set<string>();
  const walk = (v: unknown, into: (l: { speaker?: string; text?: string } | string) => void): void => {
    if (typeof v === 'string') { into(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, into); return; }
    if (v && typeof v === 'object') {
      const o = v as { speaker?: string; text?: string };
      if (typeof o.text === 'string') { into(o); return; }
      for (const x of Object.values(v as Record<string, unknown>)) walk(x, into);
    }
  };
  for (const [name, group] of bossGroups) {
    walk(group, (l) => {
      const raw = typeof l === 'string' ? l : (l.text ?? '');
      const who = typeof l === 'string' ? '球球' : (l.speaker ?? '球球');
      if (!raw || who !== '球球' || seenBoss.has(raw)) return;   // 塔主、旁白的句子不是她講的，不在這張表
      seenBoss.add(raw);
      if (FEIFEI_BOSS_LINES[raw] !== undefined) lit('BOSS', name, '菲菲', FEIFEI_BOSS_LINES[raw]!);
      else rows.push({ id: nextId('BOSS'), where: `${name}（現在是球球的句子轉的）`, who: '菲菲', text: lineFor('feifei', raw), file: DIALOGUE, kind: 'map-add', map: 'FEIFEI_BOSS_LINES', key: raw });
    });
  }

  // ---- 五、共用事件裡她開口講的話 ----
  for (const e of events) {
    if (e.hero) continue;
    const push = (where: string, raw: string): void => {
      const his = spoken(raw);
      if (!his) return;
      if (FEIFEI_EVENT_LINES[his] !== undefined) lit('EV', where, '菲菲', FEIFEI_EVENT_LINES[his]!);
      else {
        const now = spoken(eventTextFor('feifei', raw)) ?? '';
        rows.push({ id: nextId('EV'), where: `${where}（現在是球球的句子轉的）`, who: '菲菲', text: now, file: DIALOGUE, kind: 'map-add', map: 'FEIFEI_EVENT_LINES', key: his });
      }
    };
    push(`事件「${e.title}」開頭`, e.text);
    for (const c of e.choices) if (c.result) push(`事件「${e.title}」選「${c.label}」的結果`, c.result);
  }
  // 整句替換的那幾條（含敘述）
  for (const v of Object.values(FEIFEI_EVENT_TEXT)) lit('ET', '共用事件整句（敘述＋她的話，整句都可改）', '旁白／菲菲', v);

  // ---- 六、她的專屬事件（events.ts） ----
  for (const e of events) {
    if (e.hero !== 'feifei') continue;
    lit('FE', `她的專屬事件「${e.title}」開頭`, '旁白／菲菲', e.text, 'src/content/events.ts');
    for (const c of e.choices) if (c.result) lit('FE', `她的專屬事件「${e.title}」選「${c.label}」的結果`, '旁白／菲菲', c.result, 'src/content/events.ts');
  }

  // ---- 七、旁白提到她 ----
  for (const v of Object.values(FEIFEI_CAST_LINES)) lit('CAST', '旁白／別人提到她（不是她講的）', '旁白', v);

  // ---- 八、選角畫面小傳 ----
  const hs = readFileSync('src/ui/screens/heroselect.ts', 'utf-8');
  const blurb = /hero: 'feifei'[\s\S]*?blurb: '((?:[^'\\]|\\.)*)'/.exec(hs);
  if (blurb) lit('BLURB', '選角畫面的小傳', '旁白', blurb[1]!.replace(/\\'/g, "'"), 'src/ui/screens/heroselect.ts');

  // ---- 寫檔 ----
  const out: string[] = [];
  const p = (s = ''): number => out.push(s);
  p('# 菲菲・劇情改寫表（2026-09-15）');
  p('');
  p(`共 **${rows.length} 句**。這是網頁遊戲《爪破魔塔》第三個可選角色「菲菲」在遊戲裡會顯示的全部文字，由 \`tools/dump_feifei_table.test.ts\` 產生。`);
  p('');
  p('## 給改寫者的說明');
  p('');
  p('- **角色**：菲菲是暹羅貓，球球的師妹，比他晚三年入門。怕痛怕到誇張，所以打法是丟毒針、出手的同時先擋好。個性：先道歉、先退開、話講一半、會遲疑，但**要像真人講話**，不要每句都「那個……」「慢一點」——同一個口頭禪整份最多出現幾次就好。');
  p('- 她**不加「喵」**（那是球球的招牌）。稱呼：師父（大俠貓）、師兄（球球）。');
  p('- **只填「改寫」欄**，不要動編號、不要改「說話者」；不想改的句子留空。');
  p('- 引號「」裡是她講的話，引號外是旁白，改寫要保持同樣的結構（旁白不用第一人稱、她的話放在「」裡）。');
  p('- 長度盡量不要超過原文的 1.3 倍（畫面裝不下）。**遊戲名詞不能改**：師父、師兄、小魚乾、飯糰、飛針、毒針、蜷縮、爪力、隱身、忍具、秘寶、魔塔、塔主、關主、貓窩、罐頭鋪、紙箱。');
  p('- 「（現在是球球的句子轉的）」那些列，是目前還沒有她自己版本、只是把球球的句子換名字，最需要重寫。');
  p('');
  const sections: [string, string[]][] = [
    ['一、序章、過關、落敗、結局', ['P', 'A1', 'A2', 'D', 'V', 'VN']],
    ['二、口頭禪（戰鬥中隨機挑一句）', ['BS', 'BW', 'HU', 'LH', 'CH', 'RN', 'RS']],
    ['三、第一次遇到每種魔物', ['FM']],
    ['四、關主、換階段、上樓', ['BOSS']],
    ['五、共用事件裡她講的話', ['EV', 'ET']],
    ['六、她的專屬事件', ['FE']],
    ['七、旁白提到她、選角小傳', ['CAST', 'BLURB']],
  ];
  for (const [title, prefixes] of sections) {
    const mine = rows.filter((r) => prefixes.includes(r.id.replace(/-\d+$/, '')));
    if (!mine.length) continue;
    p(`## ${title}（${mine.length} 句）`);
    p('');
    p('| 編號 | 場合 | 說話者 | 原文 | 改寫 |');
    p('|---|---|---|---|---|');
    for (const r of mine) p(`| ${r.id} | ${cell(r.where)} | ${r.who} | ${cell(r.text)} | |`);
    p('');
  }
  writeFileSync(MD, out.join('\n'), 'utf-8');
  writeFileSync(KEYS, JSON.stringify(rows, null, 1), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`寫好了：${MD}（${rows.length} 句）、${KEYS}`);
});
