import type { RelicDef } from '../engine/types';

export const relics: RelicDef[] = [
  { id: 'blue_headband', name: '藍頭巾', pool: '起始', text: '每場戰鬥第一回合多抽 1 張牌。', art: 'codex/relic_headband', hooks: { firstTurnDraw: 1 } },
  { id: 'onigiri_bag', name: '飯糰袋', pool: '常見', text: '每場戰鬥第一回合多 1 顆飯糰。', art: 'codex/relic_onigiri_bag', hooks: { firstTurnEnergy: 1 } },
  { id: 'tuna_can', name: '鮪魚罐頭', pool: '常見', text: '最大生命 +10。', art: 'codex/relic_tuna_can', hooks: { maxHp: 10 } },
  { id: 'catgrass', name: '貓草', pool: '常見', text: '在貓窩打盹回的血加倍。', art: 'codex/relic_catgrass', hooks: { restMultiplier: 2 } },
  { id: 'bell', name: '鈴鐺', pool: '常見', text: '每場戰鬥開始時獲得 1 層隱身。', art: 'codex/relic_bell',
    hooks: { combatStart: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'fish_jar', name: '小魚乾罐', pool: '常見', text: '每場戰鬥打贏多拿 10 條小魚乾。', art: 'codex/relic_fish_jar', hooks: { winGold: 10 } },
  { id: 'catnip', name: '貓薄荷', pool: '常見', text: '每場戰鬥開始時回復 3 點生命。', art: 'codex/relic_catnip',
    hooks: { combatStart: [{ kind: 'heal', n: 3 }] } },
  { id: 'tail_bell', name: '尾巴鈴', pool: '常見', text: '回合結束時，如果這回合沒打過攻擊牌，獲得 4 點蜷縮。', art: 'codex/relic_tail_bell',
    hooks: { turnEndNoAttack: [{ kind: 'block', amount: 4 }] } },
  { id: 'wood_post', name: '木樁', pool: '大魔物', text: '每場戰鬥第一次會被打死時，改成留 1 點生命。', art: 'codex/relic_wood_post', hooks: { preventLethal: true } },
  { id: 'yarn_ball', name: '毛線球', pool: '大魔物', text: '每回合第一張打出的牌費用 −1（最低 0）。', art: 'codex/relic_yarn_ball', hooks: { firstCardDiscount: 1 } },
  { id: 'cat_teaser', name: '逗貓棒', pool: '大魔物', text: '每回合打出第 3 張牌時抽 1 張牌。', art: 'codex/relic_cat_teaser', hooks: { drawOnNthCard: { n: 3, draw: 1 } } },
  { id: 'scroll', name: '秘笈', pool: '大魔物', text: '每場戰鬥開始時獲得 1 點爪力。', art: 'codex/relic_scroll',
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } },
  { id: 'paper_bag', name: '紙袋', pool: '大魔物', text: '每回合第一次獲得隱身時多 1 層。', art: 'codex/relic_paper_bag', hooks: { stealthBonus: 1 } },
  { id: 'bronze_mirror', name: '銅鏡', pool: '大魔物', text: '每場戰鬥開始時獲得 2 點反彈。', art: 'codex/relic_bronze_mirror',
    hooks: { combatStart: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }] } },
  { id: 'tower_token', name: '塔主令牌', pool: '塔主', text: '每回合多 1 顆飯糰；最大生命 −10。', art: 'codex/relic_tower_token', hooks: { energyPerTurn: 1, maxHp: -10 } },
  // ===== 2026-08-31 補 20 個。本來只有 15 個，兩三局就看完 =====
  // 原本每種觸發時機只有一個，所以每次拿到的感覺都一樣。
  // 這裡刻意讓同一種時機有多個強度／代價不同的版本，選擇才有意義。

  // --- 常見：開場就有感的小加成 ---
  { id: 'straw_hat', name: '斗笠', pool: '常見', text: '每場戰鬥開始時獲得 4 點蜷縮。', art: 'codex/relic_straw_hat', hooks: { combatStart: [{ kind: 'block', amount: 4 }] } },
  { id: 'wrist_guard', name: '護腕', pool: '常見', text: '每場戰鬥開始時獲得 1 點爪力。', art: 'codex/relic_wrist_guard', hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } },
  { id: 'soft_pad', name: '軟墊', pool: '常見', text: '每場戰鬥開始時獲得 1 點貓步。', art: 'codex/relic_soft_pad', hooks: { combatStart: [{ kind: 'status', name: '貓步', amount: 1, target: 'self' }] } },
  { id: 'dried_squid', name: '魷魚絲', pool: '常見', text: '最大生命 +6。', art: 'codex/relic_dried_squid', hooks: { maxHp: 6 } },
  { id: 'fish_bone', name: '魚骨頭', pool: '常見', text: '最大生命 +16。', art: 'codex/relic_fish_bone', hooks: { maxHp: 16 } },
  { id: 'small_cushion', name: '小坐墊', pool: '常見', text: '每場戰鬥第一回合多抽 2 張牌。', art: 'codex/relic_small_cushion', hooks: { firstTurnDraw: 2 } },
  { id: 'sardine_tin', name: '沙丁魚罐', pool: '常見', text: '打贏一場多拿 12 條小魚乾。', art: 'codex/relic_sardine_tin', hooks: { winGold: 12 } },
  { id: 'worn_scroll', name: '破卷軸', pool: '常見', text: '每場戰鬥第一張牌少花 1 顆飯糰。', art: 'codex/relic_worn_scroll', hooks: { firstCardDiscount: 1 } },
  { id: 'lucky_coin', name: '幸運錢幣', pool: '常見', text: '打贏一場多拿 20 條小魚乾。', art: 'codex/relic_lucky_coin', hooks: { winGold: 20 } },
  { id: 'warm_blanket', name: '暖毯', pool: '常見', text: '在貓窩打盹回的血變成三倍。', art: 'codex/relic_warm_blanket', hooks: { restMultiplier: 3 } },

  // --- 大魔物：打贏精英才拿得到，效果要有存在感 ---
  { id: 'iron_collar', name: '鐵項圈', pool: '大魔物', text: '每場戰鬥開始時獲得 10 點蜷縮。', art: 'codex/relic_iron_collar', hooks: { combatStart: [{ kind: 'block', amount: 10 }] } },
  { id: 'claw_sheath', name: '爪鞘', pool: '大魔物', text: '每場戰鬥開始時獲得 2 點爪力。', art: 'codex/relic_claw_sheath', hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }] } },
  { id: 'ghost_bell', name: '無聲鈴', pool: '大魔物', text: '每場戰鬥開始時獲得 2 層隱身。', art: 'codex/relic_ghost_bell', hooks: { combatStart: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }] } },
  { id: 'counting_beads', name: '算盤珠', pool: '大魔物', text: '每回合打出第 3 張牌時抽 1 張牌。', art: 'codex/relic_counting_beads', hooks: { drawOnNthCard: { n: 3, draw: 1 } } },
  { id: 'still_water', name: '止水碗', pool: '大魔物', text: '回合結束時如果這回合沒打過攻擊牌，獲得 8 點蜷縮。', art: 'codex/relic_still_water', hooks: { turnEndNoAttack: [{ kind: 'block', amount: 8 }] } },
  { id: 'nine_tails', name: '九尾墜', pool: '大魔物', text: '每回合多 1 顆飯糰。', art: 'codex/relic_nine_tails', hooks: { energyPerTurn: 1 } },

  // --- 塔主：打贏塔主才有，直接改變玩法 ---
  { id: 'shadow_cloak', name: '影披風', pool: '塔主', text: '每次獲得隱身時多 1 層。', art: 'codex/relic_shadow_cloak', hooks: { stealthBonus: 1 } },
  { id: 'last_breath', name: '最後一口氣', pool: '塔主', text: '每場戰鬥第一次會被打倒時，留下 1 點生命。', art: 'codex/relic_last_breath', hooks: { preventLethal: true } },
  { id: 'master_belt', name: '掌門腰帶', pool: '塔主', text: '最大生命 +25。', art: 'codex/relic_master_belt', hooks: { maxHp: 25 } },
  { id: 'golden_bowl', name: '金飯碗', pool: '塔主', text: '每場戰鬥第一回合多 2 顆飯糰。', art: 'codex/relic_golden_bowl', hooks: { firstTurnEnergy: 2 } },
];

export const relicById: Record<string, RelicDef> = Object.fromEntries(relics.map((r) => [r.id, r]));
