# -*- coding: utf-8 -*-
"""阿甲（烏龜）牌組資料（2026-09-03 已套用使用者第一輪改動：留殼 2 費、甲裂不歸零、磨甲改能力、深呼吸 2 費、龜甲盾改反彈；刪咚咚／彈殼／慢慢來／撿寶／大吼）：起手 4＋龜甲流＋玄武訣，鏡像球球的牌標 mirror。輸出 docs/角色二_烏龜_牌組.json 與 scratchpad/turtle_cards.json"""
import json, io, os
from collections import Counter
ROOT = r'F:\ClaudeWork\qiuqiu-tower'
S = os.path.dirname(os.path.abspath(__file__))
Q = {r['id']: r for r in json.load(io.open(ROOT + r'\tools\out\cardvalue.json', encoding='utf-8'))}
cards = []

def add(id, name, pool, rar, typ, cost, text, up, cost2=None, mirror='', note=''):
    cards.append(dict(id=id, name=name, pool=pool, rarity=rar, type=typ, cost=cost, cost2=cost if cost2 is None else cost2,
                      text=text, text2=up, mirror=mirror, mirrorName=(Q[mirror]['name'] if mirror else ''), note=note))

def mir(id, name, src, pool, note='跟球球那張效果一樣，只換名字和圖'):
    q = Q[src]
    add(id, name, pool, q['rarity'], q['type'], q['cost'], q['text'], q['upgrade']['text'], q['upgrade']['cost'], src, note)

# ===== 起手 =====
add('zhuang', '撞一下', '起手', '常見', '攻擊', 1, '造成 5 點傷害。', '造成 8 點傷害。', 1, 'sanjo', '同貓抓，基礎值 5（比貓抓少 1，換血厚）')
add('suoke', '縮殼', '起手', '常見', '技能', 1, '獲得 6 點蜷縮。', '獲得 9 點蜷縮。', 1, 'tanding', '同淡定，多 1 點')
add('zhuangji', '撞擊', '起手', '常見', '攻擊', 1, '造成的傷害等於你現在的蜷縮，而且蜷縮不會因此減少。', '費用變 0。', 0, 'taiji', '阿甲的招牌，起手就有一張（球球要罕見才拿得到）')
add('guixi_qi', '龜息', '起手', '常見', '技能', 1, '獲得 4 點蜷縮，回復 3 點生命。消耗。', '獲得 6 點蜷縮，回復 5 點生命。消耗。', 1, '', '獨有')

# ===== 龜甲流（基本功，對應忍術池）=====
K = '龜甲流'
for args in [('keqiao', '殼角頂', 'shunkan'), ('nijiang', '泥漿彈', 'shengdong'),
             ('kejiewo', '殼借我', 'jiaochulai'), ('hengsao', '橫掃', 'susu'),
             ('shunshi', '順勢一撞', 'luoye'), ('sichuzhangwang', '四處張望', 'qianliyan'), ('manmanxiang', '慢慢想', 'shunfenger'),
             ('deng', '瞪', 'dingshang'), ('xiayitiao', '嚇一跳', 'chudashi'), ('youdongjing', '有動靜', 'youcike'), ('tuotuolala', '拖拖拉拉', 'tuozi'),
             ('shensishulv', '深思熟慮', 'duxin'), ('yingke', '硬殼', 'bianshen'), ('manbanpai', '慢半拍', 'suoyituan'), ('xianduoyixia', '先躲一下', 'zhanshu'),
             ('dihou', '低吼', 'weihe'), ('shaitaiyang', '曬太陽', 'tianmao'), ('houke', '厚殼', 'jiejie'), ('keci', '殼刺', 'fantan'), ('yingci', '硬刺', 'fanzhua'),
             ('tuikai', '推開', 'tuishou'), ('shenxiyikou', '深吸一口氣', 'xuli'), ('dagedun', '打個盹', 'xianshuile'), ('manzou', '慢走', 'gaotui'),
             ('yaoayao', '搖啊搖', 'cuimian'), ('tuigeini', '推給你', 'shuaiguo'), ('yazhu', '壓住', 'fengkou'), ('yazaikexia', '壓在殼下', 'dingshen'),
             ('laojingyan', '老經驗', 'wanhua'), ('yuezhanyueyong', '越戰越勇', 'yingzi'), ('chibaobao', '吃飽飽', 'renwuwancheng'), ('laogutou', '老骨頭', 'tiexin'),
             ('yijingzhidong', '以靜制動', 'wufeng'), ('quandoupaxia', '全都趴下', 'jingzhi'), ('shenhuxisanci', '深呼吸三次', 'sanhua'), ('laoguimingchang', '老龜命長', 'jiuming')]:
    mir(args[0], args[1], args[2], K)
