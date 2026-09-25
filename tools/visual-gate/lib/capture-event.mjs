// 門檻四（事件圖片）的擷取：遊戲自己的除錯總覽「事件」分頁（`src/ui/screens/debug.ts`）。
// 那一頁跟事件畫面挑圖**走同一支** `eventArtKey`，列出這位角色遇得到的每個事件：標題、內文、主圖，
// 以及每個選項的文字、結果文字、結果圖。四隻各切一次角色讀一次，就是「每隻 × 每個事件實際用到的圖」。
// 除錯總覽只讀不寫（不碰存檔、不開局）。
//
// 有差異的事件另外截那一列（圖＋文字並排）給人看圖文對不對得上。
import { join } from 'node:path';
import { jpg, openGame, waitScreen } from './browser.mjs';
import { HERO_NAME, sleep } from './util.mjs';

const SCRAPE = () => [...document.querySelectorAll('.dbg-event')].map((box, i) => {
  const h3 = box.querySelector('h3');
  const main = box.querySelector(':scope > .dbg-row .dbg-shot');
  const tags = [...h3.querySelectorAll('.dbg-tag')].map((t) => t.textContent);
  return {
    i,
    title: h3.childNodes[0]?.textContent ?? '',
    tags,
    mainKey: main?.querySelector('code')?.textContent ?? null,
    mainSrc: main?.querySelector('img')?.getAttribute('src') ?? null,
    mainMissing: !!main?.querySelector('.dbg-missing'),
    text: box.querySelector(':scope > .dbg-row .dbg-text p')?.textContent ?? '',
    choices: [...box.querySelectorAll('.dbg-choice')].map((c) => {
      const s = c.querySelector('.dbg-shot');
      return {
        key: s?.querySelector('code')?.textContent ?? null,
        src: s?.querySelector('img')?.getAttribute('src') ?? null,
        missing: !!s?.querySelector('.dbg-missing'),
        label: (c.querySelector('b')?.textContent ?? '').replace(/^選項：/, ''),
        result: c.querySelector('.dbg-text p')?.textContent ?? '',
      };
    }),
  };
});

async function pickTab(page, text) {
  await page.evaluate((t) => { const b = [...document.querySelectorAll('.dbg-bar button')].find((x) => x.textContent.trim() === t); b?.click(); }, text);
  await sleep(250);
}

export async function openDebugEvents(page, url, hero) {
  await openGame(page, url, '?debug');
  await page.evaluate(() => window.__app.show('debug'));
  await waitScreen(page, 'debug', 30000);
  await page.waitForSelector('.dbg-bar button', { timeout: 30000 });
  await pickTab(page, HERO_NAME[hero]);
  await pickTab(page, '事件');
  await page.waitForSelector('.dbg-event', { timeout: 30000 });
}

export async function captureEvents({ page, url, hero }) {
  await openDebugEvents(page, url, hero);
  return page.evaluate(SCRAPE);
}

/**
 * 截有差異的那一塊（除錯總覽裡）。`wants` 是 [{ i, slot }]：i 是 SCRAPE 的第幾個事件，
 * slot＝'main'（主圖＋內文那一列）、'r<k>'（第 k 個選項：結果圖＋選項文字＋結果文字）、'all'（整個事件）。
 * 回傳 { 'i:slot': 檔名 }
 */
export async function shootEvents({ page, url, hero, wants, shotDir, tag }) {
  if (!wants.length) return {};
  await openDebugEvents(page, url, hero);
  // 上方的除錯工具列會黏在畫面頂端、蓋住截圖，先藏起來；圖一律立刻載（不要 lazy）
  await page.addStyleTag({ content: '.dbg-bar{display:none!important}' });
  await page.evaluate(() => document.querySelectorAll('.dbg-event img').forEach((im) => { im.loading = 'eager'; }));
  const out = {};
  for (const { i, slot } of wants) {
    const ev = page.locator('.dbg-event').nth(i);
    const loc = slot === 'all' ? ev : slot === 'main' ? ev.locator(':scope > .dbg-row') : ev.locator('.dbg-choice').nth(Number(slot.slice(1)));
    if (!(await loc.count())) continue;
    await loc.scrollIntoViewIfNeeded();
    await page.waitForFunction((n) => [...document.querySelectorAll('.dbg-event')[n].querySelectorAll('img')].every((im) => im.complete), i, { timeout: 8000 }).catch(() => {});
    const file = join(shotDir, `event_${hero}_${tag}_${String(i).padStart(3, '0')}_${slot}.jpg`);
    await loc.screenshot({ path: file, type: 'jpeg', quality: 80 }).catch(async () => { await jpg(page, file); });
    out[`${i}:${slot}`] = file;
  }
  return out;
}
