/**
 * 出牌動作盤點（2026-09-21）：四隻貓每張「會出現在牌組裡、打得出去」的牌，
 * 出牌時選到哪個新版逐格動作；選不到的話退回哪張舊版靜態立繪。
 *
 * 判斷邏輯**直接從 combat.ts 摳出來執行**（`POSE`、`ATTACK_POSE`、`SKILL_POSE`、`cardPose`、`motionForCard`），
 * 不自己抄一份，這樣戰鬥畫面改了、盤點就跟著變。
 *
 * 平常 `npm test` 不跑（只在設了 CARD_MOTION_INVENTORY 時跑）：
 *   CARD_MOTION_INVENTORY=docs/審查報告/缺動作的牌_2026-09-21 npx vitest run tools/card_motion_inventory.test.ts
 * 會寫出 `<路徑>.md`（給人看）與 `<路徑>.json`（給之後的程式用）。
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import SRC from '../src/ui/screens/combat.ts?raw';
import { cards, cardNameFor, starterDeckFor } from '../src/content/cards';
import { pickable, type Hero } from '../src/engine/hero';
import { cardStats } from '../src/engine/deck';
import { describeCard } from '../src/ui/cardtext';
import { _setManifestForTest, hasHeroSprite, heroSpriteKey } from '../src/ui/assets';
import { qiuqiuCardAction, qiuqiuHasOwnMotion, qiuqiuMotionDuration, qiuqiuIsMelee, type QiuqiuAction } from '../src/ui/qiuqiu-motion';
import { qiuqiuChoreographyDuration, type QiuqiuPoseAction } from '../src/ui/qiuqiu-choreography';
import {
  companionCardAction, companionHasOwnMotion, companionIsMelee, companionMotionDuration,
  type CompanionMotionAction, type CompanionMotionKind,
} from '../src/ui/companion-motion';
import type { CardDef } from '../src/engine/types';

const OUT = (process.env as Record<string, string | undefined>).CARD_MOTION_INVENTORY;

type Source = 'qiuqiu' | CompanionMotionKind;
const HEROES: readonly { hero: Hero; source: Source; name: string }[] = [
  { hero: 'ninja', source: 'qiuqiu', name: '球球' },
  { hero: 'feifei', source: 'feifei', name: '菲菲' },
  { hero: 'dangdang', source: 'dangdang', name: '噹噹' },
  { hero: 'fengfeng', source: 'fengfeng', name: '封封' },
];

function branch(start: string, end: string): string {
  const src = SRC.replace(/\r\n/g, '\n');
  const first = src.indexOf(start);
  const last = src.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`combat.ts 找不到這一段：${start}`);
  return src.slice(first, last);
}

async function combatLogic() {
  const code = [
    branch('const POSE = {', 'type PoseKey'),
    branch('const ATTACK_POSES = new Set', '/** 吃喝姿勢'),
    branch('const EAT_CARDS: ReadonlySet<string>', 'const EAT_POTIONS'),
    branch('const posePick = ', '/** 這一位的立繪網址 */'),
    branch('function cardPose(', '/** 用忍具時球球擺什麼姿勢'),
    branch('const THROW_CARDS: ReadonlySet<string>', 'const THROW_POTIONS'),
    'let clawMotionIndex = 0;',
    branch('  const motionForCard = (', '  const scheduleMotionImpact = ('),
    'return { POSE, ATTACK_POSE, SKILL_POSE, cardPose, motionForCard, resetClaw: () => { clawMotionIndex = 0; } };',
  ].join('\n');
  const bindings = {
    hasHeroSprite, qiuqiuCardAction, companionCardAction, cardStats,
    // 盤點看的是「選哪個動作」，圖有沒有下載好是執行當下的事，這裡一律當作到了
    qiuqiuCardMotionPlayable: () => true, companionCardMotionPlayable: () => true,
    motionEnabled: true,
    motionSourceFor: (q: { source: Source }) => q.source,
    companionKind: (source: CompanionMotionKind) => source,
  };
  const compiled = await transformWithOxc(code, 'combat-card-motion.ts');
  return new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as {
    POSE: Record<string, string>;
    ATTACK_POSE: Record<string, string>;
    SKILL_POSE: Record<string, string>;
    cardPose(hero: Hero, def: CardDef, effects?: readonly unknown[]): { pose: string; attack: boolean };
    motionForCard(q: { source: Source }, card: { uid: number; cardId: string; upgraded: boolean }): string | undefined;
    resetClaw(): void;
  };
}

