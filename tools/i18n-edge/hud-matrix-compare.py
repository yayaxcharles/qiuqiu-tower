# -*- coding: utf-8 -*-
"""狀態列矩陣前後對照：python hud-matrix-compare.py <資料夾> <語系> <畫面>
base 原本放得下的（沒掉出舞台、生命條不比自己的字窄）：修正後元素外框、類別要一模一樣，狀態列截圖像素要一致；
base 原本就壞的：列出修正後有沒有修好。"""
import json, sys
from pathlib import Path
from PIL import Image, ImageChops
import numpy as np

root = Path(sys.argv[1]); lang = sys.argv[2]; vp = sys.argv[3]
def load(tag):
    rows = {r['key']: r for r in json.load(open(root / f'hudm_{tag}_{lang}_{vp}.json', encoding='utf-8'))}
    for r in rows.values():   # 放不下＝右緣掉出舞台，或生命條比自己的字（加左右框線 4）窄
        r['broken'] = r['maxRight'] > 1281 or (r['hpW'] > 0 and r['hpW'] < r['need'] + 4)
    return rows


base = load('base')
after = load('after')
fit_same = fit_diff = 0
diffs = []
pix = []
for k, b in base.items():
    a = after[k]
    if b['broken']:
        continue
    same_struct = [k[1:] for k in b['kids']] == [k[1:] for k in a['kids']] and b['cls'] == a['cls']
    if same_struct:
        fit_same += 1
        if b['md5'] != a['md5']:
            ib = Image.open(root / f'hudm_base_{lang}_{vp}' / f'{k}.png').convert('RGB')
            ia = Image.open(root / f'hudm_after_{lang}_{vp}' / f'{k}.png').convert('RGB')
            d = np.asarray(ImageChops.difference(ib, ia)).astype(int).sum(axis=2)
            pix.append((k, int((d > 60).sum())))
    else:
        fit_diff += 1
        diffs.append((k, b['cls'], a['cls'], b['hpW'], a['hpW']))
broken = [k for k, b in base.items() if b['broken']]
fixed = [k for k in broken if not after[k]['broken']]
still = [k for k in broken if after[k]['broken']]
new_broken = [k for k, b in base.items() if not b['broken'] and after[k]['broken']]
print(f'{lang} {vp}: 狀態 {len(base)}｜base 原本放得下 {fit_same + fit_diff}：元素外框與類別一模一樣 {fit_same}、有變 {fit_diff}')
print(f'  外框一樣但截圖 md5 不同的 {len(pix)} 個，像素差(差值>60)最多 {max([p for _, p in pix], default=0)} 點')
print(f'  base 原本就壞 {len(broken)}：修好 {len(fixed)}、還壞 {len(still)}；原本放得下卻變壞 {len(new_broken)}')
for d in diffs[:12]:
    print('  有變', d)
for k in broken[:40]:
    b = base[k]; a = after[k]
    print('  壞→', k, f"base hp {b['hpW']}/{b['need']} 右緣 {b['maxRight']}", '→', f"after hp {a['hpW']}/{a['need']} 右緣 {a['maxRight']} {a['cls']}", '修好' if not a['broken'] else '還壞')
for k in still[:10]:
    print('  還壞', k)
