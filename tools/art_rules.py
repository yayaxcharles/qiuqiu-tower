# -*- coding: utf-8 -*-
"""生圖提示詞的共用硬規則。

2026-09-04 做姆斯（已廢棄的第二角色）那晚，十幾次失敗換來的。物種無關，做任何角色的
立繪與牌面都適用——把 gear_rule()／STYLE／FOES 串進提示詞即可。

★ 最重要的教訓：規則寫得越死，越要把所有姿勢掃一遍問「有沒有哪個做不到這條」。
  一晚踩四次——格擋（「躲在舉起的殼後面」撞上「殼長在背上」，殼跑到頭上當帽子）、
  縮殼（「眼睛從前開口露出」撞上「殼只從背後看到」，生成直接失敗）、
  挨打（「眼睛用力閉緊」撞上「大圓瞳孔加高光」，失敗）、
  縮殼第二次（通用取景「全身朝右腳貼底邊」撞上「整隻在殼裡沒有腳」，又失敗兩次）。
  做不到的要嘛給規則加例外、要嘛改姿勢敘述、要嘛給那個姿勢自己的取景（FRAMING 字典）。

★ 第二個雷：參考圖會被讀成「要畫這個」，不只是「照這個畫風」。拿隊友的立繪當比例基準，
  三張序章圖全被塞進一隻隊友；拿掉之後模型改成複製第二隻主角。要明寫「畫面裡只有一個角色」。

★ 第三個雷：綠幕上任何綠色或半透明的東西，去背後都會變成破洞。光是禁「不要寫綠色」不夠——
  沒指定顏色時模型會自己挑到綠色（86 張牌裡 22 張寫「發光」、12 張寫「霧氣煙塵」都中招）。
"""


def gear_rule(items: str) -> str:
    """裝備固定規則。`items` 描述這個角色身上不可移動的東西，例如
    "the lacquered shoulder plates, the horned helmet and the back banner"。"""
    return (
        "WORN GEAR: " + items + " - these are attached to his body, they move and tilt together with it, and "
        "they never detach, never float beside him, never become separate objects he holds or stands next to, "
        "never swap to another part of the body, and never appear twice. If a pose hides a piece behind him, "
        "it is simply hidden - do not relocate it.\n"
        "THE EYES: both eyes look the same way as each other, same size, same shape - large dark round pupils "
        "with one glossy white highlight, slightly droopy upper eyelids. If the pose calls for closed or "
        "squeezed-shut eyes, close BOTH the same way - the rule is that the two eyes always match each other. "
        "Never cross-eyed, never one eye bigger or higher, never blank, never a different pupil colour. "
        "His gaze points the way his head is turned.\n")


STYLE = (
    "Any glow, aura, sheen, sparkle, magical light, mist, smoke, steam, breath, dust cloud, shockwave or water "
    "in this picture must be WARM GOLDEN AMBER, CREAMY WHITE or WARM GREY - never green, never greenish - and "
    "drawn solid and opaque, never see-through. (The picture sits on a green screen: anything green or "
    "transparent gets erased by the chroma key and leaves a hole.)\n"
    "Style: thick black outlines, FLAT colours with only subtle soft shading - do NOT render it painterly, "
    "do NOT use heavy airbrushed shadows or a rendered-illustration look. Cute cartoon, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying.\n")

FOES = (
    "If any enemy appears, it is a small grey rat or a small orange tabby bandit cat - NEVER another copy of "
    "the hero and never anything that looks like him. Enemies stay small and near the edges so the hero is "
    "clearly the main subject filling the centre.\n")
