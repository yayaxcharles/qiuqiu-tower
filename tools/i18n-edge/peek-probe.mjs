#!/usr/bin/env node
/*
 * 手機按住放大罐頭鋪一格貨時，放大的複製品裡說明有沒有被夾成 4／6 行（M-4 查證）：
 * 真的對貨架格送一個觸控的 pointerdown、等 0.6 秒讓 `cardpeek.ts` 生出放大的那張，再量複製品裡 `.small` 的夾行與是否有字被藏。
 *   node tools/i18n-edge/peek-probe.mjs [en] [phone]
 */
import { openPage, bootRun, sleep, waitScreen } from './lib.mjs';

const lang = process.argv[2] ?? 'en', vp = process.argv[3] ?? 'phone';
const c = await openPage(lang, vp, 'peekp');
const { page } = c;
await bootRun(page, 'ninja', 'peekp');
await page.evaluate(async () => {
  const { makeShops } = await import('/qiuqiu-tower/src/engine/run.ts');
  const run = window.__app.run; run.act = 2; run.floor = 20; run.players[0].fish = 9999;
  const shops = makeShops(run); shops[0].keeper = 'curio';
  window.__app.show('shop', { shops });
});
await waitScreen(page, 'shop');
await sleep(1200);
const out = await page.evaluate(async () => {
  const measure = (root) => [...root.querySelectorAll('.shop-item .small')].map((s) => { const cs = getComputedStyle(s); return { text: s.textContent.slice(0, 24), clamp: cs.webkitLineClamp, hidden: s.scrollHeight - s.clientHeight }; });
  const items = [...document.querySelectorAll('.scene-goods .shop-item:not(.card-item)')];
  const target = items.find((n) => (n.querySelector('.small')?.scrollHeight ?? 0) > (n.querySelector('.small')?.clientHeight ?? 0) + 1) ?? items[0];
  const inShelf = measure(target.parentElement ? target : document);
  const r = target.getBoundingClientRect();
  target.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  await new Promise((res) => setTimeout(res, 700));
  const peek = document.querySelector('#overlay .card-peek');
  const inPeek = peek ? measure(peek) : null;
  return { shelfTarget: measure(target).slice(0, 1), peekFound: !!peek, inPeek };
});
console.log(JSON.stringify(out));
await c.close();
