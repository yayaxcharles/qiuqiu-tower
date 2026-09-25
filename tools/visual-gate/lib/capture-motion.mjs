// 門檻三（動作流暢度）的實機擷取：每隻貓在同一場固定的戰鬥裡依序演
//   近戰 → 丟東西 → 挨打（沒擋） → 接招（蜷縮擋一部分） → 最後一擊＋勝利（接戰利品畫面） → 過關走路，
// 每一段錄畫面（CDP，每一格）＋頁面裡逐格量角色外框。兩版用同一顆種子、同一副牌、同一串動作。
//
// 作弊（照 2026-09-23 fluid.js，報告裡會寫）：開戰前換手牌與牌堆、飯糰 9、魔物血 ×10、
// 魔物這一回合的招式改成「打 N」、最後把魔物血改 1。
import { join } from 'node:path';
import { bootRun, POINT_FN, realClick, waitScreen } from './browser.mjs';
import { film } from './film.mjs';
import { sleep } from './util.mjs';

const MELEE = { ninja: 'sanjo', feifei: 'feifei_feizhen', dangdang: 'dangdang_zhengquan', fengfeng: 'fengfeng_pingzhan' };
const BLOCK = { ninja: 'tanding', feifei: 'feifei_tuikai', dangdang: 'dangdang_jiapan', fengfeng: 'fengfeng_hushen' };
const THROW = 'maoqiudan';

export const MOTION_SCENES = [
  { id: 'melee', name: '近戰（出攻擊牌）', dur: 1500 },
  { id: 'throw', name: '丟東西（毛球彈）', dur: 1600 },
  { id: 'hurt', name: '挨打（沒擋，魔物打 6）', dur: 3400 },
  { id: 'block_hit', name: '接招（蜷縮擋下一部分）', dur: 3400 },
  { id: 'victory', name: '最後一擊＋勝利→戰利品', dur: 3200 },
  { id: 'actwalk', name: '過關走路', dur: 3600 },
];

const CAN_ACT = () => {
  const cs = window.__app && window.__app.cs; if (!cs || cs.phase !== 'player' || cs.enemyActing) return false;
  const b = document.querySelector('.end-turn'); if (!b || b.disabled || b.classList.contains('disabled')) return false;
  if (document.querySelector('#overlay .modal-overlay, #overlay .dialogue-overlay, .slide-overlay')) return false;
  if (document.querySelector('.hand .card.flying')) return false;
  return true;
};

async function waitCanAct(page, timeout = 20000) {
  await page.waitForFunction(CAN_ACT, null, { timeout, polling: 60 });
}

async function uidOf(page, cardId) {
  return page.evaluate((id) => {
    const p = window.__app.cs.players[window.__app.seat];
    const inHand = p.hand.filter((c) => c.cardId === id).map((c) => c.uid);
    const clickable = [...document.querySelectorAll('.hand .card.clickable')].map((n) => Number(n.dataset.uid));
    return inHand.find((u) => clickable.includes(u)) ?? null;
  }, cardId);
}

/** 用真的滑鼠打出一張牌（要目標就點第一隻活著的魔物） */
async function playCard(page, uid) {
  const pt = await page.evaluate(({ uid, POINT_FN }) => { const f = eval(POINT_FN); const n = document.querySelector(`.hand .card[data-uid="${uid}"]`); return n ? f(n) : null; }, { uid, POINT_FN });
  if (!pt) throw new Error(`手牌裡點不到 uid=${uid}`);
  await page.mouse.click(pt.x, pt.y);
  await sleep(110);
  if (await page.evaluate(() => !!document.querySelector('.target-catcher'))) {
    const tp = await page.evaluate(({ POINT_FN }) => {
      const f = eval(POINT_FN); const cs = window.__app.cs; const e = cs.enemies.find((x) => !x.dead);
      const n = document.querySelector(`.unit.enemy[data-uid="${e.uid}"] .sprite-box`) || document.querySelector(`.unit.enemy[data-uid="${e.uid}"]`);
      return n ? f(n) : null;
    }, { POINT_FN });
    if (!tp) throw new Error('點不到魔物');
    await page.mouse.click(tp.x, tp.y);
  }
}

async function endTurn(page) {
  if (!(await realClick(page, '.end-turn'))) throw new Error('點不到結束回合');
}

async function setEnemyAttack(page, amount) {
  await page.evaluate((n) => {
    const cs = window.__app.cs;
    for (const e of cs.enemies) if (!e.dead) { e.move = { intent: 'attack', label: '閘門撞擊', effects: [{ kind: 'damage', amount: n === 'block+3' ? cs.players[0].block + 3 : n }] }; }
  }, amount);
}

/**
 * 一隻貓、一個版本：演完全部段落，回傳每一段的 { samples, frames }（frames 是 CDP 畫面格，給後面算亮度與存膠卷）。
 * `only`：只演這幾段（快速版）。
 */
