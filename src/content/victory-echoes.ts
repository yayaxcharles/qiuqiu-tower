import { heroName, type Hero } from '../engine/hero';

/**
 * ===== 結局的伏筆旁白（2026-09-25，劇情草稿第 4 節，使用者核可）=====
 *
 * 塔裡埋過的線，結局照「這一局真的看過什麼」收回來：五種旁白、**一局最多兩句**，結局封頂 11 句。
 * 只挑句子、不動任何數值；條件拿得到的才寫（旗標、身上的秘寶、包袱拿過沒、這隻貓以前倒下過沒）。
 *
 * 位置分兩種：塔頂那張圖的（①影子的去向、④師父親手教的那一下）插在〔來歷句〕前面，
 * 回家路那張的（②還師門秘寶、③背你回村的人、⑤還包袱）插在〔來歷句〕後面。組裝在 `dialogue.ts` 的 `victoryLinesFor`。
 *
 * 旁白一律不帶「喵」；`{名}` 在組裝時換成這一局的主角名字。
 */

/** 挑伏筆要知道的這一局狀況。**沒傳就不插**（除錯頁、既有測試照舊） */
export interface VictoryCtx {
  /** 身上的秘寶代號（`me(run, seat).relics`） */
  relics?: readonly string[];
  /** 整局旗標（`run.flags`） */
  flags?: Readonly<Record<string, boolean | undefined>>;
  /** 開局包袱拿了哪一樣（`me(run, seat).bless?.took`）；舊存檔、除錯頁開的局沒有 */
  blessTook?: string | undefined;
  /** 這隻貓**以前**在塔裡倒下過幾次（`save.ts` 的 `loadDefeats`，照角色分開記） */
  defeatsBefore?: number;
}

/** 一局最多挑幾句伏筆（草稿：嫌多可以調成 1） */
export const MAX_ECHOES = 2;
/** 結局封頂幾句（基本 8 句＋打法插句＋高難度尾聲＋伏筆） */
export const VICTORY_MAX_LINES = 11;

/** ①影子的去向 ②還師門秘寶 ③背你回村的人 ④師父親手教的那一下 ⑤還包袱——陣列順序就是優先序 */
export type EchoKind = 'shadow' | 'relic' | 'carried' | 'taught' | 'bundle';
const PRIORITY: readonly EchoKind[] = ['shadow', 'relic', 'carried', 'taught', 'bundle'];
/** 插在塔頂那張圖（〔來歷句〕前面）的兩種；其餘三種在回家路那張 */
export const TOP_ECHOES: ReadonlySet<EchoKind> = new Set<EchoKind>(['shadow', 'taught']);

type PerHero = Readonly<Record<Hero, string>>;

/** 旁白文字（草稿 4-2 節）。共用句的 `{名}` 換成主角名字、`{師}` 換成這隻貓對師父的叫法（審查後改：原稿共用句一律寫大俠貓） */
export const VICTORY_ECHOES: {
  shadowWalked: PerHero; shadowFought: string;
  woodenSword: PerHero; bracerPure: string; bracer: string; hat: string; gourd: string;
  carried: PerHero; taught: PerHero; bundle: PerHero;
} = {
  // ① 條件甲「陪它練完、它自己走了」：`chain:shadow_3_walked`
  shadowWalked: {
    ninja: '紫霧散盡的地方，那個影子抱著舊木劍走了出來。它把劍放在師父腳邊，朝球球點點頭，就滑回了他的腳下。',
    feifei: '紫霧散開，那個影子抱著舊木劍站在師父身後。它把劍放下，碰了碰菲菲的手腕，就滑回她的腳下。',
    dangdang: '紫霧散開，那個影子抱著舊木劍守在門邊。它把劍靠在大俠貓腳旁，就滑回噹噹腳下，像換班一樣。',
    fengfeng: '紫霧散開，那個影子抱著舊木劍站在最高那一階。它把劍交給大俠貓，側身一讓，滑回了封封腳下。',
  },
  // ① 條件乙「攔下它打了一場」：`chain:shadow_3_fought`（那時木劍被拋上最高那一階，一直沒人撿）
  shadowFought: '最上層的石階上，那把舊木劍還躺在原地。{名}撿起來交給{師}，腳下的影子也跟著彎了彎腰。',
  // ② 身上有好幾件只挑一件：舊木劍＞淨化過的舊護腕＞沒淨化的舊護腕＞斗笠＞酒葫蘆
  woodenSword: {
    ninja: '球球雙手捧出那把舊木劍。師父接過去，用劍背在他頭上輕輕敲了一下，跟以前一模一樣。',
    feifei: '菲菲把舊木劍還給師父。師父摸了摸劍尖那圈白布，又替她把鬆掉的布重新纏緊。',
    dangdang: '噹噹把舊木劍交還大俠貓，指了指劍身那片銅：釘子一根都沒鬆。大俠貓點點頭，把劍插回腰間。',
    fengfeng: '封封解下綁在劍鞘旁的舊木劍，交還大俠貓。兩把劍分開時輕輕碰了一聲——這趟貨，送到了。',
  },
  bracerPure: '{名}把洗乾淨的舊護腕還給{師}。他戴回手上，扣環扣到慣用的那一格，剛剛好。',
  bracer: '{名}解下那只還纏著紫氣的舊護腕。{師}一握住，最後那一絲紫氣也散了。',
  hat: '{名}把那頂斗笠還給{師}。他接過去看了看，又反手扣回{名}頭上。',
  gourd: '{名}把那只酒葫蘆遞還給{師}。他搖了搖，裡頭早就空了，還是把葫蘆繫回了腰上。',
  // ③ 這隻貓以前在塔裡倒下過（照角色分開記）。只輕輕點破「習慣一樣」，不講「原來是師父背的」
  carried: {
    ninja: '師父替球球重綁手上的繃帶，打了個又大又歪的結。球球愣住了：上次倒在塔裡、醒在村裡時，身上的繃帶也是這種結。',
    feifei: '師父把菲菲的竹筒撿起來，放在她手邊剛好搆得到的地方。菲菲一愣：上次倒在塔裡、醒在村裡時，竹筒也是這樣放的。',
    dangdang: '大俠貓替噹噹卸下護臂，把扣帶一條條鬆開放好。噹噹想起上次醒在村裡時，床邊的護臂也是這樣擺的。',
    fengfeng: '大俠貓把封封的劍和劍鞘並排放好。封封想起上次倒在塔裡、醒在村裡時，床邊的劍也是這樣擺的。',
  },
  // ④ 看過「那一招」（影子鏈、貓薄荷田那頁筆記；噹噹另有「一掌留下的凹痕」）
  taught: {
    ninja: '師父握住球球的爪子，把手腕往下輕輕壓了半寸，才鬆開。這個角度，球球在塔裡已經練過好多遍了。',
    feifei: '師父捏起她握針的手，把手腕放低了一點，才鬆開。這個位置，菲菲在塔裡已經練過好多遍。',
    dangdang: '大俠貓伸腳，輕輕踢了踢噹噹的後腳跟。噹噹沒等他開口，就先把腳站開了。',
    fengfeng: '大俠貓扶著封封的手，先讓他側過身，再把收劍的方向往身側帶了半寸。劍入鞘，一點聲音都沒有。',
  },
  // ⑤ 這一局從包袱拿過東西（幾乎每局都成立，所以排最後當墊底）
  bundle: {
    ninja: '球球把塔門口撿到的藍布包袱還給師父，借走的那一樣，他拿一條小魚乾補上。師父看了看，把結重新打回又大又歪的樣子。',
    feifei: '菲菲把藍布包袱捧給師父，小聲說少了一樣是她借的。師父沒有打開，只把那個歪歪的結重新打了一次。',
    dangdang: '噹噹把收好的藍布包袱交給大俠貓，結是他重打的，比原本整齊。大俠貓看了一眼，拆開，又打回原本那個歪結。',
    fengfeng: '封封把藍布包袱交還大俠貓，說少的那一樣記在他帳上。大俠貓擺擺手，把包袱往肩上一甩。',
  },
};

