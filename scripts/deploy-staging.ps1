# Deploy the validated main-branch commit to the isolated Speed Host staging stack.
# Usage: .\scripts\deploy-staging.ps1 -IdentityFile C:\path\to\staging_key -Apply
param(
  [Parameter(Mandatory = $true)] [string] $IdentityFile,
  [switch] $Apply
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Invoke-Checked([string] $File, [string[]] $Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
}

if ((git status --porcelain).Length -ne 0) { throw 'Working tree must be clean.' }
if ((git branch --show-current) -ne 'main') { throw 'Deploy only main.' }
Invoke-Checked git @('fetch', 'origin', 'main')
$sha = (git rev-parse HEAD).Trim()
$remoteSha = (git rev-parse origin/main).Trim()
if ($sha -ne $remoteSha) { throw 'Local main must match origin/main exactly.' }

$checks = gh api "repos/ebit101/webhost-billing/commits/$sha/check-runs" --jq '.check_runs[] | [.name,.status,.conclusion] | @tsv'
if ($LASTEXITCODE -ne 0) { throw 'Could not read GitHub checks.' }
$validate = @($checks | Where-Object { $_ -match '^Validate\s+completed\s+success$' })
$codeql = @($checks | Where-Object { $_ -match '^Analyze JavaScript and TypeScript\s+completed\s+success$' })
if ($validate.Count -ne 1 -or $codeql.Count -ne 1) {
  throw "Validate and CodeQL must pass for $sha. Current checks: $($checks -join '; ')"
}

$identity = (Resolve-Path -LiteralPath $IdentityFile).Path
$target = 'root@46.250.239.221'
$sshOptions = @('-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', '-i', $identity)
$archive = Join-Path $env:TEMP "webhost-staging-$sha.tar.gz"
$remoteArchive = "/srv/webhost-billing-staging/incoming/webhost-staging-$sha.tar.gz"
Write-Host "Staging source: $sha"
Write-Host 'Target: my.speedhost.bd (isolated staging)'
if (-not $Apply) {
  Write-Host 'Preflight passed. Add -Apply to archive, upload, back up and deploy this commit.'
  exit 0
}

$archiveFile = [System.IO.File]::Create($archive)
try {
  $git = [System.Diagnostics.Process]::new()
  $git.StartInfo.FileName = 'git'
  $git.StartInfo.UseShellExecute = $false
  $git.StartInfo.RedirectStandardOutput = $true
  $git.StartInfo.ArgumentList.Add('archive')
  $git.StartInfo.ArgumentList.Add('--format=tar.gz')
  $git.StartInfo.ArgumentList.Add($sha)
  if (-not $git.Start()) { throw 'Could not start git archive.' }
  $git.StandardOutput.BaseStream.CopyTo($archiveFile)
  $git.WaitForExit()
  if ($git.ExitCode -ne 0) { throw 'git archive failed.' }
} finally { $archiveFile.Dispose() }

$archiveSha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Invoke-Checked scp (@('-q') + $sshOptions + @($archive, "${target}:$remoteArchive"))
$deployScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\deploy\staging\deploy-release.sh') -Raw
$deployScript | ssh @sshOptions $target "set -o pipefail; tr -d '\r' | bash -s -- $sha $archiveSha"
if ($LASTEXITCODE -ne 0) { throw 'Staging deploy failed. Inspect the server before retrying.' }
Write-Host "Staging release deployed: $sha"
