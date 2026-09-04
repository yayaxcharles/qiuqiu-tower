import { STARTER_DECK, cardById } from './cards';
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
    // ---- 2026-09-03 菁英擴充：每關三隻新菁英＋兩種小怪 ----
    wild_boar: '牠一直在刨地……我少耍花招，直接打就對了喵。',
    paper_tiger: '紙做的？可是牠身上都是刺，打下去我也會痛喵。',
    drum_tanuki: '鼓聲越來越快……下一下一定很重，先縮好喵。',
    iron_arhat: '整隻都是鐵的，第一拳大概打不進去喵。',
    shadow_spider: '牠吊在半空中，還一直往我的牌堆吐絲喵。',
    drunk_dog: '牠快散掉了！要拿寶物就得趕在那之前打倒牠喵。',
    oni_general: '那隻在後面下命令，小鬼一直爬起來喵。',
    imp: '小鬼倒了又站起來……得三隻一起清才行喵。',
    mirror_sage: '鏡子裡好多個我……打破了會怎麼樣喵？',
    mirror_shard: '碎片也會動，而且變成兩隻了喵。',
    void_cat: '牠半透明的時候怎麼打都不痛不癢，等牠實體化再出手喵。',
    // ---- 2026-09-02 第二波怪 ----
    dango_slime: '團子？看起來好好吃……不對，牠在動喵！',
    dango_bit: '打一隻變兩隻，這樣算賺還是虧喵？',
    armadillo_pup: '牠一被打就縮起來了，好硬喵。',
    lantern_moth: '在天上飛的很難打中，先把牠打下來喵。',
    hibernating_bear: '牠在睡覺……輕一點，千萬別吵醒牠喵。',
    puffer_spirit: '越鼓越大顆……那個等一下一定會炸喵！',
    plated_beetle: '整身都是鐵殼，每回合還會自己長回來喵。',
    rat_general: '有隻老鼠在指揮！先打那隻帶頭的喵。',
    curse_priest: '牠一直在唸咒，我的牌堆變得怪怪的喵。',
    phantom_fox: '牠半透明的……好像快要不見了喵。',
    red_oni: '這隻越打越氣，別再惹牠了喵。',
    moon_moth_queen: '好大一隻蛾！鱗粉別噴到我臉上喵。',
    jizo_golem: '石頭做的地藏，那一掌下來會很痛喵。',
    frog_daimyo: '青蛙也當起大名了？塔裡什麼都有喵。',
    tadpole: '小蝌蚪也來湊熱鬧喵。',
    armadillo_king: '好大一顆球……這殼要怎麼打開喵？',
    dragon_cat: '牠在睡……身上還有鱗片，是龍嗎喵？',
    hex_abbot: '老住持唸的不是經，是詛咒喵！',
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
    mirror_qiuqiu: '那是我的影子……影子怎麼會自己動喵！',
    sparring_partner: '還有一隻！白貓帶了幫手喵！',
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
    // 2026-09-04 第三波
    snow_cat: '好冷……鼻子要凍掉了喵。',
    fortune_cat: '招財貓招的是我的小魚乾喵？',
    lantern_fish: '燈亮著就往那邊看……不行，我要盯的是牙齒喵。',
    puppeteer: '躲在後面拉線的，最討厭了喵。',
    puppet: '木頭做的也會打人喵？',
    shuten_imp: '越喝越壯……那我得快一點喵。',
    lantern_twin_a: '兩盞燈籠？一盞熄了另一盞會再點回來喵。',
    lantern_twin_b: '要一起吹熄才算數喵。',
    miasma_crows: '一大群！打散牠們喵！',
    crow_small: '散開了還會咬人喵。',
    wraith_samurai: '鎧甲裡沒有人……六回合內解決，不然牠會消失喵。',
    twin_hound: '兩個頭，兩倍口水喵。',
    guardian_statue: '石頭做的也擋在路上……那就一直敲喵。',
    mask_dancer: '面具一換，招式就換……我得跟上牠的節奏喵。',
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
      { speaker: '塔主', text: '你師父……婆婆見過他上去。那雙眼睛已經是紫的了。婆婆守在這，就是不想再有孩子跟上去送命。' },
      { speaker: '塔主', text: '好吧。那就讓婆婆看看，你到底有多少本事。' },
    ],
    iron_claw: [
      { speaker: '旁白', text: '齒輪高速轉動，五對鐵爪同時張開，發出一連串刺耳的喀嚓聲。胸口的核心透著跟塔頂一樣的紫光。' },
      { speaker: '球球', text: '這光……跟師父眼裡的一樣。是塔在操縱它喵。' },
      { speaker: '球球', text: '機關貓不會累……那我就趁它還能動的時候，把它拆掉喵！' },
    ],
    orange_king: [
      { speaker: '塔主', text: '敢打擾本王用膳，就把身上的小魚乾全留下！' },
      { speaker: '球球', text: '村裡的小魚乾就是你搶的？你跟上面那隻大貓是一夥的喵？' },
      { speaker: '塔主', text: '一夥？本王只是趁塔冒出來的時候搬進來罷了。上面那位，本王可不敢惹。' },
      { speaker: '球球', text: '想都別想。小魚乾和師父，我都要帶回去喵！' },
    ],
    cowcat_boss: [
      { speaker: '塔主', text: '塔下那群傢伙攔不住你，算你有點本事。接下來，就由本二當家親自陪你過招。' },
      { speaker: '球球', text: '二當家？那大當家是誰喵？' },
      { speaker: '塔主', text: '塔頂那位紫眼睛的大貓。他一句話，這座塔的傢伙都得聽。' },
      { speaker: '球球', text: '我不是來比武的。快讓路，我還要去找師父喵。' },
    ],
    tanuki_lord: [
      { speaker: '塔主', text: '呵呵，小兄弟，何必急著動手？先陪老夫喝一杯吧。' },
      { speaker: '球球', text: '師父交代過，狸貓遞來的酒絕對不能喝喵。' },
      { speaker: '塔主', text: '你師父？呵，上面那位灌的可不是酒，是魔氣。喝了就再也想不起自己是誰。' },
    ],
    persian_lady: [
      { speaker: '塔主', text: '渾身髒兮兮的野貓，也敢闖進本小姐的樓層？' },
      { speaker: '球球', text: '都已經走到這裡了，我當然還要一路走上塔頂喵。' },
      { speaker: '塔主', text: '塔頂？那隻紫眼睛的大貓連本小姐都不放在眼裡。你要去送死，本小姐先把你攔下來。' },
    ],
    // ---- 2026-09-02 第二波新關主 ----
    frog_daimyo: [
      { speaker: '塔主', text: '呱——本大名的池子，什麼時候輪到一隻小貓來撒野了？' },
      { speaker: '球球', text: '我不是來撒野的，我是來借過的。讓一下喵。' },
      { speaker: '塔主', text: '借過？上面那位紫眼睛的說了，一個都不許放上去。本大名答應過的事，呱，就要做到。' },
    ],
    armadillo_king: [
      { speaker: '旁白', text: '那顆巨大的球緩緩轉了半圈，露出一雙沉靜的眼睛。殼上的舊傷一道疊著一道——都是塔冒出來那天留下的。' },
      { speaker: '球球', text: '牠不像壞人……可是牠擋在路上喵。' },
      { speaker: '球球', text: '打不開的殼……那我就一直敲，敲到它裂開為止喵。' },
    ],
    dragon_cat: [
      { speaker: '旁白', text: '巨大的身軀盤成一圈，鼻孔冒出一小縷煙。牠還在睡——塔還沒冒出來之前，牠就睡在這裡了。' },
      { speaker: '球球', text: '牠睡得好熟……這幾下我可要打得準一點喵。' },
    ],
    hex_abbot: [
      { speaker: '塔主', text: '施主一路殺上來，手上的血債要怎麼算？' },
      { speaker: '球球', text: '我沒殺誰，我只是要接師父回家。老住持讓開喵。' },
      { speaker: '塔主', text: '你師父？呵……貧僧也曾想勸他。結果你看，貧僧的眼睛也紫了。' },
    ],
  },
  bossIntroGeneric: <DialogueLine[]>[
    { speaker: '塔主', text: '到此為止了。' },
    { speaker: '球球', text: '擋路的，都一樣喵。' },
  ],
  /**
   * 關主被打倒後的收場（使用者 2026-09-04：關主要跟師父有關係，打倒後照身分反應）。
   * 身分三種：被魔氣控制的（清醒道謝）、自願守塔的（嘴硬或悔悟）、只是路過被殃及的（讓路）。
   * 稱呼規則：魔物叫他「塔主／上面那位／紫眼睛的大貓」，球球叫「師父」，旁白用「大俠貓」。
   * 沒寫的關主不演（師父那場走結局影片）。
   */
  bossDefeatById: <Record<string, DialogueLine[]>>{
    nekomata: [   // 自願守塔（勸退者）
      { speaker: '塔主', text: '……好孩子。婆婆攔不住你了。' },
      { speaker: '塔主', text: '記住，他還沒被魔氣吞光。你要快，再晚，剩下的就不是你師父了。' },
      { speaker: '球球', text: '婆婆，我一定把他帶回來喵。' },
    ],
    iron_claw: [   // 被塔操縱的機器
      { speaker: '旁白', text: '齒輪一顆一顆停下，胸口那團紫光散了。它本來只是塔裡的一台守門機關，被同一股魔氣牽著動。' },
      { speaker: '球球', text: '操縱它的東西，就在塔頂喵。' },
    ],
    orange_king: [   // 路過被殃及（趁亂搬進來的）
      { speaker: '塔主', text: '別打了別打了！本王只是想吃飽……' },
      { speaker: '塔主', text: '小魚乾在後面的桶子裡，拿去。上面那位上去以後，這塔裡就再也沒有能吃的東西了。' },
      { speaker: '球球', text: '早說嘛喵。' },
    ],
    frog_daimyo: [   // 自願守塔（守信的大名）
      { speaker: '塔主', text: '呱……本大名答應過的事，沒做到。' },
      { speaker: '塔主', text: '罷了。你這膽子，本大名認了。上去吧，池子借你過。' },
    ],
    armadillo_king: [   // 路過被殃及（守著自己地方的老傢伙）
      { speaker: '旁白', text: '巨大的殼緩緩鬆開。牠看了球球一眼，慢慢挪到牆邊，把路讓了出來。' },
      { speaker: '球球', text: '……對不起，也謝謝你喵。' },
    ],
    cowcat_boss: [   // 自願（塔裡的二當家）
      { speaker: '塔主', text: '二當家……居然輸給你這種小不點。' },
      { speaker: '塔主', text: '去吧。跟你講，上面那位的脾氣比我差一百倍。他一掌拍下來，連我都不敢站著。' },
      { speaker: '球球', text: '他以前連罰我蹲馬步都捨不得喵。' },
    ],
    tanuki_lord: [   // 自願（騙子）
      { speaker: '塔主', text: '呵呵……老夫本想騙你一杯酒的。' },
      { speaker: '塔主', text: '上面那位喝的不是酒，是魔氣。喝了就想不起自己是誰。小兄弟，你上去可要記得叫醒他。' },
    ],
    persian_lady: [   // 自願（自尊心）
      { speaker: '塔主', text: '哼……本小姐的樓層，讓你過。' },
      { speaker: '塔主', text: '上面那隻紫眼睛的大貓，本小姐才懶得管。你要去救他，隨便你。' },
    ],
    dragon_cat: [   // 路過被殃及（本來就睡在這裡）
      { speaker: '旁白', text: '龍貓睜開一隻眼睛，看了球球一會，又慢慢閉上。牠只是想繼續睡。' },
      { speaker: '球球', text: '……那你好好睡喵。' },
    ],
    hex_abbot: [   // 被魔氣控制（清醒）
      { speaker: '塔主', text: '……施主，貧僧清醒了。' },
      { speaker: '塔主', text: '上面那位陷得比貧僧深得多。若還救得回來，那只能靠他最掛念的人。快去。' },
      { speaker: '球球', text: '我就是那個人喵。' },
    ],
  },
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
    iron_claw: [
      { speaker: '塔主', text: '齒輪過熱……切換第二形態。' },
      { speaker: '球球', text: '它的爪子燒紅了——別被夾到喵！' },
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
    // ---- 2026-09-02 第二波新關主（有第二階段的兩個）----
    frog_daimyo: [
      { speaker: '塔主', text: '來人！' },
      { speaker: '球球', text: '一下子游出來這麼多隻……先把小的清掉喵！' },
    ],
    hex_abbot: [
      { speaker: '塔主', text: '阿彌陀佛。' },
      { speaker: '球球', text: '他身上長出一層鱗甲了……這下更難打進去喵！' },
    ],
    dragon_cat: [
      { speaker: '塔主', text: '……吵醒我的，要付代價。' },
      { speaker: '球球', text: '牠真的醒了——鱗片全張開了，撐住喵！' },
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
  /**
   * 結局第二句（師父醒來說的第一句）依球球這一路的打法換（使用者 2026-09-04）：
   * 爪力流、隱身流、蜷縮流各一句，看牌組裡哪一類最多；都不明顯就照舊「承讓。」；難度 4 以上再補一句旁白。
   */
  // 師父只講大俠貼圖標題（專案規矩，tests/content/dialogue.test.ts 守著）：換句也只能在標題裡挑，
  // 個人化的那一句改由旁白講（稽核 2026-09-04 中 5）
  masterFirstWords: <Record<'strength' | 'stealth' | 'block' | 'plain', string>>{
    strength: '難逢敵手。',
    stealth: '深藏不露。',
    block: '在下不才。',
    plain: '承讓。',
  },
  masterFirstWordsNarration: <Record<'strength' | 'stealth' | 'block', string>>{
    strength: '師父看了看球球的爪子，又看了看自己的，笑了——這小子的爪子已經比他教的還利。',
    stealth: '師父想起剛才那一路空掌，忍不住搖頭——這身法，他一掌都碰不到。',
    block: '師父拍了拍球球圓滾滾的肚子——能護得住自己，就護得住別人；這孩子出師了。',
  },
  hardModeEpilogue: '這一路，球球走的是最陡的那條樓梯。師父後來每次講起，都要多說一遍。',
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

/** 從一組台詞裡隨機挑一句。**只給演出用**（台詞、音效），會影響玩法的抽選一律走 cs.rng／runRng，不然同種子就重現不出同一局 */
export function pick<T>(xs: readonly T[]): T { return xs[Math.floor(Math.random() * xs.length)] ?? xs[0]!; }

/** 結局那五句：第二句（師父的第一句話）依牌組傾向換；難度 4 以上多一句旁白。牌組看牌面文字裡出現最多的關鍵字。 */
/**
 * 牌組傾向：只看這一路**自己拿的牌**（起始那十張不算——它們本來就偏蜷縮，算進去每個人都是蜷縮流），
 * 而且只算「對球球自己」的效果（給敵人拆爪力的封口術不算爪力流）；某一派要至少 4 張、佔拿到的牌四分之一以上、領先第二名兩張以上才算。
 */
export function deckLeaning(deckIds: readonly string[]): 'strength' | 'stealth' | 'block' | 'plain' {
  const count = { strength: 0, stealth: 0, block: 0 };
  const starter = new Set<string>(STARTER_DECK);
  const picked = deckIds.filter((id) => !starter.has(id));
  for (const id of picked) {
    const def = cardById[id];
    if (!def) continue;
    const fx = [...def.effects, ...(def.upgrade?.effects ?? [])];
    const selfStatus = (name: string) => fx.some((e) => e.kind === 'status' && e.target === 'self' && e.name === name);
    if (selfStatus('爪力')) count.strength += 1;
    if (selfStatus('隱身') || selfStatus('潛水')) count.stealth += 1;
    if (fx.some((e) => e.kind === 'block')) count.block += 1;
  }
  const sorted = (Object.entries(count) as ['strength' | 'stealth' | 'block', number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = [sorted[0]!, sorted[1]!];
  if (picked.length === 0 || top[1] < 4 || top[1] < Math.ceil(picked.length / 4) || top[1] - second[1] < 2) return 'plain';
  return top[0];
}

/** 結局那五句：第二句（師父的第一句話）依牌組傾向在貼圖標題裡換；有傾向時多一句旁白講出個人化的評語；難度 4 以上再多一句旁白。 */
export function victoryLinesFor(deckIds: readonly string[], difficulty: number): DialogueLine[] {
  const key = deckLeaning(deckIds);
  const lines = dialogue.victory.map((l) => ({ ...l }));
  const second = lines[1];
  if (second && second.speaker === '塔主') second.text = dialogue.masterFirstWords[key];
  if (key !== 'plain') lines.splice(2, 0, { speaker: '旁白', text: dialogue.masterFirstWordsNarration[key] });
  if (difficulty >= 4) lines.push({ speaker: '旁白', text: dialogue.hardModeEpilogue });
  return lines;
}
