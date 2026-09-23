import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * 2026-09-23 第二輪推前審查（主控修）：
 *  中-1 連線第一場開打前等連線牌面，保險原本 20 秒、等的時候舞台點不動又沒提示；中途斷線回標題，標題也點不動。
 *  低-1 換畫面時墊底淡出的舊畫面也有 .scene，開場泡泡會先被推到右上再跳回來。
 * 都是讀原始碼規矩：畫面行為要真的瀏覽器才看得到，倉庫測試不帶 DOM。
 */
const APP = readFileSync('src/ui/app.ts', 'utf8').replace(/\r\n/g, '\n');
const SCREENS = readFileSync('src/ui/styles/screens.css', 'utf8').replace(/\r\n/g, '\n');

describe('第二輪推前審查', () => {
  it('中-1：離開連線時一起解開「開打前點不動」', () => {
    const leave = APP.slice(APP.indexOf('  leaveCoop(): void {'), APP.indexOf('  backToMap(): void {'));
    expect(leave.length).toBeGreaterThan(200);
    expect(leave).toContain('this.fightPending = false;');
    expect(leave).toContain("this.stage.classList.remove('fight-pending');");
  });

  it('中-1：連線牌面的保險縮到 6 秒', () => {
    const fight = APP.slice(APP.indexOf('  startFight(encounterId'), APP.indexOf('  afterCombat('));
    expect(fight).toContain('Promise.race([coopArtReady(), new Promise<void>((res) => window.setTimeout(res, 6000))])');
    expect(fight).not.toContain('20000');
  });

  it('低-1：泡泡推到右上只看現在的畫面層', () => {
    expect(SCREENS).toContain('#stage:has(#screen .scene) .toast {');
    expect(SCREENS).not.toContain('#stage:has(.scene) .toast');
  });
});
