import { coopStoryKey, hasCoopScene, storyFor, victoryLinesFor, type DialogueLine } from '../content/dialogue';
import { FENGFENG_YARD_FIRST } from '../content/fengfeng-dialogue';
import type { Slide } from './slides';

/*
 * 劇情幻燈片「哪張圖配哪幾句」**只算一次**（2026-09-14 夜間稽核 中-5）。
 *
 * 原本切法寫在 `app.ts` 裡，除錯模式的「劇情」頁自己又抄了一份「一張圖配一句」——
 * 抄錯了：結局第二張配成「塔主：承讓。」、第一張只列一句（遊戲裡是四到六句）、
 * 菲菲第二關第三張少一句。頁首寫「圖旁邊就是它在遊戲裡配的台詞」，照著檢查反而被誤導。
 * 現在遊戲與除錯頁都叫這三支，看到的就是同一份。
 */

/**
 * 過關與結局的插圖要**依角色**（2026-09-12）。這幾張圖裡球球都是主角（相擁那張他就在正中央），
 * 沒生好她的那一份時回她的鍵就好——`slidesReady` 查不到會讓整段退回純對白，
 * 那正是要的行為：寧可少一段幻燈片，不要放別人的故事。
 */
function stillKey(hero: string | undefined, name: string): string {
  if (hero === 'feifei') return `bg/feifei_${name}`;
  if (hero === 'dangdang') return `bg/dangdang_${name}`;
  if (hero === 'fengfeng') return `bg/fengfeng_${name}`;
  return `bg/${name}`;
}

type CoopStoryArt = { prologue: string; top: string; victory: string };

/** 封封三條合作路線各自的序章、塔頂與結局圖；其他配對仍按原規則退回文字。 */
const FENGFENG_COOP_ART: Readonly<Record<string, CoopStoryArt>> = {
  'fengfeng+ninja': {
    prologue: 'bg/fengfeng_coop_ninja_prologue',
    top: 'bg/fengfeng_coop_ninja_top',
    victory: 'bg/fengfeng_coop_ninja_victory',
  },
  'feifei+fengfeng': {
    prologue: 'bg/fengfeng_coop_feifei_prologue',
    top: 'bg/fengfeng_coop_feifei_top',
    victory: 'bg/fengfeng_coop_feifei_victory',
  },
  'dangdang+fengfeng': {
    prologue: 'bg/fengfeng_coop_dangdang_prologue',
    top: 'bg/fengfeng_coop_dangdang_top',
    victory: 'bg/fengfeng_coop_dangdang_victory',
  },
};

function fengfengCoopArt(hero: string | undefined): CoopStoryArt | undefined {
  const key = coopStoryKey(hero);
  return key === null ? undefined : FENGFENG_COOP_ART[key];
}

/**
 * 序章：四張圖。**最後一張吃掉剩下的所有句子**。
 *
 * 球球的序章有五句、圖只有四張。2026-09-12 改成兩個角色共用寫法時每張都寫成 `slice(i, i + 1)`，
 * 第五句「我要把師父帶回家，也要把村裡的小魚乾全部拿回來喵。」從那天起再也沒演過
 *（稽核 範圍外-2）。改回舊的做法：最後一張 `slice(3)`。
 */
export function prologueSlides(hero: string | undefined): Slide[] {
  const coopArt = fengfengCoopArt(hero);
  if (coopArt) {
    const pro = storyFor(hero).prologue;
    return pro.length ? [{ img: coopArt.prologue, lines: pro }] : [];
  }
  if (hasCoopScene(hero)) return [];
  const pro = storyFor(hero).prologue;
  // 第三張各家不同：球球是「師父衝進塔、他追上去」，菲菲是「三天過去，兩個都沒回來」，
  // 噹噹是「第三天，菲菲背著行囊來到門口」
  const stills = hero === 'fengfeng'
    ? ['fengfeng_still_return', 'fengfeng_still_shop', 'fengfeng_still_meet', 'fengfeng_still_tower', 'fengfeng_story_p05']
    : hero === 'feifei'
    ? ['feifei_still_teach', 'feifei_still_corrupt', 'feifei_still_wait', 'feifei_still_depart']
    : hero === 'dangdang'
      ? ['dangdang_still_shop', 'dangdang_still_gate', 'dangdang_still_send', 'dangdang_still_depart']
      : ['still_teach', 'still_corrupt', 'still_rush', 'still_depart'];
  /*
   * **標了切點就照切點分**（2026-09-17 為噹噹加的）。
   *
   * 原本一律「一張圖配一句、最後一張吃掉剩下的」。球球五句、菲菲四句，那樣剛好；
   * 噹噹的序章有十八句（他那一夜先守村口、第三天才上塔），照舊切法會變成
   * 前三張各一句、第十五句全部擠在最後一張。
   * 球球與菲菲的序章沒有標任何切點，走的還是原本那一條，一個字都沒動。
   */
  if (pro.some((l) => l.slideBreak)) {
    const groups = groupsAtBreaks(pro, stills.length);
    return groups ? stills.map((k, i) => ({ img: `bg/${k}`, lines: groups[i]! })) : [];
  }
  return stills.map((k, i) => ({ img: `bg/${k}`, lines: pro.slice(i, i === stills.length - 1 ? undefined : i + 1) }));
}

