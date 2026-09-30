#!/usr/bin/env node
/*
 * 卡牌量測摘要：node tools/i18n-edge/cards-summary.mjs <cards_raw_*.json> [另一份對照]
 * 依檢查報告的分級數：高＝文字縮到 10px 仍被切、中＝牌名縮到 9px 仍被切、文字剛好縮到下限、牌名剛好縮到下限。
 * 每種＝（牌×版本×尺寸）計一次（四位主角、桌機手機同牌只算一次）。
 */
import { readFileSync } from 'node:fs';

function summarize(file) {
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  const out = {};
  for (const lang of [...new Set(rows.map((r) => r.lang))]) {
    const seen = new Map();
    for (const r of rows.filter((x) => x.lang === lang && x.p === 0)) {
      const k = `${r.id}|${r.upgraded}|${r.size}`;
      const cur = seen.get(k) ?? { id: r.id, name: r.name, size: r.size, up: r.upgraded, textCut: 0, nameCut: 0, textMin: false, nameMin: false, wrap: false, artH: 999, typeClip: -99 };
      cur.textCut = Math.max(cur.textCut, r.textOver > 0.5 ? r.textOver : 0);
      cur.nameCut = Math.max(cur.nameCut, r.nameOver > 0.5 ? r.nameOver : 0);
      cur.textMin ||= r.fsT <= 10.01;
      cur.nameMin ||= r.fsN <= 9.01;
      cur.wrap ||= !!r.nameWrap;
      cur.artH = Math.min(cur.artH, r.artH ?? 999);
      cur.typeClip = Math.max(cur.typeClip, r.typeClip ?? -99);
      seen.set(k, cur);
    }
    const v = [...seen.values()];
    out[lang] = {
      total: v.length,
      textCut: v.filter((x) => x.textCut > 0),
      nameCut: v.filter((x) => x.nameCut > 0),
      textMin: v.filter((x) => x.textMin && !x.textCut),
      nameMin: v.filter((x) => x.nameMin && !x.nameCut),
      wrap: v.filter((x) => x.wrap),
      typeClipped: v.filter((x) => x.typeClip > 1),
      artShrunk: v.filter((x) => x.artH < 80 && x.size === 'small' || x.artH < 100 && x.size === 'big'),
    };
  }
  return out;
}
for (const f of process.argv.slice(2)) {
  console.log('==', f);
  const s = summarize(f);
  for (const [lang, d] of Object.entries(s)) {
    console.log(lang, 'kinds', d.total, '| 文字被切', d.textCut.length, '| 牌名被切', d.nameCut.length, '| 文字剛好下限', d.textMin.length, '| 牌名剛好下限', d.nameMin.length, '| 牌名換兩行', d.wrap.length, '| 牌圖縮小', d.artShrunk.length, '| 牌型列被擠出', d.typeClipped.length);
    for (const x of d.textCut.slice(0, 12)) console.log('   文字被切', x.name, x.size, x.up ? '+' : '', x.textCut);
    for (const x of d.nameCut.slice(0, 12)) console.log('   牌名被切', x.name, x.size, x.up ? '+' : '', x.nameCut);
  }
}
