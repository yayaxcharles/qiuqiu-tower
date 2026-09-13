# -*- coding: utf-8 -*-
"""補菲菲剩下的 11 個姿勢，外加重畫一張氣勢（2026-09-14 深夜，使用者：「你能先檢查好先生圖的就先做吧」）。

`make_feifei_poses6_jobs.py` 當時留了 11 個「等玩起來覺得單調再說」。除錯模式的立繪頁
一打開就是四格灰底（翻肚、懶洋洋、炸毛、鐵布衫），使用者明天要逐張看立繪，
而生圖是最慢的那一段，所以先排下去。

她身上會出現的時機（都走 `combat.ts` 的 `idlePoseKey`／`cardPose`，有圖就自動用上，不用改程式）：

  belly/lazy/puff  身上掛著翻肚／懶洋洋／炸毛時的待機（現在退回掛彩圖）
  iron             鐵布衫的待機（現在退回站姿）
  dizzy            被定身的待機；戰利品畫面「牠自己散掉了」那張撲空圖
  eat              回血的牌、飯糰／貓草茶／小魚乾（現在退回施術）
  focus            能力牌（現在退回施術）
  scroll           會抽牌的技能牌
  roar/taiji/qinggong  共用牌裡吼、太極、輕功那三個家族（她打的是同一批牌號，只是牌名與圖分家）

**power 重畫的原因**：原稿的火焰是沒有外框的柔光，黃光一路暈進綠幕，
去背後整圈留螢光綠（量到 3856 個帶綠像素，其他 19 張都是 0）。
先試過整張壓綠重新去背——綠是沒了，但柔光邊變成兩萬八千個半透明的橄欖色像素，
戰場底圖一亮就髒。根治是**不要柔光**：改成貼著輪廓的一圈實心金邊，跟球球那張同一套。

每一條姿勢敘述都跟 `art_rules.py` 的硬規則掃過一次（`reference_mus_art_pipeline` 的教訓：
規則寫太死會跟姿勢打架），刻意避開的四個衝突：

  - 「耳朵永遠是兩個立著的三角形」→ 炸毛不寫「耳朵往後貼平」，改成耳朵僵直立起
  - 「眼睛永遠是藍的」→ 暈眩的漩渦眼寫成**藍色**漩渦；專心、吃東西不寫全閉，留一線藍
  - 「臉頰不可以鼓出耳朵的線」→ 吃飯糰不寫「塞滿嘴、臉頰鼓起來」（球球那版是這樣），改成小口咬
  - 「不可以膨脹」→ 炸毛只寫毛刺豎起來，明講輪廓變刺、不是變圓；翻肚寫小肚子、不下垂
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(r'F:\ClaudeWork\qiuqiu-coop')
sys.path.insert(0, str(ROOT / 'tools'))
from art_rules import FEIFEI_FACE_RIGHT, FOES, STYLE, feifei_look  # noqa: E402

POSES = {
    # ---- 身上掛著壞狀態時的待機 ----
    # 第一版躺得太開（尾巴拉直、身體攤平），進 560 寬的畫布只能整隻縮到七成，翻肚一掛上她就小一號。
    # 球球那張是縮成一團仰躺，所以改成「縮起來仰躺、尾巴捲回身邊、整體接近方形」
    'belly': ('rolled over onto her back in a COMPACT little heap: knees pulled up toward her chest and all '
              'four paws folded limply in the air above her small pale tummy, her tail curled back around '
              'beside her body (NOT stretched out behind her), her head at the right-hand side tipped back, '
              'blue eyes wide and worried with a bead of sweat, mouth a small nervous squiggle, the bow on '
              'her hair knocked a little crooked. Helpless and wide open. The whole pose is about as wide as '
              'it is tall. Her tummy is small and flat, not a round bulging belly'),
    'lazy': ('slouching with all her energy gone: shoulders dropped, arms dangling straight down, knees '
             'slightly bent, head lolling to one side, eyelids drooping heavily but her blue eyes still '
             'showing under them, mouth open in a big wide yawn with one paw raised loosely to cover it, '
             'her ponytail hanging limp. Sleepy and unmotivated'),
    'puff': ('startled with her fur standing on end: short spikes of fur bristling up along her back, arms '
             'and cheeks, her tail bristled out thick like a bottle brush, back arched, both ears standing '
             'rigidly straight up, blue eyes huge with tiny pupils, mouth a small round shocked "o", her '
             'ponytail sticking straight up. Her OUTLINE becomes SPIKY, not rounder - she is not inflated, '
             'only her fur stands up'),
    # ---- 好狀態：鐵布衫（跟 guard 的「縮起來擋」要分得開：這張是穩穩站著、一點都不怕） ----
    'iron': ('standing firm and immovable in a low wide stance, both arms folded tightly across her chest, '
             'chin raised, blue eyes narrowed calmly, a small confident closed-mouth smile, tail curled in '
             'tight against her legs. Her whole silhouette is edged with a thin SOLID warm-golden metallic '
             'rim, as if her fur had turned to bronze for a moment. Nothing is getting through - she is not '
             'scared and not flinching'),
    # ---- 定身；戰利品畫面「牠自己散掉了」也用這張 ----
    'dizzy': ('dazed and wobbly: standing with knees buckled and arms hanging loose, her head tilted, both '
              'eyes drawn as matching little BLUE spirals (this pose is the one exception to the round-pupil '
              'rule - both eyes are the same blue spiral), mouth a wavy line, three tiny solid yellow stars '
              'circling above her head, her ponytail drooping'),
    # ---- 出牌的招式家族 ----
    'eat': ('nibbling a white rice ball (onigiri) held daintily in both paws near her mouth, taking one small '
            'neat bite, blue eyes half-closed in contentment, a tiny solid golden sparkle of delight beside '
            'her head. Her cheeks stay neat - she is taking a small bite, not stuffing her face'),
    'focus': ('gathering inner power: standing straight and still, both paws pressed together in a ninja '
              'hand seal in front of her chest with one needle held upright between them, eyelids lowered '
              'calmly with a sliver of blue showing, a small ring of solid warm-golden sparkles around her, '
              'her ponytail lifting slightly'),
    'scroll': ('reading a secret scroll: holding a partly unrolled paper scroll open with both paws at chest '
               'height, studying it closely with narrowed blue eyes and one eyebrow raised, tail curled up '
               'with curiosity. The written side of the scroll faces HER, so we only see the plain cream '
               'back of the paper - no writing, no letters, no symbols visible to us'),
    'roar': ('planted with her feet apart, leaning forward, one paw cupped beside her open mouth as she '
             'shouts sharply toward the right, blue eyes narrowed fiercely, whiskers and ponytail blown '
             'backward by her own shout. Three bold curved sound arcs ripple out in front of her mouth '
             'toward the right, drawn as simple thick solid cream-white arcs'),
    'taiji': ('standing in a calm, rooted tai-chi stance, knees softly bent and weight settled low, both paws '
              'held out in a slow circular push - one paw high near her chest with the pad facing outward, '
              'the other low by her waist, as if turning a big invisible ball between them. Blue eyes '
              'half-closed and serene, mouth a small calm line. One broad circular motion arc sweeps around '
              'her paws, drawn as a single thin SOLID cream-white ring. Nothing tense, nothing fast - the '
              'opposite of a throw'),
    'qinggong': ('caught mid-leap, weightless, high off the ground - body stretched upward and slightly '
                 'forward, one back paw pointed daintily down with only the very toe-tip touching down, the '
                 'other leg tucked up, front paws spread for balance, tail and ponytail streaming out behind '
                 'her. Blue eyes bright and focused, a small confident smile. Two or three tiny solid cream '
                 'puffs below her toe where she barely touched down. She must read as LIGHT and airborne, '
                 'not as a charging attack'),
    # ---- 重畫：原稿的柔光火焰去背後留一圈螢光綠（見檔頭） ----
    'power': ('fierce and powered-up: planted in a low stance with both fists clenched, blue eyes narrowed, '
              'eight needles hovering in a neat ring behind her back with their points outward. Her whole '
              'silhouette is edged with a thin, bright, SOLID warm-golden rim that hugs her outline with a '
              'crisp hard edge, like a gold outline around her. NO flames, NO big aura, NO soft blurry glow '
              'fading out into the background, nothing yellow-green'),
}

FRAMING_DEFAULT = ("\n\nFull body. " + FEIFEI_FACE_RIGHT.rstrip()
                   + " Feet at the very bottom edge of the picture, do not draw her floating. "
                     "Fill the frame vertically.")
FRAMING = {
    # 仰躺就沒有「腳貼底邊」可言：整個身體橫躺在底邊（同 poses6 的 down）
    'belly': ("\n\nFull body lying on her back on the ground, curled up compactly in the middle of the frame, "
              "resting on the very bottom edge and filling the frame about as much vertically as horizontally. "
              "Her head is at the RIGHT side and her face is angled toward the RIGHT edge, never toward the left."),
    # 騰空：只有腳尖碰到底邊，不能寫「雙腳貼底」
    'qinggong': ("\n\nFull body in the air. " + FEIFEI_FACE_RIGHT.rstrip()
                 + " Only the tip of her lowest toe touches the very bottom edge of the picture. "
                   "Fill the frame vertically."),
}

jobs = {}
for pose, text in POSES.items():
    fid = f'hero_feifei_{pose}.png'
    jobs[fid] = (
        feifei_look() + "\n\nPose: " + text + FRAMING.get(pose, FRAMING_DEFAULT) +
        "\nKeep the exact same character design AND the same right-facing three-quarter angle as the "
        "reference image (both halves of it face right) - only the pose and expression differ. "
        "There is exactly ONE character in the picture: no second cat, nobody else.\n"
        "Draw everything SOLID and OPAQUE. Nothing else in the picture: no ground line, no shadow, no "
        "scenery, no text, no letters, no watermark, no border.\n"
        + FOES + STYLE +
        f"\nOutput 896x896 PNG. Save the image as {fid} in the current directory and report the path.")

# `--only belly power`：只重開這幾張（2026-09-14 翻肚那張太寬、重生一次用）。
# 輸出另存一份檔名帶姿勢的工單，不蓋掉整批那份
only = sys.argv[sys.argv.index('--only') + 1:] if '--only' in sys.argv else list(POSES)
jobs = {k: v for k, v in jobs.items() if k[len('hero_feifei_'):-len('.png')] in only}

# 自檢要能中止（art_rules 第九個雷）：要重開的那幾張舊稿還在，codex_gen 會直接跳過、整張空轉
for fid in jobs:
    old = ROOT / 'tools/codex_raw' / fid
    if old.exists():
        raise SystemExit(f'{old.name} 還在：先改名留底（例如 {old.stem}.v1.png），不然 codex_gen 會直接跳過它')

name = 'feifei_poses12.json' if only == list(POSES) else f"feifei_poses12_{'_'.join(only)}.json"
out = ROOT / 'tools/codex_jobs' / name
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{len(jobs)} 張 → {out.name}：{only}')
