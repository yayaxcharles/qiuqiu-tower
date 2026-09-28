/*
 * 配音台詞盤點（2026-09-28）：真的跑一次 storyFor／lineFor／castLineFor，列出「畫面上實際出現」的每一句，
 * 依（說話者, 最終中文）去重。只列主線過場與戰鬥吐槽，不含旁白、事件、商店、問號、連線雙人文字。
 *
 * 用法（這個副本沒裝 node_modules，借主資料夾的 esbuild 打包一次再跑）：
 *   F:\ClaudeWork\qiuqiu-coop\node_modules\.bin\esbuild tools/voice/dump_lines.ts --bundle --platform=node --format=esm --outfile=<暫存>/dump.mjs
 *   node <暫存>/dump.mjs > tools/voice/lines_zh.json
 */
import {
  dialogue, storyFor, lineFor, castLineFor, setCoopStory, coopBossLines, RESTLESS_NAP_LINES,
  type DialogueLine,
} from '../../src/content/dialogue';
import { enemyById } from '../../src/content/enemies';
import { HEROES, type Hero } from '../../src/engine/hero';

/** 說話者 → 聲音角色鍵。`塔主` 依這一場的關主決定；師父（tower_master）就是大俠貓 */
const HERO_KEY: Record<string, Hero> = { 球球: 'ninja', 菲菲: 'feifei', 噹噹: 'dangdang', 封封: 'fengfeng' };
function keyOf(speaker: string, bossId?: string): string | null {
  if (speaker === '旁白') return null;
  if (HERO_KEY[speaker]) return HERO_KEY[speaker]!;
  if (speaker === '大俠貓') return 'daxia';
  if (speaker === '村貓') return 'villager';
  if (speaker === '黑貓忍者頭目') return 'ninja_boss';
  if (speaker === '塔主') return !bossId || bossId === 'tower_master' ? 'daxia' : bossId;
  throw new Error(`未知說話者 ${speaker}`);
}

interface Entry { speaker: string; text: string; ctx: string[] }
const out = new Map<string, Entry>();
const skipped: { why: string; hero: string; ctx: string; speaker: string; text: string }[] = [];

function add(speaker: string, text: string, ctx: string): void {
  const k = `${speaker}|${text}`;
  const e = out.get(k);
  if (e) { if (!e.ctx.includes(ctx)) e.ctx.push(ctx); } else out.set(k, { speaker, text, ctx: [ctx] });
}

/** 字面播的過場（序章、過關、塔頂、落敗、結局）：說話者照寫的 */
function literal(hero: Hero, name: string, lines: DialogueLine[]): void {
  lines.forEach((l, i) => {
    const k = keyOf(l.speaker);
    if (k) add(k, l.text, `${hero}/${name}#${i}`);
  });
}

/** 走 playDialogue 非字面／bossPhaseTalk：球球的句子過 lineFor 換成本機角色、其餘過 castLineFor */
function swapped(hero: Hero, name: string, lines: DialogueLine[], bossId?: string, generic = false): void {
  lines.forEach((l, i) => {
    if (l.speaker === '旁白') return;
    const isHero = l.speaker === '球球';
    const text = isHero ? lineFor(hero, l.text) : castLineFor(hero, l.text);
    // 通用換階段那兩句「塔主」是舞台指示（（氣勢整個變了）），噹噹／封封版改寫成旁白式描述，不是誰在說話
    if (generic && l.speaker === '塔主') { skipped.push({ why: '通用換階段的舞台指示', hero, ctx: name, speaker: l.speaker, text }); return; }
    const k = isHero ? hero : keyOf(l.speaker, bossId);
    if (k) add(k, text, `${hero}/${name}#${i}`);
  });
}

