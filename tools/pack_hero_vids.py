#!/usr/bin/env python3
"""
把 Google Vids／Flow Omni 生的主角動作片，裁成爪破魔塔主角用的逐格圖集。
2026-09-28 球球試做；2026-09-29 擴到四位（菲菲、噹噹、封封照同一套，規劃見
qiuqiu-side/docs/2026-09-28_爪破主角Vids動作規劃.md，挑片見 qiuqiu-side/vids/flow/清單.md 最後的總結）。

來源（唯讀）：F:/ClaudeWork/qiuqiu-side/vids/ 底下的 mp4（1280×720、每秒 24 格、綠幕）。

輸出（每位主角）：
  public/assets/motion/hero-vids/<主角>-<片>-d.webp   電腦版圖集（每秒 24 格）
  public/assets/motion/hero-vids/<主角>-<片>-m.webp   手機版圖集（每秒 12 格、解析度低一點）
  src/ui/hero-vids/<主角>.json                        格子資料（動態載入，不進開場程式；見 hero-vids.ts）

節奏：每個動作的總長＝現在那個動作的總長，命中（或出手）那一格落在現在寫死的命中時間上，
  所以程式端的時間表一個都不用改、回合不會變長。時間用「原速」寫（跟舊資料一樣），
  載入時照舊經 `speedUpMotions` 加快 1.5 倍（跑步、挨打不加速）。舊資料的 impactTimes／releaseTimes 原樣抄過來，
  打包時檢查每個命中／出手時間都剛好是某一個關鍵格的時間（對不上就停下來，不產生檔案）。

大小（2026-09-29 起照頭不照外框）：每支片第一格（＝開始影格，就是參考立繪）先照站高粗估，
  再用畫面比對閘門的量頭工具（tools/visual-gate/head_measure.py）拿舊待機第 1 格的頭去比，換算成「頭一樣大」。
  同一張參考圖生的片（ref 相同）取中位數，所以同一位主角各動作不會忽大忽小；球球 09-28 試做那 5 支 Vids 片
  各自構圖不同，各自量。
腳底：整支片用第一格的實心腳底當基準（原地動作）。

用法：python tools/pack_hero_vids.py [主角…]   （不給就四位全做）
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "src" / "ui"
VIDS = Path("F:/ClaudeWork/qiuqiu-side/vids")
OUT_IMG = ROOT / "public" / "assets" / "motion" / "hero-vids"
OUT_DATA = UI / "hero-vids"
HEAD_TOOL = ROOT / "tools" / "visual-gate" / "head_measure.py"

MOTION_SPEED = 1.5
UNSCALED = {"run", "hurt"}   # 跑步（motion-speed.ts 的 UNSCALED_ACTIONS）、挨打（比照 hit-recoil-motion.ts 停 0.65 秒）不加速
HURT_TOTAL = 0.65
QUALITY = 80
MAX_W = 4096
VARIANTS = {
    # 圖集放大倍數＝圖集 1 像素對畫面幾分之一 CSS 像素；電腦 1.6 倍（跟舊圖集差不多細），手機 1.2 倍
    "desktop": {"fps": 24, "over": 1.6, "suffix": "d"},
    "mobile": {"fps": 12, "over": 1.2, "suffix": "m"},
}

"""
每位主角：
  old      舊動作資料檔（量大小的舊待機、抄命中時間、核對總長都從這裡來）
  gate     畫面比對閘門用的主角代號（head_measure 的 HEAD_CUT）
  clips    片代號 → (來源路徑（相對 VIDS，不含 .mp4）, 參考圖分組, 只留最大一塊[, "deshadow"＝去掉片子自己畫的暗綠影子]
           [, ("measureAt", 第幾格)＝量大小用這一格，不用第 0 格])
           「只留最大一塊」＝去綠底後只留跟身體連在一起的那一塊：清單標「合格（後製去特效）」與有飛出去的小東西的片
  actions  keys＝[(來源第幾格, 原速秒數)…]：第一個是起點（0 秒），最後一個是收尾（＝現在那個動作的總長），
           中間的是命中／出手那一格要落在的時間。每一段各自均分，所以中間那格一定剛好在那個時間開始。
           run 用 loop＝(找循環的起格, 迄格, 一圈最少格, 最多格)、cycle＝一圈幾秒。
  hits     舊資料沒寫、寫死在程式裡的命中時間（毫秒，原速），一樣要對準關鍵格
