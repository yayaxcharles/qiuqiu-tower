// 畫面比對閘門的共用小工具：路徑、跑指令、雜湊、時間。
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HEROES = ['ninja', 'feifei', 'dangdang', 'fengfeng'];
export const HERO_NAME = { ninja: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' };
/** 動作資料檔裡的角色名（球球的檔名是 qiuqiu） */
export const MOTION_HERO = { qiuqiu: 'ninja', ninja: 'ninja', feifei: 'feifei', dangdang: 'dangdang', fengfeng: 'fengfeng' };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 同步跑一支指令，回傳標準輸出（去掉頭尾空白）；失敗就丟例外並帶上標準錯誤 */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} 失敗（離開碼 ${r.status}）：${(r.stderr || '').slice(0, 800)}`);
  }
  return opts.raw ? r : (r.stdout || '').trim();
}

/** 非同步跑一支指令，輸出寫進 log 陣列；回傳離開碼 */
export function runAsync(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let out = '';
    p.stdout?.on('data', (d) => { out += d; });
    p.stderr?.on('data', (d) => { out += d; });
    p.on('error', rej);
    p.on('close', (code) => res({ code, out }));
  });
}

export function git(repo, args, opts = {}) {
  return run('git', ['-C', repo, ...args], opts);
}

export function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

export function readJson(p, fallback = undefined) {
  if (!existsSync(p)) { if (fallback !== undefined) return fallback; throw new Error('找不到 ' + p); }
  return JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
}

/** 20260925-153012 這種時間戳（本機時間） */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function fmtSec(ms) { return `${(ms / 1000).toFixed(1)} 秒`; }

/** 帶雜湊的檔名（`event_x-7WQhIcB8.webp`）取出內容雜湊碼；打包工具用的是內容的 sha256 前 8 碼 */
export function contentIdOf(relPath) {
  if (!relPath) return null;
  const m = /-([A-Za-z0-9_-]{8})\.[a-z0-9]+$/.exec(relPath);
  return m ? m[1] : relPath;
}

export function rel(p, root) { return p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]+/, '') : p; }

export function toPosix(p) { return p.replace(/\\/g, '/'); }

export function joinUrl(...parts) { return parts.join('/').replace(/\/+/g, '/').replace(':/', '://'); }

export { join, resolve, dirname };
