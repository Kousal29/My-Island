<#
  Builds an installer of My Island to share with friends.

    .\scripts\build-beta.ps1                         # test build, expires in 21 days
    .\scripts\build-beta.ps1 -Expires 2026-12-01     # test build, explicit date
    .\scripts\build-beta.ps1 -NoKillSwitch           # test build without the online off-switch
    .\scripts\build-beta.ps1 -NoExpiry               # permanent build (no expiry, no off-switch)

  Test builds:
  - After -Expires the app shows "This test build has ended" and quits. Reinstalling doesn't
    help (the date is inside the installer) and rolling the PC clock back is detected.
  - Kill switch: set "enabled": false in beta.json (pushed to GitHub) to end the test early,
    even before the date. Testers need internet for that part; the date always applies.
  - Settings > About shows days left and a "Send feedback" button (-FeedbackUrl).

  Output: a single setup .exe in the project folder — that's the file you send.
#>
param(
  [string]$Expires = (Get-Date).AddDays(21).ToString("yyyy-MM-dd"),
  [string]$KillSwitchUrl = "https://gist.githubusercontent.com/Kousal29/11296ab204396bf5d235fae625748a30/raw/beta.json",
  [string]$FeedbackUrl = "https://github.com/Kousal29/My-Island/issues/new?title=Feedback&labels=feedback",
  [switch]$NoKillSwitch,
  [switch]$NoExpiry
)

# Native tools (cargo/npm) write progress to stderr; with "Stop", Windows PowerShell 5 would treat
# that as a failure. Check exit codes explicitly instead.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

if ($NoExpiry) {
  Remove-Item Env:\MY_ISLAND_BETA_EXPIRES, Env:\MY_ISLAND_BETA_URL -ErrorAction SilentlyContinue
  $env:MY_ISLAND_FEEDBACK_URL = $FeedbackUrl
  Write-Host "Building a permanent build (no expiry)" -ForegroundColor Cyan
} else {
  if ($Expires -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "Expires must look like 2026-12-01" }
  $env:MY_ISLAND_BETA_EXPIRES = $Expires
  $env:MY_ISLAND_FEEDBACK_URL = $FeedbackUrl
  if ($NoKillSwitch) { Remove-Item Env:\MY_ISLAND_BETA_URL -ErrorAction SilentlyContinue } else { $env:MY_ISLAND_BETA_URL = $KillSwitchUrl }
  Write-Host "Building test build that expires $Expires" -ForegroundColor Cyan
  if (-not $NoKillSwitch) { Write-Host "Kill switch: $KillSwitchUrl" -ForegroundColor DarkGray }
}

# These values are compiled in, so make sure the app crate is rebuilt with them.
cargo clean -p my-island --release --manifest-path src-tauri/Cargo.toml *> $null
# Call the CLI directly: through `npm run`, PowerShell drops the `--` and npm eats `--bundles`.
npx tauri build --bundles nsis
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed (exit $LASTEXITCODE)" -ForegroundColor Red; exit $LASTEXITCODE }

$bundle = Get-ChildItem "src-tauri/target/release/bundle/nsis/*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($bundle) {
  $name = if ($NoExpiry) { "My-Island-Setup.exe" } else { "My-Island-Test-until-$Expires.exe" }
  $out = Join-Path (Get-Location) $name
  Copy-Item $bundle.FullName $out -Force
  Write-Host "`nShare this file: $out" -ForegroundColor Green
}