/** 影子鏈與貓薄荷田新記的三個旗標（`events-batch2.ts`、`events-rare.ts`；只記旗標，不動數值） */
export const ECHO_FLAGS = {
  shadowFought: 'chain:shadow_3_fought',
  shadowWalked: 'chain:shadow_3_walked',
  catnipPage: 'catnip_page',
} as const;

/** 這一種伏筆在這一局成不成立；成立就回那一句（`{名}` 還沒換） */
function echoText(kind: EchoKind, hero: Hero, ctx: VictoryCtx): string | null {
  const flag = (name: string): boolean => ctx.flags?.[name] === true;
  const has = (id: string): boolean => ctx.relics?.includes(id) ?? false;
  const walked = flag(ECHO_FLAGS.shadowWalked);
  switch (kind) {
    case 'shadow':
      if (walked) return VICTORY_ECHOES.shadowWalked[hero];
      return flag(ECHO_FLAGS.shadowFought) ? VICTORY_ECHOES.shadowFought : null;
    case 'relic':
      if (has('master_wooden_sword')) return VICTORY_ECHOES.woodenSword[hero];
      if (has('master_bracer_pure')) return VICTORY_ECHOES.bracerPure;
      if (has('master_bracer')) return VICTORY_ECHOES.bracer;
      if (has('master_hat')) return VICTORY_ECHOES.hat;
      return has('master_gourd') ? VICTORY_ECHOES.gourd : null;
    case 'carried':
      return (ctx.defeatsBefore ?? 0) >= 1 ? VICTORY_ECHOES.carried[hero] : null;
    case 'taught': {
      /*
       * 球球不看 `chain:shadow_2_watched`：單人球球的第二集換成「屋頂上的影子」（`soloHeroSwap`），
       * 躲著看的那一版沒有「壓半寸」這一招。噹噹多一條「一掌留下的凹痕」（事件開頭就是大俠貓踢他後腳跟的回憶）。
       */
      const seen = walked || flag(ECHO_FLAGS.catnipPage)
        || (hero !== 'ninja' && flag('chain:shadow_2_watched'))
        || (hero === 'dangdang' && flag('event:dangdang_old_dent'));
      return seen ? VICTORY_ECHOES.taught[hero] : null;
    }
    case 'bundle':
      return ctx.blessTook ? VICTORY_ECHOES.bundle[hero] : null;
  }
}

/**
 * 照優先序挑這一局的伏筆，最多 `min(MAX_ECHOES, room)` 句（`room`＝離封頂還差幾句）。
 * 回傳照優先序排好、`{名}` 已換成主角名字。
 */
export function victoryEchoes(hero: Hero, ctx: VictoryCtx, room: number): { kind: EchoKind; text: string }[] {
  const quota = Math.max(0, Math.min(MAX_ECHOES, room));
  const name = heroName({ hero });
  // 球球、菲菲開口閉口都叫「師父」，噹噹、封封叫「大俠貓」（各自那幾句本來就這樣寫）
  const master = hero === 'ninja' || hero === 'feifei' ? '師父' : '大俠貓';
  const out: { kind: EchoKind; text: string }[] = [];
  for (const kind of PRIORITY) {
    if (out.length >= quota) break;
    const t = echoText(kind, hero, ctx);
    if (t) out.push({ kind, text: t.replace(/\{名\}/g, name).replace(/\{師\}/g, master) });
  }
  return out;
}
