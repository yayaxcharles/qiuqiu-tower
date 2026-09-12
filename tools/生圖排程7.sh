#!/bin/sh
# 收尾第三輪（2026-09-13 04:10）。取代排程 5／6——那兩支被稽核抓到四個洞，整支重寫。
#
# 順序：走鐘 5 張重生 → 事件結果圖 61 張。**一次只跑一批**（codex_gen 規則 1）。
#
# 稽核抓到、這一版修掉的（原因寫在各段旁邊）：
#   高-1 那 5 張的原稿還在 codex_raw，codex_gen 會「已存在跳過」＝整批空轉
#        → 已在跑這支之前把原稿改名成 .previous-20260913.png 留底
#   高-2 xuli 是牌面，看門狗看到 webp 已存在就不再收 → 這裡自己叫 add_card_art.py
#   中-12 用萬用字元收圖會掃到她專屬事件的舊圖（包含那張膨脹成球的 signal_r1），
#        每 15 分鐘重推一次 → 改成「工單的鍵 ∩ codex_raw 實際有的」
#   低-13 `ls a b c && cd ../..` 只要缺一個檔就不會 cd 回去，下一行在錯的目錄跑
#        → 改成把 cd 包在命令替換的子殼裡
#   低-14 生圖整批夭折時 log 不會有「結束：」，`until` 會等到天亮
#        → 開跑前先刪舊 log，等待迴圈加次數上限
set -u
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp

# 依工單的鍵，列出 codex_raw 裡真的存在的那些（留底檔不算）
pending() {
  python - "$1" <<'PY'
import json, pathlib, sys
raw = pathlib.Path('tools/codex_raw')
for k in json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')):
    if (raw / k).exists() and '.previous-' not in k:
        print(k)
PY
}

# 等一批生圖收尾。$1＝log、$2＝最多等幾分鐘。回傳 1 代表等爆了。
wait_batch() {
  n=0
  until grep -q '^結束：' "$1" 2>/dev/null; do
    n=$((n + 1))
    if [ "$n" -gt "$2" ]; then
      echo "!! 等了 $2 分鐘還沒看到「結束：」，那批可能整個夭折了，看一下 $1"
      return 1
    fi
    sleep 60
  done
  return 0
}

# ---- 第一批：走鐘 5 張 ----
rm -f $L/feifei_offmodel.log
python tools/codex_gen.py tools/codex_jobs/feifei_offmodel_redo.json \
  --ref tools/ref/feifei_ref.png > $L/feifei_offmodel.log 2>&1
echo "== 走鐘 5 張重生完 =="
tail -1 $L/feifei_offmodel.log

files=$(pending tools/codex_jobs/feifei_offmodel_redo.json)
evs=$(echo "$files" | grep '^event_' || true)
cards=$(echo "$files" | grep '^card_' || true)
[ -n "$evs" ] && { python tools/add_event_art.py $evs || echo "!! 事件圖進倉失敗"; }
# 牌面自己收：看門狗只收「還沒有 webp」的，xuli 早就有一張舊的，它不會再碰
[ -n "$cards" ] && { python tools/add_card_art.py $cards || echo "!! 牌面進倉失敗"; }

# ---- 第二批：事件結果圖 61 張（約五個半小時，邊生邊收）----
rm -f $L/feifei_result.log
python tools/codex_gen.py tools/codex_jobs/feifei_result_art.json > $L/feifei_result.log 2>&1 &
GEN=$!

while kill -0 $GEN 2>/dev/null; do
  sleep 900
  files=$(pending tools/codex_jobs/feifei_result_art.json)
  if [ -n "$files" ]; then
    python tools/add_event_art.py $files >> $L/feifei_result_integrate.log 2>&1 \
      && echo "$(date +%H:%M) 收了 $(echo "$files" | wc -l) 張" \
      || echo "$(date +%H:%M) !! 進倉失敗"
  fi
done
wait $GEN 2>/dev/null || true

echo "== 生圖結束 =="
tail -1 $L/feifei_result.log
files=$(pending tools/codex_jobs/feifei_result_art.json)
if [ -n "$files" ]; then
  python tools/add_event_art.py $files || echo "!! 最後這輪進倉失敗，等人看一眼"
else
  echo "（沒有待收的，前面幾輪已經收乾淨了）"
fi
echo "== 全部結束 =="
