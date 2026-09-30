/*
 * 量測用的「插旗版」打包（2026-09-30，聲音與卡頓量測）：不動 `src/`，打包時用 transform 外掛
 * 在 `audio.ts`、`voice.ts`、`voicegate.ts` 幾個固定位置插進記錄呼叫，輸出到 `dist-instr`。
 *
 *   npx vite build --config tools/perf/vite.instr.config.ts
 *
 * 每個插入點的錨點字串必須剛好出現一次，否則丟例外（原始碼改了就要跟著改這裡，不能默默失效）。
 * 記錄函式是頁面上的 `globalThis.__au(tag, name, info)`，沒掛就什麼都不做。
 */
import { mergeConfig } from 'vite';
import type { Plugin } from 'vite';
import base from '../../vite.config.ts';

function patch(file: string, code: string, edits: [string, string][]): string {
  let out = code.replace(/\r\n/g, '\n');
  for (const [from, to] of edits) {
    const n = out.split(from).length - 1;
    if (n !== 1) throw new Error(`instr: ${file} 錨點出現 ${n} 次（要剛好 1 次）：${from.slice(0, 80)}`);
    out = out.replace(from, () => to);
  }
  return out;
}

const HELPER = `\nconst __au = (tag: string, name: unknown, info?: Record<string, unknown>): void => { try { (globalThis as any).__au?.(tag, name, info); } catch { /* 量測用，不影響遊戲 */ } };\n`;

