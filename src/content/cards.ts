import type { CardDef } from '../engine/types';

const 攻 = '攻擊', 技 = '技能', 能 = '能力';

export const cards: readonly CardDef[] = [
  // ===== 起手 =====
// 2026-09-01 平衡：常見牌（0 費與起手牌除外）傷害與蜷縮各 +1——實測每場勝仗平均掉 15~25 血，
// 消耗跟不上回復（貓窩一次只回 21），病根之一是基本牌的交換效率太差。使用者拍板加強。
  { id: 'sanjo', name: '貓抓', cost: 1, type: 攻, rarity: '常見', pool: '起手', target: 'enemy', art: 'card/sanjo',
    effects: [{ kind: 'damage', amount: 6 }], upgrade: { effects: [{ kind: 'damage', amount: 9 }] } },
  { id: 'tanding', name: '淡定', cost: 1, type: 技, rarity: '常見', pool: '起手', target: 'self', art: 'card/tanding',
    effects: [{ kind: 'block', amount: 5 }], upgrade: { effects: [{ kind: 'block', amount: 8 }] } },
  { id: 'kawarimi', name: '忍術·替身術', cost: 2, type: 技, rarity: '常見', hero: 'ninja', pool: '起手', target: 'self', art: 'card/kawarimi',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 1 }] } },

  // ===== 忍術（33） =====
  { id: 'shunkan', name: '忍術·瞬間移動', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/shunkan',
    effects: [{ kind: 'damage', amount: 8, ignoreBlock: true }], upgrade: { effects: [{ kind: 'damage', amount: 11, ignoreBlock: true }] } },
  { id: 'shengdong', name: '忍術·聲東擊西', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/shengdong',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'status', name: '懶洋洋', amount: 1, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 8 }, { kind: 'status', name: '懶洋洋', amount: 2, target: 'enemy' }] } },
  { id: 'shunshou', name: '忍術·順手牽羊', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/shunshou',
    effects: [{ kind: 'damage', amount: 7 }, { kind: 'gold', n: 15, onKill: true }],
    upgrade: { effects: [{ kind: 'damage', amount: 10 }, { kind: 'gold', n: 25, onKill: true }] } },
  /*
   * ===== 九張連線牌（2026-09-11）=====
   *
   * 起點是《殺戮尖塔 2》的連線專用牌（Rally／Coordinate／Intercept），
   * 使用者要求擴充成一整套：幫對方隱身、幫對方擋、給對方爪力與貓步。
   * 分三條線——**防禦**（分你一半、你拿去擋、你先躲、我來擋）、
   * **進攻**（幫你一把、借你踩兩步）、**節奏**（你也抽一張、我幫你拍掉、飯糰分你）。
   *
   * 名字照這個遊戲既有的口語路線走（我在這、交出來、先睡了），不取武功名——
   * 它們是**跟同伴講的話**，用招式名反而隔了一層。
   *
   * `coop: true`＝**只有兩個人以上的局才會進獎勵與罐頭鋪的池子**（使用者指定）。
   * 效果本身仍保留「一個人時退化成作用在自己身上」，因為牌可能從事件、
   * 或別人分享的局面碼流進單機的牌組，那時候不能變成廢牌。
   *
   * 圖已經到齊（2026-09-13 傍晚），`hidden` 全部拿掉了。留這句是要講**那個旗標的用途**：
   * 新做的牌在圖生出來之前一律先掛 `hidden`，不然玩家會在獎勵畫面看到一張灰底沒圖的牌。
   */
  // ---- 給自己以外的人用的（防禦線）----
  { id: 'fenyiban', name: '分你一半', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/fenyiban', coop: true,
    effects: [{ kind: 'blockAll', amount: 5 }],
    upgrade: { effects: [{ kind: 'blockAll', amount: 8 }] } },
  // 整份給一個人，所以總量比「一人一半」多——集中防守的選項
  { id: 'ninaqudang', name: '你拿去擋', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/ninaqudang', coop: true,
    effects: [{ kind: 'blockAlly', amount: 12 }],
    upgrade: { effects: [{ kind: 'blockAlly', amount: 16 }] } },
  // 忍者獨占：這張給的是隱身，而武士整套機制裡根本沒有閃避（`hero.test.ts` 在守這條規則）。
  // 對方是不是忍者不影響——判準是「誰開得到這張牌」，不是「誰受得了這個效果」
  { id: 'nixianduo', name: '你先躲', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'ninja', target: 'self', art: 'card/nixianduo', coop: true,
    effects: [{ kind: 'statusAlly', name: '隱身', amount: 2 }],
    upgrade: { effects: [{ kind: 'statusAlly', name: '隱身', amount: 3 }] } },
  { id: 'wolaidang', name: '我來擋', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'card/wolaidang', coop: true,
    // 自己吃一輪全部的攻擊，所以要配一份蜷縮才擋得住——不然這張是純粹的自殺
    effects: [{ kind: 'taunt' }, { kind: 'block', amount: 10 }],
    upgrade: { effects: [{ kind: 'taunt' }, { kind: 'block', amount: 15 }] } },
  // ---- 幫對方變強的（進攻線）----
  { id: 'bangnisheme', name: '幫你一把', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/bangnisheme', coop: true,
    effects: [{ kind: 'statusAlly', name: '爪力', amount: 2 }],
    upgrade: { effects: [{ kind: 'statusAlly', name: '爪力', amount: 3 }] } },
  { id: 'jienicailiangbu', name: '借你踩兩步', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'card/jienicailiangbu', coop: true,
    effects: [{ kind: 'statusAlly', name: '貓步', amount: 2 }],
    upgrade: { effects: [{ kind: 'statusAlly', name: '貓步', amount: 3 }] } },
  // ---- 幫對方多做一點事的（節奏線）----
  { id: 'niyechouyizhang', name: '你也抽一張', cost: 0, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/niyechouyizhang', coop: true,
    effects: [{ kind: 'drawAlly', n: 1 }],
    upgrade: { effects: [{ kind: 'drawAlly', n: 2 }] } },
  { id: 'wobangnipaidiao', name: '我幫你拍掉', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/wobangnipaidiao', coop: true,
    effects: [{ kind: 'cleanseAlly' }],
    // 升級版順便幫自己也拍一次（`cleanse` 是清自己的）
    upgrade: { cost: 0, effects: [{ kind: 'cleanseAlly' }, { kind: 'cleanse' }] } },
  { id: 'fantuanfenni', name: '飯糰分你', cost: 0, type: 技, rarity: '稀有', pool: '絕學', target: 'self', art: 'card/fantuanfenni', coop: true,
    // 0 費給對方 1 顆飯糰＝把自己這回合的行動力整個借給他，兩個人湊一次大招用的
    keywords: ['消耗'],
    effects: [{ kind: 'energyAlly', n: 1 }],
    upgrade: { effects: [{ kind: 'energyAlly', n: 2 }] } },
  /*
   * ===== 連線支援牌第二批（2026-09-13，交辦單 `docs/連線支援牌20張_實作交辦單_2026-09-13.md`）=====
   *
   * 20 張分三批做，這是**第一批六張**——全部是既有積木拼出來的，沒有跨玩家的新機制，
   * 所以可以先上線讓人玩到。另外兩批（同伴版的既有效果 3 張、真的要新機制的 11 張）
   * 在後面的提交。
   *
   * 這一批做的時候都掛著 `hidden`（圖還沒生，先不進任何池子）。
   * **2026-09-13 傍晚圖全部到齊，旗標已經拿掉**，這幾張現在真的抽得到了。
   *
   * 售價照既有稀有度走（常見 50、罕見 75、稀有 150），沒有另設一套。
   */
  { id: 'bangnidianyixia', name: '幫你墊一下', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy',
    art: 'card/bangnidianyixia', coop: true,
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'blockAlly', amount: 4 }],
    // 升級是「自己也擋 4」不是「打更痛」：這張的定位是一邊清怪一邊護人，加傷會把它推成純攻擊牌
    upgrade: { effects: [{ kind: 'damage', amount: 6 }, { kind: 'blockAlly', amount: 4 }, { kind: 'block', amount: 4 }] } },
  { id: 'shoujiewoyixia', name: '手借我一下', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self',
    art: 'card/shoujiewoyixia', coop: true, keywords: ['消耗'],
    effects: [{ kind: 'healAlly', n: 8 }],
    /*
     * 交辦單寫升級是「先清除同伴**自選的 1 種**減益」。這裡實作成「清掉全部」——
     * 「自選一種」要為同伴開一個選單，而選單是跨玩家的鎖步流程（跟第 5、6 張同一類），
     * 那是第三批的工作。清全部比清一種強，但這張是罕見、又消耗、又只回 8 點，
     * 撐得住。**這是有意識的偏離，不是漏做**——第三批做選單時可以回來改。
     */
    upgrade: { effects: [{ kind: 'cleanseAlly' }, { kind: 'healAlly', n: 8 }] } },
  /*
   * 幫同伴回血的兩張（2026-09-15，使用者睡前交辦：「做個兩張幫另一個人回血的卡牌，名稱效果你想」）。
   * 「手借我一下」是消耗、罕見、附清減益；這兩張補上「常見、可重複用」與「兩個人一起回」兩種定位。
   * `healAlly` 單人時退化成回自己（效果本身就這樣寫），所以局面碼流進單機也不會變廢牌。
   * 圖生好之前掛 `hidden`（`cards.test.ts` 會逼人拿掉）；2026-09-15 凌晨四張圖到齊，旗標已拿掉。
   */
  { id: 'yuganjijiu', name: '魚乾急救', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self',
    art: 'card/yuganjijiu', coop: true,
    effects: [{ kind: 'healAlly', n: 6 }],
    upgrade: { effects: [{ kind: 'healAlly', n: 9 }] } },
  { id: 'yiqichuankou', name: '一起喘口氣', cost: 2, type: 技, rarity: '罕見', pool: '絕學', target: 'self',
    art: 'card/yiqichuankou', coop: true,
    // 自己那句排前面：「回復 5 點生命，同伴回復 9 點生命」；反過來第二句會被讀成同伴再回 5（審查 2026-09-15 低-2）
    effects: [{ kind: 'heal', n: 5 }, { kind: 'healAlly', n: 9 }],
    upgrade: { effects: [{ kind: 'heal', n: 7 }, { kind: 'healAlly', n: 12 }] } },
  { id: 'huannieduochoudian', name: '換你多抽點', cost: 0, type: 技, rarity: '常見', pool: '忍術', target: 'self',
    art: 'card/huannieduochoudian', coop: true, keywords: ['消耗'],
    effects: [{ kind: 'discardFromHand', n: 1 }, { kind: 'block', amount: 4 }, { kind: 'drawAlly', n: 2 }],
    /*
     * 交辦單寫升級是「**可以選擇**把那張手牌消耗掉，取代棄掉」。實作成「一律消耗」——
     * 「棄或消耗二選一」要多一層模式選擇的介面，而消耗嚴格優於棄牌
     *（唯一的差別是棄牌堆洗回來時會再遇到那張，而你會想消耗的正是壞毛病），
     * 所以那個選擇實際上沒有取捨。**有意識的偏離**，理由記在這裡。
     */
    upgrade: { effects: [{ kind: 'exhaustFromHand', n: 1 }, { kind: 'block', amount: 4 }, { kind: 'drawAlly', n: 2 }] } },
  { id: 'wobangnishouwei', name: '我幫你收尾', cost: 1, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy',
    art: 'card/wobangnishouwei', coop: true, keywords: ['消耗'],
    // `onKill` 只認**這張牌直接打倒**：之後毒死的不算，那時候這張早就結算完了
    effects: [{ kind: 'damage', amount: 9 }, { kind: 'energyAlly', n: 1, onKill: true }],
    upgrade: { effects: [{ kind: 'damage', amount: 9 }, { kind: 'energyAlly', n: 1, onKill: true }, { kind: 'drawAlly', n: 1 }] } },
  { id: 'huannimangyixia', name: '換你忙一下', cost: 1, type: 技, rarity: '稀有', pool: '絕學', target: 'self',
    art: 'card/huannimangyixia', coop: true, keywords: ['消耗'],
    // 「自己本輪不能再打攻擊牌」只鎖出牌者（`noAttacksThisTurn` 本來就只作用在 `p`），同伴照打
    effects: [{ kind: 'drawAlly', n: 2 }, { kind: 'energyAlly', n: 1 }, { kind: 'noAttacksThisTurn' }],
    upgrade: { effects: [{ kind: 'drawAlly', n: 2 }, { kind: 'energyAlly', n: 1 }] } },
  { id: 'genzhewoduohao', name: '跟著我躲好', cost: 0, type: 技, rarity: '罕見', pool: '忍術', hero: 'ninja', target: 'self',
    art: 'card/genzhewoduohao', coop: true, keywords: ['消耗'],
    /*
     * 球球專屬。看**自己**有沒有隱身決定給哪一邊——`ifSelfStatus` 讀的是這張牌
     * 開始結算前的層數，所以不會自己給自己隱身再拿來判斷。
     * 基礎版不是兩者都給（交辦單特別強調過）。
     */
    effects: [{ kind: 'ifSelfStatus', name: '隱身',
      then: [{ kind: 'statusAlly', name: '隱身', amount: 1 }],
      otherwise: [{ kind: 'blockAlly', amount: 8 }] }],
    upgrade: { effects: [{ kind: 'ifSelfStatus', name: '隱身',
      then: [{ kind: 'statusAlly', name: '隱身', amount: 1 }],
      otherwise: [{ kind: 'blockAlly', amount: 8 }] }, { kind: 'drawAlly', n: 1 }] } },
  /*
   * ---- 連線支援牌 B 批六張（2026-09-13）----
   * 共同點：**只讀／只寫兩位玩家的狀態，不開任何選單**。
   * 交辦單裡要開選單的那兩張（這張交給你、幫你撿回來）留在最後一批——
   * `PendingChoice` 目前沒有「誰來回答」的概念，那是新的基礎建設。
   */
  { id: 'kaoniyixia', name: '靠你一下', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'self',
    art: 'card/kaoniyixia', coop: true,
    // 讀的是**結算前**同伴的蜷縮，所以自己這 5 點不會被算進加成（交辦單點名要核對的）
    effects: [{ kind: 'blockFromAllyBlock', amount: 5, cap: 8, half: true }],
    upgrade: { effects: [{ kind: 'blockFromAllyBlock', amount: 5, cap: 8 }] } },
  { id: 'zhexienixianchi', name: '這些你先吃', cost: 0, type: 技, rarity: '罕見', pool: '忍術', target: 'self',
    art: 'card/zhexienixianchi', coop: true, keywords: ['消耗'],
    // 飯糰守恆：自己少多少對方才多多少。一個人時不轉（不然等於憑空多出來）
    effects: [{ kind: 'energyTransfer', n: 2 }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'energyTransfer', n: 2 }, { kind: 'draw', n: 1 }, { kind: 'drawAlly', n: 1 }] } },
  { id: 'zhaonishuodeda', name: '照你說的打', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy',
    art: 'card/zhaonishuodeda', coop: true,
    /*
     * **抽牌那條排在傷害前面**，因為它看的是「打之前」目標身上有沒有毒。
     * 排到後面的話，這張自己造成的減益會被算進條件裡——改順序前先看這句。
     */
    effects: [{ kind: 'drawAllyIfTargetStatus', name: '中毒', n: 1 }, { kind: 'damage', amount: 6 }],
    upgrade: { effects: [{ kind: 'drawAllyIfTargetStatus', anyDebuff: true, n: 1 }, { kind: 'damage', amount: 6 }] } },
  { id: 'jienideliqi', name: '借你的力氣', cost: 1, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy',
    art: 'card/jienideliqi', coop: true,
    // 出牌者自己的爪力照一般規則另外算；同伴的爪力只是多一段有上限的固定值
    effects: [{ kind: 'damageFromAllyStrength', amount: 6, cap: 8 }],
    upgrade: { effects: [{ kind: 'damageFromAllyStrength', amount: 6, cap: 8, ignoreBlock: true }] } },
  { id: 'chenxianzaichushou', name: '趁現在出手', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self',
    art: 'card/chenxianzaichushou', coop: true,
    // 沿用「絕學·蓄力」的加倍旗標（`doubleNext`），所以兩種加倍同時存在也不會變四倍
    effects: [{ kind: 'block', amount: 4 }, { kind: 'doubleNextAttackAlly' }],
    upgrade: { cost: 0, effects: [{ kind: 'block', amount: 4 }, { kind: 'doubleNextAttackAlly' }] } },
  { id: 'biezhanzaishenshang', name: '別沾在身上', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'enemy',
    art: 'card/biezhanzaishenshang', coop: true,
    /*
     * 交辦單寫「同伴**自選 1 種**減益」。實作成**整份移過去**——理由跟「甩鍋術」一致：
     * 那張（自己版）本來就是移全部，同一個動作在這裡改成只移一種，玩家會覺得莫名其妙。
     * 而且「選一種」要開選單，這張又不是選牌而是選狀態，`PendingChoice` 撐不起來。
     * **有意識的偏離**，理由記在這裡。
     */
    effects: [{ kind: 'transferDebuffsFromAlly' }],
    upgrade: { effects: [{ kind: 'transferDebuffsFromAlly' }, { kind: 'blockAll', amount: 4 }] } },
  /*
   * ---- 連線支援牌 C 批六張（2026-09-13）----
   * 共同點：**排到下一輪才發**，或**每輪監聽一次**。掛鉤都在 `combat.ts`
   *（`coopWatchers` 與 `startSeatTurn`／`endTurn` 的那幾段）。
   *
   * 每輪的次數重置**只在自己的回合開始做**——不能因為對方出牌、按結束、
   * 撤回結束或畫面重繪就重置（交辦單明定，也是最容易寫錯的地方）。
   */
  { id: 'xianbangniliuzhe', name: '先幫你留著', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self',
    art: 'card/xianbangniliuzhe', coop: true,
    /*
     * **2026-09-13 使用者要求：不要跨回合。** 原本是「同伴下一輪開始才拿到 6 點」，
     * 那種「這一輪做的事下一輪才生效」很難算。改成當場就給。
     *
     * 給的量刻意做成**不平均**（自己 4、同伴 8），才不會跟既有那兩張撞：
     *   分你一半＝每人各 5（平均分）　你拿去擋＝同伴 12、自己 0（全給對方）
     *   這一張＝中間那個點，自己留一點、大部分給對方。
     * 總量 12 點跟你拿去擋一樣，差別在怎麼分。
     */
    effects: [{ kind: 'block', amount: 4 }, { kind: 'blockAlly', amount: 8 }],
    upgrade: { effects: [{ kind: 'block', amount: 6 }, { kind: 'blockAlly', amount: 10 }] } },
  { id: 'nimangwobuwei', name: '你忙我補位', cost: 1, type: 能, rarity: '稀有', pool: '絕學', target: 'self',
    art: 'card/nimangwobuwei', coop: true,
    effects: [{ kind: 'watchAllyPlay', cardType: '技能' }],
    upgrade: { effects: [{ kind: 'watchAllyPlay', cardType: 'any' }] } },
  { id: 'fantuanliuyikou', name: '飯糰留一口', cost: 1, type: 能, rarity: '罕見', pool: '忍術', target: 'self',
    art: 'card/fantuanliuyikou', coop: true,
    /*
     * **2026-09-13 使用者要求：不要跨回合。** 原本是「這一輪結束扣自己 1 顆、
     * 同伴下一輪才拿到」，改成「每一輪開始時同伴直接多 1 顆」——
     * 值在同伴自己的回合開始那一刻當場算出來，不必記著上一輪排了什麼。
     *
     * 順帶解掉一個假代價：原本那個「扣 1 顆」其實不是代價（沒用完的飯糰本來就會消失）。
     * 現在它單純就是「每輪給同伴 1 顆」，強度看得出來、也好調。
     */
    effects: [{ kind: 'energyForAllyEachRound' }],
    upgrade: { effects: [{ kind: 'energyForAllyEachRound', draw: true }] } },
  { id: 'youwozaiqianmian', name: '有我在前面', cost: 1, type: 能, rarity: '稀有', pool: '絕學', hero: 'ninja', target: 'self',
    art: 'card/youwozaiqianmian', coop: true,
    effects: [{ kind: 'watchSelfPlay', cardType: '攻擊' }],
    upgrade: { effects: [{ kind: 'watchSelfPlay', cardType: 'any' }] } },
  { id: 'biepengzhenjian', name: '別碰針尖喔', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'feifei', target: 'self',
    art: 'card/biepengzhenjian', coop: true,
    // 附毒**每隻只加一次**：多段攻擊連打三下也只有 2 層（交辦單明定）
    effects: [{ kind: 'blockAlly', amount: 4 }, { kind: 'poisonAllyNextAttack', amount: 2 }],
    upgrade: { effects: [{ kind: 'blockAlly', amount: 4 }, { kind: 'poisonAllyNextAttack', amount: 2, anyDamage: true }] } },
  { id: 'woyouxianbeihao', name: '一起準備好', cost: 2, type: 能, rarity: '稀有', pool: '絕學', hero: 'feifei', target: 'self',
    art: 'card/woyouxianbeihao', coop: true,
    /*
     * 「命中」＝**真的扣到血**（使用者 2026-09-13 裁定）。被蜷縮全擋掉、打 0 點都不算。
     * 判準用 `cs.hits`——那份只記真的扣到的量。
     * 升級版是「**任一方**觸發」但每輪仍**合計一次**，不是兩人各一次。
     */
    effects: [{ kind: 'watchPoisonHit', who: 'ally' }],
    upgrade: { effects: [{ kind: 'watchPoisonHit', who: 'both' }] } },
  { id: 'wozaizhe', name: '我在這', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/wozaizhe',
    effects: [{ kind: 'damage', amount: 7 }, { kind: 'drawIfTargetStatus', name: '翻肚', n: 1 }],
    upgrade: { effects: [{ kind: 'damage', amount: 10 }, { kind: 'drawIfTargetStatus', name: '翻肚', n: 1 }] } },
  { id: 'jiaochulai', name: '交出來', cost: 2, type: 技, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/jiaochulai',
    effects: [{ kind: 'stealBlock' }, { kind: 'damage', amount: 5 }], upgrade: { effects: [{ kind: 'stealBlock' }, { kind: 'damage', amount: 7 }] } },
  // 2026-09-17 使用者裁定：**2 費 → 3 費**。理由同崩拳——噹噹的「震盪波」是 2 費罕見、
  // 全體最多 8（升 10）且要吃蜷縮，這張 2 費常見全體 9（升 12）又不吃任何代價，整個壓過去
  { id: 'susu', name: '速速退散', cost: 3, type: 攻, rarity: '常見', pool: '忍術', target: 'all', art: 'card/susu',
    effects: [{ kind: 'damage', amount: 9, target: 'all' }], upgrade: { effects: [{ kind: 'damage', amount: 12, target: 'all' }] } },
  // 2026-09-14 起球球專屬：菲菲的分身術改成疊毒（下一張），兩位各拿自己那張
  { id: 'bunshin', name: '忍術·分身術', cost: 1, type: 攻, rarity: '罕見', hero: 'ninja', pool: '忍術', target: 'enemy', art: 'card/bunshin',
    // 2026-09-03 使用者改效果：3 點起、這場每打出一次就 +3（只限這場）；升級 5／+5 但 2 費
    effects: [{ kind: 'damageRamp', amount: 3, step: 3 }],
    upgrade: { cost: 2, effects: [{ kind: 'damageRamp', amount: 5, step: 5 }] } },
  /*
   * 菲菲的分身術（使用者 2026-09-14）：「造成 2 點中毒層數，這場戰鬥中這張牌每打出一次，中毒層數就再加 2 點」，
   * 升級 3／+3。**效果以外全部照球球那張**（攻擊、1 費、升級 2 費、罕見），使用者只改了效果。
   * 圖是她原本那張分身術，檔案從 `feifei_bunshin` 改名過來（插圖鍵要等於牌號，`cards.test.ts` 盯著）。
   * 次數跟球球那張同一份（`cs.cardPlays`，同一張牌打完才 +1）。
   */
  { id: 'feifei_fenshen', name: '毒分身', cost: 1, type: 攻, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_fenshen',
    effects: [{ kind: 'status', name: '中毒', amount: 2, target: 'enemy', step: 2 }],
    upgrade: { cost: 2, effects: [{ kind: 'status', name: '中毒', amount: 3, target: 'enemy', step: 3 }] } },
  { id: 'ruying', name: '如影隨形', cost: 2, type: 攻, rarity: '罕見', hero: 'ninja', pool: '忍術', target: 'enemy', art: 'card/ruying',
    effects: [{ kind: 'damage', amount: 5, times: 2 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'damage', amount: 7, times: 2 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'zhangyan', name: '忍術·障眼法', cost: 2, type: 技, rarity: '常見', hero: 'ninja', pool: '忍術', target: 'self', art: 'card/zhangyan',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 2 }] } },
  { id: 'yinshen', name: '忍術·隱身術', cost: 3, type: 技, rarity: '常見', hero: 'ninja', pool: '忍術', target: 'self', art: 'card/yinshen',
    effects: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }], upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 3, target: 'self' }] } },
  { id: 'bianshen', name: '忍術·變身術', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/bianshen',
    effects: [{ kind: 'block', amount: 10 }], upgrade: { effects: [{ kind: 'block', amount: 13 }] } },
  { id: 'zhuangsi', name: '忍術·裝死術', cost: 1, type: 技, rarity: '常見', hero: 'ninja', pool: '忍術', target: 'self', art: 'card/zhuangsi', keywords: ['消耗'],
    effects: [{ kind: 'block', amount: 6 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'block', amount: 9 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'duxin', name: '忍術·讀心術', cost: 2, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/duxin',
    effects: [{ kind: 'scry', n: 3 }, { kind: 'draw', n: 1 }], upgrade: { effects: [{ kind: 'scry', n: 5 }, { kind: 'draw', n: 1 }] } },
  { id: 'qianliyan', name: '千里眼', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/qianliyan',
    effects: [{ kind: 'draw', n: 2 }], upgrade: { effects: [{ kind: 'draw', n: 3 }] } },
  { id: 'shunfenger', name: '順風耳', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/shunfenger',
    effects: [{ kind: 'drawNextTurn', n: 2 }], upgrade: { effects: [{ kind: 'drawNextTurn', n: 3 }] } },
  { id: 'dingshang', name: '盯上你了', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/dingshang',
    effects: [{ kind: 'status', name: '翻肚', amount: 2, target: 'enemy' }], upgrade: { effects: [{ kind: 'status', name: '翻肚', amount: 3, target: 'enemy' }] } },
  { id: 'chudashi', name: '出大事了', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/chudashi',
    // 比千里眼（1 費抽 2 無代價）多個缺點零補償；抽 3＝高風險高報酬，升級版拿掉代價
    effects: [{ kind: 'draw', n: 3 }, { kind: 'status', name: '翻肚', amount: 1, target: 'self' }], upgrade: { effects: [{ kind: 'draw', n: 3 }] } },
  { id: 'youcike', name: '有刺客', cost: 0, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/youcike', keywords: ['消耗'],
    effects: [{ kind: 'draw', n: 2 }], upgrade: { effects: [{ kind: 'draw', n: 3 }] } },
  // 2026-09-02 使用者用牌費量表拍板：戰術撤退 2 費（升級 1 費）、移形換影 2／1、三花聚頂 3／3、返璞 2／1、十二連環 3→2
  { id: 'zhanshu', name: '戰術撤退', cost: 2, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/zhanshu',
    // 比變身術（1 費 10 蜷縮無限制）多個缺點還少 1 點＝純劣化；補一張抽牌當「過渡回合」的定位
    effects: [{ kind: 'block', amount: 9 }, { kind: 'draw', n: 1 }, { kind: 'noAttacksThisTurn' }], upgrade: { cost: 1, effects: [{ kind: 'block', amount: 12 }, { kind: 'draw', n: 1 }, { kind: 'noAttacksThisTurn' }] } },
  { id: 'tuozi', name: '忍術·拖字訣', cost: 2, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/tuozi',
    effects: [{ kind: 'retainFromHand', n: 1 }, { kind: 'draw', n: 1 }], upgrade: { effects: [{ kind: 'retainFromHand', n: 2 }, { kind: 'draw', n: 1 }] } },
  { id: 'shuaiguo', name: '忍術·甩鍋術', cost: 2, type: 技, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'card/shuaiguo',
    effects: [{ kind: 'transferDebuffs' }], upgrade: { cost: 0 } },
  { id: 'dingshen', name: '忍術·定身術', cost: 2, type: 技, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'card/dingshen',
    effects: [{ kind: 'status', name: '定身', amount: 1, target: 'enemy' }], upgrade: { cost: 0 } },
  // 2026-09-02 使用者：催眠術與催眠術＋都改 3 費
  { id: 'cuimian', name: '忍術·催眠術', cost: 3, type: 技, rarity: '罕見', pool: '忍術', target: 'all', art: 'card/cuimian',
    effects: [{ kind: 'status', name: '懶洋洋', amount: 2, target: 'all' }, { kind: 'status', name: '炸毛', amount: 2, target: 'all' }],
    upgrade: { effects: [{ kind: 'status', name: '懶洋洋', amount: 3, target: 'all' }, { kind: 'status', name: '炸毛', amount: 3, target: 'all' }] } },
  { id: 'fengkou', name: '忍術·封口術', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'card/fengkou',
    // 本來整個拆光（爪力、貓步、防禦全歸零）——對疊了 20 點防禦的師父等於一費清場，使用者 2026-09-02：太強。改最多各 5 點
    effects: [{ kind: 'removeStatuses', names: ['爪力', '貓步'], removeBlock: true, max: 5 }],
    upgrade: { effects: [{ kind: 'removeStatuses', names: ['爪力', '貓步'], removeBlock: true, max: 5 }, { kind: 'status', name: '翻肚', amount: 1, target: 'enemy' }] } },
  // 3 費跟隱身術（常見、當下 2 層）幾乎同價還更慢；降 1 費，走「便宜但分期」
  { id: 'qianshui', name: '忍術·潛水術', cost: 2, type: 技, rarity: '罕見', hero: 'ninja', pool: '忍術', target: 'self', art: 'card/qianshui',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'status', name: '潛水', amount: 1, target: 'self' }],
    // 升級版 2／2→1／2（使用者 2026-09-04：現在 1、下回合 2）
    upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'status', name: '潛水', amount: 2, target: 'self' }] } },
  { id: 'touchi', name: '忍術·偷吃術', cost: 0, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/touchi', keywords: ['消耗'],
    effects: [{ kind: 'energy', n: 1 }], upgrade: { effects: [{ kind: 'energy', n: 1 }, { kind: 'draw', n: 1 }] } },
  { id: 'xianshuile', name: '先睡了', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/xianshuile',
    effects: [{ kind: 'heal', n: 4 }, { kind: 'endTurn' }], upgrade: { effects: [{ kind: 'heal', n: 7 }, { kind: 'endTurn' }] } },
  { id: 'gaotui', name: '告退', cost: 0, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/gaotui', keywords: ['消耗'],
    effects: [{ kind: 'exhaustFromHand', n: 1 }, { kind: 'draw', n: 1 }], upgrade: { effects: [{ kind: 'exhaustFromHand', n: 1 }, { kind: 'draw', n: 2 }] } },
  { id: 'meikandao', name: '我什麼都沒看到', cost: 3, type: 技, rarity: '稀有', pool: '忍術', target: 'self', art: 'card/meikandao', keywords: ['消耗'],
    effects: [{ kind: 'immuneThisTurn' }], upgrade: { cost: 1 } },
  { id: 'jiejie', name: '結界', cost: 2, type: 能, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/jiejie',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'block', amount: 3 }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'block', amount: 4 }] }] } },
  // 跟忍術·反彈只差 1 點＝純劣化，改走攻守一體；純反彈留給忍術·反彈
  // 2026-09-04 使用者：跟忍術·反彈撞名，改成同時講到反彈＋蜷縮的忍者名（鐵蒺藜＝忍者撒在地上的尖刺，2026-09-04 使用者從撒菱陣改定）
  { id: 'fantan', name: '忍術·鐵蒺藜', cost: 1, type: 能, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/fantan',
    effects: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }, { kind: 'block', amount: 6 }],
    upgrade: { effects: [{ kind: 'status', name: '反彈', amount: 3, target: 'self' }, { kind: 'block', amount: 8 }] } },
  // 2026-09-04 起基礎版也整場有效（每殺回 3），磨爪只加量（回 6）
  { id: 'renwuwancheng', name: '忍術·回復卷軸', cost: 1, type: 能, rarity: '稀有', pool: '忍術', target: 'self', art: 'card/renwuwancheng',
    effects: [{ kind: 'power', trigger: 'onKill', effects: [{ kind: 'heal', n: 3 }] }],   // 2026-09-04 未升級也整場有效（原本只撐一回合、回 4）
    upgrade: { effects: [{ kind: 'power', trigger: 'onKill', effects: [{ kind: 'heal', n: 6 }] }] } },
  { id: 'fengyin', name: '封印解除', cost: 3, type: 能, rarity: '稀有', pool: '忍術', target: 'self', art: 'card/fengyin',
    // 原本跟鐵心（2 費）同效果還貴 1 費＝純劣化，改成攻防雙成長，3 費才值
    // 機器人 300 局：到第三關的牌組 65% 有這張，是爪力堆最快的單一來源（每回合 +1 爪力 +1 貓步，打完最終戰 +14）。
    // 升級本來降到 2 費＝更早開起來；改成費用不變、打出時先各得 2 點（使用者 2026-09-02：爪力堆太快）
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }, { kind: 'status', name: '貓步', amount: 1, target: 'self' }] }],
    upgrade: { effects: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }, { kind: 'status', name: '貓步', amount: 2, target: 'self' }, { kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }, { kind: 'status', name: '貓步', amount: 1, target: 'self' }] }] } },

  // ===== 絕學（18） =====
  { id: 'tieshazhang', name: '絕學·鐵砂掌', cost: 2, type: 攻, rarity: '常見', pool: '絕學', target: 'enemy', art: 'card/tieshazhang',
    effects: [{ kind: 'damage', amount: 7 }, { kind: 'status', name: '中毒', amount: 3, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 9 }, { kind: 'status', name: '中毒', amount: 4, target: 'enemy' }] } },
  { id: 'qinna', name: '絕學·擒拿手', cost: 2, type: 攻, rarity: '常見', pool: '絕學', target: 'enemy', art: 'card/qinna',
    effects: [{ kind: 'damage', amount: 8 }, { kind: 'status', name: '炸毛', amount: 2, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 10 }, { kind: 'status', name: '炸毛', amount: 3, target: 'enemy' }] } },
  // 原本 1 費 4×3 把肉球連擊（1 費 4×2）整張壓死；改打全體、跟十二連環成系列，單體連打讓給肉球
  { id: 'juye', name: '絕學·聚葉成刀', cost: 1, type: 攻, rarity: '常見', pool: '絕學', target: 'all', art: 'card/juye',
    effects: [{ kind: 'damage', amount: 3, times: 2, target: 'all' }], upgrade: { effects: [{ kind: 'damage', amount: 4, times: 2, target: 'all' }] } },
  { id: 'jinzhong', name: '絕學·金鐘罩', cost: 2, type: 技, rarity: '常見', pool: '絕學', target: 'self', art: 'card/jinzhong',
    effects: [{ kind: 'block', amount: 17 }], upgrade: { effects: [{ kind: 'block', amount: 22 }] } },
  // 2026-09-02 使用者：輕功改 2 費、升級 1 費（原本 3 費、升級 0 費）
  { id: 'qinggong', name: '絕學·輕功', cost: 2, type: 技, rarity: '常見', hero: 'ninja', pool: '絕學', target: 'self', art: 'card/qinggong',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 2 }], upgrade: { cost: 1 } },
  { id: 'taxue', name: '絕學·踏雪無痕', cost: 0, type: 技, rarity: '稀有', hero: 'ninja', pool: '絕學', target: 'self', art: 'card/taxue', keywords: ['消耗'],
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }], upgrade: { keywords: [] } },
  { id: 'xuli', name: '絕學·蓄力', cost: 1, type: 技, rarity: '常見', pool: '絕學', target: 'self', art: 'card/xuli',
    effects: [{ kind: 'doubleNextAttack' }], upgrade: { cost: 0 } },
  { id: 'tietou', name: '絕學·鐵頭功', cost: 2, type: 攻, rarity: '罕見', hero: 'ninja', pool: '絕學', target: 'enemy', art: 'card/tietou',
    effects: [{ kind: 'damage', amount: 16 }, { kind: 'selfDamage', amount: 2 }],
    upgrade: { effects: [{ kind: 'damage', amount: 20 }, { kind: 'selfDamage', amount: 2 }] } },
  { id: 'shihou', name: '絕學·獅吼功', cost: 2, type: 攻, rarity: '罕見', pool: '絕學', target: 'all', art: 'card/shihou',
    effects: [{ kind: 'damage', amount: 10, target: 'all' }, { kind: 'status', name: '懶洋洋', amount: 1, target: 'all' }],
    upgrade: { effects: [{ kind: 'damage', amount: 13, target: 'all' }, { kind: 'status', name: '懶洋洋', amount: 1, target: 'all' }] } },
  { id: 'dianxue', name: '絕學·點穴手', cost: 2, type: 攻, rarity: '罕見', pool: '絕學', target: 'enemy', art: 'card/dianxue',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'status', name: '定身', amount: 1, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 9 }, { kind: 'status', name: '定身', amount: 1, target: 'enemy' }] } },
  { id: 'zuiquan', name: '絕學·醉拳', cost: 1, type: 攻, rarity: '罕見', pool: '絕學', target: 'enemy', art: 'card/zuiquan',
    effects: [{ kind: 'damageRandom', min: 4, max: 14 }], upgrade: { effects: [{ kind: 'damageRandom', min: 8, max: 18 }] } },
  { id: 'yixing', name: '絕學·移形換影', cost: 2, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'card/yixing',
    effects: [{ kind: 'draw', n: 3 }, { kind: 'discardFromHand', n: 1 }], upgrade: { cost: 1, effects: [{ kind: 'draw', n: 4 }, { kind: 'discardFromHand', n: 1 }] } },
  { id: 'gekong', name: '絕學·隔空取物', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'card/gekong',
    effects: [{ kind: 'recoverFromDiscard' }], upgrade: { cost: 0 } },
  { id: 'guixi', name: '絕學·龜息術', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'card/guixi', keywords: ['消耗'],
    effects: [{ kind: 'heal', n: 10 }], upgrade: { effects: [{ kind: 'heal', n: 14 }] } },
  /*
   * 太極＝**造成等同你當下蜷縮的傷害**。2026-09-17 使用者裁定：**改成噹噹專屬**，
   * 球球與菲菲都不給——「不然太強」。
   *
   * 為什麼只有他拿著剛好：他整副牌就是在堆蜷縮又把蜷縮打出去（`damageSpendBlock`），
   * 這張是他那條路線的延伸，而且他打出去之後蜷縮就沒了、得重新堆。
   * 另外兩位堆蜷縮沒有代價（菲菲攻擊自帶蜷縮、球球有一整排純防禦牌），
   * 等於零風險把防禦轉成傷害，這才是太強的原因。
   */
  { id: 'taiji', name: '絕學·太極', cost: 1, type: 技, rarity: '罕見', hero: 'dangdang', pool: '絕學', target: 'enemy', art: 'card/taiji',
    effects: [{ kind: 'damageEqualBlock' }], upgrade: { cost: 0 } },
  { id: 'mabu', name: '絕學·貓步', cost: 1, type: 能, rarity: '罕見', pool: '絕學', target: 'self', art: 'card/mabu',
    effects: [{ kind: 'status', name: '貓步', amount: 2, target: 'self' }], upgrade: { effects: [{ kind: 'status', name: '貓步', amount: 3, target: 'self' }] } },
  { id: 'yungong', name: '絕學·運功', cost: 1, type: 能, rarity: '罕見', pool: '絕學', target: 'self', art: 'card/yungong',
    effects: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }], upgrade: { effects: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }] } },
  // 2026-09-04 使用者：升級從「費用變 1」改成「全體懶洋洋 5」，費用維持 2
  { id: 'yide', name: '絕學·以德服人', cost: 2, type: 技, rarity: '稀有', pool: '絕學', target: 'all', art: 'card/yide',
    effects: [{ kind: 'status', name: '懶洋洋', amount: 3, target: 'all' }, { kind: 'heal', n: 5 }],
    upgrade: { effects: [{ kind: 'status', name: '懶洋洋', amount: 5, target: 'all' }, { kind: 'heal', n: 5 }] } },

  // ===== 壞毛病（4） =====
  { id: 'zhongji', name: '中計了', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/zhongji', keywords: ['不可打出'], effects: [], upgrade: {} },
  { id: 'shishou', name: '失手了', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/shishou', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onTurnEnd: 1 } },
  { id: 'zouhuo', name: '走火入魔', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/zouhuo', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onTurnStart: 2 } },
  { id: 'neili', name: '內力不足', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/neili', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onDraw: 'loseEnergy' } },

  // ===== 2026-08-30 新增 20 張 =====
  // 補的是「機制上的空缺」，不是再多幾張打人牌：中毒、反彈、飯糰、隱身收尾原本各只有一兩張撐著，
  // 牌組很難圍繞它們成形。稀有牌也從 4 張補到 7 張——那是每一局最期待的東西。
  // 2026-09-17 使用者裁定：**1 費 → 2 費**。它 1 費打 4×2＝8，同時壓過噹噹的兩張 1 費常見：
  // 卸力掌（最多 6、吃蜷縮）與反手一記（3×2＝6）。**多段還會多吃一次爪力**，差距比帳面更大。
  // 沒有動它的傷害：這張是分段攻擊的代表牌，數字一改會連帶影響中毒流與反彈流的算法
  { id: 'roubao', name: '肉球連擊', cost: 2, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/roubao',
    effects: [{ kind: 'damage', amount: 4, times: 2 }], upgrade: { effects: [{ kind: 'damage', amount: 5, times: 2 }] } },
  { id: 'luoye', name: '忍術·落葉', cost: 1, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'card/luoye',
    effects: [{ kind: 'damage', amount: 4 }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'damage', amount: 6 }, { kind: 'draw', n: 1 }] } },
  { id: 'liangzhua', name: '亮出爪子', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/liangzhua',
    // 升級本來是拿掉「消耗」——一費一次 +1、每輪都能再打，是後期爪力堆最快的來源之一
    // （使用者 2026-09-02：「爪力累積好像太快了」）。改成 +2 但照樣消耗：一局只吃得到一次
    keywords: ['消耗'], effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }] } },
  { id: 'suoyituan', name: '縮成一團', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/suoyituan',
    effects: [{ kind: 'block', amount: 5 }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'block', amount: 7 }, { kind: 'draw', n: 1 }] } },
  // 2026-09-01 使用者點名翻肚（易傷）供給太少（全牌庫只有盯上你了會掛）：威嚇加掛 1 層，
  // 跟盯上你了分工——盯上=純堆層數，威嚇=削攻擊順手掛一層
  // 2026-09-02 使用者：威嚇與威嚇＋太強，改 2 費（原 1 費）
  { id: 'weihe', name: '威嚇', cost: 2, type: 技, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/weihe',
    effects: [{ kind: 'status', name: '炸毛', amount: 2, target: 'enemy' }, { kind: 'status', name: '翻肚', amount: 1, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'status', name: '炸毛', amount: 3, target: 'enemy' }, { kind: 'status', name: '翻肚', amount: 2, target: 'enemy' }] } },
  { id: 'paozhao', name: '忍術·拋爪', cost: 0, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/paozhao',
    effects: [{ kind: 'damage', amount: 2 }], upgrade: { effects: [{ kind: 'damage', amount: 4 }] } },
  // 0 費回 6（2026-09-01 使用者拍板）：反正是消耗牌、一局只有一次，1 費的門檻只是煩人
  { id: 'tianmao', name: '舔毛', cost: 0, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/tianmao',
    keywords: ['消耗'], effects: [{ kind: 'heal', n: 6 }], upgrade: { effects: [{ kind: 'heal', n: 9 }] } },
  // 2026-09-04：3 費打 5 被兩費的如影隨形全面壓過 → 2 費打 8（升級 11）
  { id: 'canying', name: '忍術·殘影', cost: 2, type: 攻, rarity: '罕見', hero: 'ninja', pool: '忍術', target: 'enemy', art: 'card/canying',
    effects: [{ kind: 'damage', amount: 8 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'damage', amount: 11 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'caiweiba', name: '忍術·踩尾巴', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'card/caiweiba',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'status', name: '中毒', amount: 2, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 8 }, { kind: 'status', name: '中毒', amount: 3, target: 'enemy' }] } },   // 2026-09-04 升級傷害 6→8（原本沒漲）
  { id: 'diaohu', name: '忍術·調虎離山', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'all', art: 'card/diaohu',
    effects: [{ kind: 'status', name: '懶洋洋', amount: 1, target: 'all' }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'status', name: '懶洋洋', amount: 2, target: 'all' }, { kind: 'draw', n: 1 }] } },
  { id: 'sashoujian', name: '忍術·撒手鐧', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'card/sashoujian',
    effects: [{ kind: 'damage', amount: 12 }, { kind: 'endTurn' }],
    upgrade: { effects: [{ kind: 'damage', amount: 16 }, { kind: 'endTurn' }] } },
  { id: 'jiuming', name: '忍術·九命怪貓', cost: 2, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/jiuming',
    keywords: ['消耗'], effects: [{ kind: 'heal', n: 8 }, { kind: 'block', amount: 4 }],
    upgrade: { effects: [{ kind: 'heal', n: 12 }, { kind: 'block', amount: 6 }] } },
  { id: 'fanzhua', name: '忍術·刺蝟身', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'card/fanzhua',
    effects: [{ kind: 'status', name: '反彈', amount: 4, target: 'self' }],
    upgrade: { effects: [{ kind: 'status', name: '反彈', amount: 6, target: 'self' }] } },
  { id: 'wanhua', name: '忍術·萬花筒', cost: 2, type: 能, rarity: '稀有', pool: '忍術', target: 'self', art: 'card/wanhua',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'draw', n: 1 }] }],
    upgrade: { cost: 1 } },
  /*
   * 影子分身（2026-09-12 使用者改版）：原本是「打倒一隻就抽一張＋1 爪力」，
   * 那是跟著擊殺走的效果，對慢慢毒死人的打法幾乎不發動。
   * 改成**每回合打出的第一張牌會再打一次**，2 費 → 3 費。
   * 升級版少 1 費（3→2），不是加別的效果——這張本來就強，再疊會失控。
   */
  /*
   * 球球的影子分身**維持單機版原本那張**（使用者 2026-09-14 併回前裁定：「球球的影子分身不用改」）：
   * 2 費，打倒一隻就抽一張＋1 爪力。9/12 那次改版是為了她（跟著擊殺走的效果對慢慢毒死人的打法幾乎不發動），
   * 所以分成兩張：他的照舊、她的是下面那張 `feifei_yingzi`（每回合第一張牌再打一次）。
   */
  { id: 'yingzi', name: '影子分身', cost: 2, type: 能, rarity: '稀有', hero: 'ninja', pool: '忍術', target: 'self', art: 'card/yingzi',
    effects: [{ kind: 'power', trigger: 'onKill', effects: [{ kind: 'draw', n: 1 }, { kind: 'status', name: '爪力', amount: 1, target: 'self' }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'onKill', effects: [{ kind: 'draw', n: 1 }, { kind: 'status', name: '爪力', amount: 1, target: 'self' }, { kind: 'heal', n: 3 }] }] } },
  /*
   * 菲菲的影子分身（2026-09-12 使用者改版，原本兩位共用這個版本）：**每回合打出的第一張牌會再打一次**，3 費；
   * 升級版少 1 費（3→2），不是加別的效果——這張本來就強，再疊會失控。
   * 引擎的 `echoFirst`：只認該回合第一張、能力牌不複製（不然它會當場複製自己）、打完了就不補。
   */
  // 定義上叫「忍術·殘影分身」只是為了跟球球那張「影子分身」不撞（`cards.test.ts` 盯著名字不重複）；她手上照規則拿掉前綴，看到的還是「影子分身」
  { id: 'feifei_yingzi', name: '忍術·殘影分身', cost: 3, type: 能, rarity: '稀有', hero: 'feifei', pool: '忍術', target: 'self', art: 'card/feifei_yingzi',
    effects: [{ kind: 'echoFirst' }],
    upgrade: { cost: 2, effects: [{ kind: 'echoFirst' }] } },
  { id: 'tuishou', name: '絕學·推手', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'enemy', art: 'card/tuishou',
    effects: [{ kind: 'block', amount: 6 }, { kind: 'status', name: '懶洋洋', amount: 1, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'block', amount: 9 }, { kind: 'status', name: '懶洋洋', amount: 1, target: 'enemy' }] } },
  { id: 'dieda', name: '絕學·貓爪抓', cost: 2, type: 攻, rarity: '常見', pool: '絕學', target: 'enemy', art: 'card/dieda',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'heal', n: 3 }],
    upgrade: { effects: [{ kind: 'damage', amount: 8 }, { kind: 'heal', n: 5 }] } },
  { id: 'shibadie', name: '絕學·沾衣十八跌', cost: 2, type: 攻, rarity: '常見', hero: 'ninja', pool: '絕學', target: 'enemy', art: 'card/shibadie',
    effects: [{ kind: 'damage', amount: 5, times: 3 }], upgrade: { effects: [{ kind: 'damage', amount: 6, times: 3 }] } },
  { id: 'hujin', name: '絕學·龜背功', cost: 2, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'card/hujin',
    effects: [{ kind: 'block', amount: 10 }, { kind: 'status', name: '反彈', amount: 2, target: 'self' }],
    upgrade: { effects: [{ kind: 'block', amount: 14 }, { kind: 'status', name: '反彈', amount: 3, target: 'self' }] } },
  { id: 'boming', name: '絕學·拼命', cost: 1, type: 技, rarity: '稀有', pool: '絕學', target: 'self', art: 'card/boming',
    keywords: ['消耗'], effects: [{ kind: 'selfDamage', amount: 3 }, { kind: 'energy', n: 2 }],
    upgrade: { effects: [{ kind: 'energy', n: 2 }] } },
  // 2026-08-31 補 4 張壞毛病：本來只有 4 張，事件塞給你的永遠是那幾張
  { id: 'shibai', name: '睡過頭', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/shibai', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onTurnStart: 1 } },
  { id: 'maoqiu', name: '吐毛球', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/maoqiu', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onTurnEnd: 2 } },
  { id: 'zuiyang', name: '嘴饞', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/zuiyang', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onDraw: 'loseEnergy' } },
  { id: 'fanwei', name: '犯胃痛', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/fanwei', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onTurnEnd: 3 } },
  // 2026-08-31 補 12 張稀有：本來只有 8 張，獎勵畫面很快就重複。
  // 稀有牌該是「改變打法」的，不是「數字比較大」的，所以都掛在少見的機制上。
  // 跟沾衣十八跌一字不差（同 5×3），改走「破防連斬」：打高防怪的稀有解，跟瞬間移動成系列
  { id: 'liandao', name: '絕學·連刀', cost: 2, type: 攻, rarity: '稀有', pool: '絕學', target: 'enemy', art: 'card/liandao',
    effects: [{ kind: 'damage', amount: 4, times: 3, ignoreBlock: true }],
    upgrade: { effects: [{ kind: 'damage', amount: 5, times: 3, ignoreBlock: true }] } },
  // 2026-09-02 使用者：幻影分身改 3 費
  { id: 'huanying', name: '忍術·幻影分身', cost: 3, type: 技, rarity: '稀有', hero: 'ninja', pool: '忍術', target: 'self', art: 'card/huanying',
    // 2026-09-04 整體隱身太強：3／4 層→2／3 層（抽牌不動）
    effects: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }, { kind: 'draw', n: 2 }],
    upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 3, target: 'self' }, { kind: 'draw', n: 3 }] } },
  /*
   * 借力使力跟太極是同一個核心效果（`damageEqualBlock`），而且它還多送蜷縮。
   * 2026-09-17 使用者裁定：**太極收歸噹噹專屬，這張三個角色都留著，但費用 1 → 3。**
   * 兩張一起處理的理由是，只擋太極的話另外兩位照樣有這張，等於沒擋到；
   * 但這張是既有牌、球球與菲菲的牌組裡已經在用，整張拿掉會動到現有玩法，
   * 所以改成「留著但變貴」——要用還是可以用，只是得空出一整回合的費用來換。
   */
  { id: 'jiedao', name: '絕學·借力使力', cost: 3, type: 攻, rarity: '稀有', pool: '絕學', target: 'enemy', art: 'card/jiedao',
    effects: [{ kind: 'damageEqualBlock' }, { kind: 'block', amount: 6 }],
    upgrade: { effects: [{ kind: 'damageEqualBlock' }, { kind: 'block', amount: 10 }] } },
  { id: 'wangming', name: '絕學·亡命', cost: 0, type: 攻, rarity: '稀有', pool: '絕學', target: 'enemy', art: 'card/wangming', keywords: ['消耗'],
    effects: [{ kind: 'damage', amount: 20 }, { kind: 'selfDamage', amount: 6 }],
    upgrade: { effects: [{ kind: 'damage', amount: 26 }, { kind: 'selfDamage', amount: 6 }] } },
  { id: 'wufeng', name: '忍術·無風', cost: 1, type: 能, rarity: '稀有', pool: '忍術', target: 'self', art: 'card/wufeng',
    effects: [{ kind: 'power', trigger: 'turnEndNoAttack', effects: [{ kind: 'block', amount: 8 }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'turnEndNoAttack', effects: [{ kind: 'block', amount: 12 }] }] } },
  { id: 'tiexin', name: '絕學·鐵心', cost: 2, type: 能, rarity: '稀有', pool: '絕學', target: 'self', art: 'card/tiexin',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] }],
    // 升級本來是 2 費→1 費：成長引擎變成順手一丟，後期滾太快（使用者 2026-09-02）。改成打出時先得 2 點、費用不變
    upgrade: { effects: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }, { kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] }] } },
  // 費 2 回 2＝淨零，牌面讀起來像白忙一場，而且飽足剩 1 點時打不出來——
  // 偏偏那正是最需要補牌的時候。改成費 1 回 2：真的聚到氣，名字才名副其實。
  { id: 'sanhua', name: '忍術·三花聚頂', cost: 3, type: 技, rarity: '稀有', pool: '忍術', target: 'self', art: 'card/sanhua',
    effects: [{ kind: 'draw', n: 3 }, { kind: 'energy', n: 2 }],
    upgrade: { effects: [{ kind: 'draw', n: 4 }, { kind: 'energy', n: 2 }] } },
  { id: 'fanpu', name: '絕學·返璞', cost: 2, type: 技, rarity: '稀有', pool: '絕學', target: 'self', art: 'card/fanpu', keywords: ['消耗'],
    effects: [{ kind: 'cleanse' }, { kind: 'heal', n: 8 }],
    upgrade: { cost: 1, effects: [{ kind: 'cleanse' }, { kind: 'heal', n: 14 }] } },
  { id: 'shierlian', name: '絕學·十二連環', cost: 2, type: 攻, rarity: '稀有', pool: '絕學', target: 'all', art: 'card/shierlian',
    // 2026-09-04 使用者：稀有兩費 6×2 太弱 → 5×3／6×3（三段，吃三份爪力）
    effects: [{ kind: 'damage', amount: 5, target: 'all', times: 3 }],
    upgrade: { effects: [{ kind: 'damage', amount: 6, target: 'all', times: 3 }] } },
  // 2026-09-04 使用者：2 費（升級 1 費）→ 3 費（升級 2 費），全體定身太強
  { id: 'jingzhi', name: '忍術·靜止', cost: 3, type: 技, rarity: '稀有', pool: '忍術', target: 'all', art: 'card/jingzhi',
    effects: [{ kind: 'status', name: '定身', amount: 1, target: 'all' }],
    upgrade: { cost: 2 } },
  // 2026-09-04 使用者：忍術池補兩張全體牌（牌面插圖已接入、開放）
  { id: 'luanwu', name: '忍術·手裏劍亂舞', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', target: 'all', art: 'card/luanwu',
    effects: [{ kind: 'damage', amount: 5, target: 'all', times: 2 }],
    upgrade: { effects: [{ kind: 'damage', amount: 7, target: 'all', times: 2 }] } },
  { id: 'dilie', name: '忍術·地裂陣', cost: 3, type: 攻, rarity: '稀有', hero: 'ninja', pool: '忍術', target: 'all', art: 'card/dilie',
    effects: [{ kind: 'damage', amount: 14, target: 'all' }, { kind: 'block', amount: 8 }],
    upgrade: { effects: [{ kind: 'damage', amount: 18, target: 'all' }, { kind: 'block', amount: 10 }] } },
  // 2026-09-04 牌池體檢補牌（使用者拍板：忍術攻擊 4、絕學常見 3、解減益 1、中毒流 4；hidden：牌面到齊後由 art_cards_0904b.sh 拿掉）
  { id: 'huixuan', name: '忍術·迴旋踢', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/huixuan',
    effects: [{ kind: 'damage', amount: 7 }, { kind: 'block', amount: 3 }],
    // 升級版 2026-09-11 改回單段（使用者）：7×3 是 21 點，跟一費常見牌的量級差太多，
    // 而且三段會把「一張牌解決一件事」的乾脆感拆掉。改成 10 點傷害＋4 點蜷縮
    upgrade: { effects: [{ kind: 'damage', amount: 10 }, { kind: 'block', amount: 4 }] } },
  { id: 'lianhuan', name: '忍術·連環踢', cost: 2, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/lianhuan',
    effects: [{ kind: 'damage', amount: 5, times: 3 }],
    upgrade: { effects: [{ kind: 'damage', amount: 6, times: 3 }] } },
  { id: 'beici', name: '忍術·背刺', cost: 1, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'card/beici',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'damage', amount: 6, ifTargetDebuffed: true }],
    upgrade: { effects: [{ kind: 'damage', amount: 8 }, { kind: 'damage', amount: 8, ifTargetDebuffed: true }] } },
  { id: 'zhuiji', name: '忍術·追擊', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'card/zhuiji',
    effects: [{ kind: 'damage', amount: 10 }, { kind: 'energy', n: 2, onKill: true }],
    upgrade: { effects: [{ kind: 'damage', amount: 14 }, { kind: 'energy', n: 2, onKill: true }] } },
  { id: 'doumao', name: '忍術·抖毛', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'card/doumao',
    effects: [{ kind: 'cleanse', max: 1 }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'cleanse', max: 2 }, { kind: 'draw', n: 1 }] } },
  { id: 'maoqiudan', name: '忍術·毛球彈', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'card/maoqiudan',
    effects: [{ kind: 'damage', amount: 4 }, { kind: 'status', name: '中毒', amount: 3, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 6 }, { kind: 'status', name: '中毒', amount: 4, target: 'enemy' }] } },
  { id: 'qianglafen', name: '忍術·嗆辣粉', cost: 2, type: 技, rarity: '罕見', pool: '忍術', target: 'all', art: 'card/qianglafen',
    effects: [{ kind: 'status', name: '中毒', amount: 3, target: 'all' }],
    upgrade: { effects: [{ kind: 'status', name: '中毒', amount: 4, target: 'all' }] } },
  /*
   * 2026-09-17 使用者裁定：**2 費 → 3 費**。
   * 原本它 2 費常見打 12（升 16），跟噹噹的識別牌「崩山掌」（2 費**罕見**、最多 12、升 16）
   * 數字一模一樣——可是崩山掌要**吃掉蜷縮**當彈藥、而且引擎給它 `noStrength`（爪力一點都不加），
   * 崩拳兩樣都沒有。代價比較大、稀有度還比較高，玩家沒有理由選他的牌。漲價把差距補回來。
   */
  { id: 'bengquan', name: '絕學·崩拳', cost: 3, type: 攻, rarity: '常見', pool: '絕學', target: 'enemy', art: 'card/bengquan',
    effects: [{ kind: 'damage', amount: 12 }],
    upgrade: { effects: [{ kind: 'damage', amount: 16 }] } },
  { id: 'tiebushan', name: '絕學·鐵布衫', cost: 1, type: 技, rarity: '常見', pool: '絕學', target: 'self', art: 'card/tiebushan',
    effects: [{ kind: 'block', amount: 8 }, { kind: 'status', name: '鐵布衫', amount: 4, target: 'self' }],
    upgrade: { effects: [{ kind: 'block', amount: 10 }, { kind: 'status', name: '鐵布衫', amount: 6, target: 'self' }] } },
  { id: 'jieli', name: '絕學·卸勁', cost: 1, type: 技, rarity: '常見', pool: '絕學', target: 'enemy', art: 'card/jieli',
    effects: [{ kind: 'block', amount: 5 }, { kind: 'status', name: '翻肚', amount: 1, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'block', amount: 8 }, { kind: 'status', name: '翻肚', amount: 1, target: 'enemy' }] } },
  /*
   * 2026-09-17 使用者裁定：**1 費 → 3 費**（他是照菲菲那邊看到的名字講的：「絕學·毒發」）。
   * 這是**共用牌**，只是菲菲版改名叫毒發（見下面的 `FEIFEI_CARD_NAME`），
   * 所以球球與噹噹的「絕學·催噎」也一起變 3 費——牌只有一份費用，沒辦法只漲她那邊。
   * 會這樣訂是因為這張對下毒的角色特別誇張：把目標身上的中毒直接翻倍，
   * 她整套又都在疊毒，1 費等於一張牌收頭。
   */
  { id: 'cuiye', name: '絕學·催噎', cost: 3, type: 技, rarity: '稀有', pool: '絕學', target: 'enemy', art: 'card/cuiye',
    effects: [{ kind: 'doubleStatus', name: '中毒' }],
    upgrade: { effects: [{ kind: 'doubleStatus', name: '中毒', add: 2 }] } },
  { id: 'ehou', name: '絕學·扼喉', cost: 2, type: 攻, rarity: '罕見', pool: '絕學', target: 'enemy', art: 'card/ehou',
    effects: [{ kind: 'damage', amount: 8 }, { kind: 'status', name: '中毒', amount: 4, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 10 }, { kind: 'status', name: '中毒', amount: 5, target: 'enemy' }] } },
  { id: 'huxin', name: '絕學·護心', cost: 1, type: 能, rarity: '稀有', pool: '絕學', target: 'self', art: 'card/huxin',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'block', amount: 5 }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'block', amount: 8 }] }] } },
  // 2 費打 9 再 +2 爪力、不消耗＝每兩回合就 +2，是稀有牌裡滾最快的。使用者 2026-09-02：「讓某些強力牌 COST 較高」
  // → 抬到 3 費（一回合的飽足全押在這張上），傷害補到 11／15 讓它仍然值得打
  { id: 'jiuweiquan', name: '絕學·九尾拳', cost: 3, type: 攻, rarity: '稀有', pool: '絕學', target: 'enemy', art: 'card/jiuweiquan',
    effects: [{ kind: 'damage', amount: 11 }, { kind: 'status', name: '爪力', amount: 2, target: 'self' }],
    upgrade: { effects: [{ kind: 'damage', amount: 15 }, { kind: 'status', name: '爪力', amount: 2, target: 'self' }] } },

  // ===== 2026-09-02 第二波魔物的戰鬥雜牌（`combatOnly`）=====
  // 只有魔物在戰鬥中塞得進來：不會出現在事件、獎勵與圖鑑的壞毛病清單裡。
  // 戰鬥本來就用牌組的**副本**，所以打完自然消失，不用另外清。
  // 黏液：不是不能打，是「要花 1 顆飯糰才丟得掉」——那顆飯糰就是牠的代價
  { id: 'slime_card', name: '黏液', cost: 1, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/slime_card',
    keywords: ['消耗'], effects: [], upgrade: {}, combatOnly: true },
  // 眼冒金星：2026-09-04 使用者改「走消耗」：0 費打出去就消耗掉，代價是抽到它等於少抽一張牌（原本是不可打出＋虛幻）
  { id: 'dazed_card', name: '眼冒金星', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'card/dazed_card',
    keywords: ['消耗'], effects: [], upgrade: {}, combatOnly: true },

  /*
   * ===== 菲菲的牌（26 張，2026-09-12 晚改版）=====
   *
   * 她是**另一個角色**（球球的師妹，暹羅貓），不是球球換打法——設計稿在
   * `docs/角色三_菲菲_設計稿.md`。
   *
   * **這一版把「距離」整個砍掉**（使用者原話：「不要用距離了」「名稱還是保持用蜷縮就好」
   * 「爪力跟蜷縮還是一樣」「他就是攻擊時都會帶蜷縮就好」「這樣比較統一」）。
   * 她的識別改成：
   *
   * > **毒的累積 ＋ 攻擊牌自己帶蜷縮**（丟完就退，退就是蜷縮）。
   *
   * 用的是全遊戲同一套狀態，玩家不必再學第三條規則；而「攻擊同時是防禦」這件事
   * 本身就夠獨特了——球球要在打與擋之間二選一，她不用，代價是單張的傷害比他低一截。
   *
   * 改數值前一定要先記著：**N 層中毒的總傷害是 N(N+1)/2**（每回合扣 1 層）。
   * 10 層＝55 點、20 層＝210 點。所以翻倍與分毒那類牌在高層數時強得離譜。
   */
  // ---- 起手（3 種、共 10 張）。對照球球的貓抓 ×5＋淡定 ×4＋替身術 ×1 ----
  { id: 'feifei_feizhen', name: '飛針', cost: 1, type: 攻, rarity: '常見', hero: 'feifei', pool: '起手', target: 'enemy', art: 'card/feifei_feizhen',
    effects: [{ kind: 'damage', amount: 3 }, { kind: 'status', name: '中毒', amount: 1, target: 'enemy' }, { kind: 'blockIfPoisoned', amount: 2 }],
    upgrade: { effects: [{ kind: 'damage', amount: 5 }, { kind: 'status', name: '中毒', amount: 2, target: 'enemy' }, { kind: 'blockIfPoisoned', amount: 3 }] } },
  // 她的「淡定」。數值刻意完全一樣——使用者要的就是「功能一樣、圖跟名字是她自己的」
  { id: 'feifei_tuikai', name: '退開', cost: 1, type: 技, rarity: '常見', hero: 'feifei', pool: '起手', target: 'self', art: 'card/feifei_tuikai',
    effects: [{ kind: 'block', amount: 5 }],
    upgrade: { effects: [{ kind: 'block', amount: 8 }] } },
  // 她的「替身術」那一格：開局唯一的招牌技，教玩家「毒要早點下」
  { id: 'feifei_cuidu', name: '淬毒', cost: 1, type: 技, rarity: '常見', hero: 'feifei', pool: '起手', target: 'enemy', art: 'card/feifei_cuidu',
    effects: [{ kind: 'status', name: '中毒', amount: 4, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'status', name: '中毒', amount: 6, target: 'enemy' }] } },

  // ---- 常見（8）----
  { id: 'feifei_lianzhen', name: '連針', cost: 1, type: 攻, rarity: '常見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_lianzhen',
    effects: [{ kind: 'damage', amount: 2, times: 2 }, { kind: 'status', name: '中毒', amount: 2, target: 'enemy' }, { kind: 'blockIfPoisoned', amount: 2 }],
    upgrade: { effects: [{ kind: 'damage', amount: 2, times: 3 }, { kind: 'status', name: '中毒', amount: 3, target: 'enemy' }, { kind: 'blockIfPoisoned', amount: 3 }] } },
  { id: 'feifei_sazhen', name: '撒針', cost: 1, type: 攻, rarity: '常見', hero: 'feifei', pool: '忍術', target: 'all', art: 'card/feifei_sazhen',
    effects: [{ kind: 'damage', amount: 2, target: 'all' }, { kind: 'status', name: '中毒', amount: 1, target: 'all' }, { kind: 'blockIfPoisoned', amount: 3 }],
    upgrade: { effects: [{ kind: 'damage', amount: 3, target: 'all' }, { kind: 'status', name: '中毒', amount: 1, target: 'all' }, { kind: 'blockIfPoisoned', amount: 4 }] } },
  /*
   * 後退閃躲＝**獲得隱身**（使用者 2026-09-14 深夜裁定：「後退閃躲就是獲得隱身」，跟師兄學來的招式）。
   * 原本是 0 費 4 點蜷縮；改隱身後 0 費不合理，使用者同夜再裁定改成 1 費（升級版仍 1 費 2 層）。
   * **2026-09-17 使用者再裁定改成 2 費**（升級版沒有另外指定費用，跟著變 2 費、照舊給 2 層）。第三關的穿透（地藏石偶、虛無貓、面具舞者，加上七隻關主與塔主）蜷縮擋不住，
   * 只有隱身、定身、整回合免傷接得住；她整套防禦全是蜷縮，碰到穿透等於零防禦，第三關很難過。
   * 這是她唯一的閃避，球球的隱身牌她照樣拿不到，所以不會像忍者那樣整副疊隱身。
   * 紙袋、影披風的鎖也因此拿掉（`relics.ts`）。
   */
  { id: 'feifei_lakai', name: '後退閃躲', cost: 2, type: 技, rarity: '常見', hero: 'feifei', pool: '忍術', target: 'self', art: 'card/feifei_lakai',
    note: '跟師兄學來的招式。',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }] } },
  { id: 'feifei_tieqiang', name: '貼牆', cost: 1, type: 技, rarity: '常見', hero: 'feifei', pool: '忍術', target: 'self', art: 'card/feifei_tieqiang',
    effects: [{ kind: 'block', amount: 9 }],
    upgrade: { effects: [{ kind: 'block', amount: 12 }] } },
  { id: 'feifei_moyao', name: '抹藥', cost: 1, type: 技, rarity: '常見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_moyao',
    effects: [{ kind: 'status', name: '中毒', amount: 5, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'status', name: '中毒', amount: 7, target: 'enemy' }] } },
  { id: 'feifei_tanlu', name: '探路', cost: 0, type: 技, rarity: '常見', hero: 'feifei', pool: '忍術', target: 'self', art: 'card/feifei_tanlu',
    effects: [{ kind: 'draw', n: 1 }, { kind: 'block', amount: 2 }],
    upgrade: { effects: [{ kind: 'draw', n: 2 }, { kind: 'block', amount: 2 }] } },
  { id: 'feifei_suoshou', name: '縮手', cost: 1, type: 技, rarity: '常見', hero: 'feifei', pool: '忍術', target: 'self', art: 'card/feifei_suoshou',
    effects: [{ kind: 'block', amount: 5 }, { kind: 'drawNextTurn', n: 1 }],
    upgrade: { effects: [{ kind: 'block', amount: 7 }, { kind: 'drawNextTurn', n: 1 }] } },
  // 自傷牌之一。說法是「手滑」不是「拚了」——她不勇敢，代價是慌張的證明（設計稿第五節）
  { id: 'feifei_shouhua', name: '手滑', cost: 1, type: 攻, rarity: '常見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_shouhua',
    effects: [{ kind: 'damage', amount: 9 }, { kind: 'selfDamage', amount: 2 }, { kind: 'blockIfPoisoned', amount: 2 }],
    upgrade: { effects: [{ kind: 'damage', amount: 13 }, { kind: 'selfDamage', amount: 2 }, { kind: 'blockIfPoisoned', amount: 3 }] } },

  // ---- 罕見（9）----
  { id: 'feifei_cuidugai', name: '淬毒·改', cost: 1, type: 技, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_cuidugai',
    effects: [{ kind: 'status', name: '中毒', amount: 7, target: 'enemy' }, { kind: 'selfDamage', amount: 2 }],
    upgrade: { effects: [{ kind: 'status', name: '中毒', amount: 9, target: 'enemy' }, { kind: 'selfDamage', amount: 2 }] } },
  /*
   * 散毒。**原本是「催化」（中毒翻倍），砍掉重做**：遊戲裡已經有一張一模一樣的
   * 「絕學·催噎」（稀有 1 費、翻倍、不消耗、升級還多加 2 層），而催噎是**共用牌**、
   * 她照樣撿得到——等於她會有兩張翻倍牌，升級後的催化還比稀有的催噎便宜一階。
   *
   * 改成解她量出來最弱的地方：第二關那種「一排魔物」的場面。
   * 跟「餘毒」（屍爆，要先毒死一隻）不同，這張不用等誰倒下，代價是消耗。
   *
   * 2026-09-12 一度改成「基礎版就整份複製」，**當天就還原**：使用者自己玩到升級版，
   * 發現「升級才整份擴散」本來就是這張的成長曲線，基礎版分一半是合理的代價。
   * 留著這段是因為同一個誤判很容易再犯——**看起來弱的基礎版，要先看升級版給了什麼**。
   */
  { id: 'feifei_sandu', name: '散毒', cost: 1, type: 技, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_sandu', keywords: ['消耗'],
    effects: [{ kind: 'spreadStatus', name: '中毒', half: true }],
    upgrade: { effects: [{ kind: 'spreadStatus', name: '中毒' }] } },
  { id: 'feifei_zhenyu', name: '針雨', cost: 2, type: 攻, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'all', art: 'card/feifei_zhenyu',
    effects: [{ kind: 'damage', amount: 3, target: 'all' }, { kind: 'status', name: '中毒', amount: 3, target: 'all' }, { kind: 'block', amount: 5 }],
    upgrade: { effects: [{ kind: 'damage', amount: 3, target: 'all' }, { kind: 'status', name: '中毒', amount: 4, target: 'all' }, { kind: 'block', amount: 7 }] } },
  { id: 'feifei_taoshengsuo', name: '逃生索', cost: 1, type: 技, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'self', art: 'card/feifei_taoshengsuo',
    effects: [{ kind: 'block', amount: 12 }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'block', amount: 15 }, { kind: 'draw', n: 1 }] } },
  { id: 'feifei_duwu', name: '毒霧', cost: 2, type: 能, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'self', art: 'card/feifei_duwu',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '中毒', amount: 1, target: 'all' }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '中毒', amount: 2, target: 'all' }] }] } },
  // 會逃跑、會自己散掉的魔物（橘貓山賊、消散那批）對毒流特別難受——這張就是那個場面的解法
  // 費用 3／4 是使用者 2026-09-14 指定的。**升級版比基礎版貴**，跟全牌表的慣例相反
  //（其他牌升級不是同費就是變便宜），而且 4 費在一般回合打不出來——飯糰每回合只有 3 顆，
  // 要帶飯糰袋、魔氣護符那類加飯糰的秘寶才用得到。這是刻意的取捨：傷害翻倍換一顆飯糰。
  { id: 'feifei_jianxue', name: '見血封喉', cost: 3, type: 攻, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_jianxue',
    effects: [{ kind: 'damageByStatus', name: '中毒' }, { kind: 'block', amount: 3 }],
    upgrade: { cost: 4, effects: [{ kind: 'damageByStatus', name: '中毒', mul: 2 }, { kind: 'block', amount: 3 }] } },
  // 設計稿寫定身 2／3 層，實作收斂成 1／2：點穴手（罕見 2 費）才給 1 層，這張 1 費給 2 層會直接壓過它
  { id: 'feifei_banxian', name: '絆線', cost: 1, type: 技, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_banxian',
    effects: [{ kind: 'status', name: '定身', amount: 1, target: 'enemy' }, { kind: 'block', amount: 4 }],
    upgrade: { effects: [{ kind: 'status', name: '定身', amount: 2, target: 'enemy' }, { kind: 'block', amount: 4 }] } },
  // 自傷牌之二：弄毒的人被自己的毒弄到。慢性的、要撐過去，比直接掉血更貼她
  { id: 'feifei_tianzhen', name: '強力塗毒', cost: 1, type: 技, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'enemy', art: 'card/feifei_tianzhen', keywords: ['消耗'],
    effects: [{ kind: 'status', name: '中毒', amount: 10, target: 'enemy' }, { kind: 'status', name: '中毒', amount: 3, target: 'self' }],
    upgrade: { effects: [{ kind: 'status', name: '中毒', amount: 13, target: 'enemy' }, { kind: 'status', name: '中毒', amount: 3, target: 'self' }] } },
  // 自傷牌之三：全部丟出去，手上就沒東西擋了——這張**刻意不給蜷縮**，那就是它的代價
  { id: 'feifei_quansale', name: '全撒了', cost: 2, type: 攻, rarity: '罕見', hero: 'feifei', pool: '忍術', target: 'all', art: 'card/feifei_quansale',
    effects: [{ kind: 'damage', amount: 12, target: 'all' }, { kind: 'status', name: '中毒', amount: 2, target: 'all' }, { kind: 'status', name: '中毒', amount: 2, target: 'self' }],
    upgrade: { effects: [{ kind: 'damage', amount: 15, target: 'all' }, { kind: 'status', name: '中毒', amount: 3, target: 'all' }, { kind: 'status', name: '中毒', amount: 2, target: 'self' }] } },

  // ---- 稀有（5）----
  { id: 'feifei_qianzhen', name: '千針萬毒', cost: 2, type: 能, rarity: '稀有', hero: 'feifei', pool: '絕學', target: 'self', art: 'card/feifei_qianzhen',
    effects: [{ kind: 'poisonOnAttack', n: 1 }],
    upgrade: { effects: [{ kind: 'poisonOnAttack', n: 2 }] } },
  /*
   * 拒馬。**原本是「距離 ≥2 時每一下少 N 點」，距離砍掉之後重做成「每次獲得蜷縮都多幾點」**。
   *
   * 這是她整套的放大器：她的攻擊牌本來就自帶蜷縮，所以這張讓「打一張＝擋更多」，
   * 而不是再開一條平行的防禦。跟共用的「結界」（每回合開始給 3 點）不衝突——
   * 那張是固定收入，這張是「你越積極出手，擋得越多」。
   */
  { id: 'feifei_juma', name: '拒馬', cost: 1, type: 能, rarity: '稀有', hero: 'feifei', pool: '絕學', target: 'self', art: 'card/feifei_juma',
    effects: [{ kind: 'blockBonus', n: 2 }],
    upgrade: { effects: [{ kind: 'blockBonus', n: 3 }] } },
  // 餘毒＝毒獵手的屍爆。毒流打一排魔物**唯一**的解法，沒有它毒只能單點
  { id: 'feifei_yudu', name: '餘毒', cost: 1, type: 能, rarity: '稀有', hero: 'feifei', pool: '絕學', target: 'self', art: 'card/feifei_yudu',
    effects: [{ kind: 'poisonBurst' }],
    upgrade: { effects: [{ kind: 'poisonBurst', full: true }] } },
  { id: 'feifei_yizhen', name: '一針斃命', cost: 2, type: 攻, rarity: '稀有', hero: 'feifei', pool: '絕學', target: 'enemy', art: 'card/feifei_yizhen', keywords: ['消耗'],
    effects: [{ kind: 'execByStatus', name: '中毒' }],
    upgrade: { keywords: [] } },
  // 最能代表她的一張：慌了、豁出去，然後抱著頭蹲下來
  { id: 'feifei_buyaoguolai', name: '不要過來！', cost: 2, type: 攻, rarity: '稀有', hero: 'feifei', pool: '絕學', target: 'enemy', art: 'card/feifei_buyaoguolai',
    effects: [{ kind: 'damage', amount: 25 }, { kind: 'selfDamage', amount: 8 }, { kind: 'block', amount: 12 }],
    upgrade: { effects: [{ kind: 'damage', amount: 32 }, { kind: 'selfDamage', amount: 8 }, { kind: 'block', amount: 12 }] } },

  /*
   * ===== 噹噹的 29 張（2026-09-17）=====
   *
   * 他的識別是**蜷縮當彈藥**：蜷縮既是防禦也是攻擊的本錢，出招會把它吃掉。
   * 所以他每一張牌都在問同一句話——「現在要打，還是要留著擋」。
   * 這是刻意跟菲菲相反：她的攻擊牌自帶蜷縮、從來不用選（2026-09-16 使用者說那樣不好）。
   *
   * 另一條路是**反彈**：不被消耗、挨打才回敬，所以「卸力打人」跟「硬扛回敬」互相排擠，
   * 同一副牌組塞不下兩條。
   *
   * 起手的正拳**不吃蜷縮**是保命設計：第一回合蜷縮是 0，全部吃蜷縮的話牌組會卡死。
   *
   * 牌面圖 2026-09-17 全部生完了，`hidden` 已經拿掉；同日他也進了選角畫面，可以玩了。
   * 後來又加了四張橋接牌（借力打力、順勢、反震、以身作盾）換掉三張重疊的，現在是 30 張，
   * 那四張的牌面圖還在生，所以只有它們還掛著 `hidden`。
   */
  // ----- 起手三種 -----
  { id: 'dangdang_zhengquan', name: '正拳', cost: 1, type: 攻, rarity: '常見', pool: '起手', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_zhengquan',
    effects: [{ kind: 'damage', amount: 5 }], upgrade: { effects: [{ kind: 'damage', amount: 7 }] } },
  { id: 'dangdang_jiapan', name: '架盤', cost: 1, type: 技, rarity: '常見', pool: '起手', hero: 'dangdang', target: 'self', art: 'card/dangdang_jiapan',
    effects: [{ kind: 'block', amount: 5 }], upgrade: { effects: [{ kind: 'block', amount: 8 }] } },
  { id: 'dangdang_huijing', name: '回敬', cost: 1, type: 技, rarity: '常見', pool: '起手', hero: 'dangdang', target: 'self', art: 'card/dangdang_huijing',
    effects: [{ kind: 'status', name: '反彈', amount: 3, target: 'self' }],
    upgrade: { effects: [{ kind: 'status', name: '反彈', amount: 5, target: 'self' }] } },

  // ----- 忍術・常見 8 張：先讓玩家學會「蜷縮是彈藥」，數值都小 -----
  { id: 'dangdang_xieli', name: '卸力掌', cost: 1, type: 攻, rarity: '常見', pool: '忍術', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_xieli',
    effects: [{ kind: 'damageSpendBlock', max: 6 }], upgrade: { effects: [{ kind: 'damageSpendBlock', max: 8 }] } },
  /*
   * 6 點對上共用的變身術（1 費常見 10 點）是嚴格比較差，等於白做（審查 2026-09-17 中-4）。
   * 不把數字加大——那只是變成第二張變身術。改成跟他的另一條路綁在一起：
   * 身上有反彈才擋得更穩，而反彈是別的角色拿不到的東西。
   */
  { id: 'dangdang_huben', name: '護臂格擋', cost: 1, type: 技, rarity: '常見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_huben',
    effects: [{ kind: 'block', amount: 7 }, { kind: 'ifSelfStatus', name: '反彈', then: [{ kind: 'block', amount: 4 }], otherwise: [] }],
    upgrade: { effects: [{ kind: 'block', amount: 10 }, { kind: 'ifSelfStatus', name: '反彈', then: [{ kind: 'block', amount: 5 }], otherwise: [] }] } },
  { id: 'dangdang_yingpeng', name: '硬碰硬', cost: 1, type: 攻, rarity: '常見', pool: '忍術', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_yingpeng',
    effects: [{ kind: 'damage', amount: 4 }, { kind: 'ifBlock', min: 1, then: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }] }],
    upgrade: { effects: [{ kind: 'damage', amount: 6 }, { kind: 'ifBlock', min: 1, then: [{ kind: 'status', name: '反彈', amount: 3, target: 'self' }] }] } },
  { id: 'dangdang_tiesha', name: '鐵砂護腕', cost: 0, type: 技, rarity: '常見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_tiesha',
    effects: [{ kind: 'block', amount: 3 }], upgrade: { effects: [{ kind: 'block', amount: 5 }] } },
  { id: 'dangdang_tiaoxin', name: '挑釁', cost: 1, type: 技, rarity: '常見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_tiaoxin',
    effects: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'status', name: '反彈', amount: 3, target: 'self' }, { kind: 'draw', n: 1 }] } },
  { id: 'dangdang_fanshou', name: '反手一記', cost: 1, type: 攻, rarity: '常見', pool: '忍術', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_fanshou',
    effects: [{ kind: 'damage', amount: 3, times: 2 }], upgrade: { effects: [{ kind: 'damage', amount: 3, times: 3 }] } },
  { id: 'dangdang_wenzhu', name: '穩住', cost: 1, type: 技, rarity: '常見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_wenzhu',
    effects: [{ kind: 'block', amount: 4 }, { kind: 'keepBlock', n: 4 }],
    upgrade: { effects: [{ kind: 'block', amount: 6 }, { kind: 'keepBlock', n: 6 }] } },
  { id: 'dangdang_jieliqi', name: '借力', cost: 1, type: 技, rarity: '常見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_jieliqi',
    effects: [{ kind: 'healSpendBlock', max: 6 }], upgrade: { effects: [{ kind: 'healSpendBlock', max: 9 }] } },

  // ----- 忍術・罕見 11 張：開始出現真正的取捨 -----
  { id: 'dangdang_bengshan', name: '崩山掌', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_bengshan',
    effects: [{ kind: 'damageSpendBlock', max: 12 }], upgrade: { effects: [{ kind: 'damageSpendBlock', max: 16 }] } },
  // 跟菲菲的拒馬是同一張（同效果、同費用），她那張是稀有，這張跟著改成稀有；
  // 配上千斤墜「每一段攻擊都給」，他這張實際上還更強（審查 2026-09-17 中-4）
  { id: 'dangdang_jiahou', name: '護臂加厚', cost: 1, type: 能, rarity: '稀有', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_jiahou',
    effects: [{ kind: 'blockBonus', n: 2 }], upgrade: { effects: [{ kind: 'blockBonus', n: 3 }] } },
  // 名字本來照設計稿寫「以彼之道」，但忍具已經有一支同名（`your_way`）——
  // 同名不同物正是 2026-09-16 剛清掉的那一類問題，所以改成「原樣奉還」
  { id: 'dangdang_yibi', name: '原樣奉還', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_yibi',
    effects: [{ kind: 'damageByOwnStatus', name: '反彈', mul: 2 }],
    upgrade: { effects: [{ kind: 'damageByOwnStatus', name: '反彈', mul: 3 }] } },
  { id: 'dangdang_zhendang', name: '震盪波', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'all', art: 'card/dangdang_zhendang',
    effects: [{ kind: 'damageSpendBlock', max: 8, target: 'all' }],
    upgrade: { effects: [{ kind: 'damageSpendBlock', max: 10, target: 'all' }] } },
  { id: 'dangdang_jianzhao', name: '見招拆招', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_jianzhao',
    effects: [{ kind: 'block', amount: 6 }, { kind: 'ifEnemyIntent', intent: 'attack', then: [{ kind: 'status', name: '反彈', amount: 3, target: 'self' }] }],
    upgrade: { effects: [{ kind: 'block', amount: 8 }, { kind: 'ifEnemyIntent', intent: 'attack', then: [{ kind: 'status', name: '反彈', amount: 4, target: 'self' }] }] } },
  /*
   * 原本是純 15 點，被共用的金鐘罩（2 費**常見** 17 點）壓死（審查 2026-09-17 中-4）。
   * 改成「擋得住，而且留得下來」——留下來的那幾點下一輪可以拿去卸，
   * 這正是他整套最缺的一環：蜷縮打出去之後，下一輪就裸著。
   */
  { id: 'dangdang_yingkang', name: '硬扛', cost: 2, type: 技, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_yingkang',
    effects: [{ kind: 'block', amount: 15 }, { kind: 'keepBlock', n: 8 }],
    upgrade: { effects: [{ kind: 'block', amount: 20 }, { kind: 'keepBlock', n: 12 }] } },
  // 「護心鏡」跟共用的「絕學·護心」只差一個字，兩張又都是 1 費能力、都在回合開始觸發，
  // 戰鬥紀錄上分不出來。改名「站樁」：站定不動、挨了打就頂回去（審查 2026-09-17 中-3）
  { id: 'dangdang_zhanzhuang', name: '站樁', cost: 1, type: 能, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_zhanzhuang',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '反彈', amount: 3, target: 'self' }] }] } },
  { id: 'dangdang_jieshi', name: '借勢', cost: 0, type: 技, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_jieshi',
    effects: [{ kind: 'blockFromThorns' }], upgrade: { effects: [{ kind: 'blockFromThorns' }, { kind: 'draw', n: 1 }] } },

  /*
   * ===== 兩條路互相加分的四張（2026-09-17 使用者拍板）=====
   *
   * 原本的卸力流（卸蜷縮打人）跟反彈流（挨打回敬）各走各的，中間只有借勢一座單向橋，
   * 結果多半是玩家挑一條走到底、另一半的牌直接跳過。這四張把兩條路接起來，
   * 而且是**換掉**三張重疊的（連環撞跟卸力掌功能重疊、迴力鏢跟起手的回敬同型、
   * 卸甲跟護臂格擋重疊），不是往罕見那一格再塞。
   */
  { id: 'dangdang_jielidali', name: '借力打力', cost: 1, type: 攻, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_jielidali',
    effects: [{ kind: 'damageSpendBlock', max: 6, plusOwnStatus: '反彈' }],
    upgrade: { effects: [{ kind: 'damageSpendBlock', max: 8, plusOwnStatus: '反彈' }] } },
  { id: 'dangdang_shunshi', name: '順勢', cost: 1, type: 能, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_shunshi',
    effects: [{ kind: 'blockOnThorns', n: 2 }], upgrade: { effects: [{ kind: 'blockOnThorns', n: 3 }] } },
  { id: 'dangdang_fanzhen', name: '反震', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_fanzhen',
    effects: [{ kind: 'blockToThorns', per: 2, gain: 1 }],
    upgrade: { effects: [{ kind: 'blockToThorns', per: 2, gain: 2 }] } },
  /*
   * 以身作盾：**卸力流自己養出反彈流**，整組裡最想放的一張。
   * 打一發崩山掌卸 12 點，同時拿 6 點反彈，下一輪挨打就痛回去。
   * 他的忍術稀有本來只有兩張（護臂加厚、銅牆鐵壁），這張補那一格。
   */
  { id: 'dangdang_yishenzuodun', name: '以身作盾', cost: 2, type: 能, rarity: '稀有', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_yishenzuodun',
    effects: [{ kind: 'thornsFromSpend' }], upgrade: { effects: [{ kind: 'thornsFromSpend', full: true }] } },
  // ----- 忍術・稀有 1 張：整套的核心報酬 -----
  /*
   * 銅牆鐵壁：拿到之後「打人」跟「擋住」不再互斥——這是整條路線的目標，
   * 所以代價下得重（3 費、而且要撐到抽得到）。升級只降費，不加效果。
   */
  { id: 'dangdang_tongqiang', name: '銅牆鐵壁', cost: 3, type: 能, rarity: '稀有', pool: '忍術', hero: 'dangdang', target: 'self', art: 'card/dangdang_tongqiang',
    effects: [{ kind: 'halfSpendBlock' }], upgrade: { cost: 2 } },

  // ----- 絕學・稀有 6 張 -----
  { id: 'dangdang_tieshan', name: '絕學·鐵山靠', cost: 2, type: 攻, rarity: '稀有', pool: '絕學', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_tieshan',
    effects: [{ kind: 'damageSpendBlock', all: true, ignoreBlock: true }], upgrade: { cost: 1 } },
  /*
   * 原本是「每回合開始 5 點蜷縮」——那跟共用的絕學·護心一字不差，而且升級還比它差
   *（審查 2026-09-17 中-3）。同一副牌裡兩張都開得到，自己那張比較爛。
   * 改成兩邊各給一點：蜷縮是擋，反彈是回敬，這才是他兩條路的樣子。
   */
  { id: 'dangdang_hubigong', name: '絕學·護臂功', cost: 1, type: 能, rarity: '稀有', pool: '絕學', hero: 'dangdang', target: 'self', art: 'card/dangdang_hubigong',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'block', amount: 4 }, { kind: 'status', name: '反彈', amount: 2, target: 'self' }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'block', amount: 5 }, { kind: 'status', name: '反彈', amount: 3, target: 'self' }] }] } },
  /*
   * 回馬掌刻意保留「**不消耗**」那個手感（原規格就是這樣打的），
   * 代價改成「這回合不能再打攻擊牌」——爽度留著，取捨補回來。
   */
  { id: 'dangdang_huima', name: '絕學·回馬掌', cost: 2, type: 攻, rarity: '稀有', pool: '絕學', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_huima',
    effects: [{ kind: 'damageEqualBlock' }, { kind: 'noAttacksThisTurn' }], upgrade: { cost: 1 } },
  { id: 'dangdang_qianjin', name: '絕學·千斤墜', cost: 2, type: 能, rarity: '稀有', pool: '絕學', hero: 'dangdang', target: 'self', art: 'card/dangdang_qianjin',
    effects: [{ kind: 'blockWhenAttacked', n: 3 }], upgrade: { effects: [{ kind: 'blockWhenAttacked', n: 4 }] } },
  { id: 'dangdang_yishang', name: '絕學·以傷還傷', cost: 2, type: 能, rarity: '稀有', pool: '絕學', hero: 'dangdang', target: 'self', art: 'card/dangdang_yishang',
    effects: [{ kind: 'thornsBonus', n: 4 }], upgrade: { effects: [{ kind: 'thornsBonus', n: 6 }] } },
  { id: 'dangdang_sheshen', name: '絕學·捨身撞', cost: 3, type: 攻, rarity: '稀有', pool: '絕學', hero: 'dangdang', target: 'enemy', art: 'card/dangdang_sheshen',
    effects: [{ kind: 'damageSpendBlock', all: true, mul: 2 }, { kind: 'selfDamage', amount: 10 }],
    upgrade: { effects: [{ kind: 'damageSpendBlock', all: true, mul: 2 }, { kind: 'selfDamage', amount: 6 }] } },

  // ===== 封封：蓄氣劍客 32 張（規格：docs/fengfeng-integration-contract.md）=====
  // 起手三種
  { id: 'fengfeng_pingzhan', name: '平斬', cost: 1, type: 攻, rarity: '常見', pool: '起手', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_pingzhan',
    effects: [{ kind: 'damageSpendQi', amount: 5, perQi: 2, maxQi: 2 }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 8, perQi: 2, maxQi: 2 }] } },
  { id: 'fengfeng_hushen', name: '護身', cost: 1, type: 技, rarity: '常見', pool: '起手', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_hushen',
    effects: [{ kind: 'block', amount: 5 }], upgrade: { effects: [{ kind: 'block', amount: 8 }] } },
  { id: 'fengfeng_tuna', name: '吐納', cost: 1, type: 技, rarity: '常見', pool: '起手', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_tuna',
    effects: [{ kind: 'gainQi', n: 3 }], upgrade: { effects: [{ kind: 'gainQi', n: 5 }] } },

  // 常見
  { id: 'fengfeng_tanbu', name: '探步劍', cost: 1, type: 攻, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_tanbu',
    effects: [{ kind: 'damage', amount: 5 }, { kind: 'gainQi', n: 1 }],
    upgrade: { effects: [{ kind: 'damage', amount: 7 }, { kind: 'gainQi', n: 2 }] } },
  { id: 'fengfeng_hengsao', name: '橫掃', cost: 1, type: 攻, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'all', art: 'card/fengfeng_hengsao',
    effects: [{ kind: 'damageSpendQi', amount: 3, perQi: 1, maxQi: 2, target: 'all' }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 5, perQi: 1, maxQi: 2, target: 'all' }] } },
  { id: 'fengfeng_tabu', name: '踏步重劈', cost: 2, type: 攻, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_tabu',
    effects: [{ kind: 'damageSpendQi', amount: 8, perQi: 2, maxQi: 5 }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 10, perQi: 2, maxQi: 6 }] } },
  { id: 'fengfeng_tiaokai', name: '挑開', cost: 1, type: 攻, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_tiaokai',
    effects: [{ kind: 'damage', amount: 7 }], upgrade: { effects: [{ kind: 'damage', amount: 9 }, { kind: 'draw', n: 1 }] } },
  { id: 'fengfeng_tuibu', name: '退步守勢', cost: 1, type: 技, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_tuibu',
    effects: [{ kind: 'block', amount: 8 }, { kind: 'ifQiAtPlay', min: 3, then: [{ kind: 'block', amount: 3 }] }],
    upgrade: { effects: [{ kind: 'block', amount: 10 }, { kind: 'ifQiAtPlay', min: 3, then: [{ kind: 'block', amount: 4 }] }] } },
  { id: 'fengfeng_zhengxi', name: '整理呼吸', cost: 1, type: 技, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_zhengxi',
    effects: [{ kind: 'gainQi', n: 2 }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'gainQi', n: 3 }, { kind: 'draw', n: 1 }] } },
  { id: 'fengfeng_wenwan', name: '穩住手腕', cost: 0, type: 技, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_wenwan', keywords: ['消耗'],
    effects: [{ kind: 'gainQi', n: 2 }], upgrade: { effects: [{ kind: 'gainQi', n: 3 }] } },
  { id: 'fengfeng_huanshou', name: '換手握劍', cost: 0, type: 技, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_huanshou',
    effects: [{ kind: 'block', amount: 3 }], upgrade: { effects: [{ kind: 'block', amount: 5 }] } },
  { id: 'fengfeng_jianqiao', name: '劍鞘架擋', cost: 1, type: 技, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_jianqiao',
    effects: [{ kind: 'block', amount: 10 }], upgrade: { effects: [{ kind: 'block', amount: 13 }] } },
  { id: 'fengfeng_huibu', name: '回步刺', cost: 1, type: 攻, rarity: '常見', pool: '忍術', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_huibu',
    effects: [{ kind: 'damageSpendQi', amount: 4, perQi: 2, maxQi: 2 }, { kind: 'ifSpentQiAtLeast', min: 2, then: [{ kind: 'draw', n: 1 }] }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 6, perQi: 2, maxQi: 2 }, { kind: 'ifSpentQiAtLeast', min: 2, then: [{ kind: 'draw', n: 1 }] }] } },

  // 罕見
  { id: 'fengfeng_chuantang', name: '穿堂劍', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_chuantang',
    effects: [{ kind: 'damageSpendQi', amount: 8, perQi: 2, maxQi: 4, ignoreBlock: true }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 11, perQi: 2, maxQi: 4, ignoreBlock: true }] } },
  { id: 'fengfeng_shuangduan', name: '雙段劍', cost: 1, type: 攻, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_shuangduan',
    effects: [{ kind: 'damageSpendQi', amount: 3, perQi: 1, maxQi: 2, times: 2 }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 4, perQi: 1, maxQi: 2, times: 2 }] } },
  { id: 'fengfeng_huzhou', name: '回劍護肘', cost: 1, type: 攻, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_huzhou',
    effects: [{ kind: 'damageSpendQi', amount: 5, perQi: 2, maxQi: 3 }, { kind: 'ifSpentQiAtLeast', min: 3, then: [{ kind: 'block', amount: 5 }] }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 7, perQi: 2, maxQi: 3 }, { kind: 'ifSpentQiAtLeast', min: 3, then: [{ kind: 'block', amount: 7 }] }] } },
  { id: 'fengfeng_zhuanshen', name: '轉身蓄勁', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_zhuanshen',
    effects: [{ kind: 'block', amount: 5 }, { kind: 'gainQi', n: 2 }],
    upgrade: { effects: [{ kind: 'block', amount: 8 }, { kind: 'gainQi', n: 2 }] } },
  { id: 'fengfeng_changxi', name: '長息', cost: 2, type: 技, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_changxi',
    effects: [{ kind: 'gainQi', n: 7 }], upgrade: { effects: [{ kind: 'gainQi', n: 9 }] } },
  { id: 'fengfeng_zhenshou', name: '振袖收劍', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_zhenshou',
    effects: [{ kind: 'blockSpendQi', amount: 7, perQi: 2, maxQi: 3 }],
    upgrade: { effects: [{ kind: 'blockSpendQi', amount: 10, perQi: 2, maxQi: 3 }] } },
  { id: 'fengfeng_xunxi', name: '循息', cost: 1, type: 能, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_xunxi',
    effects: [{ kind: 'power', trigger: 'afterCard', cardType: '技能', oncePerTurn: true, sameNameMax: true, effects: [{ kind: 'gainQi', n: 1 }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'afterCard', cardType: '技能', oncePerTurn: true, sameNameMax: true, effects: [{ kind: 'gainQi', n: 2 }] }] } },
  { id: 'fengfeng_shoushi', name: '收勢', cost: 1, type: 能, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_shoushi',
    effects: [{ kind: 'power', trigger: 'afterCard', cardType: '攻擊', minQiSpent: 3, oncePerTurn: true, sameNameMax: true, effects: [{ kind: 'block', amount: 4 }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'afterCard', cardType: '攻擊', minQiSpent: 3, oncePerTurn: true, sameNameMax: true, effects: [{ kind: 'block', amount: 6 }] }] } },
  { id: 'fengfeng_kanshi', name: '看準劍路', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_kanshi',
    effects: [{ kind: 'draw', n: 2 }, { kind: 'ifQiAtPlay', min: 4, then: [{ kind: 'draw', n: 1 }] }],
    upgrade: { cost: 0, keywords: ['消耗'], effects: [{ kind: 'draw', n: 2 }, { kind: 'ifQiAtPlay', min: 4, then: [{ kind: 'draw', n: 1 }] }] } },
  { id: 'fengfeng_youbian', name: '你從右邊上', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_youbian', coop: true,
    effects: [{ kind: 'nextAttackBonusSpendQi', amount: 3, perQi: 2, maxQi: 3, recipients: 'ally' }],
    upgrade: { effects: [{ kind: 'nextAttackBonusSpendQi', amount: 5, perQi: 2, maxQi: 3, recipients: 'ally' }] } },
  { id: 'fengfeng_jiewo', name: '借我擋一下', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_jiewo', coop: true,
    effects: [{ kind: 'gainQi', n: 3 }, { kind: 'ifAllyBlockAtPlay', min: 8, then: [{ kind: 'gainQi', n: 2 }] }],
    upgrade: { effects: [{ kind: 'gainQi', n: 4 }, { kind: 'ifAllyBlockAtPlay', min: 8, then: [{ kind: 'gainQi', n: 2 }] }] } },
  { id: 'fengfeng_husong', name: '我護著你走', cost: 1, type: 技, rarity: '罕見', pool: '忍術', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_husong', coop: true,
    effects: [{ kind: 'blockSpendQi', amount: 7, perQi: 2, maxQi: 3, recipient: 'ally' }],
    upgrade: { effects: [{ kind: 'blockSpendQi', amount: 10, perQi: 2, maxQi: 3, recipient: 'ally' }] } },

  // 稀有絕學
  { id: 'fengfeng_duanliu', name: '絕學·斷流', cost: 2, type: 攻, rarity: '稀有', pool: '絕學', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_duanliu',
    effects: [{ kind: 'damageSpendQi', amount: 10, perQi: 3, allQi: true }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 14, perQi: 3, allQi: true }] } },
  { id: 'fengfeng_kaishan', name: '絕學·開山', cost: 3, type: 攻, rarity: '稀有', pool: '絕學', hero: 'fengfeng', target: 'all', art: 'card/fengfeng_kaishan',
    effects: [{ kind: 'damageSpendQi', amount: 8, perQi: 2, allQi: true, target: 'all' }], upgrade: { cost: 2 } },
  { id: 'fengfeng_cunfeng', name: '絕學·藏鋒', cost: 2, type: 能, rarity: '稀有', pool: '絕學', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_cunfeng',
    effects: [{ kind: 'power', trigger: 'turnStart', sameNameMax: true, effects: [{ kind: 'gainQi', n: 2 }] }], upgrade: { cost: 1 } },
  { id: 'fengfeng_lianxi', name: '絕學·連息', cost: 1, type: 能, rarity: '稀有', pool: '絕學', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_lianxi',
    effects: [{ kind: 'power', trigger: 'afterCard', cardType: '攻擊', minQiSpent: 4, oncePerTurn: true, sameNameMax: true, effects: [{ kind: 'draw', n: 1 }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'afterCard', cardType: '攻擊', minQiSpent: 4, oncePerTurn: true, sameNameMax: true, effects: [{ kind: 'draw', n: 2 }] }] } },
  { id: 'fengfeng_jizhong', name: '集中精神', cost: 0, type: 技, rarity: '稀有', pool: '絕學', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_jizhong', keywords: ['消耗'],
    effects: [{ kind: 'gainQi', n: 6 }, { kind: 'preventEnergyGainThisPhase' }],
    upgrade: { effects: [{ kind: 'gainQi', n: 8 }, { kind: 'preventEnergyGainThisPhase' }] } },
  { id: 'fengfeng_pozhen', name: '絕學·破陣', cost: 2, type: 攻, rarity: '稀有', pool: '絕學', hero: 'fengfeng', target: 'enemy', art: 'card/fengfeng_pozhen',
    effects: [{ kind: 'damageSpendQi', amount: 12, perQi: 2, maxQi: 6 }, { kind: 'ifSpentQiAtLeast', min: 6, then: [{ kind: 'draw', n: 2 }] }],
    upgrade: { effects: [{ kind: 'damageSpendQi', amount: 15, perQi: 2, maxQi: 6 }, { kind: 'ifSpentQiAtLeast', min: 6, then: [{ kind: 'draw', n: 2 }] }] } },
  { id: 'fengfeng_yiqichushou', name: '現在一起上', cost: 2, type: 技, rarity: '稀有', pool: '絕學', hero: 'fengfeng', target: 'self', art: 'card/fengfeng_yiqichushou', coop: true, keywords: ['消耗'],
    effects: [{ kind: 'nextAttackBonusSpendQi', amount: 2, perQi: 1, maxQi: 4, recipients: 'selfAndAlly' }], upgrade: { cost: 1 } },

];

