[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$SourceUrl = "https://www.soumu.go.jp/main_content/000925835.xlsx"
$SourcePage = "https://www.soumu.go.jp/denshijiti/code.html"
$ExpectedBytes = 97186
$ExpectedSha256 = "7d04c8a7f6a6e76a7823a0414a8422bf2b26bb6070766971df76eab58ea6ff78"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputPath = Join-Path $RepoRoot "public\data\index.json"

$Client = [Net.Http.HttpClient]::new()
$Client.DefaultRequestHeaders.UserAgent.ParseAdd("jichitai-code-data-builder/1.0")
$Bytes = $Client.GetByteArrayAsync($SourceUrl).GetAwaiter().GetResult()
$Client.Dispose()
$Sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
if ($Bytes.Length -ne $ExpectedBytes) { throw "Official workbook byte size changed: expected $ExpectedBytes, received $($Bytes.Length)" }
if ($Sha256 -ne $ExpectedSha256) { throw "Official workbook hash changed: expected $ExpectedSha256, received $Sha256" }

Add-Type -AssemblyName System.IO.Compression
$Memory = [IO.MemoryStream]::new($Bytes, $false)
$Archive = [IO.Compression.ZipArchive]::new($Memory, [IO.Compression.ZipArchiveMode]::Read, $false)

function Read-ZipText {
    param([Parameter(Mandatory)][string]$EntryName)
    $Entry = $Archive.GetEntry($EntryName)
    if (-not $Entry) { throw "Workbook entry is missing: $EntryName" }
    $Reader = [IO.StreamReader]::new($Entry.Open(), [Text.Encoding]::UTF8)
    try { return $Reader.ReadToEnd() } finally { $Reader.Dispose() }
}

[xml]$SharedXml = Read-ZipText "xl/sharedStrings.xml"
$SharedStrings = @(
    $SharedXml.SelectNodes("//*[local-name()='si']") | ForEach-Object {
        $TextNodes = $_.SelectNodes("./*[local-name()='t'] | ./*[local-name()='r']/*[local-name()='t']")
        ($TextNodes | ForEach-Object { $_.InnerText }) -join ""
    }
)

function Get-ColumnIndex {
    param([Parameter(Mandatory)][string]$CellReference)
    $Letters = [regex]::Match($CellReference, "^[A-Z]+").Value
    $Value = 0
    foreach ($Character in $Letters.ToCharArray()) {
        $Value = $Value * 26 + ([int]$Character - [int][char]'A' + 1)
    }
    return $Value - 1
}

function Read-WorksheetRows {
    param([Parameter(Mandatory)][string]$EntryName)
    [xml]$SheetXml = Read-ZipText $EntryName
    $Rows = [Collections.Generic.List[object]]::new()
    foreach ($RowNode in $SheetXml.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")) {
        if ([int]$RowNode.r -eq 1) { continue }
        $Values = @("", "", "", "", "")
        foreach ($Cell in $RowNode.SelectNodes("./*[local-name()='c']")) {
            $ColumnIndex = Get-ColumnIndex ([string]$Cell.r)
            if ($ColumnIndex -gt 4) { continue }
            $ValueNode = $Cell.SelectSingleNode("./*[local-name()='v']")
            $Value = if ([string]$Cell.t -eq "s") {
                if ($ValueNode) { $SharedStrings[[int]$ValueNode.InnerText] } else { "" }
            } elseif ([string]$Cell.t -eq "inlineStr") {
                $Cell.SelectSingleNode("./*[local-name()='is']").InnerText
            } elseif ($ValueNode) {
                $ValueNode.InnerText
            } else {
                ""
            }
            $Values[$ColumnIndex] = ([string]$Value).Trim()
        }
        if ($Values[0]) { $Rows.Add($Values) }
    }
    return @($Rows)
}

$CurrentRows = Read-WorksheetRows "xl/worksheets/sheet1.xml"
$WardRows = Read-WorksheetRows "xl/worksheets/sheet2.xml"
if ($CurrentRows.Count -ne 1794 -or $WardRows.Count -ne 191) { throw "Official workbook row dimensions changed" }

$CurrentCodes = [Collections.Generic.HashSet[string]]::new()
foreach ($Row in $CurrentRows) { [void]$CurrentCodes.Add([string]$Row[0]) }
$DesignatedCityCodes = [Collections.Generic.HashSet[string]]::new()
foreach ($Row in $WardRows) {
    if ($CurrentCodes.Contains([string]$Row[0])) { [void]$DesignatedCityCodes.Add([string]$Row[0]) }
}
if ($DesignatedCityCodes.Count -ne 20) { throw "Expected 20 designated cities" }

$NorthernTerritoryCodes = [Collections.Generic.HashSet[string]]::new(
    [string[]]@("016951", "016969", "016977", "016985", "016993", "017001")
)
$Items = [Collections.Generic.List[object]]::new()
foreach ($Row in $CurrentRows) {
    $Code = [string]$Row[0]
    $Prefecture = [string]$Row[1]
    $Municipality = [string]$Row[2]
    $Type = if (-not $Municipality) {
        "prefecture"
    } elseif ($Municipality.EndsWith("市")) {
        if ($DesignatedCityCodes.Contains($Code)) { "designated_city" } else { "city" }
    } elseif ($Municipality.EndsWith("区")) {
        "special_ward"
    } elseif ($Municipality.EndsWith("町")) {
        "town"
    } elseif ($Municipality.EndsWith("村")) {
        "village"
    } else {
        throw "Unexpected municipality type: $Municipality"
    }
    $Name = if ($Municipality) { $Municipality } else { $Prefecture }
    $Kana = if ($Municipality) { [string]$Row[4] } else { [string]$Row[3] }
    $Items.Add([ordered]@{
        c = $Code
        k = $Kana
        n = $Name
        p = $Prefecture
        pk = [string]$Row[3]
        r = ""
        s = $Code.Substring(0, 5)
        t = $Type
        u = $NorthernTerritoryCodes.Contains($Code)
    })
}

$CurrentCityCode = ""
foreach ($Row in $WardRows) {
    $Code = [string]$Row[0]
    $Name = [string]$Row[2]
    if ($CurrentCodes.Contains($Code)) {
        $CurrentCityCode = $Code
        continue
    }
    if (-not $Name.EndsWith("区") -or -not $CurrentCityCode) { throw "Unexpected designated-city ward row: $Name" }
    $Items.Add([ordered]@{
        c = $Code
        k = [string]$Row[4]
        n = $Name
        p = [string]$Row[1]
        pk = [string]$Row[3]
        r = $CurrentCityCode
        s = $Code.Substring(0, 5)
        t = "designated_ward"
        u = $false
    })
}

$Codes = [Collections.Generic.HashSet[string]]::new()
foreach ($Item in $Items) {
    if ([string]$Item.c -notmatch "^\d{6}$") { throw "Unexpected local-government code: $($Item.c)" }
    if ([string]$Item.s -ne ([string]$Item.c).Substring(0, 5)) { throw "Five-digit code mismatch: $($Item.c)" }
    if (-not $Codes.Add([string]$Item.c)) { throw "Duplicate local-government code: $($Item.c)" }
}

$Counts = [ordered]@{
    city = @($Items | Where-Object t -eq "city").Count
    designatedCity = @($Items | Where-Object t -eq "designated_city").Count
    designatedWard = @($Items | Where-Object t -eq "designated_ward").Count
    prefecture = @($Items | Where-Object t -eq "prefecture").Count
    specialWard = @($Items | Where-Object t -eq "special_ward").Count
    town = @($Items | Where-Object t -eq "town").Count
    total = $Items.Count
    village = @($Items | Where-Object t -eq "village").Count
}
$ExpectedCounts = '{"city":772,"designatedCity":20,"designatedWard":171,"prefecture":47,"specialWard":23,"town":743,"total":1965,"village":189}'
if (($Counts | ConvertTo-Json -Compress) -ne $ExpectedCounts) { throw "Local-government type dimensions changed: $($Counts | ConvertTo-Json -Compress)" }
$NorthernTerritoryCount = @($Items | Where-Object { $_.u -eq $true }).Count
if ($NorthernTerritoryCount -ne 6) {
    $NorthernTerritoryRows = @($Items | Where-Object { $_.u -eq $true } | ForEach-Object { "$($_.c):$($_.n)" }) -join ", "
    throw "Expected six northern-territory village rows, found ${NorthernTerritoryCount}: $NorthernTerritoryRows"
}

$Prefectures = @(
    $Items | Where-Object t -eq "prefecture" | ForEach-Object {
        $PrefectureName = [string]$_.n
        [ordered]@{
            count = @($Items | Where-Object { $_.p -eq $PrefectureName -and $_.t -ne "prefecture" }).Count
            id = ([string]$_.c).Substring(0, 2)
            name = $PrefectureName
        }
    }
)

$Payload = [ordered]@{
    counts = $Counts
    items = @($Items)
    prefectures = $Prefectures
    source = [ordered]@{
        bytes = $Bytes.Length
        listAsOf = "2024-01-01"
        retrievedAt = "2026-08-02"
        sha256 = $Sha256
        sourcePage = $SourcePage
        sourceUrl = $SourceUrl
        workbookSheets = 2
    }
    types = [ordered]@{
        prefecture = "都道府県"
        designated_city = "政令指定都市"
        city = "市"
        special_ward = "特別区"
        town = "町"
        village = "村"
        designated_ward = "政令市の区"
    }
}

$OutputDirectory = Split-Path $OutputPath -Parent
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$Json = $Payload | ConvertTo-Json -Depth 8 -Compress
[IO.File]::WriteAllText($OutputPath, $Json + "`n", [Text.UTF8Encoding]::new($false))
$Archive.Dispose()
$Memory.Dispose()

[ordered]@{
    bytes = $Bytes.Length
    counts = $Counts
    output = "public/data/index.json"
    sha256 = $Sha256
} | ConvertTo-Json -Depth 4 -Compress
