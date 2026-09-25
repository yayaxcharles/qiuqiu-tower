import { afterEach, describe, expect, it, vi } from 'vitest';
import { _setCoopTextImporterForTest, withCoopText } from '../../src/ui/coop-text-loader';
import { dialogue, feifeiLineOk, qiuqiuLineOk, setCoopStory, type DialogueLine } from '../../src/content/dialogue';
import {
  COOP_BOSS_EXTRA, COOP_REST_BEFORE_BOSS, COOP_REST_CHATS, coopBossPair, coopPairKey, coopRestScene,
} from '../../src/content/coop-pair-text';
import { newCoopRun } from '../../src/engine/run';
import type { Hero } from '../../src/engine/hero';
import type { RunState } from '../../src/engine/types';
import REST from '../../src/ui/screens/rest.ts?raw';
import APP from '../../src/ui/app.ts?raw';
import MAP from '../../src/ui/screens/map.ts?raw';
import PAIR from '../../src/content/coop-pair-text.ts?raw';
import LOADER from '../../src/ui/coop-text-loader.ts?raw';

/*
 * 連線兩隻貓一起爬（2026-09-25，草稿 draft_voice_coop 第 4 節，使用者裁定照做）：
 * ① 關主戰前一晚（每關 14 樓貓窩）六組兩人版，原本兩台各播自己的單人獨白、兩個人各自對空氣講話；
 * ② 每關第一個貓窩兩人閒聊（第一、二關；封封那三組搬原本沒接線的 `fengfengChats`）；
 * ③ 貓又婆婆、詛咒老住持、狸大人三隻關主的開場與倒下，兩位同伴各接一句。
 *
 * 兩台畫面要一樣：內容只由已同步的整局狀態（關數、樓層、兩位角色、倒下、旗標）決定，不多傳網路訊息。
 * 這一支就是證明「兩個座位各自算，算出同一段」。
 */
afterEach(() => setCoopStory(null));

const PAIRS: [Hero, Hero][] = [
  ['ninja', 'feifei'], ['ninja', 'dangdang'], ['ninja', 'fengfeng'],
  ['feifei', 'dangdang'], ['feifei', 'fengfeng'], ['dangdang', 'fengfeng'],
];
const KEY = (a: Hero, b: Hero): string => [a, b].sort().join('+');

/** 兩台機器各一份整局（同一顆種子開局、同一串動作，所以狀態一樣），各自設自己的連線情境 */
function twoSeats(a: Hero, b: Hero, tweak: (r: RunState) => void): { seat0: RunState; seat1: RunState } {
  const seat0 = newCoopRun(`pair-${a}-${b}`, 1, a, b);
  const seat1 = newCoopRun(`pair-${a}-${b}`, 1, a, b);
  tweak(seat0); tweak(seat1);
  return { seat0, seat1 };
}
/** 某一個座位的畫面：先設好這台的連線情境（我是誰、同伴是誰），再照整局狀態算 */
function sceneOn(run: RunState, seat: number): ReturnType<typeof coopRestScene> {
  const mine = run.players[seat]!.hero!;
  const mate = run.players[1 - seat]!.hero!;
  setCoopStory({ partner: mate, mirror: run.players[0]!.hero });
  void mine;
  return coopRestScene(run);
}
/** 呼叫端手上的單人倒下段（`app.ts` 傳的就是這一份） */
const soloOf = (bossId: string): DialogueLine[] => dialogue.bossDefeatById[bossId] ?? [];
function bossOn(run: RunState, seat: number, bossId: string, stage: 'intro' | 'defeat'): DialogueLine[] | null {
  setCoopStory({ partner: run.players[1 - seat]!.hero, mirror: run.players[0]!.hero });
  return coopBossPair(bossId, stage, run.players.map((p) => p.hero), soloOf(bossId));
}

