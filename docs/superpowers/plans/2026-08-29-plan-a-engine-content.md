# 《球球勇闖魔物塔》實作計畫 A：規則引擎與內容資料

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出不碰畫面、可在 Node 裡完整測試的遊戲核心：種子亂數、戰鬥回合機、牌效果直譯器、地圖生成、整局狀態、獎勵、存檔、以及全部內容資料（58 張牌、15 秘寶、8 忍具、魔物、事件、對白），最後用機器人跑 200 局證明不會當、不會卡。

**Architecture:** `src/engine/` 是純函式與純資料結構（不 import DOM），所有隨機都經 `Rng`；`src/content/` 只有資料常數，引擎照表執行；需要玩家選牌的效果用「待選（pending）」狀態暫停，由呼叫端（畫面或機器人）回填後繼續。計畫 B 再把畫面接上去。

**Tech Stack:** TypeScript（strict）、Vite、Vitest、Node 24（已裝）。不用框架、不用遊戲引擎。

**Spec:** `docs/superpowers/specs/2026-08-29-qiuqiu-tower-design.md`（本計畫的每個數值都從那裡來；有衝突以規格為準並回報）。

## Global Constraints

- 規格 §1：電腦瀏覽器、1280×720 橫向；總大小 ≤4 MB（計畫 B 檢查）。
- 規格 §1：球球自己講的話句尾一律加「喵」；牌面規則文字、名詞提示、系統訊息不加。
- 規格 §2：畫面與程式一律用遊戲內名詞（飽足／飯糰、蜷縮、隱身、連抓、爪力、貓步、翻肚、懶洋洋、炸毛、噎到、反彈、定身、壞毛病、小魚乾、秘寶、忍具、罐頭鋪、貓窩、紙箱、大魔物、塔主、消耗、保留）。
- 規格 §3：所有亂數來自種子；同種子＝同一局。
- 規格 §8.2：`engine/` 純規則不碰 DOM；`content/` 純資料沒有邏輯。
- 規格 §6.1：牌費用 0～3；每張牌有升級版。
- 工具鏈：`npm test`＝`vitest run`；每個任務結束前測試必須全綠才提交。
- 編碼：`.ts`／`.json`／`.md` 一律 UTF-8 無 BOM、LF；Python 腳本開頭 `# -*- coding: utf-8 -*-` 並在 Windows 用 `PYTHONUTF8=1` 跑。
- 提交訊息用繁體中文，格式「類型：說明」（類型＝功能／測試／資料／修正／文件／建置）。
- 專案根目錄：`F:\ClaudeWork\qiuqiu-tower`（Git 已初始化，分支 `main`）。

---

## 檔案結構（本計畫會建立的）

```
package.json  tsconfig.json  vite.config.ts  index.html
src/main.ts                      骨架佔位（計畫 B 才做畫面）
src/engine/rng.ts                種子亂數（sfc32＋cyrb128）
src/engine/types.ts              所有型別：牌、效果、狀態、單位、戰鬥、地圖、整局
src/engine/statuses.ts           狀態效果加減與回合結算
src/engine/deck.ts               抽、棄、洗、保留、消耗
src/engine/combat.ts             戰鬥回合機、傷害公式、魔物 AI、勝負
src/engine/effects.ts            牌／忍具／魔物效果直譯器、待選狀態
src/engine/relics.ts             秘寶掛鉤（引擎端解讀 content/relics 的資料）
src/engine/map.ts                地圖生成與驗證
src/engine/rewards.ts            獎勵抽籤
src/engine/run.ts                整局狀態、節點推進、罐頭鋪、貓窩、紙箱、事件結果
src/engine/save.ts               存檔序列化（可注入儲存介面）
src/engine/bot.ts                隨機試玩機器人
src/content/cards.ts  relics.ts  potions.ts  enemies.ts  events.ts  dialogue.ts  glossary.ts
tests/**/*.test.ts               與 src 同名對應
scripts/balance.ts               機器人 200 局平衡報告（npm run balance）
```

---

### Task 1: 專案骨架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm test`、`npm run build`、`npm run dev` 三個指令可用；後續任務都用 `npm test -- <檔名>` 跑單一測試檔。

- [ ] **Step 1: 安裝依賴**

Run（在 `F:\ClaudeWork\qiuqiu-tower`）:
```bash
npm init -y
npm install -D typescript vite vitest
```
Expected: `package.json` 與 `node_modules/` 出現，`devDependencies` 含三個套件。

- [ ] **Step 2: 寫 package.json 的指令區**

把 `package.json` 改成（保留 npm 寫入的版本號）：
```json
{
  "name": "qiuqiu-tower",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "balance": "vitest run tests/balance.report.test.ts"
  },
  "devDependencies": {
    "typescript": "<npm 寫入的版本>",
    "vite": "<npm 寫入的版本>",
    "vitest": "<npm 寫入的版本>"
  }
}
```

- [ ] **Step 3: 寫 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src", "tests", "scripts", "vite.config.ts"]
}
```

- [ ] **Step 4: 寫 vite.config.ts、index.html、src/main.ts**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/qiuqiu-tower/',
  build: { target: 'es2022' },
});
```

`index.html`:
```html
<!doctype html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="utf-8">
  <title>球球勇闖魔物塔</title>
  <meta name="viewport" content="width=1280">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

`src/main.ts`:
```ts
const app = document.getElementById('app');
if (app) app.textContent = '球球勇闖魔物塔（建置中）';
```

- [ ] **Step 5: 寫冒煙測試**

`tests/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

