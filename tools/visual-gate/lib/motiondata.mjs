// 逐格動作資料（`src/ui/*-motion-data.json`）的比對：不用畫面，直接比資料——
// 每個動作的 scale、每一格在圖集裡的位置與定位點、停留時間、圖集內容（打包後檔名裡的內容雜湊碼）。
// 一模一樣＝這個動作的大小與畫面不可能變；有變才拿去量頭。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentIdOf, MOTION_HERO } from './util.mjs';

/** 魔物的動作不歸這四道門檻管 */
const SKIP = new Set(['enemy-motion-data.json']);

function heroOfFile(file) {
  const m = /^(qiuqiu|feifei|dangdang|fengfeng)-/.exec(file);
  return m ? MOTION_HERO[m[1]] : null;
}

/** 在一份 JSON 裡找出每個「動作」：帶 texture，並且有 frames（逐格）或 rect（單張） */
function walk(node, path, out) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.texture === 'string' && (Array.isArray(node.frames) || Array.isArray(node.rect))) { out.push({ path, node }); return; }
  for (const [k, v] of Object.entries(node)) walk(v, [...path, k], out);
}

export function collectMotion(dir, manifest) {
  const actions = new Map();
  if (!existsSync(dir)) return actions;
  for (const file of readdirSync(dir).filter((f) => /-motion-data\.json$/.test(f) && !SKIP.has(f)).sort()) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8').replace(/^﻿/, ''));
    const stem = file.replace(/-motion-data\.json$/, '');
    const found = [];
    walk(data, [], found);
    for (const { path, node } of found) {
      const hero = heroOfFile(file) ?? MOTION_HERO[path.find((p) => MOTION_HERO[p])] ?? null;
      if (!hero) continue;
      const name = path[path.length - 1];
      const tex = manifest.files?.[node.texture] ?? null;
      const frames = Array.isArray(node.frames)
        ? node.frames.map((f) => ({ rect: f.rect, pivot: f.pivot, duration: f.duration }))
        : [{ rect: node.rect, pivot: node.pivot, duration: null }];
      const shape = { scale: node.scale, sizeFix: node.sizeFix ?? null, drawnHeightRatio: node.drawnHeightRatio ?? null, loop: node.loop ?? null,
        nativeHeight: data.nativeHeight ?? null, frames: frames.map((f) => [f.rect, f.pivot]) };
      const timing = frames.map((f) => f.duration);
      const id = `${hero}:${stem}:${path.join('.')}`;
      actions.set(id, {
        id, hero, file, stem, name, texture: node.texture, textureFile: tex, textureId: contentIdOf(tex),
        scale: node.scale, frames, nativeHeight: data.nativeHeight ?? null,
        fpShape: JSON.stringify(shape), fpTiming: JSON.stringify(timing),
      });
    }
  }
  return actions;
}

/** 比兩版的動作：回傳 { same, changed[], added[], removed[] }；changed 標出哪一類變了 */
export function diffMotion(baseActs, headActs) {
  const changed = [], added = [], removed = [];
  let same = 0;
  for (const [id, h] of headActs) {
    const b = baseActs.get(id);
    if (!b) { added.push(h); continue; }
    const shape = b.fpShape !== h.fpShape, tex = b.textureId !== h.textureId, timing = b.fpTiming !== h.fpTiming;
    if (!shape && !tex && !timing) { same++; continue; }
    const what = [];
    if (b.scale !== h.scale) what.push(`scale ${b.scale} → ${h.scale}（×${(h.scale / b.scale).toFixed(3)}）`);
    if (b.frames.length !== h.frames.length) what.push(`格數 ${b.frames.length} → ${h.frames.length}`);
    else if (shape && b.scale === h.scale) what.push('格子位置／定位點改了');
    if (tex) what.push('圖集內容換了');
    if (timing && !shape && !tex) what.push('只改停留時間（節奏），大小不變');
    changed.push({ id, base: b, head: h, shape, tex, timing, what });
  }
  for (const [id, b] of baseActs) if (!headActs.has(id)) removed.push(b);
  return { same, changed, added, removed };
}
