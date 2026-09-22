"""6pct 批次：動作圖大小修正（2026-09-22 下午，第 1 格頭部倍率差 6% 的那幾套）。

背景跟 mix 批次（`tools/motion_size_fix_mix.py`）一樣：拿新版待機第 1 格的頭當樣板，在每一格裡找最吻合的倍率。
這一批六套：

  - 噹噹 閃避（dodge）、勝利（win）：兩套在同一張 `dodge_win.webp`，各自有自己的 scale。
    頭大 1～8%，腳掌、護臂也大 2～7%（頭與身體倍率差 ≤3%）＝整隻畫大，**不重畫，只改資料檔的 scale**。
  - 球球 連環踢（combo_kick）、衝刺（rush）、手裏劍亂舞（storm）、空中爪擊（attack_air，只有 6 格）：
    Godot 動作修練場移過來的原畫，**只准縮放、不准重畫**。頭小 2～13%。

做法：圖一個位元都不動，資料檔的 scale ＝ 開分支那一版的值 × 修正倍率。定位點是圖內座標、不用改
（縮放以定位點為中心，腳底線不動）。修正倍率＝1 ÷（量得準的格子裡，頭部倍率最大值與最小值的中點），
讓離待機最遠的那一格離得最近（±5% 閘門的餘裕最大）；取到千分位。

量法（比 mix 多一道穩健）：mix 的單一量法（比例尺 1.5、樣板到頭身交界）換個比例尺重量，難認的格子會差 3～9%，
跟 ±4% 的相鄰格閘門同一個量級。所以每格量四種（比例尺 1.5／2.0 × 樣板到下巴 0.40／到頭身交界），取中位數；
四種裡最好的相關 < 0.85（量不到頭：臉被擋住、表情全變）或四種最大減最小 > 8%（量不準：比閘門寬度還粗）的格子
算「量不準」，倍率不採。量不準的格子只准是 `UNRELIABLE` 明列的，而且各有退路：
  - `feet`：前腳樣板（噹噹的前腳形狀穩定；後腳常被前腿擋住，換比例尺重量會差 15%，不採）驗 ±5%；
  - `chain`：接力量——拿同一套相鄰、量得準的格子的頭（照量到的輪廓裁下來）當樣板量這一格，兩格同一次畫、
    角度接近，相關高得多；這一格＝相鄰那格的頭部倍率 × 兩格比值。
門檻（相關 0.85、四種差 8%、接力相關 0.90）是看過這批資料之後訂的。

閘門（`gate`，不合格就丟例外、什麼都不寫）：
  1. 圖與格子沒動：圖集跟開分支那一版同一個檔、每格 rect／pivot／duration 完全相同，只有 scale 變——
     所以縮放前後「相鄰格頭部倍率的比值」完全相同（原畫本身的起伏不會變好也不會變糟）；
  2. 修正倍率照規則從改前量測算出來；
  3. 量得準的每一格：改後重量、改前×修正倍率，兩個都在待機 ±5% 內；
  4. 量不準的只准是明列的格子（而且改前改後真的量不準），退路量到的也要在 ±5% 內；
  5. 相鄰格頭部倍率變化 ≤4%（用改前的量測＝原畫本身的比值；跳過量不準的格子；循環動作連最後一格接回第 1 格）。
     超過的只准是 `INHERENT_STEPS` 明列的那幾組——原畫的姿勢透視（轉頭、低頭），整套縮放改不了，
     2026-09-22 主控裁定不逐格再縮，閘門改成「不能比原畫更糟」（由第 1 點保證完全相同）；
  6. 真透明、每格只有一隻、外框沒貼著圖邊或別的不透明像素。

用法：
    python tools/motion_size_fix_6pct.py measure [動作…] [--save-as before]
    python tools/motion_size_fix_6pct.py apply        # 全部過閘門才寫檔
    python tools/motion_size_fix_6pct.py sheet        # 聯絡表（改前 vs 改後）
"""
from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion_size_fix_mix as mix  # noqa: E402  樣板、比例尺、搜尋、部件、每格一隻的檢查都跟 mix 批次共用（不改它）
from pack_idle_state_motion import ArtError, dump_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/motion-art-source/6pct'
MEASURE = SOURCE / 'measure.json'
RECORD = ROOT / 'docs/motion-size-fix-6pct.json'
BASE_COMMIT = 'a4e6d19'       # 這一批開分支的地方＝改前
VARIANTS = [(1.5, None), (1.5, .40), (2.0, None), (2.0, .40)]   # （比例尺, 樣板高度比例；None＝頭身交界 HEAD_CUT）
MIN_CORR = 0.85               # 四種量法裡最好的相關低於這個＝量不到頭
MAX_SPREAD = 0.08             # 四種量法最大減最小超過這個＝量不準
CHAIN_CORR = 0.90             # 接力量每一次的相關都要到這個
FOOT = '前腳'

