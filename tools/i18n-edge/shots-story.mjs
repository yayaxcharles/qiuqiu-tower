#!/usr/bin/env node
/*
 * 劇情最長句的重現截圖（幻燈片與對白框），底圖放地圖畫面（不是祝福畫面）。
 *   node tools/i18n-edge/shots-story.mjs
 */
import { readFileSync } from 'node:fs';
import { openPage, bootRun, sleep, shotPath, settle, OUT } from './lib.mjs';

const INITVOICE = `(() => { if (/^(127\\.0\\.0\\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.voice', 'off'); } catch (e) {} } })();`;
const story = JSON.parse(readFileSync(`${OUT}/story_enja_deskphone_ninja-feifei-dangdang-fengfeng.json`, 'utf8'));
for (const lang of ['en', 'ja']) for (const vp of ['desk', 'phone']) {
  const xs = story.filter((x) => x.lang === lang && x.vp === vp && x.m && !x.m.err && x.src !== 'pack_other');
  const longest = (ctx) => xs.filter((x) => x.ctx === ctx).sort((a, b) => (b.m.box.b - b.m.box.t) - (a.m.box.b - a.m.box.t))[0];
  for (const ctx of ['slide', 'dialogue']) {
    const it = longest(ctx);
    if (!it) continue;
    const c = await openPage(lang, vp, 'figs2', INITVOICE);
    const { page } = c;
    try {
      await bootRun(page, it.hero, 'fig');
      await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('rats3'); });
      await page.waitForFunction(() => document.querySelector('#stage')?.dataset.screen === 'combat', null, { timeout: 30000 });
      await sleep(2600);
      await page.evaluate(async ([item]) => {
        const dlg = await import('/qiuqiu-tower/src/ui/dialogue.ts');
        const sl = await import('/qiuqiu-tower/src/ui/slides.ts');
        if (item.ctx === 'slide') sl.playSlides([{ img: 'bg/still_teach', lines: [{ speaker: item.speaker, text: item.text }], box: item.box }], () => {});
        else dlg.playDialogue([{ speaker: item.speaker, text: item.text }], () => {}, undefined, !!item.literal);
      }, [it]);
      await sleep(1700);
      await settle(page);
      const file = `fig_story_${ctx}_${lang}_${vp}_${it.hero}.jpg`;
      await page.screenshot({ path: shotPath(file), type: 'jpeg', quality: 78 });
      console.log('shot', file, [...(it.m.shown)].length, 'chars', it.m.lines, 'lines');
    } catch (e) { console.log('ERR', lang, vp, ctx, String(e?.message ?? e).slice(0, 200)); }
    await c.close();
  }
}
