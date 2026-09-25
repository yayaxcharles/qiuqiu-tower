import { describe, expect, it } from 'vitest';
import { DANGDANG_STARTER_DECK, FEIFEI_STARTER_DECK, FENGFENG_STARTER_DECK, STARTER_DECK, cardById, cards } from '../../src/content/cards';

describe('牌資料', () => {
  it('數量：起手 12、忍術 143、絕學 66、壞毛病 10（含 2 張戰鬥雜牌）', () => {
    const count = (pool: string) => cards.filter((c) => c.pool === pool).length;
    // 起手 3→6：2026-09-12 菲菲的三種起手牌（飛針、退開、淬毒）
    // 6→9：2026-09-17 噹噹的三種起手牌（正拳、架盤、回敬）
    // 9→12：2026-09-20 封封的平斬、護身、吐納
    expect(count('起手')).toBe(12);
    // 忍術 61→67：2026-09-11 的九張連線牌（`coop: true`，只有雙人局才進池）；
    // 67→84、絕學 39→44：2026-09-12 菲菲的 22 張專屬牌（`hero: 'feifei'`）。
    // 兩批都掛 `hidden`，圖到齊才會進獎勵與罐頭鋪
    // 95→96：2026-09-14 菲菲的分身術分成她自己那張（疊毒，`feifei_fenshen`）
    // 96→97：2026-09-14 影子分身分成球球（原版）與菲菲（9/12 改版 `feifei_yingzi`）兩張
    // 97→98、51→52：2026-09-15 幫同伴回血的兩張連線牌（魚乾急救進忍術、一起喘口氣進絕學）
    // 98→118：2026-09-17 噹噹的 20 張忍術（常見 8、罕見 11、稀有 1）
    // 118→119：2026-09-17 橋接牌四張換掉三張（連環撞、迴力鏢、卸甲）
    // 141→143、絕學 65→66：2026-09-25 菲菲補爪力牌的缺那三張毒系牌（補一針、看準破綻進忍術，越撒越順手進絕學）
    // 143→146：2026-09-25 封封補三張花氣打傷害（順手一劍、連環三劍、一口氣）
    expect(count('忍術')).toBe(146);   // 119→141：封封 22 張非起手忍術
    expect(count('絕學')).toBe(66);   // 58→65：封封 7 張絕學
    // 壞毛病 8→10：2026-09-02 第二波魔物塞牌用的黏液、眼冒金星（`combatOnly`，只有戰鬥中拿得到）
    expect(count('壞毛病')).toBe(10);
    expect(cards.filter((c) => c.combatOnly).map((c) => c.id)).toEqual(['slime_card', 'dazed_card']);
    expect(cards.length).toBe(234);   // 196→228：2026-09-20 封封 32 張；228→231：2026-09-25 菲菲三張毒系牌；231→234：同日封封三張
  });
  it('id 與名稱不重複', () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(new Set(cards.map((c) => c.name)).size).toBe(cards.length);
    for (const c of cards) expect(cardById[c.id]).toBe(c);
  });
  it('費用 0～3，插圖鍵就是自己的牌號', () => {
    // 2026-08-30 起每張牌都有專屬插圖，鍵一律是 `card/<自己的 id>`。
    // 這條比「格式對不對」嚴格：兩張牌不小心指到同一張圖也會被抓到。
    for (const c of cards) {
      expect(c.cost, c.name).toBeGreaterThanOrEqual(0);
      expect(c.cost, c.name).toBeLessThanOrEqual(3);
      expect(c.art, c.name).toBe(`card/${c.id}`);
    }
  });
  it('非壞毛病的牌都有升級內容', () => {
    for (const c of cards.filter((x) => x.pool !== '壞毛病')) {
      const u = c.upgrade;
      expect(u.cost !== undefined || u.effects !== undefined || u.keywords !== undefined, c.name).toBe(true);
    }
  });
  it('壞毛病一律不可打出且無效果（戰鬥雜牌除外）', () => {
    // 戰鬥雜牌（黏液）是**打得出來**的：規則就是「花 1 顆飯糰把它甩掉」，所以另外驗
    for (const c of cards.filter((x) => x.pool === '壞毛病' && !x.combatOnly)) {
      expect(c.keywords).toContain('不可打出');
      expect(c.effects).toEqual([]);
    }
  });
  it('戰鬥雜牌：沒有效果、進得了牌堆卻留不下來', () => {
    for (const c of cards.filter((x) => x.combatOnly)) {
      expect(c.pool, c.name).toBe('壞毛病');
      expect(c.effects, c.name).toEqual([]);
      // 兩張都走消耗（2026-09-04 眼冒金星從不可打出＋虛幻改成 0 費消耗）——不會賴在牌堆裡
      const kw = c.keywords ?? [];
      expect(kw.includes('消耗') || kw.includes('虛幻'), c.name).toBe(true);
    }
  });
  it('目標模式與效果一致', () => {
    for (const c of cards) {
      const hitsAll = c.effects.some((e) => ('target' in e && e.target === 'all'));
      const hitsOne = c.effects.some((e) =>
        (e.kind === 'damage' && e.target !== 'all') || e.kind === 'damageSpendQi' || e.kind === 'damageRamp' || e.kind === 'damageRandom' || e.kind === 'damageEqualBlock' ||
        e.kind === 'stealBlock' || e.kind === 'transferDebuffs' || e.kind === 'removeStatuses' ||
        (e.kind === 'status' && e.target === 'enemy') || e.kind === 'drawIfTargetStatus' || e.kind === 'doubleStatus' ||
        // 菲菲的三張（2026-09-12）：遠射／見血封喉／一針斃命都是指定一隻打
        e.kind === 'damageByStatus' || e.kind === 'execByStatus' || e.kind === 'spreadStatus' ||
        // 噹噹的兩種（2026-09-17）：卸蜷縮打人、照自己的反彈打。
        // `damageSpendBlock` 打全體時自己帶 `target: 'all'`，上面的 `hitsAll` 會先接住
        e.kind === 'damageSpendBlock' || e.kind === 'damageByOwnStatus' ||
        // 連線支援牌 B 批（2026-09-13）：這兩個也是「指定一隻」——
        // `damageFromAllyStrength` 的傷害是排進佇列的，效果表上看不到 `damage`，
        // 所以要在這裡點名，不然它會被判成 self（這條測試就是這樣抓到的）
        e.kind === 'damageFromAllyStrength' || e.kind === 'transferDebuffsFromAlly' ||
        e.kind === 'drawAllyIfTargetStatus');
      if (hitsAll) expect(c.target, c.name).toBe('all');
      else if (hitsOne) expect(c.target, c.name).toBe('enemy');
      else if (c.pool === '壞毛病') expect(c.target, c.name).toBe('none');
      else expect(c.target, c.name).toBe('self');
    }
  });
  it('連抓加成的牌有上限', () => {
    for (const c of cards) for (const e of c.effects)
      if (e.kind === 'damage' && e.scaleWithCombo) expect(e.comboCap, c.name).toBeGreaterThan(0);
  });
  it('起手牌組 10 張', () => {
    expect(FEIFEI_STARTER_DECK.length, '菲菲也是十張').toBe(10);
    expect(DANGDANG_STARTER_DECK.length, '噹噹也是十張').toBe(10);
    expect(FENGFENG_STARTER_DECK, '封封起手固定為四攻、四防、二吐納').toEqual([
      'fengfeng_pingzhan', 'fengfeng_pingzhan', 'fengfeng_pingzhan', 'fengfeng_pingzhan',
      'fengfeng_hushen', 'fengfeng_hushen', 'fengfeng_hushen', 'fengfeng_hushen',
      'fengfeng_tuna', 'fengfeng_tuna',
    ]);
    expect(DANGDANG_STARTER_DECK.filter((id) => id === 'dangdang_zhengquan').length).toBe(5);
    expect(DANGDANG_STARTER_DECK.filter((id) => id === 'dangdang_jiapan').length).toBe(4);
    for (const id of DANGDANG_STARTER_DECK) expect(cardById[id]?.pool, id).toBe('起手');
    // 形狀跟球球一樣：5 攻＋4 防＋1 招牌技
    expect(FEIFEI_STARTER_DECK.filter((id) => id === 'feifei_feizhen').length).toBe(5);
    expect(FEIFEI_STARTER_DECK.filter((id) => id === 'feifei_tuikai').length).toBe(4);
    for (const id of FEIFEI_STARTER_DECK) expect(cardById[id]?.pool, id).toBe('起手');
    expect(STARTER_DECK).toEqual([
      'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo',
      'tanding', 'tanding', 'tanding', 'tanding', 'kawarimi',
    ]);
    for (const id of STARTER_DECK) expect(cardById[id]?.pool).toBe('起手');
  });

  it('待圖 hidden＝還沒有牌面圖；有圖的不可以還掛著 hidden；獎勵池抽不到 hidden', async () => {
    const { rollCardChoices } = await import('../../src/engine/rewards');
    const { Rng, seedFromString } = await import('../../src/engine/rng');
    const manifest = (await import('../../public/assets/manifest.json')).default as { cards: Record<string, string> };
    /*
     * **「有圖」的判準要看「每一個拿得到這張牌的角色都有圖」**（2026-09-13）。
     *
     * 原本只看 `manifest.cards[c.art]`（球球那張）。連線牌兩個角色都拿得到，
     * 球球那張先生好、她那張還在跑的時候，這條就會逼人提早拿掉 `hidden`——
     * 一拿掉，菲菲在獎勵畫面就會看到**球球的圖**。
     * 那正是使用者這一整天回報最多次的那類問題（紙箱、事件圖、迷路的小黑貓），
     * 只是這次會從牌面再發生一遍。
     */
    const artReady = (c: typeof cards[number]): boolean => {
      if (!manifest.cards[c.art]) return false;
      // 綁角色的牌，`c.art` 就是那位自己的圖
      if (c.hero === 'feifei' || c.hero === 'ninja' || c.hero === 'dangdang' || c.hero === 'fengfeng') return true;
      // 起手牌是照職業發固定清單的，她永遠拿不到球球那四張（貓抓、淡定…），不需要她的版本
      if (c.pool === '起手') return true;
      return !!manifest.cards[c.art.replace('card/', 'card/feifei_')];
    };
    for (const c of cards) {
      expect(artReady(c), `${c.name}：兩個角色的圖都齊了=${artReady(c)}、hidden=${!!c.hidden}`).toBe(!c.hidden);
    }
    /*
     * 菲菲版的共用牌面（2026-09-12「牌全部分家」）：`card/feifei_<牌號>` 是**選配**——
     * 有就用她的、沒有就退回球球那張（`assets.cardArtKey`）。所以這裡只驗「不能有孤兒」：
     * 每一個 feifei_ 前綴的圖都要對得到一張真的牌，不然就是生錯檔名、永遠不會被用到。
     */
    for (const key of Object.keys(manifest.cards)) {
      const m = /^card\/feifei_(.+)$/.exec(key);
      if (!m) continue;
      const id = m[1]!;
      expect(cardById[id] ?? cardById[`feifei_${id}`], `${key} 對不到任何一張牌`).toBeTruthy();
    }
    for (let seed = 0; seed < 300; seed++) {
      for (const pool of ['忍術', '絕學'] as const) {
        for (const c of rollCardChoices(new Rng(seedFromString('hidden-' + seed)), pool, 6, [], true, 0)) expect(c.hidden).toBeUndefined();
      }
    }
  });
});

