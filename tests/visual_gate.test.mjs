// 畫面比對閘門（tools/visual-gate）的幾條約定與比對邏輯。閘門本身要開瀏覽器，這裡只測純函式與設定，雲端也跑得動。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyAllow, compareEvents, compareRest, filmMetrics, gateStatus, timelineMismatch } from '../tools/visual-gate/lib/compare.mjs';

// 這兩台 core.autocrlf=true：讀原始碼比多行之前先把 \r\n 換成 \n
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('畫面比對閘門的設定', () => {
  it('deploy.sh 開頭提醒推前先跑 gate:visual，但沒有接成必經步驟（只出現在註解裡）', () => {
    const lines = read('tools/deploy.sh').split('\n');
    expect(lines.slice(0, 12).some((l) => l.startsWith('#') && l.includes('npm run gate:visual'))).toBe(true);
    expect(lines.filter((l) => !l.trimStart().startsWith('#') && l.includes('gate:visual'))).toEqual([]);
  });

  it('playwright-core 列在 optionalDependencies：推送閘門照鎖檔借套件時，主資料夾還沒重裝也不會被擋', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['gate:visual']).toBe('node tools/visual-gate/gate.mjs');
    expect(pkg.optionalDependencies?.['playwright-core']).toBeTruthy();
    expect(pkg.devDependencies?.['playwright-core']).toBeUndefined();
  });
});

const cat = (x, y, w, h) => ({ x, y, w, h, bottom: y + h });

describe('門檻二：貓窩外框', () => {
  const row = (c, src = '/qiuqiu-tower-coop/assets/sprites/hero/feifei_nap-AAAAAAAA.webp') => ({ act: 2, floor: 24, pose: 'nap', restbg: 'screen_rest_mid', src, cat: c });
  it('一模一樣＝沒有發現', () => {
    const r = compareRest({ restCap: { base: { feifei: [row(cat(40, 300, 200, 180))] }, head: { feifei: [row(cat(40, 300, 200, 180))] } }, heroes: ['feifei'] });
    expect(r.findings).toEqual([]);
  });
  it('往下 12 像素＝不通過，寫出往下沉幾像素', () => {
    const r = compareRest({ restCap: { base: { feifei: [row(cat(40, 300, 200, 180))] }, head: { feifei: [row(cat(40, 312, 200, 180))] } }, heroes: ['feifei'] });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].level).toBe('fail');
    expect(r.findings[0].what).toContain('往下沉 12.0 像素');
    expect(r.findings[0].id).toBe('rest:feifei:a2:f24:nap');
  });
});

describe('門檻四：事件圖', () => {
  const ev = (src, key = 'bg/event_dangdang_broken_shrine_r1') => [{ i: 0, title: '倒了的神龕', tags: [], mainKey: 'bg/event_dangdang_broken_shrine', mainSrc: '/x/assets/bg/event_dangdang_broken_shrine-MAINMAIN.webp', text: 't',
    choices: [{ key, src, label: '拿走供品', result: 'r' }] }];
  it('同一張圖＝沒有發現；內容雜湊變了＝不通過', () => {
    const same = compareEvents({ eventCap: { base: { dangdang: ev('/x/a-AAAAAAAA.webp') }, head: { dangdang: ev('/x/a-AAAAAAAA.webp') } }, heroes: ['dangdang'] });
    expect(same.findings).toEqual([]);
    const changed = compareEvents({ eventCap: { base: { dangdang: ev('/x/a-AAAAAAAA.webp') }, head: { dangdang: ev('/x/a-BBBBBBBB.webp') } }, heroes: ['dangdang'] });
    expect(changed.findings.map((f) => [f.level, f.id])).toEqual([['fail', 'event:dangdang:bg/event_dangdang_broken_shrine:r0']]);
  });
  it('拿到別隻的版本＝不通過（跟舊版一不一樣都算）', () => {
    const wrong = ev('/x/a-AAAAAAAA.webp', 'bg/event_feifei_broken_shrine_r1');
    const r = compareEvents({ eventCap: { base: { dangdang: wrong }, head: { dangdang: wrong } }, heroes: ['dangdang'] });
    expect(r.findings.some((f) => f.level === 'fail' && f.id.endsWith(':wronghero'))).toBe(true);
  });
});

describe('門檻三：膠卷指標', () => {
  const samples = [0, 16, 33, 50].map((t) => ({ t, scr: 'combat', mode: 'canvas', b: [30, 150, 200, 250] }));
  it('整格偏白又沒有層次＝閃白；同一條時間線自己比自己＝零對不上', () => {
    const m = filmMetrics({ samples, stats: [[110, 50], [240, 5], [112, 51]], frameTimes: [0, 16, 33] });
    expect(m.flash).toEqual([16]);
    expect(m.missingMs).toBe(0);
    expect(timelineMismatch({ samples }, { samples }).ratio).toBe(0);
  });
});

describe('允許清單', () => {
  it('萬用字元比對代號，放行後那一道門檻不再算不通過', () => {
    const fs = [{ id: 'event:feifei:bg/event_feifei_mirror_hall:main', level: 'fail' }, { id: 'rest:ninja:a1:f9:nap', level: 'warn' }];
    const rules = applyAllow(fs, { items: [{ match: 'event:*:bg/event_feifei_mirror_hall:*', why: '這批重生鏡子走廊' }] });
    expect(fs[0].allowed).toBe(true);
    expect(rules[0].used).toBe(1);
    expect(gateStatus([fs[0]])).toBe('pass');
    expect(gateStatus(fs)).toBe('warn');
  });
});
