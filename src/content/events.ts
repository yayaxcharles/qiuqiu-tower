import type { EventDef } from '../engine/types';
import { fengfengEvents } from './fengfeng-events';
import { batch2Events } from './events-batch2';
import { rareEvents } from './events-rare';

/**
 * 5F 固定事件，**一關一版**（2026-09-23 內容擴充第一批，提案第⑥節「5F 秘笈三關三版」）。索引＝關數−1。
 *
 * 原本三關都是同一篇「師父留下的秘笈」：完整一局看三次、每局都看，是全遊戲重複最重的一幕（盤點第②節）。
 * 改成第一關照舊、第二關「師父的舊木箱」、第三關「最後一頁」——一路往上是三段不同的師父線索
 *（掉在樓梯間的秘笈 → 刻著記號、特地留下的木箱 → 墨還沒乾的最後一頁）。
 *
 * **舊存檔**：第二、三關的地圖是改版前生的，5F 仍是 `daxia_teach`。那一篇照舊合法（`validateMap`）、
 * 照舊玩得下去（`chooseNode` 看的是 `fixedFloor`，不是寫死哪一篇）。
 */
export const FIXED_EVENTS_FLOOR_5 = ['daxia_teach', 'daxia_chest', 'daxia_lastpage'] as const;
/**
 * 第一關那一版。舊存檔第二、三關的 5F 也是它；撿到秘笈那段對白只綁這一篇（見 `screens/event.ts`）。
 */
export const FIXED_EVENT_FLOOR_5 = FIXED_EVENTS_FLOOR_5[0];
/** 這一關 5F 排哪一版（關數超出範圍就夾到最近的一關） */
export function fixedEventFloor5(act: number): string {
  return FIXED_EVENTS_FLOOR_5[Math.min(Math.max(Math.floor(act), 1), FIXED_EVENTS_FLOOR_5.length) - 1]!;
}

/*
 * 條件選項（2026-09-23 內容擴充第二批，劇本 design2 第七節）：八篇既有事件的 `choices` 最後各多一條，
 * 帶 `requires`（達成才出現）與 `requiresLabel`（按鈕前的金底標籤）。既有選項的索引與結果圖一張都沒動。
 * 判斷在 `engine/eventcond.ts`；三隻的文字與條件提示句在 `event-text-b2.ts`。
 * 那八條的 `result` 故意留空：**球球那份結果也在 `event-text-b2.ts`**（`NINJA_COND_RESULT_B2`，延後載入、載入時填回，
 * 2026-09-23 b2fin 主控裁定），標籤留在這裡。
 */