/** 照 `slideBreak` 切成 `n` 段；切點不夠、或有一段是空的就回 null（呼叫端整段不演） */
function groupsAtBreaks(lines: DialogueLine[], n: number): DialogueLine[][] | null {
  const groups: DialogueLine[][] = [[]];
  for (const l of lines) {
    groups[groups.length - 1]!.push(l);
    if (l.slideBreak && groups.length < n) groups.push([]);
  }
  /*
   * **切點不夠就整段不演**（稽核 2026-09-17 高-3）。
   *
   * 連線那兩套共用場景的序章只標了一個切點，卻要配四張圖：後兩張拿到空陣列、
   * 安靜地不出現，而前兩段配到的是**單人劇本**那四張圖（師父在教球球、師父被魔氣控制），
   * 講的卻是「村口的門剛關上」。`stillKey` 的檔頭自己寫著
   *「寧可少一段幻燈片，不要放別人的故事」——這裡回空陣列，`slidesReady` 就會讓整段退回純對白。
   */
  if (groups.length < n || groups.some((g) => g.length === 0)) return null;
  return groups;
}

/** 過關：三句台詞配三張圖，最後一張吃掉剩下的（她第二關比圖多一句） */
/*
 * 沒有專屬美術的連線場景仍退回純對白（2026-09-17 稽核 中-3）。
 *
 * 不擋的話會這樣：這兩支走的是 `stillKey(hero, …)`，回的是**單人版**的鍵，
 * 而那些圖全都在倉裡，於是 `slidesReady` 回 true，兩隻貓的對話就被鋪到
 * 「一隻貓自己站在那裡」的圖上——第一關過關詞寫「球球在樓梯旁找到糧箱，抱起來晃了晃」，
 * 圖裡根本沒有球球。`stillKey` 的檔頭訂過規矩：**寧可少一段幻燈片，不要放別人的故事。**
 * 封封三條合作路線已有獨立圖，會由 `FENGFENG_COOP_ART` 接到序章、塔頂與結局；其他配對仍回退。
 */
export function actClearSlides(hero: string | undefined, act: number): Slide[] {
  if (hasCoopScene(hero)) return [];
  const story = storyFor(hero);
  const lines = act === 1 ? story.actClear1 : story.actClear2;
  const names = act === 1
    ? ['still_act1_stairs', 'still_act1_fish', 'still_act1_climb']
    : ['still_act2_smoke', 'still_act2_voice', 'still_act2_moonstairs'];
  // 標了切點就照切點分（2026-09-23 稽核 中-4）：封封第二關六句三張圖，照舊切法噹噹那幾句全擠在他獨自一人的那張
  if (lines.some((l) => l.slideBreak)) {
    const groups = groupsAtBreaks(lines, names.length);
    return groups ? names.map((n, i) => ({ img: stillKey(hero, n), lines: groups[i]! })) : [];
  }
  return names.map((n, i) => ({ img: stillKey(hero, n), lines: lines.slice(i, i === names.length - 1 ? undefined : i + 1) }));
}

/** 塔頂關主戰前的合作場景；單人路線沒有對應幻燈片，仍使用既有文字。 */
export function topSceneSlides(hero: string | undefined): Slide[] {
  const coopArt = fengfengCoopArt(hero);
  const lines = storyFor(hero).topScene;
  if (!coopArt && hero === 'fengfeng') {
    return lines.length ? [{ img: 'bg/fengfeng_story_top', lines }] : [];
  }
  if (!coopArt) return [];
  return lines.length ? [{ img: coopArt.top, lines }] : [];
}

/**
 * 結局：兩張圖。第一張（相擁）放到標了 `slideBreak` 的那句為止，之後的（回家路、難度旁白）配第二張。
 * **不要改回比對內文**：原本寫 `includes('撲進')`，菲菲的結局沒那兩個字，
 * 切點被夾成 1，她的相擁那句就配到「回家路」的圖上（2026-09-12 稽核 中-1）。
 */
/*
 * 沒有專屬美術的連線場景仍退回純對白（2026-09-17 稽核 中-3）。
 *
 * 不擋的話會這樣：這兩支走的是 `stillKey(hero, …)`，回的是**單人版**的鍵，
 * 而那些圖全都在倉裡，於是 `slidesReady` 回 true，兩隻貓的對話就被鋪到
 * 「一隻貓自己站在那裡」的圖上——第一關過關詞寫「球球在樓梯旁找到糧箱，抱起來晃了晃」，
 * 圖裡根本沒有球球。`stillKey` 的檔頭訂過規矩：**寧可少一段幻燈片，不要放別人的故事。**
 * 封封三條合作路線的結局圖與序章、塔頂圖同一路由，其他配對仍不借用單人圖。
 */
export function endingSlides(hero: string | undefined, deckIds: string[], difficulty: number): Slide[] {
  const vic = victoryLinesFor(deckIds, difficulty, hero);
  const coopArt = fengfengCoopArt(hero);
  if (coopArt) return vic.length ? [{ img: coopArt.victory, lines: vic }] : [];
  if (hasCoopScene(hero)) return [];
  const cut = Math.max(1, vic.findIndex((l) => l.slideBreak) + 1);
  if (hero === 'fengfeng') {
    // FengFeng's last six lines are the later yard practice (EP01), after the
    // return-home and hot-soup scene; keep that scene on its own background.
    // 打法插句會插在前面（見 `victoryLinesFor`），院子那段的起點要照第一句找，不能寫死第 10 句；
    // 那一句收在具名常數裡（2026-09-23 稽核 低-6：原本寫 `victory[10]`，結局多一句少一句就切到別人的話上）
    const found = vic.findIndex((l) => l.text === FENGFENG_YARD_FIRST);
    const yardStart = found > 0 ? found : vic.length;
    return ['still_embrace', 'still_home', 'story_ep01'].map((n, i) => ({
      img: stillKey(hero, n),
      lines: i === 0 ? vic.slice(0, cut) : i === 1 ? vic.slice(cut, yardStart) : vic.slice(yardStart),
    }));
  }
  return ['still_embrace', 'still_home'].map((n, i) => ({
    img: stillKey(hero, n), lines: i === 0 ? vic.slice(0, cut) : vic.slice(cut),
  }));
}
