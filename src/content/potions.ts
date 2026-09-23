import type { PotionDef } from '../engine/types';

/*
 * 稀有度（2026-09-23 內容擴充第一批，`PotionDef.rarity`）。原本 35 支平均抽，起死回生丹跟飯糰一樣常見。
 * 稀有 6 支照提案（起死回生丹、先手香、金鐘罩膏、分身油、九命符、半卷殘頁）；其餘照**標價**分：
 * 50 條以上的 12 支＝罕見、以下的 17 支＝常見——價格本來就是照「換得掉多少一回合」訂的（見下面第二批的註解），
 * 拿它當強弱的分界，不必另外再憑感覺排一次。**價格一條都沒動**（罐頭鋪不另外乘稀有度倍率，理由見 `rewards.ts` 的 `POTION_RARITY_ODDS`）。
 */
export const potions: PotionDef[] = [
  { id: 'smoke_bomb', name: '煙霧彈', rarity: '常見', text: '獲得 2 層隱身。', art: 'codex/potion_smoke_bomb', price: 45, target: 'self', effects: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }] },
  { id: 'shuriken', name: '手裡劍', rarity: '常見', text: '對目標造成 8 點傷害。', art: 'codex/potion_shuriken', price: 30, target: 'enemy', effects: [{ kind: 'damage', amount: 8 }] },
  { id: 'onigiri', name: '飯糰', rarity: '常見', text: '本回合多 1 顆飯糰。', art: 'codex/potion_onigiri', price: 30, target: 'self', effects: [{ kind: 'energy', n: 1 }] },
  { id: 'catgrass_tea', name: '貓草茶', rarity: '常見', text: '回復 10 點生命。', art: 'codex/potion_catgrass_tea', price: 40, target: 'self', effects: [{ kind: 'heal', n: 10 }] },
  { id: 'firecracker', name: '鞭炮', rarity: '常見', text: '對全體魔物造成 6 點傷害。', art: 'codex/potion_firecracker', price: 40, target: 'all', effects: [{ kind: 'damage', amount: 6, target: 'all' }] },
  { id: 'rope', name: '麻繩', rarity: '常見', text: '給目標定身（七成會中）。', art: 'codex/potion_rope', price: 40, target: 'enemy', effects: [{ kind: 'status', name: '定身', amount: 1, target: 'enemy' }] },
  { id: 'tuna', name: '鮪魚', rarity: '罕見', text: '抽 3 張牌。', art: 'codex/potion_tuna', price: 50, target: 'self', effects: [{ kind: 'draw', n: 3 }] },
  { id: 'whetstone', name: '爪力粉', rarity: '常見', text: '這場戰鬥獲得 1 點爪力。', art: 'codex/potion_whetstone', price: 30, target: 'self', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] },
