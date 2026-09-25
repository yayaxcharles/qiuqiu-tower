import type { RelicDef, RelicSet } from '../engine/types';

export const relics: RelicDef[] = [
  /*
   * 球球的起始秘寶。2026-09-23 平衡（bal）：原本只有「第一回合多抽 1 張」，量尺拿掉它球球只少 −0.4 層（雜訊內），
   * 另外三隻自己的起始秘寶值 +4.1～4.6 層。先試過加開場 1 點爪力（+2.4 層），平均樓層跟菲菲並列、通關率四隻最高（8.9%，菲菲 7.2%）。
   * 主控裁定：通關率不高於另外三隻最高那隻、平均樓層不超過菲菲。八批 4800 局量過十幾種寫法，
   * 只有「第一回合多抽 2 張」守得住兩條（通關 7.1%、23.6F，比原本多 0.4 層）：球球的通關率本來就高，
   * 起始秘寶每多值一層，通關率就多將近一個百分點。效果跟常見池的小坐墊一樣，列給主控（scratchpad bal 報告）。
   */
  { id: 'blue_headband', name: '藍頭巾', pool: '起始', text: '每場戰鬥第一回合多抽 2 張牌。', art: 'codex/relic_headband', price: 130, hooks: { firstTurnDraw: 2 } },
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
   * 噹噹的起始秘寶（2026-09-17）。對照：球球＝藍頭巾（第一回合多抽一張；09-23 起兩張）、菲菲＝毒針袋（開場全體 3 層毒）。
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
  /*
   * 2026-09-23 平衡（bal）：10 → 15 條。量尺 +0.4 層（改完 +0.8），但小魚乾量尺量不準（機器人逛店規則簡單，錢花不滿）；
   * 心算：機器人平均一局打贏約 11 場（通關的局約 22 場），15 條＝多 165 條（通關約 330 條），約一件常見秘寶或兩張牌的錢。
   * 幸運錢幣是 20 條，這件留在它下面一級（價錢也便宜 40 條）。
   */
  { id: 'fish_jar', name: '小魚乾罐', pool: '常見', text: '每打贏一場戰鬥多拿 15 條小魚乾。', art: 'codex/relic_fish_jar', price: 100, hooks: { winGold: 15 } },
  { id: 'catnip', name: '貓薄荷', pool: '常見', text: '每場戰鬥開始時回復 3 點生命。', art: 'codex/relic_catnip', price: 130,
    hooks: { combatStart: [{ kind: 'heal', n: 3 }] } },
  { id: 'tail_bell', name: '尾巴鈴', pool: '常見', text: '回合結束時，如果這回合沒打過攻擊牌，獲得 4 點蜷縮。', art: 'codex/relic_tail_bell', price: 120,
    hooks: { turnEndNoAttack: [{ kind: 'block', amount: 4 }] } },
  { id: 'wood_post', name: '木樁', pool: '大魔物', text: '每場戰鬥開始時給全體魔物 1 層翻肚。', art: 'codex/relic_wood_post', price: 200, hooks: { combatStart: [{ kind: 'status', name: '翻肚', amount: 1, target: 'all' }] } },
  /*
   * 2026-09-23 平衡（bal）：毛線球、九尾墜等於「每回合多 1 顆飯糰」、量到多爬 9.3～9.4 層，比塔主池一半以上還強，
   * 大魔物獎勵抽到它跟抽到別件差太多。只收一點：第一回合少 1 顆（等於第二回合起才賺），兩件都量到 +7.1～7.2 層，仍是大魔物池前段。
   */
  { id: 'yarn_ball', name: '毛線球', pool: '大魔物', text: '每回合第一張牌少花 1 顆飯糰（最低 0）；每場戰鬥第一回合少 1 顆飯糰。', art: 'codex/relic_yarn_ball', price: 210,
    hooks: { firstCardDiscount: 1, firstTurnEnergy: -1 } },
  // 2026-09-23 平衡（bal）：原本兩成機會抽 1 張，量尺 +0.3 層（多抽的牌多半打不出去，飯糰才是瓶頸；機率拉到五成也只 +1.1）；改成一成半機會抽牌＋飯糰，+2.5 層＝大魔物池中下
  { id: 'cat_teaser', name: '逗貓棒', pool: '大魔物', text: '每打出一張攻擊牌，有一成半機會抽 1 張牌、多 1 顆飯糰。', art: 'codex/relic_cat_teaser', price: 190,
    hooks: { onAttackPlayed: { chance: 0.15, effects: [{ kind: 'draw', n: 1 }, { kind: 'energy', n: 1 }] } } },
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
  /*
   * 2026-09-23 平衡（bal）：只多一格量尺 ≈0（機器人只在身上少於兩支時才買忍具，多的格子多半空著；多兩格也只 +0.3）。
   * 加「用完忍具得 6 點蜷縮」：量到 +1.5 層＝常見池下四分位到中位之間；忍具類量尺偏低（真人會留、會挑時機喝），心算落在中下。
   */
  { id: 'potion_bag', name: '忍具袋', pool: '常見', text: '忍具可以多帶一支；每次使用忍具後獲得 6 點蜷縮。', art: 'codex/relic_potion_bag', price: 140,
    hooks: { potionSlots: 1, onPotionUse: [{ kind: 'block', amount: 6 }] } },
  { id: 'wrist_guard', name: '護腕', pool: '常見', text: '每場戰鬥開始時獲得 1 點爪力。', art: 'codex/relic_wrist_guard', price: 150, hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } },
  { id: 'soft_pad', name: '軟墊', pool: '常見', text: '每場戰鬥開始時獲得 1 點貓步。', art: 'codex/relic_soft_pad', price: 150, hooks: { combatStart: [{ kind: 'status', name: '貓步', amount: 1, target: 'self' }] } },
  { id: 'dried_squid', name: '魷魚絲', pool: '常見', text: '最大生命 +6。', art: 'codex/relic_dried_squid', price: 90, hooks: { maxHp: 6 } },
  { id: 'fish_bone', name: '魚骨頭', pool: '常見', text: '最大生命 +16。', art: 'codex/relic_fish_bone', price: 160, hooks: { maxHp: 16 } },
  { id: 'small_cushion', name: '小坐墊', pool: '常見', text: '每場戰鬥第一回合多抽 2 張牌。', art: 'codex/relic_small_cushion', price: 160, hooks: { firstTurnDraw: 2 } },
  { id: 'sardine_tin', name: '沙丁魚罐', pool: '常見', text: '你每打倒一隻魔物就回復 2 點生命。', art: 'codex/relic_sardine_tin', price: 110, hooks: { killHeal: 2 } },
  { id: 'worn_scroll', name: '破卷軸', pool: '常見', text: '每場戰鬥第一張牌少花 1 顆飯糰（最低 0）。', art: 'codex/relic_worn_scroll', price: 130, hooks: { firstCardDiscountCombat: 1 } },
  { id: 'lucky_coin', name: '幸運錢幣', pool: '常見', text: '打贏一場多拿 20 條小魚乾。', art: 'codex/relic_lucky_coin', price: 140, hooks: { winGold: 20 } },
  /*
   * 2026-09-23 平衡（bal）：量尺 +0.9 層（一局只打盹兩三次，每場約 0.1 次發動）；蜷縮加到 20、25 也只 +1.1～1.2。
   * 改成打盹時多回 4 點＋下一場 20 點蜷縮：+1.7 層＝常見池中下，還是「打盹的秘寶」
   */
  { id: 'warm_blanket', name: '暖毯', pool: '常見', text: '在貓窩打盹額外回復 4 點生命；打盹之後，下一場戰鬥開始時獲得 20 點蜷縮。', art: 'codex/relic_warm_blanket', price: 150,
    hooks: { restNextFightBlock: 20, restFlat: 4 } },

  // --- 大魔物：打贏精英才拿得到，效果要有存在感 ---
  { id: 'iron_collar', name: '鐵項圈', pool: '大魔物', text: '每場戰鬥開始時獲得 10 點蜷縮。', art: 'codex/relic_iron_collar', price: 190, hooks: { combatStart: [{ kind: 'block', amount: 10 }] } },
  { id: 'claw_sheath', name: '爪鞘', pool: '大魔物', text: '每場戰鬥開始時獲得 2 點爪力。', art: 'codex/relic_claw_sheath', price: 200, hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }] } },
  // 2026-09-23 平衡（bal）：2 層隱身量到 +9.2 層（大魔物池上四分位 4.8）；第二層換成 1 點貓步，+7.4 層，仍是池子前段
  { id: 'ghost_bell', name: '無聲鈴', pool: '大魔物', text: '每場戰鬥開始時獲得 1 層隱身與 1 點貓步。', art: 'codex/relic_ghost_bell', price: 200,
    hooks: { combatStart: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'status', name: '貓步', amount: 1, target: 'self' }] } },
  // 2026-09-23 平衡（bal）：第 3 張抽 1 張量尺 ≈0（打到第三張時飯糰多半用完，抽到的打不出去）；改成第 2 張就抽 3 張，+2.2 層＝大魔物池下四分位附近
  { id: 'counting_beads', name: '算盤珠', pool: '大魔物', text: '每回合打出第 2 張牌時抽 3 張牌。', art: 'codex/relic_counting_beads', price: 190, hooks: { drawOnNthCard: { n: 2, draw: 3 } } },
  { id: 'still_water', name: '止水碗', pool: '大魔物', text: '回合結束時如果這回合沒打過攻擊牌，獲得 8 點蜷縮。', art: 'codex/relic_still_water', price: 180, hooks: { turnEndNoAttack: [{ kind: 'block', amount: 8 }] } },
  // 2026-09-23 平衡（bal）：跟塔主令牌一樣「每回合多 1 顆」、量到 +9.4 層；只收一點＝第一回合不加（上限 +1、第一回合 −1），+7.1 層
  { id: 'nine_tails', name: '九尾墜', pool: '大魔物', text: '第二回合起，每回合多 1 顆飯糰。', art: 'codex/relic_nine_tails', price: 240, hooks: { energyPerTurn: 1, firstTurnEnergy: -1 } },

  // --- 塔主：打贏塔主才有，直接改變玩法 ---
  { id: 'shadow_cloak', name: '影披風', pool: '塔主', text: '每次獲得隱身時多 1 層。', art: 'codex/relic_shadow_cloak', price: 220, hooks: { stealthBonusEvery: 1 } },
  { id: 'last_breath', name: '最後一口氣', pool: '塔主', text: '每場戰鬥第一次會被打倒時，留下 1 點生命。', art: 'codex/relic_last_breath', price: 230, hooks: { preventLethal: true } },
  { id: 'master_belt', name: '掌門腰帶', pool: '塔主', text: '最大生命 +25。', art: 'codex/relic_master_belt', price: 230, hooks: { maxHp: 25 } },
  { id: 'golden_bowl', name: '金飯碗', pool: '塔主', text: '每場戰鬥第一回合多 2 顆飯糰。', art: 'codex/relic_golden_bowl', price: 240, hooks: { firstTurnEnergy: 2 } },
  // ===== 2026-09-02 擴充到 60 件（使用者：「36 件不夠，補到 60，效果你設計」）。圖還沒生的先用名字顯示 =====
  // --- 常見（+10）---
  // 2026-09-23 平衡（bal）：只多抽 1 張量尺 ≈0（抽 2 張也只 +0.4）；加下回合多 1 顆飯糰（忍一回合、下回合爆發），+1.7 層＝常見池中下。
  // 「沒攻擊才發動」機器人不會刻意配合，真人會，所以不再往上加
  { id: 'feather_toy', name: '羽毛玩具', pool: '常見', text: '回合結束時，如果這回合沒打過攻擊牌，下回合多抽 1 張牌、多 1 顆飯糰。', art: 'codex/relic_feather_toy', price: 130,
    hooks: { turnEndNoAttack: [{ kind: 'drawNextTurn', n: 1 }, { kind: 'energyNextTurn', n: 1 }] } },
  { id: 'old_towel', name: '舊毛巾', pool: '常見', text: '每次使用忍具後回復 4 點生命。', art: 'codex/relic_old_towel', price: 120, hooks: { onPotionUse: [{ kind: 'heal', n: 4 }] } },
  { id: 'coin_jar', name: '零錢罐', pool: '常見', text: '罐頭鋪的商品打八折（放生與重整不算）。', art: 'codex/relic_coin_jar', price: 120, hooks: { shopDiscount: 0.8 } },   // 九折→八折、當下生效（使用者 2026-09-04）
  // 2026-09-23 平衡（bal）：3 → 2 點，+5.3 → +4.1 層（常見池上四分位 2.9，仍是前段）
  { id: 'scratch_board', name: '貓抓板', pool: '常見', text: '每回合第一張攻擊牌打出後獲得 2 點蜷縮。', art: 'codex/relic_scratch_board', price: 140, hooks: { onAttackPlayed: { firstEachTurn: true, effects: [{ kind: 'block', amount: 2 }] } } },
  { id: 'wooden_fish', name: '木魚', pool: '常見', text: '回合結束時，如果這回合沒打過攻擊牌，回復 2 點生命。', art: 'codex/relic_wooden_fish', price: 130, hooks: { turnEndNoAttack: [{ kind: 'heal', n: 2 }] } },
  { id: 'warm_stone', name: '暖爐石', pool: '常見', text: '每打贏一場戰鬥回復 4 點生命。', art: 'codex/relic_warm_stone', price: 140, hooks: { combatEndHeal: 4 } },
  { id: 'yarn_gloves', name: '毛線手套', pool: '常見', text: '被魔物打掉血時獲得 1 點爪力（每回合最多一次）。', art: 'codex/relic_yarn_gloves', price: 150, hooks: { onHit: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } },
  { id: 'catgrass_seed', name: '貓草種子', pool: '常見', text: '在貓窩打盹額外回復 8 點生命。', art: 'codex/relic_catgrass_seed', price: 110, hooks: { restFlat: 8 } },
  { id: 'crane_bookmark', name: '紙鶴書籤', pool: '常見', text: '每場戰鬥第一回合多抽 1 張牌、多 1 顆飯糰。', art: 'codex/relic_crane_bookmark', price: 160, hooks: { firstTurnDraw: 1, firstTurnEnergy: 1 } },
  /*
   * 2026-09-23 平衡（bal）：量尺 +0.5～0.8 層（每場只打到第 4 張約 0.5 次，而且打到第 4 張時手上常常沒牌可用那顆飯糰）。
   * 改成第 4 張時抽 1 張、多 2 顆：+1.5 層＝常見池下四分位之上。改第 3 張會跳到 +3.9 層（金爪套的一半），常見池太強
   */
  { id: 'bamboo_copter', name: '竹蜻蜓', pool: '常見', text: '每回合打出第 4 張牌時抽 1 張牌、多 2 顆飯糰。', art: 'codex/relic_bamboo_copter', price: 150,
    hooks: { drawOnNthCard: { n: 4, draw: 1 }, energyOnNthCard: { n: 4, energy: 2 } } },
  // --- 大魔物（+9）---
  { id: 'ink_jade', name: '墨玉', pool: '大魔物', text: '每場戰鬥開始時給全體魔物 2 層懶洋洋。', art: 'codex/relic_ink_jade', price: 200, hooks: { combatStart: [{ kind: 'status', name: '懶洋洋', amount: 2, target: 'all' }] } },
  // 2026-09-23 平衡（bal）：3 → 2 點，+7.6 → +5.1 層（大魔物池上四分位 4.8），仍是前段
  { id: 'sand_bag', name: '鐵砂袋', pool: '大魔物', text: '每回合開始時獲得 2 點蜷縮。', art: 'codex/relic_sand_bag', price: 190, hooks: { turnStart: [{ kind: 'block', amount: 2 }] } },
  { id: 'spirit_bell', name: '靈貓鈴', pool: '大魔物', text: '每回合開始時多抽 1 張牌。', art: 'codex/relic_spirit_bell', price: 220, hooks: { turnStart: [{ kind: 'draw', n: 1 }] } },
  // 2026-09-23 平衡（bal）：只靠打倒魔物長爪力量尺 +0.8 層（多半是最後一隻倒下才長，這場用不到）；打倒 2、3 點也只 +1.3～1.7。
  // 加開場 1 點爪力：+2.9 層＝大魔物池中位附近
  { id: 'obsidian_claw', name: '黑曜爪', pool: '大魔物', text: '每場戰鬥開始時獲得 1 點爪力；你每打倒一隻魔物再獲得 1 點爪力。', art: 'codex/relic_obsidian_claw', price: 210,
    hooks: { killStrength: 1, combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } },
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
  // 2026-09-23 平衡（bal）：只抽 2 張量尺 +0.4 層；加 2 顆飯糰，+2.6 層＝大魔物池中位（忍具類量尺偏低，真人喝得比機器人有計畫）
  { id: 'catnip_pipe', name: '貓薄荷煙斗', pool: '大魔物', text: '每次使用忍具後抽 2 張牌、多 2 顆飯糰。', art: 'codex/relic_catnip_pipe', price: 190,
    hooks: { onPotionUse: [{ kind: 'draw', n: 2 }, { kind: 'energy', n: 2 }] } },
  /*
   * 2026-09-23 平衡（bal）：8 → 15 條。量尺 +0.5 層（改 15 條後 +1.1；小魚乾量尺量不準，照心算定）。
   * 心算：機器人一局平均打倒約 18 隻、打贏約 11 場（打倒數約是場數的 1.6 倍），8 條只等於每場 13 條，比常見池的幸運錢幣（每場 20）還少。
   * 15 條＝每場約 24 條、一局多 270 條（通關約 525 條），排在幸運錢幣之上、招財貓（塔主，每場 30）之下
   */
  { id: 'coin_sword', name: '銅錢劍', pool: '大魔物', text: '你每打倒一隻魔物就多拿 15 條小魚乾。', art: 'codex/relic_coin_sword', price: 180, hooks: { killFish: 15 } },
  // --- 塔主（+5）---
  // 2026-09-23 平衡（bal）：量到 +12.4 層、塔主池第二強；只收一點：貓步 3 → 2，+10.7 層
  { id: 'tower_moon', name: '塔頂之月', pool: '塔主', text: '每場戰鬥開始時獲得 3 點爪力與 2 點貓步。', art: 'codex/relic_tower_moon', price: 240, hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }, { kind: 'status', name: '貓步', amount: 2, target: 'self' }] } },
  { id: 'daruma', name: '不倒翁', pool: '塔主', text: '最大生命 +20；每打贏一場戰鬥回復 6 點生命。', art: 'codex/relic_daruma', price: 240, hooks: { maxHp: 20, combatEndHeal: 6 } },
  // 2026-09-23 平衡（bal）：回 3 → 6 點，+1.6 → +2.6 層＝塔主池下四分位之上（忍具格、用忍具類量尺偏低，心算再高一點）
  { id: 'nine_bell', name: '九命鈴', pool: '塔主', text: '忍具可以多帶兩支；每次使用忍具後回復 6 點生命。', art: 'codex/relic_nine_bell', price: 230, hooks: { potionSlots: 2, onPotionUse: [{ kind: 'heal', n: 6 }] } },
  { id: 'gold_claws', name: '金爪套', pool: '塔主', text: '每回合打出第 3 張牌時抽 1 張牌、多 1 顆飯糰。', art: 'codex/relic_gold_claws', price: 240, hooks: { drawOnNthCard: { n: 3, draw: 1 }, energyOnNthCard: { n: 3, energy: 1 } } },
  /*
   * 2026-09-23 平衡（bal）：只有「牌多一張可選」量尺 ≈0（+0.1 層；挑牌類量不準，但塔主三選一裡它等於廢選項）。
   * 加開場「全體 1 層懶洋洋＋1 層翻肚」（掌門印一亮，魔物先軟了腳）：+3.4 層＝塔主池下四分位到中位之間
   */
  { id: 'master_seal', name: '掌門印', pool: '塔主', text: '每場戰鬥開始時給全體魔物 1 層懶洋洋與 1 層翻肚；戰鬥獎勵的牌多一張可選。', art: 'codex/relic_master_seal', price: 230,
    hooks: { rewardChoices: 1, combatStart: [{ kind: 'status', name: '懶洋洋', amount: 1, target: 'all' }, { kind: 'status', name: '翻肚', amount: 1, target: 'all' }] } },
  /*
   * ---- 2026-09-15 塔主池加到 19 件（含令牌）----
   * 使用者實測：「打完王的秘寶很容易看到掌門印、金爪套、塔頂之月」。查過抽法是公平的（均勻亂數、每局種子不同），
   * 問題在池子只有 9 件、一局過關要抽兩次三選一，兩次就看過池子的三分之二。
   * 這 9 件全部用**既有掛鉤**（不動引擎），強度對齊塔主級（起手就有感、價 220～240）；圖示鍵 `codex/relic_<id>`，圖另生。
   */
  // 2026-09-16 使用者：「開場給 14 有點弱」→ 改成每回合 8（鐵砂袋每回合 3 的塔主版）
  // 2026-09-23 平衡（bal）：每回合 8 量到 +14.6 層、全遊戲最強（過第二關多 48 個百分點）；只收一點 8 → 6，+12.0 層，仍是塔主池第一
  { id: 'master_hat', name: '師父的斗笠', pool: '塔主', set: '師門', text: '每回合開始時獲得 6 點蜷縮。', art: 'codex/relic_master_hat', price: 240,
    hooks: { turnStart: [{ kind: 'block', amount: 6 }] } },
  { id: 'iron_palm_wraps', name: '暖身護腕', pool: '塔主', text: '每回合第一張攻擊牌打出後獲得 1 點爪力（那一張吃不到）。', art: 'codex/relic_iron_palm_wraps', price: 240,
    hooks: { onAttackPlayed: { effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }], firstEachTurn: true } } },
  { id: 'master_teacup', name: '塔主的茶碗', pool: '塔主', text: '每回合開始時回復 2 點生命。', art: 'codex/relic_master_teacup', price: 240,
    hooks: { turnStart: [{ kind: 'heal', n: 2 }] } },
  { id: 'jade_pendant', name: '傳功玉佩', pool: '塔主', text: '每場戰鬥第一回合多抽 2 張牌、多 1 顆飯糰。', art: 'codex/relic_jade_pendant', price: 240,
    hooks: { firstTurnDraw: 2, firstTurnEnergy: 1 } },
  { id: 'master_gourd', name: '塔主的酒葫蘆', pool: '塔主', set: '師門', text: '每次使用忍具後獲得 2 點爪力與 6 點蜷縮。', art: 'codex/relic_master_gourd', price: 230,
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
  // 2026-09-23 平衡（bal）：代價 2 → 3 層炸毛，+6.7 → +6.3 層（跟九尾墜、毛線球同一群，仍是前段）
  { id: 'miasma_charm', name: '魔氣護符', pool: '大魔物', text: '每回合多 1 顆飯糰；每場戰鬥開始帶 3 層炸毛。', art: 'codex/relic_miasma_charm', price: 240,
    hooks: { energyPerTurn: 1, combatStart: [{ kind: 'status', name: '炸毛', amount: 3, target: 'self' }] } },
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
  // 跟毛線手套同一個時機（每回合最多一次）。
  // 2026-09-23 平衡（bal）：原本挨打當下就給隱身（這一輪剩下的攻擊閃得掉一下），量到 +8.4 層、大魔物池第四強；
  // 改成給潛水（下回合開始才變隱身，竹筒、影忍頭帶同一套），+7.7 層，只收一點
  { id: 'startle_bell', name: '驚弓鈴', pool: '大魔物', text: '被魔物打掉血時獲得 1 層潛水（下回合開始變成隱身；每回合最多一次）。', art: 'codex/relic_startle_bell', price: 200,
    hooks: { onHit: [{ kind: 'status', name: '潛水', amount: 1, target: 'self' }] } },
  // 2026-09-24 深夜使用者：玩封封拿到它「顯示我有隱身卻一直被打」——舊版「沒隱身才給潛水、下回合才變隱身」太難懂
  //（實際是每兩回合一層，而且有一回合身上掛的只是下回合隱身）。問要不要改成每回合都給，使用者：「這樣會太強，改每 3 回合都給 1 層真的隱身就好」
  { id: 'shadow_band', name: '影忍頭帶', pool: '塔主', text: '每 3 回合（第 3、6、9…回合開始時）獲得 1 層隱身。', art: 'codex/relic_shadow_band', price: 240,
    hooks: { everyNTurns: { n: 3, effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }] } } },
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
  // 2026-09-23 平衡（bal）：一個人時每回合 2 點給自己＝鐵砂袋（大魔物）打七折，量到 +5.4 層、常見池第一；2 → 1 點，+3.0 層（仍在上四分位之上）
  { id: 'shared_bento', name: '分食便當', pool: '常見', text: '每回合開始時，同伴獲得 1 點蜷縮（一個人時給自己）。', art: 'codex/relic_shared_bento', price: 120,
    hooks: { turnStart: [{ kind: 'blockAlly', amount: 1 }] } },
  { id: 'bond_knot', name: '同心結', pool: '大魔物', text: '每場戰鬥開始時，你和同伴各獲得 1 點爪力（一個人時自己拿 2 點）。', art: 'codex/relic_bond_knot', price: 190,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }, { kind: 'statusAlly', name: '爪力', amount: 1 }] } },

  /*
   * ===== 2026-09-23 內容擴充第二批：16 件（提案第⑤節第二批；限定秘寶與套組照事件劇本 design2 第八節）=====
   *
   * 圖示照美術 art2 的對照表（`batch2_icon_keys.md`），代號照劇本；三件代號跟圖檔名不同（主控裁定圖示鍵沿用已登記的）：
   * 魔氣殘片 `miasma_shard`→`relic_demon_shard`、師父的舊木劍 `master_wooden_sword`→`relic_master_wood_sword`、
   * 店主的帳本 `shop_ledger`（主控裁定從「店主的算盤」改名）→`relic_shop_abacus`、批發箱 `bulk_crate`→`relic_wholesale_crate`。
   */
  // --- 計數型：圖示右下角 44×44 留白給數字（`engine/counters.ts` 算、狀態列疊上去）---
  { id: 'wooden_dummy', name: '木人樁', pool: '常見', text: '每打出第 10 張攻擊牌，那一張的傷害加倍（跨戰鬥累計）。', art: 'codex/relic_wooden_dummy', price: 140,
    hooks: { attackCounterDouble: 10 } },
  { id: 'hourglass', name: '沙漏', pool: '常見', text: '每 3 回合（第 3、6、9…回合開始時）多 1 顆飯糰。', art: 'codex/relic_hourglass', price: 150,
    hooks: { everyNTurns: { n: 3, effects: [{ kind: 'energy', n: 1 }] } } },
  /*
   * 提案是 25 條：量尺四隻平均 +0.4 層（常見池下四分位 1.1、中位 2.2），主控 2026-09-23 裁定加到池子中下。
   * 機器人對小魚乾量不準（40、50 條都只量到 +0.7），照心算定：完整一局約 25 個非戰鬥格＝倒 8 次，
   * 40 條＝320 條，落在小魚乾罐（每場 10 條，約 250）與幸運錢幣（每場 20 條，約 500）中間（b2mech 報告）
   */
  { id: 'piggy_bank', name: '撲滿', pool: '常見', text: '每走進 3 個不是戰鬥的格子（事件、罐頭鋪、貓窩、紙箱），得到 40 條小魚乾（跨關累計）。', art: 'codex/relic_piggy_bank', price: 110,
    hooks: { nodeCounterFish: { n: 3, fish: 40 } } },
  // 原本是「每 4 回合 1 層隱身」，跟影忍頭帶重疊，改成清減益（2026-09-25 使用者裁定：每 2 回合清 1 種）
  { id: 'incense_stick', name: '線香', pool: '大魔物', text: '每 2 回合（第 2、4、6…回合開始時）清掉自己身上 1 種減益。', art: 'codex/relic_incense_stick', price: 190,
    hooks: { everyNTurns: { n: 2, effects: [{ kind: 'cleanse', max: 1 }] } } },
  { id: 'dart_case', name: '暗器匣', pool: '大魔物', text: '每回合打出第 3 張牌後，對隨機一隻魔物造成 5 點傷害。', art: 'codex/relic_dart_case', price: 190,
    hooks: { onNthCard: { n: 3, effects: [{ kind: 'damageScatter', amount: 5, times: 1 }] } } },
  // --- 角色的新時機：封封兩件（蓄氣只有他有，鎖另外三位）、菲菲、噹噹、球球各一件（偏誰而已，不鎖）---
  // 門檻原本是灌滿 12：機器人不囤氣，量尺每場只發動 0.08 次；主控 2026-09-23 裁定降到 10
  // 2026-09-23 平衡（bal）：門檻 10 量尺還是 ≈0（−0.1 層；降到 8、6 也只 +0.6～0.7），缺的是氣；加每回合 1 點蓄氣，門檻照 10，+4.0 層＝塔主池中位附近
  { id: 'full_moon_sword', name: '滿月劍意', pool: '塔主', notFor: ['ninja', 'feifei', 'dangdang'], text: '每回合開始時獲得 1 點蓄氣；蓄氣蓄到 10 點以上的那一刻，這回合下一張攻擊牌傷害加倍（每回合一次）。', art: 'codex/relic_full_moon_sword', price: 240,
    hooks: { qiReachDoubleNext: 10, turnStart: [{ kind: 'gainQi', n: 1 }] } },
  { id: 'sheath_pendant', name: '收鞘墜', pool: '大魔物', notFor: ['ninja', 'feifei', 'dangdang'], text: '這場戰鬥每花掉 6 點蓄氣，獲得 1 顆飯糰。', art: 'codex/relic_sheath_pendant', price: 190,
    hooks: { qiSpentEnergy: { per: 6, energy: 1 } } },
  // 提案是多扣 1 點：量尺菲菲只多爬 1.7 層（塔主池中位 4.0，過關三選一等於廢選項）；2 點＝4.1 層，剛好中位（b2mech 報告）
  // 2026-09-23 平衡（bal）：另外三隻自己不太下毒，量到 +0.8～1.1 層（塔主三選一裡等於少一個選項）；
  // 開場給全體 1 層毒當引子（這一層也吃「多扣 2 點」），四隻平均 +2.9 層、菲菲 +5.2
  { id: 'five_poison_manual', name: '五毒譜', pool: '塔主', text: '每場戰鬥開始時給全體魔物 1 層中毒；你下的毒，每回合結算時多扣 2 點生命。', art: 'codex/relic_five_poison_manual', price: 240,
    hooks: { poisonTickBonus: 2, combatStart: [{ kind: 'status', name: '中毒', amount: 1, target: 'all' }] } },
  { id: 'iron_wall', name: '鐵壁', pool: '大魔物', text: '回合結束時，蜷縮超過 15 點的部分每 2 點換 1 點反彈（蜷縮不會減少）。', art: 'codex/relic_iron_wall', price: 190,
    hooks: { turnEndBlockToThorns: { over: 15, per: 2 } } },
  // 閃過都在魔物的回合，所以「抽 1 張」落在下回合。提案只有抽牌：量尺球球只多爬 0.9 層（塔主池中位 4.0）；
  // 加上下回合多 1 顆飯糰＝3.8 層（只抽 2 張是 0.6，多的是飯糰不是牌），閃得越多下回合越猛，正好是隱身流要的回報（b2mech 報告）
  // 2026-09-23 平衡（bal）：只有球球常閃，另外三隻量到 +0.4～1.3 層；加開場 1 點貓步（誰都用得到的身法），四隻平均 +3.8 層、球球 +4.7
  { id: 'clone_scroll', name: '影分身卷軸', pool: '塔主', text: '每場戰鬥開始時獲得 1 點貓步；每次閃過魔物的攻擊，下回合多抽 1 張牌、多 1 顆飯糰。', art: 'codex/relic_clone_scroll', price: 240,
    hooks: { onDodge: [{ kind: 'drawNextTurn', n: 1 }, { kind: 'energyNextTurn', n: 1 }], combatStart: [{ kind: 'status', name: '貓步', amount: 1, target: 'self' }] } },
  // --- 罐頭鋪限定：只擺在罐頭鋪最右邊的「店長私藏」那一格（`makeShop`），不進紙箱、戰利品、事件、三選一 ---
  /*
   * 劇本是「價錢停在拿到時、不再漲」：量尺 +0.05 層（機器人一局只放生一次左右）。主控 2026-09-23 裁定加數字：一律 40 條、不再漲。
   * 心算：完整一局放生四五次，平常 75＋100＋125＋150（＋175）＝450～625 條，會員卡 160～200 條，省下 290～425 條，
   * 落在小魚乾罐與幸運錢幣之間；便宜了也會多放生幾張，牌組更精。機器人量到的（25 條 +0.7、50 條 +0.2）偏低（b2mech 報告）
   */
  { id: 'member_card', name: '會員卡', pool: '罐頭鋪', text: '放生一律 40 條小魚乾，不再上漲。', art: 'codex/relic_member_card', price: 140,
    hooks: { removeCostFixed: 40 } },
  { id: 'shop_ledger', name: '店主的帳本', pool: '罐頭鋪', text: '每間罐頭鋪買的第一件商品半價（牌、秘寶、忍具都算；放生與重整不算）。', art: 'codex/relic_shop_abacus', price: 180,
    hooks: { shopFirstItemHalf: true } },
  /*
   * 劇本是多帶 1 支＋半價：量尺 +0.65 層。主控 2026-09-23 裁定加數字：多帶 2 支（九命鈴的格數，但沒有回血）＋半價，+0.8 層；
   * 機器人只在身上少於兩支時才買忍具、格子多半空著，量不準。心算：完整一局逛五間、每間買兩支（平均 45 條）省 225 條，
   * 多兩格讓稀有的起死回生丹、先手香留得住（b2mech 報告）
   */
  { id: 'bulk_crate', name: '批發箱', pool: '罐頭鋪', text: '忍具可以多帶 2 支；罐頭鋪的忍具半價。', art: 'codex/relic_wholesale_crate', price: 160,
    hooks: { potionSlots: 2, shopPotionMul: 0.5 } },
  // --- 事件限定：只從指定的事件拿（事件劇本的 `relicId`），不進任何抽取池 ---
  { id: 'master_wooden_sword', name: '師父的舊木劍', pool: '事件', set: '師門', text: '每場戰鬥開始時獲得 1 點爪力與 4 點蜷縮。', art: 'codex/relic_master_wood_sword', price: 200,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }, { kind: 'block', amount: 4 }] } },
  { id: 'miasma_shard', name: '魔氣殘片', pool: '事件', text: '最大生命 +15；每場戰鬥開始時獲得 1 層炸毛。', art: 'codex/relic_demon_shard', price: 190,
    hooks: { maxHp: 15, combatStart: [{ kind: 'status', name: '炸毛', amount: 1, target: 'self' }] } },
  /*
   * 劇本是每場 15 條：量尺 +0.6 層。主控 2026-09-23 裁定加數字：每場 25 條（貪吃錢袋同樣 25 條，代價是全店貴三成、這件是每間店 10 條），
   * 量尺 +1.5 層＝常見池中下；事件池只有三件、另兩件是純數值（+3.4～3.8），它是拿錢的那一路，不硬拉到那個高度（b2mech 報告）
   */
  { id: 'bandit_iou', name: '山賊的欠條', pool: '事件', text: '每打贏一場戰鬥多拿 25 條小魚乾；每間罐頭鋪第一次走進去，先替山賊還 10 條舊帳（不夠就付到 0）。', art: 'codex/relic_bandit_iou', price: 150,
    hooks: { winGold: 25, shopEntryFee: 10 } },

  /*
   * ===== 2026-09-23 內容擴充第三批：9 件＋淨化版 6 件（design3 第六、七節）=====
   *
   * 9 件補到 120：量尺上「量出來幾乎沒效果」或「一件都沒有」的方向——忍具的來源（藥簍）、貓窩（夢枕）、
   * 問號格（平安繩、探路杖）、紙箱（箱中箱）、魔氣（魔氣燈籠、舊護腕，可淨化）、削弱魔物（鎮魔符）、店主（集章卡）。
   * 圖示是美術 art5 登記好的（`batch3_art_keys.md` 第三段），代號照設計稿。
   *
   * 「沾了魔氣」的六件（本批兩件＋既有三件＋第二批的魔氣殘片）淨化之後換成 `淨化` 池那一件（`MIASMA_PURE`），
   * 淨化版永遠抽不到、不算進 120。**既有那四件的條目一個字都沒動**：哪幾件算「沾了魔氣」寫在下面的 `MIASMA_PURE` 表，不掛在條目上。
   * 塔主池四件代價型（不眠香爐、銅臭錢袋、斷念珠、狂刀鞘）、貪吃錢袋、山賊的欠條**不能淨化**（design3 6-1：那是三選一與逛店時要猶豫的代價）。
   *
   * 平安繩的「不會變成伏擊」（`qmarkNoAmbush`）與探路杖的計數（`qmarkEvery`）由問號格變化那條線讀掛鉤、自己數（主控 2026-09-23 對齊）；
   * 集章卡看的店主是店主輪替那條線寫在地圖格子上的 `keeper`（`run.ts` 的 `stampVisit`，還沒有那一欄＝橘貓老闆）。
   */
  // --- 常見 +4 ---
  // 藥簍、夢枕 2026-09-24 b3int 主控裁決調過：藥簍原本「一定有、升成罕見以上」量到 +4.2 層（太強），改成只保證有、只在一般戰鬥；
  // 夢枕原本收一般版量到約 0 層，改成三張都是升級版（機器人帶著它時挑得到好牌就改去打盹）；
  // 探路杖原本「每 3 格、行腳商或路邊紙箱各一半」量到常見池墊底 +0.4 層，改成每 2 格、一定是路邊紙箱（+2.0）；
  // 魔氣燈籠原本開戰帶 2 層懶洋洋量到 +2.1 層（大魔物池下四分位 +2.6 以下），改成 1 層（+3.1）
  { id: 'herb_basket', name: '藥簍', pool: '常見', text: '打贏一般戰鬥時，戰利品一定有 1 個忍具（本來就會掉的，不另外給）。', art: 'codex/relic_herb_basket', price: 130,
    hooks: { winPotion: true } },
  { id: 'dream_pillow', name: '夢枕', pool: '常見', text: '在貓窩打盹之後，從 3 張升級版的牌中選 1 張加入牌組（可以不拿）。', art: 'codex/relic_dream_pillow', price: 140,
    hooks: { restCardReward: 3 } },
  { id: 'peace_cord', name: '平安繩', pool: '常見', text: '問號格不會變成伏擊；每走進一個問號格回復 5 點生命。', art: 'codex/relic_peace_cord', price: 110,
    hooks: { qmarkNoAmbush: true, qmarkHeal: 5 } },
  { id: 'scout_staff', name: '探路杖', pool: '常見', text: '每走進 2 個問號格，第 2 個一定是路邊紙箱。', art: 'codex/relic_scout_staff', price: 150,
    hooks: { qmarkEvery: 2 } },
  // --- 大魔物 +2 ---
  { id: 'box_in_box', name: '箱中箱', pool: '大魔物', text: '接下來打開的 2 個紙箱（8F 紙箱、路邊紙箱），每個多給你 1 件秘寶。', art: 'codex/relic_box_in_box', price: 190,
    hooks: { chestExtra: 2 } },
  { id: 'miasma_lantern', name: '魔氣燈籠', pool: '大魔物', text: '每回合開始時多抽 1 張牌；每場戰鬥第一回合多 1 顆飯糰；開戰帶 1 層懶洋洋。', art: 'codex/relic_miasma_lantern', price: 200,
    hooks: { turnStart: [{ kind: 'draw', n: 1 }], firstTurnEnergy: 1, combatStart: [{ kind: 'status', name: '懶洋洋', amount: 1, target: 'self' }] } },
  // --- 塔主 +1 ---
  { id: 'demon_seal', name: '鎮魔符', pool: '塔主', text: '每場戰鬥開始時給全體魔物 1 層定身（每隻 70%機率定住）。', art: 'codex/relic_demon_seal', price: 240,
    hooks: { combatStart: [{ kind: 'status', name: '定身', amount: 1, target: 'all' }] } },
  // --- 罐頭鋪限定 +1：只擺在店長私藏那一格 ---
  { id: 'stamp_card', name: '集章卡', pool: '罐頭鋪', text: '每走進一間店主不同的罐頭鋪蓋一個章（買到它的這間算第一個）；集滿三個不同的章，隨機獲得 1 件塔主秘寶，之後罐頭鋪的商品打九折。', art: 'codex/relic_stamp_card', price: 150,
    hooks: { stampCard: true } },
  // --- 事件限定 +1：開局祝福、紫霧裡的聲音 ---
  { id: 'master_bracer', name: '沾了魔氣的舊護腕', pool: '事件', text: '每場戰鬥開始時獲得 3 點爪力與 2 層翻肚。', art: 'codex/relic_master_bracer', price: 180,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }, { kind: 'status', name: '翻肚', amount: 2, target: 'self' }] } },
  // --- 淨化版 6 件（`淨化` 池，永遠抽不到；說明就是原件拿掉魔氣那一半）---
  // 2026-09-24 b3int 主控裁決：淨化版照原件那一池的下四分位～上四分位調、要比原件好。拿掉整個代價的版本量到清心護符 +9.7、
  // 解契短刀 +6.7、大俠貓的舊護腕 +6.8、月光晶石 +4.4（大魔物池上四分位 +4.8、事件池 +3.7），改成清心護符留 2 層炸毛（+7.4）、
  // 解契短刀爪力 3 → 2（+4.5）、大俠貓的舊護腕爪力 3 → 2 並扣最大生命 3（+3.7）、月光晶石最大生命 15 → 13（+3.7）。
  // 魔氣護符原件 +6.4 本來就在大魔物池上四分位以上，清心護符只能「比原件好一點」。原件的分數會跟著淨化版變：
  // 淨化收益到 1.5 層以上機器人才會去淨化，原件量出來就連淨化後那一段一起算（血契短刀原本 +4.5、舊護腕 +4.35，現在 +2.9、+3.5）
  { id: 'miasma_charm_pure', name: '清心護符', pool: '淨化', text: '每回合多 1 顆飯糰；每場戰鬥開始帶 2 層炸毛（魔氣散了一些）。', art: 'codex/relic_miasma_charm_pure', price: 240,
    hooks: { energyPerTurn: 1, combatStart: [{ kind: 'status', name: '炸毛', amount: 2, target: 'self' }] } },
  // 拿到原件時扣的 12 點最大生命，淨化那一刻還回來（`run.ts` 的 `purifyRelic` 照兩件的 `maxHp` 差調整）
  { id: 'blood_dagger_pure', name: '解契短刀', pool: '淨化', text: '每場戰鬥開始獲得 2 點爪力。', art: 'codex/relic_blood_dagger_pure', price: 210,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }] } },
  { id: 'black_cat_mask_pure', name: '白貓面具', pool: '淨化', text: '每場戰鬥第一回合多 2 顆飯糰。', art: 'codex/relic_black_cat_mask_pure', price: 230,
    hooks: { firstTurnEnergy: 2 } },
  // 圖示檔名跟代號走（`relic_miasma_shard_pure`）；原件的圖示是 art2 的 `relic_demon_shard`，兩個前綴不一樣是刻意的（`batch3_art_keys.md` 第二段）
  { id: 'miasma_shard_pure', name: '月光晶石', pool: '淨化', text: '最大生命 +13。', art: 'codex/relic_miasma_shard_pure', price: 190,
    hooks: { maxHp: 13 } },
  { id: 'master_bracer_pure', name: '大俠貓的舊護腕', pool: '淨化', text: '每場戰鬥開始時獲得 2 點爪力；最大生命 −3。', art: 'codex/relic_master_bracer_pure', price: 180,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }], maxHp: -3 } },
  { id: 'miasma_lantern_pure', name: '長明燈', pool: '淨化', text: '每回合開始時多抽 1 張牌；每場戰鬥第一回合多 1 顆飯糰。', art: 'codex/relic_miasma_lantern_pure', price: 200,
    hooks: { turnStart: [{ kind: 'draw', n: 1 }], firstTurnEnergy: 1 } },
];

