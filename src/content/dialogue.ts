export interface DialogueLine { speaker: '球球' | '塔主' | '旁白' | '黑貓忍者頭目'; text: string }

/** 球球台詞的句尾檢查：去掉結尾標點後最後一個字必須是「喵」 */
export function qiuqiuLineOk(text: string): boolean {
  return /喵$/u.test(text.replace(/[！？。…～、,.!?]+$/u, ''));
}

export const dialogue = {
  prologue: <DialogueLine[]>[
    { speaker: '旁白', text: '球球是大俠貓的徒弟。每次練習蜷縮，他總會歪成一團；師父看了不但不責備，反而笑著再示範一次。' },
    { speaker: '旁白', text: '那天夜裡，一座魔塔突然在村外拔地而起，塔頂亮起詭異的紫光。一縷魔氣鑽進師父體內；他痛苦地跪倒在地，渾身毛髮豎起，雙眼也染成紫色。' },
    { speaker: '旁白', text: '受到魔氣操控的師父一語不發，直奔魔塔，把自己關在塔頂。隨後，塔裡的魔物闖進村子，搶走了村裡所有的小魚乾。' },
    { speaker: '球球', text: '這樣下去不行，我決定要去塔裡喵。' },
    { speaker: '球球', text: '我要把師父帶回家，也要把村裡的小魚乾全部拿回來喵。' },
  ],
  /** 每種魔物第一次登場時球球的吐槽（鍵＝魔物 id） */
  firstMeet: <Record<string, string>>{
    white_duelist: '好正式的架勢……牠是認真的喵。',
    // ---- 三關制內容包（2026-09-01）----
    shiba_ronin: '狗？塔裡怎麼會有狗喵！',
    shamisen_cat: '琴聲不太對勁，摀住耳朵喵。',
    lantern_ghost: '燈籠會吐舌頭……不想看見喵。',
    windchime_sprite: '叮叮叮吵死了喵！',
    tanuki_kid: '小狸貓裝什麼大人喵。',
    geta_monster: '一隻鞋？另一隻呢喵？',
    ink_cat: '從畫裡爬出來的……墨還在滴喵。',
    moon_rabbit: '搗麻糬的兔子，看起來超強喵。',
    owl_sentry: '牠的頭轉了一圈！脖子沒事嗎喵？',
    paper_crane: '紙摺的也想擋我？——好利喵！',
    miasma_blob: '那團黑黑的……裡面有臉喵！',
    night_panther: '好大的貓……前輩失敬了喵。',
    // ---- 2026-09-02 補怪 ----
    kasa_obake: '一隻腳的傘……還會吐舌頭喵！',
    kappa: '河童！別碰我的小魚乾喵！',
    tofu_boy: '請我吃豆腐？……有股霉味喵。',
    tengu: '烏鴉穿和尚衣……那把扇子不對勁喵。',
    fox_miko: '白狐狸在唸咒，毛都豎起來了喵。',
    armor_ghost: '盔甲裡面沒有貓！那眼睛是什麼喵！',
    shadow_cat: '那是……我？影子學人精喵！',
    mirror_qiuqiu: '鏡子裡的我跑出來了……不准學我喵！',
    orange_king: '好圓……不對，牠是關主喵！',
    cowcat_boss: '黑白毛的大塊頭，看起來很會打喵。',
    tanuki_lord: '狸貓老大！酒味好重喵。',
    persian_lady: '毛好澎的大小姐……後面還跟著僕人喵。',
    butler_cat: '執事貓擋在前面，先過他這關喵。',
    maid_cat: '女僕貓也要上？別逼我出手喵。',
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
  // 2026-09-02 使用者：「打贏只說還好啦沒很難喵太單調」——每一類都多寫幾句，畫面用 pick() 隨機挑
  battleStart: ['參上！球球來也喵！', '先打再說喵。', '不要擋路喵。', '讓開，我趕時間喵。', '爪子磨好了喵。', '這關我熟喵。', '一起上也可以喵。', '師父在上面等我喵。'],
  battleWin: ['任務完成喵。', '還好啦，沒很難喵。', '小魚乾呢？拿來喵。', '下一個喵。', '呼……差點翻船喵。', '這就叫忍術喵。', '沒事，繼續往上喵。', '打完了？先舔一下毛喵。', '師父，你看到了嗎喵。', '好像有點餓了喵。'],
  hungry: ['餓扁了……沒力氣喵……', '飯糰吃完了喵……', '肚子空空的喵……'],
  lowHp: ['有點痛喵……', '嗚……撐得住喵……', '再來我就要生氣了喵……'],
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
    [
      { speaker: '球球', text: '明天要面對的，是這一層最強的守關者喵。' },
      { speaker: '球球', text: '只有打贏他，我才能繼續往塔中走喵。' },
      { speaker: '球球', text: '今晚先睡飽，明天再拿出全力喵。' },
    ],
    [
      { speaker: '球球', text: '越往上走，魔氣就越重喵。' },
      { speaker: '球球', text: '剛才從塔頂傳來的聲音……一定是師父喵。' },
      { speaker: '球球', text: '只差最後一段路了。師父，等我喵。' },
    ],
    [
      { speaker: '球球', text: '明天一上樓，就會見到師父了喵。' },
      { speaker: '球球', text: '以前我連馬步都蹲不穩，他總笑我圓得像顆球喵。' },
      { speaker: '球球', text: '可是這顆圓滾滾的球，已經一路爬到塔頂了喵。' },
      { speaker: '球球', text: '明天，換我帶師父回家喵。' },
    ],
  ],
  /**
   * 關主開場對白，鍵＝關主的魔物 id；沒寫的用 generic。
   * 師父那段只掛在 tower_master（第三關固定關主）身上。
   */
  bossIntroById: <Record<string, DialogueLine[]>>{
    tower_master: [
      { speaker: '塔主', text: '難逢敵手。' },
      { speaker: '球球', text: '師父，是我！我是球球，你看清楚喵！' },
      { speaker: '塔主', text: '退隱江湖。' },
      { speaker: '球球', text: '要退隱，也得先跟我回家。你不肯醒，我就把你打醒喵！' },
    ],
    nekomata: [
      { speaker: '塔主', text: '孩子，回去吧。再往上走，可不是逞強就能活下來的地方。' },
      { speaker: '球球', text: '婆婆，得罪了。師父還在上面等我喵。' },
      { speaker: '塔主', text: '好吧。那就讓婆婆看看，你到底有多少本事。' },
    ],
    iron_claw: [
      { speaker: '旁白', text: '齒輪高速轉動，五對鐵爪同時張開，發出一連串刺耳的喀嚓聲。' },
      { speaker: '球球', text: '機關貓不會累……那我就趁它還能動的時候，把它拆掉喵！' },
    ],
    orange_king: [
      { speaker: '塔主', text: '敢打擾本王用膳，就把身上的小魚乾全留下！' },
      { speaker: '球球', text: '想都別想。小魚乾和師父，我都要帶回去喵！' },
    ],
    cowcat_boss: [
      { speaker: '塔主', text: '塔下那群傢伙攔不住你，算你有點本事。接下來，就由本二當家親自陪你過招。' },
      { speaker: '球球', text: '我不是來比武的。快讓路，我還要去找師父喵。' },
    ],
    tanuki_lord: [
      { speaker: '塔主', text: '呵呵，小兄弟，何必急著動手？先陪老夫喝一杯吧。' },
      { speaker: '球球', text: '師父交代過，狸貓遞來的酒絕對不能喝喵。' },
    ],
    persian_lady: [
      { speaker: '塔主', text: '渾身髒兮兮的野貓，也敢闖進本小姐的樓層？' },
      { speaker: '球球', text: '都已經走到這裡了，我當然還要一路走上塔頂喵。' },
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
      { speaker: '球球', text: '我知道你還聽得見！再撐一下，我一定會把你帶回來喵！' },
    ],
    nekomata: [
      { speaker: '塔主', text: '老婆子還沒拿出真本事呢。' },
      { speaker: '球球', text: '婆婆的火氣上來了……這下得小心喵！' },
    ],
    orange_king: [
      { speaker: '塔主', text: '你真的惹怒本王了！' },
      { speaker: '球球', text: '他整隻捲起來了——好大一顆球喵！' },
    ],
    cowcat_boss: [
      { speaker: '塔主', text: '黑爪只是熱身，接下來換白爪！' },
      { speaker: '球球', text: '剛才那樣居然才算一半……真會拖時間喵！' },
    ],
    tanuki_lord: [
      { speaker: '旁白', text: '狸大人把酒葫蘆拋向半空，白煙「砰」地炸開，轉眼變出一群分身。' },
      { speaker: '塔主', text: '看仔細了——變！' },
      { speaker: '球球', text: '一下變出這麼多隻……到底哪一隻才是真的喵！？' },
    ],
    persian_lady: [
      { speaker: '塔主', text: '你們還站著做什麼？快替本小姐收拾他！' },
      { speaker: '球球', text: '原來妳只會躲在僕人後面。那我就先把他們打倒喵！' },
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
      { speaker: '球球', text: '原來師父到現在都還沒使出全力……好，我也不會再保留了喵！' },
    ],
  },
  bossPhase3Generic: <DialogueLine[]>[
    { speaker: '塔主', text: '（魔氣直往天上冒）' },
    { speaker: '球球', text: '還沒完嗎……撐到底喵！' },
  ],
  victory: <DialogueLine[]>[
    { speaker: '旁白', text: '最後一縷魔氣從師父身上散去，他眼中的紫光終於熄滅。' },
    { speaker: '塔主', text: '承讓。' },
    { speaker: '球球', text: '領教了，師父喵。' },
    { speaker: '旁白', text: '球球再也忍不住，撲進師父懷裡。師父緊緊抱住他，師徒倆又哭又笑，誰也捨不得先放手。' },
    { speaker: '旁白', text: '夕陽把一大一小的影子拉得長長的。球球和師父並肩走回村子，今晚終於可以安心地一起吃小魚乾了。' },
  ],
  // 三關制之後這句只在「真通關」時出現：塔清完了，沒有更多樓層，改成收尾的話
  victoryTeaser: '魔塔終於安靜了。回家吃小魚乾喵。',
  /** 打倒第一關關主（塔下→塔中）。師父還在更上面，故事往上推一層 */
  actClear1: <DialogueLine[]>[
    { speaker: '旁白', text: '守關的魔物倒下後，牆邊露出一道往上的樓梯，樓上還飄來淡淡的飯菜香。' },
    { speaker: '球球', text: '被搶走的小魚乾才找回一半，剩下的果然還在上面喵。' },
    { speaker: '旁白', text: '球球深吸一口氣，沿著樓梯繼續往塔中前進。' },
  ],
  /** 打倒第二關關主（塔中→塔頂）。點出最終頭目是誰 */
  actClear2: <DialogueLine[]>[
    { speaker: '旁白', text: '魔物化成煙霧散去時，塔頂忽然傳來一聲熟悉的長喵聲。' },
    { speaker: '球球', text: '這聲音……是師父！他就在上面喵！' },
    { speaker: '旁白', text: '月光穿過塔頂的裂縫，落在最後一段樓梯上。通往塔頂的路，終於出現了。' },
  ],
  defeat: <DialogueLine[]>[
    { speaker: '旁白', text: '球球耗盡力氣，倒在冰冷的地面上。' },
    { speaker: '球球', text: '我先……睡一下……喵。' },
    { speaker: '旁白', text: '朦朧間，他感覺有人把自己背了起來。再次睜眼時，他已躺在村裡；遠處的魔塔仍舊矗立，等著他再次出發。' },
  ],
  shopkeeper: ['賒帳？貓沒有在賒帳的。', '不買不要摸。', '小魚乾要數清楚，我不找零。', '這批貨是塔裡撿的，別問。', '看一看沒關係，弄壞要賠。', '今天心情好，不加價。', '樓上很危險，多帶點東西。', '賣完就沒了，塔裡沒有第二家。', '你這隻貓看起來還撐得住嘛。', '放生的牌我不收，丟了就是丟了。'],
  restNapLines: ['貓窩暖暖的，先睡一下喵。', '這個墊子好軟喵。', '打個盹再上路喵。', '眼皮好重喵……'],
  restSharpenLines: ['磨一磨爪子，等一下才好用喵。', '爪子有點鈍了喵。', '磨亮一點，師父會看喵。', '這張牌要更利喵。'],
  chestLines: ['紙箱！一定要鑽進去喵。', '有箱子！先進去再說喵。', '這箱子的大小剛剛好喵。', '裡面該不會有東西吧喵。', '箱子就是要鑽的喵。'],
};

/** 從一組台詞裡隨機挑一句（純畫面用，不動引擎的亂數） */
export function pick<T>(xs: readonly T[]): T { return xs[Math.floor(Math.random() * xs.length)] ?? xs[0]!; }
