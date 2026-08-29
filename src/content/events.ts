import type { EventDef } from '../engine/types';

export const FIXED_EVENT_FLOOR_5 = 'daxia_teach';

export const events: EventDef[] = [
  { id: 'daxia_teach', title: '大俠傳功', fixedFloor: 5,
    text: '樓梯間掉著一本秘笈，封面被貓爪抓得毛毛的。翻開第一頁，是師父的字。',
    choices: [
      { label: '翻開秘笈', outcome: [{ kind: 'chooseCard', pool: '絕學', n: 3 }], result: '球球挑了一招記在腦子裡。球球：「師父的字好醜，可是招式好強喵。」' },
      { label: '放回原位', outcome: [], result: '球球把秘笈放回去。球球：「等抓到師父，叫他親自教我喵。」' },
    ] },
  { id: 'toll', title: '留下買路財',
    text: '轉角站著一隻橘貓山賊，手裡的木棒比牠還長。「留下買路財！」牠喊得很大聲，腿在抖。',
    choices: [
      { label: '付 30 小魚乾', costFish: 30, outcome: [], result: '山賊數了三遍才讓路。球球：「數這麼慢，你是第一天當山賊喵？」' },
      { label: '打一場', outcome: [{ kind: 'fight', encounterId: 'orange_bandit', bonusFish: 40 }], result: '球球：「小魚乾是我的，不給喵。」' },
    ] },
  { id: 'robin', title: '劫富濟貧',
    text: '一群餓到肚子叫的村貓縮在角落，牠們的小魚乾被魔物搶光了。',
    choices: [
      { label: '分一半小魚乾給牠們', outcome: [{ kind: 'fishHalve' }, { kind: 'heal', n: 15 }, { kind: 'removeCard' }], result: '村貓們圍過來幫球球梳毛，梳掉一個壞習慣。球球：「不用謝，江湖規矩喵。」' },
      { label: '裝作沒看到', outcome: [], result: '球球走過去，沒有回頭。球球：「我自己也快沒小魚乾了喵……」' },
    ] },
  { id: 'rescue', title: '江湖救急',
    text: '一隻受傷的村貓趴在地上，旁邊放著牠最後一包小魚乾和一罐貓草藥。「幫我……隨便拿一樣走。」',
    choices: [
      { label: '拿貓草藥（回復 20 生命）', outcome: [{ kind: 'heal', n: 20 }], result: '藥很苦。球球：「苦的才有效喵。」' },
      { label: '拿小魚乾（40 小魚乾）', outcome: [{ kind: 'fish', n: 40 }], result: '村貓揮揮手要球球快走。球球：「我會把塔主打下來還你喵。」' },
    ] },
  { id: 'blocked', title: '此路不通',
    text: '樓梯被一座垃圾山堵住，最上面插著一塊牌子：此路不通。牌子是新的。',
    choices: [
      { label: '硬翻過去', outcome: [{ kind: 'damage', n: 6 }, { kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }], result: '球球滾下來的時候撿到一張別人掉的忍術卷。球球：「痛是痛，但值得喵。」' },
      { label: '繞路', outcome: [], result: '多走了半層樓。球球：「牌子是誰立的，我記住了喵。」' },
    ] },
  { id: 'seclusion', title: '閉關',
    text: '一間沒人的小房間，牆上刻滿爪痕，看得出有貓在這裡練過很久。',
    choices: [
      { label: '修行一晚（升級一張牌）', outcome: [{ kind: 'upgradeCard' }], result: '球球對著牆練到天亮，有一招順了。球球：「原來要這樣喵。」' },
      { label: '打坐（回復 10 生命）', outcome: [{ kind: 'heal', n: 10 }], result: '球球盤腿坐著，三分鐘後睡著了。球球：「有休息到就好喵。」' },
    ] },
  { id: 'hidden_box', title: '深藏不露',
    text: '牆縫裡卡著一個箱子，上面有個紙條：「別拿。」字跡跟秘笈很像。',
    choices: [
      { label: '硬拿', outcome: [{ kind: 'relic', pool: '常見' }, { kind: 'addCard', cardId: 'zhongji' }], result: '箱子裡有寶物，也有一個彈簧拳頭。球球：「師父你真的很幼稚喵。」' },
      { label: '聽話不拿', outcome: [], result: '球球看了三秒，走了。球球：「回來再拿喵。」' },
    ] },
  { id: 'sunbath', title: '曬太陽',
    text: '窗邊有一塊被太陽曬得暖暖的地板，形狀剛好是一隻貓。',
    choices: [
      { label: '打盹（回復 12 生命）', outcome: [{ kind: 'heal', n: 12 }], result: '球球睡到翻肚。球球：「再五分鐘喵。」' },
      { label: '躺著想事情（移除一張牌）', outcome: [{ kind: 'removeCard' }], result: '球球想通了一件事，決定不再用那一招。球球：「丟掉比較輕喵。」' },
    ] },
  { id: 'rat_stall', title: '可疑的飯糰攤',
    text: '一隻老鼠推著攤車在賣飯糰，飯糰上面有牙印。「特價，二十小魚乾，吃了會變強。」',
    choices: [
      { label: '買一顆（20 小魚乾）', costFish: 20,
        outcome: [{ kind: 'gamble', p: 0.5, win: [{ kind: 'maxHp', n: 5 }], lose: [{ kind: 'addCard', cardId: 'shishou' }] }],
        result: '球球一口吞了。球球：「有牙印的飯糰，吃起來也是飯糰喵。」' },
      { label: '不買', outcome: [], result: '老鼠老闆翻了個白眼。球球：「你自己先吃一顆給我看喵。」' },
    ] },
  { id: 'lost_kitten', title: '迷路的小黑貓',
    text: '一隻小黑貓坐在樓梯上哭，脖子上綁著黑貓忍者的頭巾，尺寸太大，蓋住半張臉。',
    choices: [
      { label: '帶著牠一起走', outcome: [{ kind: 'potions', n: 2 }], result: '小黑貓從頭巾裡掏出兩個忍具塞給球球，然後跳上牠的背。球球：「好啦好啦，抓穩喵。」' },
      { label: '指路讓牠自己回去', outcome: [{ kind: 'fish', n: 15 }], result: '小黑貓留下一小把小魚乾當謝禮。球球：「小心不要再迷路喵。」' },
    ] },
];

export const eventById: Record<string, EventDef> = Object.fromEntries(events.map((e) => [e.id, e]));
