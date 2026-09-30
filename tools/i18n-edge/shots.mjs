#!/usr/bin/env node
/*
 * 報告用的「重現截圖」：把量到的最嚴重狀況真的擺出來拍一張（檔名帶 fig_ 前綴）。
 *   node tools/i18n-edge/shots.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { openPage, bootRun, sleep, shotPath, settle, waitScreen, OUT } from './lib.mjs';

const INITVOICE = `(() => { if (/^(127\\.0\\.0\\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.voice', 'off'); } catch (e) {} } })();`;
const done = [];
const snap = async (page, name, clip) => { await settle(page); const file = `fig_${name}.jpg`; await page.screenshot({ path: shotPath(file), type: 'jpeg', quality: 78, ...(clip ? { clip } : {}) }); done.push(file); console.log('  shot', file); };

// ---- A. 狀態列 ----
for (const [lang, vp] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone'], ['zh', 'desk']]) {
  const c = await openPage(lang, vp, 'figs');
  const { page } = c;
  try {
    await bootRun(page, 'ninja', 'fig');
    const ids = await page.evaluate(async () => (await import('/qiuqiu-tower/src/content/relics.ts')).relics.filter((r) => r.pool !== '起始').map((r) => r.id));
    const set = async (relics, diff) => { await page.evaluate(([n, d, ids2]) => { const r = window.__app.run; r.act = 2; r.difficulty = d; r.currentNode = null; const p = r.players[0]; p.relics = ids2.slice(0, n); p.fish = 120; p.maxHp = 176; p.hp = 176; window.__app.show('map'); }, [relics, diff, ids]); await sleep(500); };
    const h = vp === 'desk' ? 90 : 52;
    const w = vp === 'desk' ? 1280 : 844;
    await set(8, 1); await snap(page, `hud_${lang}_${vp}_relics8_diff1`, { x: 0, y: vp === 'desk' ? 40 : 0, width: w, height: h });
    await set(0, 5); await snap(page, `hud_${lang}_${vp}_relics0_diff5`, { x: 0, y: vp === 'desk' ? 40 : 0, width: w, height: h });
    await set(12, 5); await snap(page, `hud_${lang}_${vp}_relics12_diff5`, { x: 0, y: vp === 'desk' ? 40 : 0, width: w, height: h });
  } catch (e) { console.log('ERR hud', lang, vp, String(e?.message ?? e).slice(0, 200)); }
  await c.close();
}

// ---- B. 忍具提示框超出畫面下緣（戰鬥中把滑鼠移到忍具格）----
for (const [lang, vp] of [['en', 'desk'], ['ja', 'desk'], ['zh', 'desk'], ['en', 'phone']]) {
  const c = await openPage(lang, vp, 'figs');
  const { page } = c;
  try {
    await bootRun(page, 'ninja', 'fig');
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; r.players[0].potions = ['demon_mirror', 'rope', 'dive_straw']; window.__app.startFight('rats3'); });
    await waitScreen(page, 'combat', 30000);
    await sleep(2800);
    await page.evaluate(() => { const s = document.querySelector('.combat .potions .potion:not(.empty):not(.locked)'); s?.dispatchEvent(new MouseEvent('mouseenter')); });
    await sleep(300);
    await snap(page, `tooltip_potion_${lang}_${vp}`);
  } catch (e) { console.log('ERR tip', lang, vp, String(e?.message ?? e).slice(0, 200)); }
  await c.close();
}

// ---- C. 劇情最長句（幻燈片與對白框）----
const storyFile = `${OUT}/story_enja_deskphone_ninja-feifei-dangdang-fengfeng.json`;   // 修正後的資料夾沒有劇情量測（劇情版面沒動），這一段就略過
const story = existsSync(storyFile) ? JSON.parse(readFileSync(storyFile, 'utf8')) : [];
for (const lang of ['en', 'ja']) for (const vp of story.length ? ['desk', 'phone'] : []) {
  const xs = story.filter((x) => x.lang === lang && x.vp === vp && x.m && !x.m.err && x.src !== 'pack_other');
  const longest = (ctx) => xs.filter((x) => x.ctx === ctx).sort((a, b) => (b.m.box.b - b.m.box.t) - (a.m.box.b - a.m.box.t))[0];
  for (const ctx of ['slide', 'dialogue']) {
    const it = longest(ctx);
    if (!it) continue;
    const c = await openPage(lang, vp, 'figs', INITVOICE);
    const { page } = c;
    try {
      await bootRun(page, it.hero, 'fig');
      await page.evaluate(async ([item]) => {
        const dlg = await import('/qiuqiu-tower/src/ui/dialogue.ts');
        const sl = await import('/qiuqiu-tower/src/ui/slides.ts');
        if (item.ctx === 'slide') sl.playSlides([{ img: 'bg/still_teach', lines: [{ speaker: item.speaker, text: item.text }], box: item.box }], () => {});
        else dlg.playDialogue([{ speaker: item.speaker, text: item.text }], () => {}, undefined, !!item.literal);
      }, [it]);
      await sleep(1600);
      await snap(page, `story_${ctx}_${lang}_${vp}_${it.hero}`);
    } catch (e) { console.log('ERR story', lang, vp, ctx, String(e?.message ?? e).slice(0, 200)); }
    await c.close();
  }
}

// ---- D. 意圖牌互相蓋住（狸大人「肚皮鼓」在英文）----
for (const [lang, vp] of [['en', 'desk'], ['ja', 'desk'], ['en', 'phone']]) {
  const c = await openPage(lang, vp, 'figs');
  const { page } = c;
  try {
    await bootRun(page, 'ninja', 'fig');
    await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('rats3'); });
    await waitScreen(page, 'combat', 30000);
    await sleep(2500);
    await page.evaluate(async () => {
      const { enemyById } = await import('/qiuqiu-tower/src/content/enemies.ts');
      const mv = (id, label) => JSON.parse(JSON.stringify((enemyById[id].moves.find((m) => m.label === label) ?? enemyById[id].moves[0])));
      const cs = window.__app.cs;
      cs.enemies[0].move = mv('tanuki_lord', '肚皮鼓');
      cs.enemies[1].move = mv('persian_lady', '尖叫');
      cs.enemies[2].move = mv('tower_master', '看破');
      window.__app.show('combat');
    });
    await sleep(600);
    await snap(page, `intent_${lang}_${vp}`);
  } catch (e) { console.log('ERR intent', lang, vp, String(e?.message ?? e).slice(0, 200)); }
  await c.close();
}
console.log('done', done.length);