/**
 * **沾了魔氣的秘寶 → 淨化版**（2026-09-23 第三批，design3 6-1）。這張表就是「哪幾件算沾了魔氣」的唯一來源：
 * 淨化換的是代號（原地換、位置不變），存檔與整局指紋只存代號，自動跟著走。
 * 判準：代價是魔氣造成的、而且不是過關三選一或逛店時要猶豫的那種代價（塔主池四件代價型、貪吃錢袋、山賊的欠條不在這裡）。
 */
export const MIASMA_PURE: Readonly<Record<string, string>> = {
  miasma_charm: 'miasma_charm_pure',
  blood_dagger: 'blood_dagger_pure',
  black_cat_mask: 'black_cat_mask_pure',
  miasma_shard: 'miasma_shard_pure',
  master_bracer: 'master_bracer_pure',
  miasma_lantern: 'miasma_lantern_pure',
};
/** 這件沾了魔氣嗎（淨化得掉） */
export function isMiasma(id: string): boolean { return Object.hasOwn(MIASMA_PURE, id); }
/**
 * 身上「算有」這一件嗎：有原件，或有它的淨化版（2026-09-24 推前審查五 高-3）。淨化版是同一件東西擦乾淨了，
 * 淨化過的原件不該再被抽到、再被給一次——原本三選一、紙箱、罐頭鋪、行腳商都抽得到，兩件並存時清心香放行卻套不下去，連線必斷。
 */