function instr(): Plugin {
  return {
    name: 'perf-instr',
    enforce: 'pre',
    transform(code, id) {
      const p = id.split('\\').join('/').split('?')[0]!;
      if (p.endsWith('/src/ui/audio.ts')) {
        return patch(p, code, [
          // 進出口：要求播放、還沒解鎖等
          ["  if (!enabled || !ctx || !master || ctx.state === 'closed') return;\n  name = sfxFor(name, sfxHero);   // 角色專屬版本（菲菲的貓叫）\n",
            "  const __req = (globalThis as any).__auSeq = ((globalThis as any).__auSeq ?? 0) + 1;\n" +
            "  if (!enabled || !ctx || !master || ctx.state === 'closed') { __au('sfx.exit', name, { id: __req, why: !enabled ? 'disabled' : !ctx ? 'noctx' : 'closed' }); return; }\n" +
            "  name = sfxFor(name, sfxHero);   // 角色專屬版本（菲菲的貓叫）\n" +
            "  __au('sfx.req', name, { id: __req, cached: buffers.has(name), state: ctx.state, pendingLoad: pending.has(name) });\n"],
          ["|| audio.state !== 'running' || performance.now() - requestedAt > MAX_START_DELAY_MS) return;",
            "|| audio.state !== 'running' || performance.now() - requestedAt > MAX_START_DELAY_MS) {\n" +
            "      __au('sfx.skip', name, { id: __req, why: !buffer ? 'nobuffer' : (performance.now() - requestedAt > MAX_START_DELAY_MS ? 'late>500ms' : audio.state !== 'running' ? 'notrunning' : 'other'), waitedMs: Math.round(performance.now() - requestedAt) });\n" +
            "      return;\n    }"],
          ["    src.start();\n  };\n", "    src.start();\n    __au('sfx.start', name, { id: __req, waitedMs: Math.round(performance.now() - requestedAt) });\n  };\n"],
        ]) + HELPER;
      }
      if (p.endsWith('/src/ui/voice.ts')) {
        return patch(p, code, [
          ["export function speak(group: string | null, text: string, kind: 'line' | 'bark' | 'queue' = 'line'): void {\n  if (!allowed()) return;\n  if (kind !== 'line' && (!group || !text)) return;\n  if (kind === 'bark' && busy) return;\n  if (kind === 'queue' && busy) { if (waiting.length < QUEUE_MAX) waiting.push({ group: group!, text, at: performance.now() }); return; }\n",
            "export function speak(group: string | null, text: string, kind: 'line' | 'bark' | 'queue' = 'line'): void {\n" +
            "  const __id = (globalThis as any).__vSeq = ((globalThis as any).__vSeq ?? 0) + 1;\n" +
            "  const __tag = { id: __id, group, text: (text ?? '').slice(0, 24), kind };\n" +
            "  __au('voice.req', kind, __tag);\n" +
            "  if (!allowed()) { __au('voice.exit', kind, { ...__tag, why: 'notallowed' }); return; }\n" +
            "  if (kind !== 'line' && (!group || !text)) { __au('voice.exit', kind, { ...__tag, why: 'nogroup' }); return; }\n" +
            "  if (kind === 'bark' && busy) { __au('voice.exit', kind, { ...__tag, why: 'busy' }); return; }\n" +
            "  if (kind === 'queue' && busy) { __au('voice.exit', kind, { ...__tag, why: 'queued' }); if (waiting.length < QUEUE_MAX) waiting.push({ group: group!, text, at: performance.now() }); return; }\n"],
          ["    if (!clip) { giveUp(); return; }          // 沒配的句子：安靜\n    const out = my === token ? await outSoon() : null;\n    const buf = out ? await loadClip(out.ctx, clip.file) : undefined;\n    if (my !== token) return;\n    if (!out || !buf || !allowed() || (kind !== 'line' && performance.now() - t0 > BARK_MAX_WAIT_MS)) { giveUp(); return; }\n",
            "    if (!clip) { __au('voice.exit', kind, { ...__tag, why: 'noclip(沒配音)' }); giveUp(); return; }          // 沒配的句子：安靜\n" +
            "    __au('voice.clip', kind, { ...__tag, file: clip.file, dur: clip.dur, cached: buffers.has(clip.file), mapMs: Math.round(performance.now() - t0) });\n" +
            "    const out = my === token ? await outSoon() : null;\n    const buf = out ? await loadClip(out.ctx, clip.file) : undefined;\n" +
            "    if (my !== token) { __au('voice.exit', kind, { ...__tag, why: 'superseded', waitedMs: Math.round(performance.now() - t0) }); return; }\n" +
            "    if (!out || !buf || !allowed() || (kind !== 'line' && performance.now() - t0 > BARK_MAX_WAIT_MS)) {\n" +
            "      __au('voice.exit', kind, { ...__tag, why: !out ? 'noaudioout' : !buf ? 'nobuffer' : !allowed() ? 'notallowed' : 'timeout>1500ms', waitedMs: Math.round(performance.now() - t0) });\n" +
            "      giveUp(); return;\n    }\n"],
          ["    duckBgm(DUCK);\n    src.start();\n", "    duckBgm(DUCK);\n    src.start();\n    __au('voice.start', kind, { ...__tag, waitedMs: Math.round(performance.now() - t0) });\n"],
        ]) + HELPER;
      }
      // 「假如…」的模擬（PERF_PATCH=warm／high／warmhigh，輸出到 dist-instr-<名字>）：只用來量效果，不進遊戲
      //   warm     開打前只等魔物立繪與起手牌面，主角三十張姿勢改背景抓
      //   high     開打前那批照舊（魔物＋牌面＋姿勢一起等 1.5 秒），但改用「高優先」抓
      //   warmhigh 兩個都做
      const PATCH = process.env['PERF_PATCH'] ?? '';
      if (PATCH && p.endsWith('/src/ui/preload.ts')) {
        const anchor = '  const work = decodeAll([...new Set([...monsters, ...heroPoses])], 6, (u) => held.has(u));';
        const hi = PATCH === 'high' || PATCH === 'warmhigh' ? ", undefined, 'high'" : '';
        const body = PATCH === 'high'
          ? '  const work = decodeAll([...new Set([...monsters, ...heroPoses])], 6, (u) => held.has(u)' + hi + ');'
          : [
            "  const inRace = heroPoses.filter((u) => u.includes('/assets/cards/'));",
            "  const bgPoses = heroPoses.filter((u) => !u.includes('/assets/cards/'));",
            '  void decodeAll(bgPoses, 3, false);',
            '  const work = decodeAll([...new Set([...monsters, ...inRace])], 6, (u) => held.has(u)' + hi + ');',
          ].join('\n');
        return patch(p, code, [[anchor, body]]);
      }
      if (p.endsWith('/src/ui/voicegate.ts')) {
        return patch(p, code, [
          ["export function say(group: string | null, text: string, kind: 'line' | 'bark' | 'queue' = 'line'): void {\n  if (!voiceAllowed()) return;\n",
            "export function say(group: string | null, text: string, kind: 'line' | 'bark' | 'queue' = 'line'): void {\n" +
            "  __au('gate.say', kind, { group, text: (text ?? '').slice(0, 24), loaded: !!mod, allowed: voiceAllowed() });\n  if (!voiceAllowed()) return;\n"],
        ]) + HELPER;
      }
      return null;
    },
  };
}

export default mergeConfig(base, {
  plugins: [instr()],
  build: { outDir: process.env['PERF_PATCH'] ? (process.env['PERF_PATCH'] === 'warm' ? 'dist-instr-p' : `dist-instr-${process.env['PERF_PATCH']}`) : 'dist-instr', emptyOutDir: true },
});
