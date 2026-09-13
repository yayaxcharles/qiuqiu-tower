import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 掃原始碼找「換角色沒換乾淨」的暗病（2026-09-12 使用者實測連抓三個之後補的）。
 *
 * 這一類的共同特徵是**靜音**：畫面照樣有東西、測試照樣全綠、主控台不叫，
 * 只有人眼看得出「牌面寫絕學·絆索、下面卻寫學會了絕學·擒拿手」。
 * 一個一個修不會有終點，要有東西擋著。
 *
 * 三條規則：
 *   1. 畫面層拿牌名一律走 `cardNameFor`（她的牌名跟球球分家）
 *   2. 系統說明不指名角色（詞彙表那批）
 *   3. 句尾的「喵」要過 `lineFor`
 *
 * 忍具與秘寶**不在此限**：那是道具不是角色，磨爪石在她手上還是磨爪石。
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (n.endsWith('.ts')) out.push(p);
  }
  return out;
}

/*
 * **要掃 `src/engine` 與 `src/content`，不只 `src/ui`**（2026-09-13 稽核 低-1）。
 * 第一版只掃畫面層，於是 `engine/run.ts` 的「撿到了「絕學·醉拳」」漏網——
 * 玩菲菲撿到那張，提示寫球球的名字、牌組裡卻是「絕學·亂針」。
 * 引擎內部拿 `def.name` 當**資料**用的地方（不是要顯示給玩家）列在 `ENGINE_OK` 白名單。
 */
const load = (ps: string[]) => ps.map((p) => ({ p, src: readFileSync(p, 'utf-8') }));
/** 牌名那條要掃到引擎：`engine/run.ts` 的「撿到了…」就是在那裡漏的 */
const files = load([...walk('src/ui'), ...walk('src/engine'), ...walk('src/content')]);
/**
 * 「喵」與「磨爪」那兩條**只掃畫面層**：`src/content` 裡是球球自己的台詞與牌名，
 * 本來就該有喵、本來就叫磨爪石，掃進去只會一直誤報。
 */
const uiFiles = load(walk('src/ui'));

/**
 * 這些 `def.name` **不是牌名**，所以不必過 `cardNameFor`：
 * 秘寶、忍具、魔物都是道具或角色，兩邊共用同一個名字（見 `potion_hero.test.ts` 的判準）。
 * 白名單是**逐條列內容**不是逐檔案——整個檔案放行的話，同一支裡新加的牌名就漏掉了。
 */
const NOT_A_CARD = [
  'RELIC_LOG',            // 秘寶發動的紀錄（常數本身）
  '${head}',              // 同上，2026-09-13 起行首改成算出來的（要寫「是誰的秘寶」）
  '忍具帶滿了',            // 換忍具的確認框
  '關主留下的東西',        // 塔主信物（秘寶）
  '想召喚',               // 魔物召喚
  "用了「",               // 用忍具
  'cardStats(c).name',    // mimic 查不到牌時的退路
];
/** 引擎內部拿名字當資料用（排序、比對、匯出），不是顯示給玩家 */
const ENGINE_OK = /deck\.ts|content[\/]cards\.ts|smartbot\.ts|\.name === |localeCompare/;

/**
 * 把註解拿掉再掃：說明文字裡本來就會提到這些寫法。
 * **行數要保住**——整段刪掉會讓報出來的行號往前位移，照著去看會看到別行（第一版就這樣）。
 */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

function scan(re: RegExp, allow?: RegExp, set = files): string[] {
  const bad: string[] = [];
  for (const { p, src } of set) {
    strip(src).split('\n').forEach((l, i) => {
      if (re.test(l) && !(allow && allow.test(l))) bad.push(`${p}:${i + 1}  ${l.trim().slice(0, 100)}`);
    });
  }
  return bad;
}