/**
 * 共用牌在**菲菲**手上叫什麼（2026-09-12，使用者指定）。
 *
 * 跟牌面圖同一個道理：**數字、效果一個字都不動**，只有名字換一份。
 * 有些牌名是照球球的打法取的（亮出爪子、鐵頭功），一隻丟針的貓打出來會很怪。
 *
 * 判準：**這個名字有沒有指到球球特有的身體動作？**（爪、拳、踢、頭槌、擒拿）
 * 有就換，沒有就沿用原名——多數牌名（瞬間移動、催眠術、蓄力）跟身體無關，
 * 換了反而讓兩個角色講不同的話做同一件事，圖鑑也難對照。
 *
 * 前綴的規矩（使用者 2026-09-12）：**「絕學」留著、「忍術」兩字拿掉**。
 * 絕學是師門傳下來的功夫，她也學；忍術是球球那一路的身法，她走的是暗器。
 * 這一條也套用在**沒有改名**的忍術牌上——見下面的 `cardNameFor`，
 * 不然她手上會同時出現「拋針」跟「忍術·瞬間移動」，看起來像漏改。
 */
export const FEIFEI_CARD_NAME: Readonly<Record<string, string>> = {
  // ---- 使用者直接指定的（原本還有鐵頭功「全力甩出」，2026-09-14 起她拿不到那張，名字一起拿掉）----
  liangzhua: '磨利飛針',       // 亮出爪子（技能牌：獲得爪力。她磨的是針，不是爪子）
  yuganjijiu: '藥草急救',      // 魚乾急救（連線牌：幫同伴回血。她隨身帶的是藥草不是小魚乾，2026-09-15）
  // ---- 指到球球身體動作的（爪、拳、踢、擒拿），一隻丟針的貓打出來會很怪 ----
  dieda: '絕學·連珠針',        // 絕學·貓爪抓
  bengquan: '絕學·貫針',       // 絕學·崩拳
  jiuweiquan: '絕學·九尾針',   // 絕學·九尾拳
  qinna: '絕學·絆索',          // 絕學·擒拿手
  paozhao: '拋針',             // 忍術·拋爪
  huixuan: '迴旋撒針',         // 忍術·迴旋踢
  lianhuan: '連環針',          // 忍術·連環踢
  roubao: '指尖連彈',          // 肉球連擊（本來就沒有前綴）
  // ---- 講的是球球讓對手噎住（吐毛球那一路），一隻下毒的貓不會這樣打（使用者 2026-09-12）----
  cuiye: '絕學·毒發',          // 絕學·催噎（把目標身上的中毒翻倍＝毒一次發作出來）
  // ---- 掃出來的另外三張，同樣是球球的身體動作（2026-09-12）----
  tieshazhang: '絕學·毒砂',    // 絕學·鐵砂掌（7 傷＋3 毒：他用掌拍，她撒一把帶毒的砂）
  zuiquan: '絕學·亂針',        // 絕學·醉拳（傷害 4～14 亂跳：他是醉了打不準，她是一把針撒出去看運氣）
  caiweiba: '釘尾巴',          // 忍術·踩尾巴（6 傷＋2 毒：他用踩的，她怕痛不靠近，用針釘住）
  jienicailiangbu: '借你兩步',  // 借你踩兩步（連線牌，給同伴貓步：他讓人踩著他，她只是把身法讓給你）
  // ---- 總稽核 2026-09-14 補的兩張（都指到球球的身體動作，之前漏掉）----
  maoqiudan: '毒丸彈',          // 忍術·毛球彈（4 傷＋3 毒：他吐毛球，她彈一顆毒丸）
  ehou: '絕學·刺喉',           // 絕學·扼喉（8 傷＋4 毒：他掐脖子，她一針刺喉）
  // ---- 使用者 2026-09-14 逐張看過之後指定的 ----
  zhaonishuodeda: '抽牌讓你打',   // 照你說的打（目標中毒就讓同伴抽 1 張、再打 6）
  xianbangniliuzhe: '我們一起擋', // 先幫你留著（自己 4、同伴 8 點蜷縮）。使用者打的是「檔」，照牌的意思用「擋」
  wozaizhe: '大聲吼叫',          // 我在這
  hujin: '絕學·貓布袋',   // 球球那張現在叫「絕學·龜背功」          // 絕學·護金
};

