import { afterEach, describe, expect, it } from 'vitest';
import { beginCombat, newRun } from '../../src/engine/run';
import { playCard } from '../../src/engine/combat';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { hasCoopScene, setCoopStory, storyFor } from '../../src/content/dialogue';
import { prologueSlides } from '../../src/ui/storyslides';

/**
 * 2026-09-17 稽核代理抓到的幾條，每一條都補一個會反向變紅的測試。
 */
afterEach(() => setCoopStory(null));

function setup() {
  const run = newRun('audit-0917', 1, 'dangdang');
  run.currentNode = run.map.nodes.find((n) => n.type === '戰鬥')!.id;
  const cs = beginCombat(run);
  const p = cs.players[0]!;
  p.energy = 99; p.hand.length = 0; p.block = 0; p.statuses['反彈'] = 0;
  return { cs, p };
}
let uid = 8000;
function play(cs: ReturnType<typeof beginCombat>, id: string, target?: number): void {
  const u = uid++;
  cs.players[0]!.hand.push({ uid: u, cardId: id, upgraded: false });
  playCard(cs, u, target);
}

describe('中-1：條件分支裡的蜷縮不可以把加成吃兩遍', () => {
  it('護臂格擋在貓步 3 時是 14，不是 17', () => {
    /*
     * 護臂格擋是 `[block 7, ifSelfStatus 反彈 → [block 4]]`。
     * `flushSelfBlock` 原本只看最外層，7 點先發一次、4 點再發一次，
     * `gainBlock` 的拒馬與貓步各套兩遍。這是 2026-09-13 稽核 中-6 的同一個坑，
     * 只是這次從條件分支繞進來。
     */
    const { cs, p } = setup();
    addStatus(p, '貓步', 3);
    addStatus(p, '反彈', 3);
    play(cs, 'dangdang_huben');
    expect(p.block, '(7+4)+3 = 14；吃兩遍會變 17').toBe(14);
  });

  it('條件不成立時照樣只發一次', () => {
    const { cs, p } = setup();
    addStatus(p, '貓步', 3);
    play(cs, 'dangdang_huben');   // 身上沒有反彈
    expect(p.block, '7+3 = 10').toBe(10);
  });

  it('對照組：單一 block 的牌沒有被改壞', () => {
    const { cs, p } = setup();
    addStatus(p, '貓步', 3);
    play(cs, 'dangdang_wenzhu');   // 穩住：block 4
    expect(p.block).toBe(7);
  });
});

describe('中-3：借力不要在滿血時白卸蜷縮', () => {
  it('滿血時一點都不卸，而且紀錄要交代', () => {
    const { cs, p } = setup();
    p.hp = p.maxHp;
    p.block = 8;
    const n = cs.log.length;
    play(cs, 'dangdang_jieli');
    expect(p.block, '滿血還卸掉蜷縮＝白丟').toBe(8);
    expect(cs.log.slice(n).join(''), '畫面要交代為什麼沒事發生').toContain('滿');
  });

  it('只缺 2 點血就只卸 2 點', () => {
    const { cs, p } = setup();
    p.hp = p.maxHp - 2;
    p.block = 8;
    play(cs, 'dangdang_jieli');
    expect(p.block, '卸 2 點就好，不要卸滿 6').toBe(6);
    expect(p.hp).toBe(p.maxHp);
  });

  it('蜷縮 0 時打卸力掌，紀錄要講一句', () => {
    const { cs, p } = setup();
    p.block = 0;
    const n = cs.log.length;
    play(cs, 'dangdang_xieli', cs.enemies[0]!.uid);
    expect(cs.log.slice(n).join(''), '花了飯糰卻什麼都沒發生，畫面要交代').toContain('沒有蜷縮');
  });
});

describe('高-3：連線序章的切點不夠就整段退回純對白', () => {
  it('兩套連線路線的序章都不會配到單人劇本的圖', () => {
    for (const [me, partner] of [['ninja', 'dangdang'], ['dangdang', 'ninja'], ['dangdang', 'feifei']] as const) {
      setCoopStory({ partner, mirror: me });
      expect(hasCoopScene(me), `${me}+${partner} 應該有共用場景`).toBe(true);
      const slides = prologueSlides(me);
      // 要嘛整段不演（回空陣列），要嘛每一張都有話講——不可以有空白的那種
      expect(slides.some((s) => s.lines.length === 0),
        `${me}+${partner} 的序章有配不到台詞的圖`).toBe(false);
    }
  });

  it('單人的序章照舊四張都有話講', () => {
    setCoopStory(null);
    for (const hero of ['ninja', 'feifei', 'dangdang']) {
      const slides = prologueSlides(hero);
      expect(slides.length, hero).toBe(4);
      for (const s of slides) expect(s.lines.length, `${hero}／${s.img}`).toBeGreaterThan(0);
    }
  });
});

describe('高-2：有共用場景時，落敗那段要照字面播', () => {
  it('hasCoopScene 分得出來', () => {
    setCoopStory(null);
    expect(hasCoopScene('dangdang')).toBe(false);
    setCoopStory({ partner: 'feifei', mirror: 'ninja' });
    expect(hasCoopScene('ninja'), '球球＋菲菲還沒寫整段場景').toBe(false);
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    expect(hasCoopScene('ninja')).toBe(true);
  });

  it('連線落敗那段裡球球的句子留著「喵」——那是他本人在講', () => {
    // 從噹噹的視角看「噹噹＋球球」那一組：同伴是球球
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    const his = storyFor('dangdang').defeat.filter((l) => l.speaker === '球球');
    expect(his.length).toBeGreaterThan(0);
    expect(his.every((l) => l.text.includes('喵')), '球球的句子被拿掉喵了').toBe(true);
  });
});

describe('低-1：鏡子學得會他的牌', () => {
  it('卸蜷縮那幾張不會整張學不到', async () => {
    const { learnCard } = await import('../../src/engine/mimic');
    const { cardById } = await import('../../src/content/cards');
    const learnable = ['dangdang_xieli', 'dangdang_bengshan', 'dangdang_huben', 'dangdang_jieshi']
      .filter((id, i) => learnCard({ uid: 9100 + i, cardId: id, upgraded: false }) !== null);
    void cardById;
    expect(learnable.length, '鏡中球球對上噹噹幾乎整副學不會').toBeGreaterThanOrEqual(3);
  });
});
