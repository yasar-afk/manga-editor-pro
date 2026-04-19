$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $root 'reports\runs\lostend_4'

Write-Host "Manga test baslatiliyor..." -ForegroundColor Cyan
Write-Host "Cikti klasoru: $outDir" -ForegroundColor DarkGray

python (Join-Path $root 'batch_manga_test.py') `
  --preset lostend_4 `
  --out-dir $outDir `
  --background-mode transparent `
  --render-mode web_sim

$report = Join-Path $outDir 'report.html'
if (Test-Path $report) {
  Write-Host "Rapor hazir: $report" -ForegroundColor Green
  Start-Process $report
} else {
  Write-Host "Rapor olusmadi." -ForegroundColor Red
}