describe('工具鏈', () => {
  it('vitest 跑得起來', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: 跑測試與建置**

Run: `npm test`　Expected: 1 passed。
Run: `npm run build`　Expected: 產出 `dist/index.html`，無型別錯誤。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts tests/smoke.test.ts
git commit -m "建置：專案骨架（Vite＋TypeScript＋Vitest）"
```

---

### Task 2: 種子亂數 `rng.ts`

**Files:**
- Create: `src/engine/rng.ts`
- Test: `tests/engine/rng.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RngState { a: number; b: number; c: number; d: number }
  export function seedFromString(seed: string): RngState
  export class Rng {
    constructor(state: RngState)
    readonly state: RngState            // 可直接 JSON 序列化
    next(): number                      // [0, 1)
    int(min: number, max: number): number   // 含兩端
    pick<T>(arr: readonly T[]): T       // 空陣列丟 Error
    shuffle<T>(arr: readonly T[]): T[]  // 回傳新陣列，Fisher–Yates
    chance(p: number): boolean          // next() < p
    clone(): Rng
  }
  ```
  規則：引擎內任何隨機都只能透過 `Rng`，不得用 `Math.random`。

- [ ] **Step 1: 寫失敗測試**

`tests/engine/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Rng, seedFromString } from '../../src/engine/rng';

describe('Rng', () => {
  it('同種子產生同序列', () => {
    const a = new Rng(seedFromString('球球'));
    const b = new Rng(seedFromString('球球'));
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('不同種子序列不同', () => {
    const a = new Rng(seedFromString('球球'));
    const b = new Rng(seedFromString('魔物塔'));
    expect(a.next()).not.toBe(b.next());
  });

  it('next 落在 [0,1)', () => {
    const r = new Rng(seedFromString('x'));
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int 含兩端且不出界', () => {
    const r = new Rng(seedFromString('int'));
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('shuffle 是原陣列的重排且不改原陣列', () => {
    const r = new Rng(seedFromString('shuffle'));
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(src);
    expect(out).not.toEqual(src); // 8 個元素恰好原序的機率 1/40320，此種子已驗證會重排
  });

  it('state 經 JSON 來回後續接同一序列', () => {
    const r = new Rng(seedFromString('save'));
    r.next(); r.next();
    const copy = new Rng(JSON.parse(JSON.stringify(r.state)));
    expect(copy.next()).toBe(r.next());
  });

  it('pick 空陣列丟錯', () => {
    const r = new Rng(seedFromString('p'));
    expect(() => r.pick([])).toThrow();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/engine/rng.test.ts`　Expected: FAIL（找不到模組 `../../src/engine/rng`）。

- [ ] **Step 3: 實作**

`src/engine/rng.ts`:
```ts
export interface RngState { a: number; b: number; c: number; d: number }

/** cyrb128：把任意字串雜湊成 4 個 32 位元整數當種子 */
export function seedFromString(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return { a: (h1 ^ h2 ^ h3 ^ h4) >>> 0, b: h2 >>> 0, c: h3 >>> 0, d: h4 >>> 0 };
}

/** sfc32：小而快的 32 位元亂數，狀態就是四個整數，直接可存檔 */
export class Rng {
  readonly state: RngState;
  constructor(state: RngState) {
    this.state = { a: state.a >>> 0, b: state.b >>> 0, c: state.c >>> 0, d: state.d >>> 0 };
  }
  next(): number {
    const s = this.state;
    s.a |= 0; s.b |= 0; s.c |= 0; s.d |= 0;
    const t = (((s.a + s.b) | 0) + s.d) | 0;
    s.d = (s.d + 1) | 0;
    s.a = s.b ^ (s.b >>> 9);
    s.b = (s.c + (s.c << 3)) | 0;
    s.c = (s.c << 21) | (s.c >>> 11);
    s.c = (s.c + t) | 0;
    s.a >>>= 0; s.b >>>= 0; s.c >>>= 0; s.d >>>= 0;
    return (t >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick：空陣列');
    return arr[this.int(0, arr.length - 1)] as T;
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
  chance(p: number): boolean { return this.next() < p; }
  clone(): Rng { return new Rng({ ...this.state }); }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- tests/engine/rng.test.ts`　Expected: 7 passed。若 `shuffle` 那條因種子剛好原序而失敗，把種子字串改成別的並註明。

- [ ] **Step 5: 提交**

```bash
git add src/engine/rng.ts tests/engine/rng.test.ts
git commit -m "功能：種子亂數 Rng（sfc32＋cyrb128）"
```

---

### Task 3: 型別與名詞表 `types.ts`、`glossary.ts`

**Files:**
- Create: `src/engine/types.ts`, `src/content/glossary.ts`
- Test: `tests/content/glossary.test.ts`

**Interfaces:**
- Produces: 下列型別是後面所有任務的共同語言，名稱不可再改。

- [ ] **Step 1: 寫 `src/engine/types.ts`（全文）**

```ts
import type { Rng, RngState } from './rng';

// ===== 牌 =====
export type CardType = '攻擊' | '技能' | '能力';
export type Rarity = '常見' | '罕見' | '稀有';
export type Pool = '起手' | '忍術' | '絕學' | '壞毛病';
export type Keyword = '消耗' | '保留' | '不可打出';
export type TargetMode = 'enemy' | 'all' | 'self' | 'none';

export type StatusName =
  | '爪力' | '貓步' | '翻肚' | '懶洋洋' | '炸毛' | '噎到' | '隱身' | '定身' | '反彈' | '潛水';
export const DEBUFFS: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛', '噎到'];
/** 回合結束層數 −1 的狀態 */
export const TURN_DECAY: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛'];

export type PowerTrigger = 'turnStart' | 'onKill' | 'turnEndNoAttack';

export type Effect =
  | { kind: 'damage'; amount: number; times?: number; ignoreBlock?: boolean; scaleWithCombo?: boolean; comboCap?: number; target?: 'enemy' | 'all' }
  | { kind: 'damageRandom'; min: number; max: number }
  | { kind: 'damageEqualBlock' }
  | { kind: 'selfDamage'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'stealBlock' }
  | { kind: 'draw'; n: number }
  | { kind: 'drawIfTargetStatus'; name: StatusName; n: number }
  | { kind: 'drawNextTurn'; n: number }
  | { kind: 'status'; name: StatusName; amount: number; target: 'self' | 'enemy' | 'all' }
  | { kind: 'removeStatuses'; names: StatusName[]; removeBlock?: boolean }
  | { kind: 'transferDebuffs' }
  | { kind: 'energy'; n: number }
  | { kind: 'heal'; n: number }
  | { kind: 'gold'; n: number; onKill?: boolean }
  | { kind: 'scry'; n: number }
  | { kind: 'exhaustFromHand'; n: number }
  | { kind: 'retainFromHand'; n: number }
  | { kind: 'discardFromHand'; n: number }
  | { kind: 'recoverFromDiscard' }
  | { kind: 'doubleNextAttack' }
  | { kind: 'endTurn' }
  | { kind: 'noAttacksThisTurn' }
  | { kind: 'immuneThisTurn' }
  | { kind: 'power'; trigger: PowerTrigger; effects: Effect[] };

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  rarity: Rarity;
  pool: Pool;
  target: TargetMode;
  effects: Effect[];
  keywords?: Keyword[];
  /** 貼圖位置：'ninja/10'＝忍者第 10 張、'daxia/05'＝大俠第 5 張、'codex/curl'＝Codex 生圖 */
  art: string;
  /** 升級版覆蓋的欄位；effects 給就整組取代 */
  upgrade: { cost?: number; effects?: Effect[]; keywords?: Keyword[] };
  /** 壞毛病副作用 */
  curse?: { onTurnEnd?: number; onTurnStart?: number; onDraw?: 'loseEnergy' };
}

export interface CardInstance { uid: number; cardId: string; upgraded: boolean }

// ===== 秘寶、忍具 =====
export type RelicPool = '起始' | '常見' | '大魔物' | '塔主';
export interface RelicDef {
  id: string;
  name: string;
  pool: RelicPool;
  text: string;
  art: string;
  hooks: {
    firstTurnDraw?: number;
    firstTurnEnergy?: number;
    maxHp?: number;
    restMultiplier?: number;
    combatStart?: Effect[];
    winGold?: number;
    turnEndNoAttack?: Effect[];
    preventLethal?: boolean;
    firstCardDiscount?: number;
    drawOnNthCard?: { n: number; draw: number };
    stealthBonus?: number;
    energyPerTurn?: number;
  };
}

export interface PotionDef {
  id: string;
  name: string;
  text: string;
  art: string;
  target: 'enemy' | 'all' | 'self';
  effects: Effect[];
}

// ===== 魔物 =====
export type Intent = 'attack' | 'block' | 'buff' | 'debuff' | 'special' | 'summon' | 'idle';
export type EnemyEffect =
  | { kind: 'damage'; amount: number; times?: number }
  | { kind: 'damageRandom'; min: number; max: number }
  | { kind: 'block'; amount: number }
  | { kind: 'statusSelf'; name: StatusName; amount: number }
  | { kind: 'statusPlayer'; name: StatusName; amount: number }
  | { kind: 'heal'; n: number }
  | { kind: 'stealFish'; n: number }
  | { kind: 'discardRandomHand'; n: number }
  | { kind: 'summon'; enemyId: string; n: number }
  | { kind: 'chargeNext' }
  | { kind: 'escape' }
  | { kind: 'nothing' };
export interface EnemyMove { intent: Intent; label: string; effects: EnemyEffect[] }
export type EnemyPool = '弱' | '中' | '強' | '大魔物' | '塔主' | '召喚';
export interface EnemyPhase {
  hpBelow: number;
  onEnter: EnemyEffect[];
  line?: string;
  pattern: 'cycle' | 'random';
  moves: EnemyMove[];
  strengthPerTurn?: number;
}
export interface EnemyDef {
  id: string;
  name: string;
  hp: [number, number];
  pool: EnemyPool;
  pattern: 'cycle' | 'random';
  moves: EnemyMove[];
  line: string;
  art: string;
  size: 'small' | 'medium' | 'large';
  onDeathHealPlayer?: number;
  strengthEveryNTurns?: number;
  phases?: EnemyPhase[];
}
export interface EncounterDef { id: string; pool: EnemyPool; enemies: string[] }

// ===== 事件與整局效果 =====
export type RunEffect =
  | { kind: 'heal'; n: number }
  | { kind: 'healPercent'; p: number }
  | { kind: 'damage'; n: number }
  | { kind: 'fish'; n: number }
  | { kind: 'fishHalve' }
  | { kind: 'maxHp'; n: number }
  | { kind: 'addCard'; cardId: string }
  | { kind: 'addRandomCard'; pool: Pool; rarity?: Rarity }
  | { kind: 'removeCard' }
  | { kind: 'upgradeCard' }
  | { kind: 'relic'; pool: RelicPool }
  | { kind: 'potions'; n: number }
  | { kind: 'fight'; encounterId: string; bonusFish: number }
  | { kind: 'chooseCard'; pool: Pool; n: number }
  | { kind: 'gamble'; p: number; win: RunEffect[]; lose: RunEffect[] };
export interface EventChoice { label: string; costFish?: number; outcome: RunEffect[]; result: string }
export interface EventDef { id: string; title: string; text: string; choices: EventChoice[]; fixedFloor?: number }

// ===== 地圖 =====
export type NodeType = '戰鬥' | '大魔物' | '事件' | '罐頭鋪' | '貓窩' | '紙箱' | '塔主';
export interface MapNode {
  id: string;
  floor: number;
  lane: number;
  type: NodeType;
  next: string[];
  encounterId?: string;
  eventId?: string;
}
export interface GameMap { nodes: MapNode[]; start: string[] }

// ===== 整局 =====
export interface RunState {
  version: 1;
  seed: string;
  rng: RngState;
  hp: number;
  maxHp: number;
  fish: number;
  deck: CardInstance[];
  relics: string[];
  potions: string[];
  floor: number;
  map: GameMap;
  currentNode: string | null;
  nextUid: number;
  stats: { kills: number; turns: number; cardsPlayed: number };
  removeCost: number;
  status: 'playing' | 'won' | 'lost';
}

// ===== 戰鬥 =====
export interface Unit { hp: number; maxHp: number; block: number; statuses: Partial<Record<StatusName, number>> }
export interface PlayerCombat extends Unit {
  energy: number;
  maxEnergy: number;
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  retained: number[];
  powers: { trigger: PowerTrigger; effects: Effect[] }[];
  doubleNext: number;
  drawNextTurn: number;
  noAttacks: boolean;
  immune: boolean;
  attackedThisTurn: boolean;
  cardsPlayedThisTurn: number;
  firstStealthGiven: boolean;
  firstCardPlayed: boolean;
  lethalPrevented: boolean;
}
export interface EnemyCombat extends Unit {
  uid: number;
  enemyId: string;
  name: string;
  moveIndex: number;
  turnCount: number;
  phase: number;
  charged: boolean;
  move: EnemyMove;
  dead: boolean;
  escaped: boolean;   // 逃走：不算擊倒、偷走的小魚乾不退
  stolen: number;     // 這隻偷走的小魚乾，擊倒牠時退回
}
export interface EffectCtx {
  targetUid?: number;
  cardUid?: number;
  cardType?: CardType;
  source?: 'card' | 'potion' | 'relic' | 'power';
  combo?: number;          // 這張牌之前本回合已打出的牌數
  doubleDamage?: boolean;  // 蓄力：這張攻擊牌的傷害加倍
  killed?: boolean;        // 這張牌的傷害有沒有擊倒魔物（順手牽羊用）
}
export interface PendingChoice {
  kind: 'chooseCards';
  from: 'hand' | 'discard' | 'scry';
  purpose: 'exhaust' | 'retain' | 'discard' | 'recover' | 'scryDiscard';
  cards: CardInstance[];
  min: number;
  max: number;
  remaining: Effect[];
  ctx: EffectCtx;
}
export interface CombatState {
  rng: Rng;                 // 戰鬥不存檔，直接帶亂數物件
  player: PlayerCombat;
  enemies: EnemyCombat[];
  relics: string[];
  potions: string[];        // 從整局複製進來，用掉就移除，戰後寫回
  turn: number;
  phase: 'player' | 'won' | 'lost';
  pending: PendingChoice | null;
  log: string[];
  encounterId: string;
  stolenFish: number;       // 山賊偷走的，擊倒牠全部拿回
  fishDelta: number;        // 牌效果賺到的小魚乾
  kills: number;
  cardsPlayed: number;
  nextEnemyUid: number;
}
```

- [ ] **Step 2: 寫失敗測試 `tests/content/glossary.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { glossary } from '../../src/content/glossary';

const MUST: string[] = [
  '飽足', '飯糰', '蜷縮', '隱身', '連抓', '爪力', '貓步', '翻肚', '懶洋洋', '炸毛',
  '噎到', '反彈', '定身', '壞毛病', '小魚乾', '秘寶', '忍具', '罐頭鋪', '貓窩', '紙箱',
  '大魔物', '塔主', '消耗', '保留', '不可打出', '潛水',
];

describe('名詞表', () => {
  it('涵蓋所有規則名詞', () => {
    for (const t of MUST) expect(glossary[t], t).toBeTruthy();
  });
  it('說明是白話，不含「喵」', () => {
    for (const v of Object.values(glossary)) expect(v.endsWith('喵')).toBe(false);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm test -- tests/content/glossary.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 4: 寫 `src/content/glossary.ts`**

```ts
/** 滑鼠移過關鍵字時顯示的白話說明（不加喵：這是系統說明不是球球講話） */
export const glossary: Record<string, string> = {
  飽足: '出牌的力氣。每回合開始吃飽 3 顆飯糰，出一張牌吃掉它的費用；吃光就餓扁了，只能出 0 費的牌。',
  飯糰: '飽足的單位。畫面上三顆飯糰，出牌就少一顆。',
  蜷縮: '球球縮成一顆球擋傷害。撐到你下回合開始就歸零。',
  隱身: '魔物每一次攻擊打中你時，消耗 1 層並落空。多段攻擊每段各消耗 1 層。',
  連抓: '本回合在這張牌之前已經打出的牌數。',
  爪力: '每 1 點讓你的攻擊多 1 傷，整場有效。',
  貓步: '每 1 點讓你的蜷縮多 1，整場有效。',
  翻肚: '受到的傷害變 1.5 倍。每回合結束少 1 層。',
  懶洋洋: '造成的傷害只剩 0.75 倍。每回合結束少 1 層。',
  炸毛: '獲得的蜷縮只剩 0.75 倍。每回合結束少 1 層。',
  噎到: '回合開始時受到等同層數的傷害，然後層數減 1。',
  反彈: '每次被攻擊打中，回敬攻擊者等同層數的傷害。',
  定身: '這隻魔物的下一次攻擊會失效。',
  潛水: '下回合開始時獲得等同層數的隱身。',
  壞毛病: '塞進牌組的爛牌：不能打出、佔手牌，有的還有副作用。',
  小魚乾: '塔裡通用的錢。罐頭鋪收這個。',
  秘寶: '整局都生效的寶物。',
  忍具: '戰鬥中可以用的道具，最多帶 3 個，用完就沒了。',
  罐頭鋪: '橘貓老闆開的店：買牌、秘寶、忍具，或花小魚乾「放生」一張牌。',
  貓窩: '休息點：打盹回血，或磨爪升級一張牌。',
  紙箱: '打開會得到一件秘寶。',
  大魔物: '比較強的魔物，打贏必掉秘寶。',
  塔主: '這一幕的最後一戰。',
  消耗: '這張牌打出後，本場戰鬥不會再回到牌堆。',
  保留: '回合結束時這張牌留在手上，不會被棄掉。',
  不可打出: '這張牌不能打出，只會佔住手牌。',
};
```

- [ ] **Step 5: 跑測試與型別檢查**

Run: `npm test -- tests/content/glossary.test.ts`　Expected: 2 passed。
Run: `npx tsc --noEmit`　Expected: 無錯誤。

- [ ] **Step 6: 提交**

```bash
git add src/engine/types.ts src/content/glossary.ts tests/content/glossary.test.ts
git commit -m "功能：引擎型別定義與名詞表"
```

---

### Task 4: 牌資料 `cards.ts`（58 張）

**Files:**
- Create: `src/content/cards.ts`
- Test: `tests/content/cards.test.ts`

**Interfaces:**
- Consumes: `CardDef`、`Effect`（Task 3）。
- Produces: `export const cards: CardDef[]`、`export const cardById: Record<string, CardDef>`、`export const STARTER_DECK: string[]`（10 個 id）。

- [ ] **Step 1: 寫失敗測試 `tests/content/cards.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { STARTER_DECK, cardById, cards } from '../../src/content/cards';

describe('牌資料', () => {
  it('數量：起手 3、忍術 33、絕學 18、壞毛病 4', () => {
    const count = (pool: string) => cards.filter((c) => c.pool === pool).length;
    expect(count('起手')).toBe(3);
    expect(count('忍術')).toBe(33);
    expect(count('絕學')).toBe(18);
    expect(count('壞毛病')).toBe(4);
    expect(cards.length).toBe(58);
  });
  it('id 與名稱不重複', () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(new Set(cards.map((c) => c.name)).size).toBe(cards.length);
    for (const c of cards) expect(cardById[c.id]).toBe(c);
  });
  it('費用 0～3，貼圖位置格式正確', () => {
    for (const c of cards) {
      expect(c.cost, c.name).toBeGreaterThanOrEqual(0);
      expect(c.cost, c.name).toBeLessThanOrEqual(3);
      expect(c.art, c.name).toMatch(/^(ninja|daxia)\/\d{2}$|^codex\/[a-z_]+$/);
    }
  });
  it('非壞毛病的牌都有升級內容', () => {
    for (const c of cards.filter((x) => x.pool !== '壞毛病')) {
      const u = c.upgrade;
      expect(u.cost !== undefined || u.effects !== undefined || u.keywords !== undefined, c.name).toBe(true);
    }
  });
  it('壞毛病一律不可打出且無效果', () => {
    for (const c of cards.filter((x) => x.pool === '壞毛病')) {
      expect(c.keywords).toContain('不可打出');
      expect(c.effects).toEqual([]);
    }
  });
  it('目標模式與效果一致', () => {
    for (const c of cards) {
      const hitsAll = c.effects.some((e) => ('target' in e && e.target === 'all'));
      const hitsOne = c.effects.some((e) =>
        (e.kind === 'damage' && e.target !== 'all') || e.kind === 'damageRandom' || e.kind === 'damageEqualBlock' ||
        e.kind === 'stealBlock' || e.kind === 'transferDebuffs' || e.kind === 'removeStatuses' ||
        (e.kind === 'status' && e.target === 'enemy') || e.kind === 'drawIfTargetStatus');
      if (hitsAll) expect(c.target, c.name).toBe('all');
      else if (hitsOne) expect(c.target, c.name).toBe('enemy');
      else if (c.pool === '壞毛病') expect(c.target, c.name).toBe('none');
      else expect(c.target, c.name).toBe('self');
    }
  });
  it('連抓加成的牌有上限', () => {
    for (const c of cards) for (const e of c.effects)
      if (e.kind === 'damage' && e.scaleWithCombo) expect(e.comboCap, c.name).toBeGreaterThan(0);
  });
  it('起手牌組 10 張', () => {
    expect(STARTER_DECK).toEqual([
      'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo',
      'tanding', 'tanding', 'tanding', 'tanding', 'kawarimi',
    ]);
    for (const id of STARTER_DECK) expect(cardById[id]?.pool).toBe('起手');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/content/cards.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫 `src/content/cards.ts`（全文，數值照規格 §6.1）**

```ts
import type { CardDef } from '../engine/types';

const 攻 = '攻擊', 技 = '技能', 能 = '能力';

export const cards: CardDef[] = [
  // ===== 起手 =====
  { id: 'sanjo', name: '參上', cost: 1, type: 攻, rarity: '常見', pool: '起手', target: 'enemy', art: 'ninja/01',
    effects: [{ kind: 'damage', amount: 6 }], upgrade: { effects: [{ kind: 'damage', amount: 9 }] } },
  { id: 'tanding', name: '淡定', cost: 1, type: 技, rarity: '常見', pool: '起手', target: 'self', art: 'ninja/32',
    effects: [{ kind: 'block', amount: 5 }], upgrade: { effects: [{ kind: 'block', amount: 8 }] } },
  { id: 'kawarimi', name: '忍術·替身術', cost: 0, type: 技, rarity: '常見', pool: '起手', target: 'self', art: 'ninja/08',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 1 }] } },

  // ===== 忍術（33） =====
  { id: 'shunkan', name: '忍術·瞬間移動', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'ninja/03',
    effects: [{ kind: 'damage', amount: 7, ignoreBlock: true }], upgrade: { effects: [{ kind: 'damage', amount: 10, ignoreBlock: true }] } },
  { id: 'shengdong', name: '忍術·聲東擊西', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'ninja/19',
    effects: [{ kind: 'damage', amount: 5 }, { kind: 'status', name: '懶洋洋', amount: 1, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 7 }, { kind: 'status', name: '懶洋洋', amount: 2, target: 'enemy' }] } },
  { id: 'shunshou', name: '忍術·順手牽羊', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'ninja/20',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'gold', n: 15, onKill: true }],
    upgrade: { effects: [{ kind: 'damage', amount: 9 }, { kind: 'gold', n: 25, onKill: true }] } },
  { id: 'wozaizhe', name: '我在這', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'ninja/02',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'drawIfTargetStatus', name: '翻肚', n: 1 }],
    upgrade: { effects: [{ kind: 'damage', amount: 9 }, { kind: 'drawIfTargetStatus', name: '翻肚', n: 1 }] } },
  { id: 'jiaochulai', name: '交出來', cost: 1, type: 攻, rarity: '常見', pool: '忍術', target: 'enemy', art: 'ninja/27',
    effects: [{ kind: 'stealBlock' }, { kind: 'damage', amount: 4 }], upgrade: { effects: [{ kind: 'stealBlock' }, { kind: 'damage', amount: 6 }] } },
  { id: 'susu', name: '速速退散', cost: 2, type: 攻, rarity: '常見', pool: '忍術', target: 'all', art: 'ninja/28',
    effects: [{ kind: 'damage', amount: 8, target: 'all' }], upgrade: { effects: [{ kind: 'damage', amount: 11, target: 'all' }] } },
  { id: 'bunshin', name: '忍術·分身術', cost: 1, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'ninja/10',
    effects: [{ kind: 'damage', amount: 3, scaleWithCombo: true, comboCap: 5 }],
    upgrade: { effects: [{ kind: 'damage', amount: 4, scaleWithCombo: true, comboCap: 5 }] } },
  { id: 'ruying', name: '如影隨形', cost: 2, type: 攻, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'ninja/26',
    effects: [{ kind: 'damage', amount: 5, times: 2 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'damage', amount: 7, times: 2 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'zhangyan', name: '忍術·障眼法', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/07',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 1 }],
    upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 2 }] } },
  { id: 'yinshen', name: '忍術·隱身術', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/09',
    effects: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }], upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 3, target: 'self' }] } },
  { id: 'bianshen', name: '忍術·變身術', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/11',
    effects: [{ kind: 'block', amount: 9 }], upgrade: { effects: [{ kind: 'block', amount: 12 }] } },
  { id: 'zhuangsi', name: '忍術·裝死術', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/13', keywords: ['消耗'],
    effects: [{ kind: 'block', amount: 5 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'block', amount: 8 }, { kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'duxin', name: '忍術·讀心術', cost: 0, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/15',
    effects: [{ kind: 'scry', n: 3 }, { kind: 'draw', n: 1 }], upgrade: { effects: [{ kind: 'scry', n: 5 }, { kind: 'draw', n: 1 }] } },
  { id: 'qianliyan', name: '千里眼', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/22',
    effects: [{ kind: 'draw', n: 2 }], upgrade: { effects: [{ kind: 'draw', n: 3 }] } },
  { id: 'shunfenger', name: '順風耳', cost: 0, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/23',
    effects: [{ kind: 'drawNextTurn', n: 2 }], upgrade: { effects: [{ kind: 'drawNextTurn', n: 3 }] } },
  { id: 'dingshang', name: '盯上你了', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'enemy', art: 'ninja/30',
    effects: [{ kind: 'status', name: '翻肚', amount: 2, target: 'enemy' }], upgrade: { effects: [{ kind: 'status', name: '翻肚', amount: 3, target: 'enemy' }] } },
  { id: 'chudashi', name: '出大事了', cost: 0, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/33',
    effects: [{ kind: 'draw', n: 2 }, { kind: 'status', name: '翻肚', amount: 1, target: 'self' }], upgrade: { effects: [{ kind: 'draw', n: 2 }] } },
  { id: 'youcike', name: '有刺客', cost: 0, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/29', keywords: ['消耗'],
    effects: [{ kind: 'draw', n: 2 }], upgrade: { effects: [{ kind: 'draw', n: 3 }] } },
  { id: 'zhanshu', name: '戰術撤退', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/37',
    effects: [{ kind: 'block', amount: 8 }, { kind: 'noAttacksThisTurn' }], upgrade: { effects: [{ kind: 'block', amount: 11 }, { kind: 'noAttacksThisTurn' }] } },
  { id: 'tuozi', name: '忍術·拖字訣', cost: 1, type: 技, rarity: '常見', pool: '忍術', target: 'self', art: 'ninja/24',
    effects: [{ kind: 'retainFromHand', n: 1 }, { kind: 'draw', n: 1 }], upgrade: { effects: [{ kind: 'retainFromHand', n: 2 }, { kind: 'draw', n: 1 }] } },
  { id: 'shuaiguo', name: '忍術·甩鍋術', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'ninja/06',
    effects: [{ kind: 'transferDebuffs' }], upgrade: { cost: 0 } },
  { id: 'dingshen', name: '忍術·定身術', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'ninja/12',
    effects: [{ kind: 'status', name: '定身', amount: 1, target: 'enemy' }], upgrade: { cost: 0 } },
  { id: 'cuimian', name: '忍術·催眠術', cost: 2, type: 技, rarity: '罕見', pool: '忍術', target: 'all', art: 'ninja/14',
    effects: [{ kind: 'status', name: '懶洋洋', amount: 2, target: 'all' }, { kind: 'status', name: '炸毛', amount: 2, target: 'all' }],
    upgrade: { effects: [{ kind: 'status', name: '懶洋洋', amount: 3, target: 'all' }, { kind: 'status', name: '炸毛', amount: 3, target: 'all' }] } },
  { id: 'fengkou', name: '忍術·封口術', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'enemy', art: 'ninja/05',
    effects: [{ kind: 'removeStatuses', names: ['爪力', '貓步'], removeBlock: true }],
    upgrade: { effects: [{ kind: 'removeStatuses', names: ['爪力', '貓步'], removeBlock: true }, { kind: 'status', name: '翻肚', amount: 1, target: 'enemy' }] } },
  { id: 'qianshui', name: '忍術·潛水術', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'ninja/25',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'status', name: '潛水', amount: 1, target: 'self' }],
    upgrade: { effects: [{ kind: 'status', name: '隱身', amount: 2, target: 'self' }, { kind: 'status', name: '潛水', amount: 2, target: 'self' }] } },
  { id: 'touchi', name: '忍術·偷吃術', cost: 0, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'ninja/21', keywords: ['消耗'],
    effects: [{ kind: 'energy', n: 1 }], upgrade: { effects: [{ kind: 'energy', n: 1 }, { kind: 'draw', n: 1 }] } },
  { id: 'xianshuile', name: '先睡了', cost: 1, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'ninja/38',
    effects: [{ kind: 'heal', n: 4 }, { kind: 'endTurn' }], upgrade: { effects: [{ kind: 'heal', n: 7 }, { kind: 'endTurn' }] } },
  { id: 'gaotui', name: '告退', cost: 0, type: 技, rarity: '罕見', pool: '忍術', target: 'self', art: 'ninja/39',
    effects: [{ kind: 'exhaustFromHand', n: 1 }, { kind: 'draw', n: 1 }], upgrade: { effects: [{ kind: 'exhaustFromHand', n: 1 }, { kind: 'draw', n: 2 }] } },
  { id: 'meikandao', name: '我什麼都沒看到', cost: 2, type: 技, rarity: '稀有', pool: '忍術', target: 'self', art: 'ninja/31', keywords: ['消耗'],
    effects: [{ kind: 'immuneThisTurn' }], upgrade: { cost: 1 } },
  { id: 'jiejie', name: '結界', cost: 2, type: 能, rarity: '罕見', pool: '忍術', target: 'self', art: 'ninja/17',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'block', amount: 3 }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'block', amount: 4 }] }] } },
  { id: 'fantan', name: '反彈', cost: 1, type: 能, rarity: '罕見', pool: '忍術', target: 'self', art: 'ninja/16',
    effects: [{ kind: 'status', name: '反彈', amount: 3, target: 'self' }], upgrade: { effects: [{ kind: 'status', name: '反彈', amount: 4, target: 'self' }] } },
  { id: 'renwuwancheng', name: '任務完成', cost: 1, type: 能, rarity: '稀有', pool: '忍術', target: 'self', art: 'ninja/04',
    effects: [{ kind: 'power', trigger: 'onKill', effects: [{ kind: 'heal', n: 6 }] }],
    upgrade: { effects: [{ kind: 'power', trigger: 'onKill', effects: [{ kind: 'heal', n: 8 }] }] } },
  { id: 'fengyin', name: '封印解除', cost: 3, type: 能, rarity: '稀有', pool: '忍術', target: 'self', art: 'ninja/18',
    effects: [{ kind: 'power', trigger: 'turnStart', effects: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] }], upgrade: { cost: 2 } },

  // ===== 絕學（18） =====
  { id: 'tieshazhang', name: '絕學·鐵砂掌', cost: 1, type: 攻, rarity: '常見', pool: '絕學', target: 'enemy', art: 'daxia/08',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'status', name: '噎到', amount: 3, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 8 }, { kind: 'status', name: '噎到', amount: 4, target: 'enemy' }] } },
  { id: 'qinna', name: '絕學·擒拿手', cost: 1, type: 攻, rarity: '常見', pool: '絕學', target: 'enemy', art: 'daxia/09',
    effects: [{ kind: 'damage', amount: 7 }, { kind: 'status', name: '炸毛', amount: 2, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 9 }, { kind: 'status', name: '炸毛', amount: 3, target: 'enemy' }] } },
  { id: 'juye', name: '絕學·聚葉成刀', cost: 1, type: 攻, rarity: '常見', pool: '絕學', target: 'enemy', art: 'daxia/14',
    effects: [{ kind: 'damage', amount: 3, times: 3 }], upgrade: { effects: [{ kind: 'damage', amount: 4, times: 3 }] } },
  { id: 'jinzhong', name: '絕學·金鐘罩', cost: 2, type: 技, rarity: '常見', pool: '絕學', target: 'self', art: 'daxia/07',
    effects: [{ kind: 'block', amount: 14 }], upgrade: { effects: [{ kind: 'block', amount: 18 }] } },
  { id: 'qinggong', name: '絕學·輕功', cost: 1, type: 技, rarity: '常見', pool: '絕學', target: 'self', art: 'daxia/11',
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }, { kind: 'draw', n: 2 }], upgrade: { cost: 0 } },
  { id: 'taxue', name: '絕學·踏雪無痕', cost: 0, type: 技, rarity: '常見', pool: '絕學', target: 'self', art: 'daxia/12', keywords: ['消耗'],
    effects: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }], upgrade: { keywords: [] } },
  { id: 'xuli', name: '絕學·蓄力', cost: 1, type: 技, rarity: '常見', pool: '絕學', target: 'self', art: 'daxia/21',
    effects: [{ kind: 'doubleNextAttack' }], upgrade: { cost: 0 } },
  { id: 'tietou', name: '絕學·鐵頭功', cost: 2, type: 攻, rarity: '罕見', pool: '絕學', target: 'enemy', art: 'daxia/05',
    effects: [{ kind: 'damage', amount: 16 }, { kind: 'selfDamage', amount: 2 }],
    upgrade: { effects: [{ kind: 'damage', amount: 20 }, { kind: 'selfDamage', amount: 2 }] } },
  { id: 'shihou', name: '絕學·獅吼功', cost: 2, type: 攻, rarity: '罕見', pool: '絕學', target: 'all', art: 'daxia/06',
    effects: [{ kind: 'damage', amount: 10, target: 'all' }, { kind: 'status', name: '懶洋洋', amount: 1, target: 'all' }],
    upgrade: { effects: [{ kind: 'damage', amount: 13, target: 'all' }, { kind: 'status', name: '懶洋洋', amount: 1, target: 'all' }] } },
  { id: 'dianxue', name: '絕學·點穴手', cost: 1, type: 攻, rarity: '罕見', pool: '絕學', target: 'enemy', art: 'daxia/10',
    effects: [{ kind: 'damage', amount: 6 }, { kind: 'status', name: '定身', amount: 1, target: 'enemy' }],
    upgrade: { effects: [{ kind: 'damage', amount: 9 }, { kind: 'status', name: '定身', amount: 1, target: 'enemy' }] } },
  { id: 'zuiquan', name: '絕學·醉拳', cost: 1, type: 攻, rarity: '罕見', pool: '絕學', target: 'enemy', art: 'daxia/16',
    effects: [{ kind: 'damageRandom', min: 4, max: 14 }], upgrade: { effects: [{ kind: 'damageRandom', min: 8, max: 18 }] } },
  { id: 'yixing', name: '絕學·移形換影', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'daxia/13',
    effects: [{ kind: 'draw', n: 3 }, { kind: 'discardFromHand', n: 1 }], upgrade: { effects: [{ kind: 'draw', n: 4 }, { kind: 'discardFromHand', n: 1 }] } },
  { id: 'gekong', name: '絕學·隔空取物', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'daxia/15',
    effects: [{ kind: 'recoverFromDiscard' }], upgrade: { cost: 0 } },
  { id: 'guixi', name: '絕學·龜息術', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'self', art: 'daxia/17', keywords: ['消耗'],
    effects: [{ kind: 'heal', n: 8 }], upgrade: { effects: [{ kind: 'heal', n: 12 }] } },
  { id: 'taiji', name: '絕學·太極', cost: 1, type: 技, rarity: '罕見', pool: '絕學', target: 'enemy', art: 'daxia/18',
    effects: [{ kind: 'damageEqualBlock' }], upgrade: { cost: 0 } },
  { id: 'mabu', name: '絕學·馬步', cost: 1, type: 能, rarity: '罕見', pool: '絕學', target: 'self', art: 'daxia/19',
    effects: [{ kind: 'status', name: '貓步', amount: 2, target: 'self' }], upgrade: { effects: [{ kind: 'status', name: '貓步', amount: 3, target: 'self' }] } },
  { id: 'yungong', name: '絕學·運功', cost: 1, type: 能, rarity: '罕見', pool: '絕學', target: 'self', art: 'daxia/20',
    effects: [{ kind: 'status', name: '爪力', amount: 2, target: 'self' }], upgrade: { effects: [{ kind: 'status', name: '爪力', amount: 3, target: 'self' }] } },
  { id: 'yide', name: '絕學·以德服人', cost: 2, type: 技, rarity: '稀有', pool: '絕學', target: 'all', art: 'daxia/22',
    effects: [{ kind: 'status', name: '懶洋洋', amount: 3, target: 'all' }, { kind: 'heal', n: 5 }], upgrade: { cost: 1 } },

  // ===== 壞毛病（4） =====
  { id: 'zhongji', name: '中計了', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'ninja/34', keywords: ['不可打出'], effects: [], upgrade: {} },
  { id: 'shishou', name: '失手了', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'ninja/35', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onTurnEnd: 1 } },
  { id: 'zouhuo', name: '走火入魔', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'daxia/33', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onTurnStart: 2 } },
  { id: 'neili', name: '內力不足', cost: 0, type: 技, rarity: '常見', pool: '壞毛病', target: 'none', art: 'daxia/34', keywords: ['不可打出'], effects: [], upgrade: {}, curse: { onDraw: 'loseEnergy' } },
];

export const cardById: Record<string, CardDef> = Object.fromEntries(cards.map((c) => [c.id, c]));

export const STARTER_DECK: string[] = [
  'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo',
  'tanding', 'tanding', 'tanding', 'tanding', 'kawarimi',
];
```

- [ ] **Step 4: 跑測試與型別檢查**

Run: `npm test -- tests/content/cards.test.ts`　Expected: 8 passed。
Run: `npx tsc --noEmit`　Expected: 無錯誤（若 `as const` 型別推斷卡住，把 `攻／技／能` 三個常數改成 `'攻擊' as const` 寫法）。

- [ ] **Step 5: 提交**

```bash
git add src/content/cards.ts tests/content/cards.test.ts
git commit -m "資料：58 張牌（起手、忍術、絕學、壞毛病）"
```

---

### Task 5: 秘寶與忍具資料 `relics.ts`、`potions.ts`

**Files:**
- Create: `src/content/relics.ts`, `src/content/potions.ts`
- Test: `tests/content/relics.test.ts`

**Interfaces:**
- Produces: `export const relics: RelicDef[]`、`relicById`、`export const potions: PotionDef[]`、`potionById`。

- [ ] **Step 1: 寫失敗測試 `tests/content/relics.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { potionById, potions } from '../../src/content/potions';
import { relicById, relics } from '../../src/content/relics';

describe('秘寶', () => {
  it('15 件、池數正確、id 不重複', () => {
    expect(relics.length).toBe(15);
    const n = (p: string) => relics.filter((r) => r.pool === p).length;
    expect(n('起始')).toBe(1); expect(n('常見')).toBe(7); expect(n('大魔物')).toBe(6); expect(n('塔主')).toBe(1);
    expect(new Set(relics.map((r) => r.id)).size).toBe(15);
    expect(relicById['blue_headband']?.hooks.firstTurnDraw).toBe(1);
  });
  it('每件至少一個掛鉤且有說明', () => {
    for (const r of relics) {
      expect(Object.keys(r.hooks).length, r.name).toBeGreaterThan(0);
      expect(r.text.length, r.name).toBeGreaterThan(3);
      expect(r.art, r.name).toMatch(/^codex\/relic_[a-z_]+$/);
    }
  });
});

