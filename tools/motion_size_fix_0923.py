"""0923 批次：逐格動作與靜態退路的大小修正（2026-09-23，實機驗收 M-3＋L-1）。

使用者的硬規矩：**比頭，跟同一隻新版待機第 1 格差超過 5% 就是問題。**驗收量到這幾組超出：
  - 噹噹 隱身（stealth）頭大約 11%、掛彩（wounded）頭大約 9%——逐格動作本身就這麼大，靜態退路從它裁；
  - 封封 集中（focus；靜態的集中／卷軸／技能都取這一套）頭小約 7%——同上；
  - 封封「拳」（靜態取 heavy_slash 第 4 格）放不進靜態畫布、縮成 0.904——逐格那格本身合格，只有靜態退路小；
  - 菲菲「翻肚」（靜態取 belly 第 8 格）縮成 0.924——同上，躺姿量不準頭，照打包紀錄的縮放倍率算。

這支處理前三套**逐格動作**：跟 6pct 批次（`tools/motion_size_fix_6pct.py`）同一個做法——
圖一個位元都不動，資料檔的 scale × 修正倍率（`SIZE_FIX`）；定位點是圖內座標，縮放以定位點為中心，腳底線不動。
量法也照 6pct：新版待機第 1 格的頭當樣板，每格量四種（比例尺 1.5／2.0 × 樣板到頭身交界／到下巴 0.40）取中位數；
四種裡最好的相關 < 0.85 或四種差距 > 8% 的格子算量不準、倍率不採。
修正倍率＝1 ÷（量得準的格子裡頭部倍率最大值與最小值的中點），讓離待機最遠的那一格離得最近；取到千分位。
**閘門**（`apply` 時全部過才寫檔）：改後每一格量得準的頭都在待機 ±5% 內；整隻高度（外框高 ÷ 待機第 1 格外框高）不超過 +5%。

靜態退路之後由 `tools/pack_static_from_motion.py --only …` 從改過的逐格重裁（拳與翻肚的處理也在那支）。

用法：
    python tools/motion_size_fix_0923.py measure [動作…] [--save-as before|after]
    python tools/motion_size_fix_0923.py apply        # 量改前、算倍率、過閘門、寫資料檔與紀錄
"""
from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion_size_fix_mix as mix  # noqa: E402  樣板、比例尺、搜尋都跟 mix／6pct 批次共用（不改它）

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/fix0923'
MEASURE = SOURCE / 'measure.json'
RECORD = ROOT / 'docs/motion-size-fix-0923.json'
VARIANTS = [(1.5, None), (1.5, .40), (2.0, None), (2.0, .40)]
MIN_CORR = 0.85
MAX_SPREAD = 0.08
HEAD_LIMIT = 0.05
HEIGHT_LIMIT = 0.05
HEAD_CUT = {**mix.HEAD_CUT, 'feifei': .52}
IDLE_DATA = {**mix.IDLE_DATA, 'feifei': 'src/ui/feifei-motion-data.json'}

# 要修的四套（動作資料檔）；倍率由 `apply` 照上面的規則從改前量測算出來，寫進紀錄與測試。
# 封封重劈（heavy_slash）不在驗收清單上：驗收量的是「拳」的靜態退路（取第 4 格、縮成 0.904）；
# 這次量逐格本身，第 3、6 格的頭只有待機的 0.905、0.895，同一條規矩也超出，所以一起修（靜態再從它重裁）
TARGETS = {
    'dangdang/stealth': 'src/ui/dangdang-motion-data.json',
    'dangdang/wounded': 'src/ui/dangdang-motion-data.json',
    'fengfeng/focus': 'src/ui/fengfeng-motion-data.json',
    'fengfeng/heavy_slash': 'src/ui/fengfeng-motion-data.json',
}
# 整隻高度不設上限的：外框高量到的是舉過頭的劍，不是身體（改前最高那格已經是待機的 1.233 倍，第 3、4 格劍尖朝上）
HEIGHT_EXEMPT = {'fengfeng/heavy_slash': '外框高包含舉過頭的劍；身體大小看頭'}
# 只量、不改（對照：待機本身）
EXTRA = {
    'dangdang/idle': 'src/ui/dangdang-motion-data.json',
    'fengfeng/idle': 'src/ui/fengfeng-motion-data.json',
}
FILES = {**TARGETS, **EXTRA}


def action(key: str) -> dict:
    return mix.load_action(FILES[key], key.split('/')[1])


def idle_frame(hero: str, z: float) -> np.ndarray:
    idle = mix.load_action(IDLE_DATA[hero], 'idle')
    return mix.frame_rgba(mix.texture(idle['texture']), idle['frames'][0]['rect'], idle['scale'], z)


def _head_job(args):
    key, i, tex, rect, scale, z, cut = args
    hero = key.split('/')[0]
    base = idle_frame(hero, z)
    head = base[:round(base.shape[0] * (cut or HEAD_CUT[hero]))]
    corr, s, rot, _ = mix.fit(head, mix.frame_rgba(mix.texture(tex), rect, scale, z))
    return key, i, {'z': z, 'cut': cut, 'corr': corr, 'scale': s, 'rot': rot}


