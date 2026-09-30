#!/usr/bin/env node
/*
 * 劇情文字逐句量測（英／日／繁中對照 × 桌機／手機橫拿 × 四位主角）。
 *   node tools/i18n-edge/story.mjs [en,ja,zh] [desk,phone] [hero,…]
 * 來源：序章與各關幻燈片、過關、結局（單人＋各種搭檔連線版）、關主開場／換階段／落敗對白、落敗、祕笈、吐槽、魔物初見。
 * 再把語言包裡「沒被上面掃到」的台詞也各用對白框量一次（涵蓋整份 pack.line）。
 * 每一句用遊戲自己的 playDialogue／playSlides／toast／bubbleAt 播出來再量：行數、框高、框頂位置、蓋到立繪多少、是否出舞台。
 * 配音關掉（本機開發網址自己的儲存），不會下載語音檔。
 */
import { HEROES, openPage, bootRun, sleep, saveJson, shotPath, waitScreen } from './lib.mjs';

const langs = (process.argv[2] ?? 'en,ja').split(',');
const vps = (process.argv[3] ?? 'desk,phone').split(',');
const heroes = (process.argv[4] ?? HEROES.join(',')).split(',');
const TAG = process.env.EDGE_TAG ?? 'story';

const INIT = `(() => { if (/^(127\\.0\\.0\\.1|localhost)$/.test(location.hostname)) { try { localStorage.setItem('qiuqiu.voice', 'off'); } catch (e) {} } })();`;

/** 頁面內：收集這位主角的所有劇情句 */
const COLLECT = async (hero) => {
  const M = (p) => import('/qiuqiu-tower/src/' + p);
  const dlg = await M('content/dialogue.ts');
  const ss = await M('ui/storyslides.ts');
  const cards = await M('content/cards.ts');
  const ffd = await M('content/fengfeng-dialogue.ts');
  const items = [];
  const push = (ctx, src, l, extra = {}) => { if (l && l.text) items.push({ ctx, src, speaker: l.speaker ?? '旁白', text: l.text, ...extra }); };
  const partners = ['ninja', 'feifei', 'dangdang', 'fengfeng'].filter((h) => h !== hero);
  const deck = cards.starterDeckFor(hero);
  const slideSets = (tag) => {
    const sets = [];
    sets.push(['prologue', ss.prologueSlides(hero)], ['act1', ss.actClearSlides(hero, 1)], ['act2', ss.actClearSlides(hero, 2)], ['top', ss.topSceneSlides(hero)]);
    for (const d of [1, 5]) sets.push([`ending_d${d}`, ss.endingSlides(hero, deck, d)]);
    for (const [k, slides] of sets) for (const s of slides) for (const l of s.lines) push('slide', `${tag}:${k}`, l, { box: s.box ?? 'top' });
  };
  dlg.setCoopStory(null);
  slideSets('solo');
  for (const p of partners) { dlg.setCoopStory({ partner: p, mirror: hero }); slideSets(`coop:${p}`); }
  dlg.setCoopStory(null);
  const st = dlg.storyFor(hero);
  // 純對白（app.ts 用 playDialogue）
  const lit = (arr, src) => (arr ?? []).forEach((l) => push('dialogue', src, l, { literal: true }));
  lit(st.defeat, 'defeat');
  lit(st.victory, 'victory_raw');
  const bossTables = ['bossIntroById', 'bossPhase2ById', 'bossPhase3ById', 'bossDefeatById'];
  const D = dlg.dialogue;
  for (const tb of bossTables) for (const [id, arr] of Object.entries(D[tb] ?? {})) (arr ?? []).forEach((l) => push('dialogue', `${tb}:${id}`, { speaker: l.speaker, text: l.speaker === '球球' ? dlg.lineFor(hero, l.text) : dlg.castLineFor(hero, l.text) }));
  for (const tb of ['bossIntroGeneric', 'bossPhase2Generic', 'bossPhase3Generic', 'secretScroll', 'afterFirstElite']) (D[tb] ?? []).forEach((l) => push('dialogue', tb, { speaker: l.speaker, text: l.speaker === '球球' ? dlg.lineFor(hero, l.text) : dlg.castLineFor(hero, l.text) }));
  for (const arr of D.restBeforeBossByAct ?? []) arr.forEach((l) => push('dialogue', 'restBeforeBoss', { speaker: l.speaker, text: l.speaker === '球球' ? dlg.lineFor(hero, l.text) : dlg.castLineFor(hero, l.text) }));
  for (const p of partners) {
    dlg.setCoopStory({ partner: p, mirror: hero });
    for (const stage of ['intro', 'phase2', 'phase3']) (dlg.coopBossLines('tower_master', stage, hero) ?? []).forEach((l) => push('dialogue', `coopBoss:${p}:${stage}`, l, { literal: true }));
  }
  dlg.setCoopStory(null);
  // 吐槽（戰鬥裡的小泡泡）
  const barks = (arr, src) => (arr ?? []).forEach((t) => push('bark', src, { speaker: hero === 'ninja' ? '球球' : hero === 'feifei' ? '菲菲' : hero === 'dangdang' ? '噹噹' : '封封', text: t }));
  for (const k of ['battleStart', 'battleWin', 'hungry', 'lowHp', 'chestLines', 'restNapLines', 'restSharpenLines', 'reviveLines']) barks(st[k], k);
  barks(dlg.dialogue.shopkeeper, 'shopkeeper');
  for (const [id, t] of Object.entries(st.firstMeet ?? {})) push('bubble', `firstMeet:${id}`, { speaker: '魔物', text: t });
  for (const [k, arr] of Object.entries(ffd.fengfengShortLines ?? {})) barks(arr, `fengfengShort:${k}`);
  // 收尾單句
  for (const [k, t] of [['victoryTeaser', st.victoryTeaser], ['hardModeEpilogue', st.hardModeEpilogue]]) push('dialogue', k, { speaker: '旁白', text: t }, { literal: true });
  for (const [k, t] of Object.entries(st.victoryNarration ?? {})) push('dialogue', `victoryNarration:${k}`, { speaker: '旁白', text: t }, { literal: true });
  // 語言包裡沒被掃到的台詞：用對白框各量一次
  const idx = await M('i18n/index.ts');
  const pack = idx.currentPack();
  const seen = new Set(items.map((i) => i.text));
  if (pack) for (const k of Object.keys(pack.line)) if (!seen.has(k) && k.length > 3) push('dialogue', 'pack_other', { speaker: '旁白', text: k }, { literal: true });
  // 去重（同一句同語境只量一次）
  const out = []; const key = new Set();
  for (const i of items) { const kk = `${i.ctx}|${i.box ?? ''}|${i.speaker}|${i.text}`; if (key.has(kk)) continue; key.add(kk); out.push(i); }
  return out;
};

