// 門檻二（貓窩位置）的實機擷取：四隻 × 三關 × 每關三張底圖 × 五種姿勢。
// 每一組量貓（不透明像素）在舞台上的外框，截貓窩那一塊給人看。
//
// 做法照 2026-09-23 實機驗收 gate12/capture.js：
//   - 關數與樓層直接改局面、`show('rest')` 重畫（樓層 % 3 決定三張底圖的哪一張；避開關主前一格的獨白）；
//   - 蜷縮＝進門的樣子（遊戲自己畫的）；倒地＝把角色設成倒下再重畫；
//   - 打盹、磨爪、扶同伴＝把立繪換成那一張（跟遊戲 `heroSpriteKey` 同一套退路挑鍵）。那次拿「真的按打盹」對照過，差 0 像素；
//     貓窩立繪的位置只看關數、角色、底圖（`screens.css` 的 `[data-screen="rest"]` 那幾條），加上照網址寫的例外，換網址都吃得到。
import { join } from 'node:path';
import { bootRun, jpg, MEASURE_IMG, settle, waitImg } from './browser.mjs';
import { sleep } from './util.mjs';

export const REST_POSES = ['curl', 'nap', 'sharpen', 'helpup', 'down'];
export const REST_FLOORS = { 1: [9, 10, 11], 2: [24, 25, 26], 3: [39, 40, 41] };
const PREFIX = { ninja: 'ninja', feifei: 'feifei', dangdang: 'dangdang', fengfeng: 'fengfeng' };
// 跟 src/ui/assets.ts 的 POSE_FALLBACK 同一套（只抄貓窩用得到的幾個）
const FALLBACK = { nap: 'curl', sharpen: 'idle', helpup: 'idle', down: 'lose', curl: 'idle' };

export function restPoseKey(manifest, hero, pose) {
  const own = (p) => {
    const names = p === 'idle' ? [`hero/${PREFIX[hero]}`, `hero/${PREFIX[hero]}_idle`] : [`hero/${PREFIX[hero]}_${p}`];
    return names.find((k) => manifest.sprites[k] !== undefined) ?? null;
  };
  return own(pose) ?? (FALLBACK[pose] ? own(FALLBACK[pose]) : null) ?? own('idle');
}

export async function captureRest({ page, url, hero, manifest, shotDir, acts = [1, 2, 3] }) {
  const out = [];
  await bootRun(page, url, hero, `vg-rest-${hero}`);
  const sel = '#screen .scene-portrait';
  for (const act of acts) {
    for (const floor of REST_FLOORS[act]) {
      await page.evaluate(([a, f]) => { const r = window.__app.run; r.act = a; r.floor = f; r.players[0].down = false; r.players[0].hp = Math.max(1, r.players[0].maxHp - 20); window.__app.show('rest'); }, [act, floor]);
      await waitImg(page, sel);
      await sleep(120);
      await settle(page);
      const stageInfo = await page.evaluate(() => { const s = document.querySelector('#stage').dataset; return { restbg: s.restbg, act: s.act, hero: s.hero }; });
      for (const pose of REST_POSES) {
        let how = '遊戲自己畫的（進門）';
        if (pose === 'down') {
          await page.evaluate(() => { window.__app.run.players[0].down = true; window.__app.show('rest'); });
          how = '設成倒下再重畫';
          await waitImg(page, sel);
          await sleep(120);
        } else if (pose !== 'curl') {
          const key = restPoseKey(manifest, hero, pose);
          if (!key) { out.push({ act, floor, pose, err: '沒有這張圖的鍵' }); continue; }
          await page.evaluate(([s, u]) => { const i = document.querySelector(s); if (i) i.src = u; }, [sel, url + manifest.sprites[key]]);
          how = '換成 ' + key;
          await waitImg(page, sel);
        }
        await settle(page);
        const m = await page.evaluate(MEASURE_IMG, sel);
        const file = join(shotDir, `rest_${hero}_a${act}_f${floor}_${pose}.jpg`);
        const clip = { x: 0, y: 120, width: 700, height: 600 };
        await jpg(page, file, clip, 75);
        out.push({ act, floor, pose, how, ...stageInfo, ...m, shot: file, clip });
        if (pose === 'down') await page.evaluate(() => { window.__app.run.players[0].down = false; });
      }
    }
  }
  return out;
}
