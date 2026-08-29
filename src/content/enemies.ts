import type { EncounterDef, EnemyDef, EnemyPool } from '../engine/types';

export const enemies: EnemyDef[] = [
  // ===== 弱池 =====
  { id: 'rat', name: '小老鼠兵', hp: [12, 15], pool: '弱', pattern: 'cycle', size: 'small', art: 'codex/monster_rat',
    line: '吱吱！小魚乾是我們的！',
    moves: [
      { intent: 'attack', label: '啃', effects: [{ kind: 'damage', amount: 4 }] },
      { intent: 'attack', label: '啃', effects: [{ kind: 'damage', amount: 4 }] },
      { intent: 'block', label: '躲', effects: [{ kind: 'block', amount: 5 }] },
    ] },
  { id: 'cucumber', name: '黃瓜怪', hp: [30, 34], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_cucumber',
    line: '（安靜地躺在那裡）',
    moves: [
      { intent: 'debuff', label: '嚇人', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] },
    ] },
  { id: 'onigiri_monster', name: '飯糰怪', hp: [26, 30], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_onigiri',
    line: '別吃我！', onDeathHealPlayer: 3,
    moves: [
      { intent: 'debuff', label: '黏住', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 1 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '結成飯糰', effects: [{ kind: 'block', amount: 6 }] },
    ] },
  { id: 'wood_dummy', name: '木樁人', hp: [40, 40], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_wood_dummy',
    line: '……', strengthEveryNTurns: 3,
    moves: [
      { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: 5 }] },
    ] },
  { id: 'goat', name: '迷途山羊', hp: [24, 28], pool: '弱', pattern: 'random', size: 'medium', art: 'codex/monster_goat',
    line: '咩？',
    moves: [
      { intent: 'attack', label: '衝撞', effects: [{ kind: 'damage', amount: 9 }] },
      { intent: 'buff', label: '吃草', effects: [{ kind: 'heal', n: 5 }] },
      { intent: 'idle', label: '發呆', effects: [{ kind: 'nothing' }] },
    ] },

  // ===== 中池 =====
  { id: 'vacuum', name: '吸塵器', hp: [44, 48], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_vacuum',
    line: '嗡————',
    moves: [
      { intent: 'debuff', label: '噪音', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 8 }] },
      { intent: 'special', label: '吸走', effects: [{ kind: 'discardRandomHand', n: 1 }] },
    ] },
  { id: 'black_ninja', name: '黑貓忍者', hp: [36, 40], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_black_ninja',
    line: '同行，別擋路。',
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '二連斬', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'attack', label: '手裡劍', effects: [{ kind: 'damage', amount: 9 }] },
    ] },
  { id: 'orange_bandit', name: '橘貓山賊', hp: [48, 52], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_orange_bandit',
    line: '留下買路財！',
    moves: [
      { intent: 'special', label: '搶劫', effects: [{ kind: 'stealFish', n: 10 }] },
      { intent: 'attack', label: '掄棒', effects: [{ kind: 'damage', amount: 10 }] },
      { intent: 'block', label: '擋', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'special', label: '搶劫', effects: [{ kind: 'stealFish', n: 10 }] },
      { intent: 'special', label: '逃走', effects: [{ kind: 'escape' }] },
    ] },
  { id: 'catgrass_bug', name: '貓草蟲', hp: [18, 22], pool: '中', pattern: 'cycle', size: 'small', art: 'codex/monster_catgrass_bug',
    line: '嘶——',
    moves: [
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'debuff', label: '吐', effects: [{ kind: 'statusPlayer', name: '噎到', amount: 2 }] },
    ] },

  // ===== 強池 =====
  { id: 'scarecrow', name: '稻草人守衛', hp: [55, 60], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_scarecrow',
    line: '塔主有令，閒貓勿入。',
    moves: [
      { intent: 'attack', label: '重劈', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '架起', effects: [{ kind: 'block', amount: 10 }] },
      { intent: 'buff', label: '蓄力', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
    ] },
  { id: 'black_ninja_elite', name: '黑貓忍者（老手）', hp: [36, 40], pool: '強', pattern: 'cycle', size: 'medium', art: 'codex/monster_black_ninja',
    line: '兩個打一個，不算欺負。',
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '二連斬', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'attack', label: '手裡劍', effects: [{ kind: 'damage', amount: 9 }] },
    ] },
  { id: 'big_cucumber', name: '大黃瓜怪', hp: [70, 70], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_big_cucumber',
    line: '（比較大根，還是安靜地躺著）',
    moves: [
      { intent: 'debuff', label: '嚇人', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'attack', label: '翻滾', effects: [{ kind: 'damage', amount: 6 }, { kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
    ] },

  // ===== 大魔物 =====
  { id: 'ninja_boss', name: '黑貓忍者頭目', hp: [90, 90], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_ninja_boss',
    line: '上面那位，不是你認識的那隻貓了。',
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 2 }] },
      { intent: 'summon', label: '分身', effects: [{ kind: 'summon', enemyId: 'black_kitten', n: 2 }] },
      { intent: 'attack', label: '連擊', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
      { intent: 'attack', label: '手裡劍雨', effects: [{ kind: 'damage', amount: 12 }] },
    ] },
  { id: 'giant_onigiri', name: '巨型飯糰', hp: [110, 110], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_giant_onigiri',
    line: '好、好重……', onDeathHealPlayer: 10,
    moves: [
      { intent: 'block', label: '結成飯糰', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '壓扁', effects: [{ kind: 'damage', amount: 14 }] },
      { intent: 'debuff', label: '黏住', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
    ] },

  // ===== 召喚 =====
  { id: 'black_kitten', name: '小黑貓', hp: [10, 10], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_black_kitten',
    line: '喵嗚！', moves: [{ intent: 'attack', label: '抓', effects: [{ kind: 'damage', amount: 3 }] }] },

  // ===== 塔主 =====
  { id: 'tower_master', name: '走火入魔的大俠貓', hp: [160, 160], pool: '塔主', pattern: 'cycle', size: 'large', art: 'daxia',
    line: '難逢敵手。',
    moves: [
      { intent: 'buff', label: '蓄力', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '鐵頭功', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '金鐘罩', effects: [{ kind: 'block', amount: 15 }] },
      { intent: 'attack', label: '獅吼功', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '懶洋洋', amount: 2 }] },
    ],
    phases: [{
      hpBelow: 80, line: '走火入魔', pattern: 'cycle', strengthPerTurn: 1,
      onEnter: [{ kind: 'block', amount: 20 }],
      moves: [
        { intent: 'attack', label: '醉拳', effects: [{ kind: 'damageRandom', min: 6, max: 16 }] },
        { intent: 'attack', label: '鐵砂掌', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
        { intent: 'attack', label: '鐵頭功', effects: [{ kind: 'damage', amount: 14 }] },
        { intent: 'block', label: '閉關', effects: [{ kind: 'block', amount: 18 }] },
      ],
    }] },
];

