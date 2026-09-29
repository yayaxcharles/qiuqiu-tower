/**
 * 畫面上顯示牌、秘寶、忍具、魔物名字與說明時一律走這裡（多語系第一片，2026-09-29）。
 * 繁中照舊回牌表上的中文（含角色專屬牌名）；英日照 id 查語言包，缺譯退回中文。
 */
import { cardNameFor } from '../content/cards';
import { enemyNameFor } from '../content/enemies';
import { isMiasma, MIASMA_PURE, PURIFY_CHANGE, relicById, RELIC_SETS, relicLongText, setCount, setMembers } from '../content/relics';
import type { CardDef, PotionDef, RelicDef } from '../engine/types';
import { cardNameL, currentPack, enemyNameL, listJoin, potionNameL, potionTextL, relicNameL, relicTextL, t, term } from './index';

export function cardName(def: CardDef, hero: string | undefined): string {
  return cardNameL(def, hero, cardNameFor(def, hero));
}
export function relicName(def: Pick<RelicDef, 'id' | 'name'>): string { return relicNameL(def.id, def.name); }
export function relicText(def: Pick<RelicDef, 'id' | 'text'>): string { return relicTextL(def.id, def.text); }
export function potionName(def: Pick<PotionDef, 'id' | 'name'>): string { return potionNameL(def.id, def.name); }
export function potionText(def: Pick<PotionDef, 'id' | 'text'>): string { return potionTextL(def.id, def.text); }
/** 魔物名（含鏡中對手那種照角色換皮的名字：換皮的譯名以 `skin:<角色>:<id>` 查） */
export function enemyName(enemyId: string, hero?: string): string {
  const zh = enemyNameFor(enemyId, hero);
  const p = currentPack();
  if (!p) return zh;
  return p.enemy[`skin:${hero ?? 'ninja'}:${enemyId}`] ?? enemyNameL(enemyId, zh);
}

/** `relicLongText` 的多語系版（套組、淨化那一段也照語言組） */
export function relicLong(def: RelicDef, owned: readonly string[] = [], brief = false): string {
  if (!currentPack()) return relicLongText(def, owned, brief);
  const text = relicText(def);
  if (isMiasma(def.id)) {
    const pure = relicById[MIASMA_PURE[def.id] ?? ''];
    const ch = PURIFY_CHANGE[def.id];
    if (!pure || !ch) return `${text} ${t('（可淨化）')}`;
    if (brief) return `${text} ${t('（可淨化成「{name}」，{gist}）', { name: relicName(pure), gist: t(ch.gist) })}`;
    const good = listJoin(ch.good.map((s) => t(s)));
    const bad = ch.bad.length ? t('；代價是{bad}', { bad: listJoin(ch.bad.map((s) => t(s))) }) : '';
    return `${text} ${t('（沾了魔氣，可以在貓窩、玳瑁婆婆、某些事件淨化；淨化後變成「{name}」：{good}{bad}）', { name: relicName(pure), good, bad })}`;
  }
  if (!def.set) return text;
  return `${text} ${t('【{set} {n}／{of}】{bonus}。', {
    set: term(def.set), n: setCount(def.set, owned), of: setMembers(def.set).length, bonus: t(RELIC_SETS[def.set].text),
  })}`;
}