/** 動作名 → 真的有逐格素材嗎（不算退回一般待機的退路）；組合動作（分身連打等）也算有 */
function ownMotion(source: Source, action: string): boolean {
  if (source === 'qiuqiu') {
    return qiuqiuHasOwnMotion(action as QiuqiuPoseAction) || qiuqiuChoreographyDuration(action as QiuqiuAction) !== null;
  }
  if (source === 'feifei' && action === 'clone') return true;   // 菲菲分身：結印＋分身特效
  return companionHasOwnMotion(source, action as CompanionMotionAction);
}

function duration(source: Source, action: string): number {
  return source === 'qiuqiu' ? qiuqiuMotionDuration(action as QiuqiuAction)
    : companionMotionDuration(source, action as CompanionMotionAction);
}

function melee(source: Source, action: string): boolean {
  return source === 'qiuqiu' ? qiuqiuIsMelee(action as QiuqiuAction) : companionIsMelee(source, action as CompanionMotionAction);
}

/** 這位拿得到、打得出去的牌：起手牌＋獎勵／罐頭鋪／事件池（忍術、絕學；連線牌也算，標出來） */
function deckCards(hero: Hero): { def: CardDef; starter: boolean }[] {
  const starter = new Set(starterDeckFor(hero));
  const out: { def: CardDef; starter: boolean }[] = [];
  for (const def of cards) {
    if (def.pool === '壞毛病' || def.combatOnly || def.keywords?.includes('不可打出')) continue;
    if (starter.has(def.id)) { out.push({ def, starter: true }); continue; }
    if (def.pool === '起手') continue;
    if (pickable(def, hero, 2)) out.push({ def, starter: false });
  }
  return out;
}

const EFFECT_WORD: Record<string, string> = {
  damage: '傷害', damageAll: '全體傷害', block: '蜷縮', status: '狀態', draw: '抽牌', heal: '回血', energy: '飯糰',
  power: '能力', blockAll: '全隊蜷縮', blockAlly: '給隊友蜷縮', statusAlly: '給隊友狀態', drawAlly: '隊友抽牌',
  energyAlly: '給隊友飯糰', cleanseAlly: '幫隊友清減益', cleanse: '清減益', taunt: '嘲諷',
};

type Row = {
  hero: string; heroName: string; id: string; name: string; type: string; pool: string; rarity: string;
  exclusive: boolean; coop: boolean; starter: boolean; text: string; kinds: string[];
  attackFamily?: string; skillFamily?: string;
  base: { action?: string; own: boolean; pose: string; sprite: string; duration?: number; melee?: boolean };
  up: { action?: string; own: boolean; pose: string; sprite: string };
  gap: 'none' | 'base' | 'up' | 'both';
};