setCoopStory(null);
const BOSSES = Object.keys(dialogue.bossIntroById);
for (const hero of HEROES) {
  const s = storyFor(hero);
  literal(hero, 'prologue', s.prologue);
  literal(hero, 'actClear1', s.actClear1);
  literal(hero, 'actClear2', s.actClear2);
  literal(hero, 'topScene', s.topScene);
  literal(hero, 'defeat', s.defeat);
  // 結局：大俠貓那句依牌組傾向換（masterFirstWords 全部值都列）
  literal(hero, 'victory', s.victory.filter((l) => l.speaker !== '大俠貓'));
  for (const [lean, w] of Object.entries(dialogue.masterFirstWords)) if (s.victory.some((l) => l.speaker === '大俠貓')) add('daxia', w, `${hero}/victory:master:${lean}`);
  add(hero, s.victoryTeaser, `${hero}/result:victoryTeaser`);

  swapped(hero, 'secretScroll', dialogue.secretScroll);
  swapped(hero, 'afterFirstElite', dialogue.afterFirstElite);
  dialogue.restBeforeBossByAct.forEach((ls, i) => swapped(hero, `restBeforeBoss${i + 1}`, ls));
  for (const b of BOSSES) {
    swapped(hero, `bossIntro:${b}`, dialogue.bossIntroById[b]!, b);
    if (dialogue.bossPhase2ById[b]) swapped(hero, `bossPhase2:${b}`, dialogue.bossPhase2ById[b]!, b);
    if (dialogue.bossPhase3ById[b]) swapped(hero, `bossPhase3:${b}`, dialogue.bossPhase3ById[b]!, b);
    if (dialogue.bossDefeatById[b]) swapped(hero, `bossDefeat:${b}`, dialogue.bossDefeatById[b]!, b);
  }
  // 通用換階段：有 phases 卻沒寫專屬台詞的魔物（石獅子、三花貓武僧等精英）會走這兩組
  swapped(hero, 'bossPhase2Generic', dialogue.bossPhase2Generic, undefined, true);
  swapped(hero, 'bossPhase3Generic', dialogue.bossPhase3Generic, undefined, true);

  // 戰鬥與貓窩的吐槽（toast，說話者＝本機角色）
  const barks: [string, readonly string[]][] = [
    ['battleStart', s.battleStart], ['battleWin', s.battleWin], ['hungry', s.hungry], ['lowHp', s.lowHp],
    ['chest', s.chestLines], ['restNap', s.restNapLines], ['restNapRestless', [RESTLESS_NAP_LINES[hero]]],
    ['restSharpen', s.restSharpenLines], ['revive', s.reviveLines], ['ambush', [lineFor(hero, '有伏兵跳出來了喵！')]],
  ];
  for (const [name, xs] of barks) xs.forEach((t, i) => add(hero, t, `${hero}/bark:${name}#${i}`));
  for (const [enemy, t] of Object.entries(s.firstMeet)) add(hero, t, `${hero}/firstMeet:${enemy}`);
}

// 通用開場（bossIntroGeneric）：每隻塔主都有專屬開場，走不到；只記錄
for (const l of dialogue.bossIntroGeneric) skipped.push({ why: '通用關主開場（所有塔主都有專屬開場，走不到）', hero: '*', ctx: 'bossIntroGeneric', speaker: l.speaker, text: l.text });

// 連線劇情（不配音，只算會多出幾句）
const solo = new Set([...out.keys()].map((k) => k.split('|').slice(1).join('|')));
const coopExtra = new Set<string>();
for (const hero of HEROES) for (const partner of HEROES) {
  if (partner === hero) continue;
  setCoopStory({ partner, mirror: partner });
  const s = storyFor(hero);
  const all = [...s.prologue, ...s.actClear1, ...s.actClear2, ...s.topScene, ...s.defeat, ...s.victory,
    ...(['intro', 'phase2', 'phase3'] as const).flatMap((st) => coopBossLines('tower_master', st, hero) ?? [])];
  for (const l of all) if (l.speaker !== '旁白' && !solo.has(l.text)) coopExtra.add(`${l.speaker}|${l.text}`);
}
setCoopStory(null);

const names = Object.fromEntries(Object.entries(enemyById).map(([id, e]) => [id, e.name]));
process.stdout.write(JSON.stringify({ lines: [...out.values()], skipped, coopExtra: [...coopExtra], bossNames: names }, null, 1));
declare const process: { stdout: { write(s: string): void } };
