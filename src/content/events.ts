import type { EventDef } from '../engine/types';

export const FIXED_EVENT_FLOOR_5 = 'daxia_teach';

export const events: EventDef[] = [
  { id: 'daxia_teach', title: '大俠傳功', fixedFloor: 5,
    text: '樓梯間掉著一本秘笈，封面被貓爪抓得毛毛的。翻開第一頁，是師父的字。',
    choices: [
      { label: '翻開秘笈（從 3 張絕學裡挑 1 張）', outcome: [{ kind: 'chooseCard', pool: '絕學', n: 3 }], result: '球球挑了一招記在腦子裡。球球：「師父的字好醜，可是招式好強喵。」' },
      { label: '放回原位', outcome: [], result: '球球把秘笈放回去。球球：「等抓到師父，叫他親自教我喵。」' },
    ] },
  { id: 'toll', title: '留下買路財',
    text: '轉角站著一隻橘貓山賊，手裡的木棒比牠還長。「留下買路財！」牠喊得很大聲，腿在抖。',
    choices: [
      { label: '付 30 條小魚乾買路', costFish: 30, outcome: [], result: '山賊數了三遍才讓路。球球：「數這麼慢，你是第一天當山賊喵？」' },
      { label: '打一場（贏了多拿 40 條小魚乾）', outcome: [{ kind: 'fight', encounterId: 'orange_bandit', bonusFish: 40 }], result: '球球：「小魚乾是我的，不給喵。」' },
    ] },
  { id: 'robin', title: '劫富濟貧',
    text: '一群餓到肚子叫的村貓縮在角落，牠們的小魚乾被魔物搶光了。',
    choices: [
      { label: '分一半小魚乾給牠們（回復 15 點生命、移除一張牌）', outcome: [{ kind: 'fishHalve' }, { kind: 'heal', n: 15 }, { kind: 'removeCard' }], result: '村貓們圍過來幫球球梳毛，順手梳掉一張不順手的牌。球球：「不用謝，江湖規矩喵。」' },
      { label: '裝作沒看到', outcome: [], result: '球球走過去，沒有回頭。球球：「我自己也快沒小魚乾了喵……」' },
    ] },
  { id: 'rescue', title: '江湖救急',
    text: '一隻受傷的村貓趴在地上，旁邊放著牠最後一包小魚乾和一罐貓草藥。「幫我……隨便拿一樣走。」',
    choices: [
      { label: '拿貓草藥（回復 20 點生命）', outcome: [{ kind: 'heal', n: 20 }], result: '藥很苦。球球：「苦的才有效喵。」' },
      { label: '拿小魚乾（拿 40 條小魚乾）', outcome: [{ kind: 'fish', n: 40 }], result: '村貓揮揮手要球球快走。球球：「我會把塔主打下來還你喵。」' },
    ] },
  { id: 'blocked', title: '此路不通',
    text: '樓梯被一座垃圾山堵住，最上面插著一塊牌子：此路不通。牌子是新的。',
    choices: [
      { label: '硬翻過去（受 6 點傷害，撿到一張罕見忍術牌）', outcome: [{ kind: 'damage', n: 6 }, { kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }], result: '球球滾下來的時候撿到一張別人掉的忍術卷。球球：「痛是痛，但值得喵。」' },
      { label: '繞路', outcome: [], result: '多走了半層樓。球球：「牌子是誰立的，我記住了喵。」' },
    ] },
  { id: 'seclusion', title: '閉關',
    text: '一間沒人的小房間，牆上刻滿爪痕，看得出有貓在這裡練過很久。',
    choices: [
      { label: '修行一晚（升級一張牌）', outcome: [{ kind: 'upgradeCard' }], result: '球球對著牆練到天亮，有一招順了。球球：「原來要這樣喵。」' },
      { label: '打坐（回復 10 點生命）', outcome: [{ kind: 'heal', n: 10 }], result: '球球盤腿坐著，三分鐘後睡著了。球球：「有休息到就好喵。」' },
    ] },
  { id: 'hidden_box', title: '深藏不露',
    text: '牆縫裡卡著一個箱子，上面有個紙條：「別拿。」字跡跟秘笈很像。',
    choices: [
      { label: '硬拿（拿一件常見秘寶，但會塞一張壞毛病）', outcome: [{ kind: 'relic', pool: '常見' }, { kind: 'addCard', cardId: 'zhongji' }], result: '箱子裡有寶物，也有一個彈簧拳頭。球球：「師父你真的很幼稚喵。」' },
      { label: '聽話不拿', outcome: [], result: '球球看了三秒，走了。球球：「回來再拿喵。」' },
    ] },
  { id: 'sunbath', title: '曬太陽',
    text: '窗邊有一塊被太陽曬得暖暖的地板，形狀剛好是一隻貓。',
    choices: [
      { label: '打盹（回復 12 點生命）', outcome: [{ kind: 'heal', n: 12 }], result: '球球睡到翻肚。球球：「再五分鐘喵。」' },
      { label: '躺著想事情（移除一張牌）', outcome: [{ kind: 'removeCard' }], result: '球球想通了一件事，決定不再用那一招。球球：「丟掉比較輕喵。」' },
    ] },
  { id: 'rat_stall', title: '可疑的飯糰攤',
    text: '一隻老鼠推著攤車在賣飯糰，飯糰上面有牙印。「特價，二十小魚乾，吃了會變強。」',
    choices: [
      { label: '買一顆（20 條小魚乾，一半機率最大生命 +5、一半機率多一張壞毛病）', costFish: 20,
        outcome: [{ kind: 'gamble', p: 0.5, win: [{ kind: 'maxHp', n: 5 }], lose: [{ kind: 'addCard', cardId: 'shishou' }] }],
        result: '球球一口吞了。球球：「有牙印的飯糰，吃起來也是飯糰喵。」' },
      { label: '不買', outcome: [], result: '老鼠老闆翻了個白眼。球球：「你自己先吃一顆給我看喵。」' },
    ] },
  { id: 'lost_kitten', title: '迷路的小黑貓',
    text: '一隻小黑貓坐在樓梯上哭，脖子上綁著黑貓忍者的頭巾，尺寸太大，蓋住半張臉。',
    choices: [
      { label: '帶著牠一起走（拿 2 個忍具）', outcome: [{ kind: 'potions', n: 2 }], result: '小黑貓從頭巾裡掏出兩個忍具塞給球球，然後跳上牠的背。球球：「好啦好啦，抓穩喵。」' },
      { label: '指路讓牠自己回去（拿 15 條小魚乾）', outcome: [{ kind: 'fish', n: 15 }], result: '小黑貓留下一小把小魚乾當謝禮。球球：「小心不要再迷路喵。」' },
    ] },
  // ===== 2026-08-31 補 20 個。本來只有 10 個，兩三局就全看過 =====

  { id: 'old_well', title: '古井',
    text: '院子中央有一口井，往下看只看得到自己的倒影。旁邊立著一塊牌子：「投錢，許願。」',
    choices: [
      { label: '投 30 條小魚乾許願（一半機率拿到秘寶，一半機率什麼都沒有）', costFish: 30,
        outcome: [{ kind: 'gamble', p: 0.5, win: [{ kind: 'relic', pool: '常見' }], lose: [] }],
        result: '井底傳來一聲悶響。' },
      { label: '對著倒影練招（升級一張牌）', outcome: [{ kind: 'upgradeCard' }], result: '球球看著水裡的自己，把一招磨順了。球球：「原來我出手是這樣喵。」' },
      { label: '走開', outcome: [], result: '球球決定不要跟井裡的自己講話。' },
    ] },

  { id: 'broken_shrine', title: '倒了的神龕',
    text: '一座小神龕倒在牆邊，裡面的貓神像斷成兩半。地上散著幾條小魚乾當供品。',
    choices: [
      { label: '扶起來（最大生命 +6）', outcome: [{ kind: 'maxHp', n: 6 }], result: '球球把神像扶正，心裡踏實了一點。' },
      { label: '拿走供品（＋45 條小魚乾，但多一張壞毛病）', outcome: [{ kind: 'fish', n: 45 }, { kind: 'addCard', cardId: 'zouhuo' }],
        result: '球球拿了就跑，跑到一半覺得背後涼涼的。' },
    ] },

  { id: 'sparring_cat', title: '想切磋的白貓',
    text: '一隻白貓擋在路中間，抱著手臂。「打一場。輸了我讓路，贏了……我也讓路。」',
    choices: [
      { label: '打一場（打贏多拿 60 條小魚乾）', outcome: [{ kind: 'fight', encounterId: 'black_ninja', bonusFish: 60 }], result: '白貓退到旁邊。「不錯。」' },
      { label: '不打（掉 8 點生命，被牠撞開）', outcome: [{ kind: 'damage', n: 8 }], result: '球球被撞得踉蹌了一下。白貓：「沒禮貌。」' },
    ] },

  { id: 'cat_tower', title: '好高的貓抓柱',
    text: '一根貓抓柱從地板頂到天花板，上面全是別隻貓留下的抓痕。',
    choices: [
      { label: '爬到頂（掉 10 點生命，但拿到一個秘寶）', outcome: [{ kind: 'damage', n: 10 }, { kind: 'relic', pool: '常見' }],
        result: '球球累得半死，但頂端真的有東西。' },
      { label: '在下面磨爪（獲得一張罕見的絕學）', outcome: [{ kind: 'addRandomCard', pool: '絕學', rarity: '罕見' }],
        result: '球球磨著磨著，想起了一招。' },
    ] },

  { id: 'lost_scroll', title: '掉在地上的卷軸',
    text: '一卷沒署名的卷軸躺在階梯上，字跡有點潦草。',
    choices: [
      { label: '照著練（挑一張忍術帶走）', outcome: [{ kind: 'chooseCard', pool: '忍術', n: 3 }], result: '球球照著練了一遍。' },
      { label: '拿去賣（＋40 條小魚乾）', outcome: [{ kind: 'fish', n: 40 }], result: '球球把卷軸賣了。球球：「反正看不懂喵。」' },
    ] },

  { id: 'noisy_kitchen', title: '很吵的廚房',
    text: '樓梯轉角有間廚房，鍋子自己在爐上跳。香味很誘人，但也很可疑。',
    choices: [
      { label: '吃一碗（回復一半生命）', outcome: [{ kind: 'healPercent', p: 0.5 }], result: '球球吃得肚子鼓鼓的。' },
      { label: '把鍋子搬走（拿到兩支忍具）', outcome: [{ kind: 'potions', n: 2 }], result: '球球在鍋子裡翻出了有用的東西。' },
      { label: '不碰（什麼都不會發生）', outcome: [], result: '球球繞過去了。' },
    ] },

  { id: 'mirror_hall', title: '鏡子走廊',
    text: '整條走廊兩側都是鏡子，裡面有無數隻球球同時看著你。',
    choices: [
      { label: '跟自己過招（升級兩張牌，但掉 12 點生命）', outcome: [{ kind: 'upgradeCard' }, { kind: 'upgradeCard' }, { kind: 'damage', n: 12 }],
        result: '球球跟鏡子裡的自己打了很久，兩邊都掛彩。' },
      { label: '快步走過（什麼都不會發生）', outcome: [], result: '球球低著頭走過去，不敢看旁邊。' },
    ] },

  { id: 'sleeping_guard', title: '睡著的守衛',
    text: '一隻大橘貓靠著門睡著了，腰間掛著一串鑰匙，還有一個鼓鼓的錢袋。',
    choices: [
      { label: '偷錢袋（＋70 條小魚乾，但要打一場）', outcome: [{ kind: 'fish', n: 70 }, { kind: 'fight', encounterId: 'orange_bandit', bonusFish: 0 }],
        result: '錢袋到手的瞬間，牠睜開了眼睛。' },
      { label: '悄悄走過（獲得 1 層隱身的心得，最大生命 +4）', outcome: [{ kind: 'maxHp', n: 4 }], result: '球球屏住呼吸走過去了。球球：「這才是忍者喵。」' },
    ] },

  { id: 'medicine_cat', title: '賣藥的三花貓',
    text: '一隻三花貓在牆邊擺了個小攤，攤上排著幾個瓶子。「不保證有效，但一定有反應。」',
    choices: [
      { label: '買一瓶（25 條小魚乾，拿兩支忍具）', costFish: 25, outcome: [{ kind: 'potions', n: 2 }], result: '三花貓收了錢，塞了兩個瓶子給球球。' },
      { label: '買祖傳的（60 條小魚乾，最大生命 +12）', costFish: 60, outcome: [{ kind: 'maxHp', n: 12 }], result: '球球喝下去，覺得身體暖暖的。' },
      { label: '不買', outcome: [], result: '三花貓聳聳肩。' },
    ] },

  { id: 'stuck_kitten', title: '卡住的小貓',
    text: '一隻小貓的頭卡在欄杆中間，四條腿在空中亂踢。',
    choices: [
      { label: '幫牠（回復 15 點生命，牠媽媽給了你謝禮）', outcome: [{ kind: 'heal', n: 15 }, { kind: 'fish', n: 20 }],
        result: '小貓的媽媽從轉角衝出來，塞了一把小魚乾給球球。' },
      { label: '先學牠怎麼卡住的（獲得一張罕見的忍術）', outcome: [{ kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }],
        result: '球球研究了一下，學到了奇怪的東西。' },
    ] },

  { id: 'gambling_rats', title: '賭博的老鼠',
    text: '三隻老鼠圍著一個碗蹲在角落，看到球球就招手。「來一把？」',
    choices: [
      { label: '賭大的（50 條小魚乾，七成機率贏 130）', costFish: 50,
        outcome: [{ kind: 'gamble', p: 0.7, win: [{ kind: 'fish', n: 130 }], lose: [] }],
        result: '碗掀開了。' },
      { label: '掀桌（打一場，贏了拿 80 條小魚乾）', outcome: [{ kind: 'fight', encounterId: 'rats3', bonusFish: 80 }],
        result: '老鼠們四散奔逃。' },
      { label: '不賭', outcome: [], result: '球球轉身就走。球球：「那個碗有問題喵。」' },
    ] },

  { id: 'heavy_door', title: '很重的門',
    text: '一扇石門半掩著，縫隙裡透出光。門看起來非常重。',
    choices: [
      { label: '硬推（掉 14 點生命，拿到一個罕見秘寶）', outcome: [{ kind: 'damage', n: 14 }, { kind: 'relic', pool: '大魔物' }],
        result: '球球用盡全力，門開了一條縫。' },
      { label: '從縫隙鑽過去（＋35 條小魚乾）', outcome: [{ kind: 'fish', n: 35 }], result: '球球把自己壓扁了鑽過去。球球：「貓是液體喵。」' },
    ] },

  { id: 'old_master_ghost', title: '師父的影子',
    text: '樓梯上坐著一個熟悉的背影，回頭時卻只是一片模糊。「你的招，還是太急。」',
    choices: [
      { label: '聽牠說完（升級一張牌，最大生命 +5）', outcome: [{ kind: 'upgradeCard' }, { kind: 'maxHp', n: 5 }],
        result: '球球聽完，把一招改了。' },
      { label: '打斷牠（移除一張牌）', outcome: [{ kind: 'removeCard' }], result: '球球把一招丟掉了。球球：「這招我早就不用了喵。」' },
    ] },

  { id: 'catnip_field', title: '一整片貓薄荷',
    text: '推開門，裡面是一整片長得過分茂盛的貓薄荷。味道濃到有點暈。',
    choices: [
      { label: '滾一滾（回復一半生命，但多一張壞毛病）', outcome: [{ kind: 'healPercent', p: 0.5 }, { kind: 'addCard', cardId: 'zouhuo' }],
        result: '球球滾得很開心，起來的時候頭有點暈。' },
      { label: '採一把帶走（拿兩支忍具）', outcome: [{ kind: 'potions', n: 2 }],
        result: '球球採了一把塞進懷裡。', resultArt: 'catnip_field_take' },
      { label: '憋氣走過（什麼都不會發生）', outcome: [], result: '球球憋著氣快步通過。' },
    ] },

  { id: 'weapon_rack', title: '兵器架',
    text: '牆上掛著一整排武器，大部分都生鏽了，只有幾把還亮著。',
    choices: [
      { label: '挑一把絕學（挑一張絕學帶走）', outcome: [{ kind: 'chooseCard', pool: '絕學', n: 3 }], result: '球球挑了一把順手的。' },
      { label: '全部賣掉（＋55 條小魚乾）', outcome: [{ kind: 'fish', n: 55 }], result: '球球把整排武器扛去賣了。' },
    ] },

  { id: 'crying_wall', title: '會哭的牆',
    text: '一面牆在滲水，聽起來像有人在哭。貼近了聽，好像在說「別上去」。',
    choices: [
      { label: '安慰它（最大生命 +8）', outcome: [{ kind: 'maxHp', n: 8 }], result: '牆漸漸不哭了。球球也覺得心裡舒服一點。' },
      { label: '把牆打破（拿到一個秘寶，但掉 12 點生命）', outcome: [{ kind: 'relic', pool: '常見' }, { kind: 'damage', n: 12 }],
        result: '牆後面藏著東西。球球的爪子也裂了。' },
    ] },

  { id: 'fish_pond', title: '養魚的池子',
    text: '一個小池子裡養著幾條胖魚，游得很慢，一副等著被抓的樣子。',
    choices: [
      { label: '抓一條吃（回復 18 點生命）', outcome: [{ kind: 'heal', n: 18 }], result: '球球吃得心滿意足。' },
      { label: '全部抓走（＋65 條小魚乾，但塔裡的東西不高興了，掉 10 點生命）',
        outcome: [{ kind: 'fish', n: 65 }, { kind: 'damage', n: 10 }],
        result: '球球抱著一堆魚跑，被什麼東西從後面拍了一下。' },
      { label: '看看就好', outcome: [], result: '球球蹲在池邊看了很久。' },
    ] },

  { id: 'training_hall', title: '空的練功房',
    text: '一間很大的練功房，地上有很深的腳印，看得出來有人在這裡練了很久。',
    choices: [
      { label: '照著腳印練（升級兩張牌）', outcome: [{ kind: 'upgradeCard' }, { kind: 'upgradeCard' }],
        result: '球球照著踩了一遍，動作順了很多。' },
      { label: '找找有沒有留下東西（拿到一個罕見秘寶，但要打一場）',
        outcome: [{ kind: 'relic', pool: '大魔物' }, { kind: 'fight', encounterId: 'wood_dummy', bonusFish: 30 }],
        result: '櫃子裡真的有東西，但木樁人也醒了。' },
    ] },

  { id: 'moon_window', title: '看得到月亮的窗',
    text: '一扇圓窗正對著月亮。窗台上有一個空碗，像是留給誰的。',
    choices: [
      { label: '放一條小魚乾（20 條小魚乾，最大生命 +10）', costFish: 20, outcome: [{ kind: 'maxHp', n: 10 }],
        result: '球球放下小魚乾，覺得整個人輕了一點。' },
      { label: '坐著看月亮（回復 14 點生命）', outcome: [{ kind: 'heal', n: 14 }], result: '球球坐了一會兒，累都消了。' },
    ] },

  { id: 'greedy_merchant', title: '很貪心的商人',
    text: '一隻戴著眼鏡的灰貓攔住去路。「有個好東西，但我只跟識貨的人做生意。」',
    choices: [
      { label: '全買了（80 條小魚乾，拿一個罕見秘寶＋一支忍具）', costFish: 80,
        outcome: [{ kind: 'relic', pool: '大魔物' }, { kind: 'potions', n: 1 }],
        result: '灰貓笑得很開心。球球覺得自己好像被坑了。' },
      { label: '拿壞毛病換（多一張壞毛病，但拿一個罕見秘寶）',
        outcome: [{ kind: 'addCard', cardId: 'neili' }, { kind: 'relic', pool: '大魔物' }],
        result: '「這是你自己選的。」灰貓收下了什麼東西。' },
      { label: '不做生意', outcome: [], result: '灰貓推了推眼鏡，讓開了。' },
    ] },
];

export const eventById: Record<string, EventDef> = Object.fromEntries(events.map((e) => [e.id, e]));