it.skipIf(!OUT)('出牌動作盤點', async () => {
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8'));
  _setManifestForTest(manifest);
  const logic = await combatLogic();
  const rows: Row[] = [];
  for (const { hero, source, name: heroName } of HEROES) {
    for (const { def, starter } of deckCards(hero)) {
      const side = (upgraded: boolean) => {
        logic.resetClaw();
        const inst = { uid: 1, cardId: def.id, upgraded };
        const stats = cardStats(inst);
        const action = logic.motionForCard({ source }, inst);
        const pose = logic.cardPose(hero, def, stats.effects).pose;
        const sprite = heroSpriteKey(hero, pose);
        const own = action !== undefined && ownMotion(source, action);
        return { action, own, pose, sprite,
          duration: action && own ? duration(source, action) : undefined,
          melee: action && own ? melee(source, action) : undefined };
      };
      const base = side(false);
      const up = side(true);
      const gap = !base.own && !up.own ? 'both' : !base.own ? 'base' : !up.own ? 'up' : 'none';
      rows.push({
        hero, heroName, id: def.id, name: cardNameFor(def, hero), type: def.type, pool: def.pool, rarity: def.rarity,
        exclusive: !!def.hero, coop: !!def.coop, starter,
        text: describeCard(def, false).replace(/\s+/g, ' '),
        kinds: [...new Set(def.effects.map((e) => e.kind))],
        attackFamily: logic.ATTACK_POSE[def.id], skillFamily: logic.SKILL_POSE[def.id],
        base, up: { action: up.action, own: up.own, pose: up.pose, sprite: up.sprite }, gap,
      });
    }
  }
  writeFileSync(`${OUT}.json`, JSON.stringify(rows, null, 1), 'utf-8');

  const poseName = (pose: string) => pose.replace(/^hero\/ninja_?/, '') || 'idle';
  const lines: string[] = [];
  lines.push('# 出牌時沒有新版逐格動作的牌（盤點，2026-09-21）', '');
  lines.push('> 由 `tools/card_motion_inventory.test.ts` 產生：判斷邏輯直接從 `src/ui/screens/combat.ts` 摳出來執行'
    + '（`motionForCard` → `qiuqiuCardAction`／`companionCardAction`；靜態姿勢 `cardPose`），不是手抄。', '');
  lines.push('**範圍**：每隻貓的起手牌＋獎勵／罐頭鋪／事件池（忍術、絕學，含連線牌）；排除壞毛病（詛咒）、戰鬥雜牌（黏液、眼冒金星）、不可打出的牌。',
    '**「缺」的定義**：`motionForCard` 回傳空（戰鬥畫面收起動作畫布、舊版靜態立繪亮 650 毫秒），'
    + '或回傳的動作名沒有自己的逐格素材（會退成一般待機，看起來像沒出招）。基礎版與升級版分開看。', '');
  lines.push('## 總表', '', '| 角色 | 可打出的牌 | 有動作 | 缺動作（基礎版） | 只有升級版缺 | 攻擊牌缺 | 技能牌缺 | 能力牌缺 |', '|---|---|---|---|---|---|---|---|');
  for (const { hero, name } of HEROES) {
    const mine = rows.filter((r) => r.hero === hero);
    const miss = mine.filter((r) => r.gap === 'both' || r.gap === 'base');
    lines.push(`| ${name} | ${mine.length} | ${mine.filter((r) => r.gap === 'none').length} | ${miss.length} | ${mine.filter((r) => r.gap === 'up').length}`
      + ` | ${miss.filter((r) => r.type === '攻擊').length} | ${miss.filter((r) => r.type === '技能').length} | ${miss.filter((r) => r.type === '能力').length} |`);
  }
  lines.push('');
  for (const { hero, name } of HEROES) {
    const mine = rows.filter((r) => r.hero === hero);
    const miss = mine.filter((r) => r.gap !== 'none');
    lines.push(`## ${name}：缺動作的牌（${miss.length} 張）`, '');
    lines.push('| 牌號 | 牌名 | 類型 | 池／稀有度 | 招式家族 | 靜態姿勢（實際立繪） | 選到的動作 | 牌面效果 |', '|---|---|---|---|---|---|---|---|');
    const order = ['攻擊', '技能', '能力'];
    miss.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || poseName(a.base.pose).localeCompare(poseName(b.base.pose)) || a.id.localeCompare(b.id));
    for (const r of miss) {
      const tags = [r.exclusive ? '獨占' : '', r.coop ? '連線' : '', r.starter ? '起手' : ''].filter(Boolean).join('、');
      const fam = r.attackFamily ?? r.skillFamily ?? '—';
      const action = r.gap === 'up' ? `基礎 ${r.base.action}；升級 ${r.up.action ?? '（無）'}`
        : r.base.action ? `${r.base.action}（沒有素材，退成待機）` : '（無）';
      const pose = r.base.pose === r.up.pose ? poseName(r.base.pose) : `${poseName(r.base.pose)}／升級 ${poseName(r.up.pose)}`;
      lines.push(`| \`${r.id}\` | ${r.name} | ${r.type} | ${r.pool}／${r.rarity}${tags ? `（${tags}）` : ''} | ${fam} | ${pose}（\`${r.base.sprite}\`） | ${action} | ${r.text.replace(/\|/g, '／')} |`);
    }
    lines.push('');
    lines.push(`### ${name}：已有動作的牌（${mine.length - miss.length} 張，對照用）`, '');
    const byAction = new Map<string, string[]>();
    for (const r of mine.filter((x) => x.gap === 'none')) {
      const key = r.base.action === r.up.action ? r.base.action! : `${r.base.action}／升級 ${r.up.action}`;
      byAction.set(key, [...(byAction.get(key) ?? []), `${r.name}`]);
    }
    for (const [action, names] of [...byAction].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`- \`${action}\`（${names.length}）：${names.join('、')}`);
    }
    lines.push('');
  }
  writeFileSync(`${OUT}.md`, lines.join('\n') + '\n', 'utf-8');
});
