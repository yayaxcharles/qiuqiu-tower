"""四隻貓「空手擲出」逐格圖的打包器（2026-09-23，批次 toss；只「加」新動作，不動既有動作）。

檢查與切格整套用 `pack_card_motion.py`（透明度整理、切格、每格身高比例、第 1 格跟新版待機的寬度、
第 8 格回到待機架式、重心不橫移），只換來源資料夾、門檻、紀錄檔；另外多三件：

1. **生圖端回來的尺寸不一定照要求**（2026-09-23 起伺服器會換模型）：比 1536×1024 大就等比縮進去，
   跟其他出牌動作的圖集同一個尺寸等級（解碼後的記憶體才不會一張比一張大）。
2. **量頭，不量外框**（09-22 挨打圖的教訓：後仰、彎膝外框會變矮，外框對得上不代表身體一樣大）：
   第 1 格與第 8 格的頭拿新版待機第 1 格的頭比（`pack_screen_art.head_fit`，同一個顯示比例下比），
   `actions.json` 的 `sizeFix` 乘上去之後要在 ±5% 以內，不合格就停；量到的數字寫進紀錄檔。
3. 出手時點 `releaseTimes` 一起寫進動作資料：東西從手上放出去的那一刻（`projectile-flight.ts` 用它算飛多久）。

用法：
    python tools/pack_toss_motion.py --check qiuqiu                  # 只檢查選定那張，不寫檔
    python tools/pack_toss_motion.py --check qiuqiu --path 某次嘗試.png
    python tools/pack_toss_motion.py                                  # 打包 actions.json 裡全部已選定的
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pack_card_motion as pcm  # noqa: E402
from pack_idle_state_motion import HEROES, NATIVE_HEIGHT, ROOT, ArtError, dump_json, index_sheet, sha, tidy  # noqa: E402
from pack_screen_art import head_fit  # noqa: E402

SOURCE = ROOT / 'tools/motion-art-source/toss'
CONFIG = SOURCE / 'actions.json'
RECORD = ROOT / 'docs/toss-motion-assets.json'
SHEET_MAX = (1536, 1024)
ACTION = 'toss'
# 擲出是站著做完的：往後拉手、出手前傾、收勢，身高守 ±15%；出手那格手臂整條伸出去，重心會往前偏
pcm.LIMITS[ACTION] = (0.85, 1.15)
pcm.CENTER_SHIFT[ACTION] = 58
HEAD_TOL = 0.05
HEAD_FRAMES = (0, 7)   # 量頭的格：第 1 格與第 8 格都是一般待機的架式，頭不轉、量得準


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def fit_size(image: Image.Image) -> Image.Image:
    if image.width <= SHEET_MAX[0] and image.height <= SHEET_MAX[1]:
        return image
    k = min(SHEET_MAX[0] / image.width, SHEET_MAX[1] / image.height)
    return image.resize((round(image.width * k), round(image.height * k)), Image.LANCZOS)


def check(hero: str, path: Path | None = None) -> tuple[Image.Image, list[dict], dict]:
    spec = load_config()['heroes'][hero][ACTION]
    path = path or SOURCE / hero / f'{ACTION}.png'
    label = f'{hero}/{ACTION}'
    image = tidy(fit_size(Image.open(path).convert('RGBA')))
    frames = index_sheet(image, spec['times'], label)
    metrics = pcm.quality(hero, ACTION, image, frames)
    fix = float(spec.get('sizeFix', 1))
    scale = metrics['scale'] * fix
    heads = []
    for index in HEAD_FRAMES:
        x, y, w, h = frames[index]['rect']
        measured = head_fit(hero, image.crop((x, y, x + w, y + h)), 1 / scale)
        heads.append({'frame': index + 1, **measured})
        if measured['corr'] < 0.85:
            raise ArtError(f'{label}: 第 {index + 1} 格頭部比對吻合度只有 {measured["corr"]}，量不準（長相可能跑掉了）')
        if abs(measured['scale'] - 1) > HEAD_TOL:
            raise ArtError(f'{label}: 第 {index + 1} 格的頭是新版待機的 {measured["scale"]} 倍（sizeFix {fix}），'
                           f'超出 ±{HEAD_TOL:.0%}；把 sizeFix 改成約 {round(fix / measured["scale"], 3)} 再打包')
    metrics.update({'scale': scale, 'sizeFix': fix, 'headFit': heads, 'packedSize': list(image.size)})
    return image, frames, metrics


def pack() -> None:
    config = load_config()
    old_records = json.loads(RECORD.read_text(encoding='utf-8'))['assets'] if RECORD.exists() else []
    staged = []
    for hero, actions in config['heroes'].items():
        spec = actions[ACTION]
        path = SOURCE / hero / f'{ACTION}.png'
        if not path.exists() or spec.get('attempt') is None:
            print(f'略過 {hero}/{ACTION}：還沒有選定的圖')
            continue
        image, frames, metrics = check(hero, path)   # 全部檢查過才開始寫：一張不合格整批不動
        staged.append((hero, spec, path, image, frames, metrics))
    touched: dict[str, dict] = {}
    records = []
    for hero, spec, path, image, frames, metrics in staged:
        data_file, out_dir, pattern, _ = HEROES[hero]
        data = touched.setdefault(data_file, json.loads((ROOT / data_file).read_text(encoding='utf-8')))
        target = ROOT / out_dir / pattern.format(action=ACTION)
        texture = f'{out_dir.removeprefix("public/")}/{target.name}'
        existing = data['actions'].get(ACTION)
        if existing and existing.get('texture') != texture:
            raise ArtError(f'{hero}/{ACTION}: 動作資料裡已經有同名動作（{existing.get("texture")}），不覆蓋既有動作')
        if target.exists() and existing is None:
            raise ArtError(f'{hero}/{ACTION}: {target.name} 已存在但不是這支工具產的，不覆蓋')
        tmp = target.with_suffix('.tmp.webp')
        image.save(tmp, 'WEBP', lossless=True, method=6, exact=True)
        if Image.open(tmp).convert('RGBA').tobytes() != image.tobytes():
            tmp.unlink()
            raise ArtError(f'{hero}/{ACTION}: 無損存檔讀回來不一樣')
        tmp.replace(target)
        data['actions'][ACTION] = {'texture': texture, 'scale': metrics['scale'], 'loop': False, 'frames': frames,
                                   'impactTimes': spec['impactTimes'], 'releaseTimes': spec['releaseTimes']}
        records.append({'hero': hero, 'action': ACTION, 'source': path.relative_to(ROOT).as_posix(),
                        'sourceSha256': sha(path), 'target': target.relative_to(ROOT).as_posix(),
                        'targetSha256': sha(target), 'bytes': target.stat().st_size, 'size': list(image.size),
                        'alphaTidy': True, 'rgbaExactAfterTidy': True, 'attempt': spec.get('attempt'),
                        **{k: v for k, v in metrics.items() if k != 'scale'}})
    for data_file, data in touched.items():
        dump_json(ROOT / data_file, data)
    done = {x['hero'] for x in records}
    keep = [r for r in old_records if r['hero'] not in done]
    dump_json(RECORD, {'generator': 'gpt-image-1.5（codex-oauth，真透明輸出）',
                       'reproducer': 'python tools/pack_toss_motion.py',
                       'wholeCharacterFrames': True, 'assets': keep + records})
    print(json.dumps({'packed': [f"{r['hero']}/{ACTION}" for r in records]}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', metavar='HERO', help='只檢查一張，不寫檔')
    parser.add_argument('--path', help='搭配 --check：檢查指定檔（例如還沒選定的嘗試）')
    args = parser.parse_args()
    if args.check:
        _, _, metrics = check(args.check, Path(args.path) if args.path else None)
        print(json.dumps({'ok': f'{args.check}/{ACTION}', **metrics}, ensure_ascii=False))
        return
    pack()


if __name__ == '__main__':
    main()
