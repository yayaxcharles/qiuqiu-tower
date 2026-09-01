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
    white_duelist: '好正式的架勢……牠是認真的喵。',
    rat: '偷小魚乾的就是你們喵！',
    yarn_ball: '那顆……會自己滾耶喵。',
    soy_bottle: '倒了就算了，還會動是怎樣喵。',
    box_lurker: '箱子裡有東西……我也想進去喵。',
    hedgehog: '這位全身都是刺，怎麼打喵？',
    can_spirit: '罐頭怎麼一直滿回來喵！',
    five_claw: '五隻爪子？我也有喵。',
    dozing_tabby: '睡成這樣……真羨慕喵。',
    chipmunk: '那是我的小魚乾喵！',
    chipmunk_small: '怎麼又跑出一隻喵！',
    mirror_cat: '牠學我？我也會學喵。',
    broom_centipede: '掃把成精了喵……',
    stone_lion: '這是石頭吧？石頭會動喵？',
    catnip_phantom: '聞起來……有點想睡喵。',
    roomba_king: '我不是灰塵喵！',
    mini_broom: '小的也來了喵。',
    calico_monk: '這位看起來很不好惹喵。',
    shadow_kitten_a: '打倒一隻……牠又站起來了喵！',
    shadow_kitten_b: '要一起打倒才行喵？',
    shadow_kitten_c: '這隻都不動，反而更可怕喵。',
    training_post: '它怎麼越打越硬喵……',
    nekomata: '婆婆……您的尾巴有幾條喵？',
    nekomata_tail: '尾巴自己會動喵！',
    iron_claw: '這隻是機器做的喵？爪子好多喵！',
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
  /**
   * 關主戰前一晚（各關 14F 貓窩）的獨白，依關數換。
   * 三關制之前只有一段、內容寫死「上面就是師父」——現在前兩關的關主不是師父，
   * 師父的戲留到第三關才對（使用者抓到的劇情錯位）。
   */
  restBeforeBossByAct: <DialogueLine[][]>[
    [ // 第一關：上面是守塔的魔物，師父還很遠
      { speaker: '球球', text: '上面有一隻很強的，看門的喵。' },
      { speaker: '球球', text: '打贏牠，才算真的進了這座塔喵。' },
      { speaker: '球球', text: '先睡飽。明天用全力喵。' },
    ],
    [ // 第二關：開始聽見塔頂的動靜
      { speaker: '球球', text: '越往上，魔氣越重喵。' },
      { speaker: '球球', text: '剛剛好像聽到塔頂有聲音……很像師父喵。' },
      { speaker: '球球', text: '再一層。就快到了喵。' },
    ],
    [ // 第三關：明天就是師父（沿用原本那段）
      { speaker: '球球', text: '上面就是師父了喵。' },
      { speaker: '球球', text: '我以前連馬步都蹲不好，他就一直笑我圓喵。' },
      { speaker: '球球', text: '圓也可以爬到這裡喵。' },
    ],
  ],
  /**
   * 關主開場對白，鍵＝關主的魔物 id；沒寫的用 generic。
   * 師父那段只掛在 tower_master（第三關固定關主）身上。
   */
  bossIntroById: <Record<string, DialogueLine[]>>{
    nekomata: [
      { speaker: '塔主', text: '孩子，回頭吧。上面的東西，不是你打得動的。' },
      { speaker: '球球', text: '婆婆讓路，我趕時間喵。' },
      { speaker: '塔主', text: '……那就試試你的斤兩。' },
    ],
    iron_claw: [
      { speaker: '塔主', text: '（喀嚓、喀嚓——五對鐵爪同時張開）' },
      { speaker: '球球', text: '機器貓不會累……那就在它累之前打壞它喵！' },
    ],
    tower_master: [
      { speaker: '塔主', text: '難逢敵手。' },
      { speaker: '球球', text: '師父，是我，球球喵。' },
      { speaker: '塔主', text: '退隱江湖。' },
      { speaker: '球球', text: '你不下去，我就把你打下去喵。' },
    ],
    // ---- 生圖中的新關主（接資料時直接生效；先寫好劇情不用等）----
  orange_king: [
      { speaker: '塔主', text: '打擾本王吃飯的，要留下全部的小魚乾。' },
      { speaker: '球球', text: '小魚乾是我的，師父也是我的喵！' },
    ],
    cowcat_boss: [
      { speaker: '塔主', text: '塔下那群傢伙擋不住你，很好。二當家親自陪你過招。' },
      { speaker: '球球', text: '讓開，我趕時間喵。' },
    ],
    tanuki_lord: [
      { speaker: '塔主', text: '呵呵，貓小弟，喝一杯再打不遲。' },
      { speaker: '球球', text: '狸貓的酒不能喝，師父說過喵。' },
    ],
    persian_lady: [
      { speaker: '塔主', text: '髒兮兮的野貓，也敢踏進本小姐的樓層？' },
      { speaker: '球球', text: '踏都踏了，還要踏過去喵。' },
    ],
  },
  bossIntroGeneric: <DialogueLine[]>[
    { speaker: '塔主', text: '到此為止了。' },
    { speaker: '球球', text: '擋路的，都一樣喵。' },
  ],
  /** 關主進入第二階段的兩句，鍵同上；沒寫的用 generic */
  bossPhase2ById: <Record<string, DialogueLine[]>>{
    tower_master: [
      { speaker: '塔主', text: '走火入魔。' },
      { speaker: '球球', text: '師父撐住，快結束了喵。' },
    ],
    nekomata: [
      { speaker: '塔主', text: '老骨頭，也有火氣。' },
      { speaker: '球球', text: '婆婆認真了……小心喵！' },
    ],
    orange_king: [
      { speaker: '塔主', text: '本王生氣了。' },
      { speaker: '球球', text: '滾過來了——好大一顆喵！' },
    ],
    cowcat_boss: [
      { speaker: '塔主', text: '黑手練完了，換白手。' },
      { speaker: '球球', text: '打完一半還有一半……真麻煩喵！' },
    ],
    tanuki_lord: [
      { speaker: '塔主', text: '（葫蘆一拋）變！' },
      { speaker: '球球', text: '哪一個才是本體喵！？' },
    ],
    persian_lady: [
      { speaker: '塔主', text: '你們還愣著做什麼！上啊！' },
      { speaker: '球球', text: '先打倒僕人，大小姐就沒轍了喵。' },
    ],
  },
  bossPhase2Generic: <DialogueLine[]>[
    { speaker: '塔主', text: '（氣勢整個變了）' },
    { speaker: '球球', text: '牠變強了……撐住喵！' },
  ],
  /** 第三階段（目前只有師父有三階段；新關主做了三階段就補進來） */
  bossPhase3ById: <Record<string, DialogueLine[]>>{
    tower_master: [
      { speaker: '塔主', text: '深藏不露。' },
      { speaker: '球球', text: '全力的師父……我也接得住喵！' },
    ],
  },
  bossPhase3Generic: <DialogueLine[]>[
    { speaker: '塔主', text: '（魔氣直往天上冒）' },
    { speaker: '球球', text: '還沒完嗎……撐到底喵！' },
  ],
  victory: <DialogueLine[]>[
    { speaker: '塔主', text: '承讓。' },
    { speaker: '球球', text: '領教了喵。' },
    { speaker: '旁白', text: '師父醒了。球球把他扛在背上，一層一層走下塔。' },
  ],
  // 三關制之後這句只在「真通關」時出現：塔清完了，沒有更多樓層，改成收尾的話
  victoryTeaser: '塔安靜下來了。回家吃小魚乾喵。',
  /** 打倒第一關關主（塔下→塔中）。師父還在更上面，故事往上推一層 */
  actClear1: <DialogueLine[]>[
    { speaker: '旁白', text: '守塔的魔物倒下了。牆邊有一道往上的樓梯，飄著飯菜香。' },
    { speaker: '球球', text: '小魚乾只找回一半……上面還有喵。' },
    { speaker: '旁白', text: '球球舔了舔爪子，往塔中爬去。' },
  ],
  /** 打倒第二關關主（塔中→塔頂）。點出最終頭目是誰 */
  actClear2: <DialogueLine[]>[
    { speaker: '旁白', text: '魔物散去的瞬間，塔頂傳來一聲熟悉的長嘯。' },
    { speaker: '球球', text: '這個聲音……是師父喵！' },
    { speaker: '旁白', text: '月光從塔頂的裂縫漏下來。最後一段樓梯，就在眼前。' },
  ],
  defeat: <DialogueLine[]>[
    { speaker: '旁白', text: '球球倒下了。' },
    { speaker: '球球', text: '先睡了喵……' },
    { speaker: '旁白', text: '夢裡有人把牠扛回村子。醒來，塔還在。' },
  ],
  shopkeeper: ['賒帳？貓沒有在賒帳的。', '不買不要摸。', '小魚乾要數清楚，我不找零。'],
  restLines: ['貓窩暖暖的，先睡一下喵。', '磨一磨爪子，等一下才好用喵。'],
  chestLine: '紙箱！一定要鑽進去喵。',
};
