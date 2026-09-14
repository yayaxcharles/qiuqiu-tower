import { describe, expect, it } from 'vitest';
import { relics } from '../../src/content/relics';
import { rollRelic, rollRelicChoices } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';

/**
 * 有些人抽不到的秘寶（2026-09-12）。
 *
 * 理由是**平衡取捨**，不是「零效果」——早先的說法站不住腳，見 `RelicDef.notFor`。
 * 紙袋與影披風都是「獲得隱身時多幾層」的放大器，而取得隱身的 11 張牌整套是忍者獨占的，
 * 菲菲身上一張都沒有；影披風還是塔主三選一，抽到等於少一個選項。
 *
 * **只給隱身的那幾件不算**（鈴鐺、無聲鈴、風鈴）：那些自己就會生隱身，
 * 而且她沒有別的閃避手段，對她反而珍貴。
 */
describe('有些人抽不到的秘寶', () => {
  const locked = relics.filter((r) => r.notFor?.length);

  it('只鎖「放大器」，不鎖會自己生隱身的那幾件', () => {
    expect(locked.map((r) => r.id).sort()).toEqual(['paper_bag', 'shadow_cloak']);
    for (const id of ['bell', 'silent_bell', 'wind_chime']) {
      const r = relics.find((x) => x.id === id);
      if (r) expect(r.notFor, `${r.name} 不該被鎖`).toBeUndefined();
    }
  });

  it('菲菲抽不到那兩件，球球抽得到', () => {
    const drawn = (heroes: string[]) => {
      const got = new Set<string>();
      for (let i = 0; i < 400; i++) {
        for (const pool of ['大魔物', '塔主'] as const) {
          const id = rollRelic(new Rng(seedFromString(`r-${pool}-${i}`)), pool, [], heroes);
          if (id) got.add(id);
        }
      }
      return got;
    };
    const hers = drawn(['feifei']);
    for (const r of locked) expect(hers.has(r.id), `${r.name} 被菲菲抽到了`).toBe(false);
    const his = drawn(['ninja']);
    expect(locked.some((r) => his.has(r.id)), '球球一件都沒抽到，測試本身可能失效了').toBe(true);
  });

  it('連線時只要有一位用得到就留著', () => {
    // 影披風對球球有用、對菲菲沒用；兩個人一起玩時球球拿得到，所以照樣該出現
    const got = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const id of rollRelicChoices(new Rng(seedFromString(`c-${i}`)), '塔主', [[], []], 2, ['feifei', 'ninja'])) {
        got.add(id);
      }
    }
    expect(got.has('shadow_cloak'), '兩個人的局也抽不到影披風').toBe(true);
  });

  it('武士一點都沒被動到（他不在排除清單裡）', () => {
    // 早先寫成 `hero: 'ninja'`＝「只有忍者抽得到」，那會**連武士一起排掉**，
    // 他同種子的秘寶結果就跟改動前不一樣了。改成排除清單之後他不受影響
    const got = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const pool of ['大魔物', '塔主'] as const) {
        const id = rollRelic(new Rng(seedFromString(`s-${pool}-${i}`)), pool, [], ['samurai']);
        if (id) got.add(id);
      }
    }
    for (const r of locked) expect(got.has(r.id), `武士抽不到 ${r.name} 了`).toBe(true);
  });

  it('沒傳職業時當忍者（單機舊呼叫端不用改）', () => {
    const a = rollRelic(new Rng(seedFromString('same')), '塔主', []);
    const b = rollRelic(new Rng(seedFromString('same')), '塔主', [], ['ninja']);
    expect(a).toBe(b);
  });
});

/**
 * 整局跑一遍，確認**每一條拿秘寶的路**都濾過。
 *
 * 2026-09-12 實戰樣本抓到：我只補了「戰利品」與「紙箱」，**漏掉罐頭鋪**，
 * 她照樣在店裡買到紙袋。秘寶有五個入口（戰利品、紙箱、過關三選一、罐頭鋪、事件），
 * 逐個補很容易漏一個——所以這條測試直接跑整局看最後身上有什麼。
 */
