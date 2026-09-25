import type { EventDef } from '../engine/types';

/*
 * ===== 內容擴充第三批的稀有事件 5 篇（2026-09-23，設計稿 design3 第五節）=====
 *
 * 很久才遇一次的一幕：每一關地圖有 25% 機率把其中一格事件換成一篇（`engine/run.ts` 的 `placeRareEvent`，主控裁決 4），
 * **不進一般的洗牌佇列**（`map.ts` 的 `eligible` 排掉 `rare`），走進去時不換成後集。事件標題旁掛金色小牌「難得一見」（事件畫面）。
 * 文字照設計稿照抄：四隻的開頭與結果都放在 `event-text-b3rare.ts`（延後載入）。球球那份原本寫在這裡（引擎與畫面的鍵），
 * 2026-09-24 b3int 主控裁決跟另外三隻一樣延後載入（首載程式實測 656.7 → 651.2 KB），載入時填回這裡的 `text`／`result`；標題與選項標籤留在這裡。
 * 選項順序跟插圖的結果序號綁在一起（`_r0`／`_r1`／`_r2`，美術 art5 的 `batch3_art_keys.md`），不要調換；進戰鬥與無效果的選項不配圖。
 *
 * 「大俠貓打過滾的貓薄荷田」用**替代版：大俠貓本人不出場**（主控裁決 2；2026-09-24 從「掉進貓薄荷田的大俠貓」改名）：只留貓薄荷田、壓扁的貓形窩、一撮毛、酒葫蘆和一張摺起來的舊紙，
 * ①撿他掉的一頁筆記選絕學、③在他壓出來的窩裡睡一覺回滿血；圖面照 art5 對照表第四段，文字照圖對齊（掉血的原因寫成練招摔了、葫蘆上殘留的紫氣，圖上都不用畫出來）。
 */
