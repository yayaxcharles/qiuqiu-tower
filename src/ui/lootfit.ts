/*
 * 事件結果：獲得物展示放不進畫面時收小（2026-09-30 英日極端版面檢查 中-2；繁中「貪心商人」那篇本來就有）。
 *
 * 拿到三、四樣秘寶或忍具時，每樣是一個直欄（效果一段話、大圖示、種類標籤加名字），一列放不下就換成兩列，
 * 疊在插圖下緣往上長，最上面那一列跑出畫面上緣、被狀態列吃掉（英文最多超出 311 像素）。
 * 對白框裡那一列「獲得…」本來就有名字與效果，展示區收小不會少資訊。
 * 作法同 `fitGoods`：畫好之後量現場，超出才一級一級收，放得下的一個像素都不動：
 *   第 1 級 拿掉圖示上方那段效果（對白框裡有），只留圖示與名字；
 *   第 2 級 圖示 150→96、名字 30→21、種類標籤縮小、單排不換行。
 * 純判斷放這裡（測試直接呼叫），量版面在 `fitLoot`。
 */

/** 展示區上緣（舞台座標）至少要在這裡以下：狀態列高 56 加 3 像素底邊，再留 4 像素 */
export const LOOT_TOP_LIMIT = 63;
export const LOOT_LEVELS = 2;

/** 從第 1 級起挑第一個放得下的級；`over(level)` 套上後回傳還超出上緣幾像素（≤ 0＝放得下） */
export function pickLootLevel(over: (level: number) => number, max = LOOT_LEVELS): number {
  for (let l = 1; l <= max; l++) if (over(l) <= 0) return l;
  return max;
}

/** 量現場：展示區上緣比 `LOOT_TOP_LIMIT` 高出幾像素（＞0＝跑出去） */
function lootOver(scene: HTMLElement): number {
  const box = scene.querySelector<HTMLElement>('.scene-art .showcase.icons');
  const stage = document.getElementById('stage')?.getBoundingClientRect();
  if (!box || !stage || stage.width <= 0) return 0;
  const k = stage.width / 1280;
  return LOOT_TOP_LIMIT - (box.getBoundingClientRect().top - stage.top) / k;
}

/** 畫好之後叫（節點要已經在文件裡）：獲得物展示超出上緣才收小 */
export function fitLoot(scene: HTMLElement): void {
  const box = scene.querySelector<HTMLElement>('.scene-art .showcase.icons');
  if (!box || !scene.isConnected) return;
  for (let i = 1; i <= LOOT_LEVELS; i++) box.classList.remove(`fit-${i}`);
  if (lootOver(scene) <= 0) return;
  pickLootLevel((l) => {
    for (let i = 1; i <= LOOT_LEVELS; i++) box.classList.toggle(`fit-${i}`, i <= l);
    return lootOver(scene);
  });
}
