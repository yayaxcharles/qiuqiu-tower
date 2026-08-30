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
];

export const relicById: Record<string, RelicDef> = Object.fromEntries(relics.map((r) => [r.id, r]));
