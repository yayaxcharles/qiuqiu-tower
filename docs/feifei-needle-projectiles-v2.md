# 菲菲飛針投射物第二版

## 範圍

本版只改飛針演出與時間資料，不改卡牌費用、傷害、狀態、目標、段數或引擎結算。每一波可以畫多枚裝飾針，但只在該波的真實 `impactTimes` 呼叫一次 `onImpact(wave)`。

## 招式資料介面

`src/ui/feifei-needle-patterns.ts` 匯出：

- `FeifeiNeedleAction`
- `isFeifeiNeedleAction(action)`
- `feifeiNeedleFlightMs(action)`
- `feifeiNeedleGapMs(action)`
- `feifeiNeedleReleaseTimes(action)`
- `FEIFEI_NEEDLE_CARD_ACTION`

| 招式 | 離手時間（毫秒） | 飛行時間（毫秒） | 額外波距（毫秒） | 牌號 |
| --- | ---: | ---: | ---: | --- |
| `shuriken` | 285 | 170 | 140 | `feifei_feizhen` |
| `storm` | 285、385 | 170 | 140 | 舊相容保留 |
| `needle_combo` | 220、380 | 160 | 140 | `feifei_lianzhen` |
| `needle_backhand` | 260 | 150 | 140 | `feifei_shouhua` |
| `needle_venom` | 360 | 210 | 140 | `feifei_jianxue` |
| `needle_pierce` | 420 | 100 | 140 | `feifei_yizhen` |
| `needle_retreat` | 260 | 180 | 140 | `feifei_buyaoguolai` |
| `needle_fan` | 285 | 180 | 140 | `feifei_sazhen` |
| `needle_rain` | 350 | 400 | 140 | `feifei_zhenyu` |
| `needle_barrage` | 350 | 220 | 140 | `feifei_quansale` |

## 播放介面

```ts
playFeifeiNeedles(stage, from, to, {
  action,
  waves,
  elapsed,
  impactTimes,
  onImpact,
  onDone,
});
```

- `from`、`to` 都是呼叫端已換算好的舞台座標，不查詢全域元素。
- `waves` 是真實結算波數；零波不建立畫布、不呼叫 `onImpact`，下一動畫幀直接呼叫 `onDone`。
- `impactTimes[wave]` 是每波相對本次播放起點的真實抵達時點。每波所有裝飾針都在同一時點抵達。
- `elapsed` 用於追上已經經過的時間。低幀率一次跨過多個抵達時點時，各波仍依序且只回呼一次。
- 回傳函式可以重複取消；取消後清除飛行與命中殘效，不再呼叫 `onImpact` 或 `onDone`。
- 不同呼叫各自保存動畫幀、畫布與狀態，取消其中一張牌不影響另一張。
- `onDone` 等到最後一波的短暫命中殘效也清除後才呼叫。

## 十種視覺差異

- 飛針：單枚銀針直線飛行。
- 舊針雨：每波三枚平行針，保留 285／385 毫秒節奏。
- 連針：依真實兩段或三段出針，前手高手與後手低手交替。
- 手滑：反手拋出的低弧線，命中出現短促偏斜火花。
- 見血封喉：單針收束後爆開紫色毒花與放射線，沒有瓶子圖案。
- 一針斃命：唯一 100 毫秒高速飛行與加長銀白尾跡；沒有真實波數就不發射。
- 不要過來：起點向後偏移，七枚驚慌扇形針向同一目標收束，同波只回呼一次。
- 撒針：五枚水平扇面在途中向上下展開，再隨各次呼叫前往各自目標。
- 針雨：從傳入起點再偏移 `x - 45`、`y - 110`，由頭頂雙手位置先向上拋出，再沿高拋物線陡落到清楚的真實目標。
- 全撒了：十二枚針由前後兩手大幅張開成網，再向目標收束；數量與路線均不同於撒針及針雨。

## 瀏覽器辨識欄位

飛行畫布提供 `data-pattern`、`data-wave`、`data-route`、`data-phase="flight"`、`data-needle-count`、`data-hands`、`data-x` 與 `data-y`。連針另有 `data-hand`；一針斃命另有 `data-trail="long"`。

短暫命中畫布提供 `data-pattern`、`data-wave`、`data-phase="impact"` 與 `data-effect`。這些畫布由動畫幀時鐘清理，不留下永久線條。

## 驗收重點

1. 同波裝飾針只能造成一次 `onImpact(wave)`。
2. `elapsed` 跨過多波時不得漏掉或重複回呼。
3. 取消、重複取消、離場清理與兩張並行互不影響。
4. 針雨離手位置需和雙手舉過頭頂的全身動作對齊，且中途要有明顯上拋階段。
5. 所有終點都使用傳入的真實目標座標；不得用全域選擇器或延時計時猜測目標。
