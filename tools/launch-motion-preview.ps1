param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:5192/qiuqiu-tower-coop/?motion-preview'
$probe = 'http://127.0.0.1:5192/qiuqiu-tower-coop/src/main.ts'
$logDir = Join-Path $PSScriptRoot 'out\motion-preview'
$vite = Join-Path $repo 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vite)) { throw 'Missing dependencies. Run npm install in the project folder first.' }

function Test-PreviewServer {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $probe -TimeoutSec 2
        return $response.Content.Contains('startMotionPreview')
    } catch { return $false }
}

if (-not (Test-PreviewServer)) {
    if (Get-NetTCPConnection -LocalPort 5192 -State Listen -ErrorAction SilentlyContinue) {
        throw 'Port 5192 is used by another server. Close that server before retrying.'
    }
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $oldSiteName = $env:SITE_NAME
    try {
        $env:SITE_NAME = 'qiuqiu-tower-coop'
        $process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"{0}" --host 127.0.0.1 --port 5192 --strictPort' -f $vite) -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'vite.log') -RedirectStandardError (Join-Path $logDir 'vite-error.log')
    } finally { $env:SITE_NAME = $oldSiteName }
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        if (Test-PreviewServer) { $ready = $true; break }
        if ($process.HasExited) { throw ('Preview server stopped. See ' + $logDir) }
        Start-Sleep -Milliseconds 150
    }
    if (-not $ready) { throw ('Preview server did not become ready. See ' + $logDir) }
}
Write-Output $url
if (-not $NoBrowser) { Start-Process $url }