"""
HEROES: dict[str, dict] = {
    "qiuqiu": {
        "gate": "ninja",
        "old": ["qiuqiu-motion-data.json", "qiuqiu-extra-motion-data.json", "qiuqiu-attack-motion-data.json"],
        "clips": {
            "kick": ("flow/爪破/球球/踢腿_omni_v1", "omni", False),
            "eat": ("flow/爪破/球球/吃飯糰_omni_v1", "omni", False),
            "taiji": ("flow/爪破/球球/太極_omni_v1", "omni", False),
            "shuriken": ("flow/爪破/球球/手裏劍_omni_v3", "omni", False),
            # 09-28 試做：橫向捲軸用 Google Vids 生的片（各自構圖，各自量）
            "claw": ("揮爪_v2a", "claw", False),
            "clawb": ("貓抓B_flow_omni_v1", "omni", False),
            "toss": ("前投空手_v1", "toss", False),
            "hurt": ("受傷_v1", "hurt", True),
            "defeat": ("倒下_v1", "defeat", True),
            "run": ("跑步_v1", "run", False),
            # 09-29：Flow Omni 4 秒片，開始影格＝球球參考圖（跟貓抓 B 同一張）
            "seal": ("flow/爪破/球球/結印_omni_v2", "omni", False),
            "guard": ("flow/爪破/球球/防禦_omni_v1", "omni", False),
            "win": ("flow/爪破/球球/勝利_omni_v1", "omni", True),      # 第 44～48 格落地淡塵土，只留最大一塊
            "focus": ("flow/爪破/球球/凝神_omni_v1", "omni", False),
            "dash": ("flow/爪破/球球/突進_omni_v2", "omni", False),
        },
        "hits": {"attack1": [70], "attack2": [90], "attack3": [100], "attack4": [160], "dash": [60]},
        "actions": {
            "kick": {"clip": "kick", "keys": [(22, 0), (52, 0.30), (76, 0.58)]},
            "eat": {"clip": "eat", "keys": [(8, 0), (30, 0.3), (80, 0.85), (95, 1.0)]},
            "taiji": {"clip": "taiji", "keys": [(22, 0), (46, 0.4), (74, 0.8)]},
            "shuriken": {"clip": "shuriken", "keys": [(16, 0), (44, 0.28), (60, 0.5), (80, 0.7)]},
            # 貓抓 A：揮爪_v2a 第 30 格＝爪痕最大；attack1 現在 0.30 秒、命中 70 毫秒
            # 收尾兩格接到第 72 格（退回架式），不然停在撲出去的姿勢、接回待機會一格跳回來
            "attack1": {"clip": "claw", "keys": [(18, 0), (30, 0.07), (46, 0.18), (72, 0.30)]},
            # attack3 同一支片、起手拉長一點：0.42 秒、命中 100 毫秒
            "attack3": {"clip": "claw", "keys": [(12, 0), (30, 0.10), (48, 0.28), (72, 0.42)]},
            # 貓抓 B：第 36 格＝爪痕在身前最大；attack2 0.34 秒、命中 90；attack4 0.52 秒、命中 160
            "attack2": {"clip": "clawb", "keys": [(24, 0), (36, 0.09), (44, 0.2), (60, 0.34)]},
            "attack4": {"clip": "clawb", "keys": [(18, 0), (36, 0.16), (46, 0.34), (62, 0.52)]},
            # 空手擲：第 34 格出手；現在 0.71 秒、出手 240、命中 410 毫秒
            "toss": {"clip": "toss", "keys": [(14, 0), (34, 0.24), (48, 0.52), (66, 0.71)]},
            # 挨打（使用者 09-28：換影片版）：第 4～8 格有飛進來的苦無，只留身體那一塊
            "hurt": {"clip": "hurt", "keys": [(5, 0), (9, 0.1), (20, 0.45), (28, 0.65)]},
            # 倒下：第 0～12 格是打過來的爆炸星，從第 13 格開始
            "defeat": {"clip": "defeat", "keys": [(13, 0), (66, 0.8), (80, 1.05)]},
            "run": {"clip": "run", "loop": (14, 95, 10, 26), "cycle": 0.48},
            # 結印（0.48 秒）：第 12～19 格多一個小直拳，從第 20 格雙手往胸前收開始；第 28 格起合掌到片尾。
            # 分身（clone_duo／ultimate_clone）會停在原速 280～300 毫秒那格，落在合掌段
            "seal": {"clip": "seal", "keys": [(20, 0), (28, 0.12), (60, 0.36), (88, 0.48)]},
            # 防禦（0.68 秒，播完停在最後一格）：第 12～18 格是一記直拳，從第 20 格雙臂上舉開始，第 24～58 格護臉
            "guard": {"clip": "guard", "keys": [(20, 0), (24, 0.1), (50, 0.68)]},
            # 勝利（1.18 秒，停在最後一格）：第 16～21 格蹲、第 22～25 格起跳伸直（外框每格高 5～7%）、第 26～43 格在空中、
            # 第 48 格落地、第 52 格起擺姿勢。起跳那段一格都不跳（原本跳著取，一格就高 20%）；
            # 第 44～47 格腳下的淡塵土貼著腳（只留最大一塊也去不掉），關鍵格挑成直接從第 43 格跳到第 48 格
            "win": {"clip": "win", "keys": [(16, 0), (20, 0.12), (26, 0.495), (43, 0.8), (48, 0.86), (60, 1.18)]},
            # 凝神（0.8 秒）：第 12～24 格閉眼、第 24 格起站直閉眼雙手下收
            "focus": {"clip": "focus", "keys": [(8, 0), (30, 0.35), (56, 0.8)]},
            # 衝刺（0.42 秒、命中 60）：第 30～40 格拳頭打到最遠；程式負責往前衝
            "dash": {"clip": "dash", "keys": [(22, 0), (31, 0.06), (44, 0.25), (56, 0.42)]},
        },
    },
    "feifei": {
        "gate": "feifei",
        "old": ["feifei-motion-data.json"],
        "clips": {
            "guard": ("flow/爪破/菲菲/防禦_omni_v3", "idle", False),   # v3：雙腳全程貼地（v1 第 16～40 格離地小跳）
            "kick": ("flow/爪破/菲菲/踢腿_omni_v1", "idle", False),
            "eat": ("flow/爪破/菲菲/吃飯糰_omni_v1", "idle", False),
            "roll": ("flow/爪破/菲菲/打滾_omni_v1", "idle", False),
            "shuriken": ("flow/爪破/菲菲/彈針_omni_v1", "idle", True),   # 第 34～39 格片子自己畫了一根飛出去的針，只留身體
            "seal": ("flow/爪破/菲菲/結印_omni_v1", "idle", False),
            # 防禦_omni_v1 第 16～40 格整隻離地「往後小跳」，遊戲裡像原地跳（使用者 09-29）：暫用舊圖，等 v2（不離地）
            "claw": ("flow/爪破/菲菲/爪擊_omni_v1", "idle", False),
            "win": ("flow/爪破/菲菲/勝利_omni_v3", "idle", False),
            "hurt": ("flow/爪破/菲菲/挨打_omni_v2", "idle", True),      # 第 25～32 格有白色衝擊光，從第 33 格開始用
            "run": ("flow/爪破/菲菲/跑_omni_v4", "idle", False),
            # 09-29 重生：第 37～43 格片子自己畫了一根飛出去的針（跟身體分開），只留最大一塊
            "toss": ("flow/爪破/菲菲/空手擲_omni_v5", "idle", True),
            "defeat": ("flow/爪破/菲菲/倒下_omni_v2", "idle", False),
        },
        # 爪擊的命中寫死在 companion-motion.ts（companionImpactTimes：原速 340）
        "hits": {"attack1": [340]},
        "actions": {
            "guard": {"clip": "guard", "keys": [(20, 0), (30, 0.15), (64, 0.5), (84, 0.72)]},
            "kick": {"clip": "kick", "keys": [(22, 0), (52, 0.30), (84, 0.70)]},
            "eat": {"clip": "eat", "keys": [(4, 0), (30, 0.3), (80, 0.8), (95, 1.02)]},
            "roll": {"clip": "roll", "keys": [(22, 0), (40, 0.15), (76, 0.4), (92, 0.525)]},
            # 彈針（0.70 秒、出手 285）：第 24～30 格手往後收、第 33～35 格手腕前彈（手上捏著片子自己畫的針），
            # 第 36 格手伸直、針已經不在手上 → 出手那格用第 36 格，飛出去的針交給程式畫
            # originAt：飛針從這一格手指尖放出去（換了圖，feifei-needle-patterns.ts 量舊圖的出手點就不準了）
            "shuriken": {"clip": "shuriken", "keys": [(20, 0), (36, 0.285), (44, 0.5), (56, 0.70)], "originAt": 36},
            # 結印（0.89 秒）：第 28～50 格兩指立在胸前、抬腳；分身停在原速 170 毫秒那格（＝第 28 格）
            "seal": {"clip": "seal", "keys": [(16, 0), (28, 0.17), (50, 0.7), (62, 0.89)]},
            # 防禦（0.72 秒）：第 16～40 格往後小跳縮身護臉，第 48 格落回架式
            # 爪擊（0.75 秒、命中 340）：第 22～36 格前抓，第 24 格爪子伸到最前
            "attack1": {"clip": "claw", "keys": [(12, 0), (24, 0.34), (40, 0.55), (52, 0.75)]},
            # 勝利（1.22 秒，停在最後一格）：第 12～24 格跳、第 36～50 格揮手、第 54 格瞇眼笑的姿勢
            "win": {"clip": "win", "keys": [(10, 0), (24, 0.3), (44, 0.75), (54, 1.22)]},
            # 挨打（0.65 秒、不加速）：從第 24 格站姿開始（直接從第 33 格後仰開始，第一格就跳 60 多像素）；
            # 第 27～28 格衝擊光貼著手去不掉，關鍵格挑成第 26 格直接接第 29 格；第 29～32 格的碎光只留最大一塊就不見
            "hurt": {"clip": "hurt", "keys": [(24, 0), (26, 0.08), (29, 0.1), (36, 0.22), (50, 0.45), (60, 0.65)]},
            # 空手擲（0.71 秒、出手 240、命中 410）：第 16～35 格手拉到耳邊、第 36 格手往前伸、針剛離手（片子畫的針已去掉，
            # 飛出去的東西交給程式畫）；出手點照舊用 projectile-flight.ts 的 TOSS_ORIGIN
            "toss": {"clip": "toss", "keys": [(14, 0), (28, 0.16), (36, 0.24), (48, 0.45), (64, 0.71)]},
            # 倒下（1.18 秒，09-29 重生 v2）：第 0～70 格慢慢往後退太長，從第 60 格開始；第 71～80 格往後（背對敵人）倒、
            # 之後頭朝左縮著躺。退了幾步，腳底定位改用第 60 格（anchor），不然第一格就往左跳
            "defeat": {"clip": "defeat", "keys": [(60, 0), (71, 0.3), (80, 0.6), (92, 1.18)], "anchor": 60, "clamp": True},
            "run": {"clip": "run", "loop": (20, 72, 14, 26), "cycle": 0.48},
        },
    },
    "dangdang": {
        "gate": "dangdang",
        "old": ["dangdang-motion-data.json", "dangdang-attack-motion-data.json"],
        "clips": {
            "toss": ("flow/爪破/噹噹/丟東西_omni_v1", "idle", False),
            "dodge": ("flow/爪破/噹噹/閃避_omni_v1", "idle", False),
            "counter": ("flow/爪破/噹噹/反擊_omni_v1", "idle", False),
            "eat": ("flow/爪破/噹噹/吃飯糰_omni_v3", "idle", False),
            "kick": ("flow/爪破/噹噹/踢腿_omni_v1", "idle", False),
            "rapid": ("flow/爪破/噹噹/連打_omni_v2", "idle", False),
            "guard": ("flow/爪破/噹噹/防禦_omni_v2", "idle", False),
            "punch": ("flow/爪破/噹噹/正拳_omni_v2", "idle", False),
            "focus": ("flow/爪破/噹噹/凝神_omni_v1", "idle", False),
            "palm": ("flow/爪破/噹噹/推掌_omni_v2", "idle", False),
            "win": ("flow/爪破/噹噹/勝利_omni_v1", "idle", False),
            "shoulder": ("flow/爪破/噹噹/肩撞_omni_v1", "idle", False),
            "hurt": ("flow/爪破/噹噹/挨打_omni_v3", "idle", False),
            # 第 56～72 格身旁細弧線（只留最大一塊）；身下一片暗綠色影子貼著身體（deshadow：偏綠的半透明一律去掉）
            "defeat": ("flow/爪破/噹噹/倒下_omni_v3", "idle", True, "deshadow"),
            "run": ("flow/爪破/噹噹/跑_omni_v2", "idle", False),
        },
        "hits": {},
        "actions": {
            "toss": {"clip": "toss", "keys": [(14, 0), (40, 0.16), (54, 0.24), (64, 0.41), (88, 0.71)]},
            "dodge": {"clip": "dodge", "keys": [(22, 0), (44, 0.25), (60, 0.42), (80, 0.615)]},
            "counter": {"clip": "counter", "keys": [(14, 0), (30, 0.2), (56, 0.36), (72, 0.55), (92, 0.8)]},
            "eat": {"clip": "eat", "keys": [(4, 0), (30, 0.3), (80, 0.8), (95, 1.02)]},
            "kick": {"clip": "kick", "keys": [(22, 0), (52, 0.30), (84, 0.72)]},
            "rapid_combo": {"clip": "rapid", "keys": [(6, 0), (16, 0.22), (36, 0.46), (54, 0.70), (92, 1.0)]},
            # 防禦（0.76 秒）：第 20～31 格手先往前伸，從第 28 格開始；第 33～72 格雙臂護架頂住
            "guard": {"clip": "guard", "keys": [(28, 0), (34, 0.15), (60, 0.76)]},
            # 正拳（0.74 秒、命中 300）：第 26～47 格右直拳打出去
            "punch": {"clip": "punch", "keys": [(18, 0), (28, 0.3), (46, 0.5), (60, 0.74)]},
            # 凝神（0.96 秒）：第 24～70 格下馬步閉眼
            "focus": {"clip": "focus", "keys": [(8, 0), (26, 0.35), (56, 0.96)]},
            # 推掌（0.78 秒、命中 340）：第 30～59 格雙掌推出
            "palm": {"clip": "palm", "keys": [(20, 0), (32, 0.34), (56, 0.55), (66, 0.78)]},
            # 勝利（1.22 秒，停在最後一格）：第 30～60 格雙拳高舉秀肌肉
            "win": {"clip": "win", "keys": [(16, 0), (34, 0.4), (58, 1.22)]},
            # 肩撞（0.82 秒、命中 360）：第 44～58 格壓肩前衝；第 36～40 格背心有一塊亮綠色（去背會破洞），整段跳過
            "shoulder": {"clip": "shoulder", "keys": [(26, 0), (34, 0.12), (44, 0.2), (50, 0.36), (62, 0.6), (70, 0.82)]},
            # 挨打（0.65 秒、不加速）：第 12～44 格後仰，第 46 格起站回
            "hurt": {"clip": "hurt", "keys": [(12, 0), (20, 0.12), (40, 0.45), (52, 0.65)]},
            # 倒下（1.18 秒）：第 54～72 格倒下、第 74 格起躺平
            "defeat": {"clip": "defeat", "keys": [(46, 0), (60, 0.35), (76, 0.8), (86, 1.18)]},
            # 跑：第 34～47 格靠鏡頭那隻手在前停太久（中間少換一次手），循環改在第 56 格以後找（第 58、69、77 格兩腳交錯時換手）
            "run": {"clip": "run", "loop": (56, 84, 18, 24), "cycle": 0.48},
        },
    },
    "fengfeng": {
        "gate": "fengfeng",
        "old": ["fengfeng-motion-data.json", "fengfeng-attack-motion-data.json"],
        "clips": {
            "toss": ("flow/爪破/封封/丟東西_omni_v1", "idle", False),
            "dodge": ("flow/爪破/封封/閃避_omni_v1", "idle", False),
            "eat": ("flow/爪破/封封/吃飯糰_omni_v4", "idle", False),
            "sweep": ("flow/爪破/封封/橫掃_omni_v4", "idle", False, ("measureAt", 52)),
            "dslash": ("flow/爪破/封封/雙斬_omni_v7", "idle", False, ("measureAt", 40)),
            "focus": ("flow/爪破/封封/凝神_omni_v1", "idle", False),
            "guard": ("flow/爪破/封封/防禦_omni_v2", "idle", False),
            "win": ("flow/爪破/封封/勝利_omni_v1", "idle", False),
            "thrust": ("flow/爪破/封封/突刺_omni_v2", "idle", True),     # 第 41 格頭頂左邊一小點白光，只留最大一塊
            "hurt": ("flow/爪破/封封/挨打_omni_v2", "idle", False),
            "run": ("flow/爪破/封封/跑_omni_v1", "idle", False),
            "defeat": ("flow/爪破/封封/倒下_omni_v3", "idle", False),
            # 09-29 重生：開始影格是出鞘那張立繪（第 0 格蹲低舉刀、刀擋在頭旁），量頭改量站直的那一格。
            # 站直時身高跟待機組差 2% 以內（566／556 對 558 像素），片子本身大小相同，歸進待機組取中位數；
            # 平斬、重劈的頭微微轉向鏡頭，單量會偏大 7%（相關係數只有 0.94），不能自己一組
            "slash": ("flow/爪破/封封/平斬_omni_v5", "idle", False, ("measureAt", 50)),
            "heavy": ("flow/爪破/封封/重劈_omni_v5", "idle", False, ("measureAt", 90)),
            "sheath": ("flow/爪破/封封/收刀_omni_v4", "idle", False, ("measureAt", 88)),
        },
        "hits": {},
        "actions": {
            "toss": {"clip": "toss", "keys": [(14, 0), (40, 0.16), (54, 0.24), (64, 0.41), (88, 0.71)]},
            "dodge": {"clip": "dodge", "keys": [(22, 0), (46, 0.25), (64, 0.42), (84, 0.615)]},
            "eat": {"clip": "eat", "keys": [(4, 0), (30, 0.3), (80, 0.8), (92, 1.02)]},
            "sweep": {"clip": "sweep", "keys": [(8, 0), (24, 0.16), (38, 0.36), (60, 0.55), (94, 0.82)]},
            "double_slash": {"clip": "dslash", "keys": [(20, 0), (40, 0.22), (60, 0.38), (80, 0.55), (92, 0.88)]},
            # 平斬、收刀、倒下 09-29 審查退回（v3 像刺、v2 收完轉身、v2 往前撲），同日重生 v5／v4／v3 再接：
            # 平斬（0.72 秒、命中 300）：「太極拳速度」片很慢，壓時間：第 14 格刀在身後、第 24～36 格由後往前水平掃，
            # 第 36 格刀剛掃到身前＝命中；之後刀平舉向前，程式接收刀
            # 平斬、重劈也加 clamp：站直後腳比出鞘蹲姿（第 0 格）低 8 像素，不壓就沉到腳底線下 2～4 像素
            # 09-29 晚（使用者：「封封的不太流暢、有點慢速、卡頓感」）：原片第 36 格之後刀平舉不動 60 格，
            # 原本排到 0.72 秒＝命中後停 0.42 秒才收刀，看起來像卡住。改成命中後再走 8 格（0.12 秒）就接收刀
            "slash": {"clip": "slash", "keys": [(14, 0), (24, 0.15), (36, 0.3), (44, 0.42)], "clamp": True, "trimTail": True},
            # 重劈（0.96 秒、命中 430）：第 20～40 格舉刀過頭、第 56～74 格由直立往前下劈，第 74 格刀劈到前方＝命中，
            # 收在腰高平舉（不是劈到膝蓋）
            # 09-29 晚：同平斬，第 74 格劈到之後刀停著 0.53 秒 → 只留 6 格（0.12 秒）
            "heavy_slash": {"clip": "heavy", "keys": [(20, 0), (40, 0.2), (56, 0.3), (74, 0.43), (80, 0.55)], "clamp": True, "trimTail": True},
            # 收刀（0.63 秒；出劍後接上時跳過原速前 120 毫秒＝第 32 格，刀在身前往下）：第 36～72 格刀插回腰間鞘，
            # 從第 30 格開始（第 24～29 格刀尖往下戳到腳底線以下 6～20 像素）；
            # 第 72 格起跟待機同一個站姿（結束影格就是待機收鞘圖）
            "sheath": {"clip": "sheath", "keys": [(30, 0), (32, 0.12), (44, 0.35), (60, 0.5), (78, 0.63)]},
            # 倒下（1.18 秒，09-29 重生 v3）：第 36～59 格坐倒、第 60～70 格往後躺、頭朝左縮身，刀留在腰間
            "defeat": {"clip": "defeat", "keys": [(26, 0), (48, 0.35), (66, 0.8), (80, 1.18)], "clamp": True},
            # 凝神（0.96 秒）：第 16～70 格閉眼、手搭刀柄
            "focus": {"clip": "focus", "keys": [(8, 0), (24, 0.35), (60, 0.96)]},
            # 防禦（0.76 秒）：第 20～34 格拔刀、第 44～62 格刀舉過頭橫擋
            "guard": {"clip": "guard", "keys": [(20, 0), (34, 0.2), (46, 0.4), (58, 0.76)]},
            # 勝利（1.22 秒，停在最後一格）：第 14～40 格一手舉拳
            "win": {"clip": "win", "keys": [(6, 0), (18, 0.35), (38, 1.22)]},
            # 突刺（0.73 秒、命中 300）：第 45～66 格刀直刺向前。第 28～30、42～44 格有淡綠色刀光（去背去不乾淨），
            # 關鍵格挑成實際取到第 26、32、37、41、45… 格，避開那兩段
            "thrust": {"clip": "thrust", "keys": [(26, 0), (37, 0.15), (45, 0.3), (60, 0.5), (76, 0.73)]},
            # 挨打（0.65 秒、不加速）：第 12～40 格縮頭閉眼退半步，第 50 格起站回
            "hurt": {"clip": "hurt", "keys": [(12, 0), (18, 0.1), (38, 0.45), (54, 0.65)]},
            "run": {"clip": "run", "loop": (20, 72, 14, 26), "cycle": 0.48},
        },
    },
}


def extract(path: str, tmp: Path) -> list[Path]:
    d = tmp / path.replace("/", "_")
    if not d.exists():
        d.mkdir(parents=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(VIDS / f"{path}.mp4"), str(d / "%03d.png")], check=True)
    return sorted(d.glob("*.png"))


SOLO_GAP = 9   # 只留最大一塊時，相隔幾像素以內算連在一起


def key_green(path: Path, solo: bool, deshadow: bool = False) -> np.ndarray:
    """綠幕→透明（跟 tools/chroma_key.py 的 key_out 同一套：綠度＝綠−max(紅,藍)，影片版門檻 130／200），回傳 RGBA 陣列"""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    h, w, _ = rgb.shape
    rgb[int(h * 0.72):, int(w * 0.82):] = (0, 255, 0)   # Gemini 小星星浮水印
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = g - np.maximum(r, b)
    soft, hard = 130, 200
    alpha = np.clip(1 - (green - soft) / (hard - soft), 0, 1)
    alpha = (alpha * 255).astype(np.uint8)
    if deshadow:
        # 片子自己畫的地上影子（半透明、壓在綠底上變成暗綠色）：還帶綠色偏的一律當背景。
        # 角色身上沒有偏綠的顏色（噹噹的青色背心綠≈藍），門檻 20 不會咬到
        alpha = np.where(green > 20, 0, alpha).astype(np.uint8)
    # 去綠邊：邊緣帶（透明區往內 2 像素）的綠壓到不超過紅藍
    band = ndimage.minimum_filter(alpha, size=5) < 255
    spill = band & (alpha > 0) & (g > np.maximum(r, b))
    g = np.where(spill, np.maximum(r, b), g)
    # 半透明殘影混到的綠也壓掉（橫向捲軸 export_sprites.py 的做法）；四位身上都沒有純綠（噹噹背心是偏藍的青色）
    g = np.minimum(g, np.maximum(r, b))
    alpha = ndimage.minimum_filter(alpha, size=3)
    if solo:
        solid = ndimage.maximum_filter(alpha > 40, size=SOLO_GAP)
        lab, n = ndimage.label(solid)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            keep = ndimage.maximum_filter(lab == (1 + int(np.argmax(sizes))), size=5)
            alpha = np.where(keep, alpha, 0).astype(np.uint8)
    return np.dstack([r, g, b, alpha]).astype(np.uint8)


def solid_foot(a: np.ndarray) -> int:
    rows = np.nonzero((a >= 128).sum(axis=1) >= 3)[0]
    return int(rows[-1]) + 1 if len(rows) else a.shape[0]


def centroid_x(a: np.ndarray) -> float:
    m = a > 200
    xs = np.nonzero(m)[1]
    return float(xs.mean()) if len(xs) else a.shape[1] / 2


def stand_height(a: np.ndarray) -> int:
    rows = np.nonzero((a > 128).any(axis=1))[0]
    return int(rows[-1] - rows[0] + 1)


def best_loop(frames: list[np.ndarray], lo: int, hi: int) -> tuple[int, int]:
    sig = [np.asarray(Image.fromarray(f).convert("L").resize((160, 90)), dtype=np.int16) for f in frames]
    best = (1e18, 0, lo)
    for s in range(len(frames)):
        for e in range(s + lo, min(len(frames) - 1, s + hi) + 1):
            d = float(np.abs(sig[s] - sig[e]).mean())
            if d < best[0]:
                best = (d, s, e)
    return best[1], best[2]


def clamp_frames(frames: list[dict], scale: float, old: dict) -> None:
    """倒下用（clamp）：躺下時片子裡的身體比站姿腳底低、也可能往右（敵人那邊）伸得比舊版倒下遠。
    逐格把定位點往上／往左推，讓每格不低於腳底線、右緣不超過舊倒下最右那格；推的量只增不減（倒下去就不再彈回來），
    所以站著的開頭幾格不動、倒的過程中慢慢挪過去。"""
    s_old = old["scale"]
    limit = max((f["rect"][2] - f["pivot"][0]) * s_old for f in old["frames"])   # 舊倒下最右（CSS 像素，相對腳底）
    dx = dy = 0.0
    for f in frames:
        w, h = f["rect"][2], f["rect"][3]
        px, py = f["pivot"]
        dy = max(dy, (h - py) * scale - 1)          # 低於腳底線幾 CSS 像素（容許 1，跟舊圖一樣）
        dx = max(dx, (w - px) * scale - limit)
        f["pivot"] = [round(px + dx / scale, 2), round(py + dy / scale, 2)]


def plan(spec: dict, fps: int, action: str) -> list[tuple[float, float]]:
    """回傳 [(來源格（可小數）, 這格原速秒數)…]"""
    speed = 1.0 if action in UNSCALED else MOTION_SPEED
    keys = spec["keys"]
    out: list[tuple[float, float]] = []
    for k in range(len(keys) - 1):
        (a, t0), (b, t1) = keys[k], keys[k + 1]
        n = max(1, round((t1 - t0) / speed * fps))
        last = k == len(keys) - 2
        for j in range(n):
            src = a + (b - a) * (j / (n - 1) if last and n > 1 else j / n)
            out.append((src, (t1 - t0) / n))
    return out


def old_actions(hero: str, cfg: dict) -> dict:
    acts: dict = {}
    for f in cfg["old"]:
        acts.update(json.loads((UI / f).read_text(encoding="utf-8"))["actions"])
    return acts


def check_timing(hero: str, cfg: dict, old: dict) -> dict[str, dict]:
    """總長＝舊動作總長（挨打＝0.65 秒）；舊的命中／出手時間都要剛好是某個關鍵格的時間。回傳要抄進新資料的時間欄位"""
    carry: dict[str, dict] = {}
    for action, spec in cfg["actions"].items():
        if "loop" in spec:
            continue
        keys = spec["keys"]
        want = HURT_TOTAL if action == "hurt" else round(sum(f["duration"] for f in old[action]["frames"]), 6)
        # `trimTail`：刻意比舊動作短（命中後的停頓剪掉，後面接的收刀／待機照動作表自己的長度排，09-29 晚封封）
        if spec.get("trimTail"):
            if keys[-1][1] > want + 1e-6:
                raise SystemExit(f"{hero} {action}：總長 {keys[-1][1]} 比現在的 {want} 還長")
        elif abs(keys[-1][1] - want) > 1e-6:
            raise SystemExit(f"{hero} {action}：總長 {keys[-1][1]} ≠ 現在的 {want}")
        fields = {k: old[action][k] for k in ("impactTimes", "releaseTimes") if k in old.get(action, {}) and action != "hurt"}
        # 有出手時間的（丟東西）命中＝出手＋飛行，只對出手那格；其他對命中那格
        times = list(fields.get("releaseTimes") or fields.get("impactTimes", [])) + cfg["hits"].get(action, [])
        key_ms = {round(t * 1000) for _, t in keys}
        for t in times:
            if round(t) not in key_ms:
                raise SystemExit(f"{hero} {action}：命中／出手 {t} 毫秒不是關鍵格的時間 {sorted(key_ms)}")
        carry[action] = fields
    return carry


def measure_heads(hero: str, cfg: dict, firsts: dict[str, np.ndarray], old: dict, tmp: Path) -> dict[str, dict]:
    """每支片第一格照站高粗估大小，再量頭，回傳 {片: {display, rough, head}}（display＝影片 1 像素畫成幾 CSS 像素）"""
    idle = old["idle"]
    f0 = idle["frames"][0]
    old_css_h = f0["rect"][3] * idle["scale"]
    tex = ROOT / "public" / idle["texture"]
    jobs = []
    rough: dict[str, float] = {}
    for slug, a in firsts.items():
        rough[slug] = old_css_h / stand_height(a[..., 3])
        p = tmp / f"head_{hero}_{slug}.png"
        Image.fromarray(a, "RGBA").save(p)
        jobs.append({"id": slug, "hero": cfg["gate"], "image": str(p), "scale": rough[slug], "lo": .7, "hi": 1.4})
    spec = {"templates": {cfg["gate"]: {"image": str(tex), "rect": f0["rect"], "scale": idle["scale"]}}, "jobs": jobs}
    jf, rf = tmp / f"head_{hero}.json", tmp / f"head_{hero}_res.json"
    jf.write_text(json.dumps(spec), encoding="utf-8")
    subprocess.run([sys.executable, str(HEAD_TOOL), str(jf), str(rf)], check=True)
    res = json.loads(rf.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for slug in firsts:
        r = res[slug]
        if "err" in r or r.get("corr", 0) < 0.92:
            raise SystemExit(f"{hero} {slug} 量頭量不準（相關係數 < 0.92，其他片都在 0.98 上下；封封橫掃 v4 各格都量到 0.926、大小 0.81～0.82 一致，09-29 放寬到 0.92）：{r}")
        out[slug] = {"rough": rough[slug], "head": r["scale"], "corr": r["corr"], "own": rough[slug] / r["scale"]}
    # 同一張參考圖生的片取中位數
    groups: dict[str, list[str]] = {}
    for slug, (_, ref, *_) in cfg["clips"].items():
        groups.setdefault(ref, []).append(slug)
    for slugs in groups.values():
        med = float(np.median([out[s]["own"] for s in slugs]))
        for s in slugs:
            out[s]["display"] = med
    return out


def pack_hero(hero: str, tmp: Path) -> dict:
    cfg = HEROES[hero]
    old = old_actions(hero, cfg)
    carry = check_timing(hero, cfg, old)
    cache: dict[str, list[np.ndarray]] = {}

    def frames_of(slug: str) -> list[np.ndarray]:
        if slug not in cache:
            path, _, solo, *extra = cfg["clips"][slug]
            cache[slug] = [key_green(p, solo, "deshadow" in extra) for p in extract(path, tmp)]
        return cache[slug]

    def measure_frame(slug: str) -> int:
        return next((e[1] for e in cfg["clips"][slug][3:] if isinstance(e, tuple) and e[0] == "measureAt"), 0)

    firsts = {slug: frames_of(slug)[measure_frame(slug)] for slug in cfg["clips"]}
    sizes = measure_heads(hero, cfg, firsts, old, tmp)

    picks: dict[str, dict] = {}
    for action, spec in cfg["actions"].items():
        fr = frames_of(spec["clip"])
        first = fr[spec.get("anchor", 0)][..., 3]   # anchor：腳底定位用哪一格（片子前段有走位時）
        base = {"display": sizes[spec["clip"]]["display"], "foot_y": solid_foot(first), "foot_x": centroid_x(first)}
        if "loop" in spec:
            s0, s1, lo, hi = spec["loop"]
            s, e = best_loop(fr[s0:s1], lo, hi)
            base["cycle"] = list(range(s0 + s, s0 + e))
        picks[action] = base

    for old_file in OUT_IMG.glob(f"{hero}-*.webp"):
        old_file.unlink()
    data: dict = {
        "note": "由 tools/pack_hero_vids.py 產生，不要手改。時間是原速，載入時照舊加快 1.5 倍（unscaled 裡的不加速）。",
        "hero": hero, "nativeHeight": 252, "unscaled": sorted(UNSCALED), "variants": {},
    }
    report: dict = {}
    for vname, v in VARIANTS.items():
        fps, over = v["fps"], v["over"]
        actions_out = {}
        by_clip: dict[str, dict[int, None]] = {}
        seq: dict[str, list[tuple[int, float]]] = {}
        for action, spec in cfg["actions"].items():
            p = picks[action]
            if "loop" in spec:
                cyc = p["cycle"]
                n = max(4, round(spec["cycle"] * fps))
                s = [(cyc[min(len(cyc) - 1, int(i * len(cyc) / n))], spec["cycle"] / n) for i in range(n)]
            else:
                s = [(int(round(src)), dur) for src, dur in plan(spec, fps, action)]
            seq[action] = s
            for idx, _ in s:
                by_clip.setdefault(spec["clip"], {})[idx] = None
        for slug, used in by_clip.items():
            owners = [a for a, sp in cfg["actions"].items() if sp["clip"] == slug]
            fr = frames_of(slug)
            p = picks[owners[0]]
            pack = p["display"] * over
            cells = {}
            for idx in used:
                im = Image.fromarray(fr[idx], "RGBA")
                w, h = round(im.width * pack), round(im.height * pack)
                im = im.resize((w, h), Image.LANCZOS)
                bb = im.getchannel("A").point(lambda x: 255 if x > 8 else 0).getbbox() or (0, 0, 1, 1)
                cells[idx] = (im.crop(bb), bb)
            x = y = row_h = width = 0
            place = {}
            for idx, (crop, _) in cells.items():
                if x + crop.width > MAX_W:
                    x, y, row_h = 0, y + row_h + 2, 0
                place[idx] = (x, y)
                x += crop.width + 2
                row_h = max(row_h, crop.height)
                width = max(width, x)
            sheet = Image.new("RGBA", (width, y + row_h), (0, 0, 0, 0))
            for idx, (crop, _) in cells.items():
                sheet.paste(crop, place[idx])
            tex = f"assets/motion/hero-vids/{hero}-{slug}-{v['suffix']}.webp"
            sheet.save(ROOT / "public" / tex, "WEBP", quality=QUALITY, method=6)
            report[tex] = {"bytes": (ROOT / "public" / tex).stat().st_size, "size": list(sheet.size), "cells": len(cells)}
            for action in owners:
                pa = picks[action]
                frames = []
                for idx, dur in seq[action]:
                    crop, bb = cells[idx]
                    cx, cy = place[idx]
                    frames.append({
                        "rect": [cx, cy, crop.width, crop.height],
                        "pivot": [round(pa["foot_x"] * pack - bb[0], 2), round(pa["foot_y"] * pack - bb[1], 2)],
                        "duration": round(dur, 6),
                        "src": idx,
                    })
                if cfg["actions"][action].get("clamp"):
                    clamp_frames(frames, pa["display"] / pack, old[action])
                entry = {"texture": tex, "scale": round(pa["display"] / pack, 6), "loop": "loop" in cfg["actions"][action], "frames": frames}
                entry.update(carry.get(action, {}))
                if "originAt" in cfg["actions"][action]:
                    # 手指尖＝出手那格最右邊的實心像素（往左 12 像素內取平均高度），換成相對腳底的 CSS 像素
                    a = fr[cfg["actions"][action]["originAt"]][..., 3]
                    ys, xs = np.nonzero(a > 128)
                    near = xs >= xs.max() - 12
                    entry["releaseOrigins"] = [{"x": round((float(xs.max()) - pa["foot_x"]) * pa["display"]),
                                                "y": round((float(ys[near].mean()) - pa["foot_y"]) * pa["display"])}]
                actions_out[action] = entry
        data["variants"][vname] = {"fps": fps, "actions": {a: actions_out[a] for a in cfg["actions"]}}
    (OUT_DATA / f"{hero}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    decoded = {vn: round(sum(r["size"][0] * r["size"][1] * 4 for t, r in report.items() if t.endswith(f"-{v['suffix']}.webp")) / 1024 / 1024, 1)
               for vn, v in VARIANTS.items()}
    download = {vn: round(sum(r["bytes"] for t, r in report.items() if t.endswith(f"-{v['suffix']}.webp")) / 1024 / 1024, 2)
                for vn, v in VARIANTS.items()}
    print(f"{hero}: 下載 {download}  解開後 {decoded} MB")
    return {
        "atlases": report,
        "downloadMB": download,
        "decodedMB": decoded,
        "size": {s: {k: round(v, 5) for k, v in d.items()} for s, d in sizes.items()},
        "runCycle": {a: [picks[a]["cycle"][0], picks[a]["cycle"][-1]] for a in cfg["actions"] if "cycle" in picks[a]},
        "frames": {v: {a: len(data["variants"][v]["actions"][a]["frames"]) for a in cfg["actions"]} for v in VARIANTS},
    }


def main() -> None:
    heroes = sys.argv[1:] or list(HEROES)
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    rep_path = ROOT / "tools" / "pack_hero_vids.report.json"
    try:
        full = json.loads(rep_path.read_text(encoding="utf-8"))
        if "heroes" not in full:
            full = {"heroes": {}}
    except FileNotFoundError:
        full = {"heroes": {}}
    with tempfile.TemporaryDirectory() as td:
        for hero in heroes:
            full["heroes"][hero] = pack_hero(hero, Path(td))
    rep_path.write_text(json.dumps(full, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
