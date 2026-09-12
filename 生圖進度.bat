@echo off
chcp 65001 >nul
title Feifei art progress
:loop
cls
echo ==== %date% %time% ====
echo.
powershell -NoProfile -Command "$raw='F:\ClaudeWork\qiuqiu-coop\tools\codex_raw';function C($p){@(Get-ChildItem -LiteralPath $raw -Filter $p -EA 0).Count}$s=C 'hero_feifei_*.png'; $c=C 'card_feifei_*.png'; $t=C 'feifei_still_*.png';$e=C 'event_feifei_*.png'; $r=C 'relic_backstep.png';Write-Host ('  sprites  ' + $s + ' / 20    14 + 6 new poses');Write-Host ('  cards    ' + $c + ' / 121   25 hers + 96 shared');Write-Host ('  story    ' + $t + ' / 4');Write-Host ('  events   ' + $e + ' / 4');Write-Host ('  relic    ' + $r + ' / 1');$tot=$s+$c+$t+$e+$r;Write-Host '';Write-Host ('  TOTAL    ' + $tot + ' / 150    done ' + [math]::Round($tot*100/150) + ' pct');Write-Host '';$f='C:\Users\yayax\AppData\Local\Temp\feifei_all.log';if(Test-Path -LiteralPath $f){Get-Content -LiteralPath $f -Encoding UTF8 -Tail 10}else{Write-Host 'log not found'}"
echo.
echo (refresh every 15s - close this window to stop)
timeout /t 15 >nul
goto loop