# 龜甲流 獨有
add('dingke', '頂殼', K, '常見', '攻擊', 1, '造成 4 點傷害，獲得 4 點蜷縮。', '造成 6 點傷害，獲得 6 點蜷縮。', 1, '', '獨有：攻守一體')
add('jiabei', '甲背衝撞', K, '常見', '攻擊', 2, '造成 10 點傷害，獲得 5 點蜷縮。', '造成 14 點傷害，獲得 7 點蜷縮。', 2, '', '獨有')
add('zhongta', '重踏', K, '常見', '攻擊', 1, '造成 6 點傷害；你的蜷縮在 10 點以上就再造成 6 點。', '造成 8 點傷害；你的蜷縮在 10 點以上就再造成 8 點。', 1, '', '獨有：新效果「蜷縮門檻加傷」')
add('shuaiwei', '甩尾', K, '常見', '攻擊', 1, '造成 3 點傷害，連打 2 次；每打中一次獲得 2 點蜷縮。', '造成 4 點傷害，連打 2 次；每打中一次獲得 2 點蜷縮。', 1, '', '獨有：新效果「命中得蜷縮」')
add('zhanwen', '站穩', K, '常見', '技能', 0, '獲得 3 點蜷縮。', '獲得 5 點蜷縮。', 0, '', '獨有')
add('shenhuxi', '深呼吸', K, '常見', '技能', 2, '獲得 6 點蜷縮，回復 2 點生命。', '獲得 8 點蜷縮，回復 3 點生命。', 2, '', '獨有')
add('yingjie', '硬接', K, '罕見', '技能', 1, '獲得 8 點蜷縮；這回合獲得 3 點反彈（回合結束消失）。', '獲得 10 點蜷縮；這回合獲得 4 點反彈。', 1, '', '獨有：新效果「本回合反彈」')
add('mojia', '磨甲', K, '稀有', '能力', 3, '使身上的蜷縮數值乘以 2 倍。', '使身上的蜷縮數值乘以 3 倍。', 3, '', '獨有（2026-09-03 使用者改成能力）：需新效果「蜷縮加倍」')
add('laoyou', '老友', K, '罕見', '技能', 1, '抽 2 張牌；你的蜷縮在 10 點以上就再抽 1 張。', '抽 3 張牌；你的蜷縮在 10 點以上就再抽 1 張。', 1, '', '獨有：新效果「蜷縮門檻加抽」')
add('yikehuanjin', '以殼換勁', K, '罕見', '技能', 1, '失去全部蜷縮，每失去 5 點獲得 1 點爪力。', '失去全部蜷縮，每失去 4 點獲得 1 點爪力。', 1, '', '獨有：新效果「蜷縮換爪力」')
add('jiliang', '甲裂', K, '罕見', '攻擊', 2, '造成等同於蜷縮數值的傷害。', '費用變 1。', 1, '', '獨有（2026-09-03 使用者改：不再歸零）')
add('liuke', '留殼', K, '罕見', '能力', 2, '回合開始時蜷縮不歸零。', '費用變 1。', 1, '', '獨有：新效果「留殼」（跟起始秘寶老龜甲疊加時取大）')
add('guijiadun', '龜甲盾', K, '罕見', '技能', 2, '獲得 14 點蜷縮，獲得 3 點反彈。', '獲得 20 點蜷縮，獲得 5 點反彈。', 2, '', '獨有')

