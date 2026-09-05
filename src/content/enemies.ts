import type { EnemyMove,EncounterDef, EnemyDef, EnemyPool } from '../engine/types';

// 貓又婆婆照表出招用的兩招（chooseMove 每回合回傳同一份物件，方便畫面比對）
// 尾巴最多四條（畫面塞得下五個單位）；已經四條時再放＝把血量接到現有尾巴上（使用者 2026-09-02）
// 尾巴同時最多四條，滿了就把血灌給現有的（使用者 2026-09-03：四條可以，問題是換階段時尾巴「憑空」冒出來——見 phases.onEnterMove）
const NEKO_SUMMON: EnemyMove = { intent: 'summon', label: '放尾巴', effects: [{ kind: 'summon', enemyId: 'nekomata_tail', n: 2, max: 4 }] };
const NEKO_PREP: EnemyMove = { intent: 'special', label: '準備放尾巴', effects: [{ kind: 'nothing' }] };
// 波斯大小姐每十回合（第 9、19、29…次出招）把倒下的執事貓、女僕貓叫回來；兩個都還站著就什麼都不做——使用者 2026-09-04：「增加打她的難度」
// 三花貓武僧的破式（2026-09-04 使用者：「加上幾回合會破我方隱身一半的機制」）：
// 每三回合插一次，把球球囤好的隱身與潛水各砍一半（向下取整），順手一掌。
// 走既有的 `purgePlayer`（減半）而不是 `stripPlayer`（整個拍掉），隱身流仍有得玩、只是不能無腦囤。
const MONK_BREAK: EnemyMove = { intent: 'debuff', label: '破式', effects: [{ kind: 'purgePlayer', names: ['隱身', '潛水'] }, { kind: 'damage', amount: 10 }] };
const PERSIAN_CALL: EnemyMove = { intent: 'summon', label: '喚僕從', effects: [{ kind: 'summon', enemyId: 'butler_cat', n: 1, max: 1, noPour: true }, { kind: 'summon', enemyId: 'maid_cat', n: 1, max: 1, noPour: true }] };   // noPour：僕從還站著就什麼都不做，不套「滿了灌血」通則（稽核 2026-09-04 中 5：會每十回合把僕從最大生命疊上去）

