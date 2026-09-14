import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * 連線的畫面層有沒有接上會話那幾條規矩（2026-09-14 夜間稽核 高-3、高-4、高-6、高-7、高-11）。
 *
 * 會話本身的時機規則在 `tests/net/coop_flow_0914.test.ts` 測；可是規則寫得再對，
 * 畫面不照著叫就等於沒有——這五條原本就是這樣活下來的：`{ t: 'potion' }`、`{ t: 'choose' }`
 * 早就定義好了，畫面從來沒送過。畫面層沒有測試碰得到兩台連線，所以這裡掃原始碼。
 */
/**
 * 讀檔、統一換行、拿掉註解（工作目錄是 CRLF；註解裡本來就會提到舊寫法，不能讓它誤判）。
 * 只做粗略的剝除：整行註解與行尾的 `// …`，這幾條要找的寫法都不會出現在字串裡。
 */
const code = (path: string): string => readFileSync(path, 'utf-8').split('\r\n').join('\n')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
  .map((l) => l.replace(/\s\/\/ .*$/, ''))
  .join('\n');
const combat = code('src/ui/screens/combat.ts');
const event = code('src/ui/screens/event.ts');
const lines = combat.split('\n');

describe('戰鬥畫面：會改狀態的動作一律走會話', () => {
  it('用忍具、選牌的引擎呼叫都包在 sendOrDo 裡（高-3、高-4）', () => {
    const bare = lines
      .map((l, i) => ({ l, i: i + 1 }))
      .filter(({ l }) => /\b(usePotion|resolveChoice)\(cs\b/.test(l) && !l.includes('sendOrDo('));
    expect(bare.map(({ l, i }) => `${i}: ${l.trim()}`), '直接呼叫引擎＝只有自己這台生效，對帳必定對不上').toEqual([]);
  });

  it('忍具格讀的是我這一位的，不是座位 0 的（高-3）', () => {
    expect(combat, '`cs.potions` 是座位 0 的忍具').not.toMatch(/\bcs\.potions\b/);
    expect(combat, '`potionCapacity(run)` 沒帶座位＝算的是座位 0 的格數').not.toMatch(/potionCapacity\(run\)/);
  });

  it('選牌視窗只在「輪到我選」時開（高-4）', () => {
    const i = combat.indexOf('function syncPicker(): void {');
    expect(i).toBeGreaterThan(0);
    expect(combat.slice(i, i + 2500), '同伴在選的時候不可以攤開他的手牌給我挑').toMatch(/chooserOf\(cs\) !== mySeat/);
  });
});

describe('戰鬥畫面：進場、收回合、分出勝負的時機', () => {
  it('會話在整支畫面的最後才 attach（前面先把回呼掛好、第一次畫面畫好；高-6）', () => {
    const at = combat.lastIndexOf('session?.attach(cs);');
    expect(at, '找不到 attach').toBeGreaterThan(0);
    expect(combat.indexOf('session.onApplied('), 'onApplied 要掛在 attach 之前').toBeLessThan(at);
    expect(combat.indexOf('session.attach(cs)'), '開頭那一行 attach 不可以留著').toBe(-1);
    expect(combat.slice(at).trim(), 'attach 之後就是這支的結尾').toBe('session?.attach(cs);\n});'.trim());
  });

  it('分出勝負就 attach(null)（上一場的請求才不會被套進下一場；高-6）', () => {
    const i = combat.indexOf('function checkOver(): void {');
    expect(combat.slice(i, i + 400)).toContain('session?.attach(null)');
  });

  it('還有人在選牌就先不收回合，免得同一回合記兩張對帳單（審查 中-1）', () => {
    expect(combat).toContain('if (allReady(cs) && !cs.pending) {');
  });

  it('舉手等對方時忍具格不掛「可點」（審查 低-5）', () => {
    expect(combat).toMatch(/canAct\(\) && ready && !p\.ready\) \{ slot\.classList\.add\('usable'\)/);
  });

  it('最後一個人舉手的那一刻 hold，魔物回合演完 release（高-7）', () => {
    const i = combat.indexOf('if (allReady(cs) && !cs.pending) {\n        session.endOfTurn();');
    expect(i, '找不到收回合那一段').toBeGreaterThan(0);
    expect(combat.slice(i, i + 400)).toContain('session.hold();');
    const run = combat.indexOf('function runEnemyTurn(): void {');
    const body = combat.slice(run, combat.indexOf('// ===== 結算與動畫 =====', run));
    expect((body.match(/session\?\.release\(\)/g) ?? []).length, '沒得演、演完，兩個出口都要放開').toBe(2);
  });
});

describe('連線大廳：難度照開房的人選的開（使用者 2026-09-14）', () => {
  it('不再寫死難度 1；宣布開局與自己開局用同一個選好的難度', () => {
    const lobby = code('src/ui/screens/lobby.ts');
    expect(lobby, '原本兩行都寫死 1').not.toMatch(/session\.start\(seed, 1,|begin\(seed, 1,/);
    expect(lobby).toContain('const diff = selectedDifficulty();');
    expect(lobby).toContain('session.start(seed, diff,');
    expect(lobby).toContain('begin(seed, diff,');
    expect(lobby, '大廳要擺得出難度按鈕').toContain('diffPicker()');
  });

  it('只有開房的那一台讀本機的難度設定；加入的那台只用開局訊息裡的難度（審查 低-5）', () => {
    const lobby = code('src/ui/screens/lobby.ts');
    const i = lobby.indexOf('function startCoop(');
    const body = lobby.slice(i, lobby.indexOf('\n}\n', i));
    expect(body.match(/selectedDifficulty\(\)/g)?.length, '讀設定的地方只能有主機那一行').toBe(1);
    expect(body.indexOf('selectedDifficulty()'), '那一行要在主機那一支裡').toBeGreaterThan(body.indexOf('if (isHost) {'));
    expect(body, '客戶端照宣布的難度開').toMatch(/onStartRun\(\(seed, diff, _enc, heroes\) => begin\(seed, diff, heroes\)\)/);
  });
});

describe('戰利品畫面：沒得升級也要投空票（高-18）', () => {
  it('鏡子走廊打贏、牌組裡沒有可以升級的牌：投一張空的 rwup，不然同伴的「繼續」永遠等不到', () => {
    const reward = code('src/ui/screens/reward.ts');
    const i = reward.indexOf('else if (want === 0 && !upsPicked && !iDown && app.coop) {');
    expect(i, '找不到「沒得升」那一支').toBeGreaterThan(0);
    expect(reward.slice(i, i + 600)).toContain(`pick('rwup', '')`);
  });
});

describe('事件畫面：倒下的人也要跟著進戰鬥（高-11）', () => {
  it('自己沒有結果時，照站著那位要打的那一場進去', () => {
    expect(event).toMatch(/outcomes\.find\(\(o\) => !!o && 'fight' in o\)/);
    expect(event).toMatch(/settle\(outcomes\[seat\] \?\? fightOf,/);
  });
});