/**
 * 共用牌在**噹噹**手上叫什麼（2026-09-17，使用者：「噹噹的卡牌也得把所有的忍術字眼移除」）。
 *
 * 跟菲菲那份同一個道理，但判準不一樣。他不是忍者，是練外家功夫的：拳、掌、踢、爪他都用，
 * 所以「迴旋踢」「崩拳」「亮出爪子」在他手上完全合理，**不用改**。
 * 要改的只有**指名忍者器械**的那種——他不帶那些東西上塔。
 */
export const DANGDANG_CARD_NAME: Readonly<Record<string, string>> = {
  luanwu: '橫掃千軍',   // 忍術·手裏劍亂舞（全體 5 傷打兩輪）。他沒有手裏劍，是掃堂帶過一圈
};

/**
 * 這張牌在這一位手上叫什麼。
 *
 * 順序：專屬名字 → 拿掉「忍術·」前綴 → 原名。
 * 拿掉前綴做成通則而不是逐張列，是因為忍術牌有四十幾張，逐張列遲早會漏一張，
 * 而漏掉的那一張看起來就像 bug。
 *
 * 前綴的規矩（菲菲 2026-09-12、噹噹 2026-09-17，都是使用者指定）：
 * **「絕學」留著、「忍術」兩字拿掉**。絕學是師門傳下來的功夫，誰學都叫絕學；
 * 忍術是球球那一路的身法，她走暗器、他走拳腳，都不是那一路。
 */
