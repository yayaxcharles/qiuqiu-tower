"""出牌動作逐格圖的打包器（2026-09-22，只「加」新動作，不動既有動作）。

跟待機狀態那支 `pack_idle_state_motion.py` 同一套：透明度整理（`tidy`）、切格（`index_sheet`）、
品質檢查不合格就丟例外整批停下、既有動作與 webp 一個位元都不碰。這裡直接匯入那邊的函式，
只換三樣東西：來源資料夾（`tools/motion-art-source/card-motions/`）、每個動作的門檻、紀錄檔。

另外多一件待機狀態用不到的事：**騰空的格**（輕功）。切格時腳底定位一律取「角色最底下那一點」，
跳起來的格子也會被壓回地面、跳的高度就不見了。所以 `actions.json` 標了 `airborne` 的格，
腳底定位改成「同一列著地格的腳底線」，角色離那條線多高就畫多高；並檢查：
  - 著地格彼此的腳底線要對齊（差超過格高 2.5% 代表生圖沒守住地面，不能拿來當基準）；
  - 騰空格至少要有一格真的離地（格高 4% 以上），不然就只是原地擺姿勢，要重生。

用法：
    python tools/pack_card_motion.py --check qiuqiu taiji                      # 只檢查一張，不寫檔
    python tools/pack_card_motion.py --check qiuqiu taiji --path 某次嘗試.png
    python tools/pack_card_motion.py                                            # 打包 actions.json 裡全部已選定的
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_idle_state_motion import (  # noqa: E402
    HEROES, NATIVE_HEIGHT, ROOT, WIDTH_RATIO, ArtError, dump_json, idle_reference, index_sheet, mass_center_x, sha, tidy,
)

SOURCE = ROOT / 'tools/motion-art-source/card-motions'
CONFIG = SOURCE / 'actions.json'
RECORD = ROOT / 'docs/card-motion-assets.json'

# 每格身高 ÷ 第 1 格身高 的容許範圍（第 1 格＝一般待機，拿來定比例）。
# 出牌動作都是站著做完的，守 ±15% 左右：吼會後仰前探、太極手會舉到臉、卷軸會舉到胸前；
# 輕功有蹲、有縮腿、有伸展，放寬但擋「畫成一粒豆子」或「整隻拉長」。
LIMITS = {
    'taiji': (0.85, 1.18),
    'focus': (0.88, 1.15),
    'scroll': (0.88, 1.18),
    'roar': (0.84, 1.18),
    'qinggong': (0.62, 1.30),
}
# 重心偏離格子中心的上限（遊戲單位）。吼會前探、太極會前推，比待機狀態多給一點；輕功在空中手腳張開。
CENTER_SHIFT = {'default': 48, 'qinggong': 64}
GROUND_TOLERANCE = 0.025   # 著地格腳底線的最大落差（格高的比例）
MIN_LIFT = 0.04            # 騰空格至少要有一格離地這麼多（格高的比例）


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def apply_airborne(image: Image.Image, frames: list[dict], airborne: list[int], label: str) -> list[float]:
    """把騰空格的腳底定位改成同一列著地格的腳底線。回傳每格離地高度（格高比例，著地格＝0）。"""
    width, height = image.size
    cell_h = height / 2
    lifted = {i - 1 for i in airborne}
    lifts = [0.0] * len(frames)
    for row in range(2):
        members = [i for i in range(len(frames)) if i // 4 == row]
        grounded = [i for i in members if i not in lifted]
        if not grounded:
            raise ArtError(f'{label}: 第 {row + 1} 列沒有著地格，找不到地面線')
        bottoms = [frames[i]['rect'][1] + frames[i]['rect'][3] for i in grounded]
        if (max(bottoms) - min(bottoms)) / cell_h > GROUND_TOLERANCE:
            raise ArtError(f'{label}: 第 {row + 1} 列著地格的腳底線差了 {(max(bottoms) - min(bottoms)) / cell_h:.3f} 格高，'
                           '生圖沒守住同一條地面線')
        ground = max(bottoms)
        for i in members:
            if i not in lifted:
                continue
            x, y, w, h = frames[i]['rect']
            lift = (ground - (y + h)) / cell_h
            if lift < -GROUND_TOLERANCE:
                raise ArtError(f'{label}: 第 {i + 1} 格標成騰空，腳卻比地面線還低')
            lifts[i] = round(max(0.0, lift), 3)
            frames[i]['pivot'] = [frames[i]['pivot'][0], ground - y - 1]
    if max(lifts) < MIN_LIFT:
        raise ArtError(f'{label}: 標成騰空的格都沒有真的離地（最高 {max(lifts):.3f} 格高），畫成原地擺姿勢了')
    return lifts


def quality(hero: str, action: str, image: Image.Image, frames: list[dict]) -> dict:
    """品質檢查。不合格丟 ArtError；合格回傳量到的數字（寫進紀錄檔）。"""
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
    # 第 8 格要回到待機架式：播完直接接回待機，寬高差太多會看到跳一下
    last_ratio = round(frames[-1]['rect'][2] / frames[0]['rect'][2], 3)
    if not 0.85 <= last_ratio <= 1.18 or not 0.9 <= ratios[-1] <= 1.1:
        raise ArtError(f'{label}: 第 8 格沒有回到第 1 格的架式（寬度比 {last_ratio}、身高比 {ratios[-1]}），接回待機會跳')
    limit = CENTER_SHIFT.get(action, CENTER_SHIFT['default'])
    shifts = []
    for frame in frames:
        offset = (mass_center_x(image, frame['rect']) - frame['pivot'][0]) * scale
        shifts.append(round(offset - idle_offset, 1))
    off = [i + 1 for i, s in enumerate(shifts) if abs(s) > limit]
    if off:
        raise ArtError(f'{label}: 第 {off} 格角色偏離格子中心 {[shifts[i - 1] for i in off]} 遊戲單位（上限 {limit}），'
                       '出招時會看到角色橫移')
    return {'scale': scale, 'heightRatios': ratios, 'firstFrameWidthRatio': width_ratio, 'lastFrameWidthRatio': last_ratio,
            'centerShift': shifts}


def check(hero: str, action: str, path: Path | None = None) -> tuple[Image.Image, list[dict], dict]:
    spec = load_config()['heroes'][hero][action]
    path = path or SOURCE / hero / f'{action}.png'
    image = tidy(Image.open(path))
    frames = index_sheet(image, spec['times'], f'{hero}/{action}')
    lifts = apply_airborne(image, frames, spec['airborne'], f'{hero}/{action}') if spec.get('airborne') else None
    metrics = quality(hero, action, image, frames)
    if lifts is not None:
        metrics['airborneLift'] = lifts
    return image, frames, metrics


def pack(only: set[tuple[str, str]] | None = None) -> None:
    config = load_config()
    old_records = json.loads(RECORD.read_text(encoding='utf-8'))['assets'] if RECORD.exists() else []
    # 先全部檢查過一遍才開始寫：有一張不合格就整批不動
    staged = []
    for hero, actions in config['heroes'].items():
        for action, spec in actions.items():
            if only and (hero, action) not in only:
                continue
            path = SOURCE / hero / f'{action}.png'
            if not path.exists():
                print(f'略過 {hero}/{action}：還沒有選定的圖')
                continue
            image, frames, metrics = check(hero, action, path)
            staged.append((hero, action, spec, path, image, frames, metrics))
    touched: dict[str, dict] = {}
    records = []
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
        if spec.get('impactTimes'):
            entry['impactTimes'] = spec['impactTimes']
        data['actions'][action] = entry
        records.append({'hero': hero, 'action': action, 'source': path.relative_to(ROOT).as_posix(),
                        'sourceSha256': sha(path), 'target': target.relative_to(ROOT).as_posix(),
                        'targetSha256': sha(target), 'bytes': target.stat().st_size, 'size': list(image.size),
                        'alphaTidy': True, 'rgbaExactAfterTidy': True, 'attempt': spec.get('attempt'),
                        **{k: v for k, v in metrics.items() if k != 'scale'}})
    for data_file, data in touched.items():
        dump_json(ROOT / data_file, data)
    done = {(x['hero'], x['action']) for x in records}
    keep = [r for r in old_records if (r['hero'], r['action']) not in done]
    dump_json(RECORD, {'generator': 'gpt-image-1.5（codex-oauth，真透明輸出）',
                       'reproducer': 'python tools/pack_card_motion.py',
                       'wholeCharacterFrames': True, 'assets': keep + records})
    print(json.dumps({'packed': [f"{r['hero']}/{r['action']}" for r in records]}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', nargs=2, metavar=('HERO', 'ACTION'), help='只檢查一張，不寫檔')
    parser.add_argument('--path', help='搭配 --check：檢查指定檔（例如還沒選定的嘗試）')
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
