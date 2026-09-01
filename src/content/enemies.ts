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
  // ===== 2026-08-31 補的兩個塔主。原本只有大俠貓，每局結局都一樣 =====

  // 貓又婆婆：**磨不死的那種**。自己會回血，還會放出兩條會互相復活的尾巴。
  // 尾巴同組（`reviveGroup: 'tail'`），只清掉一條沒用，要同一回合兩條一起清。
  // 解法是爆發與清場，慢慢磨只會被她回滿。
  { id: 'nekomata', name: '貓又婆婆', hp: [150, 150], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_nekomata',
    line: '孩子，你走得太上面了。',
    moves: [
      { intent: 'summon', label: '放尾巴', effects: [{ kind: 'summon', enemyId: 'nekomata_tail', n: 2 }] },
      { intent: 'attack', label: '鬼火', effects: [{ kind: 'damage', amount: 10 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
      { intent: 'special', label: '吸魂', effects: [{ kind: 'heal', n: 12 }] },
      { intent: 'attack', label: '雙尾抽', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
    ],
    phases: [{
      hpBelow: 70, line: '（尾巴分成了好幾條）', pattern: 'cycle',
      onEnter: [{ kind: 'summon', enemyId: 'nekomata_tail', n: 2 }, { kind: 'heal', n: 20 }],
      moves: [
        { intent: 'attack', label: '亂尾', effects: [{ kind: 'damage', amount: 5, times: 4 }] },
        { intent: 'special', label: '吸魂', effects: [{ kind: 'heal', n: 15 }] },
        { intent: 'debuff', label: '招魂', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 3 }, { kind: 'statusPlayer', name: '翻肚', amount: 3 }] },
        { intent: 'attack', label: '鬼火', effects: [{ kind: 'damage', amount: 14 }] },
      ],
    }] },
  // 婆婆的尾巴：兩條同組，只要還有一條站著，倒下的那條下回合就爬起來
  { id: 'nekomata_tail', name: '貓又的尾巴', hp: [18, 18], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_nekomata_tail',
    line: '（尾巴自己動了）', reviveGroup: 'tail', reviveHp: 6,
    moves: [
      { intent: 'attack', label: '抽', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'special', label: '渡氣', effects: [{ kind: 'heal', n: 6 }] },
    ] },

  // 鐵爪機關貓：**蜷縮擋不住的那種**。招招都是多段小刀，而且每兩回合自己變強。
  // 十點蜷縮對 4×4 只擋得掉前兩下，解法是隱身跟定身，不是硬擋。
  { id: 'iron_claw', name: '鐵爪機關貓', hp: [140, 140], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_iron_claw',
    line: '（齒輪轉了一圈）', strengthEveryNTurns: 2,
    moves: [
      { intent: 'attack', label: '四連爪', effects: [{ kind: 'damage', amount: 4, times: 4 }] },
      { intent: 'buff', label: '上緊發條', effects: [{ kind: 'statusSelf', name: '爪力', amount: 3 }] },
      { intent: 'attack', label: '絞刃', effects: [{ kind: 'damage', amount: 3, times: 6 }] },
      { intent: 'block', label: '收爪', effects: [{ kind: 'block', amount: 16 }] },
    ],
    phases: [{
      hpBelow: 65, line: '（外殼彈開，裡面全是爪子）', pattern: 'cycle', strengthPerTurn: 1,
      onEnter: [{ kind: 'statusSelf', name: '反彈', amount: 6 }],
      moves: [
        { intent: 'attack', label: '爪暴', effects: [{ kind: 'damage', amount: 4, times: 6 }] },
        { intent: 'debuff', label: '卡住', effects: [{ kind: 'discardRandomHand', n: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 3 }] },
        { intent: 'attack', label: '全開', effects: [{ kind: 'damage', amount: 5, times: 5 }] },
      ],
    }] },
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
  // ===== 2026-08-31 補的 14 隻：中後段一直重複同一場仗，而且性質偏食 =====

  // --- 弱（1～5 樓）---
  // 定身型：現有的怪沒人用「定身」。被纏住的那回合打不出攻擊牌，逼你改用技能過渡
  { id: 'yarn_ball', name: '毛線球怪', hp: [20, 24], pool: '弱', pattern: 'random', size: 'small', art: 'codex/monster_yarn_ball',
    line: '（滾過來滾過去）',
    moves: [
      { intent: 'debuff', label: '纏住', effects: [{ kind: 'statusPlayer', name: '定身', amount: 1 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'attack', label: '滾', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '縮成球', effects: [{ kind: 'block', amount: 6 }] },
    ] },
  // 純下毒的入門版：血少但一直疊噎到，教玩家認識「毒要趁早清」
  { id: 'soy_bottle', name: '打翻的醬油瓶', hp: [16, 20], pool: '弱', pattern: 'cycle', size: 'small', art: 'codex/monster_soy_bottle',
    line: '（咕嘟咕嘟地流出來）',
    moves: [
      { intent: 'debuff', label: '滴', effects: [{ kind: 'statusPlayer', name: '噎到', amount: 2 }] },
      { intent: 'attack', label: '潑', effects: [{ kind: 'damage', amount: 4 }, { kind: 'statusPlayer', name: '噎到', amount: 1 }] },
      { intent: 'debuff', label: '滴', effects: [{ kind: 'statusPlayer', name: '噎到', amount: 2 }] },
    ] },
  // 蓄力的入門版：躲兩回合再來一記重的，教玩家看意圖決定要擋還是要打
  { id: 'box_lurker', name: '紙箱怪', hp: [28, 32], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_box_lurker',
    line: '（箱子裡有東西在動）',
    moves: [
      { intent: 'block', label: '躲進箱子', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'special', label: '探頭', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '暴衝', effects: [{ kind: 'damage', amount: 9 }] },
    ] },

  // --- 中（約 6～10 樓）---
  // **反擊型**：身上永遠有反彈，你砍它自己也會痛。逼你改用技能牌或先清掉反彈
  { id: 'hedgehog', name: '刺蝟師傅', hp: [34, 38], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_hedgehog',
    line: '來啊，看誰比較痛。',
    moves: [
      { intent: 'buff', label: '豎刺', effects: [{ kind: 'statusSelf', name: '反彈', amount: 4 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 8 }] },
      { intent: 'block', label: '縮起來', effects: [{ kind: 'block', amount: 10 }, { kind: 'statusSelf', name: '反彈', amount: 2 }] },
      { intent: 'attack', label: '刺', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ] },
  // **回血坦**：每回合回 7，打不夠快就永遠磨不死。逼玩家組出爆發
  { id: 'can_spirit', name: '貓罐頭精', hp: [46, 50], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_can_spirit',
    line: '（罐頭又滿了）',
    moves: [
      { intent: 'special', label: '補滿', effects: [{ kind: 'heal', n: 7 }] },
      { intent: 'attack', label: '砸', effects: [{ kind: 'damage', amount: 9 }] },
      { intent: 'special', label: '補滿', effects: [{ kind: 'heal', n: 7 }] },
      { intent: 'attack', label: '罐頭蓋', effects: [{ kind: 'damage', amount: 12 }] },
    ] },
  // **多段小刀**：一次五下、每下 3。蜷縮 10 點只擋得掉前三下，跟大招型的攻防完全相反
  { id: 'five_claw', name: '五爪貓', hp: [30, 34], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_five_claw',
    line: '一二三四五，數得清嗎？',
    moves: [
      { intent: 'attack', label: '五連爪', effects: [{ kind: 'damage', amount: 3, times: 5 }] },
      { intent: 'buff', label: '磨爪', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '三連爪', effects: [{ kind: 'damage', amount: 3, times: 3 }] },
    ] },
  // 極端蓄力：睡兩回合，第三回合一記 22。看到「打呵欠」就知道該疊蜷縮了
  { id: 'dozing_tabby', name: '打盹的虎斑', hp: [40, 44], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_dozing_tabby',
    line: '（睡得很熟）',
    moves: [
      { intent: 'idle', label: '睡', effects: [{ kind: 'nothing' }] },
      { intent: 'special', label: '打呵欠', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '翻身壓', effects: [{ kind: 'damage', amount: 11 }] },
    ] },
  // 群體＋偷錢：兩隻一起出，一邊偷小魚乾一邊叫同伴
  { id: 'chipmunk', name: '花栗鼠', hp: [14, 18], pool: '中', pattern: 'random', size: 'small', art: 'codex/monster_chipmunk',
    line: '這個我先收著！',
    moves: [
      { intent: 'attack', label: '搶', effects: [{ kind: 'damage', amount: 4 }, { kind: 'stealFish', n: 8 }] },
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'summon', label: '叫同伴', effects: [{ kind: 'summon', enemyId: 'chipmunk_small', n: 1 }] },
    ] },
  { id: 'chipmunk_small', name: '小花栗鼠', hp: [10, 10], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_chipmunk',
    line: '我也要！',
    moves: [
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 4 }] },
    ] },

  // --- 強（約 11～14 樓）---
  // **削弱你＋強化自己**：一邊給你懶洋洋一邊自己疊爪力，拖越久差距越大
  { id: 'mirror_cat', name: '鏡子貓', hp: [50, 54], pool: '強', pattern: 'cycle', size: 'medium', art: 'codex/monster_mirror_cat',
    line: '你看得到自己嗎？',
    moves: [
      { intent: 'debuff', label: '照鏡子', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }] },
      { intent: 'buff', label: '學起來', effects: [{ kind: 'statusSelf', name: '爪力', amount: 3 }] },
      { intent: 'attack', label: '一模一樣', effects: [{ kind: 'damage', amount: 10 }] },
      { intent: 'attack', label: '反照', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
    ] },
  // 多段＋干擾：六下小刀外加丟你手牌，最難處理的組合
  { id: 'broom_centipede', name: '掃把蜈蚣', hp: [44, 48], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_broom_centipede',
    line: '（一節一節地爬過來）',
    moves: [
      { intent: 'attack', label: '掃', effects: [{ kind: 'damage', amount: 2, times: 6 }] },
      { intent: 'debuff', label: '揚塵', effects: [{ kind: 'discardRandomHand', n: 1 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '橫掃', effects: [{ kind: 'damage', amount: 3, times: 4 }] },
      { intent: 'block', label: '捲起來', effects: [{ kind: 'block', amount: 12 }] },
    ] },
  // **普通怪也會變身**：血過半就從純防守翻臉成暴走，`phases` 本來只有塔主在用
  { id: 'stone_lion', name: '石獅子', hp: [62, 66], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_stone_lion',
    line: '（一動也不動）',
    moves: [
      { intent: 'block', label: '鎮守', effects: [{ kind: 'block', amount: 14 }] },
      { intent: 'attack', label: '石掌', effects: [{ kind: 'damage', amount: 9 }] },
      { intent: 'block', label: '鎮守', effects: [{ kind: 'block', amount: 14 }] },
    ],
    phases: [{
      hpBelow: 32, line: '（裂開了）', pattern: 'cycle', strengthPerTurn: 1,
      onEnter: [{ kind: 'statusSelf', name: '爪力', amount: 3 }],
      moves: [
        { intent: 'attack', label: '碎石', effects: [{ kind: 'damage', amount: 8, times: 2 }] },
        { intent: 'attack', label: '獅吼', effects: [{ kind: 'damage', amount: 11 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      ],
    }] },
  // 純隨機高風險：每一手都可能是 5 也可能是 18，逼你留餘裕
  { id: 'catnip_phantom', name: '貓薄荷幻影', hp: [46, 50], pool: '強', pattern: 'random', size: 'medium', art: 'codex/monster_catnip_phantom',
    line: '（味道有點怪）',
    moves: [
      { intent: 'attack', label: '幻擊', effects: [{ kind: 'damageRandom', min: 5, max: 18 }] },
      { intent: 'debuff', label: '迷幻', effects: [{ kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      { intent: 'buff', label: '朦朧', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '亂舞', effects: [{ kind: 'damageRandom', min: 4, max: 14 }] },
    ] },

  // 「一起死才算數」的三隻。單獨打倒沒有用——只要還有同伴站著，
  // 倒下的那隻下個回合就會爬起來（回到 8 血）。要在同一回合內把三隻一起清光。
  // 血量刻意壓低（22～26），因為真正的難點是「湊出一回合三殺」，不是耐打。
  { id: 'shadow_kitten_a', name: '影子小貓·壹', hp: [22, 26], pool: '強', pattern: 'cycle', size: 'small', art: 'codex/monster_shadow_kitten',
    line: '（三個影子連在一起——只要還有一個站著，倒下的就會爬回來）', reviveGroup: 'shadow', reviveHp: 8, reviveDelay: 2,
    moves: [
      { intent: 'attack', label: '影抓', effects: [{ kind: 'damage', amount: 7 }] },
      { intent: 'buff', label: '交疊', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
    ] },
  { id: 'shadow_kitten_b', name: '影子小貓·貳', hp: [22, 26], pool: '強', pattern: 'cycle', size: 'small', art: 'codex/monster_shadow_kitten',
    line: '（另一個也動了）', reviveGroup: 'shadow', reviveHp: 8, reviveDelay: 2,
    moves: [
      { intent: 'debuff', label: '掩影', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '影抓', effects: [{ kind: 'damage', amount: 7 }] },
    ] },
  { id: 'shadow_kitten_c', name: '影子小貓·參', hp: [22, 26], pool: '強', pattern: 'cycle', size: 'small', art: 'codex/monster_shadow_kitten',
    line: '（第三個一直沒動）', reviveGroup: 'shadow', reviveHp: 8, reviveDelay: 2,
    moves: [
      { intent: 'block', label: '疊影', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '影抓', effects: [{ kind: 'damage', amount: 7 }] },
    ] },
  // 「每隔兩回合自己變強」：引擎本來就有 strengthEveryNTurns，但只有木樁人在用（每 3 回合）。
  // 這隻每 2 回合加一次，拖越久越危險，逼你速戰速決
  { id: 'training_post', name: '練功樁', hp: [52, 56], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_training_post',
    line: '（越打越硬）', strengthEveryNTurns: 2,
    moves: [
      { intent: 'attack', label: '反擊', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '穩住', effects: [{ kind: 'block', amount: 9 }] },
      { intent: 'attack', label: '重擊', effects: [{ kind: 'damage', amount: 8 }] },
    ] },

  // --- 大魔物 ---
  // 召喚＋干擾＋多段，三種麻煩一次來
  { id: 'roomba_king', name: '掃地機器人王', hp: [95, 95], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_roomba_king',
    line: '偵測到灰塵。清除。',
    moves: [
      { intent: 'summon', label: '放出小掃把', effects: [{ kind: 'summon', enemyId: 'mini_broom', n: 2 }] },
      { intent: 'attack', label: '滾刷', effects: [{ kind: 'damage', amount: 4, times: 4 }] },
      { intent: 'debuff', label: '吸走', effects: [{ kind: 'discardRandomHand', n: 2 }] },
      { intent: 'attack', label: '全力清潔', effects: [{ kind: 'damage', amount: 16 }] },
    ] },
  { id: 'mini_broom', name: '小掃把', hp: [8, 8], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_mini_broom',
    line: '（刷刷刷）',
    moves: [
      { intent: 'attack', label: '刷', effects: [{ kind: 'damage', amount: 3 }] },
    ] },
  // 反彈＋回血＋變身：把三個最煩的性質疊在一起當大魔物
  { id: 'calico_monk', name: '三花貓武僧', hp: [100, 100], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_calico_monk',
    line: '出手之前，先想清楚。',
    moves: [
      { intent: 'buff', label: '運氣', effects: [{ kind: 'statusSelf', name: '反彈', amount: 5 }] },
      { intent: 'attack', label: '掌', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'special', label: '調息', effects: [{ kind: 'heal', n: 10 }] },
      { intent: 'attack', label: '連環掌', effects: [{ kind: 'damage', amount: 6, times: 3 }] },
    ],
    phases: [{
      hpBelow: 45, line: '（睜開眼）', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '反彈', amount: 8 }, { kind: 'block', amount: 15 }],
      moves: [
        { intent: 'attack', label: '怒掌', effects: [{ kind: 'damage', amount: 9, times: 2 }] },
        { intent: 'debuff', label: '喝', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      ],
    }] },
];

/**
 * 塔主每一招的專屬立繪，鍵就是招式名。
 * **加新招一定要一起加這裡**，否則畫面會靜靜退回待機圖、看不出來少了什麼——
 * `tests/ui/cardtext.test.ts` 有一條會擋住這種漏配。
 */
export const BOSS_MOVE_ART: Record<string, string> = {
  蓄力: 'boss/charge', 鐵頭功: 'boss/headbutt', 金鐘罩: 'boss/guard', 獅吼功: 'boss/roar',
  醉拳: 'boss/drunk', 閉關: 'boss/seclude', 鐵砂掌: 'boss/palm',
};
/** 塔主的三張非招式立繪：第一階段待機（深藏不露）、第二階段待機（走火入魔）、戰敗（承讓） */
export const BOSS_ART = { idle1: 'boss/idle1', idle2: 'boss/idle2', defeat: 'boss/defeat' } as const;

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
  { id: 'nekomata', pool: '塔主', enemies: ['nekomata'] },
  { id: 'iron_claw', pool: '塔主', enemies: ['iron_claw'] },

  // ===== 2026-08-31 補：中後段本來只有 4＋3 組，一直重複同一場仗 =====
  // 新怪
  { id: 'yarn_ball', pool: '弱', enemies: ['yarn_ball'] },
  { id: 'soy_bottle', pool: '弱', enemies: ['soy_bottle', 'soy_bottle'] },
  { id: 'box_lurker', pool: '弱', enemies: ['box_lurker'] },
  { id: 'hedgehog', pool: '中', enemies: ['hedgehog'] },
  { id: 'can_spirit', pool: '中', enemies: ['can_spirit'] },
  { id: 'five_claw', pool: '中', enemies: ['five_claw'] },
  { id: 'dozing_tabby', pool: '中', enemies: ['dozing_tabby'] },
  { id: 'chipmunks', pool: '中', enemies: ['chipmunk', 'chipmunk'] },
  { id: 'mirror_cat', pool: '強', enemies: ['mirror_cat'] },
  { id: 'broom_centipede', pool: '強', enemies: ['broom_centipede'] },
  { id: 'stone_lion', pool: '強', enemies: ['stone_lion'] },
  { id: 'catnip_phantom', pool: '強', enemies: ['catnip_phantom'] },
  { id: 'roomba_king', pool: '大魔物', enemies: ['roomba_king'] },
  { id: 'calico_monk', pool: '大魔物', enemies: ['calico_monk'] },
  // 混編：用既有的怪兩兩配對，不用新美術就能立刻多出變化。
  // 配對原則是「兩隻的路數要互補」，逼玩家取捨先打哪一隻。
  { id: 'rat_soy', pool: '弱', enemies: ['rat', 'soy_bottle'] },
  { id: 'cucumber_yarn', pool: '弱', enemies: ['cucumber', 'yarn_ball'] },
  { id: 'bug_hedgehog', pool: '中', enemies: ['catgrass_bug', 'hedgehog'] },
  { id: 'ninja_can', pool: '中', enemies: ['black_ninja', 'can_spirit'] },
  { id: 'vacuum_claw', pool: '中', enemies: ['vacuum', 'five_claw'] },
  { id: 'bandit_chipmunk', pool: '中', enemies: ['orange_bandit', 'chipmunk'] },
  { id: 'lion_mirror', pool: '強', enemies: ['stone_lion', 'mirror_cat'] },
  { id: 'centipede_mirror', pool: '強', enemies: ['broom_centipede', 'mirror_cat'] },
  { id: 'shadow_kittens', pool: '強', enemies: ['shadow_kitten_a', 'shadow_kitten_b', 'shadow_kitten_c'] },
  { id: 'training_post', pool: '中', enemies: ['training_post'] },
  { id: 'phantom_ninja', pool: '強', enemies: ['catnip_phantom', 'black_ninja_elite'] },
];

export const encounterById: Record<string, EncounterDef> = Object.fromEntries(encounters.map((e) => [e.id, e]));

export function encountersOfPool(pool: EnemyPool): EncounterDef[] {
  return encounters.filter((e) => e.pool === pool);
}
