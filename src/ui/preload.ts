import { encounterById, encounters, enemyById } from '../content/enemies';
import { bossPoolForAct } from '../engine/run';
import type { EnemyDef, EnemyEffect, EnemyPool } from '../engine/types';
import { hasMonsterPose, monsterUrl, type MonsterPose } from './assets';

/**
 * 魔物立繪的分關預載（使用者 2026-09-04：「戰鬥中圖要直接到位，不然會有灰影」）。
 *
 * 首載只抓 UI／牌面／背景與**第一關**會遇到的魔物；第二、三關的魔物等過關時再抓。
 * 另外每場戰鬥開打前先把這場會出現的（含牠們召喚得出來的）解碼好，最多等 1.5 秒，
 * 沒等到也照開——寧可偶爾閃一下也不能卡住不開打。
 *
 * 首載預算（tools/check_size.py）配合這裡：第一關用不到的魔物歸「分關載入」，不算首載。
 */

const POSES: MonsterPose[] = ['idle', 'attack', 'hurt', 'block'];

/** 這隻怪自己＋牠召得出來的、分裂得出來的全部魔物 id */
function relatedIds(id: string, out: Set<string>): void {
  if (out.has(id)) return;
  const def = enemyById[id];
  if (!def) return;
  out.add(id);
  const fx: EnemyEffect[] = [];
  for (const m of def.moves) fx.push(...m.effects);
  for (const ph of def.phases ?? []) { fx.push(...ph.onEnter); for (const m of ph.moves) fx.push(...m.effects); if (ph.onEnterMove) fx.push(...ph.onEnterMove.effects); }
  for (const f of fx) if (f.kind === 'summon') relatedIds(f.enemyId, out);
  if (def.splitInto) relatedIds(def.splitInto.enemyId, out);
}

/** 這一關可能遇到的所有魔物（一般池、菁英、關主、召喚物） */
export function enemyIdsForAct(act: number): Set<string> {
  const pools: EnemyPool[] = act >= 2 ? ['中', '強', '大魔物'] : ['弱', '中', '強', '大魔物'];
  const ids = new Set<string>();
  for (const enc of encounters) {
    if (enc.hidden) continue;   // 立繪還沒到齊的遭遇地圖抽不到，也不用預載（稽核 2026-09-04 中 3）
    const inAct = !enc.acts || enc.acts.includes(act);
    const take = (pools.includes(enc.pool) && inAct) || (enc.pool === '塔主' && bossPoolForAct(act).includes(enc.id));
    if (!take) continue;
    for (const id of enc.enemies) relatedIds(id, ids);
  }
  // 鏡子走廊那場（事件觸發，池標召喚）依關數接 _a<關數>
  for (const enc of encounters) if (enc.id === 'mirror_duel' || enc.id === `mirror_duel_a${act}`) for (const id of enc.enemies) relatedIds(id, ids);
  return ids;
}

/** 這一關會用到的立繪鍵（manifest.monsters 的鍵） */
export function monsterArtKeysForAct(act: number): string[] {
  const keys = new Set<string>();
  for (const id of enemyIdsForAct(act)) { const def = enemyById[id]; if (def && def.art !== 'daxia') keys.add(def.art); }
  return [...keys];
}

function urlsFor(defs: EnemyDef[]): string[] {
  const urls: string[] = [];
  for (const def of defs) {
    if (def.art === 'daxia') continue;   // 師父的立繪組在 sprites 裡，首載本來就有
    for (const pose of POSES) if (hasMonsterPose(def.art, pose)) urls.push(monsterUrl(def.art, pose));
  }
  return [...new Set(urls)];
}

const warmed = new Set<string>();
/** 撐住 Image 物件的參照：沒人引用的圖下載沒完成就可能被回收（稽核 2026-09-04 低 14） */
const keep: HTMLImageElement[] = [];

/** 把一批圖片下載並解碼好（失敗就算了，不該讓流程停掉） */
async function decodeAll(urls: string[], concurrency = 4): Promise<void> {
  if (typeof Image === 'undefined') return;   // 測試環境沒有瀏覽器
  const todo = urls.filter((u) => !warmed.has(u) && !u.startsWith('data:'));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < todo.length; i = next++) {
      const url = todo[i]!;
      try {
        const img = new Image();
        keep.push(img);
        img.src = url;
        // 沒有 decode() 的瀏覽器退回等 onload，不能直接當作暖好了
        if (typeof img.decode === 'function') await img.decode();
        else await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
        warmed.add(url);
      } catch { /* 少一張只是那張晚一點出現 */ }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/** 背景預載整關的魔物立繪（開場預載完 UI 後叫第一關；過關畫面叫下一關） */
export function preloadActMonsters(act: number): Promise<void> {
  const defs = [...enemyIdsForAct(act)].map((id) => enemyById[id]).filter((d): d is EnemyDef => !!d);
  return decodeAll(urlsFor(defs));
}

/** 開打前把這場的魔物（含召喚物）解碼好；最多等 `timeoutMs`，沒等到也照樣開打 */
export function warmEncounter(encounterId: string, timeoutMs = 1500): Promise<void> {
  const enc = encounterById[encounterId];
  if (!enc) return Promise.resolve();
  const ids = new Set<string>();
  for (const id of enc.enemies) relatedIds(id, ids);
  const defs = [...ids].map((id) => enemyById[id]).filter((d): d is EnemyDef => !!d);
  const work = decodeAll(urlsFor(defs), 6);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); });
  return Promise.race([work, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}
