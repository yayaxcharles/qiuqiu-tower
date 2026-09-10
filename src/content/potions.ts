import type { PotionDef } from '../engine/types';

export const potions: PotionDef[] = [
  { id: 'smoke_bomb', name: '煙霧彈', text: '獲得 2 層隱身。', art: 'codex/potion_smoke_bomb', price: 45, target: 'self', effects: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }] },
  { id: 'shuriken', name: '手裡劍', text: '對目標造成 8 點傷害。', art: 'codex/potion_shuriken', price: 30, target: 'enemy', effects: [{ kind: 'damage', amount: 8 }] },
  { id: 'onigiri', name: '飯糰', text: '本回合多 1 顆飯糰。', art: 'codex/potion_onigiri', price: 30, target: 'self', effects: [{ kind: 'energy', n: 1 }] },
  { id: 'catgrass_tea', name: '貓草茶', text: '回復 10 點生命。', art: 'codex/potion_catgrass_tea', price: 40, target: 'self', effects: [{ kind: 'heal', n: 10 }] },
  { id: 'firecracker', name: '鞭炮', text: '對全體魔物造成 6 點傷害。', art: 'codex/potion_firecracker', price: 40, target: 'all', effects: [{ kind: 'damage', amount: 6, target: 'all' }] },
  { id: 'rope', name: '麻繩', text: '給目標定身。', art: 'codex/potion_rope', price: 40, target: 'enemy', effects: [{ kind: 'status', name: '定身', amount: 1, target: 'enemy' }] },
  { id: 'tuna', name: '鮪魚', text: '抽 3 張牌。', art: 'codex/potion_tuna', price: 50, target: 'self', effects: [{ kind: 'draw', n: 3 }] },
  { id: 'whetstone', name: '磨爪石', text: '這場戰鬥獲得 1 點爪力。', art: 'codex/potion_whetstone', price: 30, target: 'self', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] },
