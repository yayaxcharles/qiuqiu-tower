param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'launch-motion-preview.ps1') -NoBrowser:$NoBrowser
