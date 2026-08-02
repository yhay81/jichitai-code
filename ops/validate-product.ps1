[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_telemetry.sql"
$AppPath = Join-Path $RepoRoot "public\app.js"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$SourcePath = Join-Path $RepoRoot "SOURCE.md"
$WranglerPath = Join-Path $RepoRoot "wrangler.jsonc"
$PublicDirectory = Join-Path $RepoRoot "public"
$DataPath = Join-Path $PublicDirectory "data\index.json"

$RequiredFiles = @(
    "DECISIONS.md", "EXPERIMENT.md", "LICENSE", "METRICS.md", "PRIVACY.md", "README.md", "SECURITY.md", "SOURCE.md", "STACK.md",
    ".github\workflows\ci.yml", "migrations\0001_telemetry.sql", "ops\product-metrics.ps1", "ops\product-metrics.sql",
    "ops\submit-indexnow.ps1", "public\app.js", "public\data\index.json", "public\favicon.svg", "public\manifest.webmanifest", "public\og.svg", "public\robots.txt",
    "scripts\build-data.ps1", "src\worker.tsx", "test\municipality-data.test.ts", "test\surface.test.ts"
)
foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $RelativePath))) { throw "Missing required release file: $RelativePath" }
}

$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$App = Get-Content -Raw -LiteralPath $AppPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath
$Source = Get-Content -Raw -LiteralPath $SourcePath
$Wrangler = Get-Content -Raw -LiteralPath $WranglerPath
$Data = Get-Content -Raw -LiteralPath $DataPath | ConvertFrom-Json
$ProductSurface = @($Worker, $App) -join "`n"

if (-not $Worker.Contains('class="code-landscape"') -or -not $Worker.Contains('class="map-blocks"') -or -not $Worker.Contains('class="code-plate"') -or -not $Worker.Contains('class="region-grid"') -or -not $Worker.Contains('class="code-tray"') -or -not $App.Contains('element("article", "municipality-card")') -or -not $App.Contains('element("code", "code-check"')) { throw "Expected regional map, split code plate, region board, result cards, and carry-out tray" }
if ($ProductSurface -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性') { throw "Research copy must not appear on the product surface" }
if ($Styles -match '(?i)gradient') { throw "Product CSS must not use gradients" }
if ($Styles -match '(?s)h1\s*\{[^}]*font-size:\s*(?:[5-9]\d|[1-9]\d{2})px') { throw "Primary heading is too large" }
if ($ProductSurface -match '(?i)innerHTML|eval\(|new Function|dangerouslySetInnerHTML') { throw "Official code data must not be interpreted as markup or code" }
if (-not $Worker.Contains('app.post("/api/telemetry"') -or $Worker.Contains('app.post("/api/search"') -or -not $App.Contains('fetch(DATA_URL')) { throw "Municipality search must stay in the browser and use the verified static dataset" }
if ($App -match 'history\.(pushState|replaceState)|location\.search\s*=') { throw "Search and selected records must not enter product URLs" }
if ($Migration -match '(?i)municipality_code|municipality_name|query|search_term|prefecture_name|email|phone_number|telephone|advertising_id|password') { throw "Search, selected public records, contact, advertising, and authentication data do not belong in telemetry" }
if (-not $Migration.Contains("CHECK(event_name IN") -or -not $Worker.Contains("35 * 86400")) { throw "Expected allowlisted telemetry and 35-day retention" }
if (-not $Source.Contains("令和6年1月1日現在") -or -not $Source.Contains("1,965") -or -not $Source.Contains("Public Data Use Terms 1.0") -or -not $Source.Contains("Transformation") -or -not $Source.Contains("Northern Territories")) { throw "Source date, dimensions, terms, transformation, or territorial note is incomplete" }
if (-not $App.Contains('state.saved.length >= 8') -or -not $App.Contains('saved.slice(0, 8)')) { throw "Expected an eight-code local carry-out limit" }
if (-not $App.Contains("item.k") -or -not $App.Contains("item.s") -or -not $App.Contains("state.prefecture") -or -not $App.Contains("matchesType(item.t, state.type)")) { throw "Expected kana, five-digit, prefecture, and organization-type lookup" }
if ($ProductSurface -match '(?i)better-auth|betterAuth') { throw "Account authentication is not needed for local public records" }
if ($Wrangler.Contains("00000000-0000-0000-0000-000000000000")) { throw "The production D1 database ID has not been configured" }

if ($Data.counts.total -ne 1965 -or $Data.counts.prefecture -ne 47 -or $Data.counts.designatedWard -ne 171 -or $Data.counts.city -ne 772 -or $Data.counts.designatedCity -ne 20 -or $Data.counts.specialWard -ne 23 -or $Data.counts.town -ne 743 -or $Data.counts.village -ne 189) { throw "Official local-government code dimensions are incorrect" }
if ($Data.source.listAsOf -ne "2024-01-01" -or $Data.source.retrievedAt -ne "2026-08-02" -or $Data.source.bytes -ne 97186 -or $Data.source.sha256 -ne "7d04c8a7f6a6e76a7823a0414a8422bf2b26bb6070766971df76eab58ea6ff78") { throw "Official workbook date, size, or hash is incorrect" }
if ($Data.items.Count -ne 1965 -or $Data.prefectures.Count -ne 47) { throw "Code data arrays are incomplete" }
$Codes = @($Data.items | ForEach-Object { [string]$_.c })
if (@($Codes | Sort-Object -Unique).Count -ne 1965) { throw "Local-government codes are not unique" }
$CodeSet = [Collections.Generic.HashSet[string]]::new([string[]]$Codes)
foreach ($Item in $Data.items) {
    if ([string]$Item.c -notmatch '^\d{6}$' -or [string]$Item.s -ne ([string]$Item.c).Substring(0, 5)) { throw "Invalid code representation: $($Item.c)" }
    if ([string]$Item.r -and -not $CodeSet.Contains([string]$Item.r)) { throw "Missing designated-city parent $($Item.r) for $($Item.c)" }
}
if (-not $CodeSet.Contains("130001") -or -not $CodeSet.Contains("131016") -or -not $CodeSet.Contains("011011")) { throw "Known local-government codes are missing" }
$TerritoryCodes = @($Data.items | Where-Object { $_.u -eq $true } | ForEach-Object { [string]$_.c })
if (($TerritoryCodes -join ',') -ne '016951,016969,016977,016985,016993,017001') { throw "Northern Territories code flags are incorrect" }
if ((Get-Item -LiteralPath $DataPath).Length -gt 550000) { throw "Static local-government data exceeds 550 KB" }
if ((Get-Item -LiteralPath (Join-Path $PublicDirectory "og.svg")).Length -lt 1500) { throw "Expected a product-specific OG SVG larger than 1.5 KB" }
if ((Get-Item -LiteralPath $AppPath).Length -lt 12000) { throw "Expected a substantial municipality-code client" }

$KeyFiles = @(Get-ChildItem -LiteralPath $PublicDirectory -File | Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" })
if ($KeyFiles.Count -ne 1) { throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)" }
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) { throw "IndexNow key file name and content do not match" }

Write-Output "Product release contract is satisfied"
