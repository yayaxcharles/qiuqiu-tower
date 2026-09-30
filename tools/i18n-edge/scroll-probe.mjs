#!/usr/bin/env node
/*
 * 事件文字讓位的第三級（文字捲動）實測：真實事件沒有一篇長到需要它（928 個畫面最深只到第 2 級），
 * 所以塞一段人造的超長文字（把英文事件開場重複四遍）加四顆選項進 `sceneView`，量對白框頂有沒有停在插圖下面、文字那塊能不能捲。
 *   node tools/i18n-edge/scroll-probe.mjs [en] [desk]
 */
import { openPage, bootRun, sleep, shotPath, waitScreen } from './lib.mjs';

const lang = process.argv[2] ?? 'en', vp = process.argv[3] ?? 'desk';
const c = await openPage(lang, vp, 'scrollp');
const { page } = c;
await bootRun(page, 'fengfeng', 'scrollp');
await page.evaluate(() => { window.__app.run.players[0].fish = 500; });
await page.evaluate(() => window.__app.enterEvent('greedy_merchant'));
await waitScreen(page, 'event', 20000);
await sleep(1200);
const r = await page.evaluate(async () => {
  const { sceneView } = await import('/qiuqiu-tower/src/ui/scene.ts');
  const old = document.querySelector('#stage .scene');
  const text = old.querySelector('.scene-text').textContent;
  const img = old.querySelector('img.event-art').cloneNode(true);
  img.removeAttribute('style');
  const mk = (t) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = t; return b; };
  const scene = sceneView({ art: img, speaker: 'Long Test', text: `${text} ${text} ${text} ${text}`, actions: [mk('Option one that is fairly long (pay 80 Dried Fish)'), mk('Option two that is fairly long (gain a card)'), mk('Option three'), mk('Option four (pay 150 Dried Fish; gain a lot of things at once)')], column: true });
  old.replaceWith(scene);
  await new Promise((res) => setTimeout(res, 1200));
  const st = document.querySelector('#stage').getBoundingClientRect(); const k = st.width / 1280;
  const box = scene.querySelector('.scene-box').getBoundingClientRect();
  const art = scene.querySelector('.scene-art img').getBoundingClientRect();
  const tx = scene.querySelector('.scene-text');
  const btns = [...scene.querySelectorAll('.scene-actions .btn')].map((b) => Math.round((b.getBoundingClientRect().bottom - st.top) / k));
  return { cls: [...scene.classList].join(' '), boxTop: Math.round((box.top - st.top) / k), artBottom: Math.round((art.bottom - st.top) / k), artH: Math.round(art.height / k), scrollable: tx.scrollHeight > tx.clientHeight + 1, textH: tx.clientHeight, textScrollH: tx.scrollHeight, maxHeight: tx.style.maxHeight, lastBtnBottom: Math.max(...btns) };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: shotPath(`scrollprobe_${lang}_${vp}.png`) });
await c.close();
