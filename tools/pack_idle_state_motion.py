"""待機狀態逐格圖的打包器（2026-09-21，只「加」新動作，不動既有動作）。

由 `qiuqiu-coop-motion-20260920/tools/` 的兩支打包器改來：
  - `pack_qiuqiu_extra_motion.py`（球球的額外動作 → `qiuqiu-extra-motion-data.json`）
  - `pack_companion_motion.py`（菲菲／噹噹／封封 → `<角色>-motion-data.json`）
兩支原版都是「從頭把整份動作資料重產一次」，而且來源路徑寫死在那份快照資料夾裡；
這個副本沒有那些來源圖，照跑會把既有動作整批蓋掉。所以這支只做三件事：

  1. 讀 `tools/motion-art-source/idle-states/<角色>/<動作>.png`（4 欄 × 2 列、8 格、真透明），
     先做一道「透明度整理」（`tidy`，見下）；
  2. 照舊規矩切格（只在完全透明的空隙下刀、不裁到角色、第 1 格高度＝252 原生單位）；
  3. 把**新動作**附加進該角色的動作資料 json，並輸出無損 webp。

既有動作的條目與 webp 一個位元都不碰：同名動作已存在、或輸出檔已存在且內容不同，就直接停下。

另外加了一道**品質檢查**（過去的教訓：自檢只印不停＝沒檢查）。任何一項不合格就丟例外、
整支停下、什麼都不寫：透明度、切格、每格身高比例、第一格跟新版待機的身形是否一致、
角色有沒有偏離格子中心。數字門檻寫在 `LIMITS`，理由寫在旁邊。

用法：
    python tools/pack_idle_state_motion.py --check feifei wounded   # 只檢查一張，不寫檔
    python tools/pack_idle_state_motion.py                          # 打包 actions.json 裡全部已生好的
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/idle-states'
CONFIG = SOURCE / 'actions.json'
NATIVE_HEIGHT = 252

# 角色 → (動作資料 json, 動作圖資料夾, 輸出檔名樣式, 新版待機的 json)
HEROES = {
    'qiuqiu': ('src/ui/qiuqiu-extra-motion-data.json', 'public/assets/motion/qiuqiu', 'generated_{action}.webp',
               'src/ui/qiuqiu-motion-data.json'),
    'feifei': ('src/ui/feifei-motion-data.json', 'public/assets/motion/feifei', '{action}.webp',
               'src/ui/feifei-motion-data.json'),
    'dangdang': ('src/ui/dangdang-motion-data.json', 'public/assets/motion/dangdang', '{action}.webp',
                 'src/ui/dangdang-motion-data.json'),
    'fengfeng': ('src/ui/fengfeng-motion-data.json', 'public/assets/motion/fengfeng', '{action}.webp',
                 'src/ui/fengfeng-motion-data.json'),
}

# 每格身高 ÷ 第 1 格身高 的容許範圍。第 1 格畫的是一般待機、拿來定比例（跟舊打包器同一個規矩），
# 所以這個比值就是「這一格比平常站著高或矮多少」。站著的狀態守 ±10% 左右；
# 蜷縮、翻肚本來就會變矮，只擋「畫成一粒豆子」；暈眩頭上有小星星、炸毛的尾巴會豎起來，上限放寬。
LIMITS = {
    'wounded': (0.86, 1.10),
    'power': (0.88, 1.14),
    'hungry': (0.80, 1.08),
    'dizzy': (0.86, 1.28),
    'lazy': (0.84, 1.10),
    'iron': (0.88, 1.12),
    'stealth': (0.78, 1.10),
    'puff': (0.88, 1.32),
    'curl': (0.32, 1.08),
    'belly': (0.30, 1.10),
}
# 第 1 格的寬度（換算成遊戲單位後）÷ 新版待機第 1 格的寬度。高度已經拿來定比例，
# 寬度差太多代表第 1 格不是一般待機的架式（例如直挺挺站著），拿它定比例會讓整隻貓縮水或變大。
# 門檻依第一批 12 張校準：合格的都落在 0.97～1.03，球球肚子餓第一版站直了是 0.84。
WIDTH_RATIO = (0.88, 1.18)
# 角色身體（不透明像素的重心）偏離格子中心多少遊戲單位就算歪掉。腳底定位是「格子中心」，
# 偏太多在遊戲裡就會看到角色一換狀態就橫移。躺下、縮成一團的姿勢重心本來就會移，放寬。
CENTER_SHIFT = {'default': 42, 'belly': 80, 'curl': 60}


class ArtError(Exception):
    """這張圖不合格：整支停下，不寫任何檔。"""


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def tidy(image: Image.Image) -> Image.Image:
    """把生圖端的兩個小毛病整理掉。**不重畫、不去背、不動顏色**，只動透明度：

    1. gpt-image-1.5 的真透明輸出，角色身上的不透明像素只存到 253～254（不是 255），
       整隻貓等於 99% 不透明；250 以上一律補成 255。
    2. 背景會散落一些幾乎看不見的灰塵（alpha ≤ 16 的微光點、或 40 像素以下的孤立小點），
       在深色戰場上會變成髒點，也會讓切格誤判。離角色 6 像素以外的微光、以及孤立小點歸零；
       角色邊緣的反鋸齒（緊貼角色的那一圈）不動。
    3. 完全透明的像素，底下還藏著生圖端留下的顏色（看不見，但無損 webp 的 exact 模式會照存），
       一律清成 0。看得見的像素一個都不動，檔案小四成（一張約 1.2 MB → 0.7 MB）。
    """
    rgba = np.array(image.convert('RGBA'))
    alpha = rgba[..., 3].astype(np.int16)
    alpha[alpha >= 250] = 255
    solid = alpha > 16
    labels, count = ndimage.label(solid)
    if count:
        sizes = ndimage.sum(solid, labels, index=np.arange(1, count + 1))
        specks = np.isin(labels, np.flatnonzero(sizes < 40) + 1)
        alpha[specks] = 0
        solid &= ~specks
    near = ndimage.binary_dilation(solid, iterations=6)
    alpha[(alpha <= 16) & ~near] = 0
    rgba[..., 3] = alpha.astype(np.uint8)
    rgba[alpha == 0, :3] = 0
    return Image.fromarray(rgba, 'RGBA')


def index_sheet(image: Image.Image, times: list[int], label: str, rows: int = 2) -> list[dict]:
    """把 4×rows 的整張圖切成逐格資料（rect／pivot／duration），跟 pack_companion_motion.py 同一套算法。"""
    width, height = image.size
    raw = image.getchannel('A')
    if raw.getextrema() != (0, 255):
        raise ArtError(f'{label}: 背景不是真透明（alpha 範圍 {raw.getextrema()}，必須同時有 0 與 255）')
    alpha = raw.point(lambda a: 255 if a > 16 else 0)
    row_edges = [0]
    for row in range(1, rows):
        nominal = round(height * row / rows)
        radius = round(height / rows * .22)
        clear = [y for y in range(max(1, nominal - radius), min(height - 1, nominal + radius))
                 if alpha.crop((0, y, width, y + 1)).getbbox() is None]
        if not clear:
            raise ArtError(f'{label}: 第 {row} 列跟下一列之間沒有乾淨的透明空隙，切不開')
        row_edges.append(min(clear, key=lambda y: abs(y - nominal)))
    row_edges.append(height)
    frames = []
    for index, ms in enumerate(times):
        row, col = divmod(index, 4)
        top, bottom = row_edges[row:row + 2]
        edges = [0]
        for column in range(1, 4):
            nominal = round(width * column / 4)
            radius = round(width / 4 * .16)
            clear = [x for x in range(nominal - radius, nominal + radius)
                     if alpha.crop((x, top, x + 1, bottom)).getbbox() is None]
            if not clear:
                raise ArtError(f'{label}: 第 {row + 1} 列第 {column} 條直向空隙不乾淨，兩隻貓黏在一起')
            edges.append(min(clear, key=lambda x: abs(x - nominal)))
        edges.append(width)
        left, right = edges[col:col + 2]
        box = alpha.crop((left, top, right, bottom)).getbbox()
        if not box:
            raise ArtError(f'{label}: 第 {index + 1} 格是空的')
        x0, y0, x1, y1 = box
        if not (left + x0 > 0 and left + x1 < width):
            raise ArtError(f'{label}: 第 {index + 1} 格左右被整張圖的邊緣切到')
        if not (top + y0 > 0 and top + y1 < height):
            raise ArtError(f'{label}: 第 {index + 1} 格上下被整張圖的邊緣切到')
        frames.append({'rect': [left + x0, top + y0, x1 - x0, y1 - y0],
                       'pivot': [(col + .5) * width / 4 - left - x0, y1 - y0 - 1],
                       'duration': ms / 1000})
    return frames


def mass_center_x(image: Image.Image, rect: list[int]) -> float:
    """這一格不透明像素的水平重心（格內座標）。拿來看角色有沒有偏離格子中心。"""
    x, y, w, h = rect
    alpha = image.getchannel('A').crop((x, y, x + w, y + h)).point(lambda a: 255 if a > 16 else 0)
    columns = [0] * w
    data = alpha.load()
    for cx in range(0, w, 2):
        columns[cx] = sum(1 for cy in range(0, h, 2) if data[cx, cy])
    total = sum(columns)
    return sum(i * c for i, c in enumerate(columns)) / total if total else w / 2


def idle_reference(hero: str) -> tuple[float, float]:
    """新版待機第 1 格：換算成遊戲單位的寬度，以及重心相對腳底定位點的水平偏移。"""
    data_file, _, _, idle_file = HEROES[hero]
    idle = json.loads((ROOT / idle_file).read_text(encoding='utf-8'))['actions']['idle']
    frame = idle['frames'][0]
    texture = Image.open(ROOT / 'public' / idle['texture']).convert('RGBA')
    center = mass_center_x(texture, frame['rect'])
    return frame['rect'][2] * idle['scale'], (center - frame['pivot'][0]) * idle['scale']


def quality(hero: str, action: str, image: Image.Image, frames: list[dict]) -> dict:
    """品質檢查。不合格丟 ArtError；合格回傳量到的數字（寫進紀錄檔，之後要查才有根據）。"""
    label = f'{hero}/{action}'
    low, high = LIMITS[action]
    base = frames[0]['rect'][3]
    scale = NATIVE_HEIGHT / base
    ratios = [round(frame['rect'][3] / base, 3) for frame in frames]
    bad = [i + 1 for i, r in enumerate(ratios) if not low <= r <= high]
    if bad:
        raise ArtError(f'{label}: 第 {bad} 格身高比例 {[ratios[i - 1] for i in bad]} 超出 {low}～{high}（以第 1 格為準）')
    idle_width, idle_offset = idle_reference(hero)
    width_ratio = round(frames[0]['rect'][2] * scale / idle_width, 3)
    if not WIDTH_RATIO[0] <= width_ratio <= WIDTH_RATIO[1]:
        raise ArtError(f'{label}: 第 1 格的寬高比跟新版待機差太多（寬度比 {width_ratio}），頭身比或畫風可能跑掉了')
    limit = CENTER_SHIFT.get(action, CENTER_SHIFT['default'])
    shifts = []
    for i, frame in enumerate(frames):
        offset = (mass_center_x(image, frame['rect']) - frame['pivot'][0]) * scale
        shifts.append(round(offset - idle_offset, 1))
    off = [i + 1 for i, s in enumerate(shifts) if abs(s) > limit]
    if off:
        raise ArtError(f'{label}: 第 {off} 格角色偏離格子中心 {[shifts[i - 1] for i in off]} 遊戲單位（上限 {limit}），'
                       '換狀態時會看到角色橫移')
    return {'scale': scale, 'heightRatios': ratios, 'firstFrameWidthRatio': width_ratio, 'centerShift': shifts}


def check(hero: str, action: str, path: Path | None = None) -> tuple[Image.Image, list[dict], dict]:
    config = load_config()
    spec = config['heroes'][hero][action]
    path = path or SOURCE / hero / f'{action}.png'
    image = tidy(Image.open(path))
    frames = index_sheet(image, spec['times'], f'{hero}/{action}')
    return image, frames, quality(hero, action, image, frames)


def dump_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def pack(only: set[tuple[str, str]] | None = None) -> None:
    config = load_config()
    records = []
    record_file = ROOT / 'docs/idle-state-motion-assets.json'
    old_records = json.loads(record_file.read_text(encoding='utf-8'))['assets'] if record_file.exists() else []
    # 先全部檢查過一遍才開始寫：有一張不合格就整批不動，不會留下寫到一半的資料檔
    staged = []
    for hero, actions in config['heroes'].items():
        data_file, out_dir, pattern, _ = HEROES[hero]
        for action, spec in actions.items():
            if only and (hero, action) not in only:
                continue
            path = SOURCE / hero / f'{action}.png'
            if not path.exists():
                print(f'略過 {hero}/{action}：還沒有生好的圖')
                continue
            image, frames, metrics = check(hero, action, path)
            staged.append((hero, action, spec, path, image, frames, metrics))
    touched: dict[str, dict] = {}
    for hero, action, spec, path, image, frames, metrics in staged:
        data_file, out_dir, pattern, _ = HEROES[hero]
        data = touched.setdefault(data_file, json.loads((ROOT / data_file).read_text(encoding='utf-8')))
        target = ROOT / out_dir / pattern.format(action=action)
        texture = f'{out_dir.removeprefix("public/")}/{target.name}'
        existing = data['actions'].get(action)
        if existing and existing.get('texture') != texture:
            raise ArtError(f'{hero}/{action}: 動作資料裡已經有同名動作（{existing.get("texture")}），不覆蓋既有動作')
        tmp = target.with_suffix('.tmp.webp')
        image.save(tmp, 'WEBP', lossless=True, method=6, exact=True)
        if Image.open(tmp).convert('RGBA').tobytes() != image.tobytes():
            tmp.unlink()
            raise ArtError(f'{hero}/{action}: 無損存檔讀回來不一樣')
        if target.exists() and existing is None:
            tmp.unlink()
            raise ArtError(f'{hero}/{action}: {target.name} 已存在但不是這支工具產的，不覆蓋')
        tmp.replace(target)
        entry = {'texture': texture, 'scale': metrics['scale'], 'loop': spec.get('loop', False), 'frames': frames}
        data['actions'][action] = entry
        records.append({'hero': hero, 'action': action, 'source': path.relative_to(ROOT).as_posix(),
                        'sourceSha256': sha(path), 'target': target.relative_to(ROOT).as_posix(),
                        'targetSha256': sha(target), 'bytes': target.stat().st_size, 'size': list(image.size),
                        'alphaTidy': True, 'rgbaExactAfterTidy': True, 'attempt': spec.get('attempt'), **{k: v for k, v in metrics.items() if k != 'scale'}})
    for data_file, data in touched.items():
        dump_json(ROOT / data_file, data)
    keep = [r for r in old_records if (r['hero'], r['action']) not in {(x['hero'], x['action']) for x in records}]
    dump_json(record_file, {'generator': 'gpt-image-1.5（codex-oauth，真透明輸出）',
                            'reproducer': 'python tools/pack_idle_state_motion.py',
                            'wholeCharacterFrames': True, 'assets': keep + records})
    print(json.dumps({'packed': [f"{r['hero']}/{r['action']}" for r in records]}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', nargs=2, metavar=('HERO', 'ACTION'), help='只檢查一張，不寫檔')
    parser.add_argument('--path', help='搭配 --check：檢查指定檔（例如還沒轉正的新嘗試）')
    parser.add_argument('--only', nargs='*', default=[], help='只打包這幾個（格式 hero/action）')
    args = parser.parse_args()
    if args.check:
        hero, action = args.check
        _, _, metrics = check(hero, action, Path(args.path) if args.path else None)
        print(json.dumps({'ok': f'{hero}/{action}', **metrics}, ensure_ascii=False))
        return
    only = {tuple(x.split('/', 1)) for x in args.only} or None
    pack(only)


if __name__ == '__main__':
    main()
