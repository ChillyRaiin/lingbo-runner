param([ValidateSet('start','doctor','test','check','python-test','package','backup')][string]$Action = 'doctor')
$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeCandidates = @()
if ($env:XUNRUN_NODE) { $nodeCandidates += $env:XUNRUN_NODE }
else {
  $nodeCandidates += Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) { $nodeCandidates += $nodeCommand.Source }
}
$nodeExecutable = $null
foreach ($candidate in $nodeCandidates) {
  if (Test-Path -LiteralPath $candidate) {
    $version = & $candidate --version
    if ($LASTEXITCODE -eq 0 -and $version -match '^v24\.') { $nodeExecutable = $candidate; break }
  }
}
if (!$nodeExecutable) { throw '需要Node24；可设置XUNRUN_NODE为实际node.exe路径。' }
Push-Location -LiteralPath $projectDirectory
try {
  Write-Host "运行环境：$nodeExecutable"
  switch ($Action) {
    'start' { & $nodeExecutable 'server/index.mjs' }
    'doctor' { & $nodeExecutable 'scripts/doctor.mjs' }
    'test' { & $nodeExecutable '--test' 'tests/*.test.mjs' }
    'check' { & $nodeExecutable 'scripts/check-project.mjs' }
    'python-test' { & $nodeExecutable 'scripts/python-tools.mjs' 'test' }
    'package' { & $nodeExecutable 'scripts/python-tools.mjs' 'package' }
    'backup' { & $nodeExecutable 'scripts/python-tools.mjs' 'backup' }
  }
  $commandExitCode = $LASTEXITCODE
} finally { Pop-Location }
exit $commandExitCode