export function cardNameFor(def: CardDef, hero: string | undefined): string {
  const own = hero === 'feifei' ? FEIFEI_CARD_NAME : hero === 'dangdang' ? DANGDANG_CARD_NAME : null;
  if (!own) return def.name;
  return own[def.id] ?? def.name.replace(/^忍術·/, '');
}

export const cardById: Record<string, CardDef> = Object.fromEntries(cards.map((c) => [c.id, c]));

export const STARTER_DECK: readonly string[] = [
  'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo',
  'tanding', 'tanding', 'tanding', 'tanding', 'kawarimi',
];

/**
 * 菲菲的起手十張（2026-09-12 晚改版）。**形狀跟球球一模一樣**：
 * 飛針 x5（他的貓抓）、退開 x4（他的淡定）、淬毒 x1（他的替身術那一格）。
 *
 * 差別全在內容：他的貓抓是 6 點純傷害，她的飛針是 **3 傷＋1 層毒＋2 點蜷縮**——
 * 單看當下比較弱，但毒會滾、而且她出手的同時就擋好了。
 * 那正是她的識別：**攻擊同時是防禦**，球球得在打與擋之間二選一。
 *
 * 飛針為什麼是 3 傷不是 4 傷（2026-09-12 量過才改）：**4 傷的話那 2 點蜷縮等於白送**。
 * 毒會遞減（N 層總共打 N(N+1)/2），算四回合下來：她 3 費全丟飛針是
 * 直傷 48 ＋ 毒 24 ＝ 72，球球三張貓抓也是 72——傷害一模一樣，她卻多拿 24 點蜷縮。
 * 改成 3 傷之後六百局對照：到三關 105 對 93、通關 12 對 14，跟球球對齊了
 * （難度 3、5 也一樣）。她仍然明顯比較耐打（到二關 六成 對 四成），
 * 那是「怕痛所以先擋好」的設定本身，不是數值失衡。
 */
