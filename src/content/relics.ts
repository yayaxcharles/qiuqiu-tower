import type { RelicDef } from '../engine/types';

export const relics: RelicDef[] = [
  { id: 'blue_headband', name: '藍頭巾', pool: '起始', text: '每場戰鬥第一回合多抽 1 張牌。', art: 'codex/relic_headband', price: 130, hooks: { firstTurnDraw: 1 } },
  /*
   * 菲菲的起始秘寶。**現在是「每場戰鬥開始時給全體魔物 3 層中毒」，之後不再長**（2026-09-16 使用者裁定）。
   *
   * 沿革：原本是「每場戰鬥開始時 5 點蜷縮」。2026-09-13 使用者改成每回合開頭替全體魔物各灑 1 層毒，
   * 理由是「增加她的特性」——開場 5 點蜷縮任何角色拿到都一樣好用，跟她是誰無關；灑毒才是她。
   * 每回合灑毒在長戰鬥裡越滾越大（N 層中毒總傷害是 N(N+1)/2），關主戰能疊到十層，當時量到她到第二關 83%；
   * 先試過「全體改成只給最前面那一隻」只降到 80%（關主都只有一隻怪），
   * 09-16 才改成開場一次三層：短的小怪戰幾乎沒差，砍的是十回合的關主戰（量到第二關 79%、通關 2.0%，`d373249e`）。
   * **改完要跑 `smartRun` 對照**（見專案記憶）。註解 09-23 才跟上（health H-6 第 2 條）。
   */
  { id: 'backstep', name: '毒針袋', pool: '起始', text: '每場戰鬥開始時給全體魔物 3 層中毒。', art: 'codex/relic_backstep', price: 130,
    hooks: { combatStart: [{ kind: 'status', name: '中毒', amount: 3, target: 'all' }] } },
  /*
   * 噹噹的起始秘寶（2026-09-17）。對照：球球＝藍頭巾（第一回合多抽一張）、菲菲＝毒針袋（開場全體 3 層毒）。
   *
   * 為什麼是「蜷縮 4 ＋ 反彈 2」而不是純蜷縮：他的蜷縮**會被自己的牌吃掉**，
   * 純給蜷縮等於只是多一發卸力掌。那 2 點反彈是**不會被消耗**的那一半，
   * 開場就讓兩條路（卸力打人／硬扛回敬）都動得起來，第一回合不會只能乾架著。
   */
  { id: 'copper_bracer', name: '銅護臂', pool: '起始', text: '每場戰鬥開始時獲得 4 點蜷縮與 2 點反彈。', art: 'codex/relic_copper_bracer', price: 130,
    hooks: { combatStart: [{ kind: 'block', amount: 4 }, { kind: 'status', name: '反彈', amount: 2, target: 'self' }] } },
  /*
   * 封封的起始秘寶。2026-09-22 平衡調整（使用者裁定「B」）：開場 2 點照留，再加「每回合開始 1 點蓄氣」，
   * 同時吐納改回 1 費。理由是形狀：吐納 0 費是前段的好處（第一關比球球輕鬆很多、第二關關主卻全在 30% 以下），
   * 每回合給氣對長戰（關主）比較有利。第一回合兩條都會發（開場 2＋回合開始 1＝3 點）。
   * 蓄氣已滿 12 時每回合那一次不閃、不寫「發動」（見 `combat.ts` 的 `startPlayerTurn`）。
   */
  { id: 'old_sword_tassel', name: '舊劍穗', pool: '起始', text: '每場戰鬥開始時獲得 2 點蓄氣；每回合開始時再獲得 1 點蓄氣。', art: 'codex/relic_old_sword_tassel', price: 130,
    hooks: { combatStart: [{ kind: 'gainQi', n: 2 }], turnStart: [{ kind: 'gainQi', n: 1 }] } },
  { id: 'onigiri_bag', name: '飯糰袋', pool: '常見', text: '每場戰鬥第一回合多 1 顆飯糰。', art: 'codex/relic_onigiri_bag', price: 160, hooks: { firstTurnEnergy: 1 } },
  { id: 'tuna_can', name: '鮪魚罐頭', pool: '常見', text: '最大生命 +10。', art: 'codex/relic_tuna_can', price: 120, hooks: { maxHp: 10 } },
  { id: 'catgrass', name: '貓草', pool: '常見', text: '在貓窩打盹回復的生命加倍。', art: 'codex/relic_catgrass', price: 100, hooks: { restMultiplier: 2 } },
  { id: 'bell', name: '鈴鐺', pool: '常見', text: '每場戰鬥開始時獲得 1 層隱身。', art: 'codex/relic_bell', price: 160,
    hooks: { combatStart: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'fish_jar', name: '小魚乾罐', pool: '常見', text: '每打贏一場戰鬥多拿 10 條小魚乾。', art: 'codex/relic_fish_jar', price: 100, hooks: { winGold: 10 } },
  { id: 'catnip', name: '貓薄荷', pool: '常見', text: '每場戰鬥開始時回復 3 點生命。', art: 'codex/relic_catnip', price: 130,
    hooks: { combatStart: [{ kind: 'heal', n: 3 }] } },
  { id: 'tail_bell', name: '尾巴鈴', pool: '常見', text: '回合結束時，如果這回合沒打過攻擊牌，獲得 4 點蜷縮。', art: 'codex/relic_tail_bell', price: 120,
    hooks: { turnEndNoAttack: [{ kind: 'block', amount: 4 }] } },
  { id: 'wood_post', name: '木樁', pool: '大魔物', text: '每場戰鬥開始時給全體魔物 1 層翻肚。', art: 'codex/relic_wood_post', price: 200, hooks: { combatStart: [{ kind: 'status', name: '翻肚', amount: 1, target: 'all' }] } },
  { id: 'yarn_ball', name: '毛線球', pool: '大魔物', text: '每回合第一張牌少花 1 顆飯糰（最低 0）。', art: 'codex/relic_yarn_ball', price: 210, hooks: { firstCardDiscount: 1 } },
  { id: 'cat_teaser', name: '逗貓棒', pool: '大魔物', text: '每打出一張攻擊牌，有兩成機會抽 1 張牌。', art: 'codex/relic_cat_teaser', price: 190, hooks: { onAttackPlayed: { chance: 0.2, effects: [{ kind: 'draw', n: 1 }] } } },
  { id: 'scroll', name: '秘笈', pool: '大魔物', text: '每場戰鬥第一張攻擊牌的傷害加倍。', art: 'codex/relic_scroll', price: 190, hooks: { firstAttackDouble: true } },
  { id: 'paper_bag', name: '紙袋', pool: '大魔物', text: '每回合第一次獲得隱身時多 1 層。', art: 'codex/relic_paper_bag', price: 180, hooks: { stealthBonus: 1 } },
  { id: 'bronze_mirror', name: '銅鏡', pool: '大魔物', text: '每場戰鬥開始時獲得 2 點反彈。', art: 'codex/relic_bronze_mirror', price: 170,
    hooks: { combatStart: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }] } },
  // 2026-09-10 拿掉「最大生命 −10」：這件是打倒關主的信物，一局只拿得到一次、也沒得選，
  // 純獎勵就好，不該在剛過關最虛的時候再扣一刀（使用者裁定）
  { id: 'tower_token', name: '塔主令牌', pool: '塔主', text: '每回合多 1 顆飯糰。', art: 'codex/relic_tower_token', price: 220, hooks: { energyPerTurn: 1 } },
  // ===== 2026-08-31 補 20 個。本來只有 15 個，兩三局就看完 =====
  // 原本每種觸發時機只有一個，所以每次拿到的感覺都一樣。
  // 這裡刻意讓同一種時機有多個強度／代價不同的版本，選擇才有意義。

  // --- 常見：開場就有感的小加成 ---
  { id: 'straw_hat', name: '斗笠', pool: '常見', text: '每場戰鬥開始時獲得 4 點蜷縮。', art: 'codex/relic_straw_hat', price: 120, hooks: { combatStart: [{ kind: 'block', amount: 4 }] } },
  // 2026-09-02 使用者：「忍具滿了後續都拿不到？該出個秘寶增加格子」
  { id: 'potion_bag', name: '忍具袋', pool: '常見', text: '忍具可以多帶一支。', art: 'codex/relic_potion_bag', price: 140, hooks: { potionSlots: 1 } },
  { id: 'wrist_guard', name: '護腕', pool: '常見', text: '每場戰鬥開始時獲得 1 點爪力。', art: 'codex/relic_wrist_guard', price: 150, hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } },
  { id: 'soft_pad', name: '軟墊', pool: '常見', text: '每場戰鬥開始時獲得 1 點貓步。', art: 'codex/relic_soft_pad', price: 150, hooks: { combatStart: [{ kind: 'status', name: '貓步', amount: 1, target: 'self' }] } },
  { id: 'dried_squid', name: '魷魚絲', pool: '常見', text: '最大生命 +6。', art: 'codex/relic_dried_squid', price: 90, hooks: { maxHp: 6 } },
  { id: 'fish_bone', name: '魚骨頭', pool: '常見', text: '最大生命 +16。', art: 'codex/relic_fish_bone', price: 160, hooks: { maxHp: 16 } },
  { id: 'small_cushion', name: '小坐墊', pool: '常見', text: '每場戰鬥第一回合多抽 2 張牌。', art: 'codex/relic_small_cushion', price: 160, hooks: { firstTurnDraw: 2 } },
  { id: 'sardine_tin', name: '沙丁魚罐', pool: '常見', text: '你每打倒一隻魔物就回復 2 點生命。', art: 'codex/relic_sardine_tin', price: 110, hooks: { killHeal: 2 } },
  { id: 'worn_scroll', name: '破卷軸', pool: '常見', text: '每場戰鬥第一張牌少花 1 顆飯糰（最低 0）。', art: 'codex/relic_worn_scroll', price: 130, hooks: { firstCardDiscountCombat: 1 } },
  { id: 'lucky_coin', name: '幸運錢幣', pool: '常見', text: '打贏一場多拿 20 條小魚乾。', art: 'codex/relic_lucky_coin', price: 140, hooks: { winGold: 20 } },
  { id: 'warm_blanket', name: '暖毯', pool: '常見', text: '打盹之後，下一場戰鬥開始時獲得 12 點蜷縮。', art: 'codex/relic_warm_blanket', price: 150, hooks: { restNextFightBlock: 12 } },

  // --- 大魔物：打贏精英才拿得到，效果要有存在感 ---
  { id: 'iron_collar', name: '鐵項圈', pool: '大魔物', text: '每場戰鬥開始時獲得 10 點蜷縮。', art: 'codex/relic_iron_collar', price: 190, hooks: { combatStart: [{ kind: 'block', amount: 10 }] } },
  { id: 'claw_sheath', name: '爪鞘', pool: '大魔物', text: '每場戰鬥開始時獲得 2 點爪力。', art: 'codex/relic_claw_sheath', price: 200, hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }] } },
  { id: 'ghost_bell', name: '無聲鈴', pool: '大魔物', text: '每場戰鬥開始時獲得 2 層隱身。', art: 'codex/relic_ghost_bell', price: 200, hooks: { combatStart: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }] } },
  { id: 'counting_beads', name: '算盤珠', pool: '大魔物', text: '每回合打出第 3 張牌時抽 1 張牌。', art: 'codex/relic_counting_beads', price: 190, hooks: { drawOnNthCard: { n: 3, draw: 1 } } },
  { id: 'still_water', name: '止水碗', pool: '大魔物', text: '回合結束時如果這回合沒打過攻擊牌，獲得 8 點蜷縮。', art: 'codex/relic_still_water', price: 180, hooks: { turnEndNoAttack: [{ kind: 'block', amount: 8 }] } },
  { id: 'nine_tails', name: '九尾墜', pool: '大魔物', text: '每回合多 1 顆飯糰。', art: 'codex/relic_nine_tails', price: 240, hooks: { energyPerTurn: 1 } },

  // --- 塔主：打贏塔主才有，直接改變玩法 ---
  { id: 'shadow_cloak', name: '影披風', pool: '塔主', text: '每次獲得隱身時多 1 層。', art: 'codex/relic_shadow_cloak', price: 220, hooks: { stealthBonusEvery: 1 } },
  { id: 'last_breath', name: '最後一口氣', pool: '塔主', text: '每場戰鬥第一次會被打倒時，留下 1 點生命。', art: 'codex/relic_last_breath', price: 230, hooks: { preventLethal: true } },
  { id: 'master_belt', name: '掌門腰帶', pool: '塔主', text: '最大生命 +25。', art: 'codex/relic_master_belt', price: 230, hooks: { maxHp: 25 } },
  { id: 'golden_bowl', name: '金飯碗', pool: '塔主', text: '每場戰鬥第一回合多 2 顆飯糰。', art: 'codex/relic_golden_bowl', price: 240, hooks: { firstTurnEnergy: 2 } },
  // ===== 2026-09-02 擴充到 60 件（使用者：「36 件不夠，補到 60，效果你設計」）。圖還沒生的先用名字顯示 =====
  // --- 常見（+10）---
  { id: 'feather_toy', name: '羽毛玩具', pool: '常見', text: '回合結束時，如果這回合沒打過攻擊牌，下回合多抽 1 張牌。', art: 'codex/relic_feather_toy', price: 130, hooks: { turnEndNoAttack: [{ kind: 'drawNextTurn', n: 1 }] } },
  { id: 'old_towel', name: '舊毛巾', pool: '常見', text: '每次使用忍具後回復 4 點生命。', art: 'codex/relic_old_towel', price: 120, hooks: { onPotionUse: [{ kind: 'heal', n: 4 }] } },
  { id: 'coin_jar', name: '零錢罐', pool: '常見', text: '罐頭鋪的商品打八折（放生與重整不算）。', art: 'codex/relic_coin_jar', price: 120, hooks: { shopDiscount: 0.8 } },   // 九折→八折、當下生效（使用者 2026-09-04）
  { id: 'scratch_board', name: '貓抓板', pool: '常見', text: '每回合第一張攻擊牌打出後獲得 3 點蜷縮。', art: 'codex/relic_scratch_board', price: 140, hooks: { onAttackPlayed: { firstEachTurn: true, effects: [{ kind: 'block', amount: 3 }] } } },
  { id: 'wooden_fish', name: '木魚', pool: '常見', text: '回合結束時，如果這回合沒打過攻擊牌，回復 2 點生命。', art: 'codex/relic_wooden_fish', price: 130, hooks: { turnEndNoAttack: [{ kind: 'heal', n: 2 }] } },
  { id: 'warm_stone', name: '暖爐石', pool: '常見', text: '每打贏一場戰鬥回復 4 點生命。', art: 'codex/relic_warm_stone', price: 140, hooks: { combatEndHeal: 4 } },
  { id: 'yarn_gloves', name: '毛線手套', pool: '常見', text: '被魔物打掉血時獲得 1 點爪力（每回合最多一次）。', art: 'codex/relic_yarn_gloves', price: 150, hooks: { onHit: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } },
  { id: 'catgrass_seed', name: '貓草種子', pool: '常見', text: '在貓窩打盹額外回復 8 點生命。', art: 'codex/relic_catgrass_seed', price: 110, hooks: { restFlat: 8 } },
  { id: 'crane_bookmark', name: '紙鶴書籤', pool: '常見', text: '每場戰鬥第一回合多抽 1 張牌、多 1 顆飯糰。', art: 'codex/relic_crane_bookmark', price: 160, hooks: { firstTurnDraw: 1, firstTurnEnergy: 1 } },
  { id: 'bamboo_copter', name: '竹蜻蜓', pool: '常見', text: '每回合打出第 4 張牌時多 1 顆飯糰。', art: 'codex/relic_bamboo_copter', price: 150, hooks: { energyOnNthCard: { n: 4, energy: 1 } } },
  // --- 大魔物（+9）---
  { id: 'ink_jade', name: '墨玉', pool: '大魔物', text: '每場戰鬥開始時給全體魔物 2 層懶洋洋。', art: 'codex/relic_ink_jade', price: 200, hooks: { combatStart: [{ kind: 'status', name: '懶洋洋', amount: 2, target: 'all' }] } },
  { id: 'sand_bag', name: '鐵砂袋', pool: '大魔物', text: '每回合開始時獲得 3 點蜷縮。', art: 'codex/relic_sand_bag', price: 190, hooks: { turnStart: [{ kind: 'block', amount: 3 }] } },
  { id: 'spirit_bell', name: '靈貓鈴', pool: '大魔物', text: '每回合開始時多抽 1 張牌。', art: 'codex/relic_spirit_bell', price: 220, hooks: { turnStart: [{ kind: 'draw', n: 1 }] } },
  { id: 'obsidian_claw', name: '黑曜爪', pool: '大魔物', text: '你每打倒一隻魔物就獲得 1 點爪力。', art: 'codex/relic_obsidian_claw', price: 210, hooks: { killStrength: 1 } },
  { id: 'guard_charm', name: '守護符', pool: '大魔物', text: '回合結束時最多保留 8 點蜷縮到下一回合。', art: 'codex/relic_guard_charm', price: 200, hooks: { blockKeep: 8 } },
  { id: 'turtle_shell', name: '龜甲', pool: '大魔物', text: '每場戰鬥開始時獲得 6 點蜷縮與 3 點反彈。', art: 'codex/relic_turtle_shell', price: 200, hooks: { combatStart: [{ kind: 'block', amount: 6 }, { kind: 'status', name: '反彈', amount: 3, target: 'self' }] } },
  /*
   * 2026-09-17 使用者改：2 層隱身 → 1 點貓步。
   *
   * 隱身是球球那條線的東西，噹噹整套沒有隱身，這件秘寶開到等於廢掉；
   * 貓步（之後獲得蜷縮都多幾點）三隻都用得到，而且對他特別有意義——
   * 他的蜷縮既是防禦也是出招的本錢，多一點就是兩邊都多一點。
   * 觸發條件不變（這回合沒打過攻擊牌），所以「忍著不打」的節奏還在。
   */
  { id: 'wind_chime', name: '風鈴', pool: '大魔物', text: '回合結束時，如果這回合沒打過攻擊牌，獲得 1 點貓步。', art: 'codex/relic_wind_chime', price: 200, hooks: { turnEndNoAttack: [{ kind: 'status', name: '貓步', amount: 1, target: 'self' }] } },
  { id: 'catnip_pipe', name: '貓薄荷煙斗', pool: '大魔物', text: '每次使用忍具後抽 2 張牌。', art: 'codex/relic_catnip_pipe', price: 190, hooks: { onPotionUse: [{ kind: 'draw', n: 2 }] } },
  { id: 'coin_sword', name: '銅錢劍', pool: '大魔物', text: '你每打倒一隻魔物就多拿 8 條小魚乾。', art: 'codex/relic_coin_sword', price: 180, hooks: { killFish: 8 } },
  // --- 塔主（+5）---
  { id: 'tower_moon', name: '塔頂之月', pool: '塔主', text: '每場戰鬥開始時獲得 3 點爪力與 3 點貓步。', art: 'codex/relic_tower_moon', price: 240, hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }, { kind: 'status', name: '貓步', amount: 3, target: 'self' }] } },
  { id: 'daruma', name: '不倒翁', pool: '塔主', text: '最大生命 +20；每打贏一場戰鬥回復 6 點生命。', art: 'codex/relic_daruma', price: 240, hooks: { maxHp: 20, combatEndHeal: 6 } },
  { id: 'nine_bell', name: '九命鈴', pool: '塔主', text: '忍具可以多帶兩支；每次使用忍具後回復 3 點生命。', art: 'codex/relic_nine_bell', price: 230, hooks: { potionSlots: 2, onPotionUse: [{ kind: 'heal', n: 3 }] } },
  { id: 'gold_claws', name: '金爪套', pool: '塔主', text: '每回合打出第 3 張牌時抽 1 張牌、多 1 顆飯糰。', art: 'codex/relic_gold_claws', price: 240, hooks: { drawOnNthCard: { n: 3, draw: 1 }, energyOnNthCard: { n: 3, energy: 1 } } },
  { id: 'master_seal', name: '掌門印', pool: '塔主', text: '戰鬥獎勵的牌多一張可選。', art: 'codex/relic_master_seal', price: 230, hooks: { rewardChoices: 1 } },
  /*
   * ---- 2026-09-15 塔主池加到 19 件（含令牌）----
   * 使用者實測：「打完王的秘寶很容易看到掌門印、金爪套、塔頂之月」。查過抽法是公平的（均勻亂數、每局種子不同），
   * 問題在池子只有 9 件、一局過關要抽兩次三選一，兩次就看過池子的三分之二。
   * 這 9 件全部用**既有掛鉤**（不動引擎），強度對齊塔主級（起手就有感、價 220～240）；圖示鍵 `codex/relic_<id>`，圖另生。
   */
  // 2026-09-16 使用者：「開場給 14 有點弱」→ 改成每回合 8（鐵砂袋每回合 3 的塔主版）
  { id: 'master_hat', name: '師父的斗笠', pool: '塔主', text: '每回合開始時獲得 8 點蜷縮。', art: 'codex/relic_master_hat', price: 240,
    hooks: { turnStart: [{ kind: 'block', amount: 8 }] } },
  { id: 'iron_palm_wraps', name: '暖身護腕', pool: '塔主', text: '每回合第一張攻擊牌打出後獲得 1 點爪力（那一張吃不到）。', art: 'codex/relic_iron_palm_wraps', price: 240,
    hooks: { onAttackPlayed: { effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }], firstEachTurn: true } } },
  { id: 'master_teacup', name: '塔主的茶碗', pool: '塔主', text: '每回合開始時回復 2 點生命。', art: 'codex/relic_master_teacup', price: 240,
    hooks: { turnStart: [{ kind: 'heal', n: 2 }] } },
  { id: 'jade_pendant', name: '傳功玉佩', pool: '塔主', text: '每場戰鬥第一回合多抽 2 張牌、多 1 顆飯糰。', art: 'codex/relic_jade_pendant', price: 240,
    hooks: { firstTurnDraw: 2, firstTurnEnergy: 1 } },
  { id: 'master_gourd', name: '塔主的酒葫蘆', pool: '塔主', text: '每次使用忍具後獲得 2 點爪力與 6 點蜷縮。', art: 'codex/relic_master_gourd', price: 230,
    hooks: { onPotionUse: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }, { kind: 'block', amount: 6 }] } },
  { id: 'lucky_cat', name: '招財貓', pool: '塔主', text: '每打贏一場戰鬥多拿 30 條小魚乾。', art: 'codex/relic_lucky_cat', price: 220,
    hooks: { winGold: 30 } },
  { id: 'tiger_claws', name: '虎爪', pool: '塔主', text: '你每打倒一隻魔物就獲得 1 點爪力、回復 3 點生命。', art: 'codex/relic_tiger_claws', price: 240,
    hooks: { killStrength: 1, killHeal: 3 } },
  { id: 'iron_shirt', name: '軟甲背心', pool: '塔主', text: '回合結束時最多保留 10 點蜷縮（可跟同類秘寶相加）。', art: 'codex/relic_iron_shirt', price: 230,
    hooks: { blockKeep: 10 } },
  // 2026-09-17 使用者裁定：蜷縮那 8 點拿掉，只留爪力。原本「不打就給 8 點蜷縮」等於
  // 鼓勵整回合不出手，跟這個遊戲要的節奏相反；只給爪力的話，你還是得選「這回合忍住」，
  // 但忍的報酬是下一回合打得更痛，不是原地變硬
  { id: 'moon_mirror', name: '望月禪坐', pool: '塔主', text: '回合結束時如果這回合沒打過攻擊牌，獲得 2 點爪力。', art: 'codex/relic_moon_mirror', price: 230,
    hooks: { turnEndNoAttack: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }] } },
  // ===== 代價秘寶（2026-09-04，使用者：「很強但有代價的，玩家會猶豫，選擇才有趣」）。圖示還沒生，先顯示文字牌 =====
  { id: 'blood_dagger', name: '血契短刀', pool: '大魔物', text: '每場戰鬥開始獲得 3 點爪力；拿到時最大生命 −12。', art: 'codex/relic_blood_dagger', price: 210,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }], maxHp: -12 } },
  { id: 'miasma_charm', name: '魔氣護符', pool: '大魔物', text: '每回合多 1 顆飯糰；每場戰鬥開始帶 2 層炸毛。', art: 'codex/relic_miasma_charm', price: 240,
    hooks: { energyPerTurn: 1, combatStart: [{ kind: 'status', name: '炸毛', amount: 2, target: 'self' }] } },
  // 開戰扣 4 點生命拿掉了（使用者 2026-09-11：「不該扣血，只有好處就好，
  // 目前的每回合留下 6 蜷縮也不太過分」）。留蜷縮本來就是慢熱型的加成——
  // 前兩回合幾乎沒感覺，要堆起來才有用；再收一筆開場血當代價，對一件常見池的秘寶太重
  { id: 'iron_sand_vest', name: '續勁護甲', pool: '常見', text: '回合結束時最多保留 6 點蜷縮（可跟同類秘寶相加）。', art: 'codex/relic_iron_sand_vest', price: 140,
    hooks: { blockKeep: 6 } },
  { id: 'glutton_purse', name: '貪吃錢袋', pool: '常見', text: '每打贏一場戰鬥多拿 25 條小魚乾；罐頭鋪的商品貴三成。', art: 'codex/relic_glutton_purse', price: 120,
    hooks: { winGold: 25, shopDiscount: 1.3 } },
  { id: 'black_cat_mask', name: '黑貓面具', pool: '大魔物', text: '每場戰鬥第一回合多 2 顆飯糰；開戰帶 1 層懶洋洋。', art: 'codex/relic_black_cat_mask', price: 230,
    hooks: { firstTurnEnergy: 2, combatStart: [{ kind: 'status', name: '懶洋洋', amount: 1, target: 'self' }] } },

  /*
   * ===== 2026-09-23 內容擴充第一批：18 件（提案 docs/審查報告/2026-09-23/內容擴充提案_秘寶忍具事件.md 第⑤節）=====
   *
   * 為什麼是這 18 件：原本 77 件裡菲菲（毒）、封封（蓄氣）的放大器一件都沒有，塔主池沒有代價型、
   * 引擎現成的一整批「給同伴」效果秘寶一件都沒用。這一批四隻各補三件（常見、大魔物、塔主各一）、
   * 塔主池加四件「多一點好處＋一個代價」（使用者裁定要加）、連線互助兩件。**全部沿用現成的效果與掛鉤**。
   *
   * 鎖角色（`notFor`）的四件：蓄氣三件只給封封、千斤墜腰帶只給噹噹（卸蜷縮出招的牌只有他有）。
   * 其餘「偏誰」只是比較好用，誰都抽得到——跟紙袋、影披風當初解鎖是同一個判準（`RelicDef.notFor`）。
   *
   * 旗標類效果（下毒、屍爆、以傷還傷、順勢、卸力減半）從秘寶掛上去不會在狀態列多一個牌子（那個牌子只給牌用），
   * 所以牌面文字要把效果講完整，不要只寫牌名。
   */
  // --- 菲菲（毒）---
  { id: 'snake_fang', name: '蛇牙墜', pool: '常見', text: '每打出一張攻擊牌，再給那個目標 1 層中毒。', art: 'codex/relic_snake_fang', price: 150,
    hooks: { combatStart: [{ kind: 'poisonOnAttack', n: 1 }] } },
  /*
   * 屍爆的全額版（打倒的那一位身上有這件才算，連線時各看各的）。提案是平分版，量尺四隻都 ≈0；改全額也只 +0.4，
   * 主控 2026-09-23 要求調到大魔物池中位數附近：開場再冒一團毒霧（全體 2 層中毒），先有毒、打倒時才散得出去。
   */
  { id: 'miasma_sachet', name: '毒霧香囊', pool: '大魔物', text: '每場戰鬥開始時給全體魔物 2 層中毒；你打倒中毒的魔物時，牠剩下的中毒，其他每一隻魔物都拿一份。', art: 'codex/relic_miasma_sachet', price: 190,
    hooks: { combatStart: [{ kind: 'status', name: '中毒', amount: 2, target: 'all' }, { kind: 'poisonBurst', full: true }] } },
  { id: 'herb_cauldron', name: '藥王鼎', pool: '塔主', text: '每場戰鬥開始時給全體魔物 5 層中毒。', art: 'codex/relic_herb_cauldron', price: 240,
    hooks: { combatStart: [{ kind: 'status', name: '中毒', amount: 5, target: 'all' }] } },
  // --- 噹噹（反彈、蜷縮當彈藥）---
  { id: 'anvil', name: '鐵砧', pool: '常見', text: '每場戰鬥開始時獲得 2 點反彈；反彈回敬時多打 1 點。', art: 'codex/relic_anvil', price: 140,
    hooks: { combatStart: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }, { kind: 'thornsBonus', n: 1 }] } },
  { id: 'knee_guard', name: '順勢護膝', pool: '大魔物', text: '每次反彈回敬，獲得 3 點蜷縮。', art: 'codex/relic_knee_guard', price: 180,
    hooks: { combatStart: [{ kind: 'blockOnThorns', n: 3 }] } },
  /*
   * 提案叫「千斤墜腰帶」，撞到噹噹的牌「千斤墜」（挨打長蜷縮）而且效果不同，主控 2026-09-23 裁定改名；代號不動（存檔相容）。
   * 圖是腰帶上吊一顆大鐵墜，改叫秤砣腰帶。原本只有「卸力只卸一半」，量尺 +0.04 層（塔主三選一裡等於廢選項），
   * 主控要求調到塔主池中位數附近：加上「回合結束最多留 8 點蜷縮」——同一條路（蜷縮是彈藥：卸一半、剩下的留著下回合再卸）。
   */
  { id: 'iron_weight_belt', name: '秤砣腰帶', pool: '塔主', notFor: ['ninja', 'feifei', 'fengfeng'], text: '卸掉蜷縮的牌只卸一半（不滿一點算一點），打出去的力道不變；回合結束時最多保留 8 點蜷縮（可跟同類秘寶相加）。', art: 'codex/relic_iron_weight_belt', price: 230,
    hooks: { combatStart: [{ kind: 'halfSpendBlock' }], blockKeep: 8 } },
  // --- 封封（蓄氣，別人身上沒有蓄氣，三件都只給他）---
  { id: 'whet_stone', name: '磨劍石', pool: '常見', notFor: ['ninja', 'feifei', 'dangdang'], text: '每場戰鬥開始時獲得 3 點蓄氣。', art: 'codex/relic_whet_stone', price: 130,
    hooks: { combatStart: [{ kind: 'gainQi', n: 3 }] } },
  { id: 'tassel_knot', name: '劍穗結', pool: '大魔物', notFor: ['ninja', 'feifei', 'dangdang'], text: '每回合第一張攻擊牌打出後獲得 2 點蓄氣。', art: 'codex/relic_tassel_knot', price: 190,
    hooks: { onAttackPlayed: { firstEachTurn: true, effects: [{ kind: 'gainQi', n: 2 }] } } },
  { id: 'qi_gourd', name: '養氣葫蘆', pool: '塔主', notFor: ['ninja', 'feifei', 'dangdang'], text: '每回合開始時獲得 2 點蓄氣。', art: 'codex/relic_qi_gourd', price: 240,
    hooks: { turnStart: [{ kind: 'gainQi', n: 2 }] } },
  // --- 球球（隱身、潛水）---
  // 開場拿到的潛水**第二回合開始**才變隱身（`combat.ts` 的 `startSeatTurn`）：不然開戰那一拍就換掉，跟無聲鈴一模一樣
  { id: 'bamboo_tube', name: '竹筒', pool: '常見', text: '每場戰鬥開始時獲得 1 層潛水（第二回合開始變成隱身）。', art: 'codex/relic_bamboo_tube', price: 150,
    hooks: { combatStart: [{ kind: 'status', name: '潛水', amount: 1, target: 'self' }] } },
  // 跟毛線手套同一個時機（每回合最多一次），挨打之後這一輪剩下的攻擊就閃得掉一下
  { id: 'startle_bell', name: '驚弓鈴', pool: '大魔物', text: '被魔物打掉血時獲得 1 層隱身（每回合最多一次）。', art: 'codex/relic_startle_bell', price: 200,
    hooks: { onHit: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'shadow_band', name: '影忍頭帶', pool: '塔主', text: '每回合開始時，身上沒有隱身的話獲得 1 層潛水（下回合開始變成隱身）。', art: 'codex/relic_shadow_band', price: 240,
    hooks: { turnStart: [{ kind: 'ifSelfStatus', name: '隱身', then: [], otherwise: [{ kind: 'status', name: '潛水', amount: 1, target: 'self' }] }] } },
  // --- 塔主池的代價型（使用者 2026-09-23 裁定要加）：過關三選一要有會猶豫的選項 ---
  // 打盹回血整個歸零（貓草種子那幾點也算在內，見 `run.ts` 的 `napHeal`）；44F 師父門前那一格本來就回滿，照舊；扶同伴起來不受影響
  { id: 'sleepless_censer', name: '不眠香爐', pool: '塔主', text: '每回合多 1 顆飯糰；在貓窩打盹不再回血（44F 最後那個貓窩照樣回滿）。', art: 'codex/relic_sleepless_censer', price: 240,
    hooks: { energyPerTurn: 1, restMultiplier: 0 } },
  { id: 'greedy_pouch', name: '銅臭錢袋', pool: '塔主', text: '每回合多 1 顆飯糰；罐頭鋪的商品貴五成（放生與重整不算）。', art: 'codex/relic_greedy_pouch', price: 220,
    hooks: { energyPerTurn: 1, shopDiscount: 1.5 } },
  // 少一張可選：跟掌門印（+1）、中了魔氣的遭遇（+1）相加，所以兩件一起帶等於沒變
  { id: 'renounce_beads', name: '斷念珠', pool: '塔主', text: '每回合開始時多抽 1 張牌；戰鬥獎勵的牌少一張可選。', art: 'codex/relic_renounce_beads', price: 230,
    hooks: { turnStart: [{ kind: 'draw', n: 1 }], rewardChoices: -1 } },
  { id: 'mad_sheath', name: '狂刀鞘', pool: '塔主', text: '每場戰鬥開始時獲得 4 點爪力與 2 層翻肚。', art: 'codex/relic_mad_sheath', price: 230,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 4, target: 'self' }, { kind: 'status', name: '翻肚', amount: 2, target: 'self' }] } },
  // --- 連線互助（引擎現成的「給同伴」效果；一個人玩時退化成給自己，見 `Effect` 的 `blockAlly`／`statusAlly`）---
  // 開場那一拍同伴還沒進場，給同伴的那份等人到齊才發（`CombatState.pendingAllyRelics`）
  { id: 'shared_bento', name: '分食便當', pool: '常見', text: '每回合開始時，同伴獲得 2 點蜷縮（一個人時給自己）。', art: 'codex/relic_shared_bento', price: 120,
    hooks: { turnStart: [{ kind: 'blockAlly', amount: 2 }] } },
  { id: 'bond_knot', name: '同心結', pool: '大魔物', text: '每場戰鬥開始時，你和同伴各獲得 1 點爪力（一個人時自己拿 2 點）。', art: 'codex/relic_bond_knot', price: 190,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }, { kind: 'statusAlly', name: '爪力', amount: 1 }] } },
];

export const relicById: Record<string, RelicDef> = Object.fromEntries(relics.map((r) => [r.id, r]));