export function ownsRelic(owned: readonly string[], id: string): boolean {
  return owned.includes(id) || (isMiasma(id) && owned.includes(MIASMA_PURE[id]!));
}
/** 抽秘寶時要排掉的：身上有的，加上「淨化版在身上」的那幾件原件（`rewards.ts` 的 `rollRelic`／`rollRelicChoices` 用） */
export function ownedForRolls(owned: readonly string[]): string[] {
  const extra = Object.keys(MIASMA_PURE).filter((id) => owned.includes(MIASMA_PURE[id]!) && !owned.includes(id));
  return extra.length ? [...owned, ...extra] : [...owned];
}
/**
 * **淨化會變怎樣**（2026-09-25 使用者：「淨化完會變怎樣其實看不到」）：拿掉的壞處（`good`，畫面標綠）與代價（`bad`，標橘）。
 * 淨化結果視窗、挑選窗、說明那句都讀這一張，六件一件一列，少一件有測試擋。
 * 淨化當下最大生命的增減（`purifyRelic` 照兩件 `hooks.maxHp` 的差調）也寫在這裡，數字有測試對著掛鉤核。
 */
// 「當場…」用逗號接、不用括號：`relicLongText` 外面還會再包一層全形括號（推前審查 2026-09-25 低-4）。
// `gist`＝一句話的重點，給貨架、過關三選一、事件拿到那一列這些只有三四行的地方（低-1：長句在貨架上剛好被切在「淨化後變成」）
export const PURIFY_CHANGE: Readonly<Record<string, { good: readonly string[]; bad: readonly string[]; gist: string }>> = {
  miasma_lantern: { good: ['開戰不會再懶洋洋'], bad: [], gist: '不再懶洋洋' },
  black_cat_mask: { good: ['開戰不會再懶洋洋'], bad: [], gist: '不再懶洋洋' },
  miasma_charm: { good: ['開戰的炸毛從 3 層減成 2 層'], bad: [], gist: '炸毛少一層' },
  miasma_shard: { good: ['開戰不會再炸毛'], bad: ['最大生命加成從 +15 變 +13，當場少 2 點'], gist: '不再炸毛' },
  blood_dagger: { good: ['拿到時扣掉的 12 點最大生命還給你，當場補上'], bad: ['開戰的爪力從 3 點變 2 點'], gist: '還回 12 點最大生命' },
  master_bracer: { good: ['開戰不會再翻肚'], bad: ['開戰的爪力從 3 點變 2 點', '最大生命 −3，當場扣掉'], gist: '不再翻肚' },
};
/** 說明後面自動補的那一句（design3 6-1，2026-09-25 補上會變成什麼）：不改原本六件的說明，看到 `isMiasma` 就補 */
export function miasmaNote(id: string): string {
  const pure = relicById[MIASMA_PURE[id] ?? ''];
  const ch = PURIFY_CHANGE[id];
  if (!pure || !ch) return '沾了魔氣，可以淨化（貓窩、玳瑁婆婆、某些事件）';
  return `沾了魔氣，可以在貓窩、玳瑁婆婆、某些事件淨化；淨化後變成「${pure.name}」：${ch.good.join('、')}${ch.bad.length ? `；代價是${ch.bad.join('、')}` : ''}`;
}
/** 貨架那一格四行放得下多少（全形字寬；數字、空白、英文算半個）：2026-09-25 實機量過，48～50 字剛好四行、56 字就掉到第五行 */
export const BRIEF_BUDGET = 50;
export function textWidth(s: string): number {
  return [...s].reduce((n, c) => n + (c.charCodeAt(0) < 0x2e80 ? 0.5 : 1), 0);
}
/**
 * 窄格子用的短句，接在 `base`（原本的說明）後面：放得下就多講一點，放不下就少講，最少也留「可淨化」。
 * 魔氣燈籠原文就 44 字，只放得下「可淨化成『長明燈』」；短句只講好處，代價在全文：罐頭鋪的滑鼠提示、狀態列、秘寶清單、過關三選一
 */
