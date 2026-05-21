#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Install claude-memory-kit into a target project directory.

.DESCRIPTION
  Copies template/ contents (with {{TODAY}} / {{PROJECT_NAME}} substitution) into TargetDir.
  Skips any files that already exist — never overwrites user content.

.EXAMPLE
  pwsh install.ps1 C:\Projects\my-new-project

.EXAMPLE
  pwsh install.ps1   # installs into current directory
#>
[CmdletBinding()]
param(
    [string]$TargetDir = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

$KitRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Template = Join-Path $KitRoot 'template'

if (-not (Test-Path $Template)) {
    Write-Error "template/ not found at $Template"
    exit 1
}

$Target = (Resolve-Path $TargetDir).Path
$ProjectName = Split-Path -Leaf $Target
$Today = (Get-Date -Format 'yyyy-MM-dd')

Write-Host "Installing claude-memory-kit into: $Target"
Write-Host "Project name: $ProjectName"
Write-Host ""

$dirs = @(
    '.claude\hooks',
    '.claude\skills\memory-write',
    'context\memory',
    'context\sessions',
    'context\transcripts',
    'scripts',
    'milvus-deploy',
    'cron\jobs'
)
foreach ($d in $dirs) {
    $p = Join-Path $Target $d
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

function Copy-IfNew([string]$src, [string]$dst) {
    if (Test-Path $dst) { Write-Host "  SKIP  $dst (already exists)"; return }
    Copy-Item -Path $src -Destination $dst -Force
    Write-Host "  COPY  $dst"
}

function Render-IfNew([string]$src, [string]$dst) {
    if (Test-Path $dst) { Write-Host "  SKIP  $dst (already exists)"; return }
    $content = Get-Content -Path $src -Raw -Encoding UTF8
    $content = $content.Replace('{{TODAY}}', $Today).Replace('{{PROJECT_NAME}}', $ProjectName)
    [System.IO.File]::WriteAllText($dst, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  RENDER $dst"
}

Write-Host "--- .claude/ ---"
Copy-IfNew "$Template\.claude\settings.json"                          "$Target\.claude\settings.json"
Copy-IfNew "$Template\.claude\hooks\transcript-capture.js"            "$Target\.claude\hooks\transcript-capture.js"
Copy-IfNew "$Template\.claude\hooks\pre-tool-memory.js"               "$Target\.claude\hooks\pre-tool-memory.js"
Copy-IfNew "$Template\.claude\skills\memory-write\SKILL.md"           "$Target\.claude\skills\memory-write\SKILL.md"

Write-Host "--- context/ ---"
Render-IfNew "$Template\context\USER.md.template"          "$Target\context\USER.md"
Render-IfNew "$Template\context\MEMORY.md.template"        "$Target\context\MEMORY.md"
Render-IfNew "$Template\context\SOUL.md.template"          "$Target\context\SOUL.md"
Render-IfNew "$Template\context\memory\INDEX.md.template"  "$Target\context\memory\INDEX.md"
Copy-IfNew   "$Template\context\SETUP.md"                  "$Target\context\SETUP.md"

Write-Host "--- scripts/ ---"
Copy-IfNew "$Template\scripts\auto-extract-memory.sh"         "$Target\scripts\auto-extract-memory.sh"
Copy-IfNew "$Template\scripts\memsearch-index-with-flush.sh"  "$Target\scripts\memsearch-index-with-flush.sh"
Copy-IfNew "$Template\scripts\register-crons.py"              "$Target\scripts\register-crons.py"
Copy-IfNew "$Template\scripts\refresh-distill-timestamp.py"   "$Target\scripts\refresh-distill-timestamp.py"
Copy-IfNew "$Template\scripts\run-daily-distill.sh"           "$Target\scripts\run-daily-distill.sh"
Copy-IfNew "$Template\scripts\run-weekly-curate.sh"           "$Target\scripts\run-weekly-curate.sh"

Write-Host "--- milvus-deploy/ ---"
Copy-IfNew "$Template\milvus-deploy\docker-compose.yml" "$Target\milvus-deploy\docker-compose.yml"
Copy-IfNew "$Template\milvus-deploy\README.md"          "$Target\milvus-deploy\README.md"

Write-Host "--- cron/jobs/ ---"
Get-ChildItem "$Template\cron\jobs\*.md" | ForEach-Object {
    Copy-IfNew $_.FullName (Join-Path "$Target\cron\jobs" $_.Name)
}

Write-Host "--- CLAUDE.md ---"
if (Test-Path "$Target\CLAUDE.md") {
    Write-Host "  SKIP  $Target\CLAUDE.md (already exists — see template/CLAUDE.md.template for the memory-system block to merge in)"
} else {
    Render-IfNew "$Template\CLAUDE.md.template" "$Target\CLAUDE.md"
}

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "  1. Open this project in Claude Code as the PRIMARY working directory."
Write-Host "  2. Follow $Target\context\SETUP.md to install Layers 5 (memsearch) and 6 (cron jobs)."
Write-Host "  3. See $KitRoot\INSTALL-windows.md for Windows-specific prerequisite setup."