describe('每一條拿秘寶的路都要濾', () => {
  /*
   * 秘寶有五個入口：戰利品、紙箱、過關三選一、**罐頭鋪**、事件。
   * 2026-09-12 我只補了前兩個，實戰樣本才抓到「她在店裡買到紙袋」。
   *
   * **直接測每個入口的函式**，不要靠「跑幾十局看會不會剛好撞到」——
   * 第一版就是那樣寫的，把罐頭鋪的濾網拆掉之後測試照樣全綠，等於沒有守到。
   */
  const banned = relics.filter((r) => r.notFor?.includes('feifei')).map((r) => r.id);

  it('罐頭鋪的貨架', async () => {
    const { newRun, makeShop } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const run = newRun(`shop-${i}`, 1, 'feifei');
      run.act = 2;                                    // 第二關起貨架會多一件大魔物池的
      for (const it of makeShop(run).relics) if (banned.includes(it.id)) bad.push(`${i}: ${it.id}`);
    }
    expect(bad, `罐頭鋪賣了球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  /*
   * 紙箱從「常見」池開始抽，而被鎖的兩件都在大魔物／塔主池——
   * 拿全新的局測 120 次也**永遠測不到**（第一版就是那樣寫的，拆掉濾網照樣全綠）。
   * 所以要先把常見池整池塞給她，逼紙箱退到下一池。
   */
  it('紙箱（先把常見池抽光，逼它退到大魔物池）', async () => {
    const { newRun, openChest } = await import('../../src/engine/run');
    const common = relics.filter((r) => r.pool === '常見').map((r) => r.id);
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const run = newRun(`chest-${i}`, 1, 'feifei');
      run.players[0]!.relics = [...run.players[0]!.relics, ...common];
      const id = openChest(run);
      if (id && banned.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(bad, `紙箱開出球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  it('過關三選一', async () => {
    const { newRun, rollActRelics } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      for (const id of rollActRelics(newRun(`act-${i}`, 1, 'feifei'))) {
        if (banned.includes(id)) bad.push(`${i}: ${id}`);
      }
    }
    expect(bad, `過關三選一給了球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  /*
   * 戰利品要走**整條路**（`finishCombat`），不是直接叫 `rollRewards` 自己塞 heroes——
   * 那樣測的是 `rollRewards` 會不會濾，而不是 `run.ts` 有沒有把職業傳進去。
   * 第一版就是那樣寫的，把 `run.ts:364` 的 `heroes: heroesIn(run)` 整段刪掉照樣全綠。
   */
  it('戰利品（打贏大魔物）', async () => {
    // 節點型別是**大魔物**不是「菁英」，而塔主那格固定給塔印、不抽——
    // 所以戰鬥給秘寶只有這一條路（`rollRewards` 的 `kind === '大魔物'`）
    const { newRun, beginCombat, finishCombat } = await import('../../src/engine/run');
    const bad: string[] = [];
    let fought = 0;
    for (let i = 0; i < 120; i++) {
      const run = newRun(`rw-${i}`, 1, 'feifei');
      const node = run.map.nodes.find((n) => n.type === '大魔物');
      if (!node) continue;
      run.currentNode = node.id;
      const cs = beginCombat(run);
      for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
      cs.phase = 'won';
      const r = finishCombat(run, cs);
      fought++;
      for (const id of [r?.relic, ...(r?.relicOffers ?? [])]) {
        if (id && banned.includes(id)) bad.push(`${i}: ${id}`);
      }
    }
    expect(fought, '一場大魔物都沒打到，這條測試等於空轉').toBeGreaterThan(50);
    expect(bad, `戰利品給了球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  /*
   * 戰利品那一處（`run.ts:364` 的 `heroes: heroesIn(run)`）要從**反方向**測。
   *
   * 拿掉它並不會讓菲菲拿到紙袋——`rollRewards` 會退回 `[opts.hero]`，而 `opts.hero`
   * 本來就是她。真正的差別在**混搭的連線局**：`heroes` 是兩位的清單，
   * 少了它就變成「只看座位 0 那位」，於是球球明明在場、紙袋卻被擋掉，
   * 他永遠拿不到自己那件。所以這條測「該給的有沒有給」，不是「不該給的有沒有擋」。
   */
  it('戰利品：混搭連線局裡，球球該拿得到的不可以被菲菲擋掉', async () => {
    const { newCoopRun, beginCombat, finishCombat } = await import('../../src/engine/run');
    let seen = false;
    for (let i = 0; i < 200 && !seen; i++) {
      // 座位 0 是菲菲——濾網若只看座位 0，紙袋就會被誤擋
      const run = newCoopRun(`mix-loot-${i}`, 1, 'feifei', 'ninja');
      const node = run.map.nodes.find((n) => n.type === '大魔物');
      if (!node) continue;
      run.currentNode = node.id;
      const cs = beginCombat(run);
      for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
      cs.phase = 'won';
      const r = finishCombat(run, cs);
      if ([r?.relic, ...(r?.relicOffers ?? [])].includes('paper_bag')) seen = true;
    }
    expect(seen, '兩百局混搭都沒開出紙袋——球球在場卻拿不到自己的秘寶').toBe(true);
  });

  /*
   * 罐頭鋪貨架上「常見」那兩格（`run.ts:742`）**測不出來**：常見池裡一件職業獨占的都沒有，
   * 所以那一格永遠抽不到被鎖的。濾網擺著是防以後，不是現在有用。
   *
   * 與其假裝測得到，不如把前提釘住：**哪天有人把常見池裡的某件標上 `hero`，這條就變紅**，
   * 提醒他順便回來補一條真的測得到的。
   */
  it('前提：常見池裡沒有職業獨占的秘寶（有的話上面那幾條就漏了一個入口）', () => {
    const locked = relics.filter((r) => r.notFor?.length && r.pool === '常見').map((r) => r.name);
    expect(locked, `常見池出現職業獨占的秘寶：${locked.join('、')}——罐頭鋪常見那兩格要補測試`).toEqual([]);
  });

  it('事件發秘寶', async () => {
    const { newRun, applyRunEffects } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (const pool of ['常見', '大魔物', '塔主'] as const) {
      for (let i = 0; i < 60; i++) {
        const run = newRun(`ev-${pool}-${i}`, 1, 'feifei');
        // 池子裡「常見」那批先塞滿，逼它抽到剩下的（跟紙箱同一個理由）
        if (pool !== '常見') run.players[0]!.relics = [...run.players[0]!.relics];
        applyRunEffects(run, [{ kind: 'relic', pool }]);
        for (const id of run.players[0]!.relics) if (banned.includes(id)) bad.push(`${pool}-${i}: ${id}`);
      }
    }
    expect(bad, `事件發了球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  it('罐頭鋪換貨', async () => {
    const { newRun, makeShop, reshuffleShop } = await import('../../src/engine/run');
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const run = newRun(`re-${i}`, 1, 'feifei');
      run.act = 3;
      run.players[0]!.fish = 9999;                    // 換貨要錢
      const shop = makeShop(run);
      // `openOf` 挑的是 **sold === false** 那幾格（賣掉的不換，換的是還擺著的）。
      // 第一版寫成全設 sold: true，於是一格都沒換，測試等於空轉
      shop.relics = shop.relics.map((r) => ({ ...r, sold: false }));
      reshuffleShop(run, shop);
      for (const it of shop.relics) if (banned.includes(it.id)) bad.push(`${i}: ${it.id}`);
    }
    expect(bad, `換貨換出球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });

  it('連線的紙箱（兩位都是菲菲時誰都不該拿到）', async () => {
    const { newCoopRun, openChestCoop } = await import('../../src/engine/run');
    const common = relics.filter((r) => r.pool === '常見').map((r) => r.id);
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      const run = newCoopRun(`cc-${i}`, 1, 'feifei', 'feifei');
      for (const pl of run.players) pl.relics = [...pl.relics, ...common];
      for (const id of openChestCoop(run)) if (banned.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(bad, `連線紙箱開出球球專屬的秘寶：${bad.join('、')}`).toEqual([]);
  });
});