/**
 * 升級之後玩家要看得出差別（2026-09-17）。
 *
 * 菲菲的絆線升級是定身 1 層→2 層，可是「定身」被列進 `ONE_SHOT`（牌面不寫層數），
 * 於是升級前後印出來一模一樣——磨了一張牌回來，完全看不出多了什麼。
 * 規格 §6.1 那句「定身術、點穴手都只寫『給目標定身』」是對**只給 1 層**的牌講的。
 */
describe('升級要看得出來', () => {
  it('沒有一張牌升級之後牌面跟費用都沒變', async () => {
    const { describeCard } = await import('../../src/ui/cardtext');
    const same = cards
      .filter((c) => c.pool !== '壞毛病')
      .filter((c) => describeCard(c, false) === describeCard(c, true)
        && (c.upgrade.cost === undefined || c.upgrade.cost === c.cost))
      .map((c) => `${c.name}｜${describeCard(c, false)}`);
    expect(same, `這幾張升級之後玩家看不出差別：\n  ${same.join('\n  ')}`).toEqual([]);
  });

  it('絆線升級之後牌面真的寫出兩層', async () => {
    const { describeCard } = await import('../../src/ui/cardtext');
    const c = cardById['feifei_banxian']!;
    expect(describeCard(c, false), '只給 1 層時照舊不寫層數').toBe('給目標定身，獲得 4 點蜷縮。');
    // 措辭照全遊戲一致的「N 層<狀態>」（跟「給目標 2 層翻肚」同一個形狀）
    expect(describeCard(c, true)).toBe('給目標 2 層定身，獲得 4 點蜷縮。');
  });
});