describe('忍具', () => {
  it('8 種、id 不重複、目標與效果一致', () => {
    expect(potions.length).toBe(8);
    expect(new Set(potions.map((p) => p.id)).size).toBe(8);
    for (const p of potions) {
      expect(potionById[p.id]).toBe(p);
      const hitsAll = p.effects.some((e) => 'target' in e && e.target === 'all');
      const hitsOne = p.effects.some((e) => (e.kind === 'damage' && e.target !== 'all') || (e.kind === 'status' && e.target === 'enemy'));
      expect(p.target, p.name).toBe(hitsAll ? 'all' : hitsOne ? 'enemy' : 'self');
      expect(p.art, p.name).toMatch(/^codex\/potion_[a-z_]+$/);
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/content/relics.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫 `src/content/relics.ts`**

```ts
import type { RelicDef } from '../engine/types';

export const relics: RelicDef[] = [
  { id: 'blue_headband', name: '藍頭巾', pool: '起始', text: '每場戰鬥第一回合多抽 1 張。', art: 'codex/relic_headband', hooks: { firstTurnDraw: 1 } },
  { id: 'onigiri_bag', name: '飯糰袋', pool: '常見', text: '每場戰鬥第一回合多 1 顆飯糰。', art: 'codex/relic_onigiri_bag', hooks: { firstTurnEnergy: 1 } },
  { id: 'tuna_can', name: '鮪魚罐頭', pool: '常見', text: '最大生命 +10。', art: 'codex/relic_tuna_can', hooks: { maxHp: 10 } },
  { id: 'catgrass', name: '貓草', pool: '常見', text: '貓窩打盹的回復量加倍。', art: 'codex/relic_catgrass', hooks: { restMultiplier: 2 } },
  { id: 'bell', name: '鈴鐺', pool: '常見', text: '每場戰鬥開始獲得 1 隱身。', art: 'codex/relic_bell',
    hooks: { combatStart: [{ kind: 'status', name: '隱身', amount: 1, target: 'self' }] } },
  { id: 'fish_jar', name: '小魚乾罐', pool: '常見', text: '每場戰鬥勝利多拿 10 小魚乾。', art: 'codex/relic_fish_jar', hooks: { winGold: 10 } },
  { id: 'catnip', name: '貓薄荷', pool: '常見', text: '每場戰鬥開始回復 3 生命。', art: 'codex/relic_catnip',
    hooks: { combatStart: [{ kind: 'heal', n: 3 }] } },
  { id: 'tail_bell', name: '尾巴鈴', pool: '常見', text: '回合結束時若本回合沒打攻擊牌，獲得 4 蜷縮。', art: 'codex/relic_tail_bell',
    hooks: { turnEndNoAttack: [{ kind: 'block', amount: 4 }] } },
  { id: 'wood_post', name: '木樁', pool: '大魔物', text: '每場戰鬥第一次致命傷改為剩 1 生命。', art: 'codex/relic_wood_post', hooks: { preventLethal: true } },
  { id: 'yarn_ball', name: '毛線球', pool: '大魔物', text: '每回合第一張打出的牌費用 −1（最低 0）。', art: 'codex/relic_yarn_ball', hooks: { firstCardDiscount: 1 } },
  { id: 'cat_teaser', name: '逗貓棒', pool: '大魔物', text: '每回合打出第 3 張牌時抽 1 張。', art: 'codex/relic_cat_teaser', hooks: { drawOnNthCard: { n: 3, draw: 1 } } },
  { id: 'scroll', name: '秘笈', pool: '大魔物', text: '每場戰鬥開始獲得 1 爪力。', art: 'codex/relic_scroll',
    hooks: { combatStart: [{ kind: 'status', name: '爪力', amount: 1, target: 'self' }] } },
  { id: 'paper_bag', name: '紙袋', pool: '大魔物', text: '每回合第一次獲得隱身時多 1 層。', art: 'codex/relic_paper_bag', hooks: { stealthBonus: 1 } },
  { id: 'bronze_mirror', name: '銅鏡', pool: '大魔物', text: '每場戰鬥開始獲得 2 反彈。', art: 'codex/relic_bronze_mirror',
    hooks: { combatStart: [{ kind: 'status', name: '反彈', amount: 2, target: 'self' }] } },
  { id: 'tower_token', name: '塔主令牌', pool: '塔主', text: '每回合多 1 顆飯糰；最大生命 −10。', art: 'codex/relic_tower_token', hooks: { energyPerTurn: 1, maxHp: -10 } },
];

export const relicById: Record<string, RelicDef> = Object.fromEntries(relics.map((r) => [r.id, r]));
```

- [ ] **Step 4: 寫 `src/content/potions.ts`**

```ts
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
```

- [ ] **Step 5: 跑測試、型別檢查、提交**

Run: `npm test -- tests/content/relics.test.ts`　Expected: 3 passed。`npx tsc --noEmit` 無錯誤。
```bash
git add src/content/relics.ts src/content/potions.ts tests/content/relics.test.ts
git commit -m "資料：15 件秘寶與 8 種忍具"
```

---

### Task 6: 魔物與遭遇資料 `enemies.ts`

**Files:**
- Create: `src/content/enemies.ts`
- Test: `tests/content/enemies.test.ts`

**Interfaces:**
- Produces: `export const enemies: EnemyDef[]`、`enemyById`、`export const encounters: EncounterDef[]`、`encounterById`、`export function encountersOfPool(pool: EnemyPool): EncounterDef[]`。
- 規則（引擎 Task 9 依此實作）：同一場多隻同種魔物，第 k 隻（0 起算）從第 k 個動作開始循環，讓牠們錯開一拍。

- [ ] **Step 1: 寫失敗測試 `tests/content/enemies.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { encounterById, encounters, encountersOfPool, enemies, enemyById } from '../../src/content/enemies';

describe('魔物資料', () => {
  it('數量：一般 12、大魔物 2、塔主 1、召喚 1', () => {
    const n = (p: string) => enemies.filter((e) => e.pool === p).length;
    expect(n('弱') + n('中') + n('強')).toBe(12);
    expect(n('大魔物')).toBe(2); expect(n('塔主')).toBe(1); expect(n('召喚')).toBe(1);
    expect(new Set(enemies.map((e) => e.id)).size).toBe(enemies.length);
  });
  it('生命區間合法、至少一個動作、有台詞與圖', () => {
    for (const e of enemies) {
      expect(e.hp[0], e.name).toBeGreaterThan(0);
      expect(e.hp[1], e.name).toBeGreaterThanOrEqual(e.hp[0]);
      expect(e.moves.length, e.name).toBeGreaterThan(0);
      expect(e.line.length, e.name).toBeGreaterThan(0);
      expect(e.art, e.name).toMatch(/^(codex\/monster_[a-z_]+|daxia)$/);
    }
  });
  it('召喚與遭遇引用的魔物都存在，池一致', () => {
    for (const e of enemies) for (const m of e.moves) for (const fx of m.effects)
      if (fx.kind === 'summon') expect(enemyById[fx.enemyId], `${e.name} 召喚`).toBeTruthy();
    for (const enc of encounters) {
      expect(encounterById[enc.id]).toBe(enc);
      for (const id of enc.enemies) {
        expect(enemyById[id], enc.id).toBeTruthy();
        expect(enemyById[id]?.pool, enc.id).toBe(enc.pool);
      }
    }
  });
  it('每個池都有遭遇；召喚物不在遭遇裡', () => {
    for (const p of ['弱', '中', '強', '大魔物', '塔主'] as const) expect(encountersOfPool(p).length, p).toBeGreaterThan(0);
    expect(encounters.some((enc) => enc.enemies.includes('black_kitten'))).toBe(false);
  });
  it('塔主兩階段', () => {
    const boss = enemyById['tower_master']!;
    expect(boss.phases?.length).toBe(1);
    expect(boss.phases?.[0]?.hpBelow).toBe(80);
    expect(boss.phases?.[0]?.strengthPerTurn).toBe(1);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/content/enemies.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫 `src/content/enemies.ts`（全文，數值照規格 §6.4）**

```ts
import type { EncounterDef, EnemyDef, EnemyPool } from '../engine/types';

export const enemies: EnemyDef[] = [
  // ===== 弱池 =====
  { id: 'rat', name: '小老鼠兵', hp: [12, 15], pool: '弱', pattern: 'cycle', size: 'small', art: 'codex/monster_rat',
    line: '吱吱！小魚乾是我們的！',
    moves: [
      { intent: 'attack', label: '啃', effects: [{ kind: 'damage', amount: 4 }] },
      { intent: 'attack', label: '啃', effects: [{ kind: 'damage', amount: 4 }] },
      { intent: 'block', label: '躲', effects: [{ kind: 'block', amount: 5 }] },
    ] },
  { id: 'cucumber', name: '黃瓜怪', hp: [30, 34], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_cucumber',
    line: '（安靜地躺在那裡）',
    moves: [
      { intent: 'debuff', label: '嚇人', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 1 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] },
    ] },
  { id: 'onigiri_monster', name: '飯糰怪', hp: [26, 30], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_onigiri',
    line: '別吃我！', onDeathHealPlayer: 3,
    moves: [
      { intent: 'debuff', label: '黏住', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 1 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 6 }] },
      { intent: 'block', label: '結成飯糰', effects: [{ kind: 'block', amount: 6 }] },
    ] },
  { id: 'wood_dummy', name: '木樁人', hp: [40, 40], pool: '弱', pattern: 'cycle', size: 'medium', art: 'codex/monster_wood_dummy',
    line: '……', strengthEveryNTurns: 3,
    moves: [
      { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: 5 }] },
    ] },
  { id: 'goat', name: '迷途山羊', hp: [24, 28], pool: '弱', pattern: 'random', size: 'medium', art: 'codex/monster_goat',
    line: '咩？',
    moves: [
      { intent: 'attack', label: '衝撞', effects: [{ kind: 'damage', amount: 9 }] },
      { intent: 'buff', label: '吃草', effects: [{ kind: 'heal', n: 5 }] },
      { intent: 'idle', label: '發呆', effects: [{ kind: 'nothing' }] },
    ] },

  // ===== 中池 =====
  { id: 'vacuum', name: '吸塵器', hp: [44, 48], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_vacuum',
    line: '嗡————',
    moves: [
      { intent: 'debuff', label: '噪音', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }, { kind: 'statusPlayer', name: '翻肚', amount: 1 }] },
      { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 8 }] },
      { intent: 'special', label: '吸走', effects: [{ kind: 'discardRandomHand', n: 1 }] },
    ] },
  { id: 'black_ninja', name: '黑貓忍者', hp: [36, 40], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_black_ninja',
    line: '同行，別擋路。',
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '二連斬', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'attack', label: '手裡劍', effects: [{ kind: 'damage', amount: 9 }] },
    ] },
  { id: 'orange_bandit', name: '橘貓山賊', hp: [48, 52], pool: '中', pattern: 'cycle', size: 'medium', art: 'codex/monster_orange_bandit',
    line: '留下買路財！',
    moves: [
      { intent: 'special', label: '搶劫', effects: [{ kind: 'stealFish', n: 10 }] },
      { intent: 'attack', label: '掄棒', effects: [{ kind: 'damage', amount: 10 }] },
      { intent: 'block', label: '擋', effects: [{ kind: 'block', amount: 8 }] },
      { intent: 'special', label: '搶劫', effects: [{ kind: 'stealFish', n: 10 }] },
      { intent: 'special', label: '逃走', effects: [{ kind: 'escape' }] },
    ] },
  { id: 'catgrass_bug', name: '貓草蟲', hp: [18, 22], pool: '中', pattern: 'cycle', size: 'small', art: 'codex/monster_catgrass_bug',
    line: '嘶——',
    moves: [
      { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 5 }] },
      { intent: 'debuff', label: '吐', effects: [{ kind: 'statusPlayer', name: '噎到', amount: 2 }] },
    ] },

  // ===== 強池 =====
  { id: 'scarecrow', name: '稻草人守衛', hp: [55, 60], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_scarecrow',
    line: '塔主有令，閒貓勿入。',
    moves: [
      { intent: 'attack', label: '重劈', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '架起', effects: [{ kind: 'block', amount: 10 }] },
      { intent: 'buff', label: '蓄力', effects: [{ kind: 'statusSelf', name: '爪力', amount: 2 }] },
    ] },
  { id: 'black_ninja_elite', name: '黑貓忍者（老手）', hp: [36, 40], pool: '強', pattern: 'cycle', size: 'medium', art: 'codex/monster_black_ninja',
    line: '兩個打一個，不算欺負。',
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 1 }] },
      { intent: 'attack', label: '二連斬', effects: [{ kind: 'damage', amount: 6, times: 2 }] },
      { intent: 'attack', label: '手裡劍', effects: [{ kind: 'damage', amount: 9 }] },
    ] },
  { id: 'big_cucumber', name: '大黃瓜怪', hp: [70, 70], pool: '強', pattern: 'cycle', size: 'large', art: 'codex/monster_big_cucumber',
    line: '（比較大根，還是安靜地躺著）',
    moves: [
      { intent: 'debuff', label: '嚇人', effects: [{ kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 11 }] },
      { intent: 'attack', label: '翻滾', effects: [{ kind: 'damage', amount: 6 }, { kind: 'statusPlayer', name: '翻肚', amount: 1 }] },
    ] },

  // ===== 大魔物 =====
  { id: 'ninja_boss', name: '黑貓忍者頭目', hp: [90, 90], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_ninja_boss',
    line: '上面那位，不是你認識的那隻貓了。',
    moves: [
      { intent: 'buff', label: '隱身', effects: [{ kind: 'statusSelf', name: '隱身', amount: 2 }] },
      { intent: 'summon', label: '分身', effects: [{ kind: 'summon', enemyId: 'black_kitten', n: 2 }] },
      { intent: 'attack', label: '連擊', effects: [{ kind: 'damage', amount: 7, times: 2 }] },
      { intent: 'attack', label: '手裡劍雨', effects: [{ kind: 'damage', amount: 12 }] },
    ] },
  { id: 'giant_onigiri', name: '巨型飯糰', hp: [110, 110], pool: '大魔物', pattern: 'cycle', size: 'large', art: 'codex/monster_giant_onigiri',
    line: '好、好重……', onDeathHealPlayer: 10,
    moves: [
      { intent: 'block', label: '結成飯糰', effects: [{ kind: 'block', amount: 12 }] },
      { intent: 'attack', label: '壓扁', effects: [{ kind: 'damage', amount: 14 }] },
      { intent: 'debuff', label: '黏住', effects: [{ kind: 'statusPlayer', name: '懶洋洋', amount: 2 }, { kind: 'statusPlayer', name: '炸毛', amount: 2 }] },
    ] },

  // ===== 召喚 =====
  { id: 'black_kitten', name: '小黑貓', hp: [10, 10], pool: '召喚', pattern: 'cycle', size: 'small', art: 'codex/monster_black_kitten',
    line: '喵嗚！', moves: [{ intent: 'attack', label: '抓', effects: [{ kind: 'damage', amount: 3 }] }] },

  // ===== 塔主 =====
  { id: 'tower_master', name: '走火入魔的大俠貓', hp: [160, 160], pool: '塔主', pattern: 'cycle', size: 'large', art: 'daxia',
    line: '難逢敵手。',
    moves: [
      { intent: 'buff', label: '蓄力', effects: [{ kind: 'chargeNext' }] },
      { intent: 'attack', label: '鐵頭功', effects: [{ kind: 'damage', amount: 12 }] },
      { intent: 'block', label: '金鐘罩', effects: [{ kind: 'block', amount: 15 }] },
      { intent: 'attack', label: '獅吼功', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '懶洋洋', amount: 2 }] },
    ],
    phases: [{
      hpBelow: 80, line: '走火入魔', pattern: 'cycle', strengthPerTurn: 1,
      onEnter: [{ kind: 'block', amount: 20 }],
      moves: [
        { intent: 'attack', label: '醉拳', effects: [{ kind: 'damageRandom', min: 6, max: 16 }] },
        { intent: 'attack', label: '鐵砂掌', effects: [{ kind: 'damage', amount: 8 }, { kind: 'statusPlayer', name: '噎到', amount: 3 }] },
        { intent: 'attack', label: '鐵頭功', effects: [{ kind: 'damage', amount: 14 }] },
        { intent: 'block', label: '閉關', effects: [{ kind: 'block', amount: 18 }] },
      ],
    }] },
];

export const enemyById: Record<string, EnemyDef> = Object.fromEntries(enemies.map((e) => [e.id, e]));

export const encounters: EncounterDef[] = [
  { id: 'rats2', pool: '弱', enemies: ['rat', 'rat'] },
  { id: 'rats3', pool: '弱', enemies: ['rat', 'rat', 'rat'] },
  { id: 'cucumber', pool: '弱', enemies: ['cucumber'] },
  { id: 'onigiri_monster', pool: '弱', enemies: ['onigiri_monster'] },
  { id: 'wood_dummy', pool: '弱', enemies: ['wood_dummy'] },
  { id: 'goat', pool: '弱', enemies: ['goat'] },
  { id: 'vacuum', pool: '中', enemies: ['vacuum'] },
  { id: 'black_ninja', pool: '中', enemies: ['black_ninja'] },
  { id: 'orange_bandit', pool: '中', enemies: ['orange_bandit'] },
  { id: 'catgrass_bugs', pool: '中', enemies: ['catgrass_bug', 'catgrass_bug'] },
  { id: 'scarecrow', pool: '強', enemies: ['scarecrow'] },
  { id: 'black_ninja_duo', pool: '強', enemies: ['black_ninja_elite', 'black_ninja_elite'] },
  { id: 'big_cucumber', pool: '強', enemies: ['big_cucumber'] },
  { id: 'ninja_boss', pool: '大魔物', enemies: ['ninja_boss'] },
  { id: 'giant_onigiri', pool: '大魔物', enemies: ['giant_onigiri'] },
  { id: 'tower_master', pool: '塔主', enemies: ['tower_master'] },
];

export const encounterById: Record<string, EncounterDef> = Object.fromEntries(encounters.map((e) => [e.id, e]));

export function encountersOfPool(pool: EnemyPool): EncounterDef[] {
  return encounters.filter((e) => e.pool === pool);
}
```

- [ ] **Step 4: 跑測試、型別檢查、提交**

Run: `npm test -- tests/content/enemies.test.ts`　Expected: 5 passed。`npx tsc --noEmit` 無錯誤。
```bash
git add src/content/enemies.ts tests/content/enemies.test.ts
git commit -m "資料：魔物、大魔物、塔主與遭遇表"
```

---

### Task 7: 事件與對白資料 `events.ts`、`dialogue.ts`

**Files:**
- Create: `src/content/events.ts`, `src/content/dialogue.ts`
- Test: `tests/content/events.test.ts`, `tests/content/dialogue.test.ts`

**Interfaces:**
- Produces: `export const events: EventDef[]`、`eventById`、`export const FIXED_EVENT_FLOOR_5 = 'daxia_teach'`；`export const dialogue`（結構見 Step 5）、`export function qiuqiuLineOk(text: string): boolean`（句尾喵檢查，畫面與測試共用）。
- 規則：`EventChoice.label` 是按鈕上的動作（不加喵）；`result` 是選完後的一段敘述，裡面若有球球講話，寫成 `球球：「……喵」`。

- [ ] **Step 1: 寫失敗測試 `tests/content/events.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { encounterById } from '../../src/content/enemies';
import { FIXED_EVENT_FLOOR_5, eventById, events } from '../../src/content/events';

describe('事件資料', () => {
  it('10 個事件、id 不重複、每個 1～3 個選項', () => {
    expect(events.length).toBe(10);
    expect(new Set(events.map((e) => e.id)).size).toBe(10);
    for (const e of events) {
      expect(eventById[e.id]).toBe(e);
      expect(e.choices.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.choices.length, e.id).toBeLessThanOrEqual(3);
      expect(e.text.length, e.id).toBeGreaterThan(10);
    }
  });
  it('只有大俠傳功固定在 5F', () => {
    expect(eventById[FIXED_EVENT_FLOOR_5]?.fixedFloor).toBe(5);
    expect(events.filter((e) => e.fixedFloor !== undefined).length).toBe(1);
  });
  it('引用的牌、遭遇都存在；花費為正', () => {
    for (const e of events) for (const c of e.choices) {
      if (c.costFish !== undefined) expect(c.costFish, e.id).toBeGreaterThan(0);
      expect(c.result.length, e.id).toBeGreaterThan(0);
      const walk = (fx: typeof c.outcome) => {
        for (const o of fx) {
          if (o.kind === 'addCard') expect(cardById[o.cardId], `${e.id} addCard`).toBeTruthy();
          if (o.kind === 'fight') expect(encounterById[o.encounterId], `${e.id} fight`).toBeTruthy();
          if (o.kind === 'gamble') { walk(o.win); walk(o.lose); }
        }
      };
      walk(c.outcome);
    }
  });
  it('結果裡球球講的話句尾是喵', () => {
    for (const e of events) for (const c of e.choices) {
      const m = c.result.match(/球球：「([^」]+)」/g) ?? [];
      for (const q of m) expect(q.replace(/[！？。…～」]+$/u, ''), `${e.id}: ${q}`).toMatch(/喵$/u);
    }
  });
});
```

- [ ] **Step 2: 寫失敗測試 `tests/content/dialogue.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { enemies } from '../../src/content/enemies';
import { dialogue, qiuqiuLineOk } from '../../src/content/dialogue';

const DAXIA_TITLES = ['難逢敵手', '走火入魔', '退隱江湖', '閉關', '承讓', '重出江湖', '深藏不露', '在下不才', '來也'];

