export interface DialogueLine { speaker: '球球' | '塔主' | '旁白' | '黑貓忍者頭目'; text: string }

/** 球球台詞的句尾檢查：去掉結尾標點後最後一個字必須是「喵」 */
export function qiuqiuLineOk(text: string): boolean {
  return /喵$/u.test(text.replace(/[！？。…～、,.!?]+$/u, ''));
}

export const dialogue = {
  prologue: <DialogueLine[]>[
    { speaker: '旁白', text: '貓村旁邊，一夜之間長出一座塔。魔物從塔裡爬下來，偷走了村裡一半的小魚乾。' },
    { speaker: '旁白', text: '塔頂住著球球的師父，那位戴斗笠的大俠貓。他閉關練功，練到走火入魔，把自己關在上面。' },
    { speaker: '球球', text: '沒人派我去，我自己去喵。' },
    { speaker: '球球', text: '把師父抓回來，順便把小魚乾拿回來喵。' },
  ],
  /** 每種魔物第一次登場時球球的吐槽（鍵＝魔物 id） */
  firstMeet: <Record<string, string>>{
    rat: '偷小魚乾的就是你們喵！',
    cucumber: '這根本就是黃瓜嘛……好可怕喵！',
    onigiri_monster: '會動的飯糰……打完可以吃嗎喵？',
    wood_dummy: '師父以前叫我打的那根木頭，怎麼自己站起來了喵。',
    goat: '羊怎麼會在塔裡喵？',
    vacuum: '吸塵器！最討厭的東西喵！',
    black_ninja: '同行？我不認識你喵。',
    orange_bandit: '小魚乾是我的，不給喵。',
    catgrass_bug: '別吐我喵！',
    scarecrow: '稻草人會講話，塔裡什麼都不正常喵。',
    black_ninja_elite: '兩個一起上？好喵。',
    big_cucumber: '更大根的黃瓜……真的假的喵。',
    ninja_boss: '你說的「上面那位」，是我師父喵。',
    giant_onigiri: '這麼大顆，吃一年都吃不完喵。',
    black_kitten: '小黑貓也要打我喵？',
    tower_master: '師父，我來帶你回家喵。',
  },
  battleStart: ['參上！球球來也喵！', '先打再說喵。', '不要擋路喵。'],
  battleWin: ['任務完成喵。', '還好啦，沒很難喵。', '小魚乾呢？拿來喵。'],
  hungry: '餓扁了……沒力氣喵……',
  lowHp: '有點痛喵……',
  secretScroll: <DialogueLine[]>[
    { speaker: '旁白', text: '樓梯間掉著一本秘笈，翻開第一頁，是熟悉的字跡。' },
    { speaker: '球球', text: '這是師父的字喵。' },
    { speaker: '球球', text: '他把絕學留在這裡，是要給誰喵？' },
  ],
  afterFirstElite: <DialogueLine[]>[
    { speaker: '黑貓忍者頭目', text: '上面那位，不是你認識的那隻貓了。' },
    { speaker: '球球', text: '那我更要上去看喵。' },
  ],
  restBeforeBoss: <DialogueLine[]>[
    { speaker: '球球', text: '上面就是師父了喵。' },
    { speaker: '球球', text: '我以前連馬步都蹲不好，他就一直笑我圓喵。' },
    { speaker: '球球', text: '圓也可以爬到這裡喵。' },
  ],
  bossIntro: <DialogueLine[]>[
    { speaker: '塔主', text: '難逢敵手。' },
    { speaker: '球球', text: '師父，是我，球球喵。' },
    { speaker: '塔主', text: '退隱江湖。' },
    { speaker: '球球', text: '你不下去，我就把你打下去喵。' },
  ],
  bossPhase2: <DialogueLine[]>[
    { speaker: '塔主', text: '走火入魔。' },
    { speaker: '球球', text: '師父撐住，快結束了喵。' },
  ],
  victory: <DialogueLine[]>[
    { speaker: '塔主', text: '承讓。' },
    { speaker: '球球', text: '領教了喵。' },
    { speaker: '旁白', text: '師父醒了。球球把他扛在背上，一層一層走下塔。' },
  ],
  victoryTeaser: '塔上面……好像還有樓層喵？',
  defeat: <DialogueLine[]>[
    { speaker: '旁白', text: '球球倒下了。' },
    { speaker: '球球', text: '先睡了喵……' },
    { speaker: '旁白', text: '夢裡有人把牠扛回村子。醒來，塔還在。' },
  ],
  shopkeeper: ['賒帳？貓沒有在賒帳的。', '不買不要摸。', '小魚乾要數清楚，我不找零。'],
  restLines: ['貓窩暖暖的，先睡一下喵。', '磨一磨爪子，等一下才好用喵。'],
  chestLine: '紙箱！一定要鑽進去喵。',
};