export async function captureMotion({ page, url, hero, only = null, log = () => {} }) {
  const scenes = {};
  const want = (id) => !only || only.includes(id);
  await bootRun(page, url, hero, `vg-motion-${hero}`);
  // 固定一副手牌與牌堆，第二回合抽到的也固定（牌堆從前面抽）
  const hand = [MELEE[hero], THROW, MELEE[hero], BLOCK[hero], MELEE[hero]];
  const draw = [BLOCK[hero], MELEE[hero], BLOCK[hero], MELEE[hero], BLOCK[hero], MELEE[hero], BLOCK[hero], MELEE[hero], BLOCK[hero], MELEE[hero]];
  await page.evaluate(({ hand, draw }) => {
    const app = window.__app; const orig = app.show.bind(app); let done = false;
    app.show = (name, ...r) => {
      if (name === 'combat' && app.cs && !done) {
        done = true;
        const p = app.cs.players[0]; let u = 97501;
        p.hand.splice(0, p.hand.length, ...hand.map((id) => ({ uid: u++, cardId: id, upgraded: false })));
        p.drawPile.splice(0, p.drawPile.length, ...draw.map((id) => ({ uid: u++, cardId: id, upgraded: false })));
        p.discardPile.splice(0, p.discardPile.length);
        p.energy = 9;
        for (const e of app.cs.enemies) { e.maxHp *= 10; e.hp = e.maxHp; }
      }
      return orig(name, ...r);
    };
    const r = app.run; r.act = 1; r.floor = 2; r.flags['tut:combat'] = true;
    app.startFight('wood_dummy');
  }, { hand, draw });
  await waitScreen(page, 'combat', 30000);
  await waitCanAct(page);
  await sleep(2600);   // 開場泡泡、逐格圖載好
  const scene = async (id, fn, dur) => {
    if (!want(id)) { await fn(); return; }
    log(`    ${hero} ${id}`);
    scenes[id] = await film(page, fn, dur);
  };
  const energy = () => page.evaluate(() => { window.__app.cs.players[0].energy = 9; });

  // 1 近戰
  await energy();
  await scene('melee', async () => playCard(page, await uidOf(page, MELEE[hero])), 1500);
  await waitCanAct(page); await sleep(500);
  // 2 丟東西
  await energy();
  await scene('throw', async () => playCard(page, await uidOf(page, THROW)), 1600);
  await waitCanAct(page); await sleep(500);
  // 3 挨打（沒擋）
  await page.evaluate(() => { window.__app.cs.players[0].block = 0; });
  await setEnemyAttack(page, 6);
  await scene('hurt', () => endTurn(page), 3400);
  await waitCanAct(page, 25000); await sleep(600);
  // 4 接招：先打一張防禦牌（不錄），魔物打「蜷縮＋3」
  await energy();
  const b = await uidOf(page, BLOCK[hero]);
  if (b !== null) { await playCard(page, b); await waitCanAct(page); await sleep(900); }
  await setEnemyAttack(page, 'block+3');
  await scene('block_hit', () => endTurn(page), 3400);
  await waitCanAct(page, 25000); await sleep(600);
  // 5 最後一擊＋勝利
  await energy();
  await page.evaluate(() => { for (const e of window.__app.cs.enemies) if (!e.dead) e.hp = 1; });
  await scene('victory', async () => playCard(page, await uidOf(page, MELEE[hero])), 3200);
  // 勝利之後會自己換到戰利品畫面：等它換完，免得過關畫面開到一半被蓋掉
  await waitScreen(page, 'reward', 15000).catch(() => {});
  await sleep(400);
  // 6 過關走路：開過關畫面，挑秘寶 → 「出發」→ 亮關主信物 →「帶著它上…」那一下才開始錄（那一下就是走路轉場）
  if (want('actwalk')) {
    await page.evaluate(() => window.__app.show('actclear', {}));
    await waitScreen(page, 'actclear');
    await sleep(700);
    for (let i = 0; i < 8; i++) {
      const st = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('#screen button.btn.primary')].find((x) => !x.disabled && x.offsetParent !== null);
        const tiles = document.querySelectorAll('#screen .pick-tile').length;
        const picked = document.querySelectorAll('#screen .pick-tile.selected').length;
        return { text: btn?.textContent ?? '', tiles, picked };
      });
      if (st.tiles && !st.picked) { await realClick(page, '#screen .pick-tile'); await sleep(300); continue; }
      const walkNow = /^帶著它上/.test(st.text) || (/^(出發|帶著新招上)/.test(st.text) && !st.picked);
      if (walkNow) {
        log(`    ${hero} actwalk`);
        const re = /^帶著它上/.test(st.text) ? '^帶著它上' : '^(出發|帶著新招上)';
        scenes.actwalk = await film(page, () => realClick(page, '#screen button.btn.primary', { textRe: re }), 3600);
        break;
      }
      if (!st.text) break;
      await realClick(page, '#screen button.btn.primary');
      await sleep(700);
    }
    if (!scenes.actwalk) scenes.actwalk = { err: '沒走到「帶著它上」那一步' };
  }
  return scenes;
}
