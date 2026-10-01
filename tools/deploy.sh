#!/bin/sh
# 推上線，並且**等到部署真的成功、線上真的換成這一版**才算數（2026-09-14）。
#
#   sh tools/deploy.sh                 連線版：coop → coopdeploy 的 main
#   sh tools/deploy.sh origin main     單機版：main → origin 的 main
#
# 推之前這支自己先跑四道門檻（畫面比對閘門 tools/visual-gate/gate.mjs：跟線上那一版比角色大小、貓窩位置、動作流暢度、事件圖片），
# **沒過就不推**（2026-10-02 使用者裁定接成必經步驟）。
# 起因：10-02 凌晨我把閘門跟部署串成 `gate | tail && deploy`，`tail` 永遠回成功，閘門紅了照樣推上線。
# 比的是**要推的那一筆提交**（`--head`），不是工作樹，手上沒提交的改動不會混進來。
# 動作流暢度偶爾會量歪一次（10-02 同一版重跑兩次都過），所以不通過時**自動重跑一次**，兩次都不過才擋。
# 真的要跳過：`QIUQIU_SKIP_GATE=1 sh tools/deploy.sh …`——只有使用者明講可以跳才准用。
#
# 為什麼要有這支：2026-09-13 連續八次部署失敗，其中六次我都只看 `git push` 回報成功
# 就跟使用者說「上線了」。`git push` 成功只代表檔案傳上去了；雲端的測試、打包、發布
# 任何一步紅了，線上都還是舊的那版，而且沒有人會通知你——除了使用者收到的失敗信。
#
# 三步，缺一步都不能說上線：
#   1. 推（推之前 `.git/hooks/pre-push` → `tools/prepush_gate.sh` 會先在那一筆上跑測試與打包）
#   2. 等 GitHub Actions 跑完，紅了就把紅的那段印出來
#   3. 抓線上首頁，確認主程式檔名跟閘門打出來的一樣（不一樣＝線上還是舊版，或快取沒換）

set -u
# 一律在倉庫根目錄跑：閘門與打包都用相對路徑，從子資料夾叫會找不到檔、被誤當成「門檻沒過」（審查 2026-10-02 低-3）
cd "$(git rev-parse --show-toplevel)" || exit 1
remote="${1:-coopdeploy}"
src="${2:-coop}"
case "$remote" in
  coopdeploy) repo=yayaxcharles/qiuqiu-tower-coop; site=https://yayaxcharles.github.io/qiuqiu-tower-coop/ ;;
  origin)     repo=yayaxcharles/qiuqiu-tower;      site=https://yayaxcharles.github.io/qiuqiu-tower/ ;;
  *) echo "不認得的遠端：$remote（只收 coopdeploy 或 origin）"; exit 1 ;;
esac

sha=$(git rev-parse "$src") || exit 1
short=$(git rev-parse --short "$sha")
if [ "${QIUQIU_SKIP_GATE:-}" = "1" ]; then
  echo "== 0/3 ⚠ 跳過四道門檻（QIUQIU_SKIP_GATE=1，必須是使用者明講的）"
else
  case "$remote" in coopdeploy) gate_site=coop ;; *) gate_site=single ;; esac
  gate_rc=2
  for attempt in 1 2; do
    echo "== 0/3 四道門檻（第 $attempt 次）：$short 對線上那一版，約一分半"
    gate_log=$(mktemp)
    node tools/visual-gate/gate.mjs --head "$sha" --site "$gate_site" > "$gate_log" 2>&1
    gate_rc=$?   # 先拿閘門自己的離開碼再挑重點印；不能寫成 `| grep`，管線的離開碼會變成 grep 的
    grep -E '畫面比對閘門|：(通過|不通過)|✗|報告：|錯誤|Error' "$gate_log"
    # 沒過時把最後一段原始輸出也印出來：打包失敗、找不到 Chrome 這類訊息上面那行挑不到（審查 2026-10-02 低-2）
    [ "$gate_rc" = "0" ] || { echo "   ── 閘門最後 20 行 ──"; tail -20 "$gate_log"; }
    rm -f "$gate_log"
    [ "$gate_rc" = "0" ] && break
    [ "$gate_rc" = "1" ] || break   # 2＝閘門自己出錯，重跑也沒用
  done
  if [ "$gate_rc" != "0" ]; then
    if [ "$gate_rc" = "1" ]; then echo "✗ 四道門檻兩次都沒過，不推。看上面的報告"; else echo "✗ 四道門檻自己出錯（離開碼 $gate_rc），不推"; fi
    exit 1
  fi
fi
# 中繼（worker/）不是雲端 Actions 部署的：這次要推的東西動到它就先 `wrangler deploy`（審查 2026-09-15 中-2：
# 不然這支會印「上線了」，線上中繼卻還是舊的）。只在推連線版時做，單機版跟中繼無關
if [ "$remote" = "coopdeploy" ] && [ -n "$(git diff --name-only "$remote/main..$src" -- worker/ 2>/dev/null)" ]; then
  echo "== 0/3 這次動到 worker/，先部署中繼"
  (cd worker && npx wrangler deploy) || { echo "✗ 中繼部署失敗，網頁先不推"; exit 1; }
fi
echo "== 1/3 推 $src（$short）到 $remote 的 main"
git push "$remote" "$src:main" || { echo "✗ 推送沒成功（被閘門擋下，或網路問題）"; exit 1; }

echo "== 2/3 等 GitHub Actions 跑完"
run=""
tries=0
# 用 until 不用 while：`[ -n "$run" ]` 還沒成立時要繼續等（記憶池 reference_wait_for_process_windows）
until [ -n "$run" ]; do
  tries=$((tries + 1))
  [ "$tries" -gt 40 ] && { echo "✗ 兩分鐘內沒看到 $short 的部署被排進去"; exit 1; }
  sleep 3
  run=$(gh run list -R "$repo" --commit "$sha" -L 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null)
done
echo "   部署編號 $run"
gh run watch "$run" -R "$repo" --exit-status > /dev/null 2>&1
conclusion=$(gh run view "$run" -R "$repo" --json conclusion --jq .conclusion)
if [ "$conclusion" != "success" ]; then
  echo "✗ 部署結果：$conclusion。紅的那段："
  gh run view "$run" -R "$repo" --log-failed 2>/dev/null | grep -E "FAIL|Error|error|✗|×" | head -30
  exit 1
fi
echo "   部署成功"

echo "== 3/3 確認線上真的換成這一版"
record="$(git rev-parse --git-common-dir)/qiuqiu_gate_last"
want=""
if [ -f "$record" ] && [ "$(cut -d' ' -f1 "$record")" = "$sha" ]; then
  want=$(cut -d' ' -f2 "$record")
fi
got=""
tries=0
until [ -n "$want" ] && [ "$got" = "$want" ]; do
  tries=$((tries + 1))
  # 加查詢字串破快取（記憶池 project_personal_website：驗收要破快取）
  got=$(curl -s "$site?v=$(date +%s)" | grep -oE 'main-[A-Za-z0-9_-]+\.js' | head -1)
  [ -z "$want" ] && break
  [ "$tries" -gt 20 ] && break
  [ "$got" = "$want" ] || sleep 6
done
if [ -z "$want" ]; then
  echo "⚠ 沒有閘門的打包紀錄可比（這次推送跳過了閘門？），線上主程式是 $got，請自己確認"
  exit 2
fi
if [ "$got" != "$want" ]; then
  echo "✗ 線上主程式是 $got，閘門打出來的是 $want——線上還不是這一版"
  exit 1
fi
echo "✓ 上線了：$site（主程式 $got）"
