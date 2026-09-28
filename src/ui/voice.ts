import { audioOut, onSoundOff, soundOn } from './audio';
import { duckBgm } from './bgm';
import { fileUrl } from './assets';

/**
 * 日文配音（2026-09-28）：主線過場與戰鬥吐槽念日文，字幕照舊是中文。
 *
 * - 查表：`public/voice/voice-map.json`，鍵＝「聲音角色|畫面上那一句中文」（盤點見 `tools/voice/dump_lines.ts`）。
 *   查不到就不出聲（旁白、事件、連線改寫的句子本來就沒配）。
 * - **什麼都不在開場下載**：查表檔第一次要講話時才抓，音檔講到哪句抓哪句（對白開場先預抓前幾句）。
 * - 走音效那一套音訊環境、接在音效總音量後面：**音效關了配音一定沒聲音**（使用者規則），手機第一次點擊解鎖也共用。
 *   另有自己的「語音」開關（預設開），只管配音。
 * - 同一時間只講一句；講話時背景音樂壓到一半、講完還原。
 */

const STORE_KEY = 'qiuqiu.voice';
/** 講話時背景音樂的音量倍率 */
export const DUCK = 0.5;
/** 吐槽等太久（查表或音檔還沒到）就不講了：畫面上那句早就換掉 */
const BARK_MAX_WAIT_MS = 1500;
/** 解碼好的音檔最多留幾份（一份單聲道幾秒，幾百 KB；全留會把手機記憶體吃光） */
const KEEP = 32;

export interface VoiceClip { file: string; dur: number }

function readEnabled(): boolean {
  try { return window.localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; }
}
let enabled = readEnabled();

export function voiceOn(): boolean { return enabled; }
export function setVoiceOn(on: boolean): void {
  enabled = on;
  try { window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 存不了就算了 */ }
  if (!on) stopVoice();
}
export function toggleVoice(): boolean { setVoiceOn(!enabled); return enabled; }

/** 配音能不能出聲：音效開＋語音開 */
function allowed(): boolean { return enabled && soundOn(); }

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

// ---- 查表與音檔 ----

let map: Record<string, VoiceClip> | null = null;
let mapTask: Promise<Record<string, VoiceClip> | null> | null = null;
function loadMap(): Promise<Record<string, VoiceClip> | null> {
  if (map) return Promise.resolve(map);
  if (!mapTask) {
    mapTask = (async () => {
      try {
        const res = await fetch(fileUrl('voice/voice-map.json'));
        if (!res.ok) return null;
        map = await res.json() as Record<string, VoiceClip>;
        return map;
      } catch { return null; }
    })().finally(() => { if (!map) mapTask = null; });   // 抓失敗下次再試
  }
  return mapTask;
}

const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
function loadClip(ctx: AudioContext, file: string): Promise<AudioBuffer | undefined> {
  const hit = buffers.get(file);
  if (hit) { buffers.delete(file); buffers.set(file, hit); return hit; }   // 最近用過的排到最後
  const task = (async () => {
    try {
      const res = await fetch(fileUrl(file));
      if (!res.ok) return undefined;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch { return undefined; }
  })();
  task.then((b) => { if (!b) buffers.delete(file); }, () => buffers.delete(file));
  buffers.set(file, task);
  while (buffers.size > KEEP) buffers.delete(buffers.keys().next().value!);
  return task;
}

// ---- 播放 ----

let token = 0;
let current: { src: AudioBufferSourceNode; token: number } | null = null;
/** 吐槽用：有一句在講（或正在準備講主線那句）就不插嘴 */
let busy = false;

/** 停掉正在講的那句（不動音樂音量） */
function halt(): void {
  token++;
  busy = false;
  const c = current;
  current = null;
  if (c) { try { c.src.onended = null; c.src.stop(); } catch { /* 已經停了 */ } }
}

/** 停掉正在講的那句、還回音樂音量（關對白框、關聲音時叫） */
export function stopVoice(): void { halt(); duckBgm(1); }
onSoundOff(stopVoice);

/**
 * 講一句。`kind`：
 * - `line`＝對白框／幻燈片那一句：先停掉前一句再講（點下一句就換）；
 * - `bark`＝戰鬥吐槽：已經有一句在講或在準備就跳過，準備太久也跳過，不排隊。
 */
export function speak(group: string | null, text: string, kind: 'line' | 'bark' = 'line'): void {
  if (!allowed()) return;
  if (kind === 'bark' && (busy || !group || !text)) return;
  if (kind === 'line') halt();   // 音樂先不還原：下一句多半馬上接著講，免得音量忽大忽小
  const my = token;
  // 這一句講不成：還是最新那一次才收尾（音樂還原、讓出位置給吐槽）
  const giveUp = (): void => { if (my === token) { busy = false; if (!current) duckBgm(1); } };
  if (!group || !text) { giveUp(); return; }
  busy = true;
  const t0 = performance.now();
  void (async () => {
    const m = await loadMap();
    const clip = m?.[`${group}|${text}`];
    if (!clip) { giveUp(); return; }          // 沒配的句子：安靜
    const out = my === token ? await audioOut() : null;
    const buf = out ? await loadClip(out.ctx, clip.file) : undefined;
    if (my !== token) return;
    if (!out || !buf || !allowed() || (kind === 'bark' && performance.now() - t0 > BARK_MAX_WAIT_MS)) { giveUp(); return; }
    const src = out.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out.out);
    src.onended = () => { if (current?.src === src) { current = null; busy = false; duckBgm(1); } };
    current = { src, token: my };
    duckBgm(DUCK);
    src.start();
  })();
}

/** 預抓接下來會講的幾句（對白一開始、每換一句）。只抓不播；沒解鎖或沒聲音就不抓 */
export function prefetchVoice(items: readonly { group: string | null; text: string }[]): void {
  if (!allowed() || items.every((x) => !x.group)) return;
  void (async () => {
    const m = await loadMap();
    const out = m ? await audioOut() : null;
    if (!m || !out) return;
    for (const { group, text } of items) {
      const clip = group ? m[`${group}|${text}`] : undefined;
      if (clip) void loadClip(out.ctx, clip.file);
    }
  })();
}