describe('對白', () => {
  it('句尾喵檢查函式', () => {
    expect(qiuqiuLineOk('參上！球球來也喵！')).toBe(true);
    expect(qiuqiuLineOk('先睡了喵……')).toBe(true);
    expect(qiuqiuLineOk('我來了')).toBe(false);
  });
  it('球球每一句都以喵結尾；旁白不加喵', () => {
    const groups = [dialogue.prologue, dialogue.secretScroll, dialogue.afterFirstElite, dialogue.restBeforeBoss,
      dialogue.bossIntro, dialogue.bossPhase2, dialogue.victory, dialogue.defeat];
    for (const g of groups) for (const l of g) {
      if (l.speaker === '球球') expect(qiuqiuLineOk(l.text), l.text).toBe(true);
      if (l.speaker === '旁白') expect(qiuqiuLineOk(l.text), l.text).toBe(false);
    }
    for (const s of [...dialogue.battleStart, ...dialogue.battleWin, ...dialogue.restLines,
      dialogue.hungry, dialogue.lowHp, dialogue.chestLine, dialogue.victoryTeaser]) expect(qiuqiuLineOk(s), s).toBe(true);
    for (const s of Object.values(dialogue.firstMeet)) expect(qiuqiuLineOk(s), s).toBe(true);
  });
  it('每種魔物都有初見吐槽', () => {
    for (const e of enemies) expect(dialogue.firstMeet[e.id], e.id).toBeTruthy();
  });
  it('塔主只講大俠貼圖標題', () => {
    const groups = [dialogue.bossIntro, dialogue.bossPhase2, dialogue.victory];
    for (const g of groups) for (const l of g) if (l.speaker === '塔主') expect(DAXIA_TITLES, l.text).toContain(l.text.replace(/[。！]$/u, ''));
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm test -- tests/content/events.test.ts tests/content/dialogue.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 4: 寫 `src/content/events.ts`（全文，內容照規格 §6.5）**

```ts
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
```

- [ ] **Step 5: 寫 `src/content/dialogue.ts`（全文）**

```ts
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
    { speaker: '旁白', text: '球球躺平了。' },
    { speaker: '球球', text: '先睡了喵……' },
    { speaker: '旁白', text: '夢裡有人把牠扛回村子。醒來，塔還在。' },
  ],
  shopkeeper: ['賒帳？貓沒有在賒帳的。', '不買不要摸。', '小魚乾要數清楚，我不找零。'],
  restLines: ['貓窩暖暖的，先睡一下喵。', '磨一磨爪子，等一下才好用喵。'],
  chestLine: '紙箱！一定要鑽進去喵。',
};
```

- [ ] **Step 6: 跑測試、型別檢查、提交**

Run: `npm test -- tests/content/events.test.ts tests/content/dialogue.test.ts`　Expected: 8 passed。`npx tsc --noEmit` 無錯誤。
```bash
git add src/content/events.ts src/content/dialogue.ts tests/content/events.test.ts tests/content/dialogue.test.ts
git commit -m "資料：10 個事件與全部對白（球球句尾喵）"
```

---

### Task 8: 狀態效果與牌堆 `statuses.ts`、`deck.ts`

**Files:**
- Create: `src/engine/statuses.ts`, `src/engine/deck.ts`, `tests/helpers.ts`
- Test: `tests/engine/statuses.test.ts`, `tests/engine/deck.test.ts`

**Interfaces:**
- Produces（後面任務照這些名字呼叫）：
  ```ts
  // statuses.ts
  export function getStatus(u: Unit, name: StatusName): number
  export function addStatus(u: Unit, name: StatusName, amount: number): void   // 可負；≤0 就刪鍵
  export function removeStatus(u: Unit, name: StatusName): void
  export function decayTurnStatuses(u: Unit): void                             // 翻肚／懶洋洋／炸毛 各 −1
  export function tickPoison(u: Unit): number                                   // 噎到：直接扣 hp（不看蜷縮）N，層數 −1；回傳 N
  export function computeAttack(base: number, attacker: Unit, defender: Unit, opts?: { noStrength?: boolean }): number
  export function computeBlock(base: number, u: Unit): number
  // deck.ts
  export const HAND_LIMIT = 10
  export function cardStats(inst: CardInstance): { def: CardDef; name: string; cost: number; effects: Effect[]; keywords: Keyword[] }
  export function draw(p: PlayerCombat, n: number, rng: Rng): CardInstance[]   // 抽到的牌；抽牌堆空就把棄牌堆洗回；手牌滿 10 停
  export function discardHand(p: PlayerCombat): void                            // 保留者留下（keywords 含「保留」或 uid 在 p.retained）；清空 p.retained
  export function moveCard(p: PlayerCombat, uid: number, to: 'hand' | 'discard' | 'exhaust' | 'drawTop' | 'drawBottom'): boolean
  export function findCard(p: PlayerCombat, uid: number): { pile: 'hand' | 'discard' | 'exhaust' | 'draw'; card: CardInstance } | undefined
  // tests/helpers.ts
  export function blankUnit(hp?: number): Unit
  export function blankPlayer(deckIds?: string[]): PlayerCombat   // 全部牌放在 drawPile，uid 從 1 起
  export function inst(cardId: string, uid: number, upgraded?: boolean): CardInstance
  ```
- 公式（規格 §5.2）：攻擊＝floor((base＋爪力) × (攻擊者懶洋洋? 0.75) × (受擊者翻肚? 1.5))；蜷縮＝floor((base＋貓步) × (炸毛? 0.75))。`noStrength`＝忍具傷害不吃爪力。

- [ ] **Step 1: 寫 `tests/helpers.ts`**

```ts
import type { CardInstance, PlayerCombat, Unit } from '../src/engine/types';

export function blankUnit(hp = 50): Unit {
  return { hp, maxHp: hp, block: 0, statuses: {} };
}

export function inst(cardId: string, uid: number, upgraded = false): CardInstance {
  return { uid, cardId, upgraded };
}

export function blankPlayer(deckIds: string[] = []): PlayerCombat {
  return {
    hp: 70, maxHp: 70, block: 0, statuses: {},
    energy: 3, maxEnergy: 3,
    hand: [], drawPile: deckIds.map((id, i) => inst(id, i + 1)), discardPile: [], exhaustPile: [],
    retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
    noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
    firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false,
  };
}
```

- [ ] **Step 2: 寫失敗測試 `tests/engine/statuses.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { addStatus, computeAttack, computeBlock, decayTurnStatuses, getStatus, removeStatus, tickPoison } from '../../src/engine/statuses';
import { blankUnit } from '../helpers';

describe('狀態效果', () => {
  it('加減與歸零刪鍵', () => {
    const u = blankUnit();
    addStatus(u, '爪力', 2); expect(getStatus(u, '爪力')).toBe(2);
    addStatus(u, '爪力', -2); expect(u.statuses['爪力']).toBeUndefined();
    addStatus(u, '隱身', 1); removeStatus(u, '隱身'); expect(getStatus(u, '隱身')).toBe(0);
  });
  it('回合衰減只影響翻肚／懶洋洋／炸毛', () => {
    const u = blankUnit();
    addStatus(u, '翻肚', 2); addStatus(u, '懶洋洋', 1); addStatus(u, '炸毛', 1); addStatus(u, '爪力', 3); addStatus(u, '隱身', 2);
    decayTurnStatuses(u);
    expect(getStatus(u, '翻肚')).toBe(1); expect(getStatus(u, '懶洋洋')).toBe(0); expect(getStatus(u, '炸毛')).toBe(0);
    expect(getStatus(u, '爪力')).toBe(3); expect(getStatus(u, '隱身')).toBe(2);
  });
  it('噎到直接扣血、層數減一', () => {
    const u = blankUnit(20); u.block = 5; addStatus(u, '噎到', 3);
    expect(tickPoison(u)).toBe(3);
    expect(u.hp).toBe(17); expect(u.block).toBe(5); expect(getStatus(u, '噎到')).toBe(2);
    expect(tickPoison(blankUnit())).toBe(0);
  });
  it('攻擊公式：爪力→懶洋洋→翻肚→捨去', () => {
    const a = blankUnit(), d = blankUnit();
    expect(computeAttack(6, a, d)).toBe(6);
    addStatus(a, '爪力', 2); expect(computeAttack(6, a, d)).toBe(8);
    addStatus(a, '懶洋洋', 1); expect(computeAttack(6, a, d)).toBe(6);      // 8×0.75＝6
    addStatus(d, '翻肚', 1); expect(computeAttack(6, a, d)).toBe(9);        // 8×0.75×1.5＝9
    expect(computeAttack(6, a, d, { noStrength: true })).toBe(6);           // 6×0.75×1.5＝6.75→6
  });
  it('蜷縮公式：貓步→炸毛→捨去', () => {
    const u = blankUnit();
    addStatus(u, '貓步', 2); expect(computeBlock(5, u)).toBe(7);
    addStatus(u, '炸毛', 1); expect(computeBlock(5, u)).toBe(5);            // 7×0.75＝5.25→5
  });
});
```

- [ ] **Step 3: 寫失敗測試 `tests/engine/deck.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { HAND_LIMIT, cardStats, discardHand, draw, findCard, moveCard } from '../../src/engine/deck';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';

describe('牌堆', () => {
  it('cardStats：升級版覆蓋費用／效果／關鍵字', () => {
    expect(cardStats(inst('sanjo', 1)).effects).toEqual([{ kind: 'damage', amount: 6 }]);
    expect(cardStats(inst('sanjo', 1, true)).effects).toEqual([{ kind: 'damage', amount: 9 }]);
    expect(cardStats(inst('shuaiguo', 2)).cost).toBe(1);
    expect(cardStats(inst('shuaiguo', 2, true)).cost).toBe(0);
    expect(cardStats(inst('taxue', 3)).keywords).toEqual(['消耗']);
    expect(cardStats(inst('taxue', 3, true)).keywords).toEqual([]);
    expect(cardStats(inst('sanjo', 1, true)).name).toBe('參上＋');
  });
  it('抽牌：抽牌堆空時把棄牌堆洗回，同種子同順序', () => {
    const rng = new Rng(seedFromString('deck'));
    const p = blankPlayer(['sanjo', 'sanjo', 'tanding']);
    p.discardPile = [inst('kawarimi', 9), inst('qianliyan', 10)];
    const got = draw(p, 5, rng);
    expect(got.length).toBe(5);
    expect(p.hand.length).toBe(5); expect(p.drawPile.length).toBe(0); expect(p.discardPile.length).toBe(0);
    const rng2 = new Rng(seedFromString('deck'));
    const q = blankPlayer(['sanjo', 'sanjo', 'tanding']);
    q.discardPile = [inst('kawarimi', 9), inst('qianliyan', 10)];
    expect(draw(q, 5, rng2).map((c) => c.uid)).toEqual(got.map((c) => c.uid));
  });
  it('手牌上限 10，多的留在抽牌堆', () => {
    const p = blankPlayer(Array(15).fill('sanjo'));
    draw(p, 12, new Rng(seedFromString('x')));
    expect(p.hand.length).toBe(HAND_LIMIT); expect(p.drawPile.length).toBe(5);
  });
  it('抽到「內力不足」失去 1 顆飯糰', () => {
    const p = blankPlayer(['neili']);
    draw(p, 1, new Rng(seedFromString('x')));
    expect(p.energy).toBe(2);
    p.energy = 0; p.drawPile = [inst('neili', 5)];
    draw(p, 1, new Rng(seedFromString('x')));
    expect(p.energy).toBe(0);
  });
  it('棄手牌：保留關鍵字與 retained 名單留下', () => {
    const p = blankPlayer();
    p.hand = [inst('sanjo', 1), inst('tanding', 2), inst('sanjo', 3)];
    p.retained = [2];
    discardHand(p);
    expect(p.hand.map((c) => c.uid)).toEqual([2]);
    expect(p.discardPile.map((c) => c.uid)).toEqual([1, 3]);
    expect(p.retained).toEqual([]);
  });
  it('moveCard 與 findCard', () => {
    const p = blankPlayer(['sanjo', 'tanding']);
    expect(findCard(p, 1)?.pile).toBe('draw');
    expect(moveCard(p, 1, 'hand')).toBe(true); expect(findCard(p, 1)?.pile).toBe('hand');
    expect(moveCard(p, 1, 'exhaust')).toBe(true); expect(p.exhaustPile.length).toBe(1);
    expect(moveCard(p, 2, 'drawTop')).toBe(true); expect(p.drawPile[0]?.uid).toBe(2);
    expect(moveCard(p, 99, 'hand')).toBe(false);
  });
});
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `npm test -- tests/engine/statuses.test.ts tests/engine/deck.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 5: 寫 `src/engine/statuses.ts`**

```ts
import { TURN_DECAY, type StatusName, type Unit } from './types';

export function getStatus(u: Unit, name: StatusName): number {
  return u.statuses[name] ?? 0;
}

export function addStatus(u: Unit, name: StatusName, amount: number): void {
  const v = getStatus(u, name) + amount;
  if (v <= 0) delete u.statuses[name];
  else u.statuses[name] = v;
}

export function removeStatus(u: Unit, name: StatusName): void {
  delete u.statuses[name];
}

export function decayTurnStatuses(u: Unit): void {
  for (const name of TURN_DECAY) if (getStatus(u, name) > 0) addStatus(u, name, -1);
}

export function tickPoison(u: Unit): number {
  const n = getStatus(u, '噎到');
  if (n <= 0) return 0;
  u.hp = Math.max(0, u.hp - n);
  addStatus(u, '噎到', -1);
  return n;
}

export function computeAttack(base: number, attacker: Unit, defender: Unit, opts: { noStrength?: boolean } = {}): number {
  let v = base + (opts.noStrength ? 0 : getStatus(attacker, '爪力'));
  if (getStatus(attacker, '懶洋洋') > 0) v *= 0.75;
  if (getStatus(defender, '翻肚') > 0) v *= 1.5;
  return Math.max(0, Math.floor(v));
}

export function computeBlock(base: number, u: Unit): number {
  let v = base + getStatus(u, '貓步');
  if (getStatus(u, '炸毛') > 0) v *= 0.75;
  return Math.max(0, Math.floor(v));
}
```

- [ ] **Step 6: 寫 `src/engine/deck.ts`**

```ts
import { cardById } from '../content/cards';
import type { Rng } from './rng';
import type { CardDef, CardInstance, Effect, Keyword, PlayerCombat } from './types';

export const HAND_LIMIT = 10;

export function cardStats(inst: CardInstance): { def: CardDef; name: string; cost: number; effects: Effect[]; keywords: Keyword[] } {
  const def = cardById[inst.cardId];
  if (!def) throw new Error(`未知的牌：${inst.cardId}`);
  if (!inst.upgraded) return { def, name: def.name, cost: def.cost, effects: def.effects, keywords: def.keywords ?? [] };
  const u = def.upgrade;
  return {
    def,
    name: def.name + '＋',
    cost: u.cost ?? def.cost,
    effects: u.effects ?? def.effects,
    keywords: u.keywords ?? def.keywords ?? [],
  };
}

function reshuffle(p: PlayerCombat, rng: Rng): void {
  p.drawPile = rng.shuffle(p.discardPile);
  p.discardPile = [];
}

export function draw(p: PlayerCombat, n: number, rng: Rng): CardInstance[] {
  const got: CardInstance[] = [];
  for (let i = 0; i < n; i++) {
    if (p.hand.length >= HAND_LIMIT) break;
    if (p.drawPile.length === 0) {
      if (p.discardPile.length === 0) break;
      reshuffle(p, rng);
    }
    const c = p.drawPile.shift() as CardInstance;
    p.hand.push(c);
    got.push(c);
    if (cardById[c.cardId]?.curse?.onDraw === 'loseEnergy') p.energy = Math.max(0, p.energy - 1);
  }
  return got;
}

export function discardHand(p: PlayerCombat): void {
  const keep: CardInstance[] = [];
  for (const c of p.hand) {
    const retain = cardStats(c).keywords.includes('保留') || p.retained.includes(c.uid);
    if (retain) keep.push(c); else p.discardPile.push(c);
  }
  p.hand = keep;
  p.retained = [];
}

export function findCard(p: PlayerCombat, uid: number): { pile: 'hand' | 'discard' | 'exhaust' | 'draw'; card: CardInstance } | undefined {
  const piles = [['hand', p.hand], ['discard', p.discardPile], ['exhaust', p.exhaustPile], ['draw', p.drawPile]] as const;
  for (const [pile, arr] of piles) {
    const card = arr.find((c) => c.uid === uid);
    if (card) return { pile, card };
  }
  return undefined;
}

export function moveCard(p: PlayerCombat, uid: number, to: 'hand' | 'discard' | 'exhaust' | 'drawTop' | 'drawBottom'): boolean {
  const found = findCard(p, uid);
  if (!found) return false;
  const src = { hand: p.hand, discard: p.discardPile, exhaust: p.exhaustPile, draw: p.drawPile }[found.pile];
  src.splice(src.indexOf(found.card), 1);
  if (to === 'hand') p.hand.push(found.card);
  else if (to === 'discard') p.discardPile.push(found.card);
  else if (to === 'exhaust') p.exhaustPile.push(found.card);
  else if (to === 'drawTop') p.drawPile.unshift(found.card);
  else p.drawPile.push(found.card);
  return true;
}
```

- [ ] **Step 7: 跑測試、型別檢查、提交**

Run: `npm test -- tests/engine/statuses.test.ts tests/engine/deck.test.ts`　Expected: 11 passed。`npx tsc --noEmit` 無錯誤。
```bash
git add src/engine/statuses.ts src/engine/deck.ts tests/helpers.ts tests/engine/statuses.test.ts tests/engine/deck.test.ts
git commit -m "功能：狀態效果公式與牌堆操作"
```

---

### Task 9: 戰鬥核心 `actions.ts`、`combat.ts`、`effects.ts`（基本效果）

**Files:**
- Create: `src/engine/actions.ts`, `src/engine/combat.ts`, `src/engine/effects.ts`
- Test: `tests/engine/combat.test.ts`

**Interfaces:**
- Consumes: Task 3 型別、Task 8 的 `statuses.ts`／`deck.ts`、內容資料。
- Produces（計畫 B 的畫面與 Task 15 的機器人只呼叫這些）：
  ```ts
  // combat.ts
  export function startCombat(input: { hp: number; maxHp: number; deck: CardInstance[]; relics: string[]; potions: string[]; encounterId: string; rng: Rng }): CombatState
  export function startPlayerTurn(cs: CombatState): void
  export function canPlay(cs: CombatState, uid: number, targetUid?: number): { ok: true; cost: number } | { ok: false; reason: string }
  export function playCard(cs: CombatState, uid: number, targetUid?: number): boolean
  export function endTurn(cs: CombatState): void
  export function usePotion(cs: CombatState, potionId: string, targetUid?: number): boolean      // Task 10
  export function resolveChoice(cs: CombatState, chosenUids: number[]): boolean                 // Task 10
  export function combatResult(cs: CombatState): { hp: number; fishDelta: number; kills: number; potions: string[] }
  // actions.ts（引擎內部共用）
  export function log(cs, msg): void
  export function aliveEnemies(cs): EnemyCombat[]
  export function findEnemy(cs, uid): EnemyCombat | undefined
  export function hasRelic(cs, id): boolean
  export function gainBlock(cs, u: Unit, base: number): number
  export function gainStealth(cs, n: number): void                       // 含紙袋加成
  export function healPlayer(cs, n: number): number
  export function drawCards(cs, n: number): CardInstance[]
  export function damagePlayer(cs, attacker: Unit, base: number, opts?: { direct?: boolean }): number
  export function damageEnemy(cs, e: EnemyCombat, base: number, opts?: { ignoreBlock?: boolean; noStrength?: boolean; direct?: boolean }): { dealt: number; killed: boolean }
  export function makeEnemy(cs, enemyId: string, index: number): EnemyCombat
  export function runEnemyEffects(cs, e: EnemyCombat, effects: EnemyEffect[], charged: boolean): void
  export function advanceMove(cs, e: EnemyCombat): void
  // effects.ts
  export function applyEffects(cs: CombatState, effects: Effect[], ctx: EffectCtx): void   // 遇到要選牌就設 cs.pending 後返回
  ```
- 規則摘要（規格 §5）：能力牌與「消耗」牌打出後進 exhaustPile；其他進 discardPile。同種魔物第 k 隻從第 k 個動作開始。魔物有「定身」時，牠的攻擊動作整個跳過並消耗定身。蓄力（charged）讓下一次攻擊的牌面值 ×2。逃走的魔物不算擊倒、偷走的小魚乾不退。`actions.ts` 與 `effects.ts` 互相引用，但只在函式內使用對方的匯出，ESM 允許。

- [ ] **Step 1: 寫失敗測試 `tests/engine/combat.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { canPlay, combatResult, endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function deck(ids: string[]): CardInstance[] { return ids.map((id, i) => inst(id, i + 1)); }
function start(encounterId: string, ids: string[] = STARTER_DECK, seed = 's', relics = ['blue_headband'], hp = 70): CombatState {
  return startCombat({ hp, maxHp: 70, deck: deck(ids), relics, potions: [], encounterId, rng: new Rng(seedFromString(seed)) });
}
/** 把指定牌放到手牌最前面（測試用） */
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) {
    const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1);
  }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('開戰與回合開始', () => {
  it('魔物生命在區間內、同種第 k 隻從第 k 個動作開始', () => {
    const cs = start('rats3');
    expect(cs.enemies.length).toBe(3);
    for (const e of cs.enemies) { expect(e.hp).toBeGreaterThanOrEqual(12); expect(e.hp).toBeLessThanOrEqual(15); }
    expect(cs.enemies.map((e) => e.move.label)).toEqual(['啃', '啃', '躲']);
  });
  it('第一回合：3 顆飯糰、抽 5＋藍頭巾 1', () => {
    const cs = start('cucumber');
    expect(cs.turn).toBe(1);
    expect(cs.player.energy).toBe(3);
    expect(cs.player.hand.length).toBe(6);
    expect(cs.player.drawPile.length).toBe(4);
  });
  it('同種子同結果', () => {
    const a = start('rats2', STARTER_DECK, 'same'); const b = start('rats2', STARTER_DECK, 'same');
    expect(a.player.hand.map((c) => c.uid)).toEqual(b.player.hand.map((c) => c.uid));
    expect(a.enemies.map((e) => e.hp)).toEqual(b.enemies.map((e) => e.hp));
  });
});

describe('出牌', () => {
  it('參上打 6、扣飯糰、牌進棄牌堆', () => {
    const cs = start('cucumber');
    const uid = toHand(cs, 'sanjo');
    const e = cs.enemies[0]!; const hp = e.hp;
    expect(playCard(cs, uid, e.uid)).toBe(true);
    expect(e.hp).toBe(hp - 6);
    expect(cs.player.energy).toBe(2);
    expect(cs.player.discardPile.some((c) => c.uid === uid)).toBe(true);
    expect(cs.player.cardsPlayedThisTurn).toBe(1);
  });
  it('飯糰不夠不能出；0 費可以出', () => {
    const cs = start('cucumber');
    cs.player.energy = 0;
    const uid = toHand(cs, 'sanjo');
    expect(canPlay(cs, uid, cs.enemies[0]!.uid)).toEqual({ ok: false, reason: '餓扁了' });
    expect(playCard(cs, uid, cs.enemies[0]!.uid)).toBe(false);
    const k = toHand(cs, 'kawarimi');
    expect(playCard(cs, k)).toBe(true);
    expect(getStatus(cs.player, '隱身')).toBe(1);
  });
  it('淡定給蜷縮 5；蜷縮先扛魔物攻擊', () => {
    const cs = start('cucumber');
    playCard(cs, toHand(cs, 'tanding'));
    expect(cs.player.block).toBe(5);
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.player.hp).toBe(68);
  });
  it('能力牌與消耗牌進消耗堆', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'jiejie', 'youcike']);
    cs.player.energy = 3;
    const j = toHand(cs, 'jiejie'); playCard(cs, j);
    const y = toHand(cs, 'youcike'); playCard(cs, y);
    expect(cs.player.exhaustPile.map((c) => c.uid).sort()).toEqual([j, y].sort());
    expect(cs.player.powers.length).toBe(1);
  });
  it('攻擊牌被戰術撤退鎖住', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'zhanshu']);
    playCard(cs, toHand(cs, 'zhanshu'));
    expect(canPlay(cs, toHand(cs, 'sanjo'), cs.enemies[0]!.uid).ok).toBe(false);
  });
  it('分身術照連抓數打', () => {
    const cs = start('wood_dummy', [...STARTER_DECK, 'bunshin']);
    cs.player.energy = 5;
    playCard(cs, toHand(cs, 'kawarimi'));
    playCard(cs, toHand(cs, 'tanding'));
    const e = cs.enemies[0]!; e.block = 0; const hp = e.hp;
    playCard(cs, toHand(cs, 'bunshin'), e.uid);   // 連抓 2 → 3 次 × 3
    expect(e.hp).toBe(hp - 9);
  });
  it('擊倒最後一隻就勝利，飯糰怪回血', () => {
    const cs = start('onigiri_monster', STARTER_DECK, 's', [], 50);
    const e = cs.enemies[0]!; e.hp = 3;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(1);
    expect(cs.player.hp).toBe(53);
    expect(combatResult(cs).kills).toBe(1);
  });
});

describe('魔物回合', () => {
  it('意圖循環前進；隱身閃掉一段', () => {
    const cs = start('rats2');
    addStatus(cs.player, '隱身', 1);
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.turn).toBe(2);
    expect(cs.player.hp).toBe(hp - 4);                       // 第一隻被閃掉，第二隻打中 4
    expect(cs.enemies.map((e) => e.move.label)).toEqual(['啃', '躲']);
  });
  it('定身跳過攻擊並消耗', () => {
    const cs = start('cucumber');
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    addStatus(e, '定身', 1);
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hp).toBe(hp);
    expect(getStatus(e, '定身')).toBe(0);
  });
  it('蓄力讓下一次攻擊加倍', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    expect(e.move.label).toBe('蓄力');
    endTurn(cs);                       // 蓄力
    expect(e.charged).toBe(true);
    const hp = cs.player.hp;
    endTurn(cs);                       // 鐵頭功 12×2
    expect(cs.player.hp).toBe(hp - 24);
    expect(e.charged).toBe(false);
  });
  it('塔主掉到 80 以下進第二階段：蜷縮 20、每回合 +1 爪力', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    e.hp = 82; cs.player.energy = 3;
    addStatus(cs.player, '爪力', 10);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 16 傷 → 66
    expect(e.phase).toBe(1);
    expect(e.block).toBe(20);
    expect(e.move.label).toBe('醉拳');
    endTurn(cs);
    expect(getStatus(e, '爪力')).toBe(1);
  });
  it('召喚小黑貓；木樁人每 3 回合 +1 爪力', () => {
    const cs = start('ninja_boss');
    const e = cs.enemies[0]!;
    e.move = e.move.label === '分身' ? e.move : { intent: 'summon', label: '分身', effects: [{ kind: 'summon', enemyId: 'black_kitten', n: 2 }] };
    endTurn(cs);
    expect(cs.enemies.filter((x) => x.enemyId === 'black_kitten' && !x.dead).length).toBe(2);
    const d = start('wood_dummy');
    for (let i = 0; i < 3; i++) endTurn(d);
    expect(getStatus(d.enemies[0]!, '爪力')).toBe(1);
  });
  it('噎到在魔物回合開始扣血、能殺死魔物', () => {
    const cs = start('rats2');
    const e = cs.enemies[0]!; e.hp = 2; addStatus(e, '噎到', 3);
    endTurn(cs);
    expect(e.dead).toBe(true);
    expect(cs.kills).toBe(1);
  });
  it('山賊逃走：偷走的不退、不算擊倒、剩下沒魔物就結束', () => {
    const cs = start('orange_bandit');
    const e = cs.enemies[0]!;
    for (let i = 0; i < 5 && cs.phase === 'player'; i++) { cs.player.block = 99; endTurn(cs); }
    expect(e.escaped).toBe(true);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(0);
    expect(combatResult(cs).fishDelta).toBe(-20);
  });
  it('生命歸零就輸；木樁擋一次致命傷', () => {
    const cs = start('cucumber', STARTER_DECK, 's', ['wood_post'], 5);
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.player.hp).toBe(1); expect(cs.phase).toBe('player');
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.phase).toBe('lost');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/engine/combat.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫 `src/engine/actions.ts`**

```ts
import { enemyById } from '../content/enemies';
import { draw } from './deck';
import { applyEffects } from './effects';
import { addStatus, computeAttack, computeBlock, getStatus } from './statuses';
import type { CardInstance, CombatState, EnemyCombat, EnemyEffect, EnemyMove, EnemyPhase, Unit } from './types';

export function log(cs: CombatState, msg: string): void { cs.log.push(msg); }
export function aliveEnemies(cs: CombatState): EnemyCombat[] { return cs.enemies.filter((e) => !e.dead); }
export function findEnemy(cs: CombatState, uid: number): EnemyCombat | undefined { return cs.enemies.find((e) => e.uid === uid && !e.dead); }
export function hasRelic(cs: CombatState, id: string): boolean { return cs.relics.includes(id); }

export function gainBlock(cs: CombatState, u: Unit, base: number): number {
  const v = computeBlock(base, u);
  u.block += v;
  return v;
}

export function gainStealth(cs: CombatState, n: number): void {
  let amt = n;
  if (hasRelic(cs, 'paper_bag') && !cs.player.firstStealthGiven) amt += 1;
  cs.player.firstStealthGiven = true;
  addStatus(cs.player, '隱身', amt);
}

export function healPlayer(cs: CombatState, n: number): number {
  const p = cs.player; const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  return p.hp - before;
}

export function drawCards(cs: CombatState, n: number): CardInstance[] { return draw(cs.player, n, cs.rng); }

/** 魔物（或自傷）打球球。direct＝不看隱身、不看蜷縮、不套公式（自傷、噎到、壞毛病用） */
export function damagePlayer(cs: CombatState, attacker: Unit, base: number, opts: { direct?: boolean } = {}): number {
  const p = cs.player;
  let lose: number;
  if (opts.direct) {
    lose = base;
  } else {
    if (p.immune) { log(cs, '球球躲在角落，什麼都沒看到'); return 0; }
    if (getStatus(p, '隱身') > 0) { addStatus(p, '隱身', -1); log(cs, '球球閃過了'); return 0; }
    const dmg = computeAttack(base, attacker, p);
    const absorbed = Math.min(p.block, dmg);
    p.block -= absorbed;
    lose = dmg - absorbed;
    const thorns = getStatus(p, '反彈');
    if (dmg > 0 && thorns > 0 && attacker !== p) {
      const e = cs.enemies.find((x) => x === attacker);
      if (e) damageEnemy(cs, e, thorns, { direct: true });
    }
  }
  p.hp -= lose;
  if (p.hp <= 0) {
    if (hasRelic(cs, 'wood_post') && !p.lethalPrevented) { p.hp = 1; p.lethalPrevented = true; log(cs, '木樁替球球挨了這一下'); }
    else { p.hp = 0; cs.phase = 'lost'; }
  }
  return lose;
}

function currentPhase(e: EnemyCombat): EnemyPhase | undefined {
  return enemyById[e.enemyId]?.phases?.[e.phase - 1];
}
function moveSet(e: EnemyCombat): { moves: EnemyMove[]; pattern: 'cycle' | 'random' } {
  const def = enemyById[e.enemyId]!;
  const ph = currentPhase(e);
  return ph ? { moves: ph.moves, pattern: ph.pattern } : { moves: def.moves, pattern: def.pattern };
}

export function advanceMove(cs: CombatState, e: EnemyCombat): void {
  const { moves, pattern } = moveSet(e);
  if (pattern === 'random') { e.move = cs.rng.pick(moves); return; }
  e.moveIndex = (e.moveIndex + 1) % moves.length;
  e.move = moves[e.moveIndex] as EnemyMove;
}

function checkPhase(cs: CombatState, e: EnemyCombat): void {
  const def = enemyById[e.enemyId]!;
  const next = def.phases?.[e.phase];
  if (!next || e.hp >= next.hpBelow || e.dead) return;
  e.phase += 1;
  e.moveIndex = 0;
  if (next.line) log(cs, `${e.name}：${next.line}`);
  runEnemyEffects(cs, e, next.onEnter, false);
  e.move = next.pattern === 'random' ? cs.rng.pick(next.moves) : (next.moves[0] as EnemyMove);
}

function killEnemy(cs: CombatState, e: EnemyCombat): void {
  e.dead = true;
  cs.kills += 1;
  const def = enemyById[e.enemyId]!;
  if (def.onDeathHealPlayer) healPlayer(cs, def.onDeathHealPlayer);
  if (e.stolen > 0) { cs.fishDelta += e.stolen; cs.stolenFish -= e.stolen; e.stolen = 0; }
  for (const pw of cs.player.powers) if (pw.trigger === 'onKill') applyEffects(cs, pw.effects, { source: 'power' });
  if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won';
}

export function damageEnemy(cs: CombatState, e: EnemyCombat, base: number,
  opts: { ignoreBlock?: boolean; noStrength?: boolean; direct?: boolean } = {}): { dealt: number; killed: boolean } {
  if (e.dead) return { dealt: 0, killed: false };
  let lose: number;
  if (opts.direct) {
    lose = base;
  } else {
    if (getStatus(e, '隱身') > 0) { addStatus(e, '隱身', -1); log(cs, `${e.name}閃過了`); return { dealt: 0, killed: false }; }
    const dmg = computeAttack(base, cs.player, e, { noStrength: opts.noStrength });
    if (opts.ignoreBlock) lose = dmg;
    else { const absorbed = Math.min(e.block, dmg); e.block -= absorbed; lose = dmg - absorbed; }
  }
  e.hp = Math.max(0, e.hp - lose);
  if (e.hp === 0) { killEnemy(cs, e); return { dealt: lose, killed: true }; }
  checkPhase(cs, e);
  return { dealt: lose, killed: false };
}

export function makeEnemy(cs: CombatState, enemyId: string, index: number): EnemyCombat {
  const def = enemyById[enemyId];
  if (!def) throw new Error(`未知的魔物：${enemyId}`);
  const hp = cs.rng.int(def.hp[0], def.hp[1]);
  const moveIndex = def.pattern === 'cycle' ? index % def.moves.length : 0;
  const move = def.pattern === 'cycle' ? (def.moves[moveIndex] as EnemyMove) : cs.rng.pick(def.moves);
  return {
    uid: cs.nextEnemyUid++, enemyId, name: def.name, hp, maxHp: hp, block: 0, statuses: {},
    moveIndex, turnCount: 0, phase: 0, charged: false, move, dead: false, escaped: false, stolen: 0,
  };
}

export function runEnemyEffects(cs: CombatState, e: EnemyCombat, effects: EnemyEffect[], charged: boolean): void {
  const p = cs.player;
  for (const fx of effects) {
    if (cs.phase === 'lost') return;
    switch (fx.kind) {
      case 'damage': {
        const base = fx.amount * (charged ? 2 : 1);
        for (let i = 0; i < (fx.times ?? 1); i++) { damagePlayer(cs, e, base); if (cs.phase === 'lost') return; }
        break;
      }
      case 'damageRandom': damagePlayer(cs, e, cs.rng.int(fx.min, fx.max) * (charged ? 2 : 1)); break;
      case 'block': gainBlock(cs, e, fx.amount); break;
      case 'statusSelf': addStatus(e, fx.name, fx.amount); break;
      case 'statusPlayer': addStatus(p, fx.name, fx.amount); break;
      case 'heal': e.hp = Math.min(e.maxHp, e.hp + fx.n); break;
      case 'stealFish': e.stolen += fx.n; cs.stolenFish += fx.n; cs.fishDelta -= fx.n; log(cs, `${e.name}偷走了 ${fx.n} 小魚乾`); break;
      case 'discardRandomHand': {
        for (let i = 0; i < fx.n && p.hand.length > 0; i++) {
          const c = cs.rng.pick(p.hand);
          p.hand.splice(p.hand.indexOf(c), 1); p.discardPile.push(c);
        }
        break;
      }
      case 'summon': {
        for (let i = 0; i < fx.n && aliveEnemies(cs).length < 5; i++) cs.enemies.push(makeEnemy(cs, fx.enemyId, i));
        break;
      }
      case 'chargeNext': e.charged = true; break;
      case 'escape': e.dead = true; e.escaped = true; log(cs, `${e.name}帶著小魚乾逃走了`);
        if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won'; break;
      case 'nothing': break;
    }
  }
}
```

- [ ] **Step 4: 寫 `src/engine/effects.ts`（本任務先做基本效果；要選牌的效果留給 Task 10 補）**

```ts
import { aliveEnemies, damageEnemy, damagePlayer, drawCards, findEnemy, gainBlock, gainStealth, healPlayer, log } from './actions';
import { endTurn } from './combat';
import { addStatus, getStatus } from './statuses';
import type { CombatState, Effect, EffectCtx } from './types';

/** 依序執行效果；需要玩家選牌時把剩下的效果存進 cs.pending 後返回（Task 10） */
export function applyEffects(cs: CombatState, effects: Effect[], ctx: EffectCtx): void {
  const queue = [...effects];
  while (queue.length > 0) {
    if (cs.phase !== 'player') return;
    const fx = queue.shift() as Effect;
    const paused = applyOne(cs, fx, ctx, queue);
    if (paused) return;
  }
}

function targetsOf(cs: CombatState, ctx: EffectCtx, all: boolean) {
  if (all) return aliveEnemies(cs);
  const t = ctx.targetUid === undefined ? undefined : findEnemy(cs, ctx.targetUid);
  return t ? [t] : [];
}

/** 回傳 true＝已暫停等待選牌 */
export function applyOne(cs: CombatState, fx: Effect, ctx: EffectCtx, queue: Effect[]): boolean {
  const p = cs.player;
  switch (fx.kind) {
    case 'damage': {
      const times = fx.scaleWithCombo ? Math.min((ctx.combo ?? 0) + 1, fx.comboCap ?? 99) : (fx.times ?? 1);
      const base = fx.amount * (ctx.doubleDamage ? 2 : 1);
      for (const t of targetsOf(cs, ctx, fx.target === 'all')) {
        for (let i = 0; i < times; i++) {
          const r = damageEnemy(cs, t, base, { ignoreBlock: fx.ignoreBlock, noStrength: ctx.source === 'potion' });
          if (r.killed) { ctx.killed = true; break; }
        }
      }
      return false;
    }
    case 'damageRandom': {
      const base = cs.rng.int(fx.min, fx.max) * (ctx.doubleDamage ? 2 : 1);
      for (const t of targetsOf(cs, ctx, false)) if (damageEnemy(cs, t, base).killed) ctx.killed = true;
      return false;
    }
    case 'selfDamage': damagePlayer(cs, p, fx.amount, { direct: true }); return false;
    case 'block': gainBlock(cs, p, fx.amount); return false;
    case 'draw': drawCards(cs, fx.n); return false;
    case 'drawIfTargetStatus': {
      const t = cs.enemies.find((e) => e.uid === ctx.targetUid);
      if (t && getStatus(t, fx.name) > 0) drawCards(cs, fx.n);
      return false;
    }
    case 'drawNextTurn': p.drawNextTurn += fx.n; return false;
    case 'status': {
      if (fx.target === 'self') {
        if (fx.name === '隱身') gainStealth(cs, fx.amount); else addStatus(p, fx.name, fx.amount);
      } else {
        for (const t of targetsOf(cs, ctx, fx.target === 'all')) addStatus(t, fx.name, fx.amount);
      }
      return false;
    }
    case 'energy': p.energy += fx.n; return false;
    case 'heal': healPlayer(cs, fx.n); return false;
    case 'gold': if (!fx.onKill || ctx.killed) { cs.fishDelta += fx.n; log(cs, `＋${fx.n} 小魚乾`); } return false;
    case 'power': p.powers.push({ trigger: fx.trigger, effects: fx.effects }); return false;
    case 'noAttacksThisTurn': p.noAttacks = true; return false;
    case 'immuneThisTurn': p.immune = true; return false;
    case 'doubleNextAttack': p.doubleNext = 1; return false;
    case 'endTurn': queue.length = 0; endTurn(cs); return false;
    default:
      throw new Error(`效果尚未實作：${fx.kind}`);   // Task 10 補齊
  }
}
```

- [ ] **Step 5: 寫 `src/engine/combat.ts`**

```ts
import { cardById } from '../content/cards';
import { encounterById, enemyById } from '../content/enemies';
import { relicById } from '../content/relics';
import { advanceMove, damageEnemy, damagePlayer, drawCards, findEnemy, log, makeEnemy, runEnemyEffects } from './actions';
import { cardStats, discardHand } from './deck';
import { applyEffects } from './effects';
import type { Rng } from './rng';
import { addStatus, decayTurnStatuses, getStatus, removeStatus, tickPoison } from './statuses';
import { gainStealth } from './actions';
import type { CardInstance, CombatState, EffectCtx, PlayerCombat } from './types';

type NumHook = 'firstTurnDraw' | 'firstTurnEnergy' | 'energyPerTurn' | 'firstCardDiscount';
function relicSum(relics: string[], key: NumHook): number {
  return relics.reduce((s, id) => s + (relicById[id]?.hooks[key] ?? 0), 0);
}

export function startCombat(input: {
  hp: number; maxHp: number; deck: CardInstance[]; relics: string[]; potions: string[]; encounterId: string; rng: Rng;
}): CombatState {
  const enc = encounterById[input.encounterId];
  if (!enc) throw new Error(`未知的遭遇：${input.encounterId}`);
  const player: PlayerCombat = {
    hp: input.hp, maxHp: input.maxHp, block: 0, statuses: {},
    energy: 0, maxEnergy: 3 + relicSum(input.relics, 'energyPerTurn'),
    hand: [], drawPile: input.rng.shuffle(input.deck), discardPile: [], exhaustPile: [],
    retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
    noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
    firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false,
  };
  const cs: CombatState = {
    rng: input.rng, player, enemies: [], relics: [...input.relics], potions: [...input.potions],
    turn: 0, phase: 'player', pending: null, log: [], encounterId: input.encounterId,
    stolenFish: 0, fishDelta: 0, kills: 0, cardsPlayed: 0, nextEnemyUid: 1,
  };
  enc.enemies.forEach((id, k) => cs.enemies.push(makeEnemy(cs, id, k)));
  for (const e of cs.enemies) log(cs, `${e.name}：${enemyById[e.enemyId]?.line ?? ''}`);
  for (const rid of cs.relics) {
    const hooks = relicById[rid]?.hooks.combatStart;
    if (hooks) applyEffects(cs, hooks, { source: 'relic' });
  }
  startPlayerTurn(cs);
  return cs;
}

export function startPlayerTurn(cs: CombatState): void {
  if (cs.phase !== 'player') return;
  const p = cs.player;
  cs.turn += 1;
  p.block = 0;
  const poison = getStatus(p, '噎到');
  if (poison > 0) { addStatus(p, '噎到', -1); damagePlayer(cs, p, poison, { direct: true }); if (cs.phase !== 'player') return; }
  const dive = getStatus(p, '潛水');
  if (dive > 0) { removeStatus(p, '潛水'); gainStealth(cs, dive); }
  for (const pw of p.powers) if (pw.trigger === 'turnStart') applyEffects(cs, pw.effects, { source: 'power' });
  p.energy = p.maxEnergy + (cs.turn === 1 ? relicSum(cs.relics, 'firstTurnEnergy') : 0);
  p.noAttacks = false; p.immune = false; p.attackedThisTurn = false; p.cardsPlayedThisTurn = 0;
  p.firstStealthGiven = false; p.firstCardPlayed = false; p.doubleNext = 0;
  const n = 5 + p.drawNextTurn + (cs.turn === 1 ? relicSum(cs.relics, 'firstTurnDraw') : 0);
  p.drawNextTurn = 0;
  drawCards(cs, n);
  for (const c of [...p.hand]) {
    const cu = cardById[c.cardId]?.curse;
    if (cu?.onTurnStart) { log(cs, `「${cardById[c.cardId]?.name}」發作`); damagePlayer(cs, p, cu.onTurnStart, { direct: true }); }
  }
}

export function canPlay(cs: CombatState, uid: number, targetUid?: number): { ok: true; cost: number } | { ok: false; reason: string } {
  if (cs.phase !== 'player') return { ok: false, reason: '戰鬥已結束' };
  if (cs.pending) return { ok: false, reason: '先把牌選完' };
  const card = cs.player.hand.find((c) => c.uid === uid);
  if (!card) return { ok: false, reason: '不在手牌' };
  const st = cardStats(card);
  if (st.keywords.includes('不可打出')) return { ok: false, reason: '不可打出' };
  if (st.def.type === '攻擊' && cs.player.noAttacks) return { ok: false, reason: '本回合不能再打攻擊牌' };
  let cost = st.cost;
  if (!cs.player.firstCardPlayed) cost = Math.max(0, cost - relicSum(cs.relics, 'firstCardDiscount'));
  if (cost > cs.player.energy) return { ok: false, reason: '餓扁了' };
  if (st.def.target === 'enemy' && (targetUid === undefined || !findEnemy(cs, targetUid))) return { ok: false, reason: '要選一隻魔物' };
  return { ok: true, cost };
}

export function playCard(cs: CombatState, uid: number, targetUid?: number): boolean {
  const chk = canPlay(cs, uid, targetUid);
  if (!chk.ok) return false;
  const p = cs.player;
  const card = p.hand.find((c) => c.uid === uid) as CardInstance;
  const st = cardStats(card);
  p.energy -= chk.cost;
  p.hand.splice(p.hand.indexOf(card), 1);
  const toExhaust = st.keywords.includes('消耗') || st.def.type === '能力';
  (toExhaust ? p.exhaustPile : p.discardPile).push(card);
  const ctx: EffectCtx = { targetUid, cardUid: uid, cardType: st.def.type, source: 'card', combo: p.cardsPlayedThisTurn };
  if (st.def.type === '攻擊' && p.doubleNext > 0) { ctx.doubleDamage = true; p.doubleNext = 0; }
  p.cardsPlayedThisTurn += 1;
  cs.cardsPlayed += 1;
  p.firstCardPlayed = true;
  if (st.def.type === '攻擊') p.attackedThisTurn = true;
  log(cs, `球球打出「${st.name}」`);
  applyEffects(cs, st.effects, ctx);
  for (const rid of cs.relics) {
    const h = relicById[rid]?.hooks.drawOnNthCard;
    if (h && p.cardsPlayedThisTurn === h.n) drawCards(cs, h.draw);
  }
  return true;
}

export function endTurn(cs: CombatState): void {
  if (cs.phase !== 'player' || cs.pending) return;
  const p = cs.player;
  for (const c of [...p.hand]) {
    const cu = cardById[c.cardId]?.curse;
    if (cu?.onTurnEnd) { log(cs, `「${cardById[c.cardId]?.name}」發作`); damagePlayer(cs, p, cu.onTurnEnd, { direct: true }); }
  }
  if (cs.phase !== 'player') return;
  if (!p.attackedThisTurn) {
    for (const rid of cs.relics) { const h = relicById[rid]?.hooks.turnEndNoAttack; if (h) applyEffects(cs, h, { source: 'relic' }); }
    for (const pw of p.powers) if (pw.trigger === 'turnEndNoAttack') applyEffects(cs, pw.effects, { source: 'power' });
  }
  discardHand(p);
  decayTurnStatuses(p);
  for (const e of [...cs.enemies]) {
    if (e.dead || cs.phase !== 'player') continue;
    e.block = 0;
    e.turnCount += 1;
    const def = enemyById[e.enemyId];
    const ph = def?.phases?.[e.phase - 1];
    if (ph?.strengthPerTurn) addStatus(e, '爪力', ph.strengthPerTurn);
    if (def?.strengthEveryNTurns && e.turnCount % def.strengthEveryNTurns === 0) addStatus(e, '爪力', 1);
    tickPoison(e);
    if (e.hp === 0) { damageEnemy(cs, e, 0, { direct: true }); continue; }
    if (e.move.intent === 'attack' && getStatus(e, '定身') > 0) {
      addStatus(e, '定身', -1);
      log(cs, `${e.name}被定住了，這一下打不出來`);
    } else {
      const charged = e.charged;
      if (e.move.intent === 'attack') e.charged = false;
      runEnemyEffects(cs, e, e.move.effects, charged);
    }
    decayTurnStatuses(e);
    if (!e.dead) advanceMove(cs, e);
  }
  if (cs.phase === 'player') startPlayerTurn(cs);
}

export function combatResult(cs: CombatState): { hp: number; fishDelta: number; kills: number; potions: string[] } {
  return { hp: cs.player.hp, fishDelta: cs.fishDelta, kills: cs.kills, potions: [...cs.potions] };
}
```

- [ ] **Step 6: 跑測試、型別檢查**

Run: `npm test -- tests/engine/combat.test.ts`　Expected: 16 passed。`npx tsc --noEmit` 無錯誤（`combat.ts` 對 `actions` 的兩個 import 可合併成一行）。

- [ ] **Step 7: 提交**

```bash
git add src/engine/actions.ts src/engine/combat.ts src/engine/effects.ts tests/engine/combat.test.ts
git commit -m "功能：戰鬥回合機、傷害公式、魔物行動與基本牌效果"
```

---

### Task 10: 進階牌效果（選牌暫停）、忍具

**Files:**
- Modify: `src/engine/effects.ts`（把 `default: throw` 換成實作）, `src/engine/combat.ts`（加 `resolveChoice`、`usePotion`）
- Test: `tests/engine/effects.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function resolveChoice(cs: CombatState, chosenUids: number[]): boolean   // 沒有待選、數量不對、uid 不在候選 → false
  export function usePotion(cs: CombatState, potionId: string, targetUid?: number): boolean
  ```
- 待選規則：效果需要玩家選牌時，`cs.pending` 設為 `{ kind: 'chooseCards', from, purpose, cards, min, max, remaining, ctx }`，效果佇列剩下的部分放在 `remaining`；有待選時 `playCard`／`endTurn`／`usePotion` 都拒絕。候選為空就直接跳過不暫停。畫面與機器人看到 `cs.pending` 就要呼叫 `resolveChoice`。
- 各 purpose 的選後動作：`exhaust`→消耗堆、`retain`→加入 `p.retained`、`discard`→棄牌堆、`recover`→回手牌、`scryDiscard`→從抽牌堆頂丟到棄牌堆（沒選的保持原順序）。

- [ ] **Step 1: 寫失敗測試 `tests/engine/effects.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { endTurn, playCard, resolveChoice, startCombat, usePotion } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function deck(ids: string[]): CardInstance[] { return ids.map((id, i) => inst(id, i + 1)); }
function start(encounterId: string, extra: string[] = [], potions: string[] = [], seed = 'fx'): CombatState {
  const cs = startCombat({ hp: 70, maxHp: 70, deck: deck([...STARTER_DECK, ...extra]), relics: [], potions, encounterId, rng: new Rng(seedFromString(seed)) });
  cs.player.energy = 9;
  return cs;
}
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('選牌類效果', () => {
  it('讀心術：看頂 3 張、丟掉選的、再抽 1', () => {
    const cs = start('wood_dummy', ['duxin']);
    const uid = toHand(cs, 'duxin');
    const top = cs.player.drawPile.slice(0, 3).map((c) => c.uid);
    const handBefore = cs.player.hand.length;
    playCard(cs, uid);
    expect(cs.pending?.purpose).toBe('scryDiscard');
    expect(cs.pending?.cards.map((c) => c.uid)).toEqual(top);
    expect(endTurn(cs)).toBeUndefined(); expect(cs.turn).toBe(1);          // 有待選不能結束回合
    expect(resolveChoice(cs, [top[0]!])).toBe(true);
    expect(cs.pending).toBeNull();
    expect(cs.player.discardPile.some((c) => c.uid === top[0])).toBe(true);
    expect(cs.player.hand.length).toBe(handBefore);                         // 打出 −1、抽 1
    expect(cs.player.hand.at(-1)?.uid).toBe(top[1]);                        // 抽到的是原本第 2 張
  });
  it('告退：消耗一張手牌再抽 1；亂選會被拒', () => {
    const cs = start('wood_dummy', ['gaotui']);
    const uid = toHand(cs, 'gaotui');
    playCard(cs, uid);
    expect(cs.pending?.purpose).toBe('exhaust');
    expect(resolveChoice(cs, [999])).toBe(false);
    expect(resolveChoice(cs, [])).toBe(false);
    const victim = cs.pending!.cards[0]!.uid;
    expect(resolveChoice(cs, [victim])).toBe(true);
    expect(cs.player.exhaustPile.map((c) => c.uid)).toContain(victim);
  });
  it('拖字訣：保留的牌回合結束不棄', () => {
    const cs = start('wood_dummy', ['tuozi']);
    playCard(cs, toHand(cs, 'tuozi'));
    const keep = cs.pending!.cards[0]!.uid;
    resolveChoice(cs, [keep]);
    endTurn(cs);
    expect(cs.player.hand.some((c) => c.uid === keep)).toBe(true);
  });
  it('移形換影：抽 3 棄 1；隔空取物：從棄牌堆拿回', () => {
    const cs = start('wood_dummy', ['yixing', 'gekong']);
    const n = cs.player.hand.length;
    playCard(cs, toHand(cs, 'yixing'));
    expect(cs.pending?.purpose).toBe('discard');
    const drop = cs.pending!.cards[0]!.uid;
    resolveChoice(cs, [drop]);
    expect(cs.player.hand.length).toBe(n - 1 + 3 - 1);
    playCard(cs, toHand(cs, 'gekong'));
    expect(cs.pending?.purpose).toBe('recover');
    expect(resolveChoice(cs, [drop])).toBe(true);
    expect(cs.player.hand.some((c) => c.uid === drop)).toBe(true);
  });
  it('候選為空就不暫停', () => {
    const cs = start('wood_dummy', ['gaotui']);
    const uid = toHand(cs, 'gaotui');
    cs.player.drawPile.push(...cs.player.hand.filter((c) => c.uid !== uid));
    cs.player.hand = cs.player.hand.filter((c) => c.uid === uid);
    playCard(cs, uid);
    expect(cs.pending).toBeNull();
    expect(cs.player.hand.length).toBe(1);   // 只有抽到的 1 張
  });
});

describe('其他效果', () => {
  it('交出來奪走蜷縮；太極照蜷縮值打', () => {
    const cs = start('wood_dummy', ['jiaochulai', 'taiji']);
    const e = cs.enemies[0]!; e.block = 8; const hp = e.hp;
    playCard(cs, toHand(cs, 'jiaochulai'), e.uid);
    expect(cs.player.block).toBe(8); expect(e.block).toBe(0); expect(e.hp).toBe(hp - 4);
    cs.player.block = 10;
    playCard(cs, toHand(cs, 'taiji'), e.uid);
    expect(e.hp).toBe(hp - 14); expect(cs.player.block).toBe(10);
  });
  it('甩鍋術把負面狀態丟給魔物；封口術拆增益與蜷縮', () => {
    const cs = start('wood_dummy', ['shuaiguo', 'fengkou']);
    const e = cs.enemies[0]!;
    addStatus(cs.player, '翻肚', 2); addStatus(cs.player, '懶洋洋', 1);
    playCard(cs, toHand(cs, 'shuaiguo'), e.uid);
    expect(getStatus(cs.player, '翻肚')).toBe(0); expect(getStatus(e, '翻肚')).toBe(2); expect(getStatus(e, '懶洋洋')).toBe(1);
    addStatus(e, '爪力', 2); e.block = 5;
    playCard(cs, toHand(cs, 'fengkou'), e.uid);
    expect(getStatus(e, '爪力')).toBe(0); expect(e.block).toBe(0);
  });
  it('我什麼都沒看到：本回合攻擊打不到', () => {
    const cs = start('cucumber', ['meikandao']);
    playCard(cs, toHand(cs, 'meikandao'));
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    const hp = cs.player.hp; endTurn(cs);
    expect(cs.player.hp).toBe(hp);
  });
  it('先睡了：回血後回合直接結束；蓄力讓下一張攻擊加倍', () => {
    const cs = start('wood_dummy', ['xianshuile', 'xuli']);
    cs.player.hp = 50;
    playCard(cs, toHand(cs, 'xianshuile'));
    expect(cs.player.hp).toBe(54); expect(cs.turn).toBe(2);
    cs.player.energy = 9;
    playCard(cs, toHand(cs, 'xuli'));
    const e = cs.enemies[0]!; e.block = 0; const hp = e.hp;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(e.hp).toBe(hp - 12);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(e.hp).toBe(hp - 18);
  });
  it('順風耳下回合多抽；潛水術下回合再給隱身', () => {
    const cs = start('wood_dummy', ['shunfenger', 'qianshui']);
    playCard(cs, toHand(cs, 'shunfenger'));
    playCard(cs, toHand(cs, 'qianshui'));
    expect(getStatus(cs.player, '隱身')).toBe(1);
    endTurn(cs);                                   // 木樁人第一動是硬撐，不會消耗隱身
    expect(cs.player.hand.length).toBe(7);
    expect(getStatus(cs.player, '隱身')).toBe(2);
  });
  it('順手牽羊擊倒時加小魚乾', () => {
    const cs = start('rats2', ['shunshou']);
    const e = cs.enemies[0]!; e.hp = 3;
    playCard(cs, toHand(cs, 'shunshou'), e.uid);
    expect(e.dead).toBe(true); expect(cs.fishDelta).toBe(15);
  });
});

describe('忍具', () => {
  it('手裡劍不吃爪力、用完即丟；鞭炮打全體；有待選時不能用', () => {
    const cs = start('rats2', ['duxin'], ['shuriken', 'firecracker']);
    addStatus(cs.player, '爪力', 3);
    const [a, b] = cs.enemies as [typeof cs.enemies[0], typeof cs.enemies[0]];
    const ha = a.hp, hb = b.hp;
    expect(usePotion(cs, 'shuriken', a.uid)).toBe(true);
    expect(a.hp).toBe(ha - 8);
    expect(cs.potions).toEqual(['firecracker']);
    expect(usePotion(cs, 'shuriken', a.uid)).toBe(false);
    playCard(cs, toHand(cs, 'duxin'));
    expect(usePotion(cs, 'firecracker')).toBe(false);
    resolveChoice(cs, []);
    expect(usePotion(cs, 'firecracker')).toBe(true);
    expect(a.hp).toBe(ha - 14); expect(b.hp).toBe(hb - 6);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/engine/effects.test.ts`　Expected: FAIL（`resolveChoice` 不存在／效果尚未實作）。

- [ ] **Step 3: 在 `effects.ts` 補齊效果**

把 `applyOne` 的 `default: throw ...` 換成下面這些 case（放在 `case 'endTurn'` 之後），並在檔頭 import 加入 `removeStatus`、`DEBUFFS`：

```ts
    case 'stealBlock': {
      for (const t of targetsOf(cs, ctx, false)) { p.block += t.block; t.block = 0; }
      return false;
    }
    case 'damageEqualBlock': {
      for (const t of targetsOf(cs, ctx, false)) if (damageEnemy(cs, t, p.block, { noStrength: true }).killed) ctx.killed = true;
      return false;
    }
    case 'transferDebuffs': {
      for (const t of targetsOf(cs, ctx, false)) for (const name of DEBUFFS) {
        const v = getStatus(p, name);
        if (v > 0) { removeStatus(p, name); addStatus(t, name, v); }
      }
      return false;
    }
    case 'removeStatuses': {
      for (const t of targetsOf(cs, ctx, false)) {
        for (const name of fx.names) removeStatus(t, name);
        if (fx.removeBlock) t.block = 0;
      }
      return false;
    }
    case 'scry': {
      const cards = p.drawPile.slice(0, fx.n);
      return pause(cs, queue, ctx, { from: 'scry', purpose: 'scryDiscard', cards, min: 0, max: cards.length });
    }
    case 'exhaustFromHand': {
      const n = Math.min(fx.n, p.hand.length);
      return pause(cs, queue, ctx, { from: 'hand', purpose: 'exhaust', cards: [...p.hand], min: n, max: n });
    }
    case 'retainFromHand': {
      const n = Math.min(fx.n, p.hand.length);
      return pause(cs, queue, ctx, { from: 'hand', purpose: 'retain', cards: [...p.hand], min: n, max: n });
    }
    case 'discardFromHand': {
      const n = Math.min(fx.n, p.hand.length);
      return pause(cs, queue, ctx, { from: 'hand', purpose: 'discard', cards: [...p.hand], min: n, max: n });
    }
    case 'recoverFromDiscard':
      return pause(cs, queue, ctx, { from: 'discard', purpose: 'recover', cards: [...p.discardPile], min: 1, max: 1 });
```

並在檔尾加上：

```ts
/** 候選為空就跳過；否則把剩餘效果收進 pending 並清空佇列 */
function pause(cs: CombatState, queue: Effect[], ctx: EffectCtx,
  spec: { from: 'hand' | 'discard' | 'scry'; purpose: 'exhaust' | 'retain' | 'discard' | 'recover' | 'scryDiscard'; cards: CardInstance[]; min: number; max: number }): boolean {
  if (spec.cards.length === 0) return false;
  cs.pending = { kind: 'chooseCards', ...spec, remaining: [...queue], ctx };
  queue.length = 0;
  return true;
}
```

（`CardInstance` 加進 types 的 import。）

- [ ] **Step 4: 在 `combat.ts` 加 `resolveChoice` 與 `usePotion`**

檔頭加 `import { potionById } from '../content/potions';` 與 `import { moveCard } from './deck';`，檔尾加：

```ts
export function resolveChoice(cs: CombatState, chosenUids: number[]): boolean {
  const pd = cs.pending;
  if (!pd) return false;
  const allowed = new Set(pd.cards.map((c) => c.uid));
  const uniq = [...new Set(chosenUids)];
  if (uniq.length < pd.min || uniq.length > pd.max || uniq.some((u) => !allowed.has(u))) return false;
  const p = cs.player;
  for (const uid of uniq) {
    switch (pd.purpose) {
      case 'exhaust': moveCard(p, uid, 'exhaust'); break;
      case 'retain': p.retained.push(uid); break;
      case 'discard': moveCard(p, uid, 'discard'); break;
      case 'recover': moveCard(p, uid, 'hand'); break;
      case 'scryDiscard': moveCard(p, uid, 'discard'); break;
    }
  }
  cs.pending = null;
  applyEffects(cs, pd.remaining, pd.ctx);
  return true;
}

export function usePotion(cs: CombatState, potionId: string, targetUid?: number): boolean {
  if (cs.phase !== 'player' || cs.pending) return false;
  const i = cs.potions.indexOf(potionId);
  const def = potionById[potionId];
  if (i < 0 || !def) return false;
  if (def.target === 'enemy' && (targetUid === undefined || !findEnemy(cs, targetUid))) return false;
  cs.potions.splice(i, 1);
  log(cs, `球球用了「${def.name}」`);
  applyEffects(cs, def.effects, { targetUid, source: 'potion' });
  return true;
}
```

- [ ] **Step 5: 跑全部測試、型別檢查、提交**

Run: `npm test`　Expected: 全部通過（含 Task 9 的 16 條）。`npx tsc --noEmit` 無錯誤。
```bash
git add src/engine/effects.ts src/engine/combat.ts tests/engine/effects.test.ts
git commit -m "功能：選牌類效果、待選機制與忍具"
```

---

### Task 11: 秘寶掛鉤驗證（戰鬥端）

Task 9／10 已把戰鬥端的秘寶掛鉤寫進 `combat.ts`／`actions.ts`；本任務用測試把每一件戰鬥端秘寶釘死（規格 §10「每件秘寶至少一個測試」）。整局端的三件（鮪魚罐頭、貓草、小魚乾罐）在 Task 13 測。木樁已在 Task 9 測過。

**Files:**
- Test: `tests/engine/relics.test.ts`
- Modify（僅在測試揪出錯誤時）: `src/engine/combat.ts`、`src/engine/actions.ts`

- [ ] **Step 1: 寫測試 `tests/engine/relics.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function deck(ids: string[]): CardInstance[] { return ids.map((id, i) => inst(id, i + 1)); }
function start(relics: string[], encounterId = 'cucumber', hp = 60, extra: string[] = []): CombatState {
  return startCombat({ hp, maxHp: 70, deck: deck([...STARTER_DECK, ...extra]), relics, potions: [], encounterId, rng: new Rng(seedFromString('relic')) });
}
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); }
  cs.player.hand.unshift(c);
  return c.uid;
}
function attackNext(cs: CombatState, amount: number): void {
  cs.enemies[0]!.move = { intent: 'attack', label: '打', effects: [{ kind: 'damage', amount }] };
}

describe('秘寶（戰鬥端）', () => {
  it('藍頭巾：第一回合多抽 1；沒有就 5', () => {
    expect(start(['blue_headband']).player.hand.length).toBe(6);
    expect(start([]).player.hand.length).toBe(5);
  });
  it('飯糰袋：第一回合 4 顆，第二回合 3 顆', () => {
    const cs = start(['onigiri_bag']);
    expect(cs.player.energy).toBe(4);
    endTurn(cs);
    expect(cs.player.energy).toBe(3);
  });
  it('塔主令牌：每回合 4 顆', () => {
    const cs = start(['tower_token']);
    expect(cs.player.energy).toBe(4); endTurn(cs); expect(cs.player.energy).toBe(4);
  });
  it('鈴鐺、秘笈、銅鏡、貓薄荷：開戰效果', () => {
    const cs = start(['bell', 'scroll', 'bronze_mirror', 'catnip']);
    expect(getStatus(cs.player, '隱身')).toBe(1);
    expect(getStatus(cs.player, '爪力')).toBe(1);
    expect(getStatus(cs.player, '反彈')).toBe(2);
    expect(cs.player.hp).toBe(63);
  });
  it('銅鏡的反彈會回敬攻擊者', () => {
    const cs = start(['bronze_mirror']);
    const e = cs.enemies[0]!; const hp = e.hp;
    attackNext(cs, 7); endTurn(cs);
    expect(e.hp).toBe(hp - 2);
  });
  it('尾巴鈴：沒打攻擊牌就給 4 蜷縮', () => {
    const cs = start(['tail_bell']);
    attackNext(cs, 7); endTurn(cs);
    expect(cs.player.hp).toBe(57);          // 7 − 4
  });
  it('毛線球：每回合第一張便宜 1', () => {
    const cs = start(['yarn_ball']);
    const e = cs.enemies[0]!.uid;
    playCard(cs, toHand(cs, 'sanjo'), e); expect(cs.player.energy).toBe(3);
    playCard(cs, toHand(cs, 'sanjo'), e); expect(cs.player.energy).toBe(2);
  });
  it('逗貓棒：第 3 張牌抽 1', () => {
    const cs = start(['cat_teaser'], 'wood_dummy');
    const e = cs.enemies[0]!.uid;
    cs.player.energy = 9;
    const n = cs.player.hand.length;
    playCard(cs, toHand(cs, 'sanjo'), e); playCard(cs, toHand(cs, 'sanjo'), e);
    expect(cs.player.hand.length).toBe(n - 2);
    playCard(cs, toHand(cs, 'sanjo'), e);
    expect(cs.player.hand.length).toBe(n - 2);   // −1 ＋1
  });
  it('紙袋：每回合第一次隱身多 1 層', () => {
    const cs = start(['paper_bag'], 'wood_dummy', 60, ['kawarimi']);
    playCard(cs, toHand(cs, 'kawarimi')); expect(getStatus(cs.player, '隱身')).toBe(2);
    playCard(cs, toHand(cs, 'kawarimi')); expect(getStatus(cs.player, '隱身')).toBe(3);
  });
});
```

- [ ] **Step 2: 跑測試**

Run: `npm test -- tests/engine/relics.test.ts`　Expected: 9 passed。若有失敗，修 `combat.ts`／`actions.ts` 的對應掛鉤，不改測試期望值（期望值來自規格 §6.2）。

- [ ] **Step 3: 提交**

```bash
git add tests/engine/relics.test.ts src/engine
git commit -m "測試：戰鬥端秘寶掛鉤逐件驗證"
```

---

### Task 12: 地圖生成 `map.ts`

**Files:**
- Create: `src/engine/map.ts`
- Test: `tests/engine/map.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const FLOORS = 15
  export function generateMap(rng: Rng): GameMap
  export function nodeById(map: GameMap, id: string): MapNode
  export function nodesOnFloor(map: GameMap, floor: number): MapNode[]
  export function nextChoices(map: GameMap, currentNodeId: string | null): MapNode[]   // null＝還沒進塔 → 1F 的節點
  export function validateMap(map: GameMap): string[]                                  // 問題清單，空陣列＝合法
  export function poolForFloor(floor: number): '弱' | '中' | '強'                       // 1–4 弱、5–10 中、11–13 強
  ```
- 結構（規格 §4）：節點 id `f<樓層>-l<路線>`；8F、14F、15F 匯成單一節點（lane 1）；其他層 3 個節點（lane 0..2）。相鄰層之間：同路線或相鄰路線可走；匯合層前後全部相連。

- [ ] **Step 1: 寫失敗測試 `tests/engine/map.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { FIXED_EVENT_FLOOR_5 } from '../../src/content/events';
import { generateMap, nextChoices, nodesOnFloor, validateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';

describe('地圖', () => {
  it('200 個種子全部合法', () => {
    for (let i = 0; i < 200; i++) {
      const m = generateMap(new Rng(seedFromString(`map-${i}`)));
      expect(validateMap(m), `seed map-${i}`).toEqual([]);
    }
  });
  it('同種子同地圖', () => {
    const a = generateMap(new Rng(seedFromString('m'))); const b = generateMap(new Rng(seedFromString('m')));
    expect(a).toEqual(b);
  });
  it('固定層', () => {
    const m = generateMap(new Rng(seedFromString('fixed')));
    expect(nodesOnFloor(m, 1).every((n) => n.type === '戰鬥')).toBe(true);
    expect(nodesOnFloor(m, 5).every((n) => n.type === '事件' && n.eventId === FIXED_EVENT_FLOOR_5)).toBe(true);
    expect(nodesOnFloor(m, 7).some((n) => n.type === '大魔物')).toBe(true);
    expect(nodesOnFloor(m, 8).map((n) => n.type)).toEqual(['紙箱']);
    expect(nodesOnFloor(m, 14).map((n) => n.type)).toEqual(['貓窩']);
    expect(nodesOnFloor(m, 15).map((n) => n.type)).toEqual(['塔主']);
    expect(nodesOnFloor(m, 15)[0]?.encounterId).toBe('tower_master');
  });
  it('走法：入口 3 選、匯合層 1 選、匯合後 3 選', () => {
    const m = generateMap(new Rng(seedFromString('walk')));
    expect(nextChoices(m, null).length).toBe(3);
    expect(nextChoices(m, 'f7-l0').map((n) => n.id)).toEqual(['f8-l1']);
    expect(nextChoices(m, 'f8-l1').length).toBe(3);
    expect(nextChoices(m, 'f2-l0').map((n) => n.lane)).toEqual([0, 1]);
    expect(nextChoices(m, 'f2-l1').map((n) => n.lane)).toEqual([0, 1, 2]);
    expect(nextChoices(m, 'f15-l1')).toEqual([]);
  });
  it('比例大致合理（200 張地圖）', () => {
    let fight = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      const m = generateMap(new Rng(seedFromString(`ratio-${i}`)));
      for (const f of [2, 3, 4]) for (const n of nodesOnFloor(m, f)) { total++; if (n.type === '戰鬥') fight++; }
    }
    expect(fight / total).toBeGreaterThan(0.5); expect(fight / total).toBeLessThan(0.75);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/engine/map.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫 `src/engine/map.ts`**

```ts
import { encounterById, encountersOfPool } from '../content/enemies';
import { FIXED_EVENT_FLOOR_5, eventById, events } from '../content/events';
import type { Rng } from './rng';
import type { GameMap, MapNode, NodeType } from './types';

export const FLOORS = 15;
const LANES = 3;
const CONVERGED: Record<number, NodeType> = { 8: '紙箱', 14: '貓窩', 15: '塔主' };

export function poolForFloor(floor: number): '弱' | '中' | '強' {
  return floor <= 4 ? '弱' : floor <= 10 ? '中' : '強';
}

function roll(rng: Rng, table: [NodeType, number][]): NodeType {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [t, w] of table) { r -= w; if (r < 0) return t; }
  return table[table.length - 1]![0];
}

function tableFor(floor: number): [NodeType, number][] {
  if (floor >= 2 && floor <= 4) return [['戰鬥', 60], ['事件', 30], ['罐頭鋪', 10]];
  if (floor === 6) return [['戰鬥', 50], ['事件', 35], ['罐頭鋪', 15]];
  if (floor === 7) return [['戰鬥', 60], ['事件', 40]];
  return [['戰鬥', 45], ['事件', 25], ['罐頭鋪', 10], ['貓窩', 10], ['大魔物', 10]];   // 9–13
}

export function generateMap(rng: Rng): GameMap {
  const nodes: MapNode[] = [];
  const byFloor: MapNode[][] = [];
  for (let f = 1; f <= FLOORS; f++) {
    const row: MapNode[] = [];
    const conv = CONVERGED[f];
    if (conv) row.push({ id: `f${f}-l1`, floor: f, lane: 1, type: conv, next: [] });
    else for (let l = 0; l < LANES; l++) row.push({ id: `f${f}-l${l}`, floor: f, lane: l, type: '戰鬥', next: [] });
    byFloor[f] = row;
    nodes.push(...row);
  }
  // 類型
  for (let f = 2; f <= 13; f++) {
    if (CONVERGED[f]) continue;
    const row = byFloor[f]!;
    if (f === 5) { for (const n of row) n.type = '事件'; continue; }
    let shops = 0, elites = 0;
    for (const n of row) {
      let t = roll(rng, tableFor(f));
      if (t === '罐頭鋪' && shops >= 1) t = '戰鬥';
      if (t === '大魔物' && elites >= 1) t = '戰鬥';
      if (t === '貓窩' && f === 13) t = '戰鬥';
      if (t === '罐頭鋪') shops++;
      if (t === '大魔物') elites++;
      n.type = t;
    }
    if (f === 7 && elites === 0) rng.pick(row).type = '大魔物';
  }
  // 9–13F 保證至少一個罐頭鋪、一個貓窩
  const mid = [9, 10, 11, 12, 13].flatMap((f) => byFloor[f]!);
  if (!mid.some((n) => n.type === '罐頭鋪')) {
    const cands = mid.filter((n) => n.type === '戰鬥'); (cands.length ? rng.pick(cands) : mid[0]!).type = '罐頭鋪';
  }
  if (!mid.some((n) => n.type === '貓窩')) {
    const cands = mid.filter((n) => n.type === '戰鬥' && n.floor !== 13); (cands.length ? rng.pick(cands) : mid[0]!).type = '貓窩';
  }
  // 內容：遭遇與事件
  const eventQueue = rng.shuffle(events.filter((e) => e.fixedFloor === undefined).map((e) => e.id));
  let eventIdx = 0;
  for (const n of nodes) {
    if (n.type === '戰鬥') n.encounterId = rng.pick(encountersOfPool(poolForFloor(n.floor))).id;
    else if (n.type === '大魔物') n.encounterId = rng.pick(encountersOfPool('大魔物')).id;
    else if (n.type === '塔主') n.encounterId = 'tower_master';
    else if (n.type === '事件') {
      if (n.floor === 5) n.eventId = FIXED_EVENT_FLOOR_5;
      else { n.eventId = eventQueue[eventIdx % eventQueue.length]; eventIdx++; }
    }
  }
  // 邊
  for (let f = 1; f < FLOORS; f++) {
    const cur = byFloor[f]!, nxt = byFloor[f + 1]!;
    for (const n of cur) {
      if (nxt.length === 1 || cur.length === 1) n.next = nxt.map((m) => m.id);
      else n.next = nxt.filter((m) => Math.abs(m.lane - n.lane) <= 1).map((m) => m.id);
    }
  }
  return { nodes, start: byFloor[1]!.map((n) => n.id) };
}

export function nodeById(map: GameMap, id: string): MapNode {
  const n = map.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`未知的節點：${id}`);
  return n;
}

export function nodesOnFloor(map: GameMap, floor: number): MapNode[] {
  return map.nodes.filter((n) => n.floor === floor);
}

export function nextChoices(map: GameMap, currentNodeId: string | null): MapNode[] {
  if (currentNodeId === null) return map.start.map((id) => nodeById(map, id));
  return nodeById(map, currentNodeId).next.map((id) => nodeById(map, id));
}

export function validateMap(map: GameMap): string[] {
  const p: string[] = [];
  const top = nodesOnFloor(map, FLOORS);
  if (top.length !== 1 || top[0]?.type !== '塔主' || top[0]?.encounterId !== 'tower_master') p.push('15F 必須是唯一的塔主');
  if (nodesOnFloor(map, 8).map((n) => n.type).join() !== '紙箱') p.push('8F 必須是唯一的紙箱');
  if (nodesOnFloor(map, 14).map((n) => n.type).join() !== '貓窩') p.push('14F 必須是唯一的貓窩');
  if (!nodesOnFloor(map, 1).every((n) => n.type === '戰鬥')) p.push('1F 必須全是戰鬥');
  if (!nodesOnFloor(map, 5).every((n) => n.type === '事件' && n.eventId === FIXED_EVENT_FLOOR_5)) p.push('5F 必須全是大俠傳功');
  if (!nodesOnFloor(map, 7).some((n) => n.type === '大魔物')) p.push('7F 至少一個大魔物');
  for (let f = 1; f <= FLOORS; f++) {
    const row = nodesOnFloor(map, f);
    if (row.length !== (CONVERGED[f] ? 1 : 3)) p.push(`${f}F 節點數錯誤`);
    if (row.filter((n) => n.type === '罐頭鋪').length > 1) p.push(`${f}F 罐頭鋪超過一個`);
    if (row.filter((n) => n.type === '大魔物').length > 1) p.push(`${f}F 大魔物超過一個`);
    if (f === 13 && row.some((n) => n.type === '貓窩')) p.push('13F 不可放貓窩');
    if (f >= 2 && f <= 6 && row.some((n) => n.type === '貓窩' || n.type === '大魔物')) p.push(`${f}F 不該有貓窩或大魔物`);
  }
  const mid = map.nodes.filter((n) => n.floor >= 9 && n.floor <= 13);
  if (!mid.some((n) => n.type === '罐頭鋪')) p.push('9–13F 至少一個罐頭鋪');
  if (!mid.some((n) => n.type === '貓窩')) p.push('9–13F 至少一個貓窩');
  for (const n of map.nodes) {
    if ((n.type === '戰鬥' || n.type === '大魔物' || n.type === '塔主')) {
      const enc = n.encounterId ? encounterById[n.encounterId] : undefined;
      if (!enc) p.push(`${n.id} 缺遭遇`);
      else if (n.type === '戰鬥' && enc.pool !== poolForFloor(n.floor)) p.push(`${n.id} 遭遇池不符`);
      else if (n.type === '大魔物' && enc.pool !== '大魔物') p.push(`${n.id} 應為大魔物池`);
    }
    if (n.type === '事件' && !(n.eventId && eventById[n.eventId])) p.push(`${n.id} 缺事件`);
    if (n.floor < FLOORS && n.next.length === 0) p.push(`${n.id} 沒有下一步`);
    for (const id of n.next) if (nodeById(map, id).floor !== n.floor + 1) p.push(`${n.id} 的邊跨層`);
  }
  // 每個節點都到得了 15F
  const reach = new Set<string>();
  const stack = map.nodes.filter((n) => n.floor === FLOORS).map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!; if (reach.has(id)) continue; reach.add(id);
    for (const m of map.nodes) if (m.next.includes(id)) stack.push(m.id);
  }
  for (const n of map.nodes) if (!reach.has(n.id)) p.push(`${n.id} 到不了 15F`);
  return p;
}
```

- [ ] **Step 4: 跑測試、型別檢查、提交**

Run: `npm test -- tests/engine/map.test.ts`　Expected: 5 passed。`npx tsc --noEmit` 無錯誤。
```bash
git add src/engine/map.ts tests/engine/map.test.ts
git commit -m "功能：15 層地圖生成與驗證"
```

---

### Task 13: 整局狀態與獎勵 `run.ts`、`rewards.ts`

**Files:**
- Create: `src/engine/rewards.ts`, `src/engine/run.ts`
- Test: `tests/engine/run.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // rewards.ts
  export interface CombatRewards { kind: '戰鬥' | '大魔物' | '塔主'; cards: CardDef[]; fish: number; potion: string | null; relic: string | null }
  export function rollCardChoices(rng: Rng, pool: Pool, n: number, exclude?: string[]): CardDef[]   // 稀有度 常見 65／罕見 30／稀有 5，不重複
  export function rollRelic(rng: Rng, pool: RelicPool, owned: string[]): string | null              // 沒得拿回 null
  export function rollPotion(rng: Rng): string
  export function rollRewards(rng: Rng, kind: CombatRewards['kind'], owned: string[], winGoldBonus: number): CombatRewards
  // run.ts
  export const START_FISH = 50
  export function newRun(seed: string): RunState
  export function runRng(run: RunState): Rng                       // 回傳的 Rng 直接寫 run.rng（狀態同一個物件）
  export function currentNode(run: RunState): MapNode | null
  export function chooseNode(run: RunState, nodeId: string): MapNode   // 不在可走清單就丟 Error
  export function beginCombat(run: RunState, encounterId?: string): CombatState   // 預設用目前節點的遭遇
  export function finishCombat(run: RunState, cs: CombatState, bonusFish?: number): CombatRewards | null   // 輸＝null 並把 run.status 設 'lost'
  export function takeCardReward(run: RunState, rewards: CombatRewards, cardId: string | null): void
  export function addCard(run: RunState, cardId: string, upgraded?: boolean): CardInstance
  export function removeCard(run: RunState, uid: number): boolean
  export function upgradeCard(run: RunState, uid: number): boolean
  export function takeRelic(run: RunState, relicId: string): boolean    // 已有就 false；套 maxHp 掛鉤
  export function addPotion(run: RunState, potionId: string): boolean   // 滿 3 個就 false
  export function rest(run: RunState, choice: '打盹' | '磨爪', uid?: number): boolean
  export function openChest(run: RunState): string | null
  export interface ShopStock { cards: { def: CardDef; price: number; sold: boolean }[]; relics: { id: string; price: number; sold: boolean }[]; potions: { id: string; price: number; sold: boolean }[] }
  export function makeShop(run: RunState): ShopStock
  export function buyCard(run: RunState, shop: ShopStock, i: number): boolean
  export function buyRelic(run: RunState, shop: ShopStock, i: number): boolean
  export function buyPotion(run: RunState, shop: ShopStock, i: number): boolean
  export function buyRemove(run: RunState, uid: number): boolean       // 價格 run.removeCost，成交後 +25
  export type RunEffectOutcome = { needs: 'removeCard' | 'upgradeCard' } | { chooseCard: CardDef[] } | { fight: { encounterId: string; bonusFish: number } } | null
  export function applyRunEffects(run: RunState, effects: RunEffect[]): RunEffectOutcome   // 最多一個需要玩家再選的結果，放最後處理
  ```
- 價格（規格 §6.6）：牌 常見 50／罕見 75／稀有 150；秘寶 150；忍具 45；放生 75 起每次 +25。獎勵（§5.4）：戰鬥 3 張忍術＋10～20 小魚乾＋40% 忍具；大魔物 大魔物池秘寶＋3 張（其中 1 張絕學）＋30＋50% 忍具；塔主 塔主令牌＋100 並通關。

- [ ] **Step 1: 寫失敗測試 `tests/engine/run.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { relicById } from '../../src/content/relics';
import { endTurn, startCombat } from '../../src/engine/combat';
import { nextChoices, nodeById } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import { rollCardChoices, rollRelic, rollRewards } from '../../src/engine/rewards';
import { addCard, addPotion, applyRunEffects, beginCombat, buyCard, buyRemove, chooseNode, finishCombat, makeShop, newRun, openChest, removeCard, rest, runRng, takeCardReward, takeRelic, upgradeCard } from '../../src/engine/run';
import type { RunState } from '../../src/engine/types';

function fresh(seed = 'run'): RunState { return newRun(seed); }
function goTo(run: RunState, type: string): void {   // 一路往上走到第一個指定類型的節點
  for (let guard = 0; guard < 20; guard++) {
    const choices = nextChoices(run.map, run.currentNode);
    const hit = choices.find((n) => n.type === type);
    chooseNode(run, (hit ?? choices[0]!).id);
    if (hit) return;
  }
  throw new Error(`找不到 ${type}`);
}

describe('新的一局', () => {
  it('起手狀態', () => {
    const run = fresh();
    expect(run.hp).toBe(70); expect(run.maxHp).toBe(70); expect(run.fish).toBe(50);
    expect(run.deck.length).toBe(10); expect(run.relics).toEqual(['blue_headband']);
    expect(run.potions).toEqual([]); expect(run.floor).toBe(0); expect(run.currentNode).toBeNull();
    expect(run.status).toBe('playing'); expect(run.removeCost).toBe(75);
  });
  it('同種子同一局；runRng 會把狀態寫回 run', () => {
    const a = fresh('x'), b = fresh('x');
    expect(a.map).toEqual(b.map);
    const before = JSON.stringify(a.rng);
    runRng(a).next();
    expect(JSON.stringify(a.rng)).not.toBe(before);
  });
  it('chooseNode 只接受可走的節點', () => {
    const run = fresh();
    expect(() => chooseNode(run, 'f3-l0')).toThrow();
    const n = chooseNode(run, run.map.start[1]!);
    expect(run.currentNode).toBe(n.id); expect(run.floor).toBe(1);
  });
});

describe('戰鬥與獎勵', () => {
  it('打贏一般戰鬥：生命與小魚乾寫回、給 3 張忍術', () => {
    const run = fresh('fight');
    chooseNode(run, run.map.start[0]!);
    const cs = beginCombat(run);
    for (const e of cs.enemies) e.hp = 1;
    cs.player.hp = 40;
    // 直接把魔物打死：用最簡單的方式——把牠們標記死亡並設勝利
    for (const e of cs.enemies) { e.dead = true; } cs.phase = 'won'; cs.kills = cs.enemies.length; cs.fishDelta = 5;
    const r = finishCombat(run, cs)!;
    expect(r.kind).toBe('戰鬥');
    expect(r.cards.length).toBe(3);
    expect(r.cards.every((c) => c.pool === '忍術')).toBe(true);
    expect(r.fish).toBeGreaterThanOrEqual(10); expect(r.fish).toBeLessThanOrEqual(20);
    expect(run.hp).toBe(40); expect(run.fish).toBe(50 + 5 + r.fish); expect(run.stats.kills).toBe(cs.enemies.length);
    takeCardReward(run, r, r.cards[0]!.id);
    expect(run.deck.length).toBe(11);
  });
  it('大魔物獎勵含秘寶與一張絕學；塔主通關', () => {
    const rng = new Rng(seedFromString('elite'));
    const r = rollRewards(rng, '大魔物', ['blue_headband'], 0);
    expect(relicById[r.relic!]?.pool).toBe('大魔物');
    expect(r.cards.some((c) => c.pool === '絕學')).toBe(true);
    expect(r.fish).toBe(30);
    const run = fresh('boss');
    run.currentNode = 'f15-l1'; run.floor = 15;
    const cs = beginCombat(run);
    for (const e of cs.enemies) e.dead = true; cs.phase = 'won'; cs.kills = 1;
    const b = finishCombat(run, cs)!;
    expect(b.kind).toBe('塔主'); expect(b.relic).toBe('tower_token'); expect(b.fish).toBe(100);
    expect(run.status).toBe('won');
  });
  it('輸了就結束', () => {
    const run = fresh('lose');
    chooseNode(run, run.map.start[0]!);
    const cs = beginCombat(run);
    cs.player.hp = 0; cs.phase = 'lost';
    expect(finishCombat(run, cs)).toBeNull();
    expect(run.status).toBe('lost');
  });
  it('rollCardChoices 不重複、依池；rollRelic 不給已擁有', () => {
    const rng = new Rng(seedFromString('roll'));
    const cs = rollCardChoices(rng, '絕學', 3);
    expect(new Set(cs.map((c) => c.id)).size).toBe(3);
    expect(cs.every((c) => c.pool === '絕學')).toBe(true);
    const owned = ['onigiri_bag', 'tuna_can', 'catgrass', 'bell', 'fish_jar', 'catnip', 'tail_bell'];
    expect(rollRelic(rng, '常見', owned)).toBeNull();
    expect(relicById[rollRelic(rng, '常見', ['bell'])!]?.pool).toBe('常見');
  });
});

describe('牌組、秘寶、忍具', () => {
  it('加牌、升級、移除', () => {
    const run = fresh();
    const c = addCard(run, 'bunshin');
    expect(upgradeCard(run, c.uid)).toBe(true);
    expect(run.deck.find((x) => x.uid === c.uid)?.upgraded).toBe(true);
    expect(upgradeCard(run, c.uid)).toBe(false);
    expect(removeCard(run, c.uid)).toBe(true); expect(run.deck.length).toBe(10);
    expect(removeCard(run, 999)).toBe(false);
  });
  it('秘寶：不重複、鮪魚罐頭 +10 最大生命、塔主令牌 −10', () => {
    const run = fresh();
    expect(takeRelic(run, 'tuna_can')).toBe(true);
    expect(run.maxHp).toBe(80); expect(run.hp).toBe(80);
    expect(takeRelic(run, 'tuna_can')).toBe(false);
    expect(takeRelic(run, 'tower_token')).toBe(true);
    expect(run.maxHp).toBe(70); expect(run.hp).toBe(70);
  });
  it('忍具最多 3 個', () => {
    const run = fresh();
    expect(addPotion(run, 'tuna')).toBe(true); addPotion(run, 'tuna'); addPotion(run, 'tuna');
    expect(addPotion(run, 'rope')).toBe(false); expect(run.potions.length).toBe(3);
  });
});

describe('貓窩、紙箱、罐頭鋪', () => {
  it('打盹回 30%，貓草加倍；磨爪升級', () => {
    const run = fresh(); run.hp = 20;
    expect(rest(run, '打盹')).toBe(true); expect(run.hp).toBe(41);
    run.hp = 20; takeRelic(run, 'catgrass');
    rest(run, '打盹'); expect(run.hp).toBe(62);
    const uid = run.deck[0]!.uid;
    expect(rest(run, '磨爪', uid)).toBe(true); expect(run.deck[0]!.upgraded).toBe(true);
  });
  it('紙箱給一件沒有的常見秘寶', () => {
    const run = fresh();
    const id = openChest(run)!;
    expect(relicById[id]?.pool).toBe('常見'); expect(run.relics).toContain(id);
  });
  it('罐頭鋪：5 張牌（3 忍術 2 絕學）、2 秘寶、3 忍具；買牌扣錢；放生漲價', () => {
    const run = fresh('shop'); run.fish = 500;
    const shop = makeShop(run);
    expect(shop.cards.length).toBe(5);
    expect(shop.cards.filter((c) => c.def.pool === '忍術').length).toBe(3);
    expect(shop.cards.filter((c) => c.def.pool === '絕學').length).toBe(2);
    expect(shop.relics.length).toBe(2); expect(shop.potions.length).toBe(3);
    const price = shop.cards[0]!.price;
    expect(buyCard(run, shop, 0)).toBe(true); expect(run.fish).toBe(500 - price); expect(shop.cards[0]!.sold).toBe(true);
    expect(buyCard(run, shop, 0)).toBe(false);
    const uid = run.deck[0]!.uid;
    expect(buyRemove(run, uid)).toBe(true); expect(run.removeCost).toBe(100); expect(run.deck.some((c) => c.uid === uid)).toBe(false);
    run.fish = 0; expect(buyRemove(run, run.deck[0]!.uid)).toBe(false);
  });
});

describe('事件結果', () => {
  it('各種整局效果', () => {
    const run = fresh('ev'); run.hp = 30; run.fish = 40;
    expect(applyRunEffects(run, [{ kind: 'heal', n: 20 }])).toBeNull(); expect(run.hp).toBe(50);
    applyRunEffects(run, [{ kind: 'damage', n: 6 }]); expect(run.hp).toBe(44);
    applyRunEffects(run, [{ kind: 'fishHalve' }]); expect(run.fish).toBe(20);
    applyRunEffects(run, [{ kind: 'maxHp', n: 5 }]); expect(run.maxHp).toBe(75); expect(run.hp).toBe(49);
    applyRunEffects(run, [{ kind: 'addCard', cardId: 'zhongji' }]); expect(run.deck.some((c) => c.cardId === 'zhongji')).toBe(true);
    applyRunEffects(run, [{ kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }]);
    expect(cardById[run.deck.at(-1)!.cardId]?.rarity).toBe('罕見');
    applyRunEffects(run, [{ kind: 'potions', n: 2 }]); expect(run.potions.length).toBe(2);
    expect(applyRunEffects(run, [{ kind: 'removeCard' }])).toEqual({ needs: 'removeCard' });
    expect(applyRunEffects(run, [{ kind: 'upgradeCard' }])).toEqual({ needs: 'upgradeCard' });
    expect(applyRunEffects(run, [{ kind: 'fight', encounterId: 'orange_bandit', bonusFish: 40 }])).toEqual({ fight: { encounterId: 'orange_bandit', bonusFish: 40 } });
    const pick = applyRunEffects(run, [{ kind: 'chooseCard', pool: '絕學', n: 3 }]);
    expect('chooseCard' in pick! && pick.chooseCard.length).toBe(3);
    applyRunEffects(run, [{ kind: 'relic', pool: '常見' }]); expect(run.relics.length).toBe(2);
  });
  it('賭注照種子決定', () => {
    const a = fresh('g'), b = fresh('g');
    const fx = [{ kind: 'gamble' as const, p: 0.5, win: [{ kind: 'maxHp' as const, n: 5 }], lose: [{ kind: 'addCard' as const, cardId: 'shishou' }] }];
    applyRunEffects(a, fx); applyRunEffects(b, fx);
    expect(a.maxHp).toBe(b.maxHp); expect(a.deck.length).toBe(b.deck.length);
  });
  it('事件戰鬥的獎金加在勝利上', () => {
    const run = fresh('bonus');
    chooseNode(run, run.map.start[0]!);
    const cs = beginCombat(run, 'orange_bandit');
    for (const e of cs.enemies) e.dead = true; cs.phase = 'won'; cs.kills = 1;
    const r = finishCombat(run, cs, 40)!;
    expect(run.fish).toBe(50 + r.fish + 40);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/engine/run.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫 `src/engine/rewards.ts`**

```ts
import { cards } from '../content/cards';
import { potions } from '../content/potions';
import { relics } from '../content/relics';
import type { Rng } from './rng';
import type { CardDef, Pool, Rarity, RelicPool } from './types';

export interface CombatRewards { kind: '戰鬥' | '大魔物' | '塔主'; cards: CardDef[]; fish: number; potion: string | null; relic: string | null }

const RARITY_ODDS: [Rarity, number][] = [['常見', 65], ['罕見', 30], ['稀有', 5]];

function rollRarity(rng: Rng, available: Set<Rarity>): Rarity {
  const table = RARITY_ODDS.filter(([r]) => available.has(r));
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [rar, w] of table) { r -= w; if (r < 0) return rar; }
  return table[table.length - 1]![0];
}

export function rollCardChoices(rng: Rng, pool: Pool, n: number, exclude: string[] = []): CardDef[] {
  const out: CardDef[] = [];
  const taken = new Set(exclude);
  for (let i = 0; i < n; i++) {
    const remaining = cards.filter((c) => c.pool === pool && !taken.has(c.id));
    if (remaining.length === 0) break;
    const rar = rollRarity(rng, new Set(remaining.map((c) => c.rarity)));
    const pick = rng.pick(remaining.filter((c) => c.rarity === rar));
    taken.add(pick.id);
    out.push(pick);
  }
  return out;
}

export function rollRelic(rng: Rng, pool: RelicPool, owned: string[]): string | null {
  const cands = relics.filter((r) => r.pool === pool && !owned.includes(r.id));
  return cands.length ? rng.pick(cands).id : null;
}

export function rollPotion(rng: Rng): string { return rng.pick(potions).id; }

export function rollRewards(rng: Rng, kind: CombatRewards['kind'], owned: string[], winGoldBonus: number): CombatRewards {
  if (kind === '塔主') return { kind, cards: [], fish: 100 + winGoldBonus, potion: null, relic: owned.includes('tower_token') ? null : 'tower_token' };
  if (kind === '大魔物') {
    const jue = rollCardChoices(rng, '絕學', 1);
    const rest = rollCardChoices(rng, '忍術', 2);
    return { kind, cards: rng.shuffle([...jue, ...rest]), fish: 30 + winGoldBonus, potion: rng.chance(0.5) ? rollPotion(rng) : null, relic: rollRelic(rng, '大魔物', owned) };
  }
  return { kind, cards: rollCardChoices(rng, '忍術', 3), fish: rng.int(10, 20) + winGoldBonus, potion: rng.chance(0.4) ? rollPotion(rng) : null, relic: null };
}
```

- [ ] **Step 4: 寫 `src/engine/run.ts`**

```ts
import { STARTER_DECK, cardById, cards } from '../content/cards';
import { potions } from '../content/potions';
import { relicById } from '../content/relics';
import { startCombat } from './combat';
import { generateMap, nextChoices, nodeById } from './map';
import { Rng, seedFromString } from './rng';
import { rollCardChoices, rollPotion, rollRelic, rollRewards, type CombatRewards } from './rewards';
import type { CardDef, CardInstance, CombatState, MapNode, Rarity, RunEffect, RunState } from './types';

export const START_FISH = 50;
const PRICE: Record<Rarity, number> = { 常見: 50, 罕見: 75, 稀有: 150 };
const RELIC_PRICE = 150, POTION_PRICE = 45;

export function runRng(run: RunState): Rng {
  const rng = new Rng(run.rng);
  run.rng = rng.state;
  return rng;
}

export function newRun(seed: string): RunState {
  const rng = new Rng(seedFromString(seed));
  const run: RunState = {
    version: 1, seed, rng: rng.state, hp: 70, maxHp: 70, fish: START_FISH,
    deck: [], relics: [], potions: [], floor: 0, map: generateMap(rng), currentNode: null,
    nextUid: 1, stats: { kills: 0, turns: 0, cardsPlayed: 0 }, removeCost: 75, status: 'playing',
  };
  for (const id of STARTER_DECK) addCard(run, id);
  takeRelic(run, 'blue_headband');
  return run;
}

export function currentNode(run: RunState): MapNode | null {
  return run.currentNode ? nodeById(run.map, run.currentNode) : null;
}

export function chooseNode(run: RunState, nodeId: string): MapNode {
  const n = nextChoices(run.map, run.currentNode).find((x) => x.id === nodeId);
  if (!n) throw new Error(`不能走到 ${nodeId}`);
  run.currentNode = n.id;
  run.floor = n.floor;
  return n;
}

export function beginCombat(run: RunState, encounterId?: string): CombatState {
  const enc = encounterId ?? currentNode(run)?.encounterId;
  if (!enc) throw new Error('目前節點沒有遭遇');
  return startCombat({ hp: run.hp, maxHp: run.maxHp, deck: run.deck.map((c) => ({ ...c })), relics: run.relics, potions: run.potions, encounterId: enc, rng: runRng(run) });
}

export function finishCombat(run: RunState, cs: CombatState, bonusFish = 0): CombatRewards | null {
  run.stats.turns += cs.turn;
  run.stats.cardsPlayed += cs.cardsPlayed;
  run.potions = [...cs.potions];
  if (cs.phase === 'lost') { run.hp = 0; run.status = 'lost'; return null; }
  run.hp = cs.player.hp;
  run.stats.kills += cs.kills;
  run.fish = Math.max(0, run.fish + cs.fishDelta);
  const node = currentNode(run);
  const kind: CombatRewards['kind'] = cs.encounterId === 'tower_master' ? '塔主' : node?.type === '大魔物' ? '大魔物' : '戰鬥';
  const winGold = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.winGold ?? 0), 0);
  const r = rollRewards(runRng(run), kind, run.relics, winGold);
  r.fish += bonusFish;
  run.fish += r.fish;
  if (r.relic) takeRelic(run, r.relic);
  if (r.potion && !addPotion(run, r.potion)) r.potion = null;
  if (kind === '塔主') run.status = 'won';
  return r;
}

export function takeCardReward(run: RunState, rewards: CombatRewards, cardId: string | null): void {
  if (cardId && rewards.cards.some((c) => c.id === cardId)) addCard(run, cardId);
  rewards.cards = [];
}

export function addCard(run: RunState, cardId: string, upgraded = false): CardInstance {
  if (!cardById[cardId]) throw new Error(`未知的牌：${cardId}`);
  const c: CardInstance = { uid: run.nextUid++, cardId, upgraded };
  run.deck.push(c);
  return c;
}
export function removeCard(run: RunState, uid: number): boolean {
  const i = run.deck.findIndex((c) => c.uid === uid);
  if (i < 0) return false;
  run.deck.splice(i, 1);
  return true;
}
export function upgradeCard(run: RunState, uid: number): boolean {
  const c = run.deck.find((x) => x.uid === uid);
  if (!c || c.upgraded || cardById[c.cardId]?.pool === '壞毛病') return false;
  c.upgraded = true;
  return true;
}

export function takeRelic(run: RunState, relicId: string): boolean {
  const def = relicById[relicId];
  if (!def || run.relics.includes(relicId)) return false;
  run.relics.push(relicId);
  const d = def.hooks.maxHp ?? 0;
  if (d) { run.maxHp += d; run.hp = Math.min(run.maxHp, Math.max(1, run.hp + Math.max(0, d))); }
  return true;
}

export function addPotion(run: RunState, potionId: string): boolean {
  if (run.potions.length >= 3 || !potions.some((p) => p.id === potionId)) return false;
  run.potions.push(potionId);
  return true;
}

export function rest(run: RunState, choice: '打盹' | '磨爪', uid?: number): boolean {
  if (choice === '打盹') {
    const mult = run.relics.reduce((m, id) => m * (relicById[id]?.hooks.restMultiplier ?? 1), 1);
    run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.3 * mult));
    return true;
  }
  return uid !== undefined && upgradeCard(run, uid);
}

export function openChest(run: RunState): string | null {
  const id = rollRelic(runRng(run), '常見', run.relics);
  if (id) takeRelic(run, id);
  return id;
}

export interface ShopStock {
  cards: { def: CardDef; price: number; sold: boolean }[];
  relics: { id: string; price: number; sold: boolean }[];
  potions: { id: string; price: number; sold: boolean }[];
}

export function makeShop(run: RunState): ShopStock {
  const rng = runRng(run);
  const cardDefs = [...rollCardChoices(rng, '忍術', 3), ...rollCardChoices(rng, '絕學', 2)];
  const relicIds: string[] = [];
  for (let i = 0; i < 2; i++) { const id = rollRelic(rng, '常見', [...run.relics, ...relicIds]); if (id) relicIds.push(id); }
  return {
    cards: cardDefs.map((def) => ({ def, price: PRICE[def.rarity], sold: false })),
    relics: relicIds.map((id) => ({ id, price: RELIC_PRICE, sold: false })),
    potions: Array.from({ length: 3 }, () => ({ id: rollPotion(rng), price: POTION_PRICE, sold: false })),
  };
}

function pay(run: RunState, price: number): boolean {
  if (run.fish < price) return false;
  run.fish -= price;
  return true;
}
export function buyCard(run: RunState, shop: ShopStock, i: number): boolean {
  const it = shop.cards[i]; if (!it || it.sold || !pay(run, it.price)) return false;
  it.sold = true; addCard(run, it.def.id); return true;
}
export function buyRelic(run: RunState, shop: ShopStock, i: number): boolean {
  const it = shop.relics[i]; if (!it || it.sold || run.relics.includes(it.id) || !pay(run, it.price)) return false;
  it.sold = true; takeRelic(run, it.id); return true;
}
export function buyPotion(run: RunState, shop: ShopStock, i: number): boolean {
  const it = shop.potions[i]; if (!it || it.sold || run.potions.length >= 3 || !pay(run, it.price)) return false;
  it.sold = true; addPotion(run, it.id); return true;
}
export function buyRemove(run: RunState, uid: number): boolean {
  if (!run.deck.some((c) => c.uid === uid) || !pay(run, run.removeCost)) return false;
  removeCard(run, uid); run.removeCost += 25; return true;
}

export type RunEffectOutcome =
  | { needs: 'removeCard' | 'upgradeCard' }
  | { chooseCard: CardDef[] }
  | { fight: { encounterId: string; bonusFish: number } }
  | null;

export function applyRunEffects(run: RunState, effects: RunEffect[]): RunEffectOutcome {
  let outcome: RunEffectOutcome = null;
  for (const fx of effects) {
    switch (fx.kind) {
      case 'heal': run.hp = Math.min(run.maxHp, run.hp + fx.n); break;
      case 'healPercent': run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * fx.p)); break;
      case 'damage': run.hp = Math.max(1, run.hp - fx.n); break;
      case 'fish': run.fish = Math.max(0, run.fish + fx.n); break;
      case 'fishHalve': run.fish = Math.floor(run.fish / 2); break;
      case 'maxHp': run.maxHp += fx.n; run.hp = Math.min(run.maxHp, run.hp + Math.max(0, fx.n)); break;
      case 'addCard': addCard(run, fx.cardId); break;
      case 'addRandomCard': {
        const pool = cards.filter((c) => c.pool === fx.pool && (!fx.rarity || c.rarity === fx.rarity));
        if (pool.length) addCard(run, runRng(run).pick(pool).id);
        break;
      }
      case 'removeCard': outcome = { needs: 'removeCard' }; break;
      case 'upgradeCard': outcome = { needs: 'upgradeCard' }; break;
      case 'relic': { const id = rollRelic(runRng(run), fx.pool, run.relics); if (id) takeRelic(run, id); break; }
      case 'potions': { const rng = runRng(run); for (let i = 0; i < fx.n; i++) addPotion(run, rollPotion(rng)); break; }
      case 'fight': outcome = { fight: { encounterId: fx.encounterId, bonusFish: fx.bonusFish } }; break;
      case 'chooseCard': outcome = { chooseCard: rollCardChoices(runRng(run), fx.pool, fx.n) }; break;
      case 'gamble': {
        const sub = runRng(run).chance(fx.p) ? fx.win : fx.lose;
        const o = applyRunEffects(run, sub); if (o) outcome = o;
        break;
      }
    }
  }
  return outcome;
}
```

- [ ] **Step 5: 跑測試、型別檢查、提交**

Run: `npm test -- tests/engine/run.test.ts`　Expected: 14 passed。`npx tsc --noEmit` 無錯誤。
```bash
git add src/engine/rewards.ts src/engine/run.ts tests/engine/run.test.ts
git commit -m "功能：整局狀態、獎勵、罐頭鋪、貓窩、紙箱與事件結果"
```

---

### Task 14: 存檔 `save.ts`

**Files:**
- Create: `src/engine/save.ts`
- Test: `tests/engine/save.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
  export function setStore(s: KeyValueStore): void            // 預設：有 window.localStorage 就用它，否則記憶體
  export function saveRun(run: RunState): void
  export function loadRun(): RunState | null                   // 版本不符、格式壞掉 → null 並清掉
  export function hasSave(): boolean
  export function clearSave(): void
  export interface BestRecord { floor: number; won: boolean; turns: number; date: string }
  export function loadBest(): BestRecord | null
  export function recordBest(run: RunState, date?: string): BestRecord   // 通關 > 未通關；再比樓層高；再比回合少
  ```

- [ ] **Step 1: 寫失敗測試 `tests/engine/save.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { newRun, runRng } from '../../src/engine/run';
import { clearSave, hasSave, loadBest, loadRun, recordBest, saveRun, setStore } from '../../src/engine/save';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, raw: m };
}
let store: ReturnType<typeof memStore>;
beforeEach(() => { store = memStore(); setStore(store); });

