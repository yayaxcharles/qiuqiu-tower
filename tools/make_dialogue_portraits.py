"""對白頭像換成新畫風（2026-09-22）。

對白疊層左上方那隻說話的貓，原本用的是舊版靜態全身立繪（`hero/ninja` 那一批）。
戰鬥裡四隻貓已經全是新版逐格動作，對白一跳出來就換回舊畫風，同一個畫面兩種長相。

**不生圖**：直接從新版待機動作圖集裁出第 1 格（`src/ui/<角色>-motion-data.json` 的
`actions.idle.frames[0].rect`），外圍多留幾個像素的透明邊（反鋸齒那一圈不能切掉），
存成 `public/assets/sprites/hero/<代號>_portrait.webp`，併進 `manifest.json` 的 sprites。

朝向不翻：舊立繪跟新待機都是面向右，頭像站在畫面左邊、臉朝著對白與畫面中央，正好是對的。
大小不用改樣式：對白框裡的頭像框高 290（`screens.css` 的 `.dialogue-overlay .dialogue-portrait`），
等比縮進去之後新圖站出來約 280 高，跟舊立繪（四周留透明、站出來約 285）差不多。

用法：
    python tools/make_dialogue_portraits.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_idle_state_art import IDLE_DATA, SPRITE_KEY  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'public/assets/manifest.json'
MARGIN = 6          # 待機格的 rect 是 alpha > 16 的外框，再外面還有一圈淡淡的反鋸齒
QUALITY = 92        # 有損但高品質；透明度另外無損存（alpha_quality=100），貓的邊緣不會糊


def crop_idle(hero: str) -> Image.Image:
    data = json.loads((ROOT / IDLE_DATA[hero]).read_text(encoding='utf-8'))['actions']['idle']
    x, y, w, h = data['frames'][0]['rect']
    texture = Image.open(ROOT / 'public' / data['texture']).convert('RGBA')
    box = (max(0, x - MARGIN), max(0, y - MARGIN), min(texture.width, x + w + MARGIN), min(texture.height, y + h + MARGIN))
    crop = np.array(texture.crop(box))
    # 多留的那一圈只能有反鋸齒（alpha ≤ 16），不能混進隔壁格的貓
    inner = np.zeros(crop.shape[:2], bool)
    inner[y - box[1]:y - box[1] + h, x - box[0]:x - box[0] + w] = True
    stray = (crop[..., 3] > 16) & ~inner
    if stray.any():
        raise SystemExit(f'{hero}: 裁切外框多留的邊裡有隔壁格的像素（{int(stray.sum())} 點），把 MARGIN 調小')
    crop[crop[..., 3] == 0, :3] = 0
    return Image.fromarray(crop, 'RGBA')


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for hero, key in SPRITE_KEY.items():
        image = crop_idle(hero)
        rel = f'assets/sprites/hero/{key}_portrait.webp'
        target = ROOT / 'public' / rel
        image.save(target, 'WEBP', quality=QUALITY, alpha_quality=100, method=6)
        back = np.array(Image.open(target).convert('RGBA'))
        if not np.array_equal(back[..., 3], np.array(image)[..., 3]):
            raise SystemExit(f'{hero}: 存檔後透明度跟原圖不一樣')
        manifest['sprites'][f'hero/{key}_portrait'] = rel
        print(f'{hero}: {image.size[0]}×{image.size[1]}，{target.stat().st_size / 1000:.1f} KB → {rel}')
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('manifest.json 已併入')


if __name__ == '__main__':
    main()