export const FEIFEI_STARTER_DECK: readonly string[] = [
  'feifei_feizhen', 'feifei_feizhen', 'feifei_feizhen', 'feifei_feizhen', 'feifei_feizhen',
  'feifei_tuikai', 'feifei_tuikai', 'feifei_tuikai', 'feifei_tuikai',
  'feifei_cuidu',
];

/**
 * 噹噹的起手十張（2026-09-17）。形狀跟另外兩位一樣：基本攻擊 ×5、基本防禦 ×4、招牌技 ×1。
 *
 * 正拳 5 點比貓抓（6 點）低一點，架盤 5 點跟淡定一樣——他的起手刻意**平淡**：
 * 真正的路數（卸力掌、崩山掌那些吃蜷縮的）要靠後面抽到才成形，
 * 起手十張的任務只是「撐到那時候」。回敬那一張是他的識別，開場就先掛 3 點反彈。
 */
export const DANGDANG_STARTER_DECK: readonly string[] = [
  'dangdang_zhengquan', 'dangdang_zhengquan', 'dangdang_zhengquan', 'dangdang_zhengquan', 'dangdang_zhengquan',
  'dangdang_jiapan', 'dangdang_jiapan', 'dangdang_jiapan', 'dangdang_jiapan',
  'dangdang_huijing',
];

