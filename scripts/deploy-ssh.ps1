[CmdletBinding()]
param(
  [Parameter(Mandatory)] [ValidatePattern('^[0-9a-f]{40}$')] [string] $Commit,
  [string] $IdentityFile = "$env:USERPROFILE\.ssh\webhost_billing_46_250_239_221_ed25519",
  [switch] $Apply
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$identity = (Resolve-Path -LiteralPath $IdentityFile).Path
$target = 'root@46.250.239.221'
$incoming = '/srv/webhost-billing-staging/incoming'
$sshOptions = @(
  '-o', 'BatchMode=yes',
  '-o', 'IdentitiesOnly=yes',
  '-o', 'StrictHostKeyChecking=yes',
  '-o', 'ConnectTimeout=8',
  '-i', $identity
)

function Invoke-Checked([string] $Command, [string[]] $Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE."
  }
}

$package = (Invoke-Checked git @('-C', $root, 'show', "${Commit}:package.json")) -join [Environment]::NewLine | ConvertFrom-Json
$webPackage = (Invoke-Checked git @('-C', $root, 'show', "${Commit}:apps/web/package.json")) -join [Environment]::NewLine | ConvertFrom-Json
$version = [string] $package.version
if ($version -cnotmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$' -or $webPackage.version -cne $version) {
  throw 'The selected commit must have matching root and web release versions.'
}
$tag = "v$version"
$changelog = (Invoke-Checked git @('-C', $root, 'show', "${Commit}:CHANGELOG.md")) -join [Environment]::NewLine
$heading = [regex]::Escape("## [$version]")
$section = [regex]::Match($changelog, "(?ms)^$heading[ \t]+-[ \t]+\d{4}-\d{2}-\d{2}[ \t]*\r?\n(?<body>.*?)(?=^## |\z)")
if (!$section.Success -or $section.Groups['body'].Value -notmatch '(?m)^-[ \t]+\S') {
  throw "The selected commit must have a dated changelog entry for $tag."
}
$tagCommit = Invoke-Checked git @('-C', $root, 'rev-parse', '--verify', "refs/tags/${tag}^{commit}")
if ($tagCommit -cne $Commit) {
  throw "The $tag tag must point to the selected deployment commit."
}

$deployScript = Invoke-Checked git @('-C', $root, 'show', "${Commit}:deploy/staging/deploy-release.sh")
if (!$deployScript) { throw 'The selected commit has no server deployment script.' }

Write-Host "Release $tag ($Commit) for my.speedhost.bd"
Invoke-Checked ssh ($sshOptions + @($target, "test -w '$incoming'"))
if (!$Apply) {
  Write-Host 'SSH preflight passed. Add -Apply to deploy this commit.'
  exit 0
}

$archive = Join-Path ([IO.Path]::GetTempPath()) "webhost-$Commit-$([guid]::NewGuid().ToString('N')).tar.gz"
$remoteArchive = "$incoming/webhost-staging-$Commit.tar.gz"
try {
  Invoke-Checked git @('-C', $root, 'archive', '--format=tar.gz', "--output=$archive", $Commit)
  $checksum = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  Invoke-Checked scp ($sshOptions + @($archive, "${target}:$remoteArchive"))
  $deployScript | ssh @sshOptions $target "set -o pipefail; tr -d '\r' | bash -s -- $Commit $checksum"
  if ($LASTEXITCODE -ne 0) { throw 'Deployment failed. Inspect the active release before retrying.' }
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
}