export function miasmaGist(id: string, base = ''): string {
  const pure = relicById[MIASMA_PURE[id] ?? ''];
  const ch = PURIFY_CHANGE[id];
  if (!pure || !ch) return '可淨化';
  const tries = [`沾了魔氣：可淨化成「${pure.name}」，${ch.gist}`, `可淨化成「${pure.name}」，${ch.gist}`, `可淨化成「${pure.name}」`];
  return tries.find((t) => textWidth(base) + textWidth(t) + 2 <= BRIEF_BUDGET) ?? '可淨化';   // +2＝外面那對括號
}

export const relicById: Record<string, RelicDef> = Object.fromEntries(relics.map((r) => [r.id, r]));

/**
 * 秘寶套組（2026-09-23 內容擴充第二批，事件劇本第八節）。**集到 `need` 件就有加成，再多不再加**——
 * 提案第⑥節的提醒：套組太強會讓每局都追同一套，反而更重複，所以只給小加成。連線時各算各的。
 */
export const RELIC_SETS: Readonly<Record<RelicSet, { need: number; firstTurnEnergy: number; text: string }>> = {
  師門: { need: 2, firstTurnEnergy: 1, text: '集到任兩件：每場戰鬥第一回合多 1 顆飯糰' },
};

/** 這一套有哪幾件（照資料表順序） */
export function setMembers(set: RelicSet): RelicDef[] {
  return relics.filter((r) => r.set === set);
}

