param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:5193/qiuqiu-tower-coop/'
$server = Join-Path $PSScriptRoot 'art_preview_server.mjs'
$logDir = Join-Path $PSScriptRoot 'out\art-preview'
if (-not (Test-Path -LiteralPath (Join-Path $repo 'dist\index.html'))) { throw 'No dist build. Run: SITE_NAME=qiuqiu-tower-coop npm run build' }

function Test-Up {
    try { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; return $r.StatusCode -eq 200 } catch { return $false }
}

if (-not (Test-Up)) {
    if (Get-NetTCPConnection -LocalPort 5193 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5193 is used by another server.' }
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"{0}"' -f $server) -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        if (Test-Up) { $ready = $true; break }
        if ($process.HasExited) { throw ('Preview server stopped. See ' + $logDir) }
        Start-Sleep -Milliseconds 150
    }
    if (-not $ready) { throw ('Preview server did not become ready. See ' + $logDir) }
}
Write-Output $url
if (-not $NoBrowser) { Start-Process $url }
