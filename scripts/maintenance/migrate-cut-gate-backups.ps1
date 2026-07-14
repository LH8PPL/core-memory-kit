# migrate-cut-gate-backups.ps1
# Moves the flat *cut-gate* backup dirs from $HOME into a central, structured
# C:\cut-gate-backups\ root. DRY-RUN by default — pass -Apply to actually move.
#
#   powershell -File C:\Temp\migrate-cut-gate-backups.ps1            # preview
#   powershell -File C:\Temp\migrate-cut-gate-backups.ps1 -Apply     # do it

param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$home_ = $env:USERPROFILE
$root  = 'C:\cut-gate-backups'

# Explicit map: source dir name (in $HOME) -> destination subfolder under $root.
# The tier file (.core-memory-kit) lands as BEFORE-.core-memory-kit inside it.
# Ordering prefix keeps them chronological-ish by the version/gate they belong to.
$map = [ordered]@{
  'v0.2.2-cut-backup-.core-memory-kit'        = '01_v0.2.2_cut'
  'cut-gate3-.core-memory-kit'                = '02_vUnknown_cut-gate3'
  'cut-gate-6-.core-memory-kit.bak'           = '03_vUnknown_cut-gate6'
  'cut-gate7-.core-memory-kit'                = '04_vUnknown_cut-gate7'
  'cut-gate8-.core-memory-kit'                = '05_vUnknown_cut-gate8'
  'cut-gate-9-.core-memory-kit'               = '06_vUnknown_cut-gate9'
  'cut-gate10-.core-memory-kit'               = '07_vUnknown_cut-gate10'
  'before-cut-gate-0.3.2-.core-memory-kit'    = '08_v0.3.2_cut-gate'
  'before-cut-gate-0.3.3-.core-memory-kit'    = '09_v0.3.3_cut-gate'
  'before-cut-gate16-v0.3.3-.core-memory-kit' = '10_v0.3.3_cut-gate16'
  'before-cut-gate17-v0.3.4-.core-memory-kit' = '11_v0.3.4_cut-gate17'
}

Write-Host "Backup root: $root" -ForegroundColor Cyan
Write-Host ("Mode: " + $(if ($Apply) { 'APPLY (will move)' } else { 'DRY-RUN (preview only)' })) -ForegroundColor $(if ($Apply) { 'Yellow' } else { 'Green' })
Write-Host ""

if ($Apply -and -not (Test-Path $root)) { New-Item -ItemType Directory -Path $root | Out-Null }

$moved = 0; $missing = 0
foreach ($name in $map.Keys) {
  $src  = Join-Path $home_ $name
  $dest = Join-Path $root  $map[$name]
  $tier = Join-Path $dest  'BEFORE-.core-memory-kit'

  if (-not (Test-Path $src)) {
    Write-Host "  SKIP (not found): $name" -ForegroundColor DarkGray
    $missing++
    continue
  }

  Write-Host "  $name"
  Write-Host "    -> $tier"
  if ($Apply) {
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Move-Item -Path $src -Destination $tier
    $moved++
  }
}

Write-Host ""
if ($Apply) {
  Write-Host "Done. Moved $moved dir(s); $missing not found." -ForegroundColor Green
} else {
  Write-Host "Preview only. Re-run with -Apply to move $($map.Count - $missing) dir(s)." -ForegroundColor Green
}