// ===== 2026-08-31 補 12 個。本來只有 8 個，一局就用掉五到十個，等於每局都在用同一批 =====
  // 補的方向：把「臨場救命」的路數補齊——原本 8 個裡沒有解毒、沒有清減益、
  // 沒有大量蜷縮、沒有多段輸出，遇到對應的困境只能硬吃。
  { id: 'milk', name: '溫牛奶', text: '清掉自己身上所有的減益。', art: 'codex/potion_milk', price: 45, target: 'self', effects: [{ kind: 'cleanse' }] },
  { id: 'quilt', name: '小被子', text: '獲得 15 點蜷縮。', art: 'codex/potion_quilt', price: 45, target: 'self', effects: [{ kind: 'block', amount: 15 }] },
  { id: 'claw_oil', name: '磨爪油', text: '這場戰鬥獲得 3 點爪力。', art: 'codex/potion_claw_oil', price: 50, target: 'self', effects: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }] },
  { id: 'cat_step', name: '貓步粉', text: '這場戰鬥獲得 3 點貓步。', art: 'codex/potion_cat_step', price: 50, target: 'self', effects: [{ kind: 'status', name: '貓步', amount: 3, target: 'self' }] },
  { id: 'needle_rain', name: '針雨', text: '對目標造成 4 點傷害，打 3 次。', art: 'codex/potion_needle_rain', price: 45, target: 'enemy', effects: [{ kind: 'damage', amount: 4, times: 3 }] },
  { id: 'pepper', name: '胡椒罐', text: '給全體魔物 3 層噎到。', art: 'codex/potion_pepper', price: 40, target: 'all', effects: [{ kind: 'status', name: '噎到', amount: 3, target: 'all' }] },
  { id: 'mirror_shard', name: '鏡片', text: '獲得 5 點反彈。', art: 'codex/potion_mirror_shard', price: 40, target: 'self', effects: [{ kind: 'status', name: '反彈', amount: 5, target: 'self' }] },
  { id: 'nip_ball', name: '貓薄荷球', text: '給全體魔物 2 層懶洋洋與 2 層翻肚。', art: 'codex/potion_nip_ball', price: 50, target: 'all', effects: [{ kind: 'status', name: '懶洋洋', amount: 2, target: 'all' }, { kind: 'status', name: '翻肚', amount: 2, target: 'all' }] },
  { id: 'dried_fish_bundle', name: '小魚乾串', text: '本回合多 2 顆飯糰。', art: 'codex/potion_dried_fish_bundle', price: 55, target: 'self', effects: [{ kind: 'energy', n: 2 }] },
  { id: 'secret_scroll', name: '殘破卷軸', text: '抽 2 張牌，並多 2 顆飯糰。', art: 'codex/potion_secret_scroll', price: 55, target: 'self', effects: [{ kind: 'draw', n: 2 }, { kind: 'energy', n: 2 }] },
  { id: 'iron_paw', name: '鐵爪套', text: '對目標造成 16 點傷害。', art: 'codex/potion_iron_paw', price: 60, target: 'enemy', effects: [{ kind: 'damage', amount: 16 }] },
  { id: 'nine_lives', name: '九命符', text: '回復 20 點生命。', art: 'codex/potion_nine_lives', price: 60, target: 'self', effects: [{ kind: 'heal', n: 20 }] },

  /*
   * 2026-09-11 第二批（使用者指定）。
   *
   * 為什麼要加這一批：原本 20 支裡有 15 支是**純數值**（打幾點、回幾血、加幾點爪力、抽幾張、給幾顆飯糰），
   * 「該不該現在用忍具」不太需要想——反正回血就喝。這一批全是**改變當回合玩法**的，
   * 用掉的時機才是決定本身。價格照「換得掉多少一回合」訂，不照數字大小。
   */
  { id: 'clone_oil', name: '分身油', text: '這回合下一張攻擊牌的傷害加倍。', art: 'codex/potion_clone_oil', price: 65, target: 'self',
    effects: [{ kind: 'doubleNextAttack' }] },
  { id: 'iron_salve', name: '鐵布衫膏', text: '本回合不受任何傷害。', art: 'codex/potion_iron_salve', price: 75, target: 'self',
    effects: [{ kind: 'immuneThisTurn' }] },
  // 只在快死的時候用得出來：平常是一格廢物，關鍵時刻是一條命。所以價格壓在中段
  { id: 'revive_pill', name: '起死回生丹', text: '只在生命低於三成時用得出來：回復一半的最大生命。', art: 'codex/potion_revive_pill', price: 60, target: 'self',
    usable: { check: (hp, maxHp) => hp * 10 < maxHp * 3, reason: '生命高於三成，還用不上' },
    effects: [{ kind: 'heal', n: 0, percent: 50 }] },
  { id: 'first_incense', name: '先手香', text: '魔物這回合不出手。', art: 'codex/potion_first_incense', price: 80, target: 'self',
    effects: [{ kind: 'skipEnemyTurn' }] },
  { id: 'pick_back', name: '撿回來', text: '從棄牌堆挑一張拿回手上。', art: 'codex/potion_pick_back', price: 50, target: 'self',
    effects: [{ kind: 'recoverFromDiscard' }] },
  { id: 'claw_bolt', name: '貓爪雷', text: '對隨機魔物造成 10 點傷害，打 3 次。', art: 'codex/potion_claw_bolt', price: 65, target: 'self',
    effects: [{ kind: 'damageScatter', amount: 10, times: 3 }] },
  { id: 'bind_nail', name: '定身釘', text: '給全體魔物 1 層定身（每隻各有七成會中）。', art: 'codex/potion_bind_nail', price: 70, target: 'all',
    effects: [{ kind: 'status', name: '定身', amount: 1, target: 'all' }] },
];

export const potionById: Record<string, PotionDef> = Object.fromEntries(potions.map((p) => [p.id, p]));
