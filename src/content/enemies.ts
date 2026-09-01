import type { EnemyMove,EncounterDef, EnemyDef, EnemyPool } from '../engine/types';

// 貓又婆婆照表出招用的兩招（chooseMove 每回合回傳同一份物件，方便畫面比對）
const NEKO_SUMMON: EnemyMove = { intent: 'summon', label: '放尾巴', effects: [{ kind: 'summon', enemyId: 'nekomata_tail', n: 2, max: 2 }] };
const NEKO_PREP: EnemyMove = { intent: 'special', label: '準備放尾巴', effects: [{ kind: 'nothing' }] };

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
  // 切磋的白貓：只有「想切磋的白貓」事件會遇到（pool 召喚＝不進隨機池）。
  // 之前偷懶借黑貓忍者當對手，事件圖跟文案都是白貓、打起來卻是黑貓（使用者抓到）。
  // 招式走堂堂正正的劍客路線：起手亮劍（蓄力）、正面重斬，跟忍者的隱身流分開。
  { id: 'white_duelist', name: '切磋的白貓', hp: [38, 42], pool: '召喚', pattern: 'cycle', size: 'medium', art: 'codex/monster_white_duelist',
    line: '打一場。全力來。',
    moves: [
      { intent: 'special', label: '亮劍', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '正面斬', effects: [{ kind: 'damage', amount: 8 }] },
      { intent: 'block', label: '架勢', effects: [{ kind: 'block', amount: 7 }] },
      { intent: 'attack', label: '突刺', effects: [{ kind: 'damage', amount: 5, times: 2 }] },
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
  // 2026-09-01 減壓：血 150→130、吸魂 12→9，配合鐵爪一起降到第一關牌組打得動的量級
  // 貓又婆婆（2026-09-01 依實玩重做）：召喚改固定節奏——第 1 回合放尾巴，之後每五回合一組
  // （4 準備、5 放；9 準備、10 放……），「準備」回合是明牌的輸出窗口。
  // 尾巴上限 2 條（補召不爆量）、8 血、**不再復活**——原本的無限復活把輸出全吃掉（機器人探測 0/60 的病根）。
  { id: 'nekomata', name: '貓又婆婆', hp: [105, 105], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_nekomata',
    line: '孩子，你走得太上面了。',
    chooseMove: (turn, moves) => {
      if (turn === 1 || turn % 5 === 0) return NEKO_SUMMON;
      if (turn % 5 === 4) return NEKO_PREP;
      return moves[turn % moves.length];
    },
    moves: [
      { intent: 'attack', label: '鬼火', effects: [{ kind: 'damage', amount: 9 }, { kind: 'statusPlayer', name: '噎到', amount: 2 }] },
      { intent: 'special', label: '吸魂', effects: [{ kind: 'heal', n: 7 }] },
      { intent: 'attack', label: '雙尾抽', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ],
    phases: [{
      hpBelow: 55, line: '（尾巴分成了好幾條）', pattern: 'cycle',
      onEnter: [{ kind: 'summon', enemyId: 'nekomata_tail', n: 2, max: 2 }, { kind: 'heal', n: 12 }],
      moves: [
        { intent: 'attack', label: '亂尾', effects: [{ kind: 'damage', amount: 4, times: 4 }] },
        { intent: 'special', label: '吸魂', effects: [{ kind: 'heal', n: 10 }] },
        { intent: 'debuff', label: '招魂', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
        { intent: 'attack', label: '鬼火', effects: [{ kind: 'damage', amount: 12 }] },
      ],
    }] },
  // 婆婆的尾巴：8 血的小隨從，打掉就沒了（2026-09-01 拿掉同生共死——
  // 無限復活讓玩家的輸出全打水漂，改成婆婆照固定節奏補召）
  { id: 'nekomata_tail', name: '貓又的尾巴', hp: [8, 8], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_nekomata_tail',
    line: '（尾巴自己動了）',
    moves: [
      { intent: 'attack', label: '抽', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'special', label: '渡氣', effects: [{ kind: 'heal', n: 4 }] },
    ] },

  // 鐵爪機關貓：**蜷縮擋不住的那種**。招招都是多段小刀，而且每兩回合自己變強。
  // 十點蜷縮對 4×4 只擋得掉前兩下，解法是隱身跟定身，不是硬擋。
  // 2026-09-01 減壓：原本三個成長來源疊加（每 2 回合+1、發條+3、二階段每回合+1），
  // 爪力疊到 +4 之後 3×6 變 7×6＝42、4×4 變 9×4＝36，第一關牌組完全扛不住（使用者實玩回報）。
  // 段數砍一級、發條 +3→+2、自動成長改每 3 回合、血 140→120。多段穿蜷縮的性格保留。
  // 2026-09-01 二刀（機器人探測 0/60 勝）：血 105、自動成長改每 4 回合、絞刃 3×3、全開 4×4、收爪 12。
  { id: 'iron_claw', name: '鐵爪機關貓', hp: [105, 105], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_iron_claw',
    line: '（齒輪轉了一圈）', strengthEveryNTurns: 4,
    moves: [
      { intent: 'attack', label: '四連爪', effects: [{ kind: 'damage', amount: 4, times: 3 }] },
      { intent: 'buff', label: '上緊發條', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '絞刃', effects: [{ kind: 'damage', amount: 3, times: 3 }] },
      { intent: 'block', label: '收爪', effects: [{ kind: 'block', amount: 12 }] },
    ],
    phases: [{
      hpBelow: 65, line: '（外殼彈開，裡面全是爪子）', pattern: 'cycle', strengthPerTurn: 1,
      onEnter: [{ kind: 'statusSelf', name: '反彈', amount: 6 }],
      moves: [
        { intent: 'attack', label: '爪暴', effects: [{ kind: 'damage', amount: 4, times: 6 }] },
        { intent: 'debuff', label: '卡住', effects: [{ kind: 'discardRandomHand', n: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 3 }] },
        { intent: 'attack', label: '全開', effects: [{ kind: 'damage', amount: 4, times: 4 }] },
      ],
    }] },
  // 第三關的最終戰（2026-09-01 重做成三階段）。他是師父：招式全是玩家牌組裡絕學的
  // 放大版，「同門過招」一看就懂。數值照 31–45F 的牌組規模抓，第一二關的關主碰不到他。
  // 第三階段的大招走「蓄力→倍擊」的明牌流程：看到蓄力就知道下一下會翻倍，
  // 解法是定身、隱身或堆大蜷縮——考的是整局學會的所有工具。
  { id: 'tower_master', name: '走火入魔的大俠貓', hp: [260, 260], pool: '塔主', pattern: 'cycle', size: 'large', art: 'daxia',
    line: '難逢敵手。',
    moves: [
      { intent: 'attack', label: '鐵頭功', effects: [{ kind: 'damage', amount: 18 }] },
      { intent: 'block', label: '金鐘罩', effects: [{ kind: 'block', amount: 22 }] },
      { intent: 'attack', label: '獅吼功', effects: [{ kind: 'damage', amount: 11 }, { kind: 'statusPlayer', name: '懶洋洋', amount: 2 }] },
      { intent: 'attack', label: '沾衣十八跌', effects: [{ kind: 'damage', amount: 6, times: 3 }] },
    ],
    phases: [{
      hpBelow: 170, line: '走火入魔', pattern: 'cycle', strengthPerTurn: 1,
      onEnter: [{ kind: 'block', amount: 24 }],
      moves: [
        { intent: 'attack', label: '醉拳', effects: [{ kind: 'damageRandom', min: 10, max: 24 }] },
        { intent: 'attack', label: '鐵砂掌', effects: [{ kind: 'damage', amount: 12 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
        { intent: 'attack', label: '十二連環', effects: [{ kind: 'damage', amount: 6, times: 4 }] },
        { intent: 'debuff', label: '破功', effects: [{ kind: 'purgePlayer', names: ['爪力', '貓步'] }] },
        { intent: 'block', label: '閉關', effects: [{ kind: 'block', amount: 26 }] },
      ],
    }, {
      hpBelow: 85, line: '深藏不露', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '爪力', amount: 3 }, { kind: 'statusSelf', name: '反彈', amount: 6 }],
      moves: [
        { intent: 'special', label: '蓄力', effects: [{ kind: 'chargeNext' }] },
        { intent: 'attack', label: '亡命一擊', effects: [{ kind: 'damage', amount: 30 }] },
        { intent: 'attack', label: '縮地連斬', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
        { intent: 'block', label: '氣沉丹田', effects: [{ kind: 'block', amount: 18 }, { kind: 'heal', n: 10 }] },
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

  // ===== 2026-09-01 三關制內容包：塔中（16–30F）＝機制組合、塔頂（31–45F）＝魔氣加成 =====
  // 立繪生圖中；資料先接好、遭遇掛 acts 標籤，圖裝進資產包前不會推上線。

  // --- 塔中魔物（中池 acts:[2]）：血 34–58、單發 7–13，比第一關強池再上一級 ---
  { id: 'shiba_ronin', name: '柴犬浪人', hp: [46, 52], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_shiba_ronin',
    line: '……借過。', moves: [
      { intent: 'buff', label: '拔刀式', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '居合斬', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'debuff', label: '挑釁', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'block', label: '收刀', effects: [{ kind: 'block', amount: 10 }] },
    ] },
  { id: 'shamisen_cat', name: '三味線貓', hp: [40, 46], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_shamisen_cat',
    line: '（調了調弦）', moves: [
      { intent: 'debuff', label: '走音', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'statusPlayer', name: '懶洋洋', amount: 1 }] },
      { intent: 'attack', label: '高音', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '噎到', amount: 2 }] },
      { intent: 'attack', label: '亂彈', effects: [{ kind: 'damage', amount: 4, times: 2 }] },
      { intent: 'block', label: '調弦', effects: [{ kind: 'block', amount: 8 }, { kind: 'heal', n: 4 }] },
    ] },
  { id: 'lantern_ghost', name: '燈籠妖', hp: [44, 50], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_lantern_ghost',
    line: '（火光晃了一下）', moves: [
      { intent: 'attack', label: '舔火', effects: [{ kind: 'damage', amount: 7 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
      { intent: 'attack', label: '吐火', effects: [{ kind: 'damage', amount: 10 }] },
      { intent: 'block', label: '燈芯補油', effects: [{ kind: 'block', amount: 6 }, { kind: 'heal', n: 8 }] },
      { intent: 'attack', label: '撲上來', effects: [{ kind: 'damage', amount: 5, times: 2 }] },
    ] },
  { id: 'windchime_sprite', name: '風鈴精', hp: [36, 42], pool: '中', pattern: 'random', size: 'small', art: 'codex/monster_windchime_sprite',
    line: '（叮——）', moves: [
      { intent: 'debuff', label: '搖鈴', effects: [{ kind: 'discardRandomHand', n: 1 }, { kind: 'damage', amount: 4 }] },
      { intent: 'attack', label: '音波', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '風護', effects: [{ kind: 'block', amount: 9 }] },
      { intent: 'attack', label: '亂風', effects: [{ kind: 'damage', amount: 3, times: 3 }] },
    ] },
  { id: 'tanuki_kid', name: '狸小弟', hp: [34, 40], pool: '中', pattern: 'random', size: 'small', art: 'codex/monster_tanuki_kid',
    line: '看我的！', moves: [
      { intent: 'buff', label: '變身戲法', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '葉子彈', effects: [{ kind: 'damage', amount: 7 }] },
      { intent: 'debuff', label: '搗蛋', effects: [{ kind: 'discardRandomHand', n: 1 }] },
      { intent: 'block', label: '裝可愛', effects: [{ kind: 'block', amount: 8 }] },
    ] },
  { id: 'geta_monster', name: '木屐怪', hp: [50, 58], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_geta_monster',
    line: '（咚、咚）', moves: [
      { intent: 'attack', label: '踩踏', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '站穩', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '絆倒', effects: [{ kind: 'damage', amount: 6 }, { kind: 'statusPlayer', name: '定身', amount: 1 }] },
      { intent: 'attack', label: '再踩', effects: [{ kind: 'damage', amount: 12 }] },
    ] },
  { id: 'ink_cat', name: '掛軸墨貓', hp: [42, 48], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_ink_cat',
    line: '（墨滴在地上開了花）', moves: [
      { intent: 'attack', label: '墨爪', effects: [{ kind: 'damage', amount: 5, times: 2 }] },
      { intent: 'debuff', label: '潑墨', effects: [{ kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      { intent: 'block', label: '隱入卷軸', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }, { kind: 'block', amount: 6 }] },
      { intent: 'attack', label: '一筆斬', effects: [{ kind: 'damage', amount: 13 }] },
    ] },

  // --- 塔頂魔物（中池 acts:[3]）：血 48–80、單發 12–17，全帶一手拿手戲 ---
  { id: 'moon_rabbit', name: '月見兔', hp: [62, 70], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_moon_rabbit',
    line: '（杵聲不緊不慢）', moves: [
      { intent: 'buff', label: '搗麻糬', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '杵擊', effects: [{ kind: 'damage', amount: 14 }] },
      { intent: 'attack', label: '麻糬黏住', effects: [{ kind: 'damage', amount: 6 }, { kind: 'statusPlayer', name: '定身', amount: 1 }] },
      { intent: 'special', label: '月光', effects: [{ kind: 'heal', n: 10 }] },
    ] },
  { id: 'owl_sentry', name: '貓頭鷹夜哨', hp: [56, 64], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_owl_sentry',
    line: '（頭轉了一整圈）', moves: [
      { intent: 'debuff', label: '夜視鎖定', effects: [{ kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      { intent: 'attack', label: '俯衝', effects: [{ kind: 'damage', amount: 9, times: 2 }] },
      { intent: 'block', label: '展翅警戒', effects: [{ kind: 'block', amount: 14 }] },
      { intent: 'attack', label: '爪擊', effects: [{ kind: 'damage', amount: 12 }] },
    ] },
  { id: 'paper_crane', name: '紙鶴式神', hp: [48, 54], pool: '中', pattern: 'cycle', size: 'small', art: 'codex/monster_paper_crane',
    line: '（摺痕發著微光）', moves: [
      { intent: 'block', label: '摺翼', effects: [{ kind: 'block', amount: 10 }, { kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '紙刃', effects: [{ kind: 'damage', amount: 5, times: 3 }] },
      { intent: 'attack', label: '折射', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
      { intent: 'attack', label: '銳襲', effects: [{ kind: 'damage', amount: 15 }] },
    ] },
  { id: 'miasma_blob', name: '魔氣凝塊', hp: [70, 80], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_miasma_blob',
    line: '（隱約有一張貓臉）', moves: [
      { intent: 'attack', label: '侵蝕', effects: [{ kind: 'damage', amount: 7 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
      { intent: 'buff', label: '膨脹', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }, { kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '魔氣浪', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'special', label: '凝聚再生', effects: [{ kind: 'heal', n: 12 }] },
    ] },
  { id: 'night_panther', name: '夜行黑豹', hp: [58, 66], pool: '中', pattern: 'cycle', size: 'large', art: 'codex/monster_night_panther',
    line: '（鈴鐺一聲都沒響）', moves: [
      { intent: 'buff', label: '潛影', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '猛撲', effects: [{ kind: 'damage', amount: 17 }] },
      { intent: 'attack', label: '撕裂', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
      { intent: 'debuff', label: '低吼', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
    ] },

  // --- 影球球（第三關鏡像精英）：招式全是玩家起手牌的影子版 ---
  { id: 'shadow_cat', name: '影球球', hp: [75, 75], pool: '大魔物', pattern: 'cycle', size: 'medium', art: 'codex/monster_shadow_cat',
    line: '（跟你擺出一樣的架式）', moves: [
      { intent: 'attack', label: '影爪抓', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '影蜷縮', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'buff', label: '影分身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '影撒手鐧', effects: [{ kind: 'damage', amount: 8, times: 2 }] },
    ] },

  // --- 新關主：橘皮大王（第一關第三選，強度對齊二刀後的 105 級距）---
  { id: 'orange_king', name: '橘皮大王', hp: [110, 110], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_orange_king',
    line: '（一邊嚼一邊看你）', moves: [
      { intent: 'attack', label: '肚皮壓', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'special', label: '打呵欠', effects: [{ kind: 'heal', n: 8 }, { kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '丟魚骨頭', effects: [{ kind: 'damage', amount: 4, times: 2 }, { kind: 'statusPlayer', name: '噎到', amount: 1 }] },
      { intent: 'attack', label: '滾來滾去', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ],
    phases: [{
      hpBelow: 55, line: '（整顆站了起來）', pattern: 'cycle',
      onEnter: [{ kind: 'block', amount: 12 }],
      moves: [
        { intent: 'special', label: '蓄力', effects: [{ kind: 'chargeNext' }] },
        { intent: 'attack', label: '泰山壓頂', effects: [{ kind: 'damage', amount: 16 }] },
        { intent: 'attack', label: '龍捲滾', effects: [{ kind: 'damage', amount: 8, times: 2 }] },
        { intent: 'special', label: '揉麵團', effects: [{ kind: 'heal', n: 10 }] },
      ],
    }] },

  // --- 第二關關主三選一 ---
  // 奶牛貓二當家：黑白換式的循環拳師，換式與運勁回合就是輸出窗口
  { id: 'cowcat_boss', name: '奶牛貓二當家', hp: [170, 170], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_cowcat_boss',
    line: '亮傢伙吧。', moves: [
      { intent: 'attack', label: '黑手重錘', effects: [{ kind: 'damage', amount: 16 }] },
      { intent: 'attack', label: '白手連打', effects: [{ kind: 'damage', amount: 6, times: 3 }] },
      { intent: 'block', label: '換式・沉腰', effects: [{ kind: 'block', amount: 16 }, { kind: 'statusSelf', name: '爪力', amount: 1 }] },
      { intent: 'attack', label: '黑白亂舞', effects: [{ kind: 'damage', amount: 9, times: 2 }] },
      { intent: 'special', label: '運勁', effects: [{ kind: 'heal', n: 10 }, { kind: 'block', amount: 8 }] },
    ],
    phases: [{
      hpBelow: 85, line: '（黑白兩色的毛全豎了起來）', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '爪力', amount: 2 }],
      moves: [
        { intent: 'attack', label: '合一連環', effects: [{ kind: 'damage', amount: 7, times: 3 }] },
        { intent: 'attack', label: '崩拳', effects: [{ kind: 'damage', amount: 20 }] },
        { intent: 'block', label: '鐵壁', effects: [{ kind: 'block', amount: 20 }] },
      ],
    }] },
  // 狸大人：出招隨機的戲法師，會叫狸小弟上場
  { id: 'tanuki_lord', name: '狸大人', hp: [160, 160], pool: '塔主', pattern: 'random', size: 'large', art: 'codex/monster_tanuki_lord',
    line: '呵呵，來得正好。', moves: [
      { intent: 'attack', label: '醉八仙', effects: [{ kind: 'damageRandom', min: 8, max: 20 }] },
      { intent: 'block', label: '葉隱', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }, { kind: 'block', amount: 10 }] },
      { intent: 'summon', label: '喚小弟', effects: [{ kind: 'summon', enemyId: 'tanuki_kid', n: 1 }] },
      { intent: 'debuff', label: '肚皮鼓', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '酒氣', effects: [{ kind: 'damage', amount: 10 }, { kind: 'statusPlayer', name: '噎到', amount: 2 }] },
    ],
    phases: [{
      hpBelow: 80, line: '（葫蘆見底了）', pattern: 'random',
      onEnter: [{ kind: 'summon', enemyId: 'tanuki_kid', n: 1 }],
      moves: [
        { intent: 'attack', label: '醉拳真髓', effects: [{ kind: 'damageRandom', min: 12, max: 24 }] },
        { intent: 'buff', label: '大變身', effects: [{ kind: 'chargeNext' }] },
        { intent: 'attack', label: '泰山鼓壓', effects: [{ kind: 'damage', amount: 15 }] },
      ],
    }] },
  // 波斯大小姐：僕從護體——執事與女僕還站著她就不受傷，先清僕從才打得到本體
  { id: 'persian_lady', name: '波斯大小姐', hp: [130, 130], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_persian_lady',
    line: '哼。', guardedByAllies: true, moves: [
      { intent: 'buff', label: '擺架子', effects: [{ kind: 'statusSelf', name: '爪力', amount: 1 }, { kind: 'block', amount: 10 }] },
      { intent: 'attack', label: '扇子拍', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'debuff', label: '尖叫', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 1 }] },
      { intent: 'special', label: '補香水', effects: [{ kind: 'heal', n: 12 }] },
    ],
    phases: [{
      hpBelow: 65, line: '你們這群沒用的東西！', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '爪力', amount: 2 }],
      moves: [
        { intent: 'attack', label: '貴族之怒', effects: [{ kind: 'damage', amount: 8, times: 2 }] },
        { intent: 'attack', label: '甩尾', effects: [{ kind: 'damage', amount: 14 }] },
        { intent: 'debuff', label: '歇斯底里', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      ],
    }] },
  { id: 'butler_cat', name: '執事貓', hp: [34, 34], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_butler_cat',
    line: '（扶了扶單眼鏡）', moves: [
      { intent: 'attack', label: '拋托盤', effects: [{ kind: 'damage', amount: 9 }] },
      { intent: 'block', label: '布陣', effects: [{ kind: 'block', amount: 10 }] },
      { intent: 'special', label: '奉茶', effects: [{ kind: 'heal', n: 8 }] },
    ] },
  { id: 'maid_cat', name: '女僕貓', hp: [30, 30], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_maid_cat',
    line: '（緊緊抱著雞毛撢）', moves: [
      { intent: 'attack', label: '雞毛撢亂揮', effects: [{ kind: 'damage', amount: 4, times: 2 }] },
      { intent: 'block', label: '撢塵護主', effects: [{ kind: 'block', amount: 9 }] },
      { intent: 'debuff', label: '大掃除', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 1 }, { kind: 'damage', amount: 3 }] },
    ] },
];

/**
 * 塔主每一招的專屬立繪，鍵就是招式名。
 * **加新招一定要一起加這裡**，否則畫面會靜靜退回待機圖、看不出來少了什麼——
 * `tests/ui/cardtext.test.ts` 有一條會擋住這種漏配。
 */
export const BOSS_MOVE_ART: Record<string, string> = {
  蓄力: 'boss/charge', 鐵頭功: 'boss/headbutt', 金鐘罩: 'boss/guard', 獅吼功: 'boss/roar',
  醉拳: 'boss/drunk', 閉關: 'boss/seclude', 鐵砂掌: 'boss/palm',
  // 三階段重做（2026-09-01）加的招，先共用最接近的現有立繪
  沾衣十八跌: 'boss/palm', 十二連環: 'boss/palm', 亡命一擊: 'boss/headbutt', 破功: 'boss/palm',
  縮地連斬: 'boss/drunk', 氣沉丹田: 'boss/seclude',
};
/** 塔主的三張非招式立繪：第一階段待機（深藏不露）、第二階段待機（走火入魔）、戰敗（承讓） */
export const BOSS_ART = { idle1: 'boss/idle1', idle2: 'boss/idle2', defeat: 'boss/defeat' } as const;

export const enemyById: Record<string, EnemyDef> = Object.fromEntries(enemies.map((e) => [e.id, e]));

export const encounters: EncounterDef[] = [
  { id: 'rats2', pool: '弱', enemies: ['rat', 'rat'], acts: [1] },
  { id: 'rats3', pool: '弱', enemies: ['rat', 'rat', 'rat'], acts: [1] },
  { id: 'cucumber', pool: '弱', enemies: ['cucumber'], acts: [1] },
  { id: 'onigiri_monster', pool: '弱', enemies: ['onigiri_monster'], acts: [1] },
  { id: 'wood_dummy', pool: '弱', enemies: ['wood_dummy'], acts: [1] },
  { id: 'goat', pool: '弱', enemies: ['goat'], acts: [1] },
  { id: 'vacuum', pool: '中', enemies: ['vacuum'], acts: [1] },
  { id: 'black_ninja', pool: '中', enemies: ['black_ninja'], acts: [1] },
  { id: 'white_duelist', pool: '召喚', enemies: ['white_duelist'] },
  { id: 'orange_bandit', pool: '中', enemies: ['orange_bandit'], acts: [1] },
  { id: 'catgrass_bugs', pool: '中', enemies: ['catgrass_bug', 'catgrass_bug'], acts: [1] },
  { id: 'scarecrow', pool: '強', enemies: ['scarecrow'], acts: [1] },
  { id: 'black_ninja_duo', pool: '強', enemies: ['black_ninja_elite', 'black_ninja_elite'], hpScale: 0.8, acts: [1] },
  { id: 'big_cucumber', pool: '強', enemies: ['big_cucumber'], acts: [1] },
  { id: 'ninja_boss', pool: '大魔物', enemies: ['ninja_boss'] },
  { id: 'giant_onigiri', pool: '大魔物', enemies: ['giant_onigiri'] },
  { id: 'tower_master', pool: '塔主', enemies: ['tower_master'] },
  // ===== 三關制內容包（2026-09-01）：塔中/塔頂專屬池；雙怪照慣例 0.8 血 =====
  { id: 'shiba_ronin', pool: '中', enemies: ['shiba_ronin'], acts: [2] },
  { id: 'shamisen_cat', pool: '中', enemies: ['shamisen_cat'], acts: [2] },
  { id: 'lantern_ghost', pool: '中', enemies: ['lantern_ghost'], acts: [2] },
  { id: 'windchime_sprite', pool: '中', enemies: ['windchime_sprite'], acts: [2] },
  { id: 'tanuki_kid', pool: '中', enemies: ['tanuki_kid'], acts: [2] },
  { id: 'geta_monster', pool: '中', enemies: ['geta_monster'], acts: [2] },
  { id: 'ink_cat', pool: '中', enemies: ['ink_cat'], acts: [2] },
  { id: 'ronin_duo', pool: '強', enemies: ['shiba_ronin', 'shamisen_cat'], hpScale: 0.8, acts: [2] },
  { id: 'lantern_pair', pool: '強', enemies: ['lantern_ghost', 'windchime_sprite'], hpScale: 0.8, acts: [2] },
  // ink_cat＋geta_monster 探測 7/40 是殺手組（隱身＋雙 12 重踩疊在一起），拆開改配三味線
  { id: 'ink_shami', pool: '強', enemies: ['ink_cat', 'shamisen_cat'], hpScale: 0.8, acts: [2] },
  { id: 'tanuki_gang', pool: '強', enemies: ['tanuki_kid', 'tanuki_kid', 'tanuki_kid'], hpScale: 0.9, acts: [2] },   // 兩隻探測 40/40 太軟，改三兄弟 0.9
  { id: 'moon_rabbit', pool: '中', enemies: ['moon_rabbit'], acts: [3] },
  { id: 'owl_sentry', pool: '中', enemies: ['owl_sentry'], acts: [3] },
  { id: 'paper_crane', pool: '中', enemies: ['paper_crane'], acts: [3] },
  { id: 'night_panther', pool: '中', enemies: ['night_panther'], acts: [3] },
  { id: 'miasma_blob', pool: '強', enemies: ['miasma_blob'], acts: [3] },
  { id: 'crane_pair', pool: '強', enemies: ['paper_crane', 'paper_crane'], hpScale: 0.75, acts: [3] },
  // 塔頂雙怪組的教訓（探測 1～6/40）：血量倍率救不了「兩隻重砲同回合疊擊」，
  // 要拆組合——重砲一定配有守勢回合的（紙鶴會摺翼、墨貓會入卷軸那型）。
  // 貓頭鷹＋月兔那組直接砍掉，牠們照樣在中池單獨出場。
  { id: 'night_hunt', pool: '強', enemies: ['night_panther', 'paper_crane'], hpScale: 0.75, acts: [3] },
  { id: 'shadow_cat', pool: '大魔物', enemies: ['shadow_cat'], acts: [3] },
  { id: 'orange_king', pool: '塔主', enemies: ['orange_king'] },
  { id: 'cowcat_boss', pool: '塔主', enemies: ['cowcat_boss'] },
  { id: 'tanuki_lord', pool: '塔主', enemies: ['tanuki_lord'] },
  { id: 'persian_lady', pool: '塔主', enemies: ['butler_cat', 'persian_lady', 'maid_cat'] },
  { id: 'nekomata', pool: '塔主', enemies: ['nekomata'] },
  { id: 'iron_claw', pool: '塔主', enemies: ['iron_claw'] },

  // ===== 2026-08-31 補：中後段本來只有 4＋3 組，一直重複同一場仗 =====
  // 新怪
  { id: 'yarn_ball', pool: '弱', enemies: ['yarn_ball'], acts: [1] },
  { id: 'soy_bottle', pool: '弱', enemies: ['soy_bottle', 'soy_bottle'], acts: [1] },
  { id: 'box_lurker', pool: '弱', enemies: ['box_lurker'], acts: [1] },
  { id: 'hedgehog', pool: '中', enemies: ['hedgehog'], acts: [1] },
  { id: 'can_spirit', pool: '中', enemies: ['can_spirit'], acts: [1] },
  { id: 'five_claw', pool: '中', enemies: ['five_claw'], acts: [1] },
  { id: 'dozing_tabby', pool: '中', enemies: ['dozing_tabby'], acts: [1] },
  { id: 'chipmunks', pool: '中', enemies: ['chipmunk', 'chipmunk'], acts: [1] },
  { id: 'mirror_cat', pool: '強', enemies: ['mirror_cat'], acts: [1] },
  { id: 'broom_centipede', pool: '強', enemies: ['broom_centipede'], acts: [1] },
  { id: 'stone_lion', pool: '強', enemies: ['stone_lion'], acts: [1] },
  { id: 'catnip_phantom', pool: '強', enemies: ['catnip_phantom'], acts: [1] },
  { id: 'roomba_king', pool: '大魔物', enemies: ['roomba_king'] },
  { id: 'calico_monk', pool: '大魔物', enemies: ['calico_monk'] },
  // 混編：用既有的怪兩兩配對，不用新美術就能立刻多出變化。
  // 配對原則是「兩隻的路數要互補」，逼玩家取捨先打哪一隻。
  { id: 'rat_soy', pool: '弱', enemies: ['rat', 'soy_bottle'], acts: [1] },
  { id: 'cucumber_yarn', pool: '弱', enemies: ['cucumber', 'yarn_ball'], acts: [1] },
  { id: 'bug_hedgehog', pool: '中', enemies: ['catgrass_bug', 'hedgehog'], acts: [1] },
  // 這兩組是「兩隻全規格中型怪同場」（合計 82～90 血），實測 6F 的典型牌組
  // 對它們勝率只有 2%／7%、其他中型遭遇都是 92% 起——放錯池了，移到強池（11F+）
  { id: 'ninja_can', pool: '強', enemies: ['black_ninja', 'can_spirit'], hpScale: 0.8, acts: [1] },
  { id: 'vacuum_claw', pool: '強', enemies: ['vacuum', 'five_claw'], hpScale: 0.8, acts: [1] },
  { id: 'bandit_chipmunk', pool: '中', enemies: ['orange_bandit', 'chipmunk'], acts: [1] },
  { id: 'lion_mirror', pool: '強', enemies: ['stone_lion', 'mirror_cat'], hpScale: 0.8, acts: [1] },
  { id: 'centipede_mirror', pool: '強', enemies: ['broom_centipede', 'mirror_cat'], hpScale: 0.8, acts: [1] },
  { id: 'shadow_kittens', pool: '強', enemies: ['shadow_kitten_a', 'shadow_kitten_b', 'shadow_kitten_c'], hpScale: 0.8, acts: [1] },
  { id: 'training_post', pool: '中', enemies: ['training_post'], acts: [1] },
  { id: 'phantom_ninja', pool: '強', enemies: ['catnip_phantom', 'black_ninja_elite'], hpScale: 0.8, acts: [1] },
];

export const encounterById: Record<string, EncounterDef> = Object.fromEntries(encounters.map((e) => [e.id, e]));

export function encountersOfPool(pool: EnemyPool, act?: number): EncounterDef[] {
  return encounters.filter((e) => e.pool === pool && (act === undefined || !e.acts || e.acts.includes(act)));
}