# packed＝開分支那一版資料檔的 scale；fix＝乘上去的倍率
SCALE_FIX = {
    'dangdang/dodge': {'data': 'src/ui/dangdang-motion-data.json', 'packed': 0.863013698630137, 'fix': 0.946},
    'dangdang/win': {'data': 'src/ui/dangdang-motion-data.json', 'packed': 0.865979381443299, 'fix': 0.962},
    'qiuqiu/combo_kick': {'data': 'src/ui/qiuqiu-motion-data.json', 'packed': 0.605, 'fix': 1.111},
    'qiuqiu/rush': {'data': 'src/ui/qiuqiu-motion-data.json', 'packed': 0.622, 'fix': 1.084},
    'qiuqiu/storm': {'data': 'src/ui/qiuqiu-motion-data.json', 'packed': 0.622, 'fix': 1.042},
    'qiuqiu/attack_air': {'data': 'src/ui/qiuqiu-motion-data.json', 'packed': 0.515, 'fix': 1.081},
}
GODOT_ORIGINAL = {'qiuqiu/combo_kick', 'qiuqiu/rush', 'qiuqiu/storm', 'qiuqiu/attack_air'}
# 量不準的格子（第幾格從 1 算）：（為什麼, 退路）
UNRELIABLE = {
    'dangdang/dodge': {4: ('低頭閃避，臉被拳頭擋住', 'feet')},
    'dangdang/win': {6: ('閉眼張嘴歡呼，舉起的手擋住後腦', 'feet')},
    'qiuqiu/attack_air': {4: ('空中翻身、頭轉 26 度往下看，四種量法差 9%', 'chain')},
}
# 原畫本身相鄰格頭部倍率就跳超過 4% 的地方（(前一格, 後一格)，從 1 算；跳過量不準的格子）
INHERENT_STEPS = {
    'qiuqiu/combo_kick': [(5, 6), (6, 7)],
    'qiuqiu/rush': [(1, 2)],
    'qiuqiu/attack_air': [(3, 5)],
}
LABEL = {'dangdang/dodge': '噹噹 閃避（縮放）', 'dangdang/win': '噹噹 勝利（縮放）',
         'qiuqiu/combo_kick': '球球 連環踢（縮放・原畫）', 'qiuqiu/rush': '球球 衝刺（縮放・原畫）',
         'qiuqiu/storm': '球球 手裏劍亂舞（縮放・原畫）', 'qiuqiu/attack_air': '球球 空中爪擊（縮放・原畫）'}
ALL = list(SCALE_FIX)


def _git(path: str) -> bytes:
    return subprocess.run(['git', 'show', f'{BASE_COMMIT}:{path}'], cwd=ROOT, capture_output=True, check=True).stdout


def base_action(key: str) -> dict:
    return json.loads(_git(SCALE_FIX[key]['data']).decode('utf-8'))['actions'][key.split('/')[1]]


def current(key: str) -> dict:
    return mix.load_action(SCALE_FIX[key]['data'], key.split('/')[1])