/**
 * 專屬牌號不可以撞到「共用牌的他版」換算出來的鍵（2026-09-17）。
 *
 * `assets.ts` 的 `cardArtKey()` 把共用牌換成某位角色的版本時，查的是
 * `card/<角色>_<共用牌號>`。所以只要有一張專屬牌剛好叫 `<角色>_<某張共用牌的牌號>`，
 * 那位角色抽到那張共用牌時，看到的就是自己專屬牌的圖。
 *
 * 實際踩過：噹噹的「借力」叫 `dangdang_jieli`，而共用牌「絕學·卸勁」的牌號就是 `jieli`；
 * 「站樁」對上「絕學·護心」同理。病根是那天把他的牌號從 `dd_` 改成 `dangdang_`
 *（為了讓 `heroOfKey` 認得出來、不要掉進首載），解決了首載卻撞進共用牌的命名空間。
 * 菲菲沒踩到只是運氣——她的專屬牌號本來就帶前綴，而共用牌裡沒有同名的。
 */
describe('專屬牌號不可以撞到共用牌的他版', () => {
  it('掃每一位角色', async () => {
    const { HEROES } = await import('../../src/engine/hero');
    const shared = cards.filter((c) => !c.hero);
    const bad: string[] = [];
    for (const hero of HEROES) {
      const his = new Set(cards.filter((c) => c.hero === hero).map((c) => c.id));
      for (const c of shared) {
        const key = `${hero}_${c.id}`;
        if (his.has(key)) {
          const mine = cards.find((x) => x.id === key)!;
          bad.push(`${hero}：共用「${c.name}」會查 card/${key}，那是他自己的「${mine.name}」`);
        }
      }
    }
    expect(bad, `這幾張會顯示錯誤的牌面圖：\n  ${bad.join('\n  ')}`).toEqual([]);
  });
});