describe('換角色沒換乾淨的暗病', () => {
  it('畫面層不可以直接拿牌表的 name（要過 cardNameFor）', () => {
    // `cardById[...]`.name` 與 `cardStats(...).name` 是兩個直接來源
    const bad = scan(/cardById\[[^\]]*\]\??\.name|cardStats\([^)]*\)\.name|def\.name\}/, /cardNameFor/)
      .filter((l) => !ENGINE_OK.test(l) && !NOT_A_CARD.some((w) => l.includes(w)));
    expect(bad, `這幾行的牌名沒過 cardNameFor：\n${bad.join('\n')}`).toEqual([]);
  });

  it('確認框與能力牌的標題也要過（那幾支的 def 是牌不是忍具）', () => {
    for (const f of ['src/ui/confirm.ts', 'src/ui/screens/combat.ts']) {
      const src = strip(readFileSync(f, 'utf-8'));
      const bad = src.split('\n')
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /磨利嗎|要放生|能力，這場戰鬥/.test(l) && !/cardNameFor/.test(l));
      expect(bad.map((b) => `${f}:${b.i + 1}`), `${f} 有標題沒過 cardNameFor`).toEqual([]);
    }
  });

  it('「喵」不可以寫死在畫面上（要過 lineFor）', () => {
    const bad = scan(/喵/, /lineFor|speaker:\s*'球球'|\.speaker ===|=== '球球'|feifeiLineOk|qiuqiuLineOk/, uiFiles);
    expect(bad, `這幾行的「喵」沒過 lineFor：\n${bad.join('\n')}`).toEqual([]);
  });

  it('「磨爪」不可以寫死（她磨的是針）', () => {
    const bad = scan(/磨爪(?!石|油)/, /sharpenVerb|'磨爪'/, uiFiles);
    expect(bad, `這幾行寫死了磨爪：\n${bad.join('\n')}`).toEqual([]);
  });

  /*
   * 第四條：**代名詞也要跟著角色走**（2026-09-13 稽核 低-8）。
   *
   * 連線的兩句話寫死了「他」——「替他收回合」與扶人那格的「他回 N 點生命站起來」，
   * 對面坐菲菲時就是性別錯字，而同一個畫面上她的名字就寫在旁邊。
   * 修好了但沒有東西擋下一次：我把三處全改回寫死的「他」，一千多條測試照樣全綠。
   *
   * 白名單放三種：
   *   - `dialogue.ts`／`events.ts`／`content/` 的劇情台詞（本來就該寫死，那是別人在講話）
   *   - `title.ts` 的局面碼說明（泛指「給你碼的那個人」，不是場上的角色）
   *   - `heroselect.ts` 菲菲自己的介紹文（本來就是「她」）
   * 判準只抓**顯示字串裡的裸代名詞**，註解已經被 `strip` 拿掉了。
   */
  it('「他／她」不可以寫死（場上的角色要過 heroPronoun）', () => {
    // **路徑分隔字元在 Windows 是反斜線**：`join()` 吐的是 `src\content\events.ts`，
    // 正規式寫 `content[/]` 一個都對不上，整份白名單等於沒放行（第一版就是這樣紅的）
    const STORY = ['src/content/', 'src/ui/dialogue.ts', 'src/ui/screens/title.ts', 'src/ui/screens/story',
      'src/engine/hero.ts'];   // heroPronoun 自己就住在這裡
    const bad = scan(/['"`][^'"`]*[他她][^'"`]*['"`]/, /heroPronoun|其他|他們|她們/, files)
      .filter((l) => !STORY.some((d) => l.replace(/\\/g, '/').includes(d)))
      // 菲菲自己的介紹文與角色設定文字：講的就是她本人，不是「場上那一位」
      // 選角畫面的角色介紹是**多行字串相接**，續行長 ` + '…'`，所以要連續行一起放行
      .filter((l) => !/hero-blurb|blurb:|tag:|^\S+:\d+\s+\+ '/.test(l));
    expect(bad, `這幾行寫死了代名詞，該用 heroPronoun：\n${bad.join('\n')}`).toEqual([]);
  });
});