# ===== 玄武訣（絕學等級）=====
X = '玄武訣'
for args in [('nizhua', '泥爪', 'tieshazhang'), ('yazhi', '壓制', 'qinna'), ('shuaisha', '甩沙', 'juye'), ('tiejia', '鐵甲', 'jinzhong'),
             ('yingtou', '硬頭', 'tietou'), ('dingxue', '頂穴', 'dianxue'), ('luanzhuang', '亂撞', 'zuiquan'),
             ('nuoyinuo', '挪一挪', 'yixing'), ('jianhuilai', '撿回來', 'gekong'), ('guixidafa', '龜息大法', 'guixi'), ('zhanzhuang', '站樁', 'mabu'),
             ('xujin', '蓄勁', 'yungong'), ('yikefuren', '以殼服人', 'yide'), ('yaoyikou', '咬一口', 'dieda'), ('sanlianding', '三連頂', 'shibadie'),
             ('cijia', '刺甲', 'hujin'), ('yingcheng', '硬撐', 'boming'), ('lianding', '連頂', 'liandao'), ('gunyiquan', '滾一圈', 'shierlian'),
             ('wannianke', '萬年殼', 'huxin'), ('sheshenyizhuang', '捨身一撞', 'wangming'), ('quanliyizhuang', '全力一撞', 'jiuweiquan'),
             ('xigezao', '洗個澡', 'fanpu'), ('suotougong', '縮頭功', 'meikandao'), ('zhuangjizhong', '撞擊・重', 'jiedao')]:
    mir(args[0], args[1], args[2], X)
# 玄武訣 獨有
add('zhongxin', '重心', X, '罕見', '能力', 2, '你的攻擊傷害加上蜷縮除以 5（向下取整）。', '你的攻擊傷害加上蜷縮除以 4（向下取整）。', 2, '', '獨有：新效果「蜷縮加傷」')
add('yifudangguan', '一夫當關', X, '罕見', '技能', 1, '這回合每打出一張會獲得蜷縮的牌，就對目標造成 4 點傷害。', '這回合每打出一張會獲得蜷縮的牌，就對目標造成 6 點傷害。', 1, '', '獨有：本回合能力')
add('kezhen', '殼震', X, '稀有', '攻擊', 3, '對全體魔物造成等同你現在蜷縮的傷害，蜷縮不會因此減少。', '費用變 2。', 2, '', '獨有：全體版撞擊')
add('guixianyizhuang', '龜仙一撞', X, '稀有', '攻擊', 3, '造成等同你現在蜷縮 2 倍的傷害。消耗。', '費用變 2。', 2, '', '獨有')
add('budongrushan', '不動如山', X, '稀有', '能力', 3, '回合結束時蜷縮加倍（最多到 40）。', '回合結束時蜷縮加倍（最多到 60）。', 3, '', '獨有：新效果「蜷縮加倍」')
add('wannianguijia', '萬年龜甲', X, '稀有', '能力', 2, '每回合開始時獲得等同最大生命 5% 的蜷縮，回復 1 點生命。', '每回合開始時獲得等同最大生命 5% 的蜷縮，回復 2 點生命。', 2, '', '獨有')
add('jiakehuichun', '甲殼回春', X, '稀有', '技能', 1, '把蜷縮全部換成生命回復（最多 15 點）。消耗。', '把蜷縮全部換成生命回復（最多 25 點）。消耗。', 1, '', '獨有：新效果「蜷縮換血」')
add('guikezhen', '龜殼陣', X, '稀有', '能力', 2, '每回合開始時，獲得等同蜷縮除以 10 的反彈。', '每回合開始時，獲得等同蜷縮除以 8 的反彈。', 2, '', '獨有：新效果「蜷縮換反彈」')

print(len(cards), '張')
print(Counter((c['pool'], c['rarity']) for c in cards))
print('獨有', sum(1 for c in cards if not c['mirror']), '鏡像', sum(1 for c in cards if c['mirror']))
io.open(ROOT + r'\docs\角色二_烏龜_牌組.json', 'w', encoding='utf-8').write(json.dumps(cards, ensure_ascii=False, indent=1))
io.open(S + r'\turtle_cards.json', 'w', encoding='utf-8').write(json.dumps(cards, ensure_ascii=False))