/** 頁面內：逐句用真的函式播出來量 */
const MEASURE = async (items) => {
  const M = (p) => import('/qiuqiu-tower/src/' + p);
  const dlgUI = await M('ui/dialogue.ts');
  const slides = await M('ui/slides.ts');
  const ov = await M('ui/overlay.ts');
  const idx = await M('i18n/index.ts');
  const stage = document.querySelector('#stage');
  const sr = () => stage.getBoundingClientRect();
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = [];
  const lang = idx.getLang();
  const linesOf = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((x) => x.width > 1); return new Set(rs.map((x) => Math.round(x.top / 4))).size; };
  for (const it of items) {
    const k = sr().width / 1280;
    const S = (r) => ({ l: (r.left - sr().left) / k, r: (r.right - sr().left) / k, t: (r.top - sr().top) / k, b: (r.bottom - sr().top) / k });
    let m = null;
    try {
      if (it.ctx === 'slide') {
        slides.playSlides([{ img: 'bg/still_teach', lines: [{ speaker: it.speaker, text: it.text }], box: it.box }], () => {});
        await raf2();
        const box = document.querySelector('#overlay .slide-box');
        const tx = box?.querySelector('.dialogue-text');
        if (box && tx) { m = { box: S(box.getBoundingClientRect()), lines: linesOf(tx), textB: S(tx.getBoundingClientRect()).b, textT: S(tx.getBoundingClientRect()).t, speaker: box.querySelector('.dialogue-speaker')?.textContent ?? '', shown: tx.textContent }; }
      } else if (it.ctx === 'dialogue') {
        dlgUI.playDialogue([{ speaker: it.speaker, text: it.text }], () => {}, undefined, !!it.literal);
        await raf2();
        const ovl = document.querySelector('#overlay .dialogue-overlay');
        const box = ovl?.querySelector('.dialogue-box');
        const tx = box?.querySelector('.dialogue-text');
        const pt = ovl?.querySelector('.dialogue-portrait');
        if (box && tx) {
          m = { box: S(box.getBoundingClientRect()), lines: linesOf(tx), textB: S(tx.getBoundingClientRect()).b, textT: S(tx.getBoundingClientRect()).t, portrait: pt && !pt.hidden ? S(pt.getBoundingClientRect()) : null, speaker: box.querySelector('.dialogue-speaker')?.textContent ?? '', shown: tx.textContent };
        }
      } else if (it.ctx === 'bark' || it.ctx === 'bubble') {
        if (it.ctx === 'bark') dlgUI.toast(it.text, it.speaker); else dlgUI.bubbleAt(it.text, it.speaker === '魔物' ? '' : it.speaker, 900, 300);
        await raf2();
        const tt = [...document.querySelectorAll('#overlay .toast')].pop();
        if (tt) { m = { box: S(tt.getBoundingClientRect()), lines: linesOf(tt), shown: tt.textContent }; }
      }
    } catch (e) { m = { err: String(e).slice(0, 120) }; }
    // 收乾淨
    try { ov.closeStoryOverlays(); document.querySelectorAll('#overlay .toast, #overlay .dialogue-overlay, #overlay .slide-overlay').forEach((n) => n.remove()); } catch { /* */ }
    out.push({ ...it, lang, m });
  }
  return out;
};

const results = [];
const stats = {};
for (const lang of langs) for (const vp of vps) {
  const c = await openPage(lang, vp, TAG, INIT);
  const { page } = c;
  for (const hero of heroes) {
    const label = `${lang}/${vp}/${hero}`;
    try {
      await bootRun(page, hero, `story-${hero}`);
      // 戰鬥畫面裡量吐槽泡泡（樣式吃 data-screen=combat）
      await page.evaluate(() => { const r = window.__app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true; window.__app.startFight('rats3'); });
      await waitScreen(page, 'combat', 30000);
      await sleep(2600);
      const items = await page.evaluate(COLLECT, hero);
      // 分批量，避免單次過久
      const rows = [];
      for (let i = 0; i < items.length; i += 250) rows.push(...await page.evaluate(MEASURE, items.slice(i, i + 250)));
      for (const r of rows) results.push({ lang, vp, hero, ...r });
      console.log(label, 'items', items.length, 'measured', rows.filter((r) => r.m && !r.m.err).length, 'err', rows.filter((r) => r.m?.err).length);
    } catch (e) { console.log('ERR', label, String(e?.message ?? e).slice(0, 300)); }
  }
  await c.close();
  saveJson(`${TAG}_${langs.join('')}_${vps.join('')}_${heroes.join('-')}.json`, results);
}