/** 口吻硬規矩：球球每句「喵」結尾，另外三隻一個「喵」都沒有 */
function voiceOk(lines: readonly DialogueLine[], where: string): void {
  for (const l of lines) {
    if (l.speaker === '球球') expect(qiuqiuLineOk(l.text), `${where}：球球沒有喵結尾「${l.text}」`).toBe(true);
    else expect(l.text, `${where}：${l.speaker} 講了喵`).not.toContain('喵');
    if (l.speaker === '菲菲') expect(feifeiLineOk(l.text)).toBe(true);
  }
}
const speakersOf = (lines: readonly DialogueLine[]): Set<string> => new Set(lines.map((l) => l.speaker));
const NAME: Record<Hero, DialogueLine['speaker']> = { ninja: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' };

describe('搭檔鍵：排序過，兩台一樣', () => {
  it('座位對調、同角色、單人', () => {
    expect(coopPairKey(['ninja', 'feifei'])).toBe('feifei+ninja');
    expect(coopPairKey(['feifei', 'ninja'])).toBe('feifei+ninja');
    expect(coopPairKey([undefined, 'dangdang'])).toBe('dangdang+ninja');   // 舊存檔沒寫角色＝球球
    expect(coopPairKey(['ninja', 'ninja'])).toBeNull();
    expect(coopPairKey(['ninja'])).toBeNull();
  });
});

describe('關主戰前一晚：六組兩人版，三關都有', () => {
  it.each(PAIRS)('%s＋%s：三關各一段，兩個人都開口、口吻對', (a, b) => {
    const acts = COOP_REST_BEFORE_BOSS[KEY(a, b)];
    expect(acts, '這一組沒有兩人版').toBeTruthy();
    for (const [i, n] of [[0, 3], [1, 3], [2, 6]] as const) {
      const lines = acts![i]!;
      expect(lines.length, `第 ${i + 1} 關`).toBe(n);
      expect(speakersOf(lines), `第 ${i + 1} 關只有一個人在講`).toEqual(new Set([NAME[a], NAME[b]]));
      voiceOk(lines, `${a}+${b} 第 ${i + 1} 關`);
    }
  });

  it.each(PAIRS)('%s＋%s：14 樓貓窩兩個座位算出同一段，而且取代單人獨白（同一個旗標）', (a, b) => {
    for (const act of [1, 2, 3]) {
      const { seat0, seat1 } = twoSeats(a, b, (r) => { r.act = act; r.floor = (act - 1) * 15 + 14; });
      const s0 = sceneOn(seat0, 0);
      const s1 = sceneOn(seat1, 1);
      expect(s0, `第 ${act} 關沒有兩人版`).not.toBeNull();
      expect(s1).toEqual(s0);
      expect(s0!.flag).toBe(`restBeforeBoss${act}`);
      expect(s0!.lines).toEqual(COOP_REST_BEFORE_BOSS[KEY(a, b)]![act - 1]);
      // 座位對調（b 坐 0 號）也是同一段
      const swapped = newCoopRun(`pair-${b}-${a}`, 1, b, a);
      swapped.act = act; swapped.floor = (act - 1) * 15 + 14;
      expect(coopRestScene(swapped)).toEqual(s0);
    }
  });

  it('有人倒下就退回單人獨白（不對著躺著的人聊天）；一個人玩、同角色都不演兩人版', () => {
    const { seat0 } = twoSeats('ninja', 'feifei', (r) => { r.act = 3; r.floor = 44; r.players[1]!.down = true; });
    expect(coopRestScene(seat0)).toBeNull();
    const same = newCoopRun('same', 1, 'dangdang', 'dangdang');
    same.act = 3; same.floor = 44;
    expect(coopRestScene(same)).toBeNull();
  });
});

describe('每關第一個貓窩：兩人閒聊', () => {
  it.each(PAIRS)('%s＋%s：兩段各三句，兩個人都開口、口吻對', (a, b) => {
    const chats = COOP_REST_CHATS[KEY(a, b)];
    expect(chats, '這一組沒有閒聊').toBeTruthy();
    for (const seg of chats!) {
      expect(seg.length).toBe(3);
      expect(speakersOf(seg)).toEqual(new Set([NAME[a], NAME[b]]));
      voiceOk(seg, `${a}+${b} 閒聊`);
    }
  });

  it.each(PAIRS)('%s＋%s：第一、二關第一個貓窩播，兩台同一段；播過就不再播；第三關不播', (a, b) => {
    for (const act of [1, 2]) {
      const { seat0, seat1 } = twoSeats(a, b, (r) => { r.act = act; r.floor = (act - 1) * 15 + 6; });
      const s0 = sceneOn(seat0, 0);
      expect(s0, `第 ${act} 關第一個貓窩沒有閒聊`).not.toBeNull();
      expect(sceneOn(seat1, 1)).toEqual(s0);
      expect(s0!.flag).toBe(`coopChat${act}`);
      expect(s0!.lines).toEqual(COOP_REST_CHATS[KEY(a, b)]![act - 1]);
      // 同一關的下一個貓窩：兩台都已經設過旗標（playOnce 兩台各設一次），不再播
      seat0.flags[s0!.flag] = true; seat1.flags[s0!.flag] = true;
      seat0.floor += 3; seat1.floor += 3;
      expect(sceneOn(seat0, 0)).toBeNull();
      expect(sceneOn(seat1, 1)).toBeNull();
    }
    const { seat0: third } = twoSeats(a, b, (r) => { r.act = 3; r.floor = 36; });
    expect(coopRestScene(third), '第三關的戲是 44 樓那段，這裡不播閒聊').toBeNull();
  });

  it('封封那三組是原本躺著沒接線的 `fengfengChats` 那 18 句，一字不改搬過來（拆成前後兩段）', () => {
    const texts = (k: string): string[] => COOP_REST_CHATS[k]!.flat().map((l) => `${l.speaker}：${l.text}`);
    expect(texts('fengfeng+ninja')).toEqual([
      '球球：你帶了多少飯糰，袋子這麼鼓喵？', '封封：裡面是替換的衣服。飯糰在你那袋。', '球球：難怪我這袋比較香喵。',
      '球球：下次我也試試拿劍，怎麼樣喵？', '封封：可以，先用木劍。院子裡的竹架也先搬走。', '球球：你還記得那個竹架喵。']);
    expect(texts('feifei+fengfeng')).toEqual([
      '菲菲：這包藥怎麼分成三層？', '封封：山上常下雨。外面濕了，裡面還能用。', '菲菲：留一張油紙給我，針筒也要包。',
      '封封：手怎麼了？剛才碰到針了？', '菲菲：沒有，是竹筒的扣環夾到了。', '封封：我幫你按住，你把手抽出來。']);
    expect(texts('dangdang+fengfeng')).toEqual([
      '噹噹：劍鞘的扣帶還會鬆嗎？', '封封：不會。你上次補的那一針很牢。', '噹噹：那是鉚釘。別拿針去補。',
      '封封：你那對護臂要不要放下？坐著還戴著。', '噹噹：一邊的扣帶卡住了，幫我拉一下。', '封封：手放鬆。好了，拿下來了。']);
  });

  it('有人倒下這一格不播，也不算播過（留到同一關下一個貓窩）', () => {
    const { seat0 } = twoSeats('ninja', 'dangdang', (r) => { r.act = 1; r.floor = 5; r.players[0]!.down = true; });
    expect(coopRestScene(seat0)).toBeNull();
    seat0.players[0]!.down = false; seat0.floor = 9;
    expect(coopRestScene(seat0)?.flag).toBe('coopChat1');
  });

  it('14 樓那一格讓給關主前一晚（第一關第一個貓窩剛好是 14 樓也一樣）', () => {
    const { seat0 } = twoSeats('ninja', 'fengfeng', (r) => { r.act = 1; r.floor = 14; });
    expect(coopRestScene(seat0)?.flag).toBe('restBeforeBoss1');
  });
});

describe('三隻關主的同伴接話', () => {
  const BOSSES = ['nekomata', 'hex_abbot', 'tanuki_lord'] as const;

  it.each(PAIRS)('%s＋%s：三隻的開場與倒下都有，兩個座位算出同一段，兩個人各接一句', (a, b) => {
    for (const boss of BOSSES) {
      for (const stage of ['intro', 'defeat'] as const) {
        const { seat0, seat1 } = twoSeats(a, b, () => undefined);
        const l0 = bossOn(seat0, 0, boss, stage);
        expect(l0, `${boss} ${stage} 沒有兩人版`).not.toBeNull();
        expect(bossOn(seat1, 1, boss, stage)).toEqual(l0);
        expect(coopBossPair(boss, stage, [b, a], soloOf(boss)), '座位對調').toEqual(l0);
        const said = l0!.filter((l) => l.speaker !== '塔主' && l.speaker !== '旁白');
        expect(new Set(said.map((l) => l.speaker)), `${boss} ${stage}`).toEqual(new Set([NAME[a], NAME[b]]));
        expect(said.length).toBe(2);
        expect(l0!.some((l) => l.speaker === '塔主'), '關主自己不講話了').toBe(true);
        voiceOk(l0!, `${a}+${b} ${boss} ${stage}`);
      }
    }
  });

  it('老住持倒下：他自己那幾句照單人版（改了原文也跟著走），後面接兩人；單人那句「好，我去叫他喵」不播', () => {
    const solo = dialogue.bossDefeatById['hex_abbot']!;
    const his = solo.filter((l) => l.speaker !== '球球');
    for (const [a, b] of PAIRS) {
      const lines = coopBossPair('hex_abbot', 'defeat', [a, b], solo)!;
      expect(lines.slice(0, his.length)).toEqual(his);
      expect(lines.map((l) => l.text)).not.toContain('好，我去叫他喵。');
      expect(lines.length).toBe(his.length + 2);
    }
    // 表裡不自己抄住持那幾句原文（另一位編劇會改那一句）
    expect(JSON.stringify(COOP_BOSS_EXTRA['hex_abbot'])).not.toContain('上面那位陷得比貧僧深得多');
  });

  it('只有這三隻；師父、其他七隻照舊回 null，一個人玩也回 null', () => {
    expect(coopBossPair('tower_master', 'intro', ['ninja', 'feifei'])).toBeNull();
    for (const boss of ['iron_claw', 'orange_king', 'cowcat_boss', 'persian_lady', 'frog_daimyo', 'armadillo_king', 'dragon_cat']) {
      expect(coopBossPair(boss, 'intro', ['ninja', 'feifei']), boss).toBeNull();
      expect(coopBossPair(boss, 'defeat', ['ninja', 'feifei']), boss).toBeNull();
    }
    expect(coopBossPair('nekomata', 'intro', ['ninja'])).toBeNull();
    expect(coopBossPair('nekomata', 'intro', ['feifei', 'feifei'])).toBeNull();
  });
});

describe('接線：畫面照已同步的整局狀態挑、照字面播', () => {
  const src = (s: string): string => s.replace(/\r\n/g, '\n');

  it('貓窩：連線走 coopRestScene，照字面播（不再過 lineFor），沒有才退回單人獨白', () => {
    const r = src(REST);
    expect(r).toContain('coopRestScene(run)');
    expect(r).toMatch(/app\.playOnce\(scene\.flag, scene\.lines, [^\n]*, true\)/);
    expect(r).toContain('dialogue.restBeforeBossByAct');
  });

  it('關主開場與倒下：連線查 coopBossPair（用整局的兩位角色），拿到就照字面播', () => {
    const a = src(APP);
    expect(a).toMatch(/coopBossPair\(bossId, 'intro', heroes\)/);
    expect(a).toMatch(/coopBossPair\(bossId, 'defeat', heroes, outro\)/);
    expect(a).toContain('run.players.map((p) => p.hero)');
  });

  it('地圖畫面在連線時先在背景抓這份文字', () => {
    expect(src(MAP)).toContain('loadCoopText()');
  });

  it('兩人版文字是延後載入的一塊（首載預算只剩一點點）：那一支只收型別、畫面層只經過載入器', () => {
    const imports = src(PAIR).split('\n').filter((l) => l.startsWith('import '));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((l) => !l.startsWith('import type ')), '執行期從首載拿東西，打包會把首載切碎').toEqual([]);
    for (const s of [REST, APP, MAP]) expect(src(s)).not.toMatch(/from '[^']*coop-pair-text'/);
    expect(src(LOADER)).toContain("import('../content/coop-pair-text')");
  });

  it('網路很慢：等超過上限就退回單人版（關主開場不能一直卡著），之後才到也不會再叫第二次', async () => {
    vi.useFakeTimers();
    try {
      let arrive!: (m: never) => void;
      _setCoopTextImporterForTest(() => new Promise((r) => { arrive = r; }));
      const got: unknown[] = [];
      withCoopText((m) => got.push(m), 3000);
      await vi.advanceTimersByTimeAsync(2999);
      expect(got).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(got).toEqual([null]);
      arrive({} as never);
      await vi.advanceTimersByTimeAsync(0);
      expect(got).toEqual([null]);
    } finally {
      vi.useRealTimers();
      _setCoopTextImporterForTest(() => import('../../src/content/coop-pair-text'));
    }
  });
});
