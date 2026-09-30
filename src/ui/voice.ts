import { audioOut, onSoundOff } from './audio';
import { duckBgm } from './bgm';
import { BUILD, fileUrl } from './assets';
import { voiceAllowed } from './voicegate';

/**
 * 日文配音（2026-09-28）：主線過場與戰鬥吐槽念日文，字幕照舊是中文。
 *
 * - 查表：`public/voice/voice-map.json`，鍵＝「聲音角色|畫面上那一句中文」（盤點見 `tools/voice/dump_lines.ts`）。
 *   查不到就不出聲（旁白、事件、連線改寫的句子本來就沒配）。
 * - **什麼都不在開場下載**：查表檔第一次要講話時才抓，音檔講到哪句抓哪句（對白開場先預抓前幾句）。
 * - 走音效那一套音訊環境、接在音效總音量後面：**音效關了配音一定沒聲音**（使用者規則），手機第一次點擊解鎖也共用。
 *   另有自己的「語音」開關（預設開），只管配音。
 * - 同一時間只講一句；講話時背景音樂壓到一半、講完還原。
 * - 這一支是按需載入的（`voicegate.ts` 第一次要講話才 import），開關與說話者判斷在那邊。
 */

/** 講話時背景音樂的音量倍率 */
export const DUCK = 0.5;
/** 吐槽等太久（查表或音檔還沒到）就不講了：畫面上那句早就換掉 */
const BARK_MAX_WAIT_MS = 1500;
/** 解碼好的音檔最多留幾份（一份單聲道幾秒，幾百 KB；全留會把手機記憶體吃光） */
export const KEEP = 32;
/** 喚醒音訊環境最多等多久（手機背景回來偶爾卡住）：等不到這一句就不講 */
const RESUME_MAX_WAIT_MS = 1500;

/** 音訊出口，等太久就當作沒有 */
function outSoon(): ReturnType<typeof audioOut> {
  return Promise.race([audioOut(), new Promise<null>((res) => setTimeout(() => res(null), RESUME_MAX_WAIT_MS))]);
}

export interface VoiceClip { file: string; dur: number }

/** 配音能不能出聲：音效開＋語音開（開關在 `voicegate.ts`） */
const allowed = voiceAllowed;

// ---- 查表與音檔 ----

let map: Record<string, VoiceClip> | null = null;
let mapTask: Promise<Record<string, VoiceClip> | null> | null = null;
function loadMap(): Promise<Record<string, VoiceClip> | null> {
  if (map) return Promise.resolve(map);
  if (!mapTask) {
    mapTask = (async () => {
      try {
        // 夾這一版的打包編號：查表檔不加雜湊，不夾的話剛部署完十分鐘內會拿到舊表（同 assets.ts 的清單）
        const res = await fetch(`${fileUrl('voice/voice-map.json')}${BUILD ? `?v=${BUILD}` : ''}`);
        if (!res.ok) return null;
        map = await res.json() as Record<string, VoiceClip>;
        return map;
      } catch { return null; }
    })().finally(() => { if (!map) mapTask = null; });   // 抓失敗下次再試
  }
  return mapTask;
}

/** 進入一局就先抓查表（慢網路修正 2026-09-30，`voicegate.ts` 的 `warmVoice`）：第一句吐槽不必再排「程式→查表→音檔」三段接力 */
export function warmMap(): Promise<unknown> { return loadMap(); }

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
/** 關主換階段那一串（`queue`）：前一句講完再接，最多排兩句、等超過 4 秒就不講了 */
const QUEUE_MAX = 2;
const QUEUE_MAX_WAIT_MS = 4000;
const waiting: { group: string; text: string; at: number }[] = [];
/** 前一句講完（或講不成）：排著的下一句還沒過期就接著講；有接上回 true */
function playNext(): boolean {
  while (waiting.length) {
    const w = waiting.shift()!;
    if (performance.now() - w.at <= QUEUE_MAX_WAIT_MS) { speak(w.group, w.text, 'queue'); return true; }
  }
  return false;
}

/** 停掉正在講的那句（不動音樂音量） */
function halt(): void {
  token++;
  busy = false;
  waiting.length = 0;
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
 * - `bark`＝戰鬥吐槽：已經有一句在講或在準備就跳過，準備太久也跳過，不排隊；
 * - `queue`＝關主換階段那一串（關主一句、主角回一句）：有一句在講就排隊等它講完，見 `waiting`。
 */
export function speak(group: string | null, text: string, kind: 'line' | 'bark' | 'queue' = 'line'): void {
  if (!allowed()) return;
  if (kind !== 'line' && (!group || !text)) return;
  if (kind === 'bark' && busy) return;
  if (kind === 'queue' && busy) { if (waiting.length < QUEUE_MAX) waiting.push({ group: group!, text, at: performance.now() }); return; }
  if (kind === 'line') halt();   // 音樂先不還原：下一句多半馬上接著講，免得音量忽大忽小
  const my = token;
  // 這一句講不成：還是最新那一次才收尾（音樂還原、讓出位置給吐槽）
  const giveUp = (): void => { if (my === token) { busy = false; if (!current && !playNext()) duckBgm(1); } };
  if (!group || !text) { giveUp(); return; }
  busy = true;
  const t0 = performance.now();
  void (async () => {
    const m = await loadMap();
    const clip = m?.[`${group}|${text}`];
    if (!clip) { giveUp(); return; }          // 沒配的句子：安靜
    const out = my === token ? await outSoon() : null;
    const buf = out ? await loadClip(out.ctx, clip.file) : undefined;
    if (my !== token) return;
    if (!out || !buf || !allowed() || (kind !== 'line' && performance.now() - t0 > BARK_MAX_WAIT_MS)) { giveUp(); return; }
    const src = out.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out.out);
    src.onended = () => { if (current?.src === src) { current = null; busy = false; if (!playNext()) duckBgm(1); } };
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
    const out = m ? await outSoon() : null;
    if (!m || !out) return;
    for (const { group, text } of items) {
      const clip = group ? m[`${group}|${text}`] : undefined;
      if (clip) void loadClip(out.ctx, clip.file);
    }
  })();
}
