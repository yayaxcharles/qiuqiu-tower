# -*- coding: utf-8 -*-
"""用程式合成遊戲音效。

為什麼用合成不是找素材：授權乾淨（全部是算出來的）、檔案極小（每個幾 KB）、
整套音色一致、要調整就改參數重跑，不用回頭找檔案。

做法都是同一套：挑一個波形當音源（正弦、三角、方波、雜訊），
乘上一條音量包絡線（起音多快、衰減多長），再加上音高滑音或濾波。
所有音效刻意做短（0.08～0.6 秒）——遊戲音效太長會蓋掉下一個動作的回饋。

跑法：python tools/make_sfx.py [輸出目錄]
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100


def env(n, attack=0.005, decay=0.12, curve=3.0):
    """音量包絡線：極短的起音（不然會有喀噠聲）＋指數衰減。"""
    a = max(1, int(SR * attack))
    d = max(1, n - a)
    return np.concatenate([np.linspace(0, 1, a), np.exp(-curve * np.linspace(0, 1, d))])[:n]


def tone(freq, dur, kind='sine', detune=0.0):
    """一段音。freq 可以是數字（定音）或 (起, 迄) 的滑音。"""
    n = int(SR * dur)
    t = np.arange(n) / SR
    if isinstance(freq, tuple):
        f = np.linspace(freq[0], freq[1], n)
    else:
        f = np.full(n, float(freq))
    if detune:
        f = f * (1 + detune * np.sin(2 * np.pi * 7 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if kind == 'sine':
        return np.sin(ph)
    if kind == 'tri':
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if kind == 'square':
        return np.sign(np.sin(ph))
    if kind == 'saw':
        return 2 * (ph / (2 * np.pi) % 1) - 1
    raise ValueError(kind)


def noise(dur, lo=None, hi=None, seed=7):
    """雜訊，可選帶通。打擊、風聲、沙沙聲都靠它。

    `seed` 一定要逐個音效換掉：固定同一顆種子的話，所有靠雜訊的音效
    會共用同一段亂數，聽起來像同一個聲音套不同濾波，整套會很單調。
    """
    n = int(SR * dur)
    x = np.random.default_rng(seed).standard_normal(n)
    if lo or hi:
        from scipy.signal import butter, sosfilt
        if lo and hi:
            sos = butter(4, [lo, hi], btype='band', fs=SR, output='sos')
        elif lo:
            sos = butter(4, lo, btype='high', fs=SR, output='sos')
        else:
            sos = butter(4, hi, btype='low', fs=SR, output='sos')
        x = sosfilt(sos, x)
    return x


def delay_by(x, sec):
    """把一段聲音往後推，用來錯開連擊的每一下。"""
    return np.concatenate([np.zeros(int(SR * sec)), x])


def notes(freqs, step, dur, kind='tri', curve=6.0):
    """一串音階：勝利、升級那種「叮叮咚」就是這個。"""
    return mix(*[delay_by(tone(f, dur, kind) * env(int(SR * dur), 0.004, 0, curve), i * step)
                 for i, f in enumerate(freqs)])


def mix(*parts):
    """把長度不一的片段疊起來，最長的決定總長。"""
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def save(name, x, out_dir, gain=0.85):
    """正規化後存成 16 位元單聲道 WAV，尾端補一小段靜音避免爆音。"""
    x = np.concatenate([x, np.zeros(int(SR * 0.01))])
    peak = np.max(np.abs(x))
    if peak > 0:
        x = x / peak * gain
    data = (x * 32767).astype('<i2')
    p = Path(out_dir) / f'{name}.wav'
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    return p


# ===== 四個樣本 =====

def sfx_claw():
    """貓抓：三道爪痕。三段快速的「唰」，音高一段比一段高。"""
    parts = []
    for i, (delay, f) in enumerate([(0.0, 2600), (0.045, 3100), (0.09, 3600)]):
        d = 0.10
        body = noise(d, lo=f * 0.5, hi=f * 2.2) * env(int(SR * d), 0.002, 0, 14)
        whip = tone((f, f * 0.35), d, 'tri') * env(int(SR * d), 0.002, 0, 12) * 0.35
        seg = (body * 0.9 + whip) * (1.0 - i * 0.12)
        parts.append(np.concatenate([np.zeros(int(SR * delay)), seg]))
    return mix(*parts)


def sfx_block():
    """蜷縮：一聲悶悶的「噗」，像縮進棉被裡。低頻＋一點布料的沙沙。"""
    n = int(SR * 0.34)
    thud = tone((220, 90), 0.34, 'sine') * env(n, 0.006, 0, 5)
    cloth = noise(0.34, lo=800, hi=4000) * env(n, 0.004, 0, 11) * 0.22
    return mix(thud * 0.9, cloth)


def sfx_draw():
    """抽牌：紙從牌堆滑出來。短促的高頻沙沙，尾端帶一點上揚。"""
    n = int(SR * 0.16)
    paper = noise(0.16, lo=1800, hi=9000) * env(n, 0.003, 0, 16)
    lift = tone((900, 1500), 0.16, 'tri') * env(n, 0.004, 0, 13) * 0.18
    return mix(paper * 0.8, lift)


def sfx_click():
    """按鈕：木頭按鍵按下去。兩個諧音的短敲擊。"""
    n = int(SR * 0.13)
    e = env(n, 0.002, 0, 22)
    wood = (tone(760, 0.13, 'sine') * 0.6 + tone(1180, 0.13, 'sine') * 0.35) * e
    tick = noise(0.13, lo=2500, hi=7000) * env(n, 0.001, 0, 40) * 0.25
    return mix(wood, tick)



# ===== 戰鬥 =====

def sfx_hit():
    """一般攻擊命中：短促的悶擊。爪擊那個是專屬的，這個給沒有專屬音的攻擊用。"""
    n = int(SR * 0.16)
    body = tone((420, 150), 0.16, 'sine') * env(n, 0.003, 0, 13)
    slap = noise(0.16, lo=900, hi=5000, seed=11) * env(n, 0.002, 0, 26) * 0.5
    return mix(body, slap)


def sfx_hit_heavy():
    """大招命中：低一個八度、拖長一點，讓玩家分得出這下比較痛。"""
    n = int(SR * 0.42)
    body = tone((260, 62), 0.42, 'sine') * env(n, 0.004, 0, 6)
    crack = noise(0.42, lo=300, hi=3200, seed=12) * env(n, 0.002, 0, 18) * 0.55
    return mix(body, crack)


def sfx_hurt():
    """球球挨打：往下掉的短音，帶一點顫，聽起來像吃痛。"""
    n = int(SR * 0.26)
    return (tone((700, 300), 0.26, 'tri', detune=0.05) * env(n, 0.004, 0, 9) * 0.9
            + noise(0.26, lo=600, hi=4000, seed=13) * env(n, 0.002, 0, 22) * 0.3)


def sfx_blocked():
    """攻擊被蜷縮擋下來：金屬的「鏘」。兩個略微失諧的方波撞在一起。"""
    n = int(SR * 0.3)
    e = env(n, 0.001, 0, 9)
    return mix(tone(1180, 0.3, 'square') * e * 0.5,
               tone(1790, 0.3, 'square') * e * 0.32,
               noise(0.3, lo=3000, hi=11000, seed=14) * env(n, 0.001, 0, 26) * 0.3)


def sfx_enemy_down():
    """魔物倒下：往下滑的音加一團散掉的雜訊，像洩了氣。"""
    n = int(SR * 0.5)
    fall = tone((520, 90), 0.5, 'tri') * env(n, 0.006, 0, 5)
    poof = noise(0.5, lo=200, hi=2600, seed=15) * env(n, 0.02, 0, 4) * 0.4
    return mix(fall * 0.8, poof)


def sfx_dodge():
    """閃過了：一道快速掃過的風聲，中間最亮、兩頭收掉。"""
    n = int(SR * 0.22)
    e = np.sin(np.linspace(0, np.pi, n)) ** 1.6
    return noise(0.22, lo=1200, hi=8000, seed=16) * e * 0.9


def sfx_thorns():
    """反彈：尖銳的一聲「叮」，短到幾乎是個點，才不會跟被打的聲音糊在一起。"""
    n = int(SR * 0.18)
    e = env(n, 0.001, 0, 20)
    return mix(tone(2400, 0.18, 'sine') * e, tone(3600, 0.18, 'sine') * e * 0.4)


def sfx_poison():
    """噎到：三個低沉的咕嚕，音高各不相同才不會像機械重複。"""
    parts = []
    for i, f in enumerate((180, 240, 150)):
        d = 0.16
        g = tone((f, f * 1.7), d, 'sine') * env(int(SR * d), 0.01, 0, 8)
        parts.append(delay_by(g * (0.9 - i * 0.15), i * 0.11))
    return mix(*parts)


def sfx_stealth():
    """隱身：一團煙。雜訊先漲起來再散掉，沒有明確的音高。"""
    n = int(SR * 0.45)
    e = np.concatenate([np.linspace(0, 1, int(n * 0.25)) ** 2,
                        np.exp(-4 * np.linspace(0, 1, n - int(n * 0.25)))])[:n]
    return noise(0.45, lo=500, hi=6000, seed=17) * e * 0.85


def sfx_buff():
    """增益：三個往上的短音，聽起來像變強了。"""
    return notes([660, 880, 1320], 0.055, 0.16, 'tri', 9)


def sfx_debuff():
    """減益：兩個往下的悶音，跟增益完全相反的方向。"""
    return notes([520, 330], 0.07, 0.26, 'saw', 7) * 0.6


def sfx_heal():
    """回血：柔和的上行三音，用正弦波，不要有稜角。"""
    return notes([523, 659, 784], 0.07, 0.30, 'sine', 5)


# ===== 回合與介面 =====

def sfx_turn_end():
    """結束回合：兩個往下的柔和音，表示「這一段收起來了」。"""
    return notes([500, 375], 0.09, 0.22, 'sine', 7) * 0.8


def sfx_turn_start():
    """新回合：兩個往上的音加一聲輕鈴，跟結束回合成對。"""
    return mix(notes([440, 587], 0.08, 0.22, 'sine', 7) * 0.8,
               delay_by(tone(1760, 0.25, 'sine') * env(int(SR * 0.25), 0.004, 0, 10) * 0.25, 0.14))


def sfx_fish():
    """拿到小魚乾：兩顆清亮的短音，錢的聲音要脆。"""
    return notes([1245, 1660], 0.055, 0.20, 'sine', 10) * 0.9


def sfx_buy():
    """買東西：錢的脆音之後接一記木頭敲擊，像東西放上櫃檯。"""
    return mix(sfx_fish() * 0.7, delay_by(sfx_click() * 0.8, 0.13))


def sfx_potion():
    """喝忍具：兩聲咕嘟加一個開瓶的「啵」。"""
    glug = mix(*[delay_by(tone((130, 210), 0.13, 'sine') * env(int(SR * 0.13), 0.01, 0, 9), i * 0.1)
                 for i in range(2)])
    pop = delay_by(tone((900, 300), 0.07, 'sine') * env(int(SR * 0.07), 0.001, 0, 20) * 0.7, 0.22)
    return mix(glug, pop)


def sfx_upgrade():
    """磨爪升級：四個往上的亮音，比增益更長更華麗，是難得的好事。"""
    return notes([523, 659, 784, 1046], 0.065, 0.34, 'tri', 5)


def sfx_relic():
    """拿到秘寶：幾個略微失諧的泛音疊在一起，做出閃閃發光的感覺。"""
    n = int(SR * 0.7)
    e = env(n, 0.02, 0, 3.5)
    return mix(*[tone(f * (1 + 0.004 * i), 0.7, 'sine') * e * (0.5 / (i + 1))
                 for i, f in enumerate((880, 1320, 1760, 2640))])


def sfx_victory():
    """打贏了：大調四音上行的小號角。"""
    return notes([523, 659, 784, 1046], 0.11, 0.5, 'tri', 3.2)


def sfx_defeat():
    """倒下了：小調三音下行，最後一個拖長。"""
    return mix(notes([440, 349], 0.16, 0.35, 'tri', 4),
               delay_by(tone((262, 247), 0.9, 'tri') * env(int(SR * 0.9), 0.02, 0, 2.4) * 0.8, 0.32))


def sfx_step():
    """地圖上走一步：輕輕的肉墊聲，很短。"""
    n = int(SR * 0.11)
    return mix(tone((300, 160), 0.11, 'sine') * env(n, 0.004, 0, 16) * 0.8,
               noise(0.11, lo=400, hi=2400, seed=18) * env(n, 0.003, 0, 24) * 0.25)


SAMPLES = {
    # 戰鬥
    'claw': sfx_claw, 'hit': sfx_hit, 'hit_heavy': sfx_hit_heavy, 'hurt': sfx_hurt,
    'block': sfx_block, 'blocked': sfx_blocked, 'enemy_down': sfx_enemy_down,
    'dodge': sfx_dodge, 'thorns': sfx_thorns, 'poison': sfx_poison, 'stealth': sfx_stealth,
    'buff': sfx_buff, 'debuff': sfx_debuff, 'heal': sfx_heal,
    # 回合與介面
    'draw': sfx_draw, 'click': sfx_click, 'turn_end': sfx_turn_end, 'turn_start': sfx_turn_start,
    'fish': sfx_fish, 'buy': sfx_buy, 'potion': sfx_potion, 'upgrade': sfx_upgrade,
    'relic': sfx_relic, 'victory': sfx_victory, 'defeat': sfx_defeat, 'step': sfx_step,
}

if __name__ == '__main__':
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'tools/sfx_sample')
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in SAMPLES.items():
        p = save(name, fn(), out)
        print(f'  {p.name}　{p.stat().st_size / 1024:.1f} KB')