export const enemies: EnemyDef[] = [
  // ===== 弱池 =====
  { id: 'rat', name: '小老鼠兵', hp: [12, 15], pool: '弱', pattern: 'cycle', size: 'small', art: 'codex/monster_rat',
    line: '吱吱！小魚乾是我們的！', lines: ['吱吱！這裡是我們的地盤！', '吱！有貓！大家上！'],
    moves: [
      { intent: 'attack', label: '啃', effects: [{ kind: 'damage', amount: 4 }] },
      { intent: 'attack', label: '啃', effects: [{ kind: 'damage', amount: 4 }] },
      { intent: 'block', label: '躲', effects: [{ kind: 'block', amount: 5 }] },
    ] },
  { id: 'cucumber', name: '黃瓜怪', hp: [30, 34], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_cucumber',
    line: '（安靜地躺在那裡）', lines: ['（動也不動，綠得發亮）', '（好像只是一根黃瓜）'],
    moves: [
      { intent: 'debuff', label: '嚇人', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] },
    ] },
  { id: 'onigiri_monster', name: '飯糰怪', hp: [26, 30], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_onigiri',
    line: '別吃我！', lines: ['我不好吃！真的！', '海苔是我的鎧甲！'], onDeathHealPlayer: 3,
    moves: [
      { intent: 'debuff', label: '黏住', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 1 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '結成飯糰', effects: [{ kind: 'block', amount: 6 }] },
    ] },
  { id: 'wood_dummy', name: '木樁人', hp: [40, 40], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_wood_dummy',
    line: '……', lines: ['（木頭味）', '（被打過很多次的樣子）'], strengthEveryNTurns: 3,
    moves: [
      { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: 5 }] },
    ] },
  { id: 'goat', name: '迷途山羊', hp: [24, 28], pool: '弱', pattern: 'random', size: 'medium', art: 'codex/monster_goat',
    line: '咩？', lines: ['咩……這裡是哪裡？', '咩！別過來！'],
    moves: [
      { intent: 'attack', label: '衝撞', effects: [{ kind: 'damage', amount: 9 }] },
      { intent: 'buff', label: '吃草', effects: [{ kind: 'heal', n: 5 }] },
      { intent: 'idle', label: '發呆', effects: [{ kind: 'nothing' }] },
    ] },

  // ===== 中池 =====
  { id: 'vacuum', name: '吸塵器', hp: [44, 48], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_vacuum',
    line: '嗡————', lines: ['嗚嗡——嗡——', '（把地上的毛全吸走了）'],
    moves: [
      { intent: 'debuff', label: '噪音', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 8 }] },
      { intent: 'special', label: '吸走', effects: [{ kind: 'discardRandomHand', n: 1 }] },
    ] },
  { id: 'black_ninja', name: '黑貓忍者', hp: [36, 40], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_black_ninja',
    line: '同行，別擋路。', lines: ['這條路不好走，同行。', '別逼我出手。'],
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '二連斬', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'attack', label: '手裡劍', effects: [{ kind: 'damage', amount: 9 }] },
    ] },
  // 切磋的白貓：只有「想切磋的白貓」事件會遇到（pool 召喚＝不進隨機池）。
  // 之前偷懶借黑貓忍者當對手，事件圖跟文案都是白貓、打起來卻是黑貓（使用者抓到）。
  // 招式走堂堂正正的劍客路線：起手亮劍（蓄力）、正面重斬，跟忍者的隱身流分開。
  // 2026-09-04 使用者：「白貓超弱、血少攻低技能爛」→ 血量與招式全面加重，並帶一個陪練的同伴
  { id: 'white_duelist', name: '切磋的白貓', hp: [66, 72], pool: '召喚', pattern: 'cycle', size: 'medium', art: 'codex/monster_white_duelist',
    line: '打一場。全力來。', lines: ['點到為止？不，全力。', '讓我看看你的爪子。'],
    moves: [
      { intent: 'special', label: '亮劍', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '正面斬', effects: [{ kind: 'damage', amount: 13 }] },
      { intent: 'block', label: '架勢', effects: [{ kind: 'block', amount: 10 }] },
      { intent: 'attack', label: '突刺', effects: [{ kind: 'damage', amount: 8, times: 2 }] },
      { intent: 'buff', label: '凝神', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
    ] },
  // 白貓的陪練同伴（借黑貓忍者的立繪；牠是真的黑貓，不是拿黑貓冒充白貓）
  { id: 'sparring_partner', name: '陪練的黑貓', hp: [34, 38], pool: '召喚', pattern: 'cycle', size: 'medium', art: 'codex/monster_black_ninja',
    line: '（站在白貓旁邊，抱著手）', lines: ['師姐說全力，那就全力。', '（把手裏劍在指間轉了一圈）'],
    moves: [
      { intent: 'attack', label: '飛鏢', effects: [{ kind: 'damage', amount: 7 }] },
      { intent: 'debuff', label: '撒沙', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '側踢', effects: [{ kind: 'damage', amount: 5, times: 2 }] },
    ] },
  { id: 'orange_bandit', name: '橘貓山賊', hp: [48, 52], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_orange_bandit',
    line: '留下買路財！', lines: ['小魚乾全部拿出來！', '此路是我開！'],
    moves: [
      { intent: 'special', label: '搶劫', effects: [{ kind: 'stealFish', n: 10 }] },
      { intent: 'attack', label: '掄棒', effects: [{ kind: 'damage', amount: 10 }] },
      { intent: 'block', label: '擋', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'special', label: '搶劫', effects: [{ kind: 'stealFish', n: 10 }] },
      { intent: 'special', label: '逃走', effects: [{ kind: 'escape' }] },
    ] },
  { id: 'catgrass_bug', name: '貓草蟲', hp: [18, 22], pool: '中', pattern: 'cycle', size: 'small', art: 'codex/monster_catgrass_bug',
    line: '嘶——', lines: ['嘶嘶——', '（在草叢裡蠕動）'],
    moves: [
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'debuff', label: '吐', effects: [{ kind: 'statusPlayer', name: '噎到', amount: 2 }] },
    ] },

  // ===== 強池 =====
  { id: 'scarecrow', name: '稻草人守衛', hp: [55, 60], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_scarecrow',
    line: '塔主有令，閒貓勿入。', lines: ['止步。塔主不見客。', '（稻草沙沙作響）閒貓勿入。'],
    moves: [
      { intent: 'attack', label: '重劈', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '架起', effects: [{ kind: 'block', amount: 10 }] },
      { intent: 'buff', label: '蓄力', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
    ] },
  { id: 'black_ninja_elite', name: '黑貓忍者（老手）', hp: [36, 40], pool: '強', pattern: 'cycle', size: 'medium', art: 'codex/monster_black_ninja',
    line: '兩個打一個，不算欺負。', lines: ['菜鳥，回去。', '我們兩個，你先挑一個。'],
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '二連斬', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'attack', label: '手裡劍', effects: [{ kind: 'damage', amount: 9 }] },
    ] },
  { id: 'big_cucumber', name: '大黃瓜怪', hp: [70, 70], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_big_cucumber',
    line: '（比較大根，還是安靜地躺著）', lines: ['（真的很大一根）', '（安靜得可怕）'],
    moves: [
      { intent: 'debuff', label: '嚇人', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'attack', label: '翻滾', effects: [{ kind: 'damage', amount: 6 }, { kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
    ] },

  // ===== 大魔物 =====
  { id: 'ninja_boss', name: '黑貓忍者頭目', hp: [115, 115], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_ninja_boss',
    line: '上面那位，不是你認識的那隻貓了。', lines: ['走到這裡，算你有點本事。', '上面的東西，不是你能碰的。'],
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 2 }, { kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'summon', label: '分身', effects: [{ kind: 'summon', enemyId: 'black_kitten', n: 2 }, { kind: 'damage', amount: 8 }] },
      { intent: 'attack', label: '連擊', effects: [{ kind: 'damage', amount: 11, times: 2 }] },
      { intent: 'attack', label: '手裡劍雨', effects: [{ kind: 'damage', amount: 20 }] },
    ] },
  { id: 'giant_onigiri', name: '巨型飯糰', hp: [125, 125], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_giant_onigiri',
    line: '好、好重……', lines: ['好、好擠……', '別、別把我壓扁……'], onDeathHealPlayer: 10,
    moves: [
      { intent: 'block', label: '結成飯糰', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '壓扁', effects: [{ kind: 'damage', amount: 17 }] },
      { intent: 'debuff', label: '黏住', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
    ] },

  // ===== 召喚 =====
  { id: 'black_kitten', name: '小黑貓', hp: [10, 10], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_black_kitten',
    line: '喵嗚！', lines: ['喵！', '（瞪著你）'], moves: [{ intent: 'attack', label: '抓', effects: [{ kind: 'damage', amount: 3 }] }] },

  // ===== 塔主 =====
  // ===== 2026-08-31 補的兩個塔主。原本只有大俠貓，每局結局都一樣 =====

  // 貓又婆婆：**磨不死的那種**。自己會回血，還會放出兩條會互相復活的尾巴。
  // 尾巴不復活（2026-09-01 拿掉同生共死）、同時最多四條，滿了就把血灌給現有的（見檔頭 NEKO_SUMMON）。
  // 解法是爆發與清場，慢慢磨只會被她回滿。
  // 2026-09-01 減壓：血 150→130、吸魂 12→9，配合鐵爪一起降到第一關牌組打得動的量級
  // 貓又婆婆（2026-09-01 依實玩重做）：召喚改固定節奏——第 1 回合放尾巴，之後每五回合一組
  // （4 準備、5 放；9 準備、10 放……），「準備」回合是明牌的輸出窗口。
  // 尾巴 8 血、**不再復活**——原本的無限復活把輸出全吃掉（機器人探測 0/60 的病根）；上限四條由 NEKO_SUMMON 的 max 決定。
  { id: 'nekomata', name: '貓又婆婆', hp: [158, 158], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_nekomata', strengthEveryNTurns: 2,   // 2026-09-03 第三輪
    plating: 4,   // 老貓皮：每回合長防禦（2026-09-03 關主加硬 7；下一輪平衡 2026-09-05 削回 4、血 175→158：機器人 35%→44%）
    line: '孩子，你走得太上面了。', lines: ['孩子，回頭還來得及。', '上面的路，婆婆不放行。'],
    chooseMove: (turn, moves) => {
      if (turn === 1 || turn % 5 === 0) return NEKO_SUMMON;
      if (turn % 5 === 4) return NEKO_PREP;
      return moves[turn % moves.length];
    },
    moves: [
      { intent: 'attack', label: '鬼火', effects: [{ kind: 'damage', amount: 14 }, { kind: 'statusPlayer', name: '噎到', amount: 2 }] },   // 12→14：換階段召喚改成先預告後，機器人勝率 48%→58%，補回（2026-09-04）
      { intent: 'special', label: '吸魂', effects: [{ kind: 'heal', n: 7 }] },
      { intent: 'attack', label: '雙尾抽', effects: [{ kind: 'damage', amount: 9, times: 3 }] },   // 10×2→9×3（同上）
    ],
    phases: [{
      hpBelow: 55, line: '（尾巴分成了好幾條）', pattern: 'cycle',
      // 換階段當下只回血加爪力；尾巴改成下一招（onEnterMove）放——原本寫在這裡會在玩家回合中途憑空多兩條，看起來像 bug（使用者 2026-09-03）
      onEnter: [{ kind: 'heal', n: 12 }, { kind: 'statusSelf', name: '爪力', amount: 2 }],
      onEnterMove: NEKO_SUMMON,
      moves: [
        { intent: 'attack', label: '亂尾', effects: [{ kind: 'damage', amount: 4, times: 4 }] },
        { intent: 'special', label: '吸魂', effects: [{ kind: 'heal', n: 10 }] },
        { intent: 'debuff', label: '招魂', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
        { intent: 'attack', label: '鬼火', effects: [{ kind: 'damage', amount: 14 }] },
      ],
    }] },
  // 婆婆的尾巴：8 血的小隨從，打掉就沒了（2026-09-01 拿掉同生共死——
  // 無限復活讓玩家的輸出全打水漂，改成婆婆照固定節奏補召）
  { id: 'nekomata_tail', name: '貓又的尾巴', hp: [8, 8], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_nekomata_tail',
    line: '（尾巴自己動了）', lines: ['（尾巴甩了一下）', '（尾巴自己纏了起來）'],
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
  // 之後幾輪加硬到 125；下一輪平衡 2026-09-05 五隻關主血 −10% → 113（機器人 47%→57%，是五隻裡最軟的，下輪順手看）。
  { id: 'iron_claw', name: '鐵爪機關貓', hp: [113, 113], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_iron_claw',
    strengthEveryNTurns: 3,   // 機關越轉越快（2026-09-03 關主加硬）
    line: '（齒輪轉了一圈）', lines: ['（發出喀噠喀噠的聲音）', '（眼睛亮起紅光）'],
    moves: [
      { intent: 'attack', label: '四連爪', effects: [{ kind: 'damage', amount: 4, times: 3 }] },
      { intent: 'buff', label: '上緊發條', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '絞刃', effects: [{ kind: 'damage', amount: 3, times: 3 }] },
      { intent: 'block', label: '收爪', effects: [{ kind: 'block', amount: 12 }] },
    ],
    phases: [{
      hpBelow: 55, line: '（外殼彈開，裡面全是爪子）', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '反彈', amount: 1 }],   // 反彈 2026-09-02 才真的生效：關主只給 1（機器人實測 2 就從 17% 敗變 37% 敗）
      moves: [
        { intent: 'attack', label: '爪暴', effects: [{ kind: 'damage', amount: 4, times: 5 }] },
        { intent: 'debuff', label: '卡住', effects: [{ kind: 'discardRandomHand', n: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 3 }] },
        { intent: 'attack', label: '全開', effects: [{ kind: 'damage', amount: 4, times: 3 }] },
      ],
    }] },
  // 第三關的最終戰。他是師父：招式全是玩家牌組裡絕學的放大版，「同門過招」一看就懂。
  // 2026-09-01 重做成三條血；2026-09-02 使用者實打回報「太弱」，機器人也 94% 勝——改成 2.0：
  //   ・血 120／240／300（總 660，原 550）
  //   ・兩個新機制，都走明牌：**穿透**（穿心掌、亡命一擊：蜷縮擋不住，只有隱身、定身、無敵接得住）、
  //     **看破**（拆招、破功、看破：把先囤好的隱身／潛水拍掉一半——2026-09-03 使用者：整個拍掉太強）
  //   ・第三條血固定節奏：蓄力→亡命一擊（穿透兩段，蓄力後 30×2）→狂風連掌→看破→氣沉丹田（回 20）→再來一輪，
  //     每回合 +3 爪力。解法是「看到蓄力就備兩層隱身或定身」，不再是「金鐘罩一張擋完」。
  // 師父 3.0（使用者 2026-09-02：「三個階段沒有看出差異」）：
  // 不蓄力；第一條血招招攻擊帶防禦；第二條血傷害明顯拉高、段數很多，每回合先震散你 1 點爪力、1 點貓步；
  // 第三條血除了氣沉丹田都是大傷害配清狀態，每回合震散 2 點爪力、2 點貓步——爪力、貓步堆不到無限。
  // 三階段各有自己的立繪（BOSS_MOVE_ART_PHASE），畫面另外套紅／紫光暈。
  { id: 'tower_master', name: '走火入魔的大俠貓', hp: [120, 120], pool: '塔主', pattern: 'cycle', size: 'large', art: 'daxia',
    line: '難逢敵手。',
    moves: [
      { intent: 'attack', label: '鐵頭功', effects: [{ kind: 'damage', amount: 16 }, { kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '拆招', effects: [{ kind: 'stripPlayer', names: ['隱身', '潛水'] }, { kind: 'damage', amount: 8, times: 2 }, { kind: 'block', amount: 6 }] },
      { intent: 'attack', label: '金鐘罩', effects: [{ kind: 'block', amount: 18 }, { kind: 'damage', amount: 8 }] },
      { intent: 'attack', label: '獅吼功', effects: [{ kind: 'damage', amount: 12 }, { kind: 'statusPlayer', name: '懶洋洋', amount: 1 }, { kind: 'block', amount: 6 }] },
      { intent: 'attack', label: '沾衣十八跌', effects: [{ kind: 'damage', amount: 6, times: 3 }, { kind: 'block', amount: 6 }] },
    ],
    phases: [{
      hpBar: 240, line: '走火入魔', pattern: 'cycle', strengthPerTurn: 1, drainPlayerPerTurn: { 爪力: 1, 貓步: 1 },
      onEnter: [{ kind: 'block', amount: 20 }],
      moves: [
        { intent: 'attack', label: '十二連環', effects: [{ kind: 'damage', amount: 7, times: 6 }, { kind: 'block', amount: 6 }] },   // 2026-09-02 使用者：第二階段段數降一點（7→6、4→3）
        { intent: 'attack', label: '穿心掌', effects: [{ kind: 'damage', amount: 20, pierce: true }, { kind: 'block', amount: 10 }] },
        { intent: 'attack', label: '狂風連掌', effects: [{ kind: 'damage', amount: 12, times: 3 }] },
        { intent: 'attack', label: '金鐘罩', effects: [{ kind: 'block', amount: 24 }, { kind: 'damage', amount: 10 }] },
        { intent: 'attack', label: '醉拳', effects: [{ kind: 'damageRandom', min: 14, max: 30 }, { kind: 'block', amount: 8 }] },
      ],
    }, {
      hpBar: 300, line: '深藏不露', pattern: 'cycle', strengthPerTurn: 2, drainPlayerPerTurn: { 爪力: 2, 貓步: 2 },   // 使用者 2026-09-03 晚：師父不放軟，維持第三條血每回合 +2、震散 2／2
      onEnter: [{ kind: 'statusSelf', name: '爪力', amount: 2 }],   // 第三條血本來還有反彈 6：反彈生效後配上震散太狠（機器人 97% 敗），拿掉，只留爪力
      moves: [
        { intent: 'attack', label: '亡命一擊', effects: [{ kind: 'damage', amount: 26, times: 2, pierce: true }] },
        { intent: 'attack', label: '破功', effects: [{ kind: 'purgePlayer', names: ['爪力', '貓步'] }, { kind: 'stripPlayer', names: ['隱身', '潛水'] }, { kind: 'damage', amount: 14 }] },
        { intent: 'attack', label: '狂風連掌', effects: [{ kind: 'damage', amount: 10, times: 7 }] },
        { intent: 'attack', label: '氣沉丹田', effects: [{ kind: 'block', amount: 28 }, { kind: 'heal', n: 15 }, { kind: 'damage', amount: 8 }] },
        { intent: 'attack', label: '看破', effects: [{ kind: 'stripPlayer', names: ['隱身', '潛水'] }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'damage', amount: 12, times: 2 }] },
      ],
    }] },
  // ===== 2026-08-31 補的 14 隻：中後段一直重複同一場仗，而且性質偏食 =====

  // --- 弱（1～5 樓）---
  // 定身型：現有的怪沒人用「定身」。被纏住的那回合打不出攻擊牌，逼你改用技能過渡
  { id: 'yarn_ball', name: '毛線球怪', hp: [20, 24], pool: '弱', pattern: 'random', size: 'small', art: 'codex/monster_yarn_ball',
    line: '（滾過來滾過去）', lines: ['（越滾越大）', '（線頭飄來飄去）'],
    moves: [
      { intent: 'debuff', label: '纏住', effects: [{ kind: 'statusPlayer', name: '定身', amount: 1 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'attack', label: '滾', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '縮成球', effects: [{ kind: 'block', amount: 6 }] },
    ] },
  // 純下毒的入門版：血少但一直疊噎到，教玩家認識「毒要趁早清」
  { id: 'soy_bottle', name: '打翻的醬油瓶', hp: [16, 20], pool: '弱', pattern: 'cycle', size: 'small', art: 'codex/monster_soy_bottle',
    line: '（咕嘟咕嘟地流出來）', lines: ['（地上一灘黑）', '（味道很鹹）'],
    moves: [
      { intent: 'debuff', label: '滴', effects: [{ kind: 'statusPlayer', name: '噎到', amount: 2 }] },
      { intent: 'attack', label: '潑', effects: [{ kind: 'damage', amount: 4 }, { kind: 'statusPlayer', name: '噎到', amount: 1 }] },
      { intent: 'debuff', label: '滴', effects: [{ kind: 'statusPlayer', name: '噎到', amount: 2 }] },
    ] },
  // 蓄力的入門版：躲兩回合再來一記重的，教玩家看意圖決定要擋還是要打
  { id: 'box_lurker', name: '紙箱怪', hp: [28, 32], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_box_lurker',
    line: '（箱子裡有東西在動）', lines: ['（箱子動了一下）', '（裡面有喘氣聲）'],
    moves: [
      { intent: 'block', label: '躲進箱子', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'special', label: '探頭', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '暴衝', effects: [{ kind: 'damage', amount: 9 }] },
    ] },

  // --- 中（約 6～10 樓）---
  // **反擊型**：身上永遠有反彈，你砍它自己也會痛。逼你改用技能牌或先清掉反彈
  { id: 'hedgehog', name: '刺蝟師傅', hp: [34, 38], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_hedgehog',
    line: '來啊，看誰比較痛。', lines: ['抱我啊，來啊。', '刺不是裝飾。'],
    moves: [
      { intent: 'buff', label: '豎刺', effects: [{ kind: 'statusSelf', name: '反彈', amount: 1 }] },   // 第一關的反彈 1 就夠痛（實測 2 讓整關掉血多一成五）
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 8 }] },
      { intent: 'block', label: '縮起來', effects: [{ kind: 'block', amount: 10 }, { kind: 'statusSelf', name: '反彈', amount: 1 }] },
      { intent: 'attack', label: '刺', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ] },
  // **回血坦**：每回合回 7，打不夠快就永遠磨不死。逼玩家組出爆發
  { id: 'can_spirit', name: '貓罐頭精', hp: [46, 50], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_can_spirit',
    line: '（罐頭又滿了）', lines: ['（蓋子一開一合）', '（永遠吃不完的樣子）'],
    moves: [
      { intent: 'special', label: '補滿', effects: [{ kind: 'heal', n: 7 }] },
      { intent: 'attack', label: '砸', effects: [{ kind: 'damage', amount: 9 }] },
      { intent: 'special', label: '補滿', effects: [{ kind: 'heal', n: 7 }] },
      { intent: 'attack', label: '罐頭蓋', effects: [{ kind: 'damage', amount: 12 }] },
    ] },
  // **多段小刀**：一次五下、每下 3。蜷縮 10 點只擋得掉前三下，跟大招型的攻防完全相反
  { id: 'five_claw', name: '五爪貓', hp: [30, 34], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_five_claw',
    line: '一二三四五，數得清嗎？', lines: ['多一隻爪子，多一分痛。', '來數數看啊。'],
    moves: [
      { intent: 'attack', label: '五連爪', effects: [{ kind: 'damage', amount: 3, times: 5 }] },
      { intent: 'buff', label: '磨爪', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '三連爪', effects: [{ kind: 'damage', amount: 3, times: 3 }] },
    ] },
  // 極端蓄力：睡兩回合，第三回合一記 22。看到「打呵欠」就知道該疊蜷縮了
  { id: 'dozing_tabby', name: '打盹的虎斑', hp: [40, 44], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_dozing_tabby',
    line: '（睡得很熟）', lines: ['（翻了個身）', '呼……別吵……'],
    moves: [
      { intent: 'idle', label: '睡', effects: [{ kind: 'nothing' }] },
      { intent: 'special', label: '打呵欠', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '翻身壓', effects: [{ kind: 'damage', amount: 11 }] },
    ] },
  // 群體＋偷錢：兩隻一起出，一邊偷小魚乾一邊叫同伴
  { id: 'chipmunk', name: '花栗鼠', hp: [14, 18], pool: '中', pattern: 'random', size: 'small', art: 'codex/monster_chipmunk',
    line: '這個我先收著！', lines: ['這是我撿到的！', '嘴巴裡的不算！'],
    moves: [
      { intent: 'attack', label: '搶', effects: [{ kind: 'damage', amount: 4 }, { kind: 'stealFish', n: 8 }] },
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'summon', label: '叫同伴', effects: [{ kind: 'summon', enemyId: 'chipmunk_small', n: 1 }] },
    ] },
  { id: 'chipmunk_small', name: '小花栗鼠', hp: [10, 10], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_chipmunk',
    line: '我也要！', lines: ['分我一點！', '我先！我先！'],
    moves: [
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 4 }] },
    ] },

  // --- 強（約 11～14 樓）---
  // **削弱你＋強化自己**：一邊給你懶洋洋一邊自己疊爪力，拖越久差距越大
  { id: 'mirror_cat', name: '鏡子貓', hp: [50, 54], pool: '強', pattern: 'cycle', size: 'medium', art: 'codex/monster_mirror_cat',
    line: '你看得到自己嗎？', lines: ['（做了跟你一樣的動作）', '你是誰？我是誰？'],
    moves: [
      { intent: 'debuff', label: '照鏡子', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }] },
      { intent: 'buff', label: '學起來', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '一模一樣', effects: [{ kind: 'damage', amount: 10 }] },
      { intent: 'attack', label: '反照', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
    ] },
  // 多段＋干擾：六下小刀外加丟你手牌，最難處理的組合
  { id: 'broom_centipede', name: '掃把蜈蚣', hp: [44, 48], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_broom_centipede',
    line: '（一節一節地爬過來）', lines: ['（掃帚毛一根根豎起）', '（唰、唰、唰）'],
    moves: [
      { intent: 'attack', label: '掃', effects: [{ kind: 'damage', amount: 2, times: 6 }] },
      { intent: 'debuff', label: '揚塵', effects: [{ kind: 'discardRandomHand', n: 1 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '橫掃', effects: [{ kind: 'damage', amount: 3, times: 4 }] },
      { intent: 'block', label: '捲起來', effects: [{ kind: 'block', amount: 12 }] },
    ] },
  // **普通怪也會變身**：血過半就從純防守翻臉成暴走，`phases` 本來只有塔主在用
  { id: 'stone_lion', name: '石獅子', hp: [62, 66], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_stone_lion',
    line: '（一動也不動）', lines: ['（眼睛是石頭的）', '（沉重的一步）'],
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
    line: '（味道有點怪）', lines: ['（一陣香味飄過來）', '（看起來很好吃）'],
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
    line: '（三個影子連在一起——只要還有一個站著，倒下的就會爬回來）', lines: ['（影子拉長了）', '（跟另外兩個對看了一眼）'], reviveGroup: 'shadow', reviveHp: 8, reviveDelay: 2,
    moves: [
      { intent: 'attack', label: '影抓', effects: [{ kind: 'damage', amount: 7 }] },
      { intent: 'buff', label: '交疊', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
    ] },
  { id: 'shadow_kitten_b', name: '影子小貓·貳', hp: [22, 26], pool: '強', pattern: 'cycle', size: 'small', art: 'codex/monster_shadow_kitten',
    line: '（另一個也動了）', lines: ['（跟著動）', '（不分先後）'], reviveGroup: 'shadow', reviveHp: 8, reviveDelay: 2,
    moves: [
      { intent: 'debuff', label: '掩影', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '影抓', effects: [{ kind: 'damage', amount: 7 }] },
    ] },
  { id: 'shadow_kitten_c', name: '影子小貓·參', hp: [22, 26], pool: '強', pattern: 'cycle', size: 'small', art: 'codex/monster_shadow_kitten',
    line: '（第三個一直沒動）', lines: ['（最後才動）', '（盯著你的腳）'], reviveGroup: 'shadow', reviveHp: 8, reviveDelay: 2,
    moves: [
      { intent: 'block', label: '疊影', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '影抓', effects: [{ kind: 'damage', amount: 7 }] },
    ] },
  // 「每隔兩回合自己變強」：引擎本來就有 strengthEveryNTurns，但只有木樁人在用（每 3 回合）。
  // 這隻每 2 回合加一次，拖越久越危險，逼你速戰速決
  { id: 'training_post', name: '練功樁', hp: [52, 56], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_training_post',
    line: '（越打越硬）', lines: ['（木頭發出悶響）', '（被打得越來越紮實）'], strengthEveryNTurns: 2,
    moves: [
      { intent: 'attack', label: '反擊', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '穩住', effects: [{ kind: 'block', amount: 9 }] },
      { intent: 'attack', label: '重擊', effects: [{ kind: 'damage', amount: 8 }] },
    ] },

  // --- 大魔物 ---
  // 召喚＋干擾＋多段，三種麻煩一次來
  { id: 'roomba_king', name: '掃地機器人王', hp: [110, 110], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_roomba_king',
    line: '偵測到灰塵。清除。', lines: ['偵測到障礙物。排除。', '電量充足。清掃開始。'],
    moves: [
      { intent: 'summon', label: '放出小掃把', effects: [{ kind: 'summon', enemyId: 'mini_broom', n: 2 }] },
      { intent: 'attack', label: '滾刷', effects: [{ kind: 'damage', amount: 5, times: 4 }] },
      { intent: 'debuff', label: '吸走', effects: [{ kind: 'discardRandomHand', n: 2 }] },
      { intent: 'attack', label: '全力清潔', effects: [{ kind: 'damage', amount: 19 }] },
    ] },
  { id: 'mini_broom', name: '小掃把', hp: [8, 8], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_mini_broom',
    line: '（刷刷刷）', lines: ['（刷刷）', '（掃來掃去）'],
    moves: [
      { intent: 'attack', label: '刷', effects: [{ kind: 'damage', amount: 3 }] },
    ] },
  // 反彈＋回血＋變身：把三個最煩的性質疊在一起當大魔物
  { id: 'calico_monk', name: '三花貓武僧', hp: [125, 125], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_calico_monk',
    chooseMove: (turn) => (turn % 3 === 0 ? MONK_BREAK : undefined),   // 每三回合破式一次，其餘照表輪招
    line: '出手之前，先想清楚。', lines: ['心浮氣躁，練不成的。', '（合掌）請。'],
    moves: [
      { intent: 'buff', label: '運氣', effects: [{ kind: 'statusSelf', name: '反彈', amount: 2 }, { kind: 'statusSelf', name: '爪力', amount: 1 }] },
      { intent: 'attack', label: '掌', effects: [{ kind: 'damage', amount: 17 }] },
      { intent: 'special', label: '調息', effects: [{ kind: 'heal', n: 8 }] },
      { intent: 'attack', label: '連環掌', effects: [{ kind: 'damage', amount: 9, times: 3 }] },
    ],
    phases: [{
      hpBelow: 45, line: '（睜開眼）', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '反彈', amount: 2 }, { kind: 'block', amount: 15 }],
      moves: [
        { intent: 'attack', label: '怒掌', effects: [{ kind: 'damage', amount: 9, times: 2 }] },
        { intent: 'debuff', label: '喝', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      ],
    }] },

  // ===== 2026-09-01 三關制內容包：塔中（16–30F）＝機制組合、塔頂（31–45F）＝魔氣加成 =====
  // 立繪生圖中；資料先接好、遭遇掛 acts 標籤，圖裝進資產包前不會推上線。

  // --- 塔中魔物（中池 acts:[2]）：血 34–58、單發 7–13，比第一關強池再上一級 ---
  { id: 'shiba_ronin', name: '柴犬浪人', hp: [58, 64], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_shiba_ronin',
    line: '……借過。', lines: ['……讓一下。', '不想打，但也不會躲。'], moves: [
      { intent: 'buff', label: '拔刀式', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '居合斬', effects: [{ kind: 'damage', amount: 14 }] },
      { intent: 'debuff', label: '挑釁', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'block', label: '收刀', effects: [{ kind: 'block', amount: 12 }] },
    ] },
  { id: 'shamisen_cat', name: '三味線貓', hp: [52, 58], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_shamisen_cat',
    line: '（調了調弦）', lines: ['（撥了一聲弦）', '聽完再走。'], moves: [
      { intent: 'debuff', label: '走音', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'statusPlayer', name: '懶洋洋', amount: 1 }, { kind: 'damage', amount: 6 }] },
      { intent: 'attack', label: '高音', effects: [{ kind: 'damage', amount: 12 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
      { intent: 'attack', label: '亂彈', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
      { intent: 'block', label: '調弦', effects: [{ kind: 'block', amount: 8 }, { kind: 'heal', n: 4 }] },
    ] },
  { id: 'lantern_ghost', name: '燈籠妖', hp: [56, 62], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_lantern_ghost',
    line: '（火光晃了一下）', lines: ['（舌頭伸得老長）', '（燈裡的火噗一聲變大）'], moves: [
      { intent: 'attack', label: '舔火', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
      { intent: 'attack', label: '吐火', effects: [{ kind: 'damage', amount: 13 }] },
      { intent: 'block', label: '燈芯補油', effects: [{ kind: 'block', amount: 6 }, { kind: 'heal', n: 8 }] },
      { intent: 'attack', label: '撲上來', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ] },
  { id: 'windchime_sprite', name: '風鈴精', hp: [46, 52], pool: '中', pattern: 'random', size: 'small', art: 'codex/monster_windchime_sprite',
    line: '（叮——）', lines: ['（叮鈴、叮鈴）', '（風不知道從哪裡來的）'], moves: [
      { intent: 'debuff', label: '搖鈴', effects: [{ kind: 'discardRandomHand', n: 1 }, { kind: 'damage', amount: 8 }] },
      { intent: 'attack', label: '音波', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'block', label: '風護', effects: [{ kind: 'block', amount: 9 }, { kind: 'damage', amount: 4 }] },
      { intent: 'attack', label: '亂風', effects: [{ kind: 'damage', amount: 5, times: 3 }] },
    ] },
  { id: 'tanuki_kid', name: '狸小弟', hp: [42, 48], pool: '中', pattern: 'random', size: 'small', art: 'codex/monster_tanuki_kid',
    line: '看我的！', lines: ['我可是會變身的！', '不准笑我！'], moves: [
      { intent: 'buff', label: '變身戲法', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '葉子彈', effects: [{ kind: 'damage', amount: 13 }] },
      { intent: 'debuff', label: '搗蛋', effects: [{ kind: 'discardRandomHand', n: 1 }, { kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '裝可愛', effects: [{ kind: 'block', amount: 8 }, { kind: 'damage', amount: 5 }] },
    ] },
  { id: 'geta_monster', name: '木屐怪', hp: [62, 70], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_geta_monster',
    line: '（咚、咚）', lines: ['（咚咚、咚咚）', '（另一隻不知道去哪了）'], moves: [
      { intent: 'attack', label: '踩踏', effects: [{ kind: 'damage', amount: 14 }] },
      { intent: 'block', label: '站穩', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '絆倒', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '定身', amount: 1 }] },
      { intent: 'attack', label: '再踩', effects: [{ kind: 'damage', amount: 14 }] },
    ] },
  { id: 'ink_cat', name: '掛軸墨貓', hp: [54, 60], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_ink_cat', thorns: 2,   // 2026-09-03 升塔頂：墨汁濺人
    line: '（墨滴在地上開了花）', lines: ['（從卷軸裡滑了出來）', '（墨還沒乾）'], moves: [
      { intent: 'attack', label: '墨爪', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'debuff', label: '潑墨', effects: [{ kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      { intent: 'block', label: '隱入卷軸', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }, { kind: 'block', amount: 6 }] },
      { intent: 'attack', label: '一筆斬', effects: [{ kind: 'damage', amount: 16 }] },
    ] },

  // --- 2026-09-02 補怪（塔中）：單怪池只有 7 隻，連續兩場常常同一隻（使用者回報）。
  // 每隻帶一個既有塔中怪沒有的路數：唐傘＝閃避＋連段、河童＝回血＋搶小魚乾、豆腐小僧＝噎到（毒）---
  { id: 'kasa_obake', name: '唐傘小僧', hp: [52, 58], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_kasa_obake',
    line: '（單腳跳了兩下，舌頭甩來甩去）', lines: ['（傘骨喀啦喀啦）', '（單腳站著，居然很穩）'], moves: [
      { intent: 'block', label: '撐傘', effects: [{ kind: 'block', amount: 8 }, { kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '旋傘', effects: [{ kind: 'damage', amount: 5, times: 3 }] },
      { intent: 'attack', label: '單腳跳踢', effects: [{ kind: 'damage', amount: 13 }] },
      { intent: 'attack', label: '舌頭一舔', effects: [{ kind: 'damage', amount: 6 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
    ] },
  { id: 'kappa', name: '河童', hp: [66, 74], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_kappa',
    line: '（頭頂的水晃了晃，盯著你的小魚乾）', lines: ['（用力擦了擦頭頂的盤子）', '小魚乾……交出來……'], moves: [
      { intent: 'attack', label: '相撲推', effects: [{ kind: 'damage', amount: 13 }] },
      { intent: 'special', label: '頂皿蓄水', effects: [{ kind: 'block', amount: 10 }, { kind: 'heal', n: 10 }] },
      { intent: 'attack', label: '拽走小魚乾', effects: [{ kind: 'damage', amount: 7 }, { kind: 'stealFish', n: 20 }] },
      { intent: 'attack', label: '甲羅撞', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ] },
  { id: 'tofu_boy', name: '豆腐小僧', hp: [40, 46], pool: '中', pattern: 'random', size: 'small', art: 'codex/monster_tofu_boy',
    line: '請、請吃豆腐……', lines: ['不、不吃也沒關係……', '（把托盤舉得高高的）'], moves: [
      { intent: 'debuff', label: '請吃豆腐', effects: [{ kind: 'statusPlayer', name: '噎到', amount: 4 }] },
      { intent: 'attack', label: '豆腐砸', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '躲進斗笠', effects: [{ kind: 'block', amount: 12 }, { kind: 'statusPlayer', name: '噎到', amount: 2 }] },
      { intent: 'attack', label: '撒黴豆腐', effects: [{ kind: 'damage', amount: 7 }, { kind: 'statusPlayer', name: '噎到', amount: 2 }, { kind: 'statusPlayer', name: '懶洋洋', amount: 1 }] },
    ] },

  // --- 原塔頂魔物（中池）：血 48–80、單發 12–17，全帶一手拿手戲。2026-09-03 換池：月見兔、貓頭鷹夜哨、紙鶴式神降到塔中（數字退回加硬前），其餘留塔頂 ---
  { id: 'moon_rabbit', name: '月見兔', hp: [76, 84], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_moon_rabbit',
    flying: 2,   // 跳來跳去，打到的只有一半；連打兩下才落地（2026-09-03 第三關補機制）
    line: '（杵聲不緊不慢）', lines: ['（搗麻糬的節奏突然停了）', '（看了你一眼，繼續搗）'], moves: [
      { intent: 'buff', label: '搗麻糬', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '杵擊', effects: [{ kind: 'damage', amount: 17 }] },
      { intent: 'attack', label: '麻糬黏住', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '定身', amount: 1 }, { kind: 'giveCard', cardId: 'slime_card', n: 1, to: 'discard' }] },
      { intent: 'special', label: '月光', effects: [{ kind: 'heal', n: 10 }] },
    ] },
  { id: 'owl_sentry', name: '貓頭鷹夜哨', hp: [70, 78], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_owl_sentry',
    hexOnSkill: { cardId: 'dazed_card', n: 1 },   // 夜視鎖定：你每打一張技能牌就被盯得眼冒金星
    line: '（頭轉了一整圈）', lines: ['（眼睛在暗處發亮）', '呼——誰來了？'], moves: [
      { intent: 'debuff', label: '夜視鎖定', effects: [{ kind: 'statusPlayer', name: '翻肚', amount: 2 }] },
      { intent: 'attack', label: '俯衝', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
      { intent: 'block', label: '展翅警戒', effects: [{ kind: 'block', amount: 14 }] },
      { intent: 'attack', label: '爪擊', effects: [{ kind: 'damage', amount: 15 }] },
    ] },
  { id: 'paper_crane', name: '紙鶴式神', hp: [58, 64], pool: '中', pattern: 'cycle', size: 'small', art: 'codex/monster_paper_crane',
    flying: 2, curlUp: 10,   // 紙鶴會飛；第一次被打痛摺起來長 10 點防禦
    line: '（摺痕發著微光）', lines: ['（無聲地飄了過來）', '（翅膀薄得像刀）'], moves: [
      { intent: 'block', label: '摺翼', effects: [{ kind: 'block', amount: 10 }, { kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '紙刃', effects: [{ kind: 'damage', amount: 6, times: 3 }] },
      { intent: 'attack', label: '折射', effects: [{ kind: 'damage', amount: 10 }, { kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
      { intent: 'attack', label: '銳襲', effects: [{ kind: 'damage', amount: 18 }] },
    ] },
  { id: 'miasma_blob', name: '魔氣凝塊', hp: [84, 94], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_miasma_blob',
    plating: 4, angerOnSkill: 1,   // 魔氣每回合凝回一層防禦；打技能牌會激怒牠
    line: '（隱約有一張貓臉）', lines: ['（咕嚕咕嚕地冒泡）', '（那張臉在笑）'], moves: [
      { intent: 'attack', label: '侵蝕', effects: [{ kind: 'damage', amount: 11 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
      { intent: 'buff', label: '膨脹', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }, { kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '魔氣浪', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
      { intent: 'special', label: '凝聚再生', effects: [{ kind: 'heal', n: 12 }] },
    ] },
  { id: 'night_panther', name: '夜行黑豹', hp: [72, 80], pool: '中', pattern: 'cycle', size: 'large', art: 'codex/monster_night_panther',
    strengthEveryNTurns: 1,   // 越打越狠：每回合 +1 爪力
    line: '（鈴鐺一聲都沒響）', lines: ['（只看得到一雙眼睛）', '（落地無聲）'], moves: [
      { intent: 'buff', label: '潛影', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }, { kind: 'chargeNext' }] },
      { intent: 'attack', label: '猛撲', effects: [{ kind: 'damage', amount: 22 }] },
      { intent: 'attack', label: '撕裂', effects: [{ kind: 'damage', amount: 11, times: 2 }] },
      { intent: 'debuff', label: '低吼', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
    ] },

  // --- 影球球（第三關鏡像精英）：招式全是玩家起手牌的影子版 ---
  { id: 'shadow_cat', name: '影球球', hp: [110, 110], pool: '大魔物', pattern: 'cycle', size: 'medium', art: 'codex/monster_shadow_cat',
    line: '（跟你擺出一樣的架式）', lines: ['（跟你同時歪了歪頭）', '（連呼吸的節奏都一樣）'], moves: [
      { intent: 'attack', label: '影爪抓', effects: [{ kind: 'damage', amount: 16 }] },
      { intent: 'block', label: '影蜷縮', effects: [{ kind: 'block', amount: 16 }] },
      { intent: 'buff', label: '影分身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '影撒手鐧', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
    ] },


  // --- 2026-09-02 補怪（塔頂）：單怪池只有 4 隻。三隻都是「拆你的塔」型，回應爪力後期堆太快的問題：
  // 烏天狗＝拍掉隱身潛水＋棄牌、白狐巫女＝祓除（爪力貓步砍半）、空鎧武者＝厚防（逼你帶破防）---
  { id: 'tengu', name: '烏天狗', hp: [72, 80], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_tengu', angerOnSkill: 1,   // 2026-09-03 第三關補機制：每打一張技能牌 +1 爪力
    flying: 3,   // 天狗在天上飛：攻擊只打得到一半，打中三下才掉下來
    line: '（鼻子哼了一聲，羽扇搧了搧）', lines: ['山下的貓，也敢上來？', '（羽扇一揮，風起了）'], moves: [
      { intent: 'attack', label: '羽扇颶風', effects: [{ kind: 'damage', amount: 9 }, { kind: 'discardRandomHand', n: 2 }] },
      { intent: 'attack', label: '天狗飛斬', effects: [{ kind: 'damage', amount: 20 }] },
      { intent: 'buff', label: '乘風', effects: [{ kind: 'block', amount: 12 }, { kind: 'statusSelf', name: '爪力', amount: 1 }] },
      { intent: 'attack', label: '看穿', effects: [{ kind: 'stripPlayer', names: ['隱身', '潛水'] }, { kind: 'damage', amount: 8 }] },
    ] },
  { id: 'fox_miko', name: '白狐巫女', hp: [64, 70], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_fox_miko', thorns: 2,   // 結界刺人：整場固定 2（原本掛在結界招上每輪 +3 會疊到 9，稽核 2026-09-03）
    hexOnSkill: { cardId: 'dazed_card', n: 1 },   // 符咒：你每打一張技能牌就被貼一張眼冒金星
    line: '（御幣一揮，狐火飄了過來）', lines: ['（御幣一搖，狐火亮了）', '不潔之物，退下。'], moves: [
      { intent: 'debuff', label: '祓除', effects: [{ kind: 'purgePlayer', names: ['爪力', '貓步'] }, { kind: 'statusPlayer', name: '懶洋洋', amount: 1 }] },
      { intent: 'attack', label: '狐火', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'block', label: '結界', effects: [{ kind: 'block', amount: 14 }] },
      { intent: 'attack', label: '狐火纏身', effects: [{ kind: 'damage', amount: 10 }, { kind: 'statusPlayer', name: '噎到', amount: 2 }] },
    ] },
  { id: 'armor_ghost', name: '空鎧武者', hp: [88, 96], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_armor_ghost',
    plating: 6, curlUp: 8,   // 空鎧：每回合長甲、第一次被打痛先縮一次
    line: '（盔甲裡沒有人，眼睛卻亮著）', lines: ['（盔甲裡傳來低沉的回音）', '（眼睛的紅光更亮了）'], moves: [
      { intent: 'block', label: '盾牆', effects: [{ kind: 'block', amount: 10 }, { kind: 'damage', amount: 8 }] },
      { intent: 'attack', label: '槍突', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
      { intent: 'buff', label: '鐵壁', effects: [{ kind: 'block', amount: 10 }, { kind: 'damage', amount: 6 }, { kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '橫掃', effects: [{ kind: 'damage', amount: 12, times: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
    ] },

  // 鏡子走廊事件的對手（使用者 2026-09-02：「我以為會有一個影球球是敵人跟我對打」）：
  // 借影球球的立繪、招式是縮小版；三關各一個遭遇，靠 hpScale／strength 跟著關卡變強。
  // 池標「召喚」＝不進任何隨機池，只由事件叫出來（切磋的白貓同一套）
  // 2026-09-04 使用者：「強度太低、要有特色」→ 招式加重並加「照著學」抄你的爪力貓步。
  // 血量先拉到 92，機器人實測第八層平均掉 21 點血、打 10.8 回合太拖，同日調回 70（傷害不動）
  { id: 'mirror_qiuqiu', name: '鏡中球球', hp: [70, 76], pool: '召喚', pattern: 'cycle', size: 'medium', art: 'codex/monster_shadow_cat',
    // 2026-09-04 使用者：對白改成「是球球的影子」，不要再講「跟你長得一樣」
    line: '（從鏡子裡跨出來，貼著地面滑到你面前）', lines: ['（是球球的影子，站起來了）', '（影子學著你的動作，先出手了）'], moves: [
      { intent: 'buff', label: '照著學', effects: [{ kind: 'copyPlayerStatus', names: ['爪力', '貓步'] }, { kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '鏡爪抓', effects: [{ kind: 'damage', amount: 13 }] },
      { intent: 'block', label: '鏡蜷縮', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '鏡肉球連擊', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
      { intent: 'attack', label: '鏡撒手鐧', effects: [{ kind: 'damage', amount: 18 }] },
    ] },

  // --- 新關主：橘皮大王（第一關第三選，強度對齊二刀後的 105 級距）---
  { id: 'orange_king', name: '橘皮大王', hp: [149, 149], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_orange_king',
    curlUp: 15, strengthEveryNTurns: 2,   // 一顆球：第一次被打痛整顆縮起來長 15 點防禦
    line: '（一邊嚼一邊看你）', lines: ['嚼嚼……你是誰？', '（打了個飽嗝）'], moves: [
      { intent: 'attack', label: '肚皮壓', effects: [{ kind: 'damage', amount: 18 }] },
      { intent: 'special', label: '打呵欠', effects: [{ kind: 'heal', n: 8 }, { kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '丟魚骨頭', effects: [{ kind: 'damage', amount: 6, times: 2 }, { kind: 'statusPlayer', name: '噎到', amount: 1 }] },
      { intent: 'attack', label: '滾來滾去', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
    ],
    phases: [{
      hpBelow: 55, line: '（整顆站了起來）', pattern: 'cycle',
      onEnter: [{ kind: 'block', amount: 12 }, { kind: 'statusSelf', name: '反彈', amount: 3 }],   // 站起來全身是刺
      moves: [
        { intent: 'special', label: '蓄力', effects: [{ kind: 'chargeNext' }] },
        { intent: 'attack', label: '泰山壓頂', effects: [{ kind: 'damage', amount: 27, pierce: true }] },
        { intent: 'attack', label: '龍捲滾', effects: [{ kind: 'damage', amount: 12, times: 2 }] },
        { intent: 'special', label: '揉麵團', effects: [{ kind: 'heal', n: 10 }] },
      ],
    }] },

  // --- 第二關關主三選一 ---
  // 奶牛貓二當家：黑白換式的循環拳師，換式與運勁回合就是輸出窗口
  { id: 'cowcat_boss', name: '奶牛貓二當家', hp: [260, 260], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_cowcat_boss', strengthEveryNTurns: 2,   // 2026-09-03 第五輪
    angerOnSkill: 1, plating: 7,   // 拳師：你躲一下牠就更火（2→1，且憤怒每回合最多一次：下一輪平衡 2026-09-05，機器人 20%→33%）；每回合沉腰長 7 點防禦
    line: '亮傢伙吧。', lines: ['來得正好，正想活動筋骨。', '（轉了轉木棍）'], moves: [
      { intent: 'attack', label: '黑手重錘', effects: [{ kind: 'damage', amount: 10, times: 3 }] },
      { intent: 'attack', label: '白手連打', effects: [{ kind: 'damage', amount: 9, times: 3 }] },
      { intent: 'block', label: '換式・沉腰', effects: [{ kind: 'block', amount: 16 }, { kind: 'statusSelf', name: '爪力', amount: 1 }, { kind: 'stripPlayer', names: ['隱身', '潛水'] }] },   // 2026-09-03 第六輪：看破
      { intent: 'attack', label: '黑白亂舞', effects: [{ kind: 'damage', amount: 11, times: 2 }] },
      { intent: 'special', label: '運勁', effects: [{ kind: 'heal', n: 10 }, { kind: 'block', amount: 8 }] },
    ],
    phases: [{
      hpBelow: 85, line: '（黑白兩色的毛全豎了起來）', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '爪力', amount: 2 }],
      moves: [
        { intent: 'attack', label: '合一連環', effects: [{ kind: 'damage', amount: 9, times: 3 }] },
        { intent: 'attack', label: '崩拳', effects: [{ kind: 'damage', amount: 26, pierce: true }] },
        { intent: 'block', label: '鐵壁', effects: [{ kind: 'block', amount: 20 }] },
      ],
    }] },
  // 狸大人：出招隨機的戲法師，會叫狸小弟上場
  { id: 'tanuki_lord', name: '狸大人', hp: [225, 225], pool: '塔主', pattern: 'random', size: 'large', art: 'codex/monster_tanuki_lord', angerOnSkill: 1, strengthEveryNTurns: 3,   // 第四輪：打技能牌會被牠嗆；第五輪：每回合 +1，拖 20 回合就是 +20（稽核 2026-09-03：這欄原本被前面的註解吃掉沒生效）
    // 「戲法」（每打一張技能牌塞一張眼冒金星）拿掉：機器人 15% 勝率的病根，門檻與鼓壓調了都沒差（下一輪平衡 2026-09-05：15%→26%）
    line: '呵呵，來得正好。', lines: ['喝一杯再打？不喝？那打吧。', '（拍了拍肚皮，咚咚響）'], moves: [
      { intent: 'attack', label: '醉八仙', effects: [{ kind: 'damage', amount: 8, times: 3 }] },
      { intent: 'attack', label: '醉八仙', effects: [{ kind: 'damage', amount: 8, times: 3 }] },
      { intent: 'block', label: '葉隱', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }, { kind: 'block', amount: 10 }, { kind: 'stripPlayer', names: ['隱身', '潛水'] }] },   // 2026-09-03 第六輪：看破
      { intent: 'summon', label: '喚小弟', effects: [{ kind: 'summon', enemyId: 'tanuki_kid', n: 1, max: 2 }] },
      { intent: 'debuff', label: '肚皮鼓', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'stripPlayer', names: ['隱身', '潛水'] }] },
      { intent: 'attack', label: '酒氣', effects: [{ kind: 'damage', amount: 8, times: 3 }, { kind: 'statusPlayer', name: '噎到', amount: 2 }] },
    ],
    phases: [{
      hpBelow: 130, line: '（葫蘆見底了）', pattern: 'random',
      onEnter: [{ kind: 'summon', enemyId: 'tanuki_kid', n: 1, max: 2 }, { kind: 'statusSelf', name: '爪力', amount: 2 }],   // 一次一隻（第二輪平衡 2026-09-06：兩隻蓄力小弟是機器人 21% 的病根）
      moves: [
        { intent: 'attack', label: '醉拳真髓', effects: [{ kind: 'damage', amount: 9, times: 3 }] },
        { intent: 'block', label: '葫蘆補酒', effects: [{ kind: 'block', amount: 12 }, { kind: 'heal', n: 6 }] },   // 原本兩招醉拳真髓，二階段四招三招是攻擊；改一招補酒給喘息窗（第二輪平衡 2026-09-06）
        { intent: 'buff', label: '大變身', effects: [{ kind: 'chargeNext' }] },
        { intent: 'attack', label: '泰山鼓壓', effects: [{ kind: 'damage', amount: 32, pierce: true }] },
      ],
    }] },
  // 波斯大小姐：僕從護體——執事與女僕還站著她就不受傷，先清僕從才打得到本體
  { id: 'persian_lady', name: '波斯大小姐', hp: [220, 220], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_persian_lady', strengthEveryNTurns: 3,   // 2026-09-03 第五輪每回合 +1；第二輪平衡 2026-09-06 放慢成每 3 回合（機器人 17%，是第二關最低）
    line: '哼。', lines: ['髒東西，不要靠近本小姐。', '（用扇子遮住鼻子）'], guardedByAllies: true,
    chooseMove: (turn) => (turn % 10 === 9 ? PERSIAN_CALL : undefined),   // 其餘回合照表輪招
    moves: [
      { intent: 'buff', label: '擺架子', effects: [{ kind: 'statusSelf', name: '爪力', amount: 3 }, { kind: 'block', amount: 10 }] },
      { intent: 'attack', label: '扇子拍', effects: [{ kind: 'damage', amount: 10, times: 3 }] },
      { intent: 'debuff', label: '尖叫', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 1 }, { kind: 'stripPlayer', names: ['隱身', '潛水'] }] },   // 2026-09-03 第六輪：看破
      { intent: 'special', label: '補香水', effects: [{ kind: 'heal', n: 12 }] },
    ],
    phases: [{
      hpBelow: 65, line: '你們這群沒用的東西！', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '爪力', amount: 2 }],
      moves: [
        { intent: 'attack', label: '貴族之怒', effects: [{ kind: 'damage', amount: 12, times: 3 }] },   // 12×2→12×3：僕從改躺兩回合後機器人勝率 65%，補回來（2026-09-03 晚）
        { intent: 'attack', label: '甩尾', effects: [{ kind: 'damage', amount: 22, pierce: true }] },
        { intent: 'debuff', label: '歇斯底里', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      ],
    }] },
  { id: 'butler_cat', name: '執事貓', hp: [34, 34], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_butler_cat',
    // 同生共死拿掉（第二輪平衡 2026-09-06）：兩個僕從互相復活讓弱牌組永遠打不到本體，機器人 17%→28%；護體本身保留
    line: '（扶了扶單眼鏡）', lines: ['大小姐面前，請保持距離。', '（推了推單片眼鏡）'], moves: [
      { intent: 'attack', label: '拋托盤', effects: [{ kind: 'damage', amount: 14 }] },
      { intent: 'block', label: '布陣', effects: [{ kind: 'block', amount: 10 }] },
      { intent: 'special', label: '奉茶', effects: [{ kind: 'heal', n: 8 }] },
    ] },
  { id: 'maid_cat', name: '女僕貓', hp: [30, 30], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_maid_cat',
    // 同生共死拿掉（第二輪平衡 2026-09-06）：兩個僕從互相復活讓弱牌組永遠打不到本體，機器人 17%→28%；護體本身保留
    line: '（緊緊抱著雞毛撢）', lines: ['我、我會保護大小姐的！', '（把雞毛撢子抱得更緊）'], moves: [
      { intent: 'attack', label: '雞毛撢亂揮', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'block', label: '撢塵護主', effects: [{ kind: 'block', amount: 9 }] },
      { intent: 'debuff', label: '大掃除', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 1 }, { kind: 'damage', amount: 3 }] },
    ] },

  // ===== 2026-09-02 第二波怪：10 個新機制、12 隻新怪、4 個新關主、2 種召喚小怪 =====
  // 設計稿：docs/怪物擴充_第二波_設計稿.md。每隻都帶一個「以前沒有的路數」，
  // 而且隱藏規則一律掛牌可見（狀態牌子或單位下方的小牌）。

  // --- 塔下（第一關）---
  // 分裂：打到半血就裂成兩隻，每隻的血量等於裂開時剩下的血——急著打會變成打更多血
  { id: 'dango_slime', name: '團子史萊姆', hp: [36, 40], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_dango_slime',
    line: '（三顆團子黏在一起，抖了一下）', lines: ['（黏答答地滑過來）', '（分不出哪一顆是頭）'],
    splitInto: { enemyId: 'dango_bit', n: 2, below: 0.5 },
    moves: [
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'attack', label: '黏一下', effects: [{ kind: 'damage', amount: 4 }, { kind: 'giveCard', cardId: 'slime_card', n: 1, to: 'discard' }] },
      { intent: 'attack', label: '再撞一次', effects: [{ kind: 'damage', amount: 6 }] },
    ] },
  { id: 'dango_bit', name: '小團子', hp: [10, 10], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_dango_bit',
    line: '（滾了一圈）', lines: ['（黏在地上又彈起來）', '（比剛才小一號）'],
    moves: [{ intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 4 }] }] },
  // 縮殼：第一次被打痛就長出一層厚防禦。第一擊要嘛戳一下騙它縮，要嘛一口氣打穿
  { id: 'armadillo_pup', name: '犰狳寶寶', hp: [24, 28], pool: '弱', pattern: 'cycle', size: 'small', art: 'codex/monster_armadillo_pup',   // 小怪，但框另外放寬成 150×150（combat.ts SPRITE_SIZE_OVERRIDE）：小框顯得扁、中框又太高（使用者 2026-09-03）
    line: '（縮成一顆球，只露出一隻眼睛）', lines: ['（殼上還有奶漬）', '（滾過來又滾回去）'],
    curlUp: 8,
    moves: [
      { intent: 'attack', label: '滾', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'block', label: '縮', effects: [{ kind: 'block', amount: 6 }] },
      { intent: 'attack', label: '加速滾', effects: [{ kind: 'damage', amount: 7 }] },
    ] },
  // 飛行：攻擊只打得到一半，要先把牠打下來。多段小刀剝得最快
  { id: 'lantern_moth', name: '燈蛾', hp: [30, 34], pool: '中', pattern: 'cycle', size: 'small', art: 'codex/monster_lantern_moth',
    line: '（繞著燈光轉圈）', lines: ['（翅膀上的粉一直掉）', '（撲、撲、撲）'],
    flying: 3,
    moves: [
      { intent: 'attack', label: '撲翅', effects: [{ kind: 'damage', amount: 5, times: 2 }] },
      { intent: 'debuff', label: '鱗粉', effects: [{ kind: 'giveCard', cardId: 'dazed_card', n: 1, to: 'draw' }] },
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 8 }] },
    ] },
  // 沉睡：開場三回合白給你打，但打痛牠就會提早醒，而且醒來 +3 爪力。要嘛趁睡爆發，要嘛先疊好防
  { id: 'hibernating_bear', name: '冬眠熊', hp: [62, 68], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_hibernating_bear',
    line: '（打了個很長的呼嚕）', lines: ['（睡得四腳朝天）', '呼——呼——'],
    asleep: 3, onWake: [{ kind: 'statusSelf', name: '爪力', amount: 3 }],
    moves: [
      { intent: 'attack', label: '拍', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'attack', label: '熊抱', effects: [{ kind: 'damage', amount: 9 }, { kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '再拍一下', effects: [{ kind: 'damage', amount: 12 }] },
    ] },

  // --- 塔中（第二關）---
  // 自爆：鼓兩回合的氣，第三回合直接炸你 28。看到「爆」就該定身或閃
  { id: 'puffer_spirit', name: '河豚精', hp: [52, 58], pool: '強', pattern: 'cycle', size: 'medium', art: 'codex/monster_puffer_spirit',
    line: '（鼓了一下，又消下去）', lines: ['（刺一根根豎起來）', '（越鼓越大顆）'],
    moves: [
      { intent: 'block', label: '鼓氣', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'block', label: '再鼓一口', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '爆炸', effects: [{ kind: 'selfDestruct', amount: 28 }] },
    ] },
  // 鱗甲：每個牠的回合結束自己長防禦，打痛一下剝一層。慢慢磨會被它補回去
  { id: 'plated_beetle', name: '鎧甲獨角仙', hp: [60, 66], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_plated_beetle', strengthEveryNTurns: 2,   // 2026-09-03 升塔頂
    line: '（角撞了一下地面）', lines: ['（甲殼閃著金屬光）', '（翅鞘喀啦一聲張開）'],
    plating: 6,
    moves: [
      { intent: 'attack', label: '頂', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'attack', label: '衝撞', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
      { intent: 'block', label: '磨甲', effects: [{ kind: 'block', amount: 10 }] },
    ] },
  // 全體強化型：自己不太打人，專門把兩隻小老鼠兵餵大。正解是先拆指揮官
  { id: 'rat_general', name: '鼠大將', hp: [60, 66], pool: '強', pattern: 'cycle', size: 'medium', art: 'codex/monster_rat_general', curlUp: 8,   // 2026-09-03 升塔頂：開場先縮殼 8
    line: '兒郎們，列陣！', lines: ['吱——全軍聽令！', '（把小旗子往前一揮）'],
    moves: [
      { intent: 'buff', label: '號令', effects: [{ kind: 'statusAllies', name: '爪力', amount: 3 }] },
      { intent: 'block', label: '盾陣', effects: [{ kind: 'blockAllies', amount: 8 }] },
      { intent: 'attack', label: '揮刀', effects: [{ kind: 'damage', amount: 18 }] },
    ] },
  // 詛咒：你每打一張技能牌，牠就往你的抽牌堆洗一張眼冒金星。閃避流、抽牌流最怕這隻
  { id: 'curse_priest', name: '詛咒神官', hp: [54, 60], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_curse_priest', angerOnSkill: 1,   // 2026-09-03 升塔頂：技能牌會激怒祂
    line: '（開始低聲唸些聽不懂的話）', lines: ['（手上的鈴一直響）', '（面具底下沒有臉）'],
    hexOnSkill: { cardId: 'dazed_card', n: 1 },
    moves: [
      { intent: 'attack', label: '咒印', effects: [{ kind: 'damage', amount: 5, times: 2 }] },
      { intent: 'debuff', label: '念咒', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }] },
      { intent: 'attack', label: '咒杖', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ] },

  // --- 塔頂（第三關）---
  // 消散：四個回合之後自己散掉，散掉就不算你打的。想拿戰利品就得搶時間
  { id: 'phantom_fox', name: '幻狐', hp: [70, 78], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_phantom_fox',
    line: '（身體半透明，尾巴數不清幾條）', lines: ['（一下在左邊，一下在右邊）', '（腳沒有踩在地上）'],
    fadeAfter: 4, strengthEveryNTurns: 1,
    moves: [
      { intent: 'attack', label: '撕', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
      { intent: 'attack', label: '狐火', effects: [{ kind: 'damage', amount: 12 }] },
    ] },
  // 憤怒：你每打一張技能牌牠就 +1 爪力。純技能過渡的打法在這隻面前會被反過來咬
  { id: 'red_oni', name: '赤鬼武夫', hp: [90, 100], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_red_oni', strengthEveryNTurns: 2,   // 2026-09-03 第三關補機制
    line: '（把鐵棒往地上一頓）', lines: ['吼——！', '（獠牙外露，鼻息噴得很重）'],
    angerOnSkill: 1,
    moves: [
      { intent: 'attack', label: '鐵棒', effects: [{ kind: 'damage', amount: 16 }] },
      { intent: 'buff', label: '怒吼', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '橫掃', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
    ] },
  // 飛行的塔頂版：四層，而且開場就往你抽牌堆塞兩張眼冒金星
  { id: 'moon_moth_queen', name: '月蛾后', hp: [66, 72], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_moon_moth_queen', thorns: 1,   // 2026-09-03 第三關補機制：碰到鱗粉會被刺（原 2，機器人每場掉 37 太痛）
    line: '（翅膀上的花紋像兩隻眼睛）', lines: ['（鱗粉在月光下發亮）', '（無聲地降了下來）'],
    flying: 4,
    moves: [
      { intent: 'debuff', label: '鱗粉', effects: [{ kind: 'giveCard', cardId: 'dazed_card', n: 1, to: 'draw' }] },
      { intent: 'attack', label: '吸', effects: [{ kind: 'damage', amount: 6 }, { kind: 'heal', n: 6 }] },
      { intent: 'attack', label: '撲', effects: [{ kind: 'damage', amount: 3, times: 2 }] },
    ] },
  // 鱗甲的塔頂版：八層厚甲配 20 起跳的重手。多段牌剝甲、大招牌收頭
  { id: 'jizo_golem', name: '地藏石偶', hp: [96, 104], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_jizo_golem', strengthEveryNTurns: 2,   // 2026-09-03 第三關補機制
    line: '（石頭做的臉，笑得很慈祥）', lines: ['（腳底磨出一道石粉）', '（合十的手緩緩張開）'],
    plating: 8,
    moves: [
      { intent: 'attack', label: '石掌', effects: [{ kind: 'damage', amount: 24, pierce: true }] },
      { intent: 'block', label: '合十', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '再一記石掌', effects: [{ kind: 'damage', amount: 22, pierce: true }] },
    ] },

  // --- 第二波新關主（塔下兩個、塔中兩個；塔頂仍固定師父）---
  // 蛙大名：半血叫兩隻蝌蚪兵出來，然後改走「全體疊防禦」的拖延流
  { id: 'frog_daimyo', name: '蛙大名', hp: [135, 135], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_frog_daimyo',
    plating: 2, strengthEveryNTurns: 3, reviveGroup: 'pond', neverRevive: true,   // 鱗甲 4→2、成長 2→3 回合、血 150→135（下一輪平衡 2026-09-05：機器人 34%→45%）   // 蛙皮每回合長甲；蝌蚪兵跟牠同組，牠還在小兵就會爬起來；牠自己倒了就倒了（稽核 2026-09-03）。（歷史：2026-09-03 晚曾因同生共死改躺兩回合、機器人勝率飆到 68% 而把成長從 3 回合改成 2 回合；2026-09-05 已改回 3）
    line: '（呱了一聲，扇子一開）', lines: ['何方妖貓，膽敢闖本大名的池子？', '（鼓起腮幫子，呱——）'],
    moves: [
      { intent: 'attack', label: '舌捲', effects: [{ kind: 'damage', amount: 6, times: 3 }] },   // 15→6×3：單發機器人全躲掉，多段才打得進（2026-09-03 晚）
      { intent: 'debuff', label: '蛙鳴', effects: [{ kind: 'giveCard', cardId: 'slime_card', n: 2, to: 'discard' }] },
      { intent: 'attack', label: '跳壓', effects: [{ kind: 'damage', amount: 20, pierce: true }] },   // 18→20 穿透：蜷縮擋不住（同上）
    ],
    phases: [{
      hpBelow: 55, line: '來人！', pattern: 'cycle',
      onEnter: [{ kind: 'summon', enemyId: 'tadpole', n: 2, max: 2 }],
      moves: [
        { intent: 'block', label: '號令', effects: [{ kind: 'blockAllies', amount: 10 }] },
        { intent: 'attack', label: '大舌捲', effects: [{ kind: 'damage', amount: 15 }] },   // 跟一階段 6×3 的「舌捲」不同招，別共用名字（稽核 2026-09-04 M-3）
        { intent: 'attack', label: '重跳壓', effects: [{ kind: 'damage', amount: 26 }] },
      ],
    }] },
  { id: 'tadpole', name: '蝌蚪兵', hp: [10, 10], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_tadpole',
    reviveGroup: 'pond', reviveHp: 6,
    line: '（尾巴甩個不停）', lines: ['（排成一列游過來）', '（還沒長腳）'],
    moves: [
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 4 }] },
      { intent: 'block', label: '護主', effects: [{ kind: 'block', amount: 5 }] },
    ] },
  // 犰狳王：縮殼 15 ＋鱗甲 4。開場那一擊會被吃掉一大半，之後每回合還會自己補甲
  { id: 'armadillo_king', name: '犰狳王', hp: [135, 135], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_armadillo_king',
    thorns: 2, strengthEveryNTurns: 2,   // 殼上全是刺；越滾越猛。反彈 4→2（全面體檢 2026-09-05）：機器人 600 局牠 22% 是第一關五隻最低、陣亡榜第二；受控探針每場被反彈 44.7 點＝進場血的七成，忍術池最好的攻擊幾乎都是多段，每張要付 8～12 點血
    line: '（整隻縮成一顆巨大的球）', lines: ['（殼上一道一道全是舊傷）', '（球身緩緩轉了半圈）'],
    curlUp: 15, plating: 4,   // 縮殼 15＋鱗甲 4；血 150→135（下一輪平衡 2026-09-05）

    moves: [
      { intent: 'attack', label: '滾壓', effects: [{ kind: 'damage', amount: 18 }] },
      { intent: 'block', label: '龜縮', effects: [{ kind: 'block', amount: 15 }] },
      { intent: 'attack', label: '甩尾', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
      { intent: 'attack', label: '全速滾壓', effects: [{ kind: 'damage', amount: 22 }] },
    ] },
  // 沉睡的龍貓：開場睡兩回合白給你打，但打痛就醒、醒來 +4 爪力。要不要偷這兩回合是這場的抉擇
  // 沉睡的龍貓（2026-09-03 重做：使用者「完全沒機制，作為第二關的王比菁英還不如」）
  // 開場只睡一回合（打醒＝更兇 +2 爪力）；整場鱗甲 6（牠的回合結束長防禦、被打痛剝一層）＋逆鱗 2 點反彈（多段牌自己會痛）；
  // 半血「龍魂覺醒」：拍掉你一半爪力貓步、自己 +3 爪力、鱗甲加到 10；之後龍炎穿透、吞天邊打邊回血、咆哮塞眼冒金星
  { id: 'dragon_cat', name: '沉睡的龍貓', hp: [240, 240], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_dragon_cat',
    line: '（盤成一圈，鼻孔冒出一小縷煙）', lines: ['（鱗片隨著呼吸起伏）', '（睡夢中低吼了一聲）'],
    asleep: 1, onWake: [{ kind: 'statusSelf', name: '爪力', amount: 2 }], plating: 10, thorns: 3,   // 反彈 5→3（第二輪平衡 2026-09-06：多段剝鱗甲是設計上的正解，每下付 5 血太痛；砍到 2 機器人 57% 太軟，3 是 45%）
    moves: [
      { intent: 'attack', label: '龍息', effects: [{ kind: 'damage', amount: 21 }] },
      { intent: 'attack', label: '尾掃', effects: [{ kind: 'damage', amount: 11, times: 2 }] },
      { intent: 'block', label: '盤踞', effects: [{ kind: 'block', amount: 18 }, { kind: 'heal', n: 8 }] },
      { intent: 'attack', label: '龍息', effects: [{ kind: 'damage', amount: 21 }] },
    ],
    phases: [{
      hpBelow: 120, pattern: 'cycle', line: '……吵醒我的，要付代價。',
      onEnter: [{ kind: 'purgePlayer', names: ['爪力', '貓步'] }, { kind: 'statusSelf', name: '爪力', amount: 3 }, { kind: 'statusSelf', name: '鱗甲', amount: 4 }],
      moves: [
        { intent: 'attack', label: '龍炎', effects: [{ kind: 'damage', amount: 30, pierce: true }] },
        { intent: 'attack', label: '吞天', effects: [{ kind: 'damage', amount: 15, times: 2 }, { kind: 'heal', n: 8 }] },
        { intent: 'debuff', label: '咆哮', effects: [{ kind: 'giveCard', cardId: 'dazed_card', n: 2, to: 'draw' }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
        { intent: 'block', label: '盤踞', effects: [{ kind: 'block', amount: 22 }, { kind: 'heal', n: 8 }] },
      ],
    }] },
  // 詛咒老住持：整場都在往你的抽牌堆洗眼冒金星，二階段再給自己披一層鱗甲
  { id: 'hex_abbot', name: '詛咒老住持', hp: [220, 220], pool: '塔主', pattern: 'cycle', size: 'large', art: 'codex/monster_hex_abbot', strengthEveryNTurns: 2,
    line: '（木魚一聲一聲，敲得很慢）', lines: ['施主，回頭是岸。', '（念珠一顆顆撥過去）'],
    hexOnSkill: { cardId: 'dazed_card', n: 1 }, thorns: 3, angerOnSkill: 1,   // 念珠反彈；你越躲他越氣（2026-09-03 關主加硬 2；下一輪平衡 2026-09-05 改 1：機器人 28%→37%）
    moves: [
      { intent: 'attack', label: '木魚', effects: [{ kind: 'damage', amount: 8, times: 2 }] },
      { intent: 'debuff', label: '唸經', effects: [{ kind: 'giveCard', cardId: 'slime_card', n: 2, to: 'discard' }] },
      { intent: 'attack', label: '佛掌', effects: [{ kind: 'damage', amount: 13, times: 2 }] },
    ],
    phases: [{
      hpBelow: 85, line: '阿彌陀佛。', pattern: 'cycle',
      onEnter: [{ kind: 'statusSelf', name: '鱗甲', amount: 6 }],
      moves: [
        { intent: 'attack', label: '大佛掌', effects: [{ kind: 'damage', amount: 16, times: 2 }] },
        { intent: 'attack', label: '急木魚', effects: [{ kind: 'damage', amount: 8, times: 2 }] },
        { intent: 'debuff', label: '唸經', effects: [{ kind: 'giveCard', cardId: 'slime_card', n: 2, to: 'discard' }] },
      ],
    }] },

  // ===== 2026-09-03 菁英擴充：每關 3 隻新菁英、2 種召喚小怪、新機制「虛化」 =====
  // 設計稿：docs/菁英擴充_設計稿.md。血量是單獨出場的值（遭遇不另帶 hpScale；第三關照慣例帶魔氣 5）。
  // 機制全部重用第二波與更早做好的那些，只有「虛化」是新的。

  // --- 第一關（塔下）：只有單一機制，一隻教一件事 ---
  // 憤怒：你每打一張技能牌牠就 +2 爪力。這一場的解法是拿攻擊牌速戰速決，別在牠面前慢慢鋪
  { id: 'wild_boar', name: '山豬頭目', hp: [78, 78], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_wild_boar',
    line: '（鼻子噴出兩道白氣，前腳刨著地）', lines: ['（獠牙刮過石頭，火星四濺）', '（低下頭，對準了你）'],
    angerOnSkill: 1,   // 機器人 100 局 26 場輸 15：+2 滾雪球太快，改 +1（跟赤鬼武夫一樣）；血 84→78（2026-09-03 驗收）
    moves: [
      { intent: 'attack', label: '衝撞', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'attack', label: '亂踩', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'attack', label: '衝撞', effects: [{ kind: 'damage', amount: 12 }] },
    ] },
  // 反彈 3：開戰就帶著，整場都在。多段小刀砍下去自己會先痛死，要嘛少段數重擊、要嘛先疊好蜷縮
  { id: 'paper_tiger', name: '紙老虎', hp: [66, 66], pool: '大魔物', pattern: 'cycle', size: 'medium', art: 'codex/monster_paper_tiger',
    line: '（紙糊的身體，吼聲卻震得地板發抖）', lines: ['（紙做的鬍鬚一根根豎起來）', '（張開嘴，裡面是空的）'],
    thorns: 2,   // 3 點對第一關的多段牌太痛（機器人贏也掉 35 血），改 2、血 72→66（2026-09-03 驗收）
    moves: [
      { intent: 'attack', label: '撲', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'attack', label: '抓', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
      { intent: 'block', label: '虛張聲勢', effects: [{ kind: 'block', amount: 12 }] },
    ] },
  // 蓄力：看到「打鼓助勢」就知道下一下是 28，該疊蜷縮或用定身把那一下弄掉
  { id: 'drum_tanuki', name: '太鼓狸', hp: [80, 80], pool: '大魔物', pattern: 'cycle', size: 'medium', art: 'codex/monster_drum_tanuki',
    line: '（咚——鼓聲從肚子裡傳出來）', lines: ['（把鼓背到身前，咚咚敲了兩下）', '（鼓面繃得很緊）'],
    moves: [
      { intent: 'attack', label: '敲鼓', effects: [{ kind: 'damage', amount: 8 }] },
      { intent: 'special', label: '打鼓助勢', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '重擊', effects: [{ kind: 'damage', amount: 14 }] },
    ] },

  // --- 第二關（塔中）：兩個機制疊在一起 ---
  // 不壞身 10（2026-09-04 使用者指定）：每回合結束 +10 防禦，而且防禦不歸零、一路往上疊。
  // 站著不打就再也打不穿，逼玩家每回合都要輸出；縮殼拿掉（跟不壞身重複），鱗甲留 6 讓多段牌仍有事做
  { id: 'iron_arhat', name: '鐵羅漢', hp: [130, 130], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_iron_arhat',
    line: '（鐵鑄的身體，合十的手緩緩放下）', lines: ['（一步踏下去，地板裂了一道縫）', '（鐵皮摩擦的聲音）'],
    plating: 6, ironBody: 10,
    moves: [
      { intent: 'attack', label: '鐵拳', effects: [{ kind: 'damage', amount: 22 }] },
      { intent: 'block', label: '金剛立', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '羅漢掌', effects: [{ kind: 'damage', amount: 28 }] },
      { intent: 'attack', label: '鐵山靠', effects: [{ kind: 'damage', amount: 14, times: 2 }] },
    ] },
  // 飛行 3＋塞牌：吊在絲上打得到一半，還一直往你抽牌堆塞眼冒金星。多段小刀先把牠扯下來
  { id: 'shadow_spider', name: '織影蜘蛛', hp: [110, 110], pool: '大魔物', pattern: 'cycle', size: 'medium', art: 'codex/monster_shadow_spider',
    line: '（八隻眼睛同時看過來，絲從天花板垂下）', lines: ['（絲網在暗處反光）', '（悄悄吊下來一點點）'],
    flying: 3,
    moves: [
      { intent: 'debuff', label: '吐絲', effects: [{ kind: 'giveCard', cardId: 'dazed_card', n: 1, to: 'draw' }] },
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 20 }] },
      { intent: 'attack', label: '撲', effects: [{ kind: 'damage', amount: 12, times: 2 }] },
    ] },
  // 消散 6＋每回合成長：六個回合內打不倒牠就散去，秘寶也跟著沒了。時間賽跑，而且牠越拖越強
  { id: 'drunk_dog', name: '醉拳狗', hp: [125, 125], pool: '大魔物', pattern: 'cycle', size: 'medium', art: 'codex/monster_drunk_dog',
    line: '（腳步東倒西歪，酒葫蘆卻拿得很穩）', lines: ['（打了個酒嗝，笑了一下）', '（晃了晃葫蘆，還有半瓶）'],
    fadeAfter: 6, strengthEveryNTurns: 1,
    moves: [
      { intent: 'attack', label: '醉步', effects: [{ kind: 'damage', amount: 12, times: 2 }] },
      { intent: 'buff', label: '灌酒', effects: [{ kind: 'heal', n: 10 }, { kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '醉拳', effects: [{ kind: 'damage', amount: 24 }] },
    ] },

  // --- 第三關（塔頂）：強機制 ---
  // 鼓舞＋一起死才算：牠會把全體餵大，而且跟兩隻小鬼同一組——只要有同伴站著，倒下的就會爬回來
  { id: 'oni_general', name: '鬼將', hp: [140, 140], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_oni_general',
    line: '（鐵棒往地上一頓，兩隻小鬼從陰影裡鑽出來）', lines: ['小的們，上！', '（角上纏著一圈鐵環，叮噹作響）'],
    reviveGroup: 'imps', reviveHp: 30,   // 先打倒鬼將、小鬼還在時牠會以 30 血爬起來（引擎預設 75 太狠）；號令 +2→+1、血 150→140（機器人 8 場輸 5，2026-09-03 驗收）
    moves: [
      { intent: 'buff', label: '號令', effects: [{ kind: 'statusAllies', name: '爪力', amount: 1 }] },
      { intent: 'attack', label: '鐵棒', effects: [{ kind: 'damage', amount: 16 }] },
      { intent: 'block', label: '盾陣', effects: [{ kind: 'blockAllies', amount: 12 }] },
      { intent: 'attack', label: '橫掃', effects: [{ kind: 'damage', amount: 8, times: 2 }] },
    ] },
  // 小鬼：跟鬼將同一組（reviveGroup 'imps'），鬼將還站著就會爬起來。要三隻同一回合一起清光
  { id: 'imp', name: '小鬼', hp: [12, 12], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_imp',
    line: '（躲在鬼將腳邊，探出半顆頭）', lines: ['（呲牙笑了一下）', '（拿著一根小木棒）'],
    reviveGroup: 'imps', reviveHp: 8,
    moves: [
      { intent: 'attack', label: '戳', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '躲', effects: [{ kind: 'block', amount: 6 }] },
    ] },
  // 分裂＋詛咒：打到半血裂成兩隻鏡影（血＝裂開時剩下的），而且你每打一張技能牌就被塞一張眼冒金星
  { id: 'mirror_sage', name: '鏡仙', hp: [180, 180], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_mirror_sage',
    line: '（鏡面裡有無數個你，每一個都在動）', lines: ['（鏡子轉了半圈，映出你的背影）', '（鏡中的你先開口了）'],
    splitInto: { enemyId: 'mirror_shard', n: 2, below: 0.5 },
    hexOnSkill: { cardId: 'dazed_card', n: 1 },
    moves: [
      { intent: 'attack', label: '鏡光', effects: [{ kind: 'damage', amount: 14 }] },
      { intent: 'debuff', label: '幻影', effects: [{ kind: 'giveCard', cardId: 'slime_card', n: 2, to: 'discard' }] },
      { intent: 'attack', label: '鏡光', effects: [{ kind: 'damage', amount: 16 }] },
    ] },
  // 鏡影：只從鏡仙分裂出來，血量由分裂當下決定（這裡的區間會被 splitEnemy 覆蓋掉）
  { id: 'mirror_shard', name: '鏡影', hp: [20, 20], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_mirror_shard',
    line: '（碎片站了起來，也有一張臉）', lines: ['（映著半張你的臉）', '（邊緣還很鋒利）'],
    moves: [
      { intent: 'attack', label: '鏡刺', effects: [{ kind: 'damage', amount: 10 }] },
      { intent: 'attack', label: '碎光', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ] },
  // 虛化（新機制）＋塞牌：虛一回合、實一回合，虛的那回合每一下最多只扣 1 點血。要把爆發留到牠實體化那回合
  { id: 'void_cat', name: '虛無貓', hp: [190, 190], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_void_cat',
    line: '（身體時有時無，像被誰擦掉了一半）', lines: ['（伸出的爪子穿過了牆）', '（連影子都是透明的）'],
    phasing: true,
    moves: [
      { intent: 'debuff', label: '黑火', effects: [{ kind: 'giveCard', cardId: 'dazed_card', n: 2, to: 'draw' }] },
      { intent: 'attack', label: '虛爪', effects: [{ kind: 'damage', amount: 15 }] },
      { intent: 'attack', label: '吞噬', effects: [{ kind: 'damage', amount: 12, times: 2, pierce: true }] },
    ] },

  // ===== 2026-09-04 第三波（方案乙：塔中 6 隻）——立繪到齊前遭遇標 hidden，見 docs/怪物擴充_第三波_設計稿.md =====
  { id: 'snow_cat', name: '雪女貓', hp: [52, 56], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_snow_cat',
    line: '（吐出一口白霧）', lines: ['冷嗎？再靠近一點就更冷了。', '（髮梢結了一層霜）'], moves: [
      { intent: 'attack', label: '冰吐息', effects: [{ kind: 'damage', amount: 9 }, { kind: 'statusPlayer', name: '懶洋洋', amount: 1 }] },
      { intent: 'block', label: '寒氣', effects: [{ kind: 'block', amount: 8 }, { kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
      { intent: 'attack', label: '凝霜', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
    ] },
  { id: 'fortune_cat', name: '招財貓', hp: [58, 62], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_fortune_cat',
    line: '（舉起的那隻手招了招）', lines: ['歡迎光臨，小魚乾請放這邊。', '（鈴鐺叮了一聲）'], moves: [
      { intent: 'debuff', label: '招手', effects: [{ kind: 'stealFish', n: 12 }, { kind: 'block', amount: 6 }, { kind: 'damage', amount: 6 }] },
      { intent: 'attack', label: '金幣雨', effects: [{ kind: 'damage', amount: 15 }] },
      { intent: 'buff', label: '護體', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }, { kind: 'block', amount: 10 }] },
    ] },
  { id: 'lantern_fish', name: '提燈鮟鱇', hp: [46, 50], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_lantern_fish',
    flying: 2,   // 飄在半空：攻擊只打得到一半，打中兩下才掉下來
    line: '（頭上的燈亮了一下）', lines: ['（張開一口細牙）', '（燈光晃啊晃）'], moves: [
      { intent: 'debuff', label: '燈光', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 13 }] },
      { intent: 'attack', label: '深海壓', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
    ] },
  { id: 'puppeteer', name: '傀儡師', hp: [44, 48], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_puppeteer',
    line: '（手指一勾，線動了）', lines: ['別看我，看它們。', '（袖子裡又掉出一具）'], moves: [
      { intent: 'summon', label: '操偶', effects: [{ kind: 'summon', enemyId: 'puppet', n: 1, max: 2 }, { kind: 'damage', amount: 5 }] },
      { intent: 'attack', label: '針刺', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '布陣', effects: [{ kind: 'blockAllies', amount: 6 }, { kind: 'statusSelf', name: '爪力', amount: 2 }] },
    ] },
  { id: 'puppet', name: '傀儡', hp: [14, 16], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_puppet',
    line: '（喀、喀）', lines: ['（關節轉了一圈）', '（線繃緊了）'], moves: [
      { intent: 'attack', label: '木拳', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '硬化', effects: [{ kind: 'block', amount: 5 }] },
    ] },
  { id: 'shuten_imp', name: '酒吞小鬼', hp: [60, 64], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_shuten_imp',
    strengthEveryNTurns: 2,   // 越喝越猛：每兩回合 +1 爪力
    line: '（仰頭灌了一大口）', lines: ['再來一杯！', '（酒瓶見底了，換下一瓶）'], moves: [
      { intent: 'attack', label: '酒瓶砸', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'buff', label: '灌酒', effects: [{ kind: 'heal', n: 6 }, { kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '醉拳', effects: [{ kind: 'damage', amount: 5, times: 3 }] },
    ] },
  // 紙燈籠雙子：一對同生共死（另一盞還亮著就會重新點起來）；兩隻共用一張立繪
  { id: 'lantern_twin_a', name: '紙燈籠雙子・甲', hp: [30, 32], pool: '中', pattern: 'cycle', size: 'small', art: 'codex/monster_lantern_twin',
    reviveGroup: 'twins', reviveHp: 12,
    line: '（火苗晃了一下）', lines: ['（另一盞也亮了）', '（紙面透出橘光）'], moves: [
      { intent: 'attack', label: '火苗', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '噎到', amount: 1 }] },
      { intent: 'debuff', label: '照亮', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
    ] },
  { id: 'lantern_twin_b', name: '紙燈籠雙子・乙', hp: [30, 32], pool: '中', pattern: 'cycle', size: 'small', art: 'codex/monster_lantern_twin',
    reviveGroup: 'twins', reviveHp: 12,
    line: '（往甲那邊靠了靠）', lines: ['（火光更旺了）', '（紙面上的臉笑了）'], moves: [
      { intent: 'attack', label: '燈火', effects: [{ kind: 'damage', amount: 9 }] },
      { intent: 'block', label: '護火', effects: [{ kind: 'blockAllies', amount: 5 }] },
    ] },
  // ===== 2026-09-04 第三波（方案丙：塔頂 3 隻＋菁英 2 組） =====
  { id: 'miasma_crows', name: '魔氣鴉群', hp: [70, 76], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_miasma_crows',
    flying: 1, splitInto: { enemyId: 'crow_small', n: 2, below: 0.5 },   // 半血散成兩群小鴉
    line: '（嘎——嘎——）', lines: ['（黑影遮住了火把）', '（幾十雙紅眼睛）'], moves: [
      { intent: 'attack', label: '啄擊', effects: [{ kind: 'damage', amount: 6, times: 3 }] },
      { intent: 'debuff', label: '遮天', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }] },
      { intent: 'attack', label: '俯衝', effects: [{ kind: 'damage', amount: 18 }] },
    ] },
  { id: 'crow_small', name: '小鴉群', hp: [24, 26], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_crow_small',
    flying: 1,
    line: '（嘎）', lines: ['（撲翅）', '（繞著頭頂飛）'], moves: [
      { intent: 'attack', label: '啄', effects: [{ kind: 'damage', amount: 7 }] },
      { intent: 'debuff', label: '亂飛', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
    ] },
  { id: 'wraith_samurai', name: '怨靈武者', hp: [80, 86], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_wraith_samurai',
    thorns: 3, fadeAfter: 6,   // 六回合內打不死就散去（沒戰利品）；碰牠會被反彈
    line: '（鎧甲裡沒有人）', lines: ['……回去。', '（刀鞘裡傳出低語）'], moves: [
      { intent: 'attack', label: '怨斬', effects: [{ kind: 'damage', amount: 16 }] },
      { intent: 'debuff', label: '怨念', effects: [{ kind: 'statusPlayer', name: '翻肚', amount: 1 }, { kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
      { intent: 'block', label: '殘影', effects: [{ kind: 'block', amount: 12 }, { kind: 'statusSelf', name: '反彈', amount: 1 }] },
    ] },
  { id: 'twin_hound', name: '雙頭魔犬', hp: [84, 90], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_twin_hound',
    angerOnSkill: 1,   // 你每打一張技能牌牠就多 1 爪力
    line: '（兩張嘴同時低吼）', lines: ['（左邊的頭先咬）', '（右邊的頭流著口水）'], moves: [
      { intent: 'attack', label: '雙咬', effects: [{ kind: 'damage', amount: 9, times: 2 }] },
      { intent: 'buff', label: '咆哮', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
      { intent: 'attack', label: '撲殺', effects: [{ kind: 'damage', amount: 22 }] },
    ] },
  { id: 'guardian_statue', name: '塔頂守護石像', hp: [230, 240], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_guardian_statue',
    plating: 8, thorns: 5, strengthEveryNTurns: 3,   // 唯一的硬體菁英：每回合長甲、碰牠反彈、慢慢變強
    line: '（石眼亮起紫光）', lines: ['（石縫裡落下碎屑）', '（沉重的一步，地面震了一下）'], moves: [
      { intent: 'attack', label: '石拳', effects: [{ kind: 'damage', amount: 20 }] },
      { intent: 'attack', label: '震地', effects: [{ kind: 'damage', amount: 12, times: 2 }] },
      { intent: 'debuff', label: '石化凝視', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'block', amount: 15 }] },
    ] },
  // 面具舞者：每三回合換一張面具（笑→怒→泣），九招輪一圈；chooseMove 直接用回合數挑
  { id: 'mask_dancer', name: '面具舞者', hp: [200, 210], pool: '大魔物', pattern: 'cycle', size: 'medium', art: 'codex/monster_mask_dancer',
    chooseMove: (turn, moves) => moves[(turn - 1) % moves.length],
    line: '（換上笑面）', lines: ['（面具後面沒有聲音）', '（腳尖點地，轉了一圈）'], moves: [
      { intent: 'attack', label: '笑面・扇舞', effects: [{ kind: 'damage', amount: 10, times: 2 }] },
      { intent: 'attack', label: '笑面・連拍', effects: [{ kind: 'damage', amount: 6, times: 3 }] },
      { intent: 'attack', label: '笑面・踢', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'attack', label: '怒面・怒斬', effects: [{ kind: 'damage', amount: 18, pierce: true }] },
      { intent: 'buff', label: '怒面・蓄怒', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }, { kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '怒面・怒踏', effects: [{ kind: 'damage', amount: 14, times: 2 }] },
      { intent: 'special', label: '泣面・拭淚', effects: [{ kind: 'heal', n: 20 }] },
      { intent: 'debuff', label: '泣面・淚眼', effects: [{ kind: 'giveCard', cardId: 'dazed_card', n: 2, to: 'discard' }] },
      { intent: 'block', label: '泣面・掩面', effects: [{ kind: 'block', amount: 20 }] },
    ] },
];

/**
 * 塔主每一招的專屬立繪，鍵就是招式名。
 * **加新招一定要一起加這裡**，否則畫面會靜靜退回待機圖、看不出來少了什麼——
 * `tests/ui/cardtext.test.ts` 有一條會擋住這種漏配。
 */
export const BOSS_MOVE_ART: Record<string, string> = {
  // 蓄力、閉關兩招在師父 3.0 拿掉了（boss/charge 那張圖先留著）
  鐵頭功: 'boss/headbutt', 金鐘罩: 'boss/guard', 獅吼功: 'boss/roar', 醉拳: 'boss/drunk',
  // 三階段重做（2026-09-01）加的招，先共用最接近的現有立繪
  沾衣十八跌: 'boss/palm', 十二連環: 'boss/palm', 亡命一擊: 'boss/headbutt', 破功: 'boss/palm', 狂風連掌: 'boss/drunk', 蹲下調息: 'boss/seclude',
  氣沉丹田: 'boss/seclude', 拆招: 'boss/palm', 穿心掌: 'boss/palm', 看破: 'boss/roar',
};
/**
 * 二、三階段自己的出招立繪（2026-09-02，使用者：「師傅三個階段外觀都一樣」）。
 * 索引＝階段（[0] 給第二階段、[1] 給第三階段）；圖還沒生好時畫面會退回 BOSS_MOVE_ART 的第一階段圖。
 */
export const BOSS_MOVE_ART_PHASE: Record<string, string>[] = [
  // 後半是上一階段宣告、跨線後才出的招（血量在玩家回合跨線時會發生），也配本階段最接近的圖，不退回第一階段
  { 十二連環: 'boss/palm2', 穿心掌: 'boss/palm2', 狂風連掌: 'boss/drunk2', 金鐘罩: 'boss/guard2', 醉拳: 'boss/drunk2',
    拆招: 'boss/palm2', 沾衣十八跌: 'boss/palm2', 鐵頭功: 'boss/palm2', 獅吼功: 'boss/drunk2', 蹲下調息: 'boss/guard2' },
  { 亡命一擊: 'boss/headbutt3', 破功: 'boss/palm3', 狂風連掌: 'boss/palm3', 氣沉丹田: 'boss/guard3', 看破: 'boss/palm3',
    十二連環: 'boss/palm3', 穿心掌: 'boss/palm3', 金鐘罩: 'boss/guard3', 醉拳: 'boss/palm3', 蹲下調息: 'boss/guard3' },   // 換血條時的蹲下調息也用本階段的圖（guard3 就是打坐）
];
/** 塔主的非招式立繪：三個階段各一張待機（深藏不露／走火入魔／真面目）、戰敗（承讓） */
export const BOSS_ART = { idle1: 'boss/idle1', idle2: 'boss/idle2', idle3: 'boss/idle3', defeat: 'boss/defeat' } as const;

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
  { id: 'white_duelist', pool: '召喚', enemies: ['white_duelist', 'sparring_partner'] },
  { id: 'white_duelist_a2', pool: '召喚', enemies: ['white_duelist', 'sparring_partner'], hpScale: 1.35, strength: 3, acts: [] },
  { id: 'white_duelist_a3', pool: '召喚', enemies: ['white_duelist', 'sparring_partner', 'sparring_partner'], hpScale: 1.5, strength: 6, acts: [] },
  // 鏡子走廊：事件寫 mirror_duel，引擎依關數接成 _a2／_a3，找不到就打基本版（見 run.ts 的 fight）
  { id: 'mirror_duel', pool: '召喚', enemies: ['mirror_qiuqiu'] },   // 第一關用這個基本版（沒有 _a1）
  { id: 'mirror_duel_a2', pool: '召喚', enemies: ['mirror_qiuqiu'], hpScale: 1.4, strength: 3, acts: [] },
  { id: 'mirror_duel_a3', pool: '召喚', enemies: ['mirror_qiuqiu'], hpScale: 1.8, strength: 6, acts: [] },
  // 2026-09-04 使用者：「事件怪有點爛」——事件對手原本第二三關還在打第一關的怪。
  // 引擎會先找 `<遭遇>_a<關數>`，找不到才退回基本版（run.ts 的 fight），所以只要補這幾筆就跟著關卡變強。
  { id: 'orange_bandit_a2', pool: '中', enemies: ['orange_bandit', 'orange_bandit'], hpScale: 1.3, strength: 3, acts: [] },
  { id: 'orange_bandit_a3', pool: '中', enemies: ['orange_bandit', 'orange_bandit'], hpScale: 1.7, strength: 6, acts: [] },
  { id: 'orange_bandit_pair_a2', pool: '中', enemies: ['orange_bandit', 'orange_bandit', 'orange_bandit'], hpScale: 1.2, strength: 3, acts: [] },
  { id: 'orange_bandit_pair_a3', pool: '中', enemies: ['orange_bandit', 'orange_bandit', 'orange_bandit', 'orange_bandit'], hpScale: 1.4, strength: 6, acts: [] },
  { id: 'rats3_a2', pool: '弱', enemies: ['rat', 'rat', 'rat', 'rat'], hpScale: 3, strength: 4, acts: [] },
  { id: 'rats3_a3', pool: '弱', enemies: ['rat', 'rat', 'rat', 'rat', 'rat'], hpScale: 4.5, strength: 7, acts: [] },
  { id: 'wood_dummy_a2', pool: '弱', enemies: ['wood_dummy'], hpScale: 2.4, strength: 5, acts: [] },
  { id: 'wood_dummy_a3', pool: '弱', enemies: ['wood_dummy'], hpScale: 3.4, strength: 9, acts: [] },
  { id: 'orange_bandit', pool: '中', enemies: ['orange_bandit'], acts: [1] },
  { id: 'orange_bandit_pair', pool: '中', enemies: ['orange_bandit', 'orange_bandit', 'orange_bandit'], hpScale: 0.8, acts: [] },   // 事件「山賊帶朋友來了」專用：acts 空＝不進任何一關的隨機池；三隻各八成血（2026-09-04）
  { id: 'catgrass_bugs', pool: '中', enemies: ['catgrass_bug', 'catgrass_bug'], acts: [1] },
  { id: 'scarecrow', pool: '強', enemies: ['scarecrow'], acts: [1] },
  { id: 'black_ninja_duo', pool: '強', enemies: ['black_ninja_elite', 'black_ninja_elite'], hpScale: 0.75, acts: [1] },
  { id: 'big_cucumber', pool: '強', enemies: ['big_cucumber'], acts: [1] },
  // 精英分關：塔中照本體數值；塔頂的菁英各自標 hpScale／strength（2026-09-04 起：影球球 1.2×／9、鏡仙與虛無貓 1.2×／10、鬼將 5），黑貓頭目／掃地機王／三花貓武僧的塔頂版已拿掉。
  // 2026-09-02 機器人 200 局：精英在 29～31F 平均只掉 2～4 血、影球球 0.8 血，比一般戰還軟。
  { id: 'ninja_boss', pool: '大魔物', enemies: ['ninja_boss'], acts: [2] },
  // 巨型飯糰＝第一關的福利菁英（使用者 2026-09-03：只放第一關才會隨機出現，當作福利）：血 100（125×0.8）、打倒回 10 血
  { id: 'giant_onigiri', pool: '大魔物', enemies: ['giant_onigiri'], hpScale: 0.8, acts: [1] },
  { id: 'tower_master', pool: '塔主', enemies: ['tower_master'] },
  // ===== 三關制內容包（2026-09-01）：塔中/塔頂專屬池；雙怪照慣例 0.8 血 =====
  { id: 'shiba_ronin', pool: '中', enemies: ['shiba_ronin'], acts: [2] },
  { id: 'shamisen_cat', pool: '中', enemies: ['shamisen_cat'], acts: [2] },
  { id: 'lantern_ghost', pool: '中', enemies: ['lantern_ghost'], acts: [2] },
  { id: 'windchime_sprite', pool: '中', enemies: ['windchime_sprite'], acts: [2] },
  { id: 'tanuki_kid', pool: '中', enemies: ['tanuki_kid'], acts: [2], reinforce: [{ turn: 3, enemyId: 'tanuki_kid', line: '伏兵！又一隻小狸從草叢裡滾了出來' }] },   // 伏兵（2026-09-04）
  { id: 'geta_monster', pool: '中', enemies: ['geta_monster'], acts: [2] },
  { id: 'ronin_duo', pool: '強', enemies: ['shiba_ronin', 'shamisen_cat'], hpScale: 0.8, acts: [2] },
  { id: 'lantern_pair', pool: '強', enemies: ['lantern_ghost', 'windchime_sprite'], hpScale: 0.8, acts: [2] },
  // ink_cat＋geta_monster 探測 7/40 是殺手組（隱身＋雙 12 重踩疊在一起），拆開改配三味線
  { id: 'tanuki_gang', pool: '強', enemies: ['tanuki_kid', 'tanuki_kid', 'tanuki_kid'], hpScale: 0.9, acts: [2] },   // 兩隻探測 40/40 太軟，改三兄弟 0.9
  // 2026-09-02 使用者：「第二層一直遇到重複的」——塔中 5～13F 的強池原本只有五組、塔頂只有三組，
  // 一關九場架從三五組裡抽，當然一直重複。用現有魔物再組四組，配上地圖「同一關不重複抽」的規則。
  { id: 'shiba_geta', pool: '強', enemies: ['shiba_ronin', 'geta_monster'], hpScale: 0.8, acts: [2] },
  { id: 'chime_duo', pool: '強', enemies: ['windchime_sprite', 'windchime_sprite'], hpScale: 0.85, acts: [2] },
  { id: 'tanuki_shami', pool: '強', enemies: ['tanuki_kid', 'shamisen_cat'], hpScale: 0.85, acts: [2] },
  // 2026-09-02 補怪：塔中單怪 7→10、強池再加兩組
  { id: 'kasa_obake', pool: '中', enemies: ['kasa_obake'], acts: [2] },
  { id: 'kappa', pool: '中', enemies: ['kappa'], acts: [2], reinforce: [{ turn: 3, enemyId: 'tadpole', n: 2, line: '伏兵！河童吹了聲口哨，兩隻蝌蚪兵從水裡鑽出來' }] },   // 伏兵（2026-09-04）
  { id: 'tofu_boy', pool: '中', enemies: ['tofu_boy'], acts: [2] },
  { id: 'kasa_tofu', pool: '強', enemies: ['kasa_obake', 'tofu_boy'], hpScale: 0.85, acts: [2] },
  { id: 'kappa_geta', pool: '強', enemies: ['kappa', 'geta_monster'], hpScale: 0.8, acts: [2] },
  // 2026-09-03 換池（使用者：形象與機制要隨關數上升）：月兔、貓頭鷹哨兵、紙鶴從塔頂降到塔中
  { id: 'moon_rabbit', pool: '中', enemies: ['moon_rabbit'], acts: [2] },
  { id: 'owl_sentry', pool: '中', enemies: ['owl_sentry'], acts: [2] },
  { id: 'paper_crane', pool: '中', enemies: ['paper_crane'], acts: [2] },
  { id: 'crane_pair', pool: '強', enemies: ['paper_crane', 'paper_crane'], hpScale: 0.75, acts: [2] },
  { id: 'owl_rabbit', pool: '強', enemies: ['owl_sentry', 'moon_rabbit'], hpScale: 0.8, acts: [2] },
  { id: 'rabbit_shami', pool: '強', enemies: ['moon_rabbit', 'shamisen_cat'], hpScale: 0.8, acts: [2] },
  { id: 'crane_lantern', pool: '強', enemies: ['paper_crane', 'lantern_ghost'], hpScale: 0.8, acts: [2] },
  { id: 'owl_geta', pool: '強', enemies: ['owl_sentry', 'geta_monster'], hpScale: 0.8, acts: [2] },
  // 塔頂＝魔氣加成（設計總覽 §2）：中池一律血 ×1.2、出場帶 2 點爪力；強池帶 3 點。
  // 2026-09-02 機器人 300 局：第一刀之後塔頂一般戰每場仍只掉 1～3 血、四回合打完，比塔中還軟。
  { id: 'night_panther', pool: '中', enemies: ['night_panther'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'miasma_blob', pool: '強', enemies: ['miasma_blob'], hpScale: 1.6, strength: 8, acts: [3] , reinforce: [{ turn: 4, enemyId: 'paper_crane', hpScale: 0.5, strength: 3, line: '伏兵！一隻紙鶴從樑上飄了下來' }] },   // 伏兵（2026-09-04）：壓回小怪量級（不然照 1.6×＋8 爪力放大會是 98 血 8 爪力，稽核中 8）
  // 塔頂雙怪組的教訓（探測 1～6/40）：血量倍率救不了「兩隻重砲同回合疊擊」，
  // 要拆組合——重砲一定配有守勢回合的（紙鶴會摺翼、墨貓會入卷軸那型）。
  // 貓頭鷹＋月兔那組直接砍掉，牠們照樣在中池單獨出場。
  // 2026-09-02 補怪：塔頂單怪 4→7、強池再加三組（空鎧武者血厚，倍率壓低）
  { id: 'tengu', pool: '中', enemies: ['tengu'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'fox_miko', pool: '中', enemies: ['fox_miko'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'armor_ghost', pool: '中', enemies: ['armor_ghost'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'shadow_cat', pool: '大魔物', enemies: ['shadow_cat'], hpScale: 1.2, strength: 9, acts: [3] },   // 塔頂菁英版：血 1.2×、魔氣 9（2026-09-04 加硬兩刀 4→7→9）
  { id: 'shadow_cat_prefight', pool: '大魔物', enemies: ['shadow_cat'], strength: 4, acts: [] },   // 難度 5 最終戰前哨戰專用（acts 空＝不進菁英池）；跟塔頂菁英的加硬脫鉤（稽核 2026-09-04 中 4）
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
  { id: 'roomba_king', pool: '大魔物', enemies: ['roomba_king'], acts: [2] },
  { id: 'calico_monk', pool: '大魔物', enemies: ['calico_monk'], acts: [2] },
  // 混編：用既有的怪兩兩配對，不用新美術就能立刻多出變化。
  // 配對原則是「兩隻的路數要互補」，逼玩家取捨先打哪一隻。
  { id: 'rat_soy', pool: '弱', enemies: ['rat', 'soy_bottle'], acts: [1] },
  { id: 'cucumber_yarn', pool: '弱', enemies: ['cucumber', 'yarn_ball'], acts: [1] },
  { id: 'bug_hedgehog', pool: '中', enemies: ['catgrass_bug', 'hedgehog'], acts: [1] },
  // 這兩組是「兩隻全規格中型怪同場」（合計 82～90 血），實測 6F 的典型牌組
  // 對它們勝率只有 2%／7%、其他中型遭遇都是 92% 起——放錯池了，移到強池（11F+）
  { id: 'ninja_can', pool: '強', enemies: ['black_ninja', 'can_spirit'], hpScale: 0.8, acts: [1] },
  { id: 'vacuum_claw', pool: '強', enemies: ['vacuum', 'five_claw'], hpScale: 0.7, acts: [1] },   // 機器人會輸 18%，但真人三輪都一次過（使用者 2026-09-03），維持 0.7
  { id: 'bandit_chipmunk', pool: '中', enemies: ['orange_bandit', 'chipmunk'], acts: [1] },
  // 石獅子＋鏡子貓：兩隻都會自己疊爪力，0.7 倍血在第一關仍 15/44 敗（機器人 300 局），搬到塔中強池才合身
  { id: 'lion_mirror', pool: '強', enemies: ['stone_lion', 'mirror_cat'], hpScale: 0.8, acts: [2] },
  { id: 'centipede_mirror', pool: '強', enemies: ['broom_centipede', 'mirror_cat'], hpScale: 0.7, acts: [1] },
  { id: 'shadow_kittens', pool: '強', enemies: ['shadow_kitten_a', 'shadow_kitten_b', 'shadow_kitten_c'], hpScale: 0.7, acts: [1] },   // 機器人輸 20%、真人不覺得兇，維持 0.7
  { id: 'training_post', pool: '中', enemies: ['training_post'], acts: [1] },
  { id: 'phantom_ninja', pool: '強', enemies: ['catnip_phantom', 'black_ninja_elite'], hpScale: 0.75, acts: [1] },

  // ===== 2026-09-02 第二波怪的遭遇（設計稿 §2）=====
  // 塔下：分裂、縮殼、飛行、沉睡各一隻，配上一組同伴戰
  { id: 'dango_slime', pool: '弱', enemies: ['dango_slime'], acts: [1] },
  { id: 'armadillo_pup', pool: '弱', enemies: ['armadillo_pup'], acts: [1] },
  { id: 'armadillo_pair', pool: '弱', enemies: ['armadillo_pup', 'armadillo_pup'], acts: [1] },
  { id: 'lantern_moth', pool: '中', enemies: ['lantern_moth'], acts: [1] },
  { id: 'moth_bug', pool: '中', enemies: ['lantern_moth', 'catgrass_bug'], hpScale: 0.85, acts: [1] },
  { id: 'hibernating_bear', pool: '強', enemies: ['hibernating_bear'], acts: [1] },
  // 熊還在睡的時候，旁邊那隻犰狳寶寶會一直吵你——先清哪一隻是這場的題目
  { id: 'bear_pup', pool: '強', enemies: ['hibernating_bear', 'armadillo_pup'], hpScale: 0.8, acts: [1] },
  // 塔中：自爆、鱗甲、指揮官、詛咒
  { id: 'puffer_spirit', pool: '強', enemies: ['puffer_spirit'], acts: [2] },
  // 塔頂：照塔頂慣例掛魔氣（strength 3），單獨出場血 ×1.25、重砲型 ×1.1
  { id: 'phantom_fox', pool: '中', enemies: ['phantom_fox'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'red_oni', pool: '強', enemies: ['red_oni'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'moon_moth_queen', pool: '中', enemies: ['moon_moth_queen'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'jizo_golem', pool: '強', enemies: ['jizo_golem'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'fox_moth', pool: '強', enemies: ['phantom_fox', 'moon_moth_queen'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'oni_golem', pool: '強', enemies: ['red_oni', 'jizo_golem'], hpScale: 1.0, strength: 6, acts: [3] },
  // 2026-09-03 換池：墨貓、鎧甲甲蟲、鼠將軍一夥、詛咒法師從塔中升到塔頂，照塔頂慣例掛魔氣
  { id: 'ink_cat', pool: '中', enemies: ['ink_cat'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'plated_beetle', pool: '中', enemies: ['plated_beetle'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'curse_priest', pool: '中', enemies: ['curse_priest'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'rat_general', pool: '強', enemies: ['rat_general', 'rat', 'rat'], hpScale: 1.2, strength: 6, acts: [3] },
  { id: 'ink_panther', pool: '強', enemies: ['ink_cat', 'night_panther'], hpScale: 1.0, strength: 6, acts: [3] },   // 機器人輸 32%、真人不覺得兇，維持魔氣 6
  { id: 'beetle_armor', pool: '強', enemies: ['plated_beetle', 'armor_ghost'], hpScale: 1.0, strength: 6, acts: [3] },   // 機器人輸 33%、真人不覺得兇，維持魔氣 6
  { id: 'priest_fox', pool: '強', enemies: ['curse_priest', 'fox_miko'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'priest_moth', pool: '強', enemies: ['curse_priest', 'moon_moth_queen'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'tengu_beetle', pool: '強', enemies: ['tengu', 'plated_beetle'], hpScale: 1.0, strength: 6, acts: [3] },   // 機器人輸 22%、真人不覺得兇，維持魔氣 6
  { id: 'blob_ink', pool: '強', enemies: ['miasma_blob', 'ink_cat'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'panther_fox', pool: '強', enemies: ['night_panther', 'phantom_fox'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'tengu_priest', pool: '強', enemies: ['tengu', 'curse_priest'], hpScale: 1.0, strength: 6, acts: [3] },
  // 新關主（塔下兩個、塔中兩個）
  { id: 'frog_daimyo', pool: '塔主', enemies: ['frog_daimyo'] },
  { id: 'armadillo_king', pool: '塔主', enemies: ['armadillo_king'] },
  { id: 'dragon_cat', pool: '塔主', enemies: ['dragon_cat'] },
  { id: 'hex_abbot', pool: '塔主', enemies: ['hex_abbot'] },

  // ===== 2026-09-03 菁英擴充（設計稿 §2）：每關 3 隻 =====
  // 血量就是魔物本身的值，不另外掛 hpScale；第三關照塔頂慣例帶魔氣 5（跟既有的 _top 加強版同一個口徑）。
  // 塔頂版 ninja_boss_top、roomba_king_top、calico_monk_top 已於 2026-09-04 全部拿掉（使用者：這三隻不在塔頂出現）（giant_onigiri 已改成第一關福利菁英），這裡只加不換。
  { id: 'wild_boar', pool: '大魔物', enemies: ['wild_boar'], acts: [1] },
  { id: 'paper_tiger', pool: '大魔物', enemies: ['paper_tiger'], acts: [1] },
  { id: 'drum_tanuki', pool: '大魔物', enemies: ['drum_tanuki'], acts: [1] },
  { id: 'iron_arhat', pool: '大魔物', enemies: ['iron_arhat'], acts: [2] },
  { id: 'shadow_spider', pool: '大魔物', enemies: ['shadow_spider'], acts: [2] },
  { id: 'drunk_dog', pool: '大魔物', enemies: ['drunk_dog'], acts: [2] },
  // 鬼將帶兩隻小鬼上場（跟波斯大小姐帶執事貓、女僕貓同一套）：三隻同一組，要一起清光才算贏
  { id: 'oni_general', pool: '大魔物', enemies: ['oni_general', 'imp', 'imp'], strength: 5, acts: [3] },   // 魔氣 5（三隻共享；2026-09-03 曾 5→4 因機器人 21 場輸 11，2026-09-04 塔頂菁英加硬回 5，小鬼一下 11）
  { id: 'mirror_sage', pool: '大魔物', enemies: ['mirror_sage'], hpScale: 1.2, strength: 10, acts: [3] },   // 血 1.2×、魔氣 10（2026-09-04 加硬兩刀 6→8→10）
  { id: 'void_cat', pool: '大魔物', enemies: ['void_cat'], hpScale: 1.2, strength: 10, acts: [3] },   // 血 1.2×、魔氣 10（2026-09-04 加硬兩刀 6→8→10；機器人到塔頂樣本少，以真人為準）

  // ===== 2026-09-04 第三波遭遇（立繪已於 art_wave3.sh 接入後開放） =====
  { id: 'snow_cat', pool: '中', enemies: ['snow_cat'], acts: [2] },
  { id: 'fortune_cat', pool: '中', enemies: ['fortune_cat'], acts: [2] },
  { id: 'lantern_fish', pool: '中', enemies: ['lantern_fish'], acts: [2] },
  { id: 'puppeteer', pool: '中', enemies: ['puppeteer'], acts: [2] },
  { id: 'shuten_imp', pool: '中', enemies: ['shuten_imp'], acts: [2] },
  { id: 'snow_shamisen', pool: '強', enemies: ['snow_cat', 'shamisen_cat'], hpScale: 0.8, acts: [2] },
  { id: 'fortune_tanuki', pool: '強', enemies: ['fortune_cat', 'tanuki_kid'], hpScale: 0.8, acts: [2] },
  { id: 'lanternfish_rabbit', pool: '強', enemies: ['lantern_fish', 'moon_rabbit'], hpScale: 0.8, acts: [2] },
  { id: 'puppeteer_geta', pool: '強', enemies: ['puppeteer', 'geta_monster'], hpScale: 0.8, acts: [2] },
  { id: 'shuten_ronin', pool: '強', enemies: ['shuten_imp', 'shiba_ronin'], hpScale: 0.8, acts: [2] },
  { id: 'snow_lantern', pool: '強', enemies: ['snow_cat', 'lantern_ghost'], hpScale: 0.8, acts: [2] },
  { id: 'fortune_chime', pool: '強', enemies: ['fortune_cat', 'windchime_sprite'], hpScale: 0.8, acts: [2] },
  { id: 'lanternfish_crane', pool: '強', enemies: ['lantern_fish', 'paper_crane'], hpScale: 0.8, acts: [2] },
  { id: 'shuten_kappa', pool: '強', enemies: ['shuten_imp', 'kappa'], hpScale: 0.8, acts: [2] },
  { id: 'puppeteer_tofu', pool: '強', enemies: ['puppeteer', 'tofu_boy'], hpScale: 0.85, acts: [2] },
  { id: 'snow_shuten', pool: '強', enemies: ['snow_cat', 'shuten_imp'], hpScale: 0.8, acts: [2] },
  { id: 'lantern_twins', pool: '強', enemies: ['lantern_twin_a', 'lantern_twin_b'], acts: [2] },
  { id: 'miasma_crows', pool: '中', enemies: ['miasma_crows'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'wraith_samurai', pool: '中', enemies: ['wraith_samurai'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'twin_hound', pool: '中', enemies: ['twin_hound'], hpScale: 1.6, strength: 8, acts: [3] },
  { id: 'crows_ink', pool: '強', enemies: ['miasma_crows', 'ink_cat'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'wraith_armor', pool: '強', enemies: ['wraith_samurai', 'armor_ghost'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'hound_panther', pool: '強', enemies: ['twin_hound', 'night_panther'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'wraith_priest', pool: '強', enemies: ['wraith_samurai', 'curse_priest'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'hound_crows', pool: '強', enemies: ['twin_hound', 'miasma_crows'], hpScale: 1.0, strength: 6, acts: [3] },
  { id: 'guardian_statue', pool: '大魔物', enemies: ['guardian_statue'], strength: 6, acts: [3] },
  { id: 'mask_dancer', pool: '大魔物', enemies: ['mask_dancer'], strength: 6, acts: [3] },
];

export const encounterById: Record<string, EncounterDef> = Object.fromEntries(encounters.map((e) => [e.id, e]));

export function encountersOfPool(pool: EnemyPool, act?: number): EncounterDef[] {
  return encounters.filter((e) => e.pool === pool && !e.hidden && (act === undefined || !e.acts || e.acts.includes(act)));
}

/**
 * 這隻魔物出手前要不要先亮半拍的預告（使用者 2026-09-04 拍板：只給關主與菁英）。
 *
 * 小怪不亮是刻意的：預告會變成一種訊號——會蹲下去的那隻才是重點。
 * 順帶一提，關主帶的僕從（執事貓、女僕貓、小鬼）算「召喚」不算菁英，所以也不亮。
 */
export function showsTelegraph(enemyId: string): boolean {
  const pool = enemyById[enemyId]?.pool;
  return pool === '塔主' || pool === '大魔物';
}
