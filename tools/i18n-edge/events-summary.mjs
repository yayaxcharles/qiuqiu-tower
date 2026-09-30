#!/usr/bin/env node
/*
 * 事件量測摘要：node tools/i18n-edge/events-summary.mjs <events_*.json …>
 * 每個 語言×畫面 一列：對白框上緣壓進插圖（框頂 < 插圖底 − 30）的畫面數、框頂進狀態列（< 狀態列底）的畫面數、
 * 獲得物展示上緣超出畫面（< 狀態列底）的畫面數、最後一顆按鈕掉出舞台的畫面數、走到「文字捲動」那一級的畫面數。
 */
import { readFileSync } from 'node:fs';

const rows = process.argv.slice(2).flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
const keys = [...new Set(rows.map((r) => `${r.lang}|${r.vp}`))];
for (const key of keys) {
  const rs = rows.filter((r) => `${r.lang}|${r.vp}` === key && r.m && r.m.box);
  const cover = rs.filter((r) => r.m.art && r.m.box.t < r.m.art.b - 30);
  const underHud = rs.filter((r) => r.m.hudB != null && r.m.box.t < r.m.hudB);
  const loot = rs.filter((r) => r.m.lootTop != null && r.m.hudB != null && r.m.lootTop < r.m.hudB);
  const lootOut = rs.filter((r) => r.outside?.some((o) => /loot|gain-stack|showcase/.test(o.el) && o.over.t > 1.5));
  const btnOut = rs.filter((r) => r.m.btns.some((b) => b.b > 720 + 2));
  const scrolled = rs.filter((r) => r.m.scrolled);
  const fits = {};
  for (const r of rs) if (r.m.fit) fits[r.m.fit] = (fits[r.m.fit] ?? 0) + 1;
  console.log(key, 'screens', rs.length, '| 框壓插圖', cover.length, '| 框頂進狀態列', underHud.length, '| 獲得物超出上緣', loot.length, '(掃描出界', lootOut.length + ')', '| 按鈕掉出', btnOut.length, '| 捲動級', scrolled.length, '| 各級', JSON.stringify(fits));
  const worst = cover.sort((a, b) => a.m.box.t - b.m.box.t).slice(0, 5);
  for (const w of worst) console.log('   worst', w.hero, w.id, w.step, 'boxTop', w.m.box.t, 'artB', w.m.art.b, w.m.fit);
}