export const events: EventDef[] = [
  ...fengfengEvents,
  /*
   * ===== 菲菲的專屬事件（2026-09-12）=====
   *
   * 判準是「這件事只有對她才成立」：
   *   - 師兄的痕跡：她在追球球留下的東西。球球自己遇到會很怪。
   *   - 調藥：她整套是毒，替一張攻擊牌永久加毒對別人沒有意義。
   * 其餘 36 個共用事件不鎖職業，只在顯示時換名字與口氣（見 `eventTextFor`）。
   */
  /*
   * ===== 噹噹的四篇專屬事件（2026-09-17）=====
   *
   * 判準跟菲菲那幾篇一樣：「這件事只有對他才成立」。
   *   - 磨手的護臂：那對護臂是他自己做、自己戴的，內墊磨穿只有他會遇到。
   *   - 偷走的工具箱：他認得自己修過的箱角與那把斷柄鉗。
   *   - 一掌留下的凹痕：他跟大俠貓練承力的那一次，銅面上的凹痕就是那天留下的。
   *   - 歪掉的門框：村貓認得他，因為魔塔出現那一夜是他守在村口。
   *
   * **插圖還沒生**（排在 E 批）。他現在進不了選角畫面，所以這四篇不會排進任何人的地圖；
   * 讓他能選之前要先把圖補上，不然會是破圖——這個專案被回報過好幾次同型的事。
   *
   * 數值是稿子給的第一版，沒有實戰平衡過。形狀照既有事件的慣例：
   * 一個修練、一個拿好處但要付代價、一個什麼都不拿的安全選項。
   */
  { id: 'dangdang_lining', title: '磨手的護臂', hero: 'dangdang', acts: [1, 2],
    text: '噹噹抬起左手，護臂裡忽然一陣刺痛。他解開扣帶，發現布墊已磨穿，銅邊在手腕上刮出一道紅痕。噹噹：「難怪越戴越疼。」工具袋裡還有一塊厚布，也放著包紮用的藥布。他把兩樣攤到膝上，試著屈伸手腕。',
    choices: [
      { label: '重新墊好護臂（升級至多 1 張牌）',
        outcome: [{ kind: 'upgradeCard' }],
        result: '噹噹把厚布折進護臂，磨平刮手的銅邊。他重新扣好，靠著牆試推幾次，將原先太緊的扣帶放鬆一格。噹噹：「這樣手腕才轉得動。剛才綁太死了。」', resultArt: 'dangdang_lining_r0' },
      { label: '先敷藥，讓手腕歇一會兒（回復 16 點生命）',
        outcome: [{ kind: 'heal', n: 16 }],
        result: '噹噹拿藥布敷住傷處，把護臂放在旁邊。等疼痛減輕，他活動手指，墊入厚布，再鬆鬆扣回去。噹噹：「先別磨到傷口。等下次休息再重新調整。」', resultArt: 'dangdang_lining_r1' },
      { label: '調鬆扣帶，繼續上路（無效果）',
        outcome: [],
        result: '噹噹把扣帶放鬆，將衣袖拉進銅邊和手腕之間。他抬了抬手，沒有再刮到剛才那處傷。噹噹：「先墊著，找到地方再拆。」' },
    ] },
  { id: 'dangdang_toolbox', title: '偷走的工具箱', hero: 'dangdang', acts: [1, 2],
    text: '一隻老鼠推著歪了輪子的板車經過，車上壓著一只舊木箱。箱角包了三塊銅片，第四角只釘著薄木板——那塊板子，是噹噹自己釘的。噹噹攔住車：「那只工具箱，是我的。」',
    choices: [
      { label: '收回工具，留下來調整護臂（升級至多 1 張牌）',
        outcome: [{ kind: 'upgradeCard' }],
        result: '老鼠瞇起眼：「我從魔物那裡換來的，有什麼證據？」噹噹說：「底下有一排釘錯的孔。打開，鉗子少半截柄。」老鼠一掀，耳朵就垂了。噹噹取回鉗子和銅錘，用鉗子扳正護臂翹起的邊，試著出手，手腕終於不再卡住。噹噹：「工具我拿走了。那個空箱給你裝零件。」', resultArt: 'dangdang_toolbox_r0' },
      { label: '收回工具，再替老鼠修車（最多失去 6 點生命、獲得 45 條小魚乾）',
        outcome: [{ kind: 'damage', n: 6 }, { kind: 'fish', n: 45 }],
        result: '噹噹報出箱底那排釘錯的孔、那把斷柄鉗，老鼠一掀，耳朵就垂了：「箱子還你。你肯順便修車，我再分你小魚乾。」噹噹抬住車板，讓老鼠抽出歪掉的輪軸敲正，放下車時腰側猛地一疼。老鼠數了 45 條小魚乾遞過來。噹噹：「下次先卸貨。這樣抬，腰受不了。」', resultArt: 'dangdang_toolbox_r1' },
      { label: '只取回工具，繼續趕路（無效果）',
        outcome: [],
        result: '噹噹報出箱底那排釘錯的孔，老鼠一掀，看見斷柄鉗，耳朵就垂了。噹噹挑出能用的工具收好，指了指鬆動的車軸。噹噹：「重的搬到另一頭，這邊別再壓。修車得另找人，我還要上樓。」' },
    ] },
  /*
   * 一掌留下的凹痕：**這一段是進塔前的回憶**，球球、菲菲出現在回憶裡，
   * 不代表這一刻跟他同行（稿子特別交代過這件事）。
   */
  { id: 'dangdang_old_dent', title: '一掌留下的凹痕', hero: 'dangdang', acts: [2],
    text: '噹噹靠著空房裡的木柱歇腳，拿布擦護臂上的灰。新刮痕底下，有一處早就磨圓的凹痕。他用拇指按了按，想起那是在村裡的院子留下的。',
    choices: [
      { label: '照記得的站姿重新練習（升級至多 1 張牌）',
        outcome: [{ kind: 'upgradeCard' }],
        result: '那天球球喊著「我出招了喵！」撞過來，噹噹兩腳站得太近，被撞得一路退到牆邊。路過的大俠貓踢了踢他的後腳跟，只說一句：「站太近了。」噹噹把兩腳挪開，對著木柱練承力，再把手往前送。做到最後幾次，腳下總算沒再打滑。噹噹：「對，就是這個位置。」', resultArt: 'dangdang_old_dent_r0' },
      { label: '捨去總讓自己失去重心的招式（自選移除 1 張牌）',
        outcome: [{ kind: 'removeCard' }],
        result: '那天他被球球撞得連退好幾步，背都碰到了牆。後來才想通，不是手擋得不夠，是有些招一使出來，重心就往前栽。噹噹試過幾個熟悉的動作，把最會讓他往前栽的那一招收了起來。噹噹：「這招跟我的站法合不來，換掉。」', resultArt: 'dangdang_old_dent_r1' },
      { label: '收起擦布，繼續找人（無效果）',
        outcome: [],
        result: '那次大俠貓只說了一句「站太近了」就走了，他自己練到天黑才站對。噹噹把擦布塞回工具袋，重新扣緊護臂，走出房門前又看了一眼那處凹痕。噹噹：「大俠貓，等找到您，我再站一次給您看。」' },
    ] },
  { id: 'dangdang_jammed_gate', title: '歪掉的門框', hero: 'dangdang', acts: [1, 2],
    text: '走廊旁的倉房門框被橫梁壓歪，只推得開一道細縫。兩隻村貓困在裡面，身邊堆著好不容易找回的糧箱；牆邊的小窗鑽得出貓，箱子卻過不去。村貓喊：「是守村口的噹噹！門開不了！」',
    choices: [
      { label: '撐住門框，讓村貓搬出糧箱（最多失去 8 點生命、獲得 50 條小魚乾）',
        outcome: [{ kind: 'damage', n: 8 }, { kind: 'fish', n: 50 }],
        result: '噹噹先問：「人都沒受傷吧？」確定沒事，他才頂住門框，讓村貓一箱箱往外拖。最後一箱過去時，他手臂已抖得厲害，肩頭也被粗木磨破。村貓分出小魚乾替他裝好。噹噹：「箱子先移走，別再堵著門。」', resultArt: 'dangdang_jammed_gate_r0' },
      { label: '用護臂卡住門縫，一起搬出藏物（獲得 1 件常見秘寶、加入 1 張「失手了」）',
        outcome: [{ kind: 'relic', pool: '常見' }, { kind: 'addCard', cardId: 'shishou' }],
        result: '噹噹試著推門，才撐開一點，橫梁就往下沉。他卸下一隻護臂，卡進門底。三人趁空隙搬出糧箱和牆邊的布包；村貓拿出包裡的秘寶，送給他道謝。護臂抽出時已被壓歪，噹噹敲了幾下，勉強戴回去，出手卻總卡住。噹噹：「變形了。這樣下去，連手都轉不順。」', resultArt: 'dangdang_jammed_gate_r1' },
      { label: '先讓村貓從側窗出去，放棄糧箱（回復 10 點生命）',
        outcome: [{ kind: 'heal', n: 10 }],
        result: '噹噹先問：「人都沒受傷吧？」裡頭說沒有，只是捨不得那些糧食。噹噹站到窗外，接住先鑽出來的村貓，再扶另一隻落地。牠們看見他手上有傷，拿隨身的藥替他擦好。噹噹：「箱子先留著。橫梁撐不住，不能拿人去換。」', resultArt: 'dangdang_jammed_gate_r2' },
    ] },
  { id: 'feifei_trace', title: '師兄的痕跡', hero: 'feifei', acts: [1, 2],
    text: '牆縫裡卡著幾根針，看得出用的是師父教的那套手法，有的已經彎了。她走近查看，發現地上散著小魚乾，旁邊還掛著深藍色的線頭。那是師兄頭巾上的線。他也走過這裡。',
    choices: [
      { label: '把針收起來（回復 12 點生命、獲得 20 條小魚乾）',
        outcome: [{ kind: 'heal', n: 12 }, { kind: 'fish', n: 20 }],
        result: '菲菲把牆上的針一根根拔下，連同線頭收好。她吃了些小魚乾，再把剩下的裝進袋子。菲菲：「師兄的頭巾又破了。等找到他，再替他補。」', resultArt: 'feifei_trace_r0' },
      // 標籤照實際效果寫（使用者 2026-09-14 裁定改標籤）：原本寫「下一場魔物更強、小魚乾加倍」，那套玩法從來沒做，旗標也沒人讀
      { label: '照著痕跡追上去（最多失去 5 點生命；隨機獲得 1 張罕見忍術牌、獲得 60 條小魚乾）',
        outcome: [{ kind: 'flag', name: 'feifei_chasing' }, { kind: 'damage', n: 5 }, { kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }, { kind: 'fish', n: 60 }],
        result: '菲菲追著痕跡跑過轉角，被木箱絆得擦破膝蓋。盡頭只留著一卷忍術和一袋小魚乾。菲菲：「還是沒追上……至少他往這邊走，沒有找錯。」', resultArt: 'feifei_trace_r1' },
    ] },
  { id: 'feifei_brew', title: '調藥', hero: 'feifei',
    text: '菲菲在牆角發現一叢葉背泛紫的草。揉開的氣味很像常用的藥材，卻濃烈得多。她翻了翻隨身的本子，沒有找到完全相同的記錄。',
    choices: [
      { label: '熬一鍋（升級至多 1 張牌）',
        outcome: [{ kind: 'upgradeCard' }],
        result: '她把草葉搗成濃汁，就著燈火替針尖一根根上藥。菲菲：「比平常那批濃，分量得減一點。」', resultArt: 'feifei_brew_r0' },
      { label: '直接嚼一口試毒性（最多失去 8 點生命、獲得 1 張稀有牌）',
        outcome: [{ kind: 'damage', n: 8 }, { kind: 'addRandomCard', pool: '絕學', rarity: '稀有' }],
        result: '她猶豫了好一會，仍咬下一點草葉。苦澀伴著刺痛湧上來，她彎下身乾嘔，眼淚直掉。等到能握筆了，她才把反應記進本子。菲菲：「記下來了……不要再試第二次。」', resultArt: 'feifei_brew_r1' },
      { label: '不要碰（無效果）',
        outcome: [],
        result: '菲菲把折下的草葉放回牆邊，擦掉指尖的汁。菲菲：「聞起來再像，也不能當成同一種用。」' },
    ] },
  /*
   * 2026-09-13 新增的兩個（文字由另一位寫、數值由這邊定）。判準一樣：只有對她才成立。
   *   - 破掉的針袋：布條只夠用一次，補袋子還是包紮傷口——她的毒針既是依靠也會刺到自己。
   *   - 牆後的暗號：暗號是她怕痛時跟師兄求救的習慣，所以只有她聽得出「回應不對勁」。
   */
  { id: 'feifei_pouch', title: '破掉的針袋', hero: 'feifei', acts: [1, 2],
    text: '菲菲在舊櫃裡找到一條乾淨布條，正好能換掉手上滲血的繃帶。轉身時，針袋卻被櫃角勾破，毒針從破口探了出來。她趕緊拎住袋口。布條只有這一截，包了傷口，就不夠補袋子。',
    choices: [
      { label: '布條拿來補針袋（獲得 1 張罕見的忍術牌）',
        outcome: [{ kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }],
        result: '她用布條封住破口，試了幾次取針的角度，才把袋子繫回腰邊。菲菲：「至少不會再扎到手。這個傷口，得等下一站再處理。」', resultArt: 'feifei_pouch_r0' },
      { label: '布條拿來包紮（回復 18 點生命）',
        outcome: [{ kind: 'heal', n: 18 }],
        result: '她用乾淨布條包好傷口，把破針袋另放在不會碰到手的地方。取針時得繞開破口，她便多檢查了一遍。菲菲：「手不痛，才拿得穩。袋子等找到布再補。」', resultArt: 'feifei_pouch_r1' },
    ] },
  { id: 'feifei_signal', title: '牆後的暗號', hero: 'feifei', acts: [2, 3],
    text: '牆後響起熟悉的求援節奏，是她和師兄練功時用的暗號。菲菲敲出回應，裡頭卻只重複同一段聲音。她從門縫望進去，才看見轉動的齒輪。夾合的鐵片下壓著一袋小魚乾，想拿就得把手伸進去。',
    choices: [
      { label: '用飛針卡住齒輪（獲得 45 條小魚乾，但牌組多一張壞毛病）',
        outcome: [{ kind: 'fish', n: 45 }, { kind: 'addCard', cardId: 'shibai' }],
        result: '她用飛針卡住齒輪，取出小魚乾。針還卡在鐵齒間，已經壓彎了。她抱著袋子站著沒動，眼皮一陣一陣地重——這一下耗掉的力氣比想像中多。菲菲：「先歇一下……就一下下。」', resultArt: 'feifei_signal_r0' },
      { label: '墊著布撐開機關（獲得 45 條小魚乾，最多失去 10 點生命）',
        outcome: [{ kind: 'fish', n: 45 }, { kind: 'damage', n: 10 }],
        result: '她墊著袖布撐開機關，鐵片仍劃破了手。菲菲：「把手抽出來，別卡在裡面……」取出小魚乾後，她在牆邊按住傷口。那聲音再響，她也沒有回頭。', resultArt: 'feifei_signal_r1' },
    ] },
  { id: 'daxia_teach', title: '師父留下的秘笈', fixedFloor: 5,
    text: '樓梯間掉著的那本秘笈，封面已經起毛。球球在樓梯上坐下，翻開來往後找了幾頁。',
    choices: [
      { label: '研讀秘笈（從 3 張絕學牌中選擇 1 張）', outcome: [{ kind: 'chooseCard', pool: '絕學', n: 3 }], result: '球球攤開秘笈，仔細看上面的三幅圖。球球：「字有點難認，先看圖好了喵。」', resultArt: 'daxia_teach_r0' },
      { label: '放回原位（無效果）', outcome: [], result: '球球合上秘笈，放回樓梯邊。球球：「這招看不懂，等找到師父再問他喵。」' },
    ] },
  /*
   * 5F 第二、三關那兩版（2026-09-23 內容擴充第一批）。四隻各有自己的圖與文字：
   * 菲菲走引號句對照（`FEIFEI_EVENT_LINES`），噹噹、封封整段改寫（`event-text.ts`）。
   * 敘述裡不用「牠」指主角——菲菲那邊換名字之後要跟著換成「她」，多一個片語就多一條要維護的對照。
   * 選項順序跟插圖的結果序號綁在一起（`_r0`／`_r1`／`_r2`，美術代理 art1 的對照表），不要調換。
   */
  { id: 'daxia_chest', title: '師父的舊木箱', fixedFloor: 5, acts: [2],
    text: '樓梯轉角擱著一只包鐵角的舊木箱，箱蓋上刻著一個大貓掌印，是師父的記號。鎖頭一扳就彈開了，像是特地留給誰來開。球球蹲下來，把手搭上箱蓋。',
    choices: [
      { label: '翻出箱底的秘笈（從 3 張絕學牌中選擇 1 張）', outcome: [{ kind: 'chooseCard', pool: '絕學', n: 3 }],
        result: '球球把箱子裡的雜物推到一邊，從箱底捧出一本舊秘笈。翻開一看，裡面畫著三幅招式圖。球球：「這本比樓下那本還舊，師父以前就在練這些喵。」', resultArt: 'daxia_chest_r0' },
      { label: '帶走箱裡的舊忍具（隨機獲得 2 個忍具）', outcome: [{ kind: 'potions', n: 2 }],
        result: '箱子裡還收著兩件舊忍具，擦掉灰還能用。球球一手拿起一件，舉起來看了看。球球：「師父的東西，我先借來用喵。」', resultArt: 'daxia_chest_r1' },
      { label: '蓋回去（無效果）', outcome: [],
        result: '球球把箱蓋輕輕蓋回去，再把彈開的鎖頭掛好。球球：「這是師父的箱子，等他回來自己開喵。」' },
    ] },
  { id: 'daxia_lastpage', title: '最後一頁', fixedFloor: 5, acts: [3],
    text: '塔頂前的石階上落著一頁撕下來的秘笈，石燈籠的光照在紙上。上頭畫著幾隻出招的貓，字是師父的筆跡，墨色還亮，像是剛寫好不久。球球彎下腰，把紙頁撿了起來。',
    choices: [
      { label: '照著最後一頁練（從 3 張絕學牌中選擇 1 張）', outcome: [{ kind: 'chooseCard', pool: '絕學', n: 3 }],
        result: '球球撿了一顆小石頭，把紙頁壓在石階上，照著上面的圖擺好架勢，一招一招練下去。球球：「這一招師父還沒教過我，原來寫在這裡喵。」', resultArt: 'daxia_lastpage_r0' },
      { label: '摺進衣襟，想著師父教過的（自選升級至多 2 張牌）', outcome: [{ kind: 'upgradeCard' }, { kind: 'upgradeCard' }],
        result: '球球在石階上坐下，把紙頁摺小，塞進衣襟裡，閉上眼睛，把師父教過的招式從頭想了一遍。球球：「師父說過，招式不用多，要練熟喵。」', resultArt: 'daxia_lastpage_r1' },
      { label: '收好不看（回復 10 點生命）', outcome: [{ kind: 'heal', n: 10 }],
        result: '球球沒有打開紙頁，把它收進腰間的小袋裡，靠著石欄杆坐下來，喝了幾口水。球球：「等見到師父，再請他親口教我喵。」', resultArt: 'daxia_lastpage_r2' },
    ] },
  /*
   * ===== 球球的三篇專屬事件（2026-09-23 內容擴充第一批）=====
   *
   * 另外三隻各有四篇、他一篇都沒有（盤點第①節）。判準照舊：「這件事只有對他才成立」——
   * 跟自己頭上一模一樣的藍頭巾、他丟慣了的手裏劍、跟他長得一模一樣的影子。
   * 只有一份文字（專屬事件排不進別人的地圖，連線局整批不排，見 `map.ts` 的 `MapOpts.hero`）。
   * 屋頂上的影子打的是影子鏈那一場（`shadow_duel`，照關數接 `_a2`／`_a3`；第一批暫用鏡子走廊那場，第二批換掉），
   * 兩個選項都記 `chain:shadow_2`（遇過影子），追上去另記 `chain:shadow_2_fought`、躲著看另記 `chain:shadow_2_watched`，
   * 留給第二批「影子的真面目」照上一集怎麼選接後集（主控 2026-09-23 指定的鍵名）。旗標在 `run.flags`，跟著存檔走；
   * `chain:` 開頭的收進整局指紋（這篇連線不排，平常碰不到，是替之後的鏈留的）。
   */
  { id: 'ninja_blue_headband', title: '欄杆上的藍頭巾', hero: 'ninja', acts: [1, 2],
    text: '石階轉角的木欄杆上，綁著一條洗到褪色的藍頭巾。樣式跟球球頭上那條一模一樣，連打結的方法都是師父教的那一種。球球伸手摸了摸，布邊已經被風吹得起了毛。',
    choices: [
      { label: '綁在手腕上（生命上限與當前生命各 +6）', outcome: [{ kind: 'maxHp', n: 6 }],
        result: '球球把頭巾解下來，一圈一圈纏在手腕上綁緊，再用力握了握拳。球球：「綁緊一點，出爪就更有力了喵。」', resultArt: 'ninja_blue_headband_r0' },
      { label: '撕成繃帶（回復 18 點生命）', outcome: [{ kind: 'heal', n: 18 }],
        result: '球球在石階上坐下，把頭巾撕成幾條布，一圈圈纏在腿上的傷口，剩下的碎布擱在階邊。球球：「舊布拿來包傷口，剛剛好喵。」', resultArt: 'ninja_blue_headband_r1' },
      { label: '留著給師父認路（無效果）', outcome: [],
        result: '球球把頭巾重新綁緊，打了一個師父教的結。球球：「師父下樓的時候看到它，就認得回家的路了喵。」' },
    ] },
  { id: 'ninja_target', title: '滿是刀痕的木靶', hero: 'ninja', acts: [1, 2],
    text: '樓梯旁的木地板上立著一面圓木靶，靶面插滿生鏽的手裏劍，只有靶心被磨得發亮。不知道是誰，在這裡練了多少個晚上。球球摸著下巴，抬頭看了好一會兒。',
    choices: [
      { label: '練到天黑（自選升級至多 1 張牌；最多失去 6 點生命）', outcome: [{ kind: 'upgradeCard' }, { kind: 'damage', n: 6 }],
        result: '球球對著木靶一枚接一枚地射，射到靶架上的燈籠都亮了起來。臉頰擦破了皮，貼著一塊布，汗一直往下滴，最後一枚總算正中靶心。球球：「中了！這次是真的中了喵！」', resultArt: 'ninja_target_r0' },
      { label: '撿還能用的暗器（隨機獲得 1 張罕見忍術牌）', outcome: [{ kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }],
        // 撿到的是隨機一張罕見忍術牌（可能是「先睡了」那種跟暗器無關的），所以台詞不指名哪一招（實機驗收 2026-09-23）
        result: '球球從靶上拔下幾枚手裏劍，斷掉的丟在地上，挑出三枚還能用的，握在手裡掂了掂。球球：「還能用的都帶走，說不定哪天用得上喵。」', resultArt: 'ninja_target_r1' },
      { label: '走開（無效果）', outcome: [],
        result: '球球看了靶心最後一眼，轉身走回樓梯。球球：「練功要緊，找師父更要緊喵。」' },
    ] },
  { id: 'ninja_roof_shadow', title: '屋頂上的影子', hero: 'ninja', acts: [2, 3],
    text: '夜裡，球球翻上一片瓦屋頂。高處的屋簷上，一道黑影正在跑——綁著頭巾，身形跟球球一模一樣，只有一雙眼睛亮著紫光。球球蹲在低處，一時看傻了。',
    choices: [
      { label: '追上去（進入戰鬥，勝利後額外獲得 30 條小魚乾、可升級至多 1 張牌）',
        // 打的是影子鏈自己那一場（`shadow_duel`，2026-09-23 內容擴充第二批）：同一隻鏡中對手，名牌「球球的影子」、開場白不再是「從鏡子裡跨出來」
        outcome: [{ kind: 'flag', name: 'chain:shadow_2' }, { kind: 'flag', name: 'chain:shadow_2_fought' }, { kind: 'fight', encounterId: 'shadow_duel', bonusFish: 30, bonusUpgrades: 1 }],
        result: '球球踩著瓦片追上去。黑影在屋脊上停下，轉過身來，擺出跟球球一模一樣的架勢。球球：「學得這麼像，你到底是誰喵？」' },
      { label: '躲著看它的招式（自選移除 1 張牌）', outcome: [{ kind: 'flag', name: 'chain:shadow_2' }, { kind: 'flag', name: 'chain:shadow_2_watched' }, { kind: 'removeCard' }],
        result: '球球躲到屋脊後面，只露出頭和爪子。黑影在屋簷上一招接一招地練，飛踢、翻身，全是球球會的招式，卻使得比球球還俐落。看著看著，球球發現自己有一招老是多了一個破綻。球球：「那一招，我不要再用了喵。」', resultArt: 'ninja_roof_shadow_r1' },
    ] },
  { id: 'toll', title: '留下買路財',
    text: '轉角站著一隻橘貓山賊，手裡的木棒比牠還長。「留下買路財！」牠喊得很大聲，兩條腿卻抖個不停。',
    choices: [
      { label: '付 30 條小魚乾買路', costFish: 30, outcome: [{ kind: 'flag', name: 'toll_paid' }], result: '山賊把小魚乾數了三遍，才讓出路來。球球：「數好了就讓開，我還要趕路喵。」', resultArt: 'toll_r0' },
      { label: '打一場（勝利後額外獲得 40 條小魚乾）', outcome: [{ kind: 'flag', name: 'toll_fought' }, { kind: 'fight', encounterId: 'orange_bandit', bonusFish: 40 }], result: '球球收緊魚乾袋，伸出爪子。山賊舉起木棒，又朝轉角看了一眼。球球：「還在等幫手喵？我可不等喵。」' },
    ] },
  { id: 'robin', title: '分糧救急',
    text: '幾隻村貓縮在角落，肚子餓得咕嚕叫。牠們說，帶來的小魚乾都被魔物搶走了。球球停下腳步，摸了摸自己的魚乾袋。',
    choices: [
      { label: '分出目前一半的小魚乾（回復 15 點生命、移除 1 張牌）', outcome: [{ kind: 'flag', name: 'robin_shared' }, { kind: 'fishHalve' }, { kind: 'heal', n: 15 }, { kind: 'removeCard' }], result: '村貓們收下小魚乾，湊在一起分著吃，也硬塞了幾條給球球。球球坐下來吃了，看牠們連糧袋都護不住，想了想，挑出一招，拆開來一步一步教給牠們守糧用。球球：「這招送你們，我就不帶著走了喵。」', resultArt: 'robin_r0' },
      { label: '繼續趕路（無效果）', outcome: [], result: '球球抱緊魚乾袋，低頭從村貓身旁走過。球球：「對不起，這些還得留著路上吃喵。」' },
    ] },
  // 文案 2026-09-11 改（使用者）：原本是「幫我……隨便拿一樣走」，讀起來像球球在拿傷者的最後一點東西。
  // 改成球球**已經救了牠**、這是對方要給的謝禮——同一個選擇，但球球是恩人不是撿便宜的
  { id: 'rescue', title: '江湖救急',
    text: '球球把受傷的村貓救到安全的角落，替牠包好傷口。村貓緩過氣，拿出一包小魚乾和一罐備用的貓草藥：「謝謝你救了我。這兩樣請挑一樣，讓我表個心意。」',
    choices: [
      { label: '收下貓草藥（回復 20 點生命）', outcome: [{ kind: 'flag', name: 'rescue_took_herb' }, { kind: 'heal', n: 20 }], result: '貓草藥一入口，球球就苦得皺起了臉。喝完後，傷口總算沒那麼痛了。球球：「好苦，快給我一口水喵！」', resultArt: 'rescue_r0' },
      { label: '收下小魚乾（獲得 40 條小魚乾）', outcome: [{ kind: 'flag', name: 'rescue_took_fish' }, { kind: 'fish', n: 40 }], result: '球球收好小魚乾，替村貓檢查了一次繃帶，才起身道別。球球：「傷還沒好，先別亂跑喵。」', resultArt: 'rescue_r1' },
    ] },
  { id: 'blocked', title: '此路不通',
    text: '樓梯被一座垃圾山堵住了。山頂插著一塊新木牌，寫著「此路不通」——木牌是新的，垃圾卻是舊的，是有人故意擋在這裡。破木板底下露出一卷忍術卷軸；旁邊還有一條小走道，看起來繞得過去。',
    choices: [
      { label: '翻過垃圾山（最多失去 6 點生命；隨機獲得 1 張罕見忍術牌）', outcome: [{ kind: 'damage', n: 6 }, { kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }], result: '球球抓住卷軸，腳下卻一滑，滾到了垃圾山另一邊。牠坐起來揉揉肩膀，卷軸還好好地抱在懷裡。球球：「痛死了，早知道就踩穩再拿喵。」', resultArt: 'blocked_r0' },
      { label: '從旁邊繞過去（無效果）', outcome: [], result: '球球沿著旁邊的小走廊繞過垃圾山，回到樓梯前。球球：「這邊明明能走，差點白爬一趟喵。」' },
    ] },
  { id: 'seclusion', title: '閉關',
    text: '樓梯旁有間小房間，門一推上，外面的吵鬧聲就全斷了。牆上刻滿爪痕，一道疊一道，最深的那幾道比球球的爪子還寬。有人在這裡閉關過很久。球球：「好安靜……連自己的心跳都聽得見喵。」',
    choices: [
      { label: '對著爪痕練招（升級至多 1 張牌）', outcome: [{ kind: 'upgradeCard' }], result: '球球把爪子貼上最深的那道爪痕，照著它的方向揮了幾次，才發現自己一直出得太直。球球：「要斜著進去，難怪以前抓不深喵。」', resultArt: 'seclusion_r0' },
      { label: '打坐休息（回復 10 點生命）', outcome: [{ kind: 'heal', n: 10 }], result: '球球學著閉關的人盤腿坐好，本來想好好打坐，沒多久就睡著了。醒來時，肩膀和背都鬆開了。球球：「閉關原來是這樣閉的喵？」', resultArt: 'seclusion_r1' },
    ] },
  { id: 'hidden_box', title: '深藏不露',
    text: '牆縫裡卡著一個小箱子，上面貼著一張紙條，意味不明，很像師父會做的事。',
    choices: [
      { label: '打開箱子（隨機獲得 1 件常見秘寶、牌組加入 1 張壞毛病「中計了」）', outcome: [{ kind: 'relic', pool: '常見' }, { kind: 'addCard', cardId: 'zhongji' }], result: '球球剛拿起秘寶，箱蓋裡就彈出一隻拳頭，差點打中牠的鼻子。牠嚇得往後縮，再伸爪時還有些猶豫。球球：「誰放的機關，差點打到我喵！」', resultArt: 'hidden_box_r0' },
      { label: '不碰箱子（無效果）', outcome: [], result: '球球繞著箱子看了一圈，最後還是沒碰它。球球：「這張紙條怪怪的，別開好了喵。」' },
    ] },
  { id: 'sunbath', title: '曬太陽',
    text: '陽光從窗縫灑進來，在地板上留下一塊暖暖的光斑，大小剛好夠球球蜷成一團。',
    choices: [
      { label: '曬著太陽打盹（回復 12 點生命）', outcome: [{ kind: 'heal', n: 12 }], result: '球球躺在陽光下睡著了。醒來伸個懶腰，渾身都暖了。球球：「好舒服，連背都不痠了喵。」', resultArt: 'sunbath_r0' },
      { label: '曬著太陽整理招式（移除 1 張牌）', outcome: [{ kind: 'removeCard' }], result: '球球在陽光下歇著，回想自己最近學過的招式，把最不順手的那一招挑了出來。球球：「這招老是出錯，就先不練了喵。」', resultArt: 'sunbath_r1' },
    ] },
  { id: 'rat_stall', title: '可疑的飯糰攤',
    text: '一隻老鼠推著攤車叫賣，飯糰上還留著牙印。「特價！20 條小魚乾一顆，吃了包你有感覺！」牠說完，悄悄把咬過的一面轉向背後。',
    choices: [
      { label: '買一顆吃（花費 20 條小魚乾；50% 機率生命上限與當前生命各 +5，否則牌組加入 1 張壞毛病「失手了」）', costFish: 20,
        outcome: [{ kind: 'gamble', p: 0.5, win: [{ kind: 'maxHp', n: 5 }], lose: [{ kind: 'addCard', cardId: 'shishou' }] }],
        result: '球球付了錢，把飯糰三口吞下去。老鼠握著攤車的把手退了兩步，一直偷看球球的臉色，好像在等什麼。', resultArt: 'rat_stall_r0' },
      { label: '不買（無效果）', outcome: [], result: '球球指著飯糰上的牙印。老鼠連忙把它翻過來，卻已經來不及了。球球：「咬過的還拿出來賣，我才不買喵。」' },
    ] },
  { id: 'lost_kitten', title: '迷路的小黑貓',
    text: '一隻小黑貓坐在樓梯上抹眼淚，頭上的忍者頭巾太大，滑下來遮住眼睛。「我找不到集合的房間了……」球球替牠掀起頭巾，剛好聽見下方轉角傳來喊牠的聲音。',
    choices: [
      { label: '送牠到轉角的集合處（隨機獲得 2 個忍具）', outcome: [{ kind: 'potions', n: 2 }], result: '球球把小黑貓送回同伴身邊。小黑貓拿出兩個忍具，塞進球球手裡，揮爪向牠道謝。球球：「下次跟緊一點，別再走丟了喵。」', resultArt: 'lost_kitten_r0' },
      { label: '指出集合處，讓牠自己回去（獲得 15 條小魚乾）', outcome: [{ kind: 'fish', n: 15 }], result: '小黑貓聽見同伴在轉角呼喚，留下 15 條小魚乾作為謝禮，跑了過去。球球：「對，就是那邊，看著路喵。」', resultArt: 'lost_kitten_r1' },
      { label: '把鈴鐺繫在牠的頭巾上（交出「鈴鐺」；生命上限與當前生命各 +10、隨機獲得 1 個忍具）', requires: { kind: 'relic', ids: ['bell'] }, requiresLabel: '鈴鐺',
        outcome: [{ kind: 'loseRelicId', id: 'bell' }, { kind: 'maxHp', n: 10 }, { kind: 'potions', n: 1 }],
        result: '', resultArt: 'lost_kitten_r2' },
    ] },
  // ===== 2026-08-31 補 20 個。本來只有 10 個，兩三局就全看過 =====

  { id: 'old_well', title: '古井',
    text: '塔內天井中央有一口古井，水面映著球球探頭的模樣。井邊立著木牌：「投入小魚乾，許個願。不保證成真。」',
    choices: [
      { label: '投入 30 條小魚乾許願（50% 機率隨機獲得 1 件常見秘寶，否則無獎勵；小魚乾不退還）', costFish: 30,
        outcome: [{ kind: 'gamble', p: 0.5, win: [{ kind: 'relic', pool: '常見' }], lose: [] }],
        result: '小魚乾落進井裡，水面泛起漣漪。球球趴在井邊，往下望了好一會兒。球球：「希望這趟能順利找到師父喵。」', resultArt: 'old_well_r0' },
      { label: '對著倒影練招（升級至多 1 張牌）', outcome: [{ kind: 'upgradeCard' }], result: '水面平靜後，球球對著倒影練習，仔細看自己抬爪、轉身的樣子。球球：「右肩抬太高了，這樣難怪打不準喵。」', resultArt: 'old_well_r1' },
      { label: '離開古井（無效果）', outcome: [], result: '球球看了一眼井底，把小魚乾收回袋裡，轉身離開。球球：「還是留著買吃的好了喵。」' },
    ] },

  { id: 'broken_shrine', title: '倒了的神龕',
    text: '一座小神龕倒在牆邊，貓神像摔成兩截。翻倒的供盤旁散著一大把小魚乾，神像的眼睛在暗處泛著微光。',
    choices: [
      { label: '扶正神龕、安放神像（生命上限與當前生命各 +6）', outcome: [{ kind: 'maxHp', n: 6 }], result: '球球扶起神龕，把兩截神像拼好。神像亮了起來，暖意從爪尖傳到身上，牠深吸一口氣，胸口也舒展了。球球：「這是在謝我喵？」', resultArt: 'broken_shrine_r0' },
      { label: '拿走供品（獲得 45 條小魚乾、牌組加入 1 張壞毛病「走火入魔」）', outcome: [{ kind: 'fish', n: 45 }, { kind: 'addCard', cardId: 'zouhuo' }],
        result: '球球抱起供品就走，神像卻冒出一縷冷氣，鑽進牠的胸口。牠急忙停下，呼吸已經亂了。球球：「怎麼回事，胸口好冷喵！」', resultArt: 'broken_shrine_r1' },
      // 條件選項【魔氣】（2026-09-23 第三批，design3 6-5）：身上有沾了魔氣的秘寶才出現，淨化一件；三隻的文字與條件提示句在 `event-text-b3rare.ts`
      { label: '把沾了魔氣的東西供在神龕前（淨化 1 件沾了魔氣的秘寶）', requires: { kind: 'miasmaRelic' }, requiresLabel: '魔氣',
        outcome: [{ kind: 'purify', n: 1 }],
        result: '球球把那件東西捧出來，擺在兩截神像中間的供盤上。神像的眼睛亮成金色，紫色的霧從那件東西上一縷一縷被抽走，鑽進神像的裂縫，再也沒有出來。球球把它拿回來，摸起來是暖的。球球：「謝謝貓神，下次我一定把你扶好喵。」', resultArt: 'broken_shrine_r2' },
    ] },

  { id: 'sparring_cat', title: '硬要切磋的白貓',
    text: '一隻白貓抱著手臂擋住樓梯，身旁還有穿著黑衣的師弟。「陪我們練一場。贏了，另外給你 60 條小魚乾。」球球想從旁邊走，白貓也跟著橫跨一步，硬是不肯讓路。',
    choices: [
      { label: '接下挑戰（打一場，勝利後額外獲得 60 條小魚乾）', outcome: [{ kind: 'fight', encounterId: 'white_duelist', bonusFish: 60 }], result: '白貓擺好架勢，旁邊的黑貓也抬起爪子。球球把魚乾袋收好，站到兩隻貓面前。球球：「兩個一起打，你們也好意思喵？」' },
      { label: '硬從旁邊擠過去（最多失去 8 點生命）', outcome: [{ kind: 'damage', n: 8 }], result: '球球從旁邊往樓梯擠，白貓卻撞了過來，撞得牠肩膀發麻。牠忍痛鑽過空隙，快步上樓。球球：「不陪你打，就故意撞我喵？」', resultArt: 'sparring_cat_r1' },
      { label: '站著不動，讓他撞（最多失去 3 點生命；獲得 30 條小魚乾、隨機獲得 1 個忍具）', requires: { kind: 'anyOf', of: [{ kind: 'deckTag', tag: '反彈', min: 3 }, { kind: 'relic', ids: ['bronze_mirror', 'turtle_shell', 'anvil'] }] }, requiresLabel: '反彈',
        outcome: [{ kind: 'damage', n: 3 }, { kind: 'fish', n: 30 }, { kind: 'potions', n: 1 }],
        result: '', resultArt: 'sparring_cat_r2' },
    ] },

  { id: 'cat_tower', title: '好高的貓抓柱',
    text: '一根貓抓柱直抵天花板，頂端掛著一個落滿灰的小包。柱身滿是深淺不一的抓痕，底部有幾道排得特別整齊，像是一套出爪的次序。',
    choices: [
      { label: '爬到頂端取物（最多失去 10 點生命，隨機獲得 1 件常見秘寶）', outcome: [{ kind: 'damage', n: 10 }, { kind: 'relic', pool: '常見' }],
        result: '球球攀到貓抓柱頂端，伸爪扯下裝著秘寶的小包。麻繩磨得前腿一路發燙。球球：「拿到了，可是爪子好痛喵。」', resultArt: 'cat_tower_r0' },
      { label: '照著底部爪痕練習（隨機獲得 1 張罕見絕學牌）', outcome: [{ kind: 'addRandomCard', pool: '絕學', rarity: '罕見' }],
        result: '球球照著底部的爪痕練習，從抬爪到收勢，總算把這一招學了下來。球球：「原來爪痕是照順序留的喵。」', resultArt: 'cat_tower_r1' },
    ] },

  { id: 'lost_scroll', title: '掉在地上的卷軸',
    text: '階梯上掉著一卷沒署名的卷軸，攤開來是三段忍術手印。每一段旁邊都有人用小字寫了筆記，最後一段只寫著：「這段我也沒練成。」轉角的舊書攤探出一隻戴眼鏡的老貓：「收秘笈，破的也收。有筆記的，另外算價。」球球：「筆記比招式還多喵。」',
    choices: [
      { label: '挑一段照著練（從 3 張忍術牌中選擇 1 張）', outcome: [{ kind: 'chooseCard', pool: '忍術', n: 3 }], result: '球球把卷軸壓在階梯上，照著筆記一個手印一個手印地結，結到第三個，手指差點打結。球球：「先學一段就好，手指要抽筋了喵。」', resultArt: 'lost_scroll_r0' },
      { label: '賣給舊書攤（獲得 40 條小魚乾）', outcome: [{ kind: 'fish', n: 40 }], result: '舊書攤的老貓一頁頁翻看筆記，推了推眼鏡，數了 40 條小魚乾給球球。球球：「原來值錢的是筆記，不是招式喵。」', resultArt: 'lost_scroll_r1' },
    ] },

  { id: 'noisy_kitchen', title: '很吵的廚房',
    text: '樓梯轉角的廚房傳來一陣鏗鏘聲，爐上的湯鍋咕嚕作響，蒸氣把鍋蓋頂得直跳。灶邊貼著「我吃不完但得先走了，想吃自己盛一碗」，旁邊還放著一盒供人取用的備用忍具。',
    choices: [
      { label: '盛一碗熱湯（回復相當於生命上限 50% 的生命）', outcome: [{ kind: 'healPercent', p: 0.5 }], result: '球球吹涼熱湯，連湯帶料吃得乾乾淨淨。肚子暖起來，身上的痠痛也減輕了。球球：「這湯真好喝喵。」', resultArt: 'noisy_kitchen_r0' },
      { label: '取用備用忍具（隨機獲得 2 個忍具）', outcome: [{ kind: 'potions', n: 2 }], result: '球球從備用品盒裡取出兩個忍具，照著盒邊的圖示確認用法。球球：「原來是給路過的人用的，我收下了喵。」', resultArt: 'noisy_kitchen_r1' },
      { label: '不取用，繼續走（無效果）', outcome: [], result: '球球擺好碰歪的碗，從走廊離開廚房。球球：「留給後面的人吧喵。」' },
      { label: '留一個用不上的忍具在盒子裡，換一碗加料的（交出 1 個忍具；回復相當於生命上限 50% 的生命、生命上限與當前生命各 +4）', requires: { kind: 'potionsFull' }, requiresLabel: '忍具滿了',
        outcome: [{ kind: 'losePotion' }, { kind: 'healPercent', p: 0.5 }, { kind: 'maxHp', n: 4 }],
        result: '', resultArt: 'noisy_kitchen_r3' },
    ] },

  { id: 'mirror_hall', title: '鏡子走廊',
    text: '走廊兩側排滿鏡子，無數個球球同時抬起頭。其中一面慢了半拍，接著，鏡中的球球竟先擺出了迎戰的架勢。',
    choices: [
      // 本來是「直接升級兩張牌、掉 12 血」——使用者 2026-09-02：「我以為會有一個影球球是敵人跟我對打」。
      // 改成真的打一場（對手依關數變強），贏了才在獎勵畫面挑兩張牌升級
      { label: '與鏡中的自己過招（進入戰鬥，勝利後可升級至多 2 張牌）', outcome: [{ kind: 'fight', encounterId: 'mirror_duel', bonusFish: 0, bonusUpgrades: 2 }],
        result: '鏡中的球球走了出來，跟著牠抬起前爪。球球往旁邊挪了一步，對方也挪了一步。球球：「連這也要學，那就來打一場喵。」' },
      { label: '盯著出口快步走過（無效果）', outcome: [], result: '球球盯著走廊出口，沒有再看兩側的鏡子，一口氣走了出去。球球：「這地方真怪，別待了喵。」' },
    ] },

  { id: 'sleeping_guard', title: '睡著的守衛',
    text: '一隻大橘貓靠著門邊打盹，腰間的錢袋鼓鼓的。牠每打一次呼，爪尖就跟著動一下；身旁還留著一條能夠側身通過的窄路。',
    choices: [
      { label: '伸爪偷錢袋（進入戰鬥，勝利後額外獲得 70 條小魚乾）', outcome: [{ kind: 'fish', n: 70 }, { kind: 'fight', encounterId: 'orange_bandit', bonusFish: 0 }],
        result: '爪尖才碰到錢袋，大橘貓就睜開眼睛，擋住去路。球球連忙縮手，往後退了一步。球球：「醒得也太快了喵！」' },
      { label: '調勻氣息，悄悄通過（生命上限與當前生命各 +4）', outcome: [{ kind: 'maxHp', n: 4 }], result: '球球輕輕呼吸，踩穩每一步，悄悄走過守衛身旁。牠試著讓呼吸配合步伐，越走越順。球球：「原來這樣走路，不用一直憋著氣喵。」', resultArt: 'sleeping_guard_r1' },
      { label: '藏在牆角的影子裡摸走錢袋（獲得 45 條小魚乾）', requires: { kind: 'deckTag', tag: '隱身', min: 3 }, requiresLabel: '隱身',
        outcome: [{ kind: 'fish', n: 45 }],
        result: '', resultArt: 'sleeping_guard_r2' },
    ] },

  { id: 'medicine_cat', title: '賣藥的三花貓',
    text: '一隻三花貓在牆邊擺攤，一邊放著混裝的忍具，一邊排著祖傳補身藥。「忍具隨手拿，藥水照方熬；想買哪一邊，先看清價錢。」',
    choices: [
      { label: '購買混裝忍具（支付 25 條小魚乾，隨機獲得 2 個忍具）', costFish: 25, outcome: [{ kind: 'potions', n: 2 }], result: '三花貓收下小魚乾，從箱裡拿出兩個忍具。球球接過來，把標記看清楚才收進行囊。球球：「這兩個怎麼用，你說清楚一點喵。」', resultArt: 'medicine_cat_r0' },   // 文案照使用者 2026-09-06（結果句也講「忍具」，不再講「瓶子」）
      { label: '購買祖傳補身藥（支付 60 條小魚乾，生命上限與當前生命各 +12）', costFish: 60, outcome: [{ kind: 'maxHp', n: 12 }], result: '球球喝下補身藥，沒多久身上就暖了，抬爪也比先前有力。牠把空瓶還給三花貓。球球：「真的有用，就是賣得太貴了喵。」', resultArt: 'medicine_cat_r1' },
      { label: '不買（無效果）', outcome: [], result: '球球看完價目牌，搖搖頭。三花貓見牠不買，也收起了量匙。球球：「太貴了，這次先不買喵。」' },
      { label: '讓她拿你的毒試新解藥（最多失去 8 點生命；生命上限與當前生命各 +8）', requires: { kind: 'deckTag', tag: '毒', min: 3 }, requiresLabel: '毒',
        outcome: [{ kind: 'damage', n: 8 }, { kind: 'maxHp', n: 8 }],
        result: '', resultArt: 'medicine_cat_r3' },
    ] },

  { id: 'stuck_kitten', title: '卡住的小貓',
    text: '一隻小貓把頭伸進欄杆後縮不回來，後腳踩著地面，急得尾巴直甩。牠媽媽正扶著牠的肩膀，小聲提醒牠先放鬆；小貓越著急，身子就扭得越厲害。',
    choices: [
      // 先講因（媽媽給謝禮）再講果（回血），跟結果那句話同一個順序；
      // 謝禮的 20 條小魚乾原本只寫在結果裡、選項上看不到（使用者 2026-09-10）
      { label: '上前協助救出小貓（獲得 20 條小魚乾，回復 15 點生命）', outcome: [{ kind: 'heal', n: 15 }, { kind: 'fish', n: 20 }],
        result: '球球扶住小貓，和母貓一起把牠帶出欄杆。母貓拿傷藥替球球處理舊傷，又送上 20 條小魚乾。球球：「下次別往那麼窄的地方鑽了喵。」', resultArt: 'stuck_kitten_r0' },
      { label: '觀察牠縮身脫困的動作（隨機獲得 1 張罕見忍術牌）', outcome: [{ kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }],
        result: '母貓教小貓轉過肩膀，讓牠從欄杆間退了出來。球球看得仔細，也跟著練習轉身，學會了一招忍術。球球：「先轉肩膀，身子就過得去了喵。」', resultArt: 'stuck_kitten_r1' },
    ] },

  { id: 'gambling_rats', title: '賭博的老鼠',
    text: '幾隻老鼠圍著矮桌蹲在角落，桌上倒扣著一個碗。看到球球，牠們連忙招手：「押 50 條，猜中領 130 條，沒中可不退本錢。來一把？」',
    choices: [
      { label: '下注 50 條小魚乾（70% 機率領取 130 條，淨賺 80 條；否則輸掉本錢）', costFish: 50,
        outcome: [{ kind: 'gamble', p: 0.7, win: [{ kind: 'fish', n: 130 }], lose: [] }],
        result: '球球放下本錢，眼睛緊盯著老鼠手裡的碗，連尾巴都不敢動。碗「喀」地一聲掀開——', resultArt: 'gambling_rats_r0' },
      { label: '掀桌挑戰（進入戰鬥，勝利後額外獲得 80 條小魚乾）', outcome: [{ kind: 'fight', encounterId: 'rats3', bonusFish: 80 }],
        result: '球球掀翻矮桌，老鼠們跳開，拿起木棍把牠圍住。球球：「好啊，這次不賭，直接打喵！」' },
      { label: '不賭（無效果）', outcome: [], result: '球球把碗推回桌上，收緊魚乾袋，離開了賭桌。球球：「不賭了，輸了就沒飯吃喵。」' },
    ] },

  { id: 'heavy_door', title: '很重的門',
    text: '厚重的石門卡在門框裡，只留下一道能伸進爪子的細縫。門內不遠處有一籃小魚乾，更深的角落則放著一只刻有魔物紋樣的寶箱。',
    choices: [
      { label: '硬推石門，進去取寶（最多失去 14 點生命，隨機獲得 1 件大魔物秘寶）', outcome: [{ kind: 'damage', n: 14 }, { kind: 'relic', pool: '大魔物' }],
        result: '球球用肩膀頂開石門，肩上被磨掉一片毛。牠忍著痛走進去，從寶箱裡拿出秘寶。球球：「這門也太重了，肩膀好痛喵。」', resultArt: 'heavy_door_r0' },
      { label: '從門縫伸爪取物（獲得 35 條小魚乾）', outcome: [{ kind: 'fish', n: 35 }], result: '球球把爪子伸進門縫，勾住籃子，一點一點拉到面前，取出裡面的 35 條小魚乾。球球：「拿到了，不用推門了喵。」', resultArt: 'heavy_door_r1' },
      { label: '蓄足一口氣，一擊劈斷門閂（最多失去 6 點生命；隨機獲得 1 件大魔物秘寶）', requires: { kind: 'deckTag', tag: '蓄氣', min: 3 }, requiresLabel: '蓄氣',
        outcome: [{ kind: 'damage', n: 6 }, { kind: 'relic', pool: '大魔物' }],
        result: '', resultArt: 'heavy_door_r2' },
    ] },

  { id: 'old_master_ghost', title: '師父的影子',
    text: '樓梯上坐著一個熟悉的背影，轉過頭來卻只有模糊的輪廓。「你的招，還是太急。先把氣息穩住，再想爪子往哪裡去。」那語氣像極了師父。',
    choices: [
      // 使用者 2026-09-11：兩個選項都給得更明確——升級那邊拿掉「至多」（`upgradeCard` 的 filter
      // 會排掉已升級與壞毛病，但一張的情況下講「升級一張牌」比較好懂），捨招那邊從一張改成兩張
      { label: '聽完指點，練習調息（升級一張牌，生命上限與當前生命各 +5）', outcome: [{ kind: 'upgradeCard' }, { kind: 'maxHp', n: 5 }],
        result: '球球照著指點，先把呼吸調整好，再重新練了一次招式。這回出手穩了，胸口也不再那麼緊。球球：「師父以前也這樣教我喵。」', resultArt: 'old_master_ghost_r0' },
      { label: '有所領悟，捨去不合適的兩張牌（移除 2 張牌）', outcome: [{ kind: 'removeCard' }, { kind: 'removeCard' }],
        result: '球球試了試那套動作，找出兩招怎麼練都不順的，決定不再用它們。球球：「這兩招不適合我，換別的練喵。」', resultArt: 'old_master_ghost_r1' },
      { label: '把師父的斗笠戴到影子頭上（從 3 張絕學牌中選擇 1 張、自選升級至多 1 張牌）', requires: { kind: 'relic', ids: ['master_hat'] }, requiresLabel: '師門',
        outcome: [{ kind: 'chooseCard', pool: '絕學', n: 3 }, { kind: 'upgradeCard' }],
        result: '', resultArt: 'old_master_ghost_r2' },
    ] },

  { id: 'catnip_field', title: '一整片貓薄荷',
    text: '門後是一整片茂盛的貓薄荷，葉間浮著薄薄的紫霧。濃香一湧上來，球球就忍不住想往裡滾。看園的老貓指了指身旁的忍具箱：「幫我採一把嫩葉，可以換兩個備用忍具；想打滾可得小心，這裡的葉子沾了塔裡的異氣。」',
    choices: [
      { label: '進去打滾（回復相當於生命上限 50% 的生命，加入 1 張壞毛病牌「走火入魔」）', outcome: [{ kind: 'healPercent', p: 0.5 }, { kind: 'addCard', cardId: 'zouhuo' }],
        result: '球球在貓薄荷裡滾了幾圈，身上的痠痛減輕了，卻也吸進葉間的異氣。起身後，胸口仍然跳得很快。球球：「又沒在跑，心怎麼跳得這麼快喵？」', resultArt: 'catnip_field_r0' },
      { label: '採一把嫩葉交換（隨機獲得 2 個忍具）', outcome: [{ kind: 'potions', n: 2 }],
        result: '球球摘好一把嫩葉，交給看園的老貓，換回兩個忍具。球球：「葉子都在這裡，謝謝你的忍具喵。」', resultArt: 'catnip_field_r1' },
      { label: '避開葉叢，快步通過（無效果）', outcome: [], result: '球球捂著鼻子，避開葉叢，從旁邊的小路穿了過去。球球：「再聞下去，我也想躺下來滾了喵。」' },
    ] },

  { id: 'weapon_rack', title: '兵器架',
    text: '牆邊的兵器架上掛滿舊兵器：鐵鍊錘、鐮刀、長槍，還有一把長刀，大多已經生鏽。架上貼著三幅演招圖，畫的是拿兵器怎麼轉身、怎麼揮。一隻推著空車的老鼠在旁邊繞來繞去：「不練就快點決定，廢鐵我全收，一斤兩條！」球球：「這把刀比我還重喵。」',
    choices: [
      { label: '挑一幅演招圖練習（從 3 張絕學牌中選擇 1 張）', outcome: [{ kind: 'chooseCard', pool: '絕學', n: 3 }], result: '球球雙手握住那把長刀，照著演招圖轉身一揮，整隻被刀帶著轉了半圈。轉身的那一下，牠記住了。球球：「刀太重了，可是這個轉身學得來喵。」', resultArt: 'weapon_rack_r0' },
      { label: '把整批舊兵器交給回收商（獲得 55 條小魚乾）', outcome: [{ kind: 'fish', n: 55 }], result: '老鼠把整架舊兵器搬上推車，秤也沒秤，丟下 55 條小魚乾就要走。球球：「一斤兩條，你根本沒秤喵！」', resultArt: 'weapon_rack_r1' },
    ] },

  { id: 'crying_wall', title: '會哭的牆',
    text: '牆面的水痕像一張哭臉，細細的聲音反覆說著：「別上去……」旁邊的殘字記著，這是昔日護塔者留在石中的一縷意念。牆腳另有一塊鬆動的藏物磚，縫裡露出布包的一角。',
    choices: [
      { label: '耐心安慰，聽完它的叮囑（生命上限與當前生命各 +8）', outcome: [{ kind: 'maxHp', n: 8 }], result: '球球在牆前蹲下，說自己要去找師父。牆裡的聲音不再哭泣，開始教牠護身吐納的方法。練了幾遍，牠的呼吸比先前深了。球球：「我記住了，謝謝你教我喵。」', resultArt: 'crying_wall_r0' },
      { label: '敲開牆腳的藏物磚（隨機獲得 1 件常見秘寶；失去最多 12 點生命）', outcome: [{ kind: 'relic', pool: '常見' }, { kind: 'damage', n: 12 }],
        result: '球球敲開牆腳的磚，拿出裝著秘寶的布包，卻被碎石割傷了爪子。牆裡的聲音還在勸牠別上樓。球球：「我知道上面危險，可是師父還沒回來喵。」', resultArt: 'crying_wall_r1' },
    ] },

  { id: 'fish_pond', title: '養魚的池子',
    text: '池裡游著幾條胖魚，旁邊放著一籃小魚乾。球球剛伸出爪子，水底就閃過一道巨大的黑影。牠連忙縮手。球球：「底下那隻是什麼，好大喵。」',
    choices: [
      { label: '抓一條吃（回復 18 點生命）', outcome: [{ kind: 'heal', n: 18 }], result: '球球抓了一條魚，就著池邊吃完。肚子吃飽了，牠也有力氣繼續走。球球：「好吃，可是那隻大的還在，別抓了喵。」', resultArt: 'fish_pond_r0' },
      { label: '搬走池邊的小魚乾（獲得 65 條小魚乾；失去最多 10 點生命）',
        outcome: [{ kind: 'fish', n: 65 }, { kind: 'damage', n: 10 }],
        result: '球球抱起魚乾籃，一條粗大的尾巴突然從池裡掃出來，把牠打倒在地。牠爬起來，抱著籃子往外跑。球球：「好痛，我這就走喵！」', resultArt: 'fish_pond_r1' },
      { label: '看看就好（無效果）', outcome: [], result: '球球蹲在池邊看魚，等牠們游過去，就站起來離開。球球：「今天先放過你們喵。」' },
    ] },

  { id: 'training_hall', title: '空的練功房',
    text: '練功房裡沒有貓，地板上留著交錯的足跡。牆邊站著木樁人，後面的櫃門開了一道縫。球球：「這裡好像有人練過功喵。」',
    choices: [
      { label: '沿著足跡練步法（自選升級至多 2 張牌）', outcome: [{ kind: 'upgradeCard' }, { kind: 'upgradeCard' }],
        result: '球球循著足跡練習進退，試著在轉身後接上熟悉的招式。練過幾次，動作總算順了。球球：「從這邊轉過去，就不會卡住了喵。」', resultArt: 'training_hall_r0' },
      { label: '打開櫃子（進入戰鬥；勝利後隨機獲得 1 件大魔物秘寶，另得 30 條小魚乾）',
        outcome: [{ kind: 'relic', pool: '大魔物' }, { kind: 'fight', encounterId: 'wood_dummy', bonusFish: 30 }],
        result: '球球打開櫃門，看見裡面有件秘寶，還沒伸手，木樁人就擋在前面。球球：「原來你在守這個喵。」' },
    ] },

  { id: 'moon_window', title: '看得到月亮的窗',
    text: '月光照進圓窗，落在窗台的空碗裡。碗底刻著一隻蜷睡的小貓，旁邊還能坐下一隻貓。球球：「有人在這裡餵貓喵？」',
    choices: [
      { label: '放下 20 條小魚乾（生命上限與當前生命各 +10）', costFish: 20, outcome: [{ kind: 'maxHp', n: 10 }],
        result: '球球把小魚乾放進碗裡。一隻發著微光的小貓從碗底浮出來，輕輕蹭過牠的胸口。胸口暖了，呼吸也更順了。球球：「碗是你的喵？那這些給你吃喵。」', resultArt: 'moon_window_r0' },
      { label: '坐著看月亮（回復 14 點生命）', outcome: [{ kind: 'heal', n: 14 }], result: '球球坐在窗邊看月亮，歇了一會兒，肩膀和爪子都沒那麼痠了。球球：「家裡這時候，應該也看得見月亮喵。」', resultArt: 'moon_window_r1' },
    ] },

  { id: 'greedy_merchant', title: '很貪心的商人',
    text: '戴眼鏡的灰貓攤開紅布，秘寶、忍具擺得滿滿的。「八十條小魚乾，一件秘寶配一個忍具。你多看一眼，我就想漲價。」牠的手一直按著布角，指縫裡露出一行小字：會留下內力不足的毛病。「沒錢也行，讓我在你身上試一次灌功，秘寶白送——試好了，我就能賣別人一百條一次。」球球：「原來我是拿來試的喵。」',
    choices: [
      { label: '買下組合（支付 80 條小魚乾；隨機獲得 1 件大魔物秘寶、隨機獲得 1 個忍具）', costFish: 80,
        outcome: [{ kind: 'relic', pool: '大魔物' }, { kind: 'potions', n: 1 }],
        result: '灰貓收下小魚乾，又數了一遍，才把秘寶和忍具推過來。球球正要走，牠又從袖子裡摸出一樣：「這個再加二十條就好——」球球：「不要，錢都給你了喵。」', resultArt: 'greedy_merchant_r0' },
      { label: '接受灌功試驗（牌組加入 1 張壞毛病「內力不足」；隨機獲得 1 件大魔物秘寶）',
        outcome: [{ kind: 'addCard', cardId: 'neili' }, { kind: 'relic', pool: '大魔物' }],
        result: '灰貓一手托著約好的秘寶，一手往球球背上灌功。熱流一進來，球球胸口就悶得接不上氣，灰貓卻拿出小本子，一邊看牠一邊記。球球：「你還在記筆記喵？下次收錢要分我喵！」', resultArt: 'greedy_merchant_r1' },
      { label: '不做生意（無效果）', outcome: [], result: '球球看完布角下的小字，搖頭走開。灰貓在後面喊：「七十五！七十！……不然六十八！」球球：「會留下毛病的東西，再便宜也不要喵。」' },
      { label: '整包買下（支付 150 條小魚乾；隨機獲得 1 件大魔物秘寶、1 件常見秘寶與 2 個忍具）', costFish: 150, requires: { kind: 'fishAtLeast', n: 150 }, requiresLabel: '小魚乾 150',
        outcome: [{ kind: 'relic', pool: '大魔物' }, { kind: 'relic', pool: '常見' }, { kind: 'potions', n: 2 }],
        result: '', resultArt: 'greedy_merchant_r3' },
    ] },
  // ===== 事件前後集（2026-09-04，使用者：「第一關遇到的角色第二關再出現，看上次的選擇」）=====
  // 後集只在第二、三關的地圖排進來，而且要有前集留下的旗標；前集在哪一關遇到都行。
  { id: 'toll_again_paid', title: '山賊再現', acts: [2, 3], requiresFlag: 'toll_paid',
    text: '轉角又是那隻橘貓山賊。牠看見球球，趕緊把木棒放到一旁。「上次那三十條，我拿去替我娘買藥了。她現在好多了，曬了些小魚乾，叫我一定要把謝禮帶來。」牠捧出一個包裹，這次沒有擋路。',
    choices: [
      { label: '收下回禮（獲得 60 條小魚乾，隨機獲得 1 個忍具）', outcome: [{ kind: 'fish', n: 60 }, { kind: 'potions', n: 1 }], result: '山賊把小魚乾和忍具包好，交到球球手裡。球球打開聞了聞。球球：「你娘曬的魚真香，替我謝謝她喵。」', resultArt: 'toll_again_paid_r0' },
      { label: '請牠把回禮留給母親（生命上限與當前生命各 +5）', outcome: [{ kind: 'maxHp', n: 5 }], result: '山賊把回禮收好，改把自己母親傳下的調息法教給球球。球球跟著練了幾遍，呼吸更穩，也不容易喘了。球球：「這招很有用，我學會了喵。」', resultArt: 'toll_again_paid_r1' },
    ] },
  { id: 'toll_again_fought', title: '山賊帶朋友來了', acts: [2, 3], requiresFlag: 'toll_fought',
    text: '那隻橘貓山賊又站在轉角，這回帶了一群拿木棒的幫手。「上次是我大意！今天我們人多！」牠往前一步，身後的幫手卻一起往後縮。',
    choices: [
      { label: '再打一場（勝利後額外獲得 70 條小魚乾）', outcome: [{ kind: 'fight', encounterId: 'orange_bandit_pair', bonusFish: 70 }], result: '山賊們舉起木棒，一起往前逼近。球球擺好架勢，盯住最前面那隻。球球：「上次還沒打夠，這次又來喵？」' },
      { label: '支付 45 條小魚乾息事寧人', costFish: 45, outcome: [], result: '球球交出小魚乾。山賊們蹲到路邊分錢，吵著誰該多拿一條。牠趁機走了過去。球球：「你們分吧，別再攔我喵。」', resultArt: 'toll_again_fought_r1' },
    ] },
  { id: 'rescue_return_herb', title: '村貓的回禮', acts: [2, 3], requiresFlag: 'rescue_took_herb',
    text: '腳傷已好的村貓從樓梯間探出頭。「是你！上次你拿了藥，把小魚乾留給我，我靠那包撐過了三天。」牠捧出一個布包，又指了指腰間的磨刀工具。「我準備了謝禮。你要練招的話，我也能幫忙看看出手。」',
    choices: [
      { label: '收下回禮（隨機獲得 1 件常見秘寶）', outcome: [{ kind: 'relic', pool: '常見' }], result: '村貓把布一掀，取出裡面的秘寶交給球球，連那塊布也一起塞了過來。球球：「謝謝，我會好好保管喵。」', resultArt: 'rescue_return_herb_r0' },
      { label: '請牠幫忙練招（自選升級至多 1 張牌）', outcome: [{ kind: 'upgradeCard' }], result: '村貓看了球球的動作，指出牠抬爪的角度不對，接招時也多停了一下。「磨刀要看角度，出手也一樣。」球球照著調整，再練了一次。球球：「順多了，再幫我看看喵。」', resultArt: 'rescue_return_herb_r1' },
    ] },
  { id: 'rescue_return_fish', title: '欠村貓的那一份', acts: [2, 3], requiresFlag: 'rescue_took_fish',
    text: '球球在牆邊認出上次救過的村貓。牠的傷已經好了，肚子卻餓得咕嚕叫。「後來存糧又被搶了，找了半天，只剩這罐藥。」牠看見球球，仍努力擠出一個笑。',
    choices: [
      { label: '分給牠 40 條小魚乾（回復 25 點生命，自選移除 1 張牌）', costFish: 40, outcome: [{ kind: 'heal', n: 25 }, { kind: 'removeCard' }], result: '球球把小魚乾放到村貓面前。球球：「上次收了你的口糧，這次換我請你吃喵。」村貓收下後，拿出傷藥替牠包紮。球球趁著休息，回想有哪些招式用不順，準備捨去其中一招。', resultArt: 'rescue_return_fish_r0' },
      { label: '低頭趕路（牌組加入 1 張壞毛病「眼冒金星」）', outcome: [{ kind: 'addCard', cardId: 'dazed_card' }], result: '球球低頭走開，腦中卻一直浮現村貓的樣子。牠越想越恍神，連腳下的階梯都晃了起來。球球：「牠還餓著，我卻就這樣走了喵……」', resultArt: 'rescue_return_fish_r1' },
    ] },
  { id: 'robin_feast', title: '村貓的謝宴', acts: [2, 3], requiresFlag: 'robin_shared',
    text: '樓梯間飄來魚湯的香味。曾經挨餓的村貓們圍著一鍋熱湯，一見球球就挪出位子。「上次把一半小魚乾分給我們的那位！快坐，今天換我們請你！」旁邊還放了一袋備好的乾糧和一個小包。',
    choices: [
      { label: '坐下吃頓飽的（生命回復至上限）', outcome: [{ kind: 'healPercent', p: 1 }], result: '村貓們端來熱湯和飯菜，球球一碗接一碗地吃，身上的疲倦也減輕了。等肚子吃飽，牠才放下碗。球球：「真好吃，謝謝你們請我喵。」', resultArt: 'robin_feast_r0' },
      { label: '收下路上的補給（獲得 50 條小魚乾，隨機獲得 1 個忍具）', outcome: [{ kind: 'fish', n: 50 }, { kind: 'potions', n: 1 }], result: '村貓們送來小魚乾和一個忍具，仔細分開包好，交給球球帶在路上。球球：「夠吃一陣子了，謝謝你們喵。」', resultArt: 'robin_feast_r1' },
    ] },

  /*
   * 2026-09-11 第三批（使用者指定）。這三個補的是原本 35 個事件裡完全沒有的三種形狀：
   * 拿走你已有的東西去換、當場動牌組的大手術、有代價的速成。
   * 三個都給得起也拒絕得起——每一個都留一條「不換／不練」的路，玩家不會被逼著吞。
   */
  { id: 'moving_rat', title: '換家的老鼠', acts: [2, 3],
    text: '老鼠背著鼓鼓的包袱，在階梯上邊數家當邊嘆氣。「搬家帶不動這麼多。你給我一件秘寶，我拿兩件跟你換，都不挑款式。」牠指著球球的行囊補了一句：「你原本隨身帶的那件不算，其他的閉眼抽。」',
    choices: [
      // 交一件換兩件：期望值是賺的，但**交出去的那件是隨機的**——你可能失去這一局的核心。
      // 那個不確定性才是這個事件的重點，所以不讓玩家挑要交哪一件
      { label: '交換秘寶（隨機交出 1 件非起始秘寶；隨機獲得 2 件常見秘寶）',
        outcome: [{ kind: 'loseRelic' }, { kind: 'relic', pool: '常見' }, { kind: 'relic', pool: '常見' }],
        result: '老鼠閉著眼睛往行囊裡一摸，拿走一件，再依約交出兩件。球球伸手想攔，已經來不及了——被換走的那件，也跟著牠走了一路。球球：「說好不挑的……那件你要好好用喵。」', resultArt: 'moving_rat_r0' },
      { label: '不交換（無效果）', outcome: [], result: '球球搖搖頭，老鼠便把包袱綁回去。球球也整理好行囊，準備繼續走。球球：「我帶的都還用得上，不換了喵。」' },
    ] },

  { id: 'grindstone', title: '磨利我的刀', acts: [2, 3],
    text: '樓梯邊有一塊磨刀石，石碑上刻著「磨利我的刀」，旁邊擱著一把磨到只剩一半寬的舊刀。石碑下方刻著三個小人：一個在出招，一個被打了叉，最後一個坐在地上喘氣。球球：「我又沒有刀……原來要磨的是招式喵？」',
    choices: [
      // 一次砍三張是這個遊戲裡最大的一刀「瘦牌組」。代價放在最大生命而不是當下的血：
      // 扣血可以睡一覺補回來，扣上限才是真的付出去了
      { label: '依照捨招法修行（自選移除 3 張牌；本次登塔生命上限 −8）',
        outcome: [{ kind: 'removeCard' }, { kind: 'removeCard' }, { kind: 'removeCard' }, { kind: 'maxHp', n: -8 }],
        result: '球球照著石碑上的次序，把幾招用不順的一招一招放下，像磨刀一樣越磨越薄。磨到最後，牠跟第三個小人一樣坐倒在地，胸口悶得直喘。球球：「刀是磨利了，人也磨掉一層了喵。」', resultArt: 'grindstone_r0' },
      { label: '不修行（無效果）', outcome: [], result: '球球看了看那個坐倒的小人，把爪子收了回來。球球：「還沒想好要放下哪幾招，先不磨了喵。」' },
    ] },

  { id: 'shortcut_scroll', title: '速成的卷軸', acts: [1, 2, 3],
    text: '牆上掛著一卷卷軸，墨跡還沒乾。大字寫著：「一練就會！」下面卻註明：「後果自負。」球球：「練了會怎樣，怎麼不寫清楚喵？」',
    choices: [
      // 升級兩張是很大的加強，代價是一張壞毛病——「速成」的意思就是欠著，之後每一場都要還
      { label: '照著練（自選升級至多 2 張牌；牌組加入 1 張隨機壞毛病牌）',
        outcome: [{ kind: 'upgradeCard' }, { kind: 'upgradeCard' }, { kind: 'addRandomCard', pool: '壞毛病' }],
        result: '球球照卷軸上的訣竅，試著改進自己熟悉的招式。前幾下還算順利，收勢時卻發現不對勁。球球：「怎麼會這樣，是哪裡練錯了喵？」', resultArt: 'shortcut_scroll_r0' },
      { label: '不練（無效果）', outcome: [], result: '球球鬆開紙角，爪子沾了一點墨。牠甩甩爪子，轉身離開。球球：「來路不明的功夫，還是別亂練喵。」' },
    ] },
  // 內容擴充第二批（2026-09-23）：兩條事件鏈、關卡限定九篇、連線限定三篇，見 `events-batch2.ts`
  ...batch2Events,
  // 內容擴充第三批（2026-09-23）：稀有事件 5 篇（不進一般的洗牌佇列，見 `events-rare.ts`）
  ...rareEvents,
];

export const eventById: Record<string, EventDef> = Object.fromEntries(events.map((e) => [e.id, e]));