/** 身上這一套集到幾件 */
export function setCount(set: RelicSet, owned: readonly string[]): number {
  return setMembers(set).filter((r) => owned.includes(r.id)).length;
}

/** 身上已經湊成（集到 `need` 件以上）的套組 */
export function activeSets(owned: readonly string[]): RelicSet[] {
  return (Object.keys(RELIC_SETS) as RelicSet[]).filter((s) => setCount(s, owned) >= RELIC_SETS[s].need);
}

/**
 * 秘寶說明＋套組那一段（「【師門 1／3】集到任兩件：……」）。狀態列提示、本局秘寶清單、罐頭鋪、圖鑑都用這一支，
 * 集到幾件照 `owned` 數（圖鑑沒有一局可看就傳空的，寫 0）。沒有套組的就是原本的說明。
 */
export function relicLongText(def: RelicDef, owned: readonly string[] = [],
  /** 只有三四行的格子（貨架、過關三選一、事件拿到那一列）傳 true：淨化那句用短句 `miasmaGist`（2026-09-25 推前審查 低-1） */
  brief = false): string {
  // 沾了魔氣的六件補一句「可以淨化」（2026-09-23 第三批，design3 6-1：不改原本的說明，看到 `MIASMA_PURE` 就補）
  if (isMiasma(def.id)) return `${def.text}（${brief ? miasmaGist(def.id, def.text) : miasmaNote(def.id)}）`;
  if (!def.set) return def.text;
  return `${def.text}【${def.set} ${setCount(def.set, owned)}／${setMembers(def.set).length}】${RELIC_SETS[def.set].text}。`;
}

/** 套組給的「每場戰鬥第一回合多幾顆飯糰」（`combat.ts` 的 `startSeatTurn` 加在秘寶的 `firstTurnEnergy` 後面） */
export function setFirstTurnEnergy(owned: readonly string[]): number {
  return activeSets(owned).reduce((n, s) => n + RELIC_SETS[s].firstTurnEnergy, 0);
}
