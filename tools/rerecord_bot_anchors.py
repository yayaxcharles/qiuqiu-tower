# -*- coding: utf-8 -*-
"""重錄 `tests/engine/bot.test.ts` 的隨機試玩錨值。

錨值釘的是「同一顆種子跑出同一個結果」，只要牌池、商店、地圖任何一處多吃或少吃一次擲骰就會變，
所以每次加牌、改機率都要重錄一次。跑法：

    python tools/rerecord_bot_anchors.py            # 重錄後印出新舊值
    python tools/rerecord_bot_anchors.py --check    # 只看有沒有漂掉，不改檔

只動 `playRun('<seed>')` 那幾行的四個數字，其他一概不碰；測試若因別的原因失敗，會原樣退出並回傳 1。
"""
import io
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEST = ROOT / 'tests' / 'engine' / 'bot.test.ts'
LINE = re.compile(
    r"expect\(playRun\('(?P<seed>[^']+)'\)\)\.toEqual\(\{ seed: '(?P=seed)', won: (?P<won>true|false), "
    r"floor: (?P<floor>\d+), turns: (?P<turns>\d+), kills: (?P<kills>\d+), deckSize: (?P<deckSize>\d+) \}\);"
)


def run_test() -> str:
    p = subprocess.run(['npx', 'vitest', 'run', 'tests/engine/bot.test.ts'], cwd=ROOT,
                       capture_output=True, text=True, encoding='utf-8', errors='replace', shell=True)
    return p.stdout + p.stderr


def received(out: str) -> list[dict]:
    """從 vitest 的差異區塊撈出「實際跑出來」的那組數字（`+` 開頭的行）。"""
    blocks = []
    for chunk in out.split('AssertionError')[1:]:
        got = dict(re.findall(r'\+\s+"(seed|won|floor|turns|kills|deckSize)": "?([\w-]+)"?', chunk))
        seed = re.search(r"seed: '([^']+)'", chunk)
        if seed:
            got.setdefault('seed', seed.group(1))
        if got.get('seed'):
            blocks.append(got)
    return blocks


def main() -> int:
    check = '--check' in sys.argv
    # 同一個 it 裡第一個 expect 一失敗就中止，後面幾顆種子的差異看不到，所以要一輪一輪錄
    for _ in range(8):
        rc = once(check)
        if rc != 2:
            return rc
    print('重錄八輪還沒收斂，請人工看')
    return 1


def once(check: bool) -> int:
    out = run_test()
    if 'FAIL' not in out:
        print('錨值沒漂，不用改')
        return 0
    got = received(out)
    if not got:
        print('測試失敗，但不是錨值漂掉（沒撈到差異數字），原樣退出：')
        print('\n'.join(l for l in out.splitlines() if 'FAIL' in l or 'Error' in l)[:2000])
        return 1
    src = io.open(TEST, encoding='utf-8').read()
    changed = []
    for g in got:
        m = next((m for m in LINE.finditer(src) if m.group('seed') == g['seed']), None)
        if not m:
            print('找不到錨值那行：', g['seed'])
            return 1
        new = {k: g.get(k, m.group(k)) for k in ('won', 'floor', 'turns', 'kills', 'deckSize')}
        line = ("expect(playRun('%s')).toEqual({ seed: '%s', won: %s, floor: %s, turns: %s, kills: %s, deckSize: %s });"
                % (g['seed'], g['seed'], new['won'], new['floor'], new['turns'], new['kills'], new['deckSize']))
        changed.append('%s：%s → %s' % (g['seed'], m.group(0)[m.group(0).index('won'):], line[line.index('won'):]))
        src = src.replace(m.group(0), line)
    if check:
        print('錨值漂了（--check 不改檔）：'); print('\n'.join(changed)); return 1
    io.open(TEST, 'w', encoding='utf-8', newline='\n').write(src)
    print('已重錄：'); print('\n'.join(changed))
    return 2   # 再跑一輪，看有沒有下一顆種子也漂了


if __name__ == '__main__':
    raise SystemExit(main())
