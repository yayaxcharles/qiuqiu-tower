"""美術方向試作：用 Codex 的生圖（image 2.5）產幾張方向稿，只存在暫存區，不碰遊戲素材。"""
import subprocess, sys, time
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
OUT = Path(__file__).resolve().parent / 'trials'
OUT.mkdir(exist_ok=True)

共同 = ('Art style: cosy cartoon game, thick dark outlines, flat colours with soft cel shading, warm and hand-made, '
       'never sleek or photoreal. ')
卡牌共同 = ('Full design mock-up of ONE playing card for a Chinese-martial-arts cat deck-building game, portrait 2:3, '
          'shown flat and centred on a plain dark grey background. The card shows a cute grey tabby cat ninja with a blue '
          'headband swinging its claws. Layout from top to bottom: a round cost badge in the top-left corner with the '
          'number 1; a large illustration window taking the upper 55% of the card; a name banner with the Chinese name '
          '「貓抓」; a rules-text plaque with the Chinese text 「造成 6 點傷害。」; a thin ribbon at the bottom with 「攻擊」. '
          'Chinese characters must be correct and crisp. ')
工單 = {
    'card_A_lacquer.png': 卡牌共同 + (
        'Direction A — LACQUER & GOLD: deep vermilion lacquered wooden frame with brass corner studs and a thin gold '
        'inner line; the illustration sits on a painted backdrop of a misty ink-wash mountain pagoda in warm dusk light, '
        'fully filling the window; name banner is a red-and-gold cloth banner with knotted tassels; the rules plaque is '
        'aged cream washi paper with a soft inner shadow; bottom ribbon is dark red with gold characters. Rich, premium, '
        'collectible feel. ' + 共同),
    'card_B_washi.png': 卡牌共同 + (
        'Direction B — WASHI & INK: the whole card is textured cream washi paper with a hand-drawn black ink border, '
        'subtle brush-stroke corners; the illustration backdrop is a light ink-wash bamboo grove with a red sun; the name '
        'is written in bold brush calligraphy over a splash of ink; the rules text sits in a plain paper area with a faint '
        'grid of paper fibres; a small red square seal stamp near the bottom-right marks rarity; bottom ribbon is an ink '
        'brush stroke with white characters. Elegant, calm, storybook feel. ' + 共同),
    'bg_bamboo_corridor.png': (
        'Background painting for a 2D cat-ninja card game battle scene, landscape 16:9, no characters at all. '
        'Inside a tall wooden pagoda tower at night: a long corridor of dark timber pillars, paper lanterns glowing warm '
        'orange, a huge round window on the back wall showing a full moon and bamboo leaves, thin mist on the floor, '
        'soft shafts of moonlight, a few floating dust motes. Strong depth: pillars nearer the camera are larger and '
        'darker, the far end fades into blue haze. The lower 35% of the image is an empty flat wooden floor where '
        'characters will stand, kept clean of props. Composition centred, eye level, slight low angle. ' + 共同),
    'bg_rooftop_storm.png': (
        'Background painting for a 2D cat-ninja card game battle scene, landscape 16:9, no characters at all. '
        'The tiled rooftop of a pagoda at dusk during a gathering thunderstorm: curved dark roof tiles, a carved stone '
        'railing, purple-grey storm clouds with a crack of lightning far away, banners whipping in the wind, a few '
        'maple leaves blowing across. Dramatic rim light from the orange horizon on the left. The lower 35% of the image '
        'is an empty flat roof-ridge walkway where characters will stand, kept clean. Strong atmosphere and depth. ' + 共同),
    'buttons_sheet.png': (
        'UI asset sheet for a cosy cartoon cat-ninja game, on a plain dark grey background: three rows of rounded '
        'rectangular buttons, each row showing the same button in three states side by side (normal, hovered-glowing, '
        'pressed-darker). Row 1: dark walnut wood plank button with brass rivets at the corners. Row 2: red lacquer '
        'button with a thin gold edge. Row 3: aged parchment button with a stitched leather border. All buttons are '
        'EMPTY (no text, no icons) so the game can write labels on them, with a clear flat centre area that can be '
        'stretched. ' + 共同),
}
for 名, 提示 in 工單.items():
    出 = OUT / 名
    if 出.exists():
        print('已有', 名); continue
    t = time.time()
    大小 = '1536x1024' if 名.startswith('bg_') or 名.startswith('buttons') else '1024x1536'
    cmd = [sys.executable, str(IMAGE_GEN), 'generate', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
           '--size', 大小, '--quality', 'high', '--prompt', 提示, '--out', str(出), '--force']
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(名, 'ok' if r.returncode == 0 and 出.exists() else '失敗 ' + (r.stderr or r.stdout)[-400:], f'{time.time() - t:.0f} 秒', flush=True)