export const enemyById: Record<string, EnemyDef> = Object.fromEntries(enemies.map((e) => [e.id, e]));

export const encounters: EncounterDef[] = [
  { id: 'rats2', pool: '弱', enemies: ['rat', 'rat'] },
  { id: 'rats3', pool: '弱', enemies: ['rat', 'rat', 'rat'] },
  { id: 'cucumber', pool: '弱', enemies: ['cucumber'] },
  { id: 'onigiri_monster', pool: '弱', enemies: ['onigiri_monster'] },
  { id: 'wood_dummy', pool: '弱', enemies: ['wood_dummy'] },
  { id: 'goat', pool: '弱', enemies: ['goat'] },
  { id: 'vacuum', pool: '中', enemies: ['vacuum'] },
  { id: 'black_ninja', pool: '中', enemies: ['black_ninja'] },
  { id: 'orange_bandit', pool: '中', enemies: ['orange_bandit'] },
  { id: 'catgrass_bugs', pool: '中', enemies: ['catgrass_bug', 'catgrass_bug'] },
  { id: 'scarecrow', pool: '強', enemies: ['scarecrow'] },
  { id: 'black_ninja_duo', pool: '強', enemies: ['black_ninja_elite', 'black_ninja_elite'] },
  { id: 'big_cucumber', pool: '強', enemies: ['big_cucumber'] },
  { id: 'ninja_boss', pool: '大魔物', enemies: ['ninja_boss'] },
  { id: 'giant_onigiri', pool: '大魔物', enemies: ['giant_onigiri'] },
  { id: 'tower_master', pool: '塔主', enemies: ['tower_master'] },
];

export const encounterById: Record<string, EncounterDef> = Object.fromEntries(encounters.map((e) => [e.id, e]));

export function encountersOfPool(pool: EnemyPool): EncounterDef[] {
  return encounters.filter((e) => e.pool === pool);
}
