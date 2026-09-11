# -*- coding: utf-8 -*-
"""把「描述不出動作」的那幾張結果圖補上具體畫面。

稽核 2026-09-11 低-3 指出：有幾張的結果文字是純牌組操作或心理描寫
（「把兩招硬留著的都放下了」「強練留下的虛耗沉在胸口」「把最近學過的招式想了一遍」），
模型只能照著畫一張跟原圖差不多的圖，等於白花額度。

作法：在結果文字後面補一句**看得見的動作**，不改遊戲裡的文案（那是玩家讀的），
只改生圖用的提示詞。
"""
import json
import pathlib

ROOT = pathlib.Path(r'F:\ClaudeWork\qiuqiu-tower')
p = ROOT / 'tools/codex_jobs/event_result_art.json'
d = json.loads(p.read_text(encoding='utf-8'))

# 檔名 → 要補的具體畫面（接在結果文字後面）
EXTRA = {
    'event_old_master_ghost_r1.png':
        ' Show this as: the ninja cat has lowered both paws and stepped back, and TWO glowing '
        'paper move-scrolls are drifting up and away from him, already fading at the edges. '
        'The ghostly master watches without moving.',
    'event_grindstone_r0.png':
        ' Show this as: the ninja cat kneels back on his heels beside the worn grindstone, one paw '
        'pressed to his own chest, shoulders sagging with effort, while three finished blades lie '
        'lined up on the stone in front of him and a faint haze of stone dust still hangs in the air.',
    'event_sunbath_r1.png':
        ' Show this as: the ninja cat lies on his back in the warm patch of sun with all four paws in '
        'the air, eyes half closed, and a single glowing paper move-scroll floats just above his nose '
        'as he turns it over in his mind.',
    'event_greedy_merchant_r1.png':
        ' Show this as: the bespectacled grey cat merchant holds out a relic in one paw while his other '
        'paw draws a thin thread of pale light out of the ninja cat, who has staggered half a step back '
        'with one paw clutched to his chest, off balance.',
    'event_moon_window_r1.png':
        ' Show this as: the ninja cat sits at the round window with his back to us, tail curled loosely '
        'around his paws and shoulders visibly dropped and relaxed, the full moon large in front of him '
        'and a long silver beam of moonlight falling across him and the empty bowl on the sill.',
}

n = 0
for name, extra in EXTRA.items():
    if name not in d:
        print(f'  ⚠ 工單裡沒有 {name}')
        continue
    prompt = d[name]['prompt']
    marker = '\n\n**WHO DOES WHAT**'
    if extra.strip() in prompt:
        print(f'  {name} 已經補過了')
        continue
    assert marker in prompt, name
    d[name]['prompt'] = prompt.replace(marker, extra + marker, 1)
    n += 1

p.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'補了 {n} 張的具體動作')

# 這幾張要單獨重跑（正在跑的那支已經把舊工單讀進記憶體了）
redo = {k: d[k] for k in EXTRA if k in d}
(ROOT / 'tools/codex_jobs/event_result_redo.json').write_text(
    json.dumps(redo, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'重生工單：tools/codex_jobs/event_result_redo.json（{len(redo)} 張）')
print('  等主批跑完、把這幾張的舊稿改名之後再跑這一支')