# ── 量測（每個工作都是獨立的一次搜尋，全部丟進同一個行程池） ──────────────────────────
def _head_job(args):
    key, i, tex, rect, scale, z, cut = args
    hero = key.split('/')[0]
    base = mix.idle_frame(hero, z)
    head = base[:round(base.shape[0] * (cut or mix.HEAD_CUT[hero]))]
    corr, s, rot, box = mix.fit(head, mix.frame_rgba(mix.texture(tex), rect, scale, z))
    return 'head', key, i, {'z': z, 'cut': cut, 'corr': corr, 'scale': s, 'rot': rot, 'box': box}


def _foot_job(args):
    key, i, tex, rect, scale = args
    tpl = mix.part_templates(key.split('/')[0])[FOOT]
    corr, s, _, _ = mix.fit(tpl, mix.frame_rgba(mix.texture(tex), rect, scale, mix.ZP), rot=60, lo=.72, hi=1.34)
    return 'foot', key, i, {'corr': corr, 'scale': s}


def _chain_job(args):
    """拿第 ref 格的頭（照待機頭樣板量到的輪廓裁）當樣板量第 i 格：回傳兩格頭的比值。"""
    key, i, ref, tex, frames, scale, z = args
    hero = key.split('/')[0]
    base = mix.idle_frame(hero, z)
    head = base[:round(base.shape[0] * mix.HEAD_CUT[hero])]
    ref_img = mix.frame_rgba(mix.texture(tex), frames[ref]['rect'], scale, z)
    _, s_ref, rot, (x, y, _, _) = mix.fit(head, ref_img)
    t = mix._warp(head, s_ref, rot)
    ys, xs = np.nonzero(t[..., 3] > 128)
    ys, xs = ys + y, xs + x
    ok = (ys >= 0) & (ys < ref_img.shape[0]) & (xs >= 0) & (xs < ref_img.shape[1])
    ys, xs = ys[ok], xs[ok]
    mask = np.zeros(ref_img.shape[:2], bool)
    mask[ys, xs] = True
    tpl = ref_img.copy()
    tpl[~mask, 3] = 0
    tpl = tpl[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    corr, ratio, _, _ = mix.fit(tpl, mix.frame_rgba(mix.texture(tex), frames[i]['rect'], scale, z), rot=30, lo=.80, hi=1.25)
    return 'chain', key, i, {'ref': ref, 'z': z, 'corr': corr, 'ratio': ratio}


def _run(job):
    return {'head': _head_job, 'foot': _foot_job, 'chain': _chain_job}[job[0]](job[1:])


def measure_all(scales: dict[str, float]) -> dict[str, dict]:
    """每套每格：四種量法的頭部倍率；明列量不準的格子另外量退路（前腳或接力）。"""
    jobs, datas = [], {}
    for key, scale in scales.items():
        data = datas[key] = current(key)
        for i, f in enumerate(data['frames']):
            for z, cut in VARIANTS:
                jobs.append(('head', key, i, data['texture'], f['rect'], scale, z, cut))
            why = UNRELIABLE.get(key, {}).get(i + 1)
            if why and why[1] == 'feet':
                jobs.append(('foot', key, i, data['texture'], f['rect'], scale))
            if why and why[1] == 'chain':
                for ref in neighbours(key, i, len(data['frames'])):
                    for z in (1.5, 2.0):
                        jobs.append(('chain', key, i, ref, data['texture'], data['frames'], scale, z))
    raw: dict[str, dict] = {k: {} for k in scales}
    with ProcessPoolExecutor(max_workers=16) as pool:
        for kind, key, i, r in pool.map(_run, jobs, chunksize=1):
            raw[key].setdefault(i, {'head': [], 'foot': None, 'chain': []})
            if kind == 'head':
                raw[key][i]['head'].append(r)
            elif kind == 'foot':
                raw[key][i]['foot'] = r
            else:
                raw[key][i]['chain'].append(r)
    out = {}
    for key in scales:
        n = len(datas[key]['frames'])
        rows = [raw[key][i] for i in range(n)]
        heads = [round(float(np.median([v['scale'] for v in r['head']])), 3) for r in rows]
        spread = [round(max(v['scale'] for v in r['head']) - min(v['scale'] for v in r['head']), 3) for r in rows]
        corr = [max(v['corr'] for v in r['head']) for r in rows]
        fallback = {}
        for i, r in enumerate(rows):
            if r['foot']:
                fallback[str(i + 1)] = {'method': 'feet', 'value': r['foot']['scale'], 'corr': r['foot']['corr']}
            if r['chain']:
                vals = [heads[c['ref']] * c['ratio'] for c in r['chain']]
                fallback[str(i + 1)] = {'method': 'chain', 'value': round(float(np.median(vals)), 3),
                                        'corr': min(c['corr'] for c in r['chain']),
                                        'runs': [{'ref': c['ref'] + 1, 'z': c['z'], 'ratio': c['ratio'], 'corr': c['corr']}
                                                 for c in r['chain']]}
        out[key] = {'head': heads, 'spread': spread, 'corrMax': corr,
                    'variants': [[{'z': v['z'], 'cut': v['cut'], 'scale': v['scale'], 'corr': v['corr']} for v in r['head']]
                                 for r in rows],
                    'fallback': fallback}
    return out


def neighbours(key: str, i: int, n: int) -> list[int]:
    """第 i 格前後最近、沒列成量不準的格子（從 0 算）。"""
    bad = {k - 1 for k in UNRELIABLE.get(key, {})}
    before = [j for j in range(i - 1, -1, -1) if j not in bad][:1]
    after = [j for j in range(i + 1, n) if j not in bad][:1]
    return before + after


def reliable(m: dict, i: int) -> bool:
    return m['corrMax'][i] >= MIN_CORR and m['spread'][i] <= MAX_SPREAD + 1e-9


def measure_cmd(actions: list[str], save_as: str) -> dict:
    keys = actions or ALL
    out = measure_all({k: current(k)['scale'] for k in keys})
    for k in keys:
        m = out[k]
        print(f"{k:20s} 頭 {' '.join(f'{h:.3f}' for h in m['head'])} ｜ 差距 {' '.join(f'{s:.2f}' for s in m['spread'])}"
              f" ｜ 相關 {' '.join(f'{c:.2f}' for c in m['corrMax'])} ｜ 退路 {m['fallback']}", flush=True)
    if save_as:
        data = json.loads(MEASURE.read_text(encoding='utf-8')) if MEASURE.exists() else {}
        data[save_as] = {**data.get(save_as, {}), **out}
        SOURCE.mkdir(parents=True, exist_ok=True)
        dump_json(MEASURE, data)
    return out


# ── 閘門 ──────────────────────────────────────────────────────────────
def steps(key: str, heads: list[float], loop: bool) -> list[tuple[int, int, float]]:
    """量得準的格子依序相鄰（循環動作連最後一格接回第 1 格）的變化：(前一格, 後一格, 變化)，從 1 算。"""
    idx = [i for i in range(len(heads)) if i + 1 not in UNRELIABLE.get(key, {})]
    pairs = list(zip(idx, idx[1:])) + ([(idx[-1], idx[0])] if loop else [])
    return [(a + 1, b + 1, round(heads[b] / heads[a] - 1, 4)) for a, b in pairs]


def within(v: float | None) -> bool:
    return v is not None and abs(v - 1) <= mix.HEAD_LIMIT + 1e-9


def gate(key: str, before: dict, after: dict) -> dict:
    spec = SCALE_FIX[key]
    data = current(key)
    base = base_action(key)
    fix = spec['fix']
    # 1. 圖與格子沒動、只有 scale 變
    if data['texture'] != base['texture'] or (ROOT / 'public' / data['texture']).read_bytes() != _git(f'public/{data["texture"]}'):
        raise ArtError(f'{key}: 圖集跟開分支那一版不是同一個檔，這一批只准改 scale')
    if data['frames'] != base['frames'] or bool(data.get('loop')) != bool(base.get('loop')):
        raise ArtError(f'{key}: 格子（rect／pivot／duration）或循環設定跟開分支那一版不一樣')
    if abs(base['scale'] - spec['packed']) > 1e-12:
        raise ArtError(f'{key}: 開分支那一版的 scale {base["scale"]} 不是紀錄的 {spec["packed"]}')
    n = len(data['frames'])
    listed = UNRELIABLE.get(key, {})
    # 2. 修正倍率照規則算
    ok = [before['head'][i] for i in range(n) if i + 1 not in listed]
    want = round(1 / ((min(ok) + max(ok)) / 2), 3)
    if want != fix:
        raise ArtError(f'{key}: 修正倍率 {fix} 跟改前量測算出來的 {want} 不一樣')
    for i in range(n):
        tag = f'{key}: 第 {i + 1} 格'
        if i + 1 in listed:
            # 4. 明列的：改前改後都真的量不準，退路量到的要在 ±5%
            if reliable(before, i) or reliable(after, i):
                raise ArtError(f'{tag}列成量不準，可是量得準（相關 {before["corrMax"][i]}／{after["corrMax"][i]}、'
                               f'差距 {before["spread"][i]}／{after["spread"][i]}），不准當例外')
            fb, fb0 = after['fallback'].get(str(i + 1)), before['fallback'].get(str(i + 1))
            if not fb or not fb0 or fb['method'] != listed[i + 1][1]:
                raise ArtError(f'{tag}量不準，退路（{listed[i + 1][1]}）沒量到')
            need = mix.PART_CORR if fb['method'] == 'feet' else CHAIN_CORR
            if min(fb['corr'], fb0['corr']) < need:
                raise ArtError(f'{tag}的退路（{fb["method"]}）相關 {fb0["corr"]}／{fb["corr"]} 低於 {need}，驗不了')
            if not (within(fb['value']) and within(fb0['value'] * fix)):
                raise ArtError(f'{tag}的退路（{fb["method"]}）改後 {fb["value"]}、改前×修正 {fb0["value"] * fix:.3f}，超出 ±{mix.HEAD_LIMIT:.0%}')
            continue
        # 3. 量得準的：改後重量、改前×修正倍率，兩個都要在 ±5%
        if not (reliable(before, i) and reliable(after, i)):
            raise ArtError(f'{tag}量不準（相關 {before["corrMax"][i]}／{after["corrMax"][i]}、差距 '
                           f'{before["spread"][i]}／{after["spread"][i]}），又沒列在例外')
        if not (within(after['head'][i]) and within(before['head'][i] * fix)):
            raise ArtError(f'{tag}頭部倍率改後 {after["head"][i]}、改前×修正 {before["head"][i] * fix:.3f}，超出 ±{mix.HEAD_LIMIT:.0%}')
    # 5. 相鄰格（原畫本身的比值，縮放前後完全相同）：超過 4% 的只准是明列的
    loop = bool(data.get('loop'))
    big = [(a, b, d) for a, b, d in steps(key, before['head'], loop) if abs(d) > mix.HEAD_STEP + 1e-9]
    if {(a, b) for a, b, _ in big} != set(INHERENT_STEPS.get(key, [])):
        raise ArtError(f'{key}: 原畫相鄰格跳超過 {mix.HEAD_STEP:.0%} 的是 {big}，跟明列的 {INHERENT_STEPS.get(key, [])} 對不上')
    # 6. 真透明、每格一隻、沒被切到（同 mix 的 `_scale_fix`）。真透明＝背景是 0、而且佔大半張、角色不透明：
    #    mix 要求 alpha 剛好 0～255，可是空中爪擊那張 Godot 原圖角色本身就是 254（原畫就這樣、這一批不准動像素）
    image = mix.texture(data['texture'])
    a = np.array(image)[..., 3]
    if int(a.min()) != 0 or int(a.max()) < 250 or float((a == 0).mean()) < 0.3:
        raise ArtError(f'{key}: 圖集不是真透明（alpha {a.min()}～{a.max()}，全透明佔 {(a == 0).mean():.0%}）')
    shares = []
    for i, f in enumerate(data['frames']):
        x, y, w, h = f['rect']
        if x == 0 or y == 0 or x + w >= a.shape[1] or y + h >= a.shape[0]:
            raise ArtError(f'{key}: 第 {i + 1} 格外框貼著圖邊，可能被切到')
        ring = np.concatenate([a[y - 1, x:x + w], a[y + h, x:x + w], a[y:y + h, x - 1], a[y:y + h, x + w]])
        if (ring > 16).any():
            raise ArtError(f'{key}: 第 {i + 1} 格外框外面緊貼著不透明像素，可能被切到')
        shares.append(mix.single_character(image, f['rect'], f'{key} 第 {i + 1} 格'))
    return {'bigSteps': big, 'mainBodyShare': shares}


def apply() -> None:
    before_all = json.loads(MEASURE.read_text(encoding='utf-8')).get('before', {}) if MEASURE.exists() else {}
    missing = [k for k in ALL if k not in before_all]
    if missing:
        raise ArtError(f'還沒量改前（measure --save-as before）：{missing}')
    fixed = {k: v['packed'] * v['fix'] for k, v in SCALE_FIX.items()}
    for key, spec in SCALE_FIX.items():
        if abs(current(key)['scale'] - spec['packed']) > 1e-12 and abs(current(key)['scale'] - fixed[key]) > 1e-12:
            raise ArtError(f'{key}: 資料檔的 scale {current(key)["scale"]} 既不是改前值也不是修正後的值，有人改過，先查清楚')
    after_all = measure_all(fixed)
    data = json.loads(MEASURE.read_text(encoding='utf-8'))
    data['after'] = after_all
    dump_json(MEASURE, data)
    errors, results = [], {}
    for key in ALL:
        a = after_all[key]
        print(f"{key:20s} 改後頭 {' '.join(f'{h:.3f}' for h in a['head'])} ｜ 差距 {' '.join(f'{s:.2f}' for s in a['spread'])}"
              f" ｜ 退路 { {k: v['value'] for k, v in a['fallback'].items()} }", flush=True)
        try:
            results[key] = gate(key, before_all[key], a)
        except ArtError as e:
            errors.append(str(e))
    if errors:
        raise ArtError('閘門不合格，整批不寫：\n  ' + '\n  '.join(errors))
    # ── 全部過了才開始寫 ──
    touched: dict[str, dict] = {}
    record = {
        'note': '2026-09-22 6pct 批次動作圖大小修正：六套都只改資料檔 scale（圖一個位元不動、每格 rect／pivot／duration 不動）。'
                '量法與閘門見 tools/motion_size_fix_6pct.py 檔頭：頭部倍率＝四種量法（比例尺 1.5／2.0 × 樣板到下巴／到頭身交界）'
                '的中位數；unreliable＝量不準的格子（四種裡最好的相關 <0.85 或四種差 >8%），改用 fallback（前腳或接力量）驗。'
                'before＝開分支那一版；headAfter＝改後 scale 下重量；inherentSteps＝原畫本身相鄰格就跳超過 4% 的地方'
                '（整套縮放比值不變，2026-09-22 主控裁定不逐格再縮）。',
        'reproducer': 'python tools/motion_size_fix_6pct.py measure --save-as before && python tools/motion_size_fix_6pct.py apply',
        'baseCommit': BASE_COMMIT,
        'gate': {'headLimit': mix.HEAD_LIMIT, 'headStep': mix.HEAD_STEP, 'minCorr': MIN_CORR, 'maxSpread': MAX_SPREAD,
                 'chainCorr': CHAIN_CORR, 'partCorr': mix.PART_CORR, 'mainBody': mix.MAIN_BODY},
        'scaleFix': {},
    }
    for key, spec in SCALE_FIX.items():
        action = key.split('/')[1]
        doc = touched.setdefault(spec['data'], json.loads((ROOT / spec['data']).read_text(encoding='utf-8')))
        doc['actions'][action]['scale'] = fixed[key]
        entry = doc['actions'][action]
        tex = ROOT / 'public' / entry['texture']
        b, a = before_all[key], after_all[key]
        record['scaleFix'][key] = {
            'packedScale': spec['packed'], 'sizeFix': spec['fix'], 'scale': fixed[key], 'loop': bool(entry.get('loop')),
            'texture': entry['texture'], 'textureSha256': mix.sha(tex), 'bytes': tex.stat().st_size,
            'frames': [{'rect': f['rect'], 'pivot': f['pivot'], 'duration': f['duration']} for f in entry['frames']],
            'godotOriginal': key in GODOT_ORIGINAL,
            'before': {'head': b['head'], 'spread': b['spread'], 'corrMax': b['corrMax']},
            'headAfter': a['head'], 'spreadAfter': a['spread'], 'corrMaxAfter': a['corrMax'],
            'unreliable': {str(i): {'why': why, 'method': method, 'before': b['fallback'][str(i)]['value'],
                                    'after': a['fallback'][str(i)]['value'],
                                    'corr': min(a['fallback'][str(i)]['corr'], b['fallback'][str(i)]['corr'])}
                           for i, (why, method) in UNRELIABLE.get(key, {}).items()},
            'inherentSteps': [[x, y, d] for x, y, d in results[key]['bigSteps']],
        }
    for path, doc in touched.items():
        dump_json(ROOT / path, doc)
    dump_json(RECORD, record)
    print(json.dumps({k: v['scale'] for k, v in record['scaleFix'].items()}, ensure_ascii=False))


# ── 聯絡表 ──────────────────────────────────────────────────────────────
SHEET_OUT = ROOT / 'docs/審查報告/重畫_6pct_2026-09-22.png'
HEADS_OUT = ROOT / 'docs/審查報告/重畫頭部_6pct_2026-09-22.png'


def sheet() -> None:
    """每套一列：待機第 1 格｜改前每格｜改後每格，同一個比例尺、同一條腳底線（紅線），灰虛線＝待機頭頂。
    另出一張頭部並排（待機頭｜改前頭｜改後頭：第 1 格與改前最偏的那一格），不進版控。"""
    K = 0.8                                   # 1 遊戲單位 = 0.8 像素
    LEFT = 330                                # 左邊標題欄寬
    F, FS = mix._font(22), mix._font(16)
    record = json.loads(RECORD.read_text(encoding='utf-8'))['scaleFix']
    rows, head_rows = [], []
    for key in ALL:
        hero = key.split('/')[0]
        rec = record[key]
        idle = mix.load_action(mix.IDLE_DATA[hero], 'idle')
        old = base_action(key)
        old_tex = Image.open(io.BytesIO(_git(f'public/{old["texture"]}'))).convert('RGBA')
        new = current(key)
        new_tex = mix.texture(new['texture'])
        n = len(old['frames'])
        cells = [('待機1', mix.texture(idle['texture']), idle['frames'][0], idle['scale'])]
        cells += [(f'改前{i + 1}', old_tex, f, old['scale']) for i, f in enumerate(old['frames'])]
        cells += [(f'改後{i + 1}', new_tex, f, new['scale']) for i, f in enumerate(new['frames'])]
        imgs = [(lab, *mix._frame_image(tex, f, sc, K)) for lab, tex, f, sc in cells]
        left = max(px for _, _, px, _ in imgs) + 8
        right = max(im.width - px for _, im, px, _ in imgs) + 8
        up = max(py for _, _, _, py in imgs) + 52
        down = max(im.height - py for _, im, _, py in imgs) + 6
        cw, rh = round(left + right), round(up + down)
        gap = 18
        row = Image.new('RGBA', (cw * len(imgs) + gap * 2 + LEFT, rh), (44, 48, 58, 255))
        d = ImageDraw.Draw(row)
        d.text((8, 8), LABEL[key], font=F, fill=(255, 255, 255, 255))
        d.text((8, 40), f"scale ×{rec['sizeFix']}", font=F, fill=(255, 255, 0, 255))
        foot, ox = up, LEFT
        for j, (lab, im, px, py) in enumerate(imgs):
            if j in (1, n + 1):
                ox += gap
            row.alpha_composite(im, (round(ox + left - px), round(foot - py)))
            i = (j - 1) % n
            head = '' if j == 0 else ('量不準' if str(i + 1) in rec['unreliable'] else
                                      f"頭 {(rec['before']['head'] if j <= n else rec['headAfter'])[i]:.2f}")
            color = (255, 255, 0, 255) if lab.startswith('改後') else (220, 220, 220, 255)
            d.text((ox + 4, 4), lab, font=FS, fill=color)
            d.text((ox + 4, 24), head, font=FS, fill=color)
            ox += cw
        d.line((LEFT, foot, row.width, foot), fill=(230, 70, 70, 255), width=2)
        top = foot - idle['frames'][0]['pivot'][1] * idle['scale'] * K
        for xx in range(LEFT, row.width, 10):
            d.line((xx, top, xx + 5, top), fill=(170, 170, 170, 255))
        rows.append(row)
        # 頭部並排：照量到的位置裁，同一個比例尺
        before, after = rec['before']['head'], rec['headAfter']
        cand = [i for i in range(n) if str(i + 1) not in rec['unreliable']]
        worst = max(cand, key=lambda i: abs(before[i] - 1))
        picks = [('待機', mix.texture(idle['texture']), idle['frames'][0], idle['scale'])]
        for i in sorted({0, worst}):
            picks.append((f'改前{i + 1}（{before[i]:.2f}）', old_tex, old['frames'][i], old['scale']))
        for i in sorted({0, worst}):
            picks.append((f'改後{i + 1}（{after[i]:.2f}）', new_tex, new['frames'][i], new['scale']))
        z = 2.0
        base = mix.idle_frame(hero, z)
        tpl = base[:round(base.shape[0] * mix.HEAD_CUT[hero])]
        tiles = []
        for lab, tex, f, sc in picks:
            arr = mix.frame_rgba(tex, f['rect'], sc, z)
            _, _, _, (bx, by, bw, bh) = mix.fit(tpl, arr)
            m = 16
            im = Image.fromarray(arr).crop((bx - m, by - m, bx + bw + m, by + bh + m))
            tile = Image.new('RGBA', (im.width, im.height + 26), (60, 64, 74, 255))
            tile.alpha_composite(im, (0, 26))
            ImageDraw.Draw(tile).text((4, 2), lab, font=FS, fill=(255, 255, 0, 255))
            tiles.append(tile)
        hr = Image.new('RGBA', (sum(t.width + 10 for t in tiles) + LEFT, max(t.height for t in tiles) + 10), (36, 40, 48, 255))
        ImageDraw.Draw(hr).text((8, 8), LABEL[key], font=F, fill=(255, 255, 255, 255))
        ox = LEFT
        for t in tiles:
            hr.alpha_composite(t, (ox, 5))
            ox += t.width + 10
        head_rows.append(hr)
    for out, parts in ((SHEET_OUT, rows), (HEADS_OUT, head_rows)):
        W = max(r.width for r in parts)
        S = Image.new('RGBA', (W, sum(r.height + 6 for r in parts)), (20, 20, 20, 255))
        y = 0
        for r in parts:
            S.alpha_composite(r, (0, y))
            y += r.height + 6
        out.parent.mkdir(parents=True, exist_ok=True)
        S.convert('RGB').save(out, optimize=True)
        print(out.relative_to(ROOT), S.size)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    m = sub.add_parser('measure')
    m.add_argument('actions', nargs='*', help='hero/action，不給就量全部六套')
    m.add_argument('--save-as', default='', help='把量到的倍率存進 measure.json 的這一欄（before＝改前）')
    sub.add_parser('apply')
    sub.add_parser('sheet')
    args = parser.parse_args()
    if args.command == 'measure':
        measure_cmd(args.actions, args.save_as)
    elif args.command == 'apply':
        apply()
    else:
        sheet()


if __name__ == '__main__':
    main()
