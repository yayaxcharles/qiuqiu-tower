import type { CardDef } from '../../engine/types';
import { describeCard } from '../../ui/cardtext';

/** 暫時：還沒寫好日文規則前先回中文 */
export function describeCardJa(def: CardDef, upgraded: boolean, plays: number): string { return describeCard(def, upgraded, plays); }
