# 自治体コード引き

自治体名、カナ、5桁・6桁コードから、総務省の全国地方公共団体コードを探す匿名Webサービスです。

- Production: <https://jichitai-code.yhay81.com>
- Source: 総務省「全国地方公共団体コード」（令和6年1月1日現在）
- Dataset: 1,965 unique codes (47 prefectures / 1,747 municipalities / 171 designated-city wards)
- Stack: Cloudflare Workers, Hono JSX, Vite+, D1, static JSON

## Local development

```powershell
npm install
npm run data:build
npm run release:check
npm run check
npm test
npm run build
npm run dev
```

`npm run data:build`は総務省の公開Excelをメモリ上で取得し、バイト数、SHA-256、2シートの件数、団体種別、既知コードを検証して`public/data/index.json`を生成します。検索はブラウザ内で行い、検索語をWorkerへ送信しません。

## Operations

```powershell
npx wrangler d1 migrations apply jichitai-code --local
npx wrangler d1 migrations apply jichitai-code --remote
npm run deploy
npm run metrics
npm run indexnow
```

公開前検査は、公式データの件数とハッシュ、匿名計測、検索の端末内処理、表示要件、出典・注意事項を確認します。