export const FENGFENG_STARTER_DECK: readonly string[] = [
  'fengfeng_pingzhan', 'fengfeng_pingzhan', 'fengfeng_pingzhan', 'fengfeng_pingzhan',
  'fengfeng_hushen', 'fengfeng_hushen', 'fengfeng_hushen', 'fengfeng_hushen',
  'fengfeng_tuna', 'fengfeng_tuna',
];

/** 這個職業的起手十張。沒有專屬的就用球球那份（武士現在是這種情況） */
export function starterDeckFor(hero: string | undefined): readonly string[] {
  if (hero === 'feifei') return FEIFEI_STARTER_DECK;
  if (hero === 'dangdang') return DANGDANG_STARTER_DECK;
  if (hero === 'fengfeng') return FENGFENG_STARTER_DECK;
  return STARTER_DECK;
}

/**
 * 圖鑑與除錯頁「這一位拿得到的牌」（2026-09-14 夜間稽核 中-2）。
 *
 * 沒標 `hero` 的是共用、標了的只有那位拿得到——**起手區例外，照起手十張的清單認**：
 * 貓抓、淡定沒標 `hero`，照一般規則會算成共用，切到菲菲時起手區就混進兩張球球畫像的牌，
 * 而她一輩子拿不到。兩個畫面各寫一份判準的話遲早又走鐘，所以放在這裡。
 */
export function inHeroCollection(c: Pick<CardDef, 'id' | 'pool' | 'hero'>, hero: string | undefined): boolean {
  return c.pool === '起手' ? starterDeckFor(hero).includes(c.id) : !c.hero || c.hero === (hero ?? 'ninja');
}
