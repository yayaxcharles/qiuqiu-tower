"""事件圖重生（2026-09-24）。

使用者抓到：封封卡住的劍那兩張結果圖劍浮在半空、手沒握著劍；沒送到的藥包文字寫「村貓坐在旁邊」圖上沒有村貓；
說「問題很多，其他圖也要檢查，有問題就重生」。九個審圖代理逐張比對圖與文字（報告在
`docs/審查報告/2026-09-24_事件圖重生/`），判「重生」的整理成工單 `jobs.json`：

    { "<檔名，不含 .webp>": { "hero": "fengfeng", "scene": "<英文：誰在場、在做什麼、道具放在哪、手怎麼拿>",
                               "style": "bg/event_xxx.webp", "refs": [["bg/event_yyy.webp", "<英文：這張參考圖給什麼>"]],
                               "why": "<中文：原本錯在哪>" } }

參考圖：① 這隻的新版待機第 1 格（長相只照它）② `style`：同一隻畫得對的另一張事件圖（只取畫風）
③ `refs`：配角或道具的長相（例如另一張畫得對的村貓）。`hero` 是 `none` 的（連線限定、四隻共用的那幾張）不附①、不畫主角。
提示詞沿用 `gen_content_batch1_art.py` 的頭尾（真透明、只畫寫到的角色、不要字），另外每張都加
`PHYSICS`（東西不能浮空、拿著就要握住）與 `CAST`（寫到的角色一定要畫出來）——這次抓到的錯全是這兩類。

用法：
    python tools/regen_event_art.py refs                          # 四隻的待機參考圖
    python tools/regen_event_art.py prompt <名>
    python tools/regen_event_art.py gen <名>... [--jobs 4] [--note "修正說明"]
    python tools/regen_event_art.py gen --all --jobs 6
    python tools/regen_event_art.py pick <名> <第幾次> [--force]   # 裁、縮、覆蓋 public/assets/bg/<名>.webp（舊圖先備份）
    python tools/regen_event_art.py sheet <輸出.png> [名...]       # 每列：舊圖｜每一次重生（聯絡表）
每一次生圖都存成 `<名>.try<N>.png`（不覆蓋），提示詞記在 `prompts.json`、選定紀錄在 `picks.json`。
清單鍵與檔名都沒變（同名覆蓋），不用登記素材清單；建置時檔名雜湊會跟著內容換。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_content_batch1_art as c1  # noqa: E402
from gen_rest_art import LOOK, idle_frame, on_white  # noqa: E402

ROOT = c1.ROOT
SOURCE = ROOT / 'tools/motion-art-source/regen0924'
REF = SOURCE / '_ref'
OLD = SOURCE / '_old'
PROMPTS = SOURCE / 'prompts.json'
PICKS = SOURCE / 'picks.json'
JOBS = ROOT / 'docs/審查報告/2026-09-24_事件圖重生/jobs.json'
ASSETS = ROOT / 'public/assets'
BG = c1.BG

PHYSICS = (
    'PHYSICS - everything obeys gravity: every prop either rests on something that is drawn (the small floor patch, '
    'a table, a bench, a shelf, a crate, a rack) or is firmly held. NOTHING floats in mid-air. When a character holds '
    'something, the paw visibly wraps around it - the pads closed on the grip, the object sitting IN the paw, not '
    'hovering next to it. A sword that is being drawn or held has its hilt inside the closed paw.\n'
)
CAST = (
    'CAST - every character named in the SCENE is clearly visible, whole and recognisable (not cropped, not hidden '
    'behind a prop, not shrunk to a speck). If the scene says someone is sitting beside the hero, draw them sitting '
    'right beside the hero.\n'
)
NONE_HEAD = (
    'Create one new EVENT ILLUSTRATION for a cute cat-ninja card game. It is a cut-out vignette: only the '
    'characters and the few props of the scene (with at most a small patch of floor or steps under them), on a '
    'truly transparent background.\n'
    'Reference image 1 is an existing event illustration from this game: copy its ART STYLE (bold dark hand-drawn '
    'outlines, flat colours with soft cel shading, chunky cute chibi proportions) and the way the scene is cut out on '
    'a transparent background. Do NOT copy its composition or its props.\n'
    'This picture is shared by every player, so it shows NONE of the four hero cats (no cat with a navy headband, no '
    'cat with a purple bow and ponytail, no black-and-white cat with copper bracers, no orange tabby with a red scarf '
    'and sword).\n'
)


def jobs() -> dict[str, dict]:
    return json.loads(JOBS.read_text(encoding='utf-8'))


def hero_of(name: str, job: dict) -> str:
    if job.get('hero'):
        return job['hero']
    m = re.match(r'event_(feifei|dangdang|fengfeng)_', name)
    return m.group(1) if m else 'ninja'


def ref_png(rel: str, box: tuple[int, int] = (1024, 768)) -> Path:
    """`public/assets` 底下的相對路徑 → 鋪白底的參考圖（快取在 _ref）。"""
    out = REF / (rel.replace('/', '__').rsplit('.', 1)[0] + '.png')
    if not out.exists():
        REF.mkdir(parents=True, exist_ok=True)
        c1.white(Image.open(ASSETS / rel), box).save(out)
    return out


def refs_for(name: str) -> list[Path]:
    job = jobs()[name]
    hero = hero_of(name, job)
    out = [] if hero == 'none' else [REF / f'idle_{hero}.png']
    out.append(ref_png(job['style']))
    out += [ref_png(r) for r, _ in job.get('refs', [])]
    return out


def prompt_for(name: str) -> str:
    job = jobs()[name]
    hero = hero_of(name, job)
    if hero == 'none':
        head, first_extra = NONE_HEAD, 2
    else:
        look = LOOK[c1.LOOK_KEY[hero]].replace('dark-brown face mask', 'dark-brown face markings')
        head, first_extra = c1.EVENT_HEAD.format(name=c1.HERO_NAME[hero], look=look), 3
    extra = ''.join(f'Reference image {first_extra + i} shows {what}\n' for i, (_, what) in enumerate(job.get('refs', [])))
    tail = c1.EVENT_TAIL.replace('Only the characters named above appear - no other cats, no extra copies of the hero, '
                                 'no enemies, no master.', 'Only the characters named in the SCENE appear - no other '
                                 'cats, no extra copies of anyone.')
    rules = '' if hero == 'none' else c1.hero_rules(hero)
    return head + extra + f'SCENE: {job["scene"]}\n' + PHYSICS + CAST + tail + rules


def refs() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for hero in c1.HEROES:
        on_white(idle_frame(c1.LOOK_KEY[hero]), .8).save(REF / f'idle_{hero}.png')
    print(f'參考圖已輸出到 {REF}')


def generate(name: str, note: str = '') -> tuple[str, int, str]:
    with c1._LOCK:
        attempt = 1
        while (SOURCE / f'{name}.try{attempt}.png').exists() or (SOURCE / f'{name}.try{attempt}.pending').exists():
            attempt += 1
        (SOURCE / f'{name}.try{attempt}.pending').write_text('', encoding='utf-8')
    target = SOURCE / f'{name}.try{attempt}.png'
    text = prompt_for(name) + (f'\n{note}' if note else '')
    command = [sys.executable, str(c1.IMAGE_GEN), 'edit', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
               '--background', 'transparent', '--size', '1536x1024', '--quality', 'high', '--prompt', text]
    for ref in refs_for(name):
        command += ['--image', str(ref)]
    command += ['--out', str(target), '--force']
    started = time.time()
    status = 'failed'
    for _ in range(5):
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.returncode == 0 and target.exists():
            status = 'ok'
            break
        status = f'failed: {result.stderr.strip()[-300:]}'
        if 'capacity' not in result.stderr:   # 伺服器滿載才等一下重試（codex_gen.py 坑 9）
            break
        time.sleep(30)
    (SOURCE / f'{name}.try{attempt}.pending').unlink(missing_ok=True)
    c1.record(PROMPTS, name, {'attempt': attempt, 'status': status, 'prompt': text,
                              'refs': [p.name for p in refs_for(name)], 'at': time.strftime('%Y-%m-%d %H:%M:%S')})
    return name, attempt, f'{status}（{time.time() - started:.0f} 秒）'


def pick(name: str, attempt: int, force: bool = False) -> None:
    src = SOURCE / f'{name}.try{attempt}.png'
    if not src.exists():
        raise SystemExit(f'找不到 {src.name}')
    raw = Image.open(src).convert('RGBA')
    errs = c1.gate(name, raw)
    if errs and not force:
        raise SystemExit(f'{name} 第 {attempt} 次沒過閘門：' + '；'.join(errs))
    cleaned, dropped = c1.clean(raw, .0015)
    out_img = c1.fit_event(cleaned)
    target = BG / f'{name}.webp'
    OLD.mkdir(parents=True, exist_ok=True)
    if target.exists() and not (OLD / target.name).exists():
        shutil.copy2(target, OLD / target.name)   # 只備份第一次的舊圖（原本線上那張）
    out_img.save(target, 'WEBP', quality=80, method=6)
    data = target.read_bytes()
    with c1._LOCK:
        picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
        picks[name] = {'attempt': attempt, 'file': target.relative_to(ROOT).as_posix(), 'bytes': len(data),
                       'droppedSpecks': dropped, 'gate': errs, 'sha256': hashlib.sha256(data).hexdigest(),
                       'at': time.strftime('%Y-%m-%d %H:%M:%S')}
        PICKS.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{name} 採用第 {attempt} 次 → {target.relative_to(ROOT).as_posix()}（{len(data)} 位元組，清掉碎點 {dropped} 塊）')


def sheet(out: Path, names: list[str]) -> None:
    """每一列：舊圖（有備份用備份，沒有用現在那張）＋每一次重生；透明處鋪格紋。"""
    rows = []
    for n in names:
        old = OLD / f'{n}.webp' if (OLD / f'{n}.webp').exists() else BG / f'{n}.webp'
        tries = sorted(SOURCE.glob(f'{n}.try*.png'), key=lambda p: int(p.stem.rsplit('try', 1)[1]))
        rows.append([old, *tries])
    cols = max(len(r) for r in rows)
    blank = SOURCE / '_blank.png'   # 補空格用，讓每一列對齊
    Image.new('RGBA', (4, 3), (0, 0, 0, 0)).save(blank)
    c1.contact([f for r in rows for f in r + [blank] * (cols - len(r))], out, 300, cols)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['refs', 'prompt', 'gen', 'pick', 'sheet'])
    ap.add_argument('args', nargs='*')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--note', default='')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    SOURCE.mkdir(parents=True, exist_ok=True)
    if a.cmd == 'refs':
        refs()
    elif a.cmd == 'prompt':
        print(prompt_for(a.args[0]))
        print('參考圖：', [p.name for p in refs_for(a.args[0])])
    elif a.cmd == 'gen':
        names = list(jobs()) if a.all else a.args
        unknown = [n for n in names if n not in jobs()]
        if unknown:
            raise SystemExit(f'工單裡沒有：{unknown}')
        with ThreadPoolExecutor(a.jobs) as ex:
            for name, attempt, status in ex.map(lambda n: generate(n, a.note), names):
                print(f'{name} 第 {attempt} 次：{status}', flush=True)
    elif a.cmd == 'pick':
        pick(a.args[0], int(a.args[1]), a.force)
    elif a.cmd == 'sheet':
        sheet(Path(a.args[0]), a.args[1:] or list(jobs()))


if __name__ == '__main__':
    main()
