import { soundOn } from './audio';

/**
 * 配音的門口（2026-09-28）：留在主程式裡的只有這一小塊——開關、說話者判斷、按需載入。
 * 真正的播放在 `voice.ts`，第一次要講話才載（首載程式快滿了，配音一句都用不到的人不必下載它）。
 *
 * - 音效關掉＝配音沒聲音（使用者規則）；語音開關另外管，預設開。兩個都開才去載 `voice.ts`。
 * - `hush()`：換句、關對白框時叫。還在載 `voice.ts` 的那幾句會看到「已經叫停」而不講。
 */

const STORE_KEY = 'qiuqiu.voice';
function readEnabled(): boolean {
  try { return window.localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; }
}
let enabled = readEnabled();

export function voiceOn(): boolean { return enabled; }
export function setVoiceOn(on: boolean): void {
  enabled = on;
  try { window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 存不了就算了 */ }
  if (!on) hush();
}
export function toggleVoice(): boolean { setVoiceOn(!enabled); return enabled; }

// ---- 說話者 → 聲音角色 ----

const HERO_BY_NAME: Record<string, string> = { 球球: 'ninja', 菲菲: 'feifei', 噹噹: 'dangdang', 封封: 'fengfeng' };

/** 名牌上的主角名字 → 聲音角色（吐槽泡泡用；不是主角回 null） */
export function heroVoice(name: string): string | null { return HERO_BY_NAME[name] ?? null; }

/**
 * 劇本上的說話者 → 聲音角色，規則跟 `tools/voice/dump_lines.ts` 的 `keyOf` 一樣：
 * 「球球」不照字面播時是本機這一位（`hero`）；「塔主」是這一場的關主（師父 tower_master＝大俠貓）。
 */
export function voiceGroup(speaker: string, o: { hero?: string | undefined; literal?: boolean; bossId?: string | undefined } = {}): string | null {
  if (speaker === '旁白') return null;
  if (speaker === '球球' && !o.literal) return o.hero ?? 'ninja';
  if (HERO_BY_NAME[speaker]) return HERO_BY_NAME[speaker]!;
  if (speaker === '大俠貓') return 'daxia';
  if (speaker === '村貓') return 'villager';
  if (speaker === '黑貓忍者頭目') return 'ninja_boss';
  if (speaker === '塔主') return !o.bossId || o.bossId === 'tower_master' ? 'daxia' : o.bossId;
  return null;
}

// ---- 按需載入 ----

type VoiceModule = typeof import('./voice');
let mod: VoiceModule | null = null;
let loading: Promise<VoiceModule | null> | null = null;
/** 每叫停一次加一：載入期間被叫停的那幾句就不講了 */
let epoch = 0;

function load(): Promise<VoiceModule | null> {
  if (mod) return Promise.resolve(mod);
  loading ??= import('./voice').then((m) => (mod = m), () => { loading = null; return null; });
  return loading;
}

/** 配音能不能出聲：音效開＋語音開 */
export function voiceAllowed(): boolean { return enabled && soundOn(); }

/** 講一句（`kind` 見 `voice.ts` 的 `speak`） */
export function say(group: string | null, text: string, kind: 'line' | 'bark' | 'queue' = 'line'): void {
  if (!voiceAllowed()) return;
  if (!group) { if (kind === 'line') hush(); return; }   // 旁白那一句：前一句的配音要停
  if (mod) { mod.speak(group, text, kind); return; }
  const e = epoch;
  void load().then((m) => { if (m && e === epoch) m.speak(group, text, kind); });
}

/** 預抓接下來會講的幾句 */
export function prefetch(items: readonly { group: string | null; text: string }[]): void {
  if (!voiceAllowed() || items.every((x) => !x.group)) return;
  void load().then((m) => m?.prefetchVoice(items));
}

/** 進入一局就先載配音程式與查表（慢網路修正 2026-09-30）；配音或音效關著就不抓 */
export function warmVoice(): Promise<unknown> {
  return voiceAllowed() ? load().then((m) => m?.warmMap()) : Promise.resolve();
}

/** 停掉正在講的那句（還沒載入就只是讓載入中的那幾句作廢） */
export function hush(): void {
  epoch++;
  mod?.stopVoice();
}
