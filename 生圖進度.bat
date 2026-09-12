@echo off
chcp 65001 >nul
title Feifei art progress
:loop
cls
echo ==== %date% %time% ====
echo.
powershell -NoProfile -Command "$raw='F:\ClaudeWork\qiuqiu-coop\tools\codex_raw';$s=@(Get-ChildItem -LiteralPath $raw -Filter 'hero_feifei_*.png' -EA 0).Count;$c=@(Get-ChildItem -LiteralPath $raw -Filter 'card_feifei_*.png' -EA 0).Count;$t=@(Get-ChildItem -LiteralPath $raw -Filter 'feifei_still_*.png' -EA 0).Count;Write-Host ('sprites ' + $s + '/14   cards ' + $c + '/121   story ' + $t + '/4');Write-Host ('TOTAL ' + ($s+$c+$t) + ' / 139');Write-Host '';$f='C:\Users\yayax\AppData\Local\Temp\feifei_all.log';if(Test-Path -LiteralPath $f){Get-Content -LiteralPath $f -Encoding UTF8 -Tail 12}else{Write-Host 'log not found'}"
echo.
echo (refresh every 15s - close this window to stop)
timeout /t 15 >nul
goto loop