// ===== 2026-08-31 補 12 個。本來只有 8 個，一局就用掉五到十個，等於每局都在用同一批 =====
  // 補的方向：把「臨場救命」的路數補齊——原本 8 個裡沒有解毒、沒有清減益、
  // 沒有大量蜷縮、沒有多段輸出，遇到對應的困境只能硬吃。
  { id: 'milk', name: '溫牛奶', rarity: '常見', text: '清掉自己身上所有的減益。', art: 'codex/potion_milk', price: 45, target: 'self', effects: [{ kind: 'cleanse' }] },
  { id: 'quilt', name: '小被子', rarity: '常見', text: '獲得 15 點蜷縮。', art: 'codex/potion_quilt', price: 45, target: 'self', effects: [{ kind: 'block', amount: 15 }] },
  { id: 'claw_oil', name: '爪力膏', rarity: '罕見', text: '這場戰鬥獲得 3 點爪力。', art: 'codex/potion_claw_oil', price: 50, target: 'self', effects: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }] },
  { id: 'cat_step', name: '貓步粉', rarity: '罕見', text: '這場戰鬥獲得 3 點貓步。', art: 'codex/potion_cat_step', price: 50, target: 'self', effects: [{ kind: 'status', name: '貓步', amount: 3, target: 'self' }] },
  { id: 'needle_rain', name: '三連針', rarity: '常見', text: '對目標造成 4 點傷害，打 3 次。', art: 'codex/potion_needle_rain', price: 45, target: 'enemy', effects: [{ kind: 'damage', amount: 4, times: 3 }] },
  { id: 'pepper', name: '胡椒罐', rarity: '常見', text: '給全體魔物 3 層中毒。', art: 'codex/potion_pepper', price: 40, target: 'all', effects: [{ kind: 'status', name: '中毒', amount: 3, target: 'all' }] },
  { id: 'mirror_shard', name: '鏡片', rarity: '常見', text: '獲得 5 點反彈。', art: 'codex/potion_mirror_shard', price: 40, target: 'self', effects: [{ kind: 'status', name: '反彈', amount: 5, target: 'self' }] },
  { id: 'nip_ball', name: '貓薄荷球', rarity: '罕見', text: '給全體魔物 2 層懶洋洋與 2 層翻肚。', art: 'codex/potion_nip_ball', price: 50, target: 'all', effects: [{ kind: 'status', name: '懶洋洋', amount: 2, target: 'all' }, { kind: 'status', name: '翻肚', amount: 2, target: 'all' }] },
  { id: 'dried_fish_bundle', name: '兩顆飯糰', rarity: '罕見', text: '本回合多 2 顆飯糰。', art: 'codex/potion_dried_fish_bundle', price: 55, target: 'self', effects: [{ kind: 'energy', n: 2 }] },
  { id: 'secret_scroll', name: '半卷殘頁', rarity: '稀有', text: '抽 2 張牌，並多 2 顆飯糰。', art: 'codex/potion_secret_scroll', price: 55, target: 'self', effects: [{ kind: 'draw', n: 2 }, { kind: 'energy', n: 2 }] },
  { id: 'iron_paw', name: '鐵指虎', rarity: '罕見', text: '對目標造成 16 點傷害。', art: 'codex/potion_iron_paw', price: 60, target: 'enemy', effects: [{ kind: 'damage', amount: 16 }] },
  { id: 'nine_lives', name: '九命符', rarity: '稀有', text: '回復 20 點生命。', art: 'codex/potion_nine_lives', price: 60, target: 'self', effects: [{ kind: 'heal', n: 20 }] },

  /*
   * 2026-09-11 第二批（使用者指定）。
   *
   * 為什麼要加這一批：原本 20 支裡有 15 支是**純數值**（打幾點、回幾血、加幾點爪力、抽幾張、給幾顆飯糰），
   * 「該不該現在用忍具」不太需要想——反正回血就喝。這一批全是**改變當回合玩法**的，
   * 用掉的時機才是決定本身。價格照「換得掉多少一回合」訂，不照數字大小。
   */
  { id: 'clone_oil', name: '分身油', rarity: '稀有', text: '這回合下一張攻擊牌的傷害加倍。', art: 'codex/potion_clone_oil', price: 65, target: 'self',
    effects: [{ kind: 'doubleNextAttack' }] },
  { id: 'iron_salve', name: '金鐘罩膏', rarity: '稀有', text: '本回合不受任何傷害。', art: 'codex/potion_iron_salve', price: 75, target: 'self',
    effects: [{ kind: 'immuneThisTurn' }] },
  // 只在快死的時候用得出來：平常是一格廢物，關鍵時刻是一條命。所以價格壓在中段
  { id: 'revive_pill', name: '起死回生丹', rarity: '稀有', text: '只在生命低於三成時用得出來：回復一半的最大生命。', art: 'codex/potion_revive_pill', price: 60, target: 'self',
    usable: { check: (hp, maxHp) => hp * 10 < maxHp * 3, reason: '生命高於三成，還用不上' },
    effects: [{ kind: 'heal', n: 0, percent: 50 }] },
  { id: 'first_incense', name: '先手香', rarity: '稀有', text: '魔物這回合不出手。', art: 'codex/potion_first_incense', price: 80, target: 'self',
    effects: [{ kind: 'skipEnemyTurn' }] },
  { id: 'pick_back', name: '撿回來', rarity: '罕見', text: '從棄牌堆挑一張拿回手上。', art: 'codex/potion_pick_back', price: 50, target: 'self',
    effects: [{ kind: 'recoverFromDiscard' }] },
  { id: 'claw_bolt', name: '貓爪雷', rarity: '罕見', text: '對隨機魔物造成 10 點傷害，打 3 次。', art: 'codex/potion_claw_bolt', price: 65, target: 'self',
    effects: [{ kind: 'damageScatter', amount: 10, times: 3 }] },
  { id: 'bind_nail', name: '定身釘', rarity: '罕見', text: '給全體魔物 1 層定身（每隻各有七成會中）。', art: 'codex/potion_bind_nail', price: 70, target: 'all',
    effects: [{ kind: 'status', name: '定身', amount: 1, target: 'all' }] },

  /*
   * 2026-09-11 第二批（使用者從 15 支的規劃裡挑了這 5 支）。
   *
   * **五支全是對單體的**，這是刻意的：原本 27 支裡有 19 支作用在自己身上、只有 4 支對單體，
   * 忍具幾乎等於「自己變強」的另一個名字。這五支補的是「對付眼前這一隻」——
   * 而且各自剋一種讓戰鬥卡住的狀況：搶防禦剋龜縮、破功剋越打越硬、催噎剋高血量、
   * 亂石補便宜的爆發、以彼之道給堆蜷縮流一個出口。
   *
   * **五支用的效果引擎全部已經有**（`stealBlock`／`removeStatuses`／`doubleStatus`／
   * `damageRandom`／`damageEqualBlock`），一種新效果都沒加——這批的風險主要在數值不在程式。
   */
  { id: 'steal_claw', name: '順手牽羊爪', rarity: '罕見', text: '把目標的防禦全部搶過來，變成自己的蜷縮。', art: 'codex/potion_steal_claw', price: 55, target: 'enemy',
    // 剋鱗甲、縮殼、不壞身那幾隻「怎麼打都打不穿」的：不是清掉牠的防禦，是搬到自己身上
    effects: [{ kind: 'stealBlock' }] },
  { id: 'break_art', name: '破功散', rarity: '罕見', text: '拔掉目標身上的爪力、貓步、鱗甲與不壞身，每種最多 10 層。', art: 'codex/potion_break_art', price: 60, target: 'enemy',
    // 這幾個是會讓一場仗「永遠打不完」的狀態：爪力越滾越痛、鱗甲每回合長防禦、不壞身防禦根本不歸零。
    // 貓步是稽核 2026-09-11 補的：鏡貓的「照著學」會把玩家的爪力與貓步一起抄走，
    // 而貓步會讓牠疊防禦時多長——跟既有的「忍術·封口術」同一份名單（那張也是拔爪力＋貓步）
    // **有上限 10 層**（使用者 2026-09-11 拍板）：全拔的話對著堆了一整場爪力的關主等於一支清場，
    // 跟當年「忍術·封口術」被砍成 `max: 5` 是同一個理由。忍具一次性、60 條，上限放寬到 10
    effects: [{ kind: 'removeStatuses', names: ['爪力', '貓步', '鱗甲', '不壞身'], max: 10 }] },
  { id: 'double_back', name: '加倍奉還', rarity: '常見', text: '目標身上的中毒翻倍，再加 2 層。', art: 'codex/potion_double_back', price: 40, target: 'enemy',
    /**
     * **一定要帶 `add`**：`doubleStatus` 在目標身上 0 層時會印「催不動」什麼都不做
     *（`effects.ts` 那條是為了讓玩家知道飯糰花去哪）。牌那樣寫沒問題——牌每場都能再打一次；
     * 忍具是一次性的，花 40 條買到一行「催不動」太傷。加 2 層保底，有中毒才翻倍。
     */
    effects: [{ kind: 'doubleStatus', name: '中毒', add: 2 }] },
  { id: 'rubble_bag', name: '亂石包', rarity: '常見', text: '對目標造成 6～22 點傷害（看運氣）。', art: 'codex/potion_rubble_bag', price: 35, target: 'enemy',
    // 期望值 14 點、35 條，比鐵爪套（16 點、60 條）便宜但不穩。便宜那一格本來只有三支，這支補早期
    effects: [{ kind: 'damageRandom', min: 6, max: 22 }] },
  { id: 'your_way', name: '以彼之道', rarity: '罕見', text: '造成等同你目前蜷縮的傷害。', art: 'codex/potion_your_way', price: 50, target: 'enemy',
    // 跟「絕學·太極」「絕學·借力使力」同一路。堆蜷縮流一直缺一個把防禦換成傷害的出口，
    // 而那兩張牌不一定抽得到——這支是買得到的版本
    effects: [{ kind: 'damageEqualBlock' }] },

  /*
   * 2026-09-11 第三批（使用者從新提案裡挑的「剋具體麻煩」三支）。
   *
   * 三支各剋一種**目前完全沒有解法**的狀況，都是查過魔物資料才訂的：
   *   飛行 9 隻、反彈 9 隻（另有 7 處招式會自己再加，像刺蝟師傅的豎刺、貓又的運氣）、龜縮一堆。
   * 三支用的效果引擎全部已經有，一種新效果都沒加。
   */
  { id: 'bird_glue', name: '黏鳥膠', rarity: '常見', text: '把目標從天上打下來，這場牠飛不回去。', art: 'codex/potion_bird_glue', price: 35, target: 'enemy',
    /**
     * 飛行＝**傷害砍半**（`actions.ts` 的 `Math.floor(dmg / 2)`），打中一下才掉一層。
     * 月蛾后飛行 8、烏天狗與織影蜘蛛 6，要先白打六八下才落地——
     * 九隻會飛的魔物，玩家目前一個直接的解法都沒有。
     * 不設 `max`：那幾層本來就是「打就會掉」的東西，一次拉下來才是這支的賣點。
     * 2026-09-11 使用者把飛行改成「打掉就不再補」之後，這支就等於「省下那幾下」——
     * 不用特例旗標，單純清層數就達成「這場飛不回去」。
     */
    effects: [{ kind: 'removeStatuses', names: ['飛行'] }] },
  { id: 'thorn_shears', name: '剪刺鉗', rarity: '常見', text: '剪掉目標身上的反彈。', art: 'codex/potion_thorn_shears', price: 40, target: 'enemy',
    /**
     * 反彈在魔物身上＝**你打牠、你自己扣血**（`actions.ts`）。九隻靜態帶著（鎧甲金龜 5、龍 3、
     * 殘影 3、詛咒老住持 3、掛軸墨貓 2、白狐巫女 2、犰狳王 2、刺蝟師傅 2、月蛾后 1），
     * 另有七處招式會自己再加。**剪掉之後牠要花一個回合才豎得回來**，那是正當的來回。
     * 而反彈**不在 `DEBUFFS` 裡**，所以溫牛奶、返璞那些「清減益」的手段都碰不到它，
     * 破功散拔的也是增益那四種——今天零解法，只能硬吃。
     */
    effects: [{ kind: 'removeStatuses', names: ['反彈'] }] },
  { id: 'armor_pick', name: '破甲錐', rarity: '常見', text: '對目標造成 12 點傷害，無視防禦。', art: 'codex/potion_armor_pick', price: 45, target: 'enemy',
    /**
     * 剋龜縮，但跟「順手牽羊爪」是兩條路：那支是把防禦**搬到自己身上**（賺，但要先有得搶），
     * 這支是**直接穿過去**（防禦再厚也照打，但拿不到好處）。
     * 價位擺在手裡劍（8 點 30 條）與鐵爪套（16 點 60 條）中間：那兩支都是每點 3.75 條，
     * 12 點照線性就是 45，無視防禦當附帶——它只在對手真的有防禦時才用得上、不是每場都賺。
     *
     * **注意它會吃反彈**（`ignoreBlock` 走的是一般攻擊路徑、不是直傷）：而「防禦厚」跟「身上有刺」
     * 重疊度很高（鎧甲金龜 鱗甲 8＋反彈 5、龍 鱗甲 10＋反彈 3），最適合用它的場面會先扎自己一下。
     * 這是既有規則的自然結果，不是這支的特例。
     */
    effects: [{ kind: 'damage', amount: 12, ignoreBlock: true }] },

  /*
   * ===== 2026-09-23 內容擴充第一批：10 支 =====
   *
   * 原本 35 支**沒有一支放大角色的路數**：蓄氣 0 支、反彈只有鏡片、隱身只有煙霧彈、毒只有胡椒罐與加倍奉還。
   * 這一批四隻各補兩支（封封蓄氣、菲菲毒、噹噹反彈、球球隱身與潛水），加一支大場面的稀有（火雷珠）、一支連線互助（對半包子）。
   * 效果引擎全部已經有，一種新效果都沒加。標價照同級的舊忍具：常見 35～45、罕見 50～55、稀有 75。
   * **只鎖蓄氣那兩支**（別人身上沒有蓄氣，喝了什麼都不會發生）；其餘「偏誰」只是比較好用，誰都抽得到。
   */
  { id: 'qi_tea', name: '提神茶', rarity: '常見', notFor: ['ninja', 'feifei', 'dangdang'], text: '獲得 6 點蓄氣。', art: 'codex/potion_qi_tea', price: 40, target: 'self',
    effects: [{ kind: 'gainQi', n: 6 }] },
  // 蓄氣上限 12，所以給 12 就是「灌滿」；已經有氣的時候多出來的會被上限吃掉，牌面照實寫「灌滿」不寫 12 點
  { id: 'sword_talisman', name: '劍意符', rarity: '罕見', notFor: ['ninja', 'feifei', 'dangdang'], text: '蓄氣直接灌滿（12 點）。', art: 'codex/potion_sword_talisman', price: 55, target: 'self',
    effects: [{ kind: 'gainQi', n: 12 }] },
  // 菲菲的「散毒」牌是一半分給其他每一隻（`half`），這支同一套：目標自己的層數不動
  { id: 'spread_powder', name: '散毒粉', rarity: '常見', text: '目標身上的中毒，分一半給其他每一隻魔物（目標自己的不變）。', art: 'codex/potion_spread_powder', price: 40, target: 'enemy',
    effects: [{ kind: 'spreadStatus', name: '中毒', half: true }] },
  // 跟千針萬毒同一個旗標（可以疊）：之後每打出一張攻擊牌，打到的那隻（打全體的就每一隻）多 2 層中毒
  { id: 'needle_salve', name: '千針膏', rarity: '罕見', text: '這場戰鬥之後每打出一張攻擊牌，再給那個目標 2 層中毒。', art: 'codex/potion_needle_salve', price: 55, target: 'self',
    effects: [{ kind: 'poisonOnAttack', n: 2 }] },
  { id: 'iron_oil', name: '鐵布衫油', rarity: '常見', text: '獲得 10 點蜷縮與 3 點反彈。', art: 'codex/potion_iron_oil', price: 45, target: 'self',
    effects: [{ kind: 'block', amount: 10 }, { kind: 'status', name: '反彈', amount: 3, target: 'self' }] },
  // 跟噹噹的「以傷還傷」同一個旗標：只在真的反彈回敬出去時才加，身上沒有反彈就不會憑空打人
  { id: 'payback_powder', name: '以牙還牙粉', rarity: '罕見', text: '這場戰鬥反彈回敬時多打 4 點。', art: 'codex/potion_payback_powder', price: 50, target: 'self',
    effects: [{ kind: 'thornsBonus', n: 4 }] },
  { id: 'dive_straw', name: '潛水竹管', rarity: '常見', text: '獲得 2 層潛水（下回合開始變成隱身）。', art: 'codex/potion_dive_straw', price: 40, target: 'self',
    effects: [{ kind: 'status', name: '潛水', amount: 2, target: 'self' }] },
  { id: 'decoy_doll', name: '替身人偶', rarity: '罕見', text: '獲得 1 層隱身，並抽 2 張牌。', art: 'codex/potion_decoy_doll', price: 55, target: 'self',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 2 }] },
  // 丟出去的（飛行物 `thunder_bead`，見 `ui/projectile-kinds.ts`）。忍具的傷害不吃爪力（`effects.ts` 的 `noStrength`），牌面寫的就是實際的量
  { id: 'thunder_bead', name: '火雷珠', rarity: '稀有', text: '對全體魔物造成 14 點傷害。', art: 'codex/potion_thunder_bead', price: 75, target: 'all',
    effects: [{ kind: 'damage', amount: 14, target: 'all' }] },
  /*
   * 提案裡叫「分你一半」，但那是連線牌 `fenyiban` 的名字（玩家看得到的名字不能重複，`name_unique.test.ts`），
   * 照圖（掰成兩半的大白包子）改叫「對半包子」。效果跟那張牌同一個（`blockAll`）：一個人時只有自己拿到。
   */
  { id: 'share_half', name: '對半包子', rarity: '常見', text: '你和同伴各獲得 8 點蜷縮（一個人時只有自己）。', art: 'codex/potion_share_half', price: 35, target: 'self',
    effects: [{ kind: 'blockAll', amount: 8 }] },

  /*
   * ===== 2026-09-23 內容擴充第二批：6 支（提案第⑤節第二批）=====
   *
   * 四種新效果（`energyNextTurn`、`guardLethal`、`transformFromHand`、`daze`）＋照妖鏡的「全體拔狀態」＋傳功丹（現成的給同伴）。
   * 圖示照美術 art2 的對照表（代號＝檔名）；迷魂香是丟出去的（飛行物 `daze_incense`，見 `ui/projectile-kinds.ts`）。
   */
  { id: 'revive_incense', name: '回魂香', rarity: '稀有', text: '這場戰鬥接下來第一次會被打倒時，留下 1 點生命。', art: 'codex/potion_revive_incense', price: 70, target: 'self',
    effects: [{ kind: 'guardLethal' }] },
  { id: 'bento', name: '便當', rarity: '常見', text: '下回合開始時多 2 顆飯糰。', art: 'codex/potion_bento', price: 40, target: 'self',
    effects: [{ kind: 'energyNextTurn', n: 2 }] },
  // 魔物躲起來靠的是隱身（九隻會自己掛）；潛水只有鏡中球球學你的牌才會掛上。提案寫「虛化與潛水」，三個一起拔才名實相符（見報告）
  { id: 'demon_mirror', name: '照妖鏡', rarity: '罕見', text: '拔掉全體魔物身上的隱身、潛水與虛化。', art: 'codex/potion_demon_mirror', price: 55, target: 'all',
    effects: [{ kind: 'removeStatuses', names: ['隱身', '潛水', '虛化'], target: 'all' }] },
  { id: 'transfer_pill', name: '傳功丹', rarity: '常見', text: '同伴抽 2 張牌，你多 1 顆飯糰（一個人時自己抽 2 張）。', art: 'codex/potion_transfer_pill', price: 45, target: 'self',
    effects: [{ kind: 'drawAlly', n: 2 }, { kind: 'energy', n: 1 }] },
  { id: 'swap_talisman', name: '替換符', rarity: '罕見', text: '挑一張手牌，換成一張隨機的升級牌（只在這場戰鬥）。', art: 'codex/potion_swap_talisman', price: 50, target: 'self',
    effects: [{ kind: 'transformFromHand' }] },
  { id: 'daze_incense', name: '迷魂香', rarity: '稀有', text: '目標這回合的攻擊改打牠旁邊的同伴（沒有同伴就打空）。', art: 'codex/potion_daze_incense', price: 70, target: 'enemy',
    effects: [{ kind: 'daze' }] },
];

export const potionById: Record<string, PotionDef> = Object.fromEntries(potions.map((p) => [p.id, p]));
