# Source and transformation

## Official source

- Publisher: 総務省 (Ministry of Internal Affairs and Communications)
- Page: [全国地方公共団体コード](https://www.soumu.go.jp/denshijiti/code.html)
- Workbook: `https://www.soumu.go.jp/main_content/000925835.xlsx`
- List date: 令和6年1月1日現在 (2024-01-01)
- Retrieved: 2026-08-02
- Bytes: 97,186
- SHA-256: `7d04c8a7f6a6e76a7823a0414a8422bf2b26bb6070766971df76eab58ea6ff78`

The public Japanese interface states that nationwide local-government codes were established in 1968 and that the published list is updated when changes occur.

## Dimensions

The first worksheet contains 1,794 current-government rows: 47 prefectures, 792 cities, 23 special wards, 743 towns, and 189 villages. The second contains 20 designated cities already present in the first sheet and 171 additional designated-city ward codes. After deduplicating the 20 city rows, the product contains 1,965 unique six-digit codes.

## Transformation

The generator reads the workbook's OOXML directly, excludes phonetic annotation nodes from displayed cell text, and merges the two worksheets. It adds:

- the five-digit value obtained by removing the final check digit;
- a normalized organization type;
- the parent designated-city code for each designated-city ward;
- a flag for the six Northern Territories villages, identified by exact official code rather than name.

Names, half-width kana, and six-digit codes remain as supplied in the workbook. Search normalization happens only in the browser. The generated JSON is checked against known records including Tokyo (`130001`), Chiyoda City (`131016`), and Sapporo Chuo Ward (`011011`).

## Terms and attribution

Use follows the [総務省ウェブサイト利用規約](https://www.soumu.go.jp/menu_kyotsuu/policy/tyosaku.html), which incorporates Public Data Use Terms 1.0. The product displays the source and identifies the transformation. Commercial reuse is permitted subject to the terms. No government authorship, endorsement, warranty, or official status is implied.

The official workbook remains the authority. Users should confirm whether a destination requires the five-digit code or the complete six-digit code.
