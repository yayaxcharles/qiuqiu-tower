import { describe, expect, it } from 'vitest';
import { bgKeysForAct, deferredBgKeys } from '../../src/ui/bgacts';
import { events } from '../../src/content/events';

/** 事件插圖以外的鍵——那批是照 `acts` 自動長出來的，寫死在測試裡只會變成每加一個事件就要改一次 */
const noEvents = (keys: string[]): string[] => keys.filter((k) => !k.startsWith('bg/event_'));

describe('底圖分關', () => {
  it('每關拿到自己的戰鬥背景三張、關主戰場一張、節點畫面（貓窩／罐頭鋪／紙箱各三款）', () => {
    expect(noEvents(bgKeysForAct(1))).toEqual([
      'bg/low', 'bg/low_b', 'bg/low_c', 'bg/boss1', 'bg/door_act1',
      // 過關幻燈片**不在這裡**（2026-09-11）：改由推開關主門那一刻才抓（`screens/bossdoor.ts`），
      // 三關八張全部離開首載，省 121 KB。門停在那裡等玩家點，載得完
      'bg/map_tall',
      'bg/screen_chest', 'bg/screen_chest_b', 'bg/screen_chest_c',
      'bg/screen_event',
      'bg/screen_rest', 'bg/screen_rest_b', 'bg/screen_rest_c',
      'bg/screen_shop', 'bg/screen_shop_b', 'bg/screen_shop_c',
    ]);
    expect(bgKeysForAct(2)).toContain('bg/mid_c');
    expect(bgKeysForAct(2)).toContain('bg/screen_shop_mid');
    expect(bgKeysForAct(2)).toContain('bg/screen_shop_mid_c');
    expect(bgKeysForAct(3)).toContain('bg/top_b');
    expect(bgKeysForAct(3)).toContain('bg/screen_rest_top');
    expect(bgKeysForAct(3)).toContain('bg/screen_rest_top_b');
    // 關主門也是一關一扇，二三關那兩扇要能歸分關載入（稽核 2026-09-10 中-1）
    expect(bgKeysForAct(2)).toContain('bg/door_act2');
    expect(bgKeysForAct(3)).toContain('bg/door_act3');
    // 事件與地圖底圖沒做關內變體，不該憑空長出 `_b`
    expect(bgKeysForAct(1)).not.toContain('bg/screen_event_b');
    expect(bgKeysForAct(1)).not.toContain('bg/map_tall_b');
  });

  it('關數超出範圍就夾到 1～3，不要算出 bg/undefined', () => {
    expect(bgKeysForAct(0)).toEqual(bgKeysForAct(1));
    expect(bgKeysForAct(9)).toEqual(bgKeysForAct(3));
    for (const act of [-1, 0, 1, 2, 3, 4, 99]) {
      expect(bgKeysForAct(act).some((k) => k.includes('undefined'))).toBe(false);
    }
  });

  it('可延後的每一張都說得出理由：二三關專屬的變體，或標了 acts 的事件', () => {
    const skip = deferredBgKeys();
    expect([...skip].every((k) => k.startsWith('bg/'))).toBe(true);
    /*
     * **驗規則不驗數字**（2026-09-11）。原本這條是一個總數斷言，每加一張圖就得把數字改掉，
     * 而改數字這件事本身零資訊量——加錯邊（把第一關要用的圖歸成延後）照樣可以靠改數字讓它變綠。
     *
     * 下面兩組**反向**的迴圈才是真的會擋住改壞的：該延後的一定要延後、不該的一定不准延後。
     *（複核 2026-09-11：「延後名單裡的每一個鍵都不在第一關清單裡」那種寫法是套套邏輯——
     *  `deferredBgKeys` 的定義就是「二三關的鍵減掉第一關的」，數學上不可能不成立，永遠會綠。）
     */
    // ① 只在二三關出現的事件，插圖一定要延後（漏掉就是白佔首載）
    for (const e of events) {
      if (e.acts && !e.acts.includes(1)) {
        expect(skip.has(`bg/event_${e.id}`), `${e.id} 只在第 ${e.acts.join('、')} 關出現，插圖該延後`).toBe(true);
      }
    }
    // ② 沒標 acts 的每一關都排得到，一律留首載
    for (const e of events) {
      if (!e.acts) expect(skip.has(`bg/event_${e.id}`), `${e.id} 每一關都遇得到，不能延後`).toBe(false);
    }
    /*
     * ③ **三關的過關幻燈片全部要延後**（2026-09-11 改）。
     *
     * 以前第一關那三張留在首載，理由是「打完第一關就要播、來不及延後」；
     * 現在改由推開關主門那一刻抓（`screens/bossdoor.ts` 的 `warmSlides`）——
     * 門會停著等玩家點，後面還隔著一整場關主戰，來得及，所以那三張也離開首載了。
     * 它們不在任何一關的 `bgKeysForAct` 裡，靠 `deferredBgKeys` 另外併進來；
     * 漏掉的話開場會把十二張全載回去、這一刀等於白改。
     */
    for (const k of ['bg/still_act1_stairs', 'bg/still_act1_fish', 'bg/still_act1_climb',
      'bg/still_act2_smoke', 'bg/still_act2_voice', 'bg/still_act2_moonstairs']) {
      expect(skip.has(k), `過關幻燈片 ${k} 要延後`).toBe(true);
    }
    // ④ 序幕那四張仍然要留在首載：那是開新局第一秒就播的，沒有任何門可以拿來墊
    for (const k of ['bg/still_teach', 'bg/still_corrupt', 'bg/still_rush', 'bg/still_depart']) {
      expect(skip.has(k), `序幕的 ${k} 不能延後`).toBe(false);
    }
  });

  it('第一關會用到的一張都不准延後', () => {
    const skip = deferredBgKeys();
    for (const k of bgKeysForAct(1)) expect(skip.has(k)).toBe(false);
  });

  it('過關畫面、開場幻燈片、事件插圖不在延後名單裡', () => {
    // 2026-09-05 全面體檢點名過的雷：`screen_result_win` 第一關過關就要用。
    // 這裡列的每一張都是**每一關都用得到**的（`bg/event_toll` 沒標 acts），被誤判延後就會現抓、閃一下。
    //（2026-09-11 起，有標 `acts` 的事件插圖與二三關的幻燈片是**刻意**延後的，見上一條。）
    const skip = deferredBgKeys();
    for (const k of ['bg/screen_result_win', 'bg/screen_result_lose', 'bg/screen_title',
      'bg/event_toll', 'bg/boss1', 'bg/low']) {
      expect(skip.has(k)).toBe(false);
    }
    // 序幕那四張是開新局第一秒就播的，一定要留在首載
    for (const k of ['bg/still_teach', 'bg/still_corrupt', 'bg/still_rush', 'bg/still_depart']) {
      expect(skip.has(k), `序幕的 ${k} 不能延後`).toBe(false);
    }
    // 但結局那兩張是打贏第三關才看得到的，該延後（2026-09-11：首載只剩 1.2% 餘裕）
    for (const k of ['bg/still_home', 'bg/still_embrace']) {
      expect(skip.has(k), `結局的 ${k} 要延後`).toBe(true);
    }
  });
});