export const rareEvents: EventDef[] = [
  { id: 'rare_hot_spring', title: '冒著熱氣的溫泉', acts: [1, 2, 3], rare: { weight: 3, miasmaWeight: 6 },
    text: '',   // 球球的開頭延後載入（`event-text-b3rare.ts` 的 `NINJA_EVENT_TEXT_B3RARE`），載入時填回
    choices: [
      { label: '整隻跳進去泡（生命回復至上限；淨化身上所有沾了魔氣的秘寶；失去身上所有忍具）',
        outcome: [{ kind: 'healPercent', p: 1 }, { kind: 'purify', n: 'all' }, { kind: 'loseAllPotions' }],
        result: '', resultArt: 'rare_hot_spring_r0' },
      { label: '先把行囊放好，再慢慢泡（回復相當於生命上限 40% 的生命；淨化身上 1 件沾了魔氣的秘寶）',
        outcome: [{ kind: 'healPercent', p: 0.4 }, { kind: 'purify', n: 1 }],
        result: '', resultArt: 'rare_hot_spring_r1' },
      { label: '只泡腳，順便想想招式（回復 15 點生命；自選升級至多 1 張牌）',
        outcome: [{ kind: 'heal', n: 15 }, { kind: 'upgradeCard' }],
        result: '', resultArt: 'rare_hot_spring_r2' },
    ] },
  /*
   * 籤筒：抽到哪一籤由提示那一行（`lottery` 的 `tier`）與「抽到之後的那一句」（`event-text-b3rare.ts` 的 `LOTTERY_AFTER`）講，
   * 結果文字只寫搖籤的動作。「嘴饞」`zuiyang` 是現成的壞毛病，糖跟它對得上。
   */
  { id: 'rare_fortune_sticks', title: '塔裡的籤筒', acts: [1, 2, 3], rare: { weight: 3 },
    text: '',   // 球球的開頭延後載入（`event-text-b3rare.ts` 的 `NINJA_EVENT_TEXT_B3RARE`），載入時填回
    choices: [
      { label: '投 25 條小魚乾，求一支籤（上上籤 10%：隨機 1 件塔主秘寶；上籤 25%：隨機 1 件大魔物秘寶；中籤 35%：回復 15 點生命、隨機 1 個忍具；下籤 20%：最多失去 8 點生命；下下籤 10%：牌組加入 1 張壞毛病「嘴饞」）', costFish: 25,
        outcome: [{ kind: 'lottery', table: [
          { w: 10, tier: '抽到：上上籤！', effects: [{ kind: 'relic', pool: '塔主' }] },
          { w: 25, tier: '抽到：上籤！', effects: [{ kind: 'relic', pool: '大魔物' }] },
          { w: 35, tier: '抽到：中籤', effects: [{ kind: 'heal', n: 15 }, { kind: 'potions', n: 1 }] },
          { w: 20, tier: '抽到：下籤', effects: [{ kind: 'damage', n: 8 }] },
          { w: 10, tier: '抽到：下下籤', effects: [{ kind: 'addCard', cardId: 'zuiyang' }] },
        ] }],
        result: '', resultArt: 'rare_fortune_sticks_r0' },
      { label: '投 60 條小魚乾，誠心求籤（上上籤 15%、上籤 40%、中籤 45%，獎勵同左；不會抽到下籤）', costFish: 60,
        outcome: [{ kind: 'lottery', table: [
          { w: 15, tier: '抽到：上上籤！', effects: [{ kind: 'relic', pool: '塔主' }] },
          { w: 40, tier: '抽到：上籤！', effects: [{ kind: 'relic', pool: '大魔物' }] },
          { w: 45, tier: '抽到：中籤', effects: [{ kind: 'heal', n: 15 }, { kind: 'potions', n: 1 }] },
        ] }],
        result: '', resultArt: 'rare_fortune_sticks_r1' },
      { label: '把籤筒擺正就走（無效果）', outcome: [],
        result: '' },
    ] },
  /*
   * 睡著的大魔物：打的是事件格，`finishCombat` 照「戰鬥」發一般戰利品，大魔物那一份秘寶不另給——這篇答應的獎勵就是全部。
   * 實際打哪一組是這一關的大魔物池隨機（`fight` 的 `pool`，分支亂數，兩個座位同一組），所以圖裡的魔物是一團看不清的黑影。
   * ②醒沒醒是同一件事（`shared`）：連線時兩個人要嘛一起沒事、要嘛一起開打。
   */
  { id: 'rare_sleeping_hoard', title: '睡著的大魔物', acts: [1, 2, 3], rare: { weight: 3 },
    text: '',   // 球球的開頭延後載入（`event-text-b3rare.ts` 的 `NINJA_EVENT_TEXT_B3RARE`），載入時填回
    choices: [
      { label: '輕輕拿走最上面那一件（隨機獲得 1 件大魔物秘寶）',
        outcome: [{ kind: 'relic', pool: '大魔物' }],
        result: '', resultArt: 'rare_sleeping_hoard_r0' },
      { label: '再多拿一件，賭牠不會醒（60%機率：隨機獲得 2 件大魔物秘寶；40%機率：牠醒了——進入戰鬥（這一關的大魔物），勝利後獲得 2 件大魔物秘寶）',
        outcome: [{ kind: 'lottery', shared: true, table: [
          { w: 60, tier: '牠翻個身，繼續睡', effects: [{ kind: 'relic', pool: '大魔物' }, { kind: 'relic', pool: '大魔物' }] },
          { w: 40, tier: '牠醒了！', effects: [{ kind: 'fight', encounterId: '', pool: '大魔物', bonusFish: 0 }, { kind: 'relic', pool: '大魔物' }, { kind: 'relic', pool: '大魔物' }] },
        ] }],
        result: '', resultArt: 'rare_sleeping_hoard_r1' },
      { label: '叫醒牠，堂堂正正打一場（進入戰鬥（這一關的大魔物），勝利後獲得 1 件塔主秘寶、1 件大魔物秘寶與 50 條小魚乾）',
        outcome: [{ kind: 'fight', encounterId: '', pool: '大魔物', bonusFish: 50 }, { kind: 'relic', pool: '塔主' }, { kind: 'relic', pool: '大魔物' }],
        result: '', resultArt: 'rare_sleeping_hoard_r2' },
    ] },
  /* 紫霧裡的聲音：只寫「學他的聲音」，不寫魔氣跟師父之間的設定（設計稿自評）。身上已經有 2 件以上沾了魔氣的就不放 */
  { id: 'rare_miasma_whisper', title: '紫霧裡的聲音', acts: [2], rare: { weight: 2, maxMiasma: 2 },
    text: '',   // 球球的開頭延後載入（`event-text-b3rare.ts` 的 `NINJA_EVENT_TEXT_B3RARE`），載入時填回
    choices: [
      { label: '伸手拿霧裡的東西（隨機獲得 1 件沾了魔氣的秘寶；生命上限與當前生命各 +8）',
        outcome: [{ kind: 'relicMiasma', fallbackFish: 60 }, { kind: 'maxHp', n: 8 }],
        result: '', resultArt: 'rare_miasma_whisper_r0' },
      { label: '對著紫霧大喊（淨化身上 1 件沾了魔氣的秘寶；身上沒有的話，改成自選移除 1 張牌）',
        outcome: [{ kind: 'purify', n: 1, orRemove: true }],
        result: '', resultArt: 'rare_miasma_whisper_r1' },
      { label: '摀住耳朵跑過去（無效果）', outcome: [],
        result: '' },
    ] },
  /*
   * 大俠貓打過滾的貓薄荷田（替代版，主控裁決 2；原名「掉進貓薄荷田的大俠貓」，2026-09-24 主控裁定改名：替代版裡大俠貓不在場）：只有塔頂這一關遇得到。「塔主的酒葫蘆」是師門套組的一件（design2 第八節），
   * 已經有了就改給隨機一件塔主秘寶（`relicId` 的 `fallbackPool`）。
   */
  { id: 'rare_catnip_master', title: '大俠貓打過滾的貓薄荷田', acts: [3], rare: { weight: 2 },
    text: '',   // 球球的開頭延後載入（`event-text-b3rare.ts` 的 `NINJA_EVENT_TEXT_B3RARE`），載入時填回
    choices: [
      { label: '撿起他掉的一頁筆記，照著練（從 3 張絕學牌中選擇 1 張、自選升級至多 1 張牌；最多失去 12 點生命）',
        // 旗標只給結局挑伏筆旁白（撿了那一頁、照著練過那一招，2026-09-25），不動任何數值
        outcome: [{ kind: 'flag', name: 'catnip_page' }, { kind: 'chooseCard', pool: '絕學', n: 3 }, { kind: 'upgradeCard' }, { kind: 'damage', n: 12 }],
        result: '', resultArt: 'rare_catnip_master_r0' },
      { label: '撿起他滾落的酒葫蘆（獲得「塔主的酒葫蘆」，已經有了就改成隨機 1 件塔主秘寶；最多失去 8 點生命）',
        outcome: [{ kind: 'relicId', id: 'master_gourd', fallbackFish: 60, fallbackPool: '塔主' }, { kind: 'damage', n: 8 }],
        result: '', resultArt: 'rare_catnip_master_r1' },
      { label: '在他壓出來的窩裡睡一覺（生命回復至上限；生命上限與當前生命各 +6）',
        outcome: [{ kind: 'healPercent', p: 1 }, { kind: 'maxHp', n: 6 }],
        result: '', resultArt: 'rare_catnip_master_r2' },
    ] },
];