def measure_all(scales: dict[str, float]) -> dict[str, dict]:
    jobs = []
    for key, scale in scales.items():
        data = action(key)
        for i, f in enumerate(data['frames']):
            for z, cut in VARIANTS:
                jobs.append((key, i, data['texture'], f['rect'], scale, z, cut))
    raw: dict = {k: {} for k in scales}
    with ProcessPoolExecutor(max_workers=16) as pool:
        for key, i, r in pool.map(_head_job, jobs, chunksize=1):
            raw[key].setdefault(i, []).append(r)
    out = {}
    for key in scales:
        rows = [raw[key][i] for i in range(len(raw[key]))]
        out[key] = {
            'scale': scales[key],
            'head': [round(float(np.median([v['scale'] for v in r])), 3) for r in rows],
            'spread': [round(max(v['scale'] for v in r) - min(v['scale'] for v in r), 3) for r in rows],
            'corrMax': [max(v['corr'] for v in r) for r in rows],
            'height': heights(key, scales[key]),
        }
    return out


def idle_height(hero: str) -> float:
    idle = mix.load_action(IDLE_DATA[hero], 'idle')
    return idle['frames'][0]['rect'][3] * idle['scale']


def heights(key: str, scale: float) -> list[float]:
    return [round(f['rect'][3] * scale / idle_height(key.split('/')[0]), 4) for f in action(key)['frames']]


def reliable(m: dict, i: int) -> bool:
    return m['corrMax'][i] >= MIN_CORR and m['spread'][i] <= MAX_SPREAD + 1e-9


def fix_of(key: str, m: dict) -> float:
    """1 ÷ 頭部倍率的中點；放大時再受整隻高度 +5% 壓住（跟 6pct 同一條：頭與整隻高度不能同時滿足時高度優先）。"""
    ok = [h for i, h in enumerate(m['head']) if reliable(m, i)]
    head = round(1 / ((min(ok) + max(ok)) / 2), 3)
    if key in HEIGHT_EXEMPT:
        return head
    height = int((1 + HEIGHT_LIMIT) / max(m['height']) * 1000) / 1000
    return min(head, height)


def show(key: str, m: dict) -> None:
    flags = ''.join('✓' if reliable(m, i) else '?' for i in range(len(m['head'])))
    sys.stdout.write(f"{key:22s} scale {m['scale']:.4f} ｜頭 {' '.join(f'{h:.3f}' for h in m['head'])} ｜量得準 {flags}"
                     f" ｜差距 {' '.join(f'{s:.2f}' for s in m['spread'])} ｜高 {max(m['height']):.3f}\n")


def measure_cmd(keys: list[str], save_as: str | None) -> dict:
    out = measure_all({k: action(k)['scale'] for k in keys or list(FILES)})
    for k, m in out.items():
        show(k, m)
    if save_as:
        SOURCE.mkdir(parents=True, exist_ok=True)
        data = json.loads(MEASURE.read_text(encoding='utf-8')) if MEASURE.exists() else {}
        data[save_as] = {**data.get(save_as, {}), **out}
        MEASURE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return out


def write_scale(data_file: str, name: str, scale: float) -> None:
    path = ROOT / data_file
    raw = path.read_bytes().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    data = json.loads(raw)
    data['actions'][name]['scale'] = scale
    text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    path.write_bytes(text.replace('\n', nl).encode('utf-8'))


def apply() -> None:
    if RECORD.exists():
        raise SystemExit(f'{RECORD.name} 已經有了：這一批只套一次（要重來先把資料檔與紀錄還原）')
    before = measure_all({k: action(k)['scale'] for k in TARGETS})
    plan = {}
    for key, m in before.items():
        show(key, m)
        fix = fix_of(key, m)
        plan[key] = {'packed': m['scale'], 'fix': fix, 'scale': m['scale'] * fix}
    after = measure_all({k: p['scale'] for k, p in plan.items()})
    errors = []
    for key, m in after.items():
        show(key, m)
        for i, h in enumerate(m['head']):
            if reliable(m, i) and abs(h - 1) > HEAD_LIMIT + 1e-9:
                errors.append(f'{key} 第 {i + 1} 格改後頭 {h}')
        if key not in HEIGHT_EXEMPT and max(m['height']) > 1 + HEIGHT_LIMIT + 1e-9:
            errors.append(f'{key} 改後最高一格是待機的 {max(m["height"])} 倍')
        if sum(reliable(m, i) for i in range(len(m['head']))) < 4:
            errors.append(f'{key} 量得準的格子不到一半')
    if errors:
        raise SystemExit('閘門沒過，什麼都沒寫：\n' + '\n'.join(errors))
    for key, p in plan.items():
        write_scale(TARGETS[key], key.split('/')[1], p['scale'])
    RECORD.write_text(json.dumps({
        'note': '2026-09-23 實機驗收 M-3＋L-1：逐格動作只改資料檔 scale（圖不動）。量法與閘門見 tools/motion_size_fix_0923.py 檔頭。',
        'reproducer': 'python tools/motion_size_fix_0923.py apply（要先把資料檔與這份紀錄還原到改前）',
        'actions': {k: {'data': TARGETS[k], 'packedScale': p['packed'], 'sizeFix': p['fix'], 'scale': p['scale'],
                        'before': before[k], 'after': after[k], **({'heightExempt': HEIGHT_EXEMPT[k]} if k in HEIGHT_EXEMPT else {})}
                    for k, p in plan.items()},
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('寫好了：', ', '.join(f'{k} ×{p["fix"]}' for k, p in plan.items()))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    m = sub.add_parser('measure')
    m.add_argument('keys', nargs='*')
    m.add_argument('--save-as', default=None)
    sub.add_parser('apply')
    args = parser.parse_args()
    if args.command == 'measure':
        measure_cmd(args.keys, args.save_as)
    else:
        apply()


if __name__ == '__main__':
    main()
