# 封封效果介面

本文件固定封封 32 張牌共用的引擎效果介面。牌面預覽與正式結算應讀取同一組 `Effect` 欄位，不另外複製傷害或蓄氣公式。

## 戰鬥狀態

`PlayerCombat` 新增下列可選欄位；舊戰鬥快照缺欄位時一律視為零或未啟用。

```ts
qi?: number;                         // 蓄氣，0～12
nextAttackBonus?: number;            // 本玩家階段下一張合法攻擊的首段首目標加成
energyGainBlockedThisPhase?: true;   // 本玩家階段禁止新增飯糰
```

持續能力仍存在 `powers`。其中 `afterCard` 只在本人成功打出的牌完成原始效果與反應後檢查；`firedTurn` 記錄本回合已觸發，重連時必須保留。

```ts
type PowerTrigger = 'turnStart' | 'onKill' | 'turnEndNoAttack' | 'passive' | 'afterCard';

type PlayerPower = {
  trigger: PowerTrigger;
  effects: Effect[];
  cardId?: string;
  upgraded?: boolean;
  cardType?: '攻擊' | '技能' | '能力';
  minQiSpent?: number;
  oncePerTurn?: true;
  firedTurn?: number;
};
```

`EffectCtx` 提供同一次施放共用的解析資料：

```ts
qiBefore?: number;        // 出牌前蓄氣快照
qiSpent?: number;         // 本次施放實際支付量 S
allyBlockBefore?: number; // 出牌時受益者的蜷縮快照
nextAttackBonus?: number; // 本次攻擊可用的一次性加成
nextAttackBonusUsed?: true;
```

## 效果種類

```ts
{ kind: 'gainQi'; n: number }

{ kind: 'damageSpendQi'; amount: number; perQi: number;
  maxQi?: number; allQi?: true; times?: number;
  target?: 'enemy' | 'all'; ignoreBlock?: true }

{ kind: 'blockSpendQi'; amount: number; perQi: number;
  maxQi: number; recipient?: 'self' | 'ally' }

{ kind: 'nextAttackBonusSpendQi'; amount: number; perQi: number;
  maxQi: number; recipients: 'ally' | 'selfAndAlly' }

{ kind: 'ifQiAtPlay'; min: number; then: Effect[] }
{ kind: 'ifSpentQiAtLeast'; min: number; then: Effect[] }
{ kind: 'ifAllyBlockAtPlay'; min: number; then: Effect[] }
{ kind: 'preventEnergyGainThisPhase' }
```

既有 `power` 效果增加下列可選欄位：

```ts
{ kind: 'power'; trigger: PowerTrigger; effects: Effect[];
  cardType?: '攻擊' | '技能' | '能力';
  minQiSpent?: number; oncePerTurn?: true; sameNameMax?: true }
```

`sameNameMax` 以 `cardId` 合併同名能力：升級版取代基礎版，基礎版不得把升級版降級；取代時保留 `firedTurn`，不會重置本回合已用次數。

## 固定結算規則

1. `damageSpendQi`、`blockSpendQi`、`nextAttackBonusSpendQi` 在同一次施放中共用一份 `qiSpent`，只扣一次。影子分身或追加施放會建立新的解析資料，重新取得當時蓄氣並支付。
2. `damageSpendQi` 的單段值為 `amount + perQi * qiSpent`。多段與全體共用一次支付，但每段、每個目標各走一般傷害流程；爪力與既有傷害修正照常生效。
3. 下一擊加成只套在第一個實際傷害呼叫，之後立刻標記已用。合法攻擊即清除玩家欄位，即使最後造成零傷害；非法出牌不清除。
4. `recipients: 'ally'` 在單人或同伴倒下時退回自己；存活且已結束回合的同伴仍是受益者，但不能接受下一擊準備，因此出牌前拒絕。斷線不改變座位或存活判定。
5. `recipients: 'selfAndAlly'` 對每位可受益者各自取大，不相加；至少一位能提高才可出牌。已結束回合者略過，倒下同伴不產生第二份自用加成。
6. `gainQi` 把結果限制在 0～12。正式倒下、撤離或戰鬥結束清零；回合結束保留；新戰鬥先歸零，再執行舊劍穗。
7. `preventEnergyGainThisPhase` 只擋新增飯糰。既有飯糰仍可支付；轉移若受益者被封禁，贈送者不扣；下一個本人回合開始時解除。
8. `afterCard` 能力按原牌完成後執行，能力產生的效果不會再形成出牌事件。施放者倒下或戰鬥已結束時不執行。
9. `fengfeng_zhuanshen` 的牌面效果順序固定為先獲得蜷縮，再獲得 2 蓄氣。
