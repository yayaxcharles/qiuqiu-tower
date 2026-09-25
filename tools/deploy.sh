#!/bin/sh
# 推上線，並且**等到部署真的成功、線上真的換成這一版**才算數（2026-09-14）。
#
#   sh tools/deploy.sh                 連線版：coop → coopdeploy 的 main
#   sh tools/deploy.sh origin main     單機版：main → origin 的 main
#
# 推前先跑 `npm run gate:visual`（畫面比對閘門：跟線上那一版比角色大小、貓窩位置、動作流暢度、事件圖片四道門檻，
# 報告路徑印在最後；見 tools/visual-gate/gate.mjs）。它**沒有**接成這支的必經步驟：誤報會卡住部署，要不要硬接由使用者決定。
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
remote="${1:-coopdeploy}"
src="${2:-coop}"
case "$remote" in
  coopdeploy) repo=yayaxcharles/qiuqiu-tower-coop; site=https://yayaxcharles.github.io/qiuqiu-tower-coop/ ;;
  origin)     repo=yayaxcharles/qiuqiu-tower;      site=https://yayaxcharles.github.io/qiuqiu-tower/ ;;
  *) echo "不認得的遠端：$remote（只收 coopdeploy 或 origin）"; exit 1 ;;
esac

sha=$(git rev-parse "$src") || exit 1
short=$(git rev-parse --short "$sha")
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
