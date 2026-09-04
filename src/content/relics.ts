import type { RelicDef } from '../engine/types';

export const relics: RelicDef[] = [
  { id: 'blue_headband', name: '藍頭巾', pool: '起始', text: '每場戰鬥第一回合多抽 1 張牌。', art: 'codex/relic_headband', price: 130, hooks: { firstTurnDraw: 1 } },
  { id: 'onigiri_bag', name: '飯糰袋', pool: '常見', text: '每場戰鬥第一回合多 1 顆飯糰。', art: 'codex/relic_onigiri_bag', price: 160, hooks: { firstTurnEnergy: 1 } },
  { id: 'tuna_can', name: '鮪魚罐頭', pool: '常見', text: '最大生命 +10。', art: 'codex/relic_tuna_can', price: 120, hooks: { maxHp: 10 } },
  { id: 'catgrass', name: '貓草', pool: '常見', text: '在貓窩打盹回的血加倍。', art: 'codex/relic_catgrass', price: 100, hooks: { restMultiplier: 2 } },
  { id: 'bell', name: '鈴鐺', pool: '常見', text: '每場戰鬥開始時獲得 1 層隱身。', art: 'codex/relic_bell', price: 160,
    hooks: { combatStart: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'fish_jar', name: '小魚乾罐', pool: '常見', text: '每場戰鬥打贏多拿 10 條小魚乾。', art: 'codex/relic_fish_jar', price: 100, hooks: { winGold: 10 } },
  { id: 'catnip', name: '貓薄荷', pool: '常見', text: '每場戰鬥開始時回復 3 點生命。', art: 'codex/relic_catnip', price: 130,
    hooks: { combatStart: [{ kind: 'heal', n: 3 }] } },
  { id: 'tail_bell', name: '尾巴鈴', pool: '常見', text: '回合結束時，如果這回合沒打過攻擊牌，獲得 4 點蜷縮。', art: 'codex/relic_tail_bell', price: 120,
    hooks: { turnEndNoAttack: [{ kind: 'block', amount: 4 }] } },
  { id: 'wood_post', name: '木樁', pool: '大魔物', text: '每場戰鬥開始時給全體魔物 1 層翻肚。', art: 'codex/relic_wood_post', price: 200, hooks: { combatStart: [{ kind: 'status', name: '翻肚', amount: 1, target: 'all' }] } },
  { id: 'yarn_ball', name: '毛線球', pool: '大魔物', text: '每回合第一張打出的牌費用 −1（最低 0）。', art: 'codex/relic_yarn_ball', price: 210, hooks: { firstCardDiscount: 1 } },
  { id: 'cat_teaser', name: '逗貓棒', pool: '大魔物', text: '每打出一張攻擊牌，有兩成機會抽 1 張牌。', art: 'codex/relic_cat_teaser', price: 190, hooks: { onAttackPlayed: { chance: 0.2, effects: [{ kind: 'draw', n: 1 }] } } },
  { id: 'scroll', name: '秘笈', pool: '大魔物', text: '每場戰鬥第一次攻擊傷害加倍。', art: 'codex/relic_scroll', price: 190, hooks: { firstAttackDouble: true } },
  { id: 'paper_bag', name: '紙袋', pool: '大魔物', text: '每回合第一次獲得隱身時多 1 層。', art: 'codex/relic_paper_bag', price: 180, hooks: { stealthBonus: 1 } },
  { id: 'bronze_mirror', name: '銅鏡', pool: '大魔物', text: '每場戰鬥開始時獲得 2 點反彈。', art: 'codex/relic_bronze_mirror', price: 170,
    hooks: { combatStart: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }] } },
  { id: 'tower_token', name: '塔主令牌', pool: '塔主', text: '每回合多 1 顆飯糰；最大生命 −10。', art: 'codex/relic_tower_token', price: 220, hooks: { energyPerTurn: 1, maxHp: -10 } },
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
  { id: 'sardine_tin', name: '沙丁魚罐', pool: '常見', text: '每打倒一隻魔物回復 2 點生命。', art: 'codex/relic_sardine_tin', price: 110, hooks: { killHeal: 2 } },
  { id: 'worn_scroll', name: '破卷軸', pool: '常見', text: '每場戰鬥第一張牌少花 1 顆飯糰。', art: 'codex/relic_worn_scroll', price: 130, hooks: { firstCardDiscountCombat: 1 } },
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
  { id: 'coin_jar', name: '零錢罐', pool: '常見', text: '罐頭鋪的東西打八折（買到的當下整間店就重新標價）。', art: 'codex/relic_coin_jar', price: 120, hooks: { shopDiscount: 0.8 } },   // 九折→八折、當下生效（使用者 2026-09-04）
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
  { id: 'obsidian_claw', name: '黑曜爪', pool: '大魔物', text: '每打倒一隻魔物獲得 1 點爪力。', art: 'codex/relic_obsidian_claw', price: 210, hooks: { killStrength: 1 } },
  { id: 'guard_charm', name: '守護符', pool: '大魔物', text: '回合結束時最多保留 8 點蜷縮到下一回合。', art: 'codex/relic_guard_charm', price: 200, hooks: { blockKeep: 8 } },
  { id: 'turtle_shell', name: '龜甲', pool: '大魔物', text: '每場戰鬥開始時獲得 6 點蜷縮與 3 點反彈。', art: 'codex/relic_turtle_shell', price: 200, hooks: { combatStart: [{ kind: 'block', amount: 6 }, { kind: 'status', name: '反彈', amount: 3, target: 'self' }] } },
  { id: 'wind_chime', name: '風鈴', pool: '大魔物', text: '回合結束時，如果這回合沒打過攻擊牌，獲得 2 層隱身。', art: 'codex/relic_wind_chime', price: 200, hooks: { turnEndNoAttack: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }] } },
  { id: 'catnip_pipe', name: '貓薄荷煙斗', pool: '大魔物', text: '每次使用忍具後抽 2 張牌。', art: 'codex/relic_catnip_pipe', price: 190, hooks: { onPotionUse: [{ kind: 'draw', n: 2 }] } },
  { id: 'coin_sword', name: '銅錢劍', pool: '大魔物', text: '每打倒一隻魔物多拿 8 條小魚乾。', art: 'codex/relic_coin_sword', price: 180, hooks: { killFish: 8 } },
  // --- 塔主（+5）---
  { id: 'tower_moon', name: '塔頂之月', pool: '塔主', text: '每場戰鬥開始時獲得 3 點爪力與 3 點貓步。', art: 'codex/relic_tower_moon', price: 240, hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }, { kind: 'status', name: '貓步', amount: 3, target: 'self' }] } },
  { id: 'daruma', name: '不倒翁', pool: '塔主', text: '最大生命 +20；每打贏一場戰鬥回復 6 點生命。', art: 'codex/relic_daruma', price: 240, hooks: { maxHp: 20, combatEndHeal: 6 } },
  { id: 'nine_bell', name: '九命鈴', pool: '塔主', text: '忍具可以多帶兩支；每次使用忍具後回復 3 點生命。', art: 'codex/relic_nine_bell', price: 230, hooks: { potionSlots: 2, onPotionUse: [{ kind: 'heal', n: 3 }] } },
  { id: 'gold_claws', name: '金爪套', pool: '塔主', text: '每回合打出第 3 張牌時抽 1 張牌、多 1 顆飯糰。', art: 'codex/relic_gold_claws', price: 240, hooks: { drawOnNthCard: { n: 3, draw: 1 }, energyOnNthCard: { n: 3, energy: 1 } } },
  { id: 'master_seal', name: '掌門印', pool: '塔主', text: '戰鬥獎勵的牌多一張可選。', art: 'codex/relic_master_seal', price: 230, hooks: { rewardChoices: 1 } },
  // ===== 代價秘寶（2026-09-04，使用者：「很強但有代價的，玩家會猶豫，選擇才有趣」）。圖示還沒生，先顯示文字牌 =====
  { id: 'blood_dagger', name: '血契短刀', pool: '大魔物', text: '每場戰鬥開始獲得 3 點爪力；拿到時最大生命 −12。', art: 'codex/relic_blood_dagger', price: 210,
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }], maxHp: -12 } },
  { id: 'miasma_charm', name: '魔氣護符', pool: '大魔物', text: '每回合多 1 顆飯糰；每場戰鬥開始帶 2 層炸毛（獲得的蜷縮只剩 0.75 倍）。', art: 'codex/relic_miasma_charm', price: 240,
    hooks: { energyPerTurn: 1, combatStart: [{ kind: 'status', name: '炸毛', amount: 2, target: 'self' }] } },
  { id: 'iron_sand_vest', name: '鐵砂衣', pool: '常見', text: '回合結束最多留 6 點蜷縮到下一回合；每場戰鬥開始失去 4 點生命。', art: 'codex/relic_iron_sand_vest', price: 140,
    hooks: { blockKeep: 6, combatStart: [{ kind: 'selfDamage', amount: 4 }] } },
  { id: 'glutton_purse', name: '貪吃錢袋', pool: '常見', text: '每場打贏多拿 25 條小魚乾；罐頭鋪的價格漲三成。', art: 'codex/relic_glutton_purse', price: 120,
    hooks: { winGold: 25, shopDiscount: 1.3 } },
  { id: 'black_cat_mask', name: '黑貓面具', pool: '大魔物', text: '每場戰鬥第一回合多 2 顆飯糰；開戰帶 1 層懶洋洋（造成的傷害只剩 0.75 倍）。', art: 'codex/relic_black_cat_mask', price: 230,
    hooks: { firstTurnEnergy: 2, combatStart: [{ kind: 'status', name: '懶洋洋', amount: 1, target: 'self' }] } },
];

export const relicById: Record<string, RelicDef> = Object.fromEntries(relics.map((r) => [r.id, r]));
