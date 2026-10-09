#!/usr/bin/env python3
"""
火光／天色那層的關鍵影格產生器（2026-10-09 效能，使用者朋友的舊電腦 i5-2400＋1080p 螢幕會卡）。

地圖、事件／商店／貓窩、封面三種畫面，底圖上面各疊一層整片的顏色，只變透明度（0～4.5%）來做火光、天色起伏。
原本用 ease-in-out 平滑過渡，瀏覽器就**每一格**都把整個畫面重新疊一次——可是透明度這麼淡，
相鄰兩格算出來的顏色多半一模一樣（螢幕每個顏色只有 0～255 共 256 級），重疊了也看不出差別。
弱顯示晶片（或瀏覽器沒開顯示晶片加速、改由處理器疊畫面）的電腦，光這一層就吃掉地圖畫面八成的力氣。

改法：照原本的曲線算出每一刻的透明度，只在它跨過 1/255（螢幕顏色差一級）的那一刻才換值，中間停著不動
（`step-end`）。任何時刻跟原本平滑版的差距都不到半級，畫面看起來一樣；整個畫面重疊的次數從每秒 60 次
變成每秒約 2～6 次。原本的關鍵影格與節奏寫在下面 `ANIMS`，要改節奏就改這裡再跑一次：

    python tools/perf/torch_steps.py          # 只印出來看
    python tools/perf/torch_steps.py --write  # 寫回 map.css／screens.css

`tests/ui/torch_steps_1009.test.ts` 會照 `ANIMS` 同一組原始關鍵影格重算曲線，逐點比對 CSS 裡的值，
差距超過半級就紅。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 名稱：(檔案, 秒數, 原本的關鍵影格 [(位置 0～1, 透明度)]，關鍵影格之間都是 ease-in-out)
ANIMS = {
    'map-torchlight': ('src/ui/styles/map.css', 6.9,
                       [(0, 0), (0.19, 0.045), (0.36, 0), (0.58, 0.034), (0.79, 0.015), (1, 0)]),
    'bg-torchlight': ('src/ui/styles/screens.css', 7.4,
                      [(0, 0), (0.22, 0.0375), (0.41, 0), (0.64, 0.026), (0.83, 0.011), (1, 0)]),
    'night-drift': ('src/ui/styles/screens.css', 22,
                    [(0, 0), (0.5, 0.0375), (1, 0)]),
}


def cubic_bezier(p1x, p1y, p2x, p2y):
    def bx(t): return 3 * (1 - t) ** 2 * t * p1x + 3 * (1 - t) * t ** 2 * p2x + t ** 3
    def by(t): return 3 * (1 - t) ** 2 * t * p1y + 3 * (1 - t) * t ** 2 * p2y + t ** 3

    def f(x):
        lo, hi = 0.0, 1.0
        for _ in range(60):
            mid = (lo + hi) / 2
            if bx(mid) < x:
                lo = mid
            else:
                hi = mid
        return by((lo + hi) / 2)
    return f


EASE_IN_OUT = cubic_bezier(0.42, 0, 0.58, 1)


def curve(keys, p):
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if p <= t1:
            k = (p - t0) / (t1 - t0) if t1 > t0 else 1
            return v0 + (v1 - v0) * EASE_IN_OUT(k)
    return keys[-1][1]


def stepped(keys, n=20000):
    """[(位置 0～1, 第幾級 0～255)]：只在四捨五入後的級數變了的那一刻記一筆"""
    out, last = [], None
    for i in range(n + 1):
        p = i / n
        lv = round(curve(keys, p) * 255)
        if lv != last:
            out.append((p, lv))
            last = lv
    return out


def keyframes_css(name, keys, nl='\n'):
    steps = stepped(keys)
    lines = [f'@keyframes {name} {{']
    for p, lv in steps:
        lines.append(f'  {p * 100:.2f}% {{ opacity: {lv / 255:.5f}; }}')
    if steps[-1][0] < 1:
        lines.append(f'  100% {{ opacity: {steps[-1][1] / 255:.5f}; }}')
    lines.append('}')
    return nl.join(lines), len(steps)


def main():
    write = '--write' in sys.argv
    for name, (rel, secs, keys) in ANIMS.items():
        path = ROOT / rel
        raw = path.read_bytes().decode('utf-8')
        nl = '\r\n' if '\r\n' in raw else '\n'
        css, n = keyframes_css(name, keys, nl)
        print(f'/* {name}：{secs} 秒一輪，{n} 次換值，平均每秒 {n / secs:.1f} 次 */')
        print(css.replace('\r\n', '\n'))
        if not write:
            continue
        block = re.compile(r'@keyframes ' + re.escape(name) + r' \{.*?' + re.escape(nl) + r'\}', re.S)
        if not block.search(raw):
            sys.exit(f'{rel} 找不到 @keyframes {name}')
        raw = block.sub(lambda _: css, raw, count=1)
        use = re.compile(r'(animation: ' + re.escape(name) + r' [0-9.]+s )ease-in-out( infinite;)')
        raw = use.sub(r'\1step-end\2', raw)
        path.write_bytes(raw.encode('utf-8'))


if __name__ == '__main__':
    main()
