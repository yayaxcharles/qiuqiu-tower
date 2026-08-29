import type { PotionDef } from '../engine/types';

export const potions: PotionDef[] = [
  { id: 'smoke_bomb', name: '煙霧彈', text: '獲得 2 隱身。', art: 'codex/potion_smoke_bomb', target: 'self', effects: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }] },
  { id: 'shuriken', name: '手裡劍', text: '對目標造成 8 傷。', art: 'codex/potion_shuriken', target: 'enemy', effects: [{ kind: 'damage', amount: 8 }] },
  { id: 'onigiri', name: '飯糰', text: '本回合多 1 顆飯糰。', art: 'codex/potion_onigiri', target: 'self', effects: [{ kind: 'energy', n: 1 }] },
  { id: 'catgrass_tea', name: '貓草茶', text: '回復 10 生命。', art: 'codex/potion_catgrass_tea', target: 'self', effects: [{ kind: 'heal', n: 10 }] },
  { id: 'firecracker', name: '鞭炮', text: '對全體魔物造成 6 傷。', art: 'codex/potion_firecracker', target: 'all', effects: [{ kind: 'damage', amount: 6, target: 'all' }] },
  { id: 'rope', name: '麻繩', text: '給目標定身。', art: 'codex/potion_rope', target: 'enemy', effects: [{ kind: 'status', name: '定身', amount: 1, target: 'enemy' }] },
  { id: 'tuna', name: '鮪魚', text: '抽 3 張。', art: 'codex/potion_tuna', target: 'self', effects: [{ kind: 'draw', n: 3 }] },
  { id: 'whetstone', name: '磨爪石', text: '本場獲得 1 爪力。', art: 'codex/potion_whetstone', target: 'self', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] },
];

export const potionById: Record<string, PotionDef> = Object.fromEntries(potions.map((p) => [p.id, p]));