describe('存檔', () => {
  it('存取一致，亂數狀態也接得上', () => {
    const run = newRun('save');
    runRng(run).next();
    saveRun(run);
    const back = loadRun()!;
    expect(back).toEqual(run);
    expect(runRng(back).next()).toBe(runRng(run).next());
  });
  it('沒存檔、版本不符、壞 JSON 都回 null', () => {
    expect(hasSave()).toBe(false);
    expect(loadRun()).toBeNull();
    store.setItem('qiuqiu-tower/run', JSON.stringify({ ...newRun('v'), version: 2 }));
    expect(loadRun()).toBeNull(); expect(hasSave()).toBe(false);
    store.setItem('qiuqiu-tower/run', '{oops');
    expect(loadRun()).toBeNull();
  });
  it('clearSave', () => {
    saveRun(newRun('c')); expect(hasSave()).toBe(true);
    clearSave(); expect(hasSave()).toBe(false);
  });
  it('最佳成績：通關優先，再比樓層，再比回合', () => {
    const a = newRun('a'); a.floor = 9; a.stats.turns = 50;
    expect(recordBest(a, '2026-08-29').floor).toBe(9);
    const b = newRun('b'); b.floor = 7;
    expect(recordBest(b).floor).toBe(9);
    const c = newRun('c'); c.floor = 15; c.status = 'won'; c.stats.turns = 80;
    expect(recordBest(c).won).toBe(true);
    const d = newRun('d'); d.floor = 15; d.status = 'won'; d.stats.turns = 60;
    expect(recordBest(d).turns).toBe(60);
    const e = newRun('e'); e.floor = 15; e.status = 'won'; e.stats.turns = 70;
    expect(recordBest(e).turns).toBe(60);
    expect(loadBest()?.turns).toBe(60);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- tests/engine/save.test.ts`　Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫 `src/engine/save.ts`**

```ts
import type { RunState } from './types';

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const RUN_KEY = 'qiuqiu-tower/run';
const BEST_KEY = 'qiuqiu-tower/best';

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
let store: KeyValueStore = (() => {
  try { if (typeof window !== 'undefined' && window.localStorage) return window.localStorage; } catch { /* 私密模式等 */ }
  return memoryStore();
})();
export function setStore(s: KeyValueStore): void { store = s; }

export function saveRun(run: RunState): void { store.setItem(RUN_KEY, JSON.stringify(run)); }

export function loadRun(): RunState | null {
  const raw = store.getItem(RUN_KEY);
  if (!raw) return null;
  try {
    const run = JSON.parse(raw) as Partial<RunState>;
    if (run.version !== 1 || !Array.isArray(run.deck) || !run.map || !run.rng) { clearSave(); return null; }
    return run as RunState;
  } catch { clearSave(); return null; }
}
export function hasSave(): boolean { return loadRun() !== null; }
export function clearSave(): void { store.removeItem(RUN_KEY); }

export interface BestRecord { floor: number; won: boolean; turns: number; date: string }
export function loadBest(): BestRecord | null {
  const raw = store.getItem(BEST_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as BestRecord; } catch { return null; }
}
function better(a: BestRecord, b: BestRecord): boolean {   // a 是否優於 b
  if (a.won !== b.won) return a.won;
  if (a.floor !== b.floor) return a.floor > b.floor;
  return a.turns < b.turns;
}
export function recordBest(run: RunState, date = new Date().toISOString().slice(0, 10)): BestRecord {
  const cur: BestRecord = { floor: run.floor, won: run.status === 'won', turns: run.stats.turns, date };
  const old = loadBest();
  const best = old && !better(cur, old) ? old : cur;
  store.setItem(BEST_KEY, JSON.stringify(best));
  return best;
}
```

- [ ] **Step 4: 跑測試、型別檢查、提交**

Run: `npm test -- tests/engine/save.test.ts`　Expected: 4 passed。`npx tsc --noEmit` 無錯誤。
```bash
git add src/engine/save.ts tests/engine/save.test.ts
git commit -m "功能：存檔與最佳成績"
```

---

### Task 15: 隨機試玩機器人 `bot.ts` 與平衡報告

**Files:**
- Create: `src/engine/bot.ts`, `tests/engine/bot.test.ts`, `tests/balance.report.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BotStats { seed: string; won: boolean; floor: number; turns: number; kills: number; deckSize: number }
  export function playRun(seed: string, opts?: { maxTurnsPerCombat?: number }): BotStats   // 卡死或例外直接 throw
  export function playCombat(cs: CombatState, rng: Rng, maxTurns: number): void             // 隨機合法動作打到結束
  ```
- 機器人自己的亂數用 `seedFromString('bot:' + seed)`，跟整局的亂數分開，兩者都確定性。事件選項要付小魚乾的由呼叫端扣（畫面 B6 同規則）。

- [ ] **Step 1: 寫失敗測試 `tests/engine/bot.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { playRun } from '../../src/engine/bot';

describe('隨機試玩', () => {
  it('200 局不當、不卡死、每局都有結果', () => {
    const results = [];
    for (let i = 0; i < 200; i++) results.push(playRun(`bot-${i}`));
    for (const r of results) {
      expect(r.floor).toBeGreaterThanOrEqual(1);
      expect(r.turns).toBeGreaterThan(0);
      expect(typeof r.won).toBe('boolean');
    }
    const wins = results.filter((r) => r.won).length;
    console.log(`隨機亂打：通關 ${wins}/200，平均到達 ${(results.reduce((s, r) => s + r.floor, 0) / 200).toFixed(1)}F`);
  }, 120_000);
  it('同種子同結果', () => {
    expect(playRun('same')).toEqual(playRun('same'));
  });
});
```

- [ ] **Step 2: 寫 `tests/balance.report.test.ts`（`npm run balance` 專用，永遠通過，只印報告）**

```ts
import { describe, it } from 'vitest';
import { playRun } from '../src/engine/bot';

describe('平衡報告', () => {
  it('500 局統計', () => {
    const rs = Array.from({ length: 500 }, (_, i) => playRun(`bal-${i}`));
    const wins = rs.filter((r) => r.won).length;
    const deaths = new Map<number, number>();
    for (const r of rs) if (!r.won) deaths.set(r.floor, (deaths.get(r.floor) ?? 0) + 1);
    const lines = [
      `通關率 ${(wins / 5).toFixed(1)}%（目標 5～15%）`,
      `平均到達 ${(rs.reduce((s, r) => s + r.floor, 0) / rs.length).toFixed(2)}F`,
      `平均牌組 ${(rs.reduce((s, r) => s + r.deckSize, 0) / rs.length).toFixed(1)} 張`,
      '陣亡樓層分布：' + [...deaths.entries()].sort((a, b) => a[0] - b[0]).map(([f, n]) => `${f}F×${n}`).join('、'),
    ];
    console.log(lines.join('\n'));
  }, 300_000);
});
```

- [ ] **Step 3: 寫 `src/engine/bot.ts`**

```ts
import { cardById } from '../content/cards';
import { eventById } from '../content/events';
import { canPlay, endTurn, playCard, resolveChoice, usePotion } from './combat';
import { nextChoices } from './map';
import { Rng, seedFromString } from './rng';
import { aliveEnemies } from './actions';
import { addCard, applyRunEffects, beginCombat, buyCard, buyRemove, chooseNode, finishCombat, makeShop, newRun, openChest, removeCard, rest, takeCardReward, upgradeCard, type RunEffectOutcome } from './run';
import { potionById } from '../content/potions';
import type { CombatState, RunState } from './types';

export interface BotStats { seed: string; won: boolean; floor: number; turns: number; kills: number; deckSize: number }

export function playCombat(cs: CombatState, rng: Rng, maxTurns: number): void {
  while (cs.phase === 'player') {
    if (cs.turn > maxTurns) throw new Error(`戰鬥超過 ${maxTurns} 回合：${cs.encounterId}`);
    if (cs.pending) {
      const pd = cs.pending;
      const n = rng.int(pd.min, pd.max);
      const picks = rng.shuffle(pd.cards).slice(0, n).map((c) => c.uid);
      if (!resolveChoice(cs, picks)) throw new Error('resolveChoice 被拒');
      continue;
    }
    const enemies = aliveEnemies(cs);
    if (cs.potions.length > 0 && rng.chance(0.3)) {
      const pid = rng.pick(cs.potions);
      const def = potionById[pid]!;
      usePotion(cs, pid, def.target === 'enemy' ? rng.pick(enemies).uid : undefined);
      continue;
    }
    const playable = cs.player.hand.filter((c) => {
      const def = cardById[c.cardId]!;
      return canPlay(cs, c.uid, def.target === 'enemy' ? enemies[0]?.uid : undefined).ok;
    });
    if (playable.length === 0 || rng.chance(0.15)) { endTurn(cs); continue; }
    const card = rng.pick(playable);
    const def = cardById[card.cardId]!;
    const target = def.target === 'enemy' ? rng.pick(aliveEnemies(cs)).uid : undefined;
    if (!playCard(cs, card.uid, target)) endTurn(cs);
  }
}

function handleOutcome(run: RunState, rng: Rng, outcome: RunEffectOutcome, maxTurns: number): void {
  if (!outcome) return;
  if ('needs' in outcome) {
    const cands = run.deck.filter((c) => (outcome.needs === 'removeCard') || (!c.upgraded && cardById[c.cardId]?.pool !== '壞毛病'));
    if (cands.length) { const c = rng.pick(cands); outcome.needs === 'removeCard' ? removeCard(run, c.uid) : upgradeCard(run, c.uid); }
  } else if ('chooseCard' in outcome) {
    if (outcome.chooseCard.length) addCard(run, rng.pick(outcome.chooseCard).id);
  } else if ('fight' in outcome) {
    const cs = beginCombat(run, outcome.fight.encounterId);
    playCombat(cs, rng, maxTurns);
    const r = finishCombat(run, cs, outcome.fight.bonusFish);
    if (r && r.cards.length) takeCardReward(run, r, rng.chance(0.7) ? rng.pick(r.cards).id : null);
  }
}

export function playRun(seed: string, opts: { maxTurnsPerCombat?: number } = {}): BotStats {
  const maxTurns = opts.maxTurnsPerCombat ?? 60;
  const run = newRun(seed);
  const rng = new Rng(seedFromString('bot:' + seed));
  let guard = 0;
  while (run.status === 'playing') {
    if (++guard > 40) throw new Error('節點推進超過 40 次');
    const node = chooseNode(run, rng.pick(nextChoices(run.map, run.currentNode)).id);
    switch (node.type) {
      case '戰鬥': case '大魔物': case '塔主': {
        const cs = beginCombat(run);
        playCombat(cs, rng, maxTurns);
        const r = finishCombat(run, cs);
        if (r && r.cards.length) takeCardReward(run, r, rng.chance(0.7) ? rng.pick(r.cards).id : null);
        break;
      }
      case '事件': {
        const ev = eventById[node.eventId!]!;
        const options = ev.choices.filter((c) => (c.costFish ?? 0) <= run.fish);
        const c = rng.pick(options.length ? options : ev.choices);
        if (c.costFish) run.fish -= c.costFish;
        handleOutcome(run, rng, applyRunEffects(run, c.outcome), maxTurns);
        break;
      }
      case '罐頭鋪': {
        const shop = makeShop(run);
        for (let i = 0; i < shop.cards.length; i++) if (rng.chance(0.4)) buyCard(run, shop, i);
        if (rng.chance(0.5) && run.deck.length > 0) buyRemove(run, rng.pick(run.deck).uid);
        break;
      }
      case '貓窩': {
        const up = run.deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病');
        if (run.hp < run.maxHp * 0.6 || up.length === 0) rest(run, '打盹'); else rest(run, '磨爪', rng.pick(up).uid);
        break;
      }
      case '紙箱': openChest(run); break;
    }
  }
  return { seed, won: run.status === 'won', floor: run.floor, turns: run.stats.turns, kills: run.stats.kills, deckSize: run.deck.length };
}
```

- [ ] **Step 4: 跑測試**

Run: `npm test -- tests/engine/bot.test.ts`　Expected: 2 passed，主控台印出通關率。若任何種子丟例外，錯誤訊息會指出是哪一場遭遇或哪個節點——那是引擎的真 bug，修引擎、不改機器人繞過；修完把該種子加成一條固定回歸測試。
Run: `npm run balance`　Expected: 印出通關率、平均樓層、陣亡分布。通關率不在 5～15% 之間就記在交接簿，數值調整留給使用者裁決（規格 §13）。

- [ ] **Step 5: 全部測試與提交**

Run: `npm test`　Expected: 全綠。`npx tsc --noEmit` 無錯誤。
```bash
git add src/engine/bot.ts tests/engine/bot.test.ts tests/balance.report.test.ts
git commit -m "測試：隨機試玩機器人 200 局與平衡報告"
```

---

## 計畫 A 完成判準

- `npm test` 全綠（含 200 局機器人）；`npx tsc --noEmit` 無錯誤。
- `git log` 有 Task 1～15 各自的提交。
- 在 `Dropbox\claude-config\SHARED_WORKLOG.md` 補一筆：完成項目、通關率數字、發現的規格疑點（例如某張牌數值明顯失衡）。
- 接著執行計畫 B：`docs/superpowers/plans/2026-08-29-plan-b-ui-art-deploy.md`。
