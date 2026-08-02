import { Hono } from "hono";
import type { Context } from "hono";
import { requestId } from "hono/request-id";

export type Bindings = { ASSETS: Fetcher; DB: D1Database };
type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 413 | 415,
  ) {
    super(code);
  }
}

const canonicalOrigin = "https://jichitai-code.yhay81.com";
const sourcePage = "https://www.soumu.go.jp/denshijiti/code.html";
const termsPage = "https://www.soumu.go.jp/menu_kyotsuu/policy/tyosaku.html";
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const telemetryNames = new Set([
  "visited",
  "prefecture_selected",
  "searched",
  "no_result",
  "type_changed",
  "saved",
  "copied",
  "official_opened",
  "returned",
]);
const regions = [
  ["北海道", ["北海道"]],
  ["東北", ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"]],
  ["関東", ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"]],
  ["甲信越", ["新潟県", "山梨県", "長野県"]],
  ["北陸", ["富山県", "石川県", "福井県"]],
  ["東海", ["岐阜県", "静岡県", "愛知県", "三重県"]],
  ["近畿", ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"]],
  ["中国", ["鳥取県", "島根県", "岡山県", "広島県", "山口県"]],
  ["四国", ["徳島県", "香川県", "愛媛県", "高知県"]],
  [
    "九州・沖縄",
    ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"],
  ],
] as const;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const enforceSameOrigin = (c: AppContext) => {
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new ApiError("cross_site_request", 403);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) throw new ApiError("cross_site_request", 403);
};

const parseJson = async (c: AppContext, maximumBytes = 256) => {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new ApiError("unsupported_media_type", 415);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes)
    throw new ApiError("payload_too_large", 413);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};

const recordEvent = async (c: AppContext, name: string) => {
  const session = (c.req.header("x-jichitai-code-session") ?? "").toLowerCase();
  if (!sessionPattern.test(session)) return;
  await c.env.DB.prepare(
    "INSERT INTO product_events (session_hash,event_name,is_qa,created_at) VALUES (?,?,?,?)",
  )
    .bind(
      await sha256(session),
      name,
      c.req.header("x-jichitai-code-qa") === "1" ? 1 : 0,
      nowSeconds(),
    )
    .run();
};

const Layout = ({
  canonical,
  children,
  description,
  noindex = false,
  title,
}: {
  canonical: string;
  children: unknown;
  description: string;
  noindex?: boolean;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width,initial-scale=1" name="viewport" />
      <title>{title}</title>
      <meta content={description} name="description" />
      {noindex ? <meta content="noindex,nofollow" name="robots" /> : null}
      <link href={canonical} rel="canonical" />
      <meta content="website" property="og:type" />
      <meta content="自治体コード引き" property="og:site_name" />
      <meta content={title} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${canonicalOrigin}/og.svg`} property="og:image" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="#18334a" name="theme-color" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
      <script defer src="/app.js" />
    </head>
    <body>
      <a class="skip-link" href="#main">
        本文へ
      </a>
      <header class="site-header">
        <a aria-label="自治体コード引き ホーム" class="wordmark" href="/">
          <span aria-hidden="true" class="code-mark">
            <i>13</i>
            <i>101</i>
            <i>6</i>
          </span>
          <span>自治体コード引き</span>
        </a>
        <nav aria-label="案内">
          <a href="/guide">使い方</a>
          <a href="/source">出典</a>
          <a href="/privacy">保存</a>
        </nav>
      </header>
      {children}
      <footer class="site-footer">
        <span>総務省「全国地方公共団体コード」を加工して作成</span>
        <span>
          <a href="/source">出典と注意</a>
          <a href={sourcePage} rel="noopener noreferrer">
            総務省
          </a>
        </span>
      </footer>
    </body>
  </html>
);

const CodeLandscape = () => (
  <div aria-hidden="true" class="code-landscape">
    <div class="map-blocks">
      <span class="map-hokkaido">01</span>
      <span class="map-tohoku">02–07</span>
      <span class="map-kanto">08–14</span>
      <span class="map-chubu">15–24</span>
      <span class="map-kinki">25–30</span>
      <span class="map-chugoku">31–35</span>
      <span class="map-shikoku">36–39</span>
      <span class="map-kyushu">40–47</span>
    </div>
    <div class="code-plate">
      <span>
        <small>都道府県</small>
        <b>13</b>
      </span>
      <span>
        <small>市区町村</small>
        <b>101</b>
      </span>
      <i />
      <span class="check-digit">
        <small>検査数字</small>
        <b>6</b>
      </span>
    </div>
  </div>
);

const HomePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/`}
    description="全国地方公共団体コード1,965件を、自治体名・カナ・5桁・6桁コードから探してまとめてコピーできます。"
    title="自治体名から全国地方公共団体コードを探す | 自治体コード引き"
  >
    <main class="home" id="main">
      <section aria-labelledby="product-title" class="intro">
        <div class="product-heading">
          <p class="eyebrow">LOCAL GOVERNMENT CODE DIRECTORY</p>
          <h1 id="product-title">地域を選ぶ。6桁がそろう。</h1>
          <p>
            都道府県からたどるか、自治体名・カナ・コードを入れるだけ。5桁本体と末尾の検査数字を分けて確認できます。
          </p>
          <div class="directory-facts">
            <span>
              <strong>1,965</strong>
              <small>収録コード</small>
            </span>
            <span>
              <strong>47</strong>
              <small>都道府県</small>
            </span>
            <span>
              <strong>171</strong>
              <small>政令市の区</small>
            </span>
          </div>
        </div>
        <CodeLandscape />
      </section>

      <div class="version-ribbon">
        <strong>令和6年1月1日現在</strong>
        <span>総務省の公開Excelにある6桁コードを、そのまま収録しています。</span>
        <a href="/source">収録範囲</a>
      </div>

      <section aria-labelledby="search-heading" class="search-desk">
        <header class="section-heading">
          <div>
            <p>コード台帳</p>
            <h2 id="search-heading">自治体名・カナ・コードで探す</h2>
          </div>
          <output id="data-status">一覧を準備しています…</output>
        </header>
        <label class="municipality-search" for="municipality-search">
          <span>名前、読み、5桁・6桁コードから</span>
          <span class="search-box">
            <i aria-hidden="true">⌕</i>
            <input
              autocomplete="off"
              id="municipality-search"
              placeholder="例 千代田区、チヨダク、13101…"
              type="search"
            />
            <button id="clear-search" type="button">
              消す
            </button>
          </span>
        </label>
        <fieldset class="type-filter">
          <legend>団体の種類</legend>
          <div>
            <button aria-pressed="true" data-type="all" type="button">
              すべて
            </button>
            <button aria-pressed="false" data-type="prefecture" type="button">
              都道府県
            </button>
            <button aria-pressed="false" data-type="city" type="button">
              市
            </button>
            <button aria-pressed="false" data-type="ward" type="button">
              区
            </button>
            <button aria-pressed="false" data-type="town_village" type="button">
              町・村
            </button>
          </div>
        </fieldset>
        <p class="privacy-note">入力したことばはこの端末内で照合し、送信・保存しません。</p>
      </section>

      <section aria-labelledby="prefecture-heading" class="prefecture-board">
        <header class="section-heading">
          <div>
            <p>地域棚</p>
            <h2 id="prefecture-heading">都道府県から絞る</h2>
          </div>
          <button hidden id="clear-prefecture" type="button">
            全国へ戻す
          </button>
        </header>
        <div class="region-grid">
          {regions.map(([region, prefectures]) => (
            <section class="region-row">
              <h3>{region}</h3>
              <div>
                {prefectures.map((prefecture) => (
                  <button data-prefecture={prefecture} type="button">
                    {prefecture.replace(/[都府県]$/u, "")}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section class="result-and-tray">
        <section aria-labelledby="result-heading" class="municipality-results">
          <header class="result-heading">
            <div>
              <p>コード札</p>
              <h2 id="result-heading">見つかった自治体</h2>
            </div>
            <output id="result-count">—件</output>
          </header>
          <p id="search-status" role="status">
            公式一覧を開いています…
          </p>
          <div class="municipality-list" id="municipality-list">
            <p class="loading-note">公式一覧を開いています…</p>
          </div>
          <button class="load-more" hidden id="load-more" type="button">
            次の40件を見る
          </button>
        </section>
        <aside aria-labelledby="tray-heading" class="code-tray">
          <header>
            <div>
              <p>持ち出す</p>
              <h2 id="tray-heading">コード札の束</h2>
            </div>
            <output id="saved-count">0 / 8</output>
          </header>
          <div id="saved-items">
            <p>コード札の「束へ」を押すと、最大8件をこの端末に残せます。</p>
          </div>
          <div class="saved-actions">
            <button disabled id="copy-saved" type="button">
              まとめてコピー
            </button>
            <button class="clear-button" disabled id="clear-saved" type="button">
              束を空にする
            </button>
          </div>
        </aside>
      </section>
    </main>
  </Layout>
);

const GuidePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/guide`}
    description="全国地方公共団体コードの5桁本体と検査数字を確認し、必要な自治体をまとめる使い方。"
    title="使い方 | 自治体コード引き"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">引</span>
        <div>
          <p>使い方</p>
          <h1>地域から、必要なコード札を取り出す</h1>
        </div>
      </header>
      <div class="instruction-grid">
        <section>
          <b>一</b>
          <h2>名前か地域で探す</h2>
          <p>
            自治体名、半角・全角カナ、5桁または6桁コードで検索できます。都道府県と団体種別も組み合わせられます。
          </p>
        </section>
        <section>
          <b>二</b>
          <h2>末尾を見分ける</h2>
          <p>6桁目は検査数字です。画面では5桁本体と離して表示し、コピー時は6桁・5桁を選べます。</p>
        </section>
        <section>
          <b>三</b>
          <h2>束にしてコピー</h2>
          <p>複数の自治体は最大8件まで端末内に残し、名称とコードを一度にコピーできます。</p>
        </section>
      </div>
      <div class="code-anatomy">
        <span>
          <small>都道府県コード</small>
          <b>13</b>
        </span>
        <span>
          <small>市区町村コード</small>
          <b>101</b>
        </span>
        <i />
        <span>
          <small>検査数字</small>
          <b>6</b>
        </span>
      </div>
      <aside class="care-note">
        <strong>提出先の指定を確認してください</strong>
        <p>
          手続によって5桁または6桁のどちらを求めるかが異なります。入力欄の桁数・案内を確認して使ってください。
        </p>
      </aside>
      <a class="page-cta" href="/">
        自治体コードを探す
      </a>
    </main>
  </Layout>
);

const SourcePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/source`}
    description="自治体コード引きが利用する総務省の全国地方公共団体コード、収録範囲、加工、利用条件と注意事項。"
    title="出典とデータ | 自治体コード引き"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">典</span>
        <div>
          <p>出典とデータ</p>
          <h1>公式Excelを、探しやすいコード台帳へ</h1>
        </div>
      </header>
      <div class="source-grid">
        <section>
          <h2>出典</h2>
          <p>
            総務省「
            <a href={sourcePage} rel="noopener noreferrer">
              全国地方公共団体コード
            </a>
            」で公開されている、令和6年1月1日現在のExcelを使用しています。
          </p>
        </section>
        <section>
          <h2>収録範囲</h2>
          <p>
            都道府県47、市792、特別区23、町743、村189、政令指定都市の区171。重複する政令指定都市20件をまとめ、合計1,965コードです。
          </p>
        </section>
        <section>
          <h2>表示の加工</h2>
          <p>
            2シートを統合し、団体種別、政令市と区の親子関係、5桁本体を付加しました。名称・カナ・6桁コードは公式表に従います。
          </p>
        </section>
        <section>
          <h2>利用条件</h2>
          <p>
            <a href={termsPage} rel="noopener noreferrer">
              総務省ウェブサイト利用規約
            </a>
            （政府標準利用規約に準拠）に従い、出典と加工を表示します。本サービスを総務省が作成・保証しているものではありません。
          </p>
        </section>
      </div>
      <dl class="source-ledger">
        <div>
          <dt>一覧現在日</dt>
          <dd>2024年1月1日</dd>
        </div>
        <div>
          <dt>取得日</dt>
          <dd>2026年8月2日</dd>
        </div>
        <div>
          <dt>Excel</dt>
          <dd>97,186 bytes / 2シート</dd>
        </div>
        <div>
          <dt>SHA-256</dt>
          <dd>
            <code>7d04c8a7f6a6e76a7823a0414a8422bf2b26bb6070766971df76eab58ea6ff78</code>
          </dd>
        </div>
      </dl>
      <aside class="care-note">
        <strong>北方領土の6村も公式表どおり収録</strong>
        <p>
          色丹村、泊村、留夜別村、留別村、紗那村、蘂取村には、検索結果でその旨を表示します。通常の泊村（014036）とはコードで区別しています。
        </p>
      </aside>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${canonicalOrigin}/privacy`}
    description="自治体コード引きの検索語、コード札の束、匿名利用計測の保存範囲。"
    title="保存と計測 | 自治体コード引き"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">守</span>
        <div>
          <p>保存と計測</p>
          <h1>検索は端末内。残すのは公開コードだけ。</h1>
        </div>
      </header>
      <div class="privacy-grid">
        <section>
          <h2>検索条件</h2>
          <p>入力語、都道府県、団体種別はブラウザ内だけで処理し、サーバーへ送りません。</p>
        </section>
        <section>
          <h2>コード札の束</h2>
          <p>
            選んだ公開コードを最大8件、ブラウザのローカルストレージへ保存します。画面からいつでも消せます。
          </p>
        </section>
        <section>
          <h2>匿名の利用計測</h2>
          <p>
            訪問、検索、コピーなどの操作種別と匿名化したセッションだけを35日間保存します。検索語や選んだ自治体は記録しません。
          </p>
        </section>
        <section>
          <h2>アカウント</h2>
          <p>
            登録、ログイン、Cookieによる個人識別はありません。自動テストは利用者数から分けて数えます。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", requestId());
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Request-Id", c.get("requestId"));
});

app.get("/", (c) => {
  c.header("Cache-Control", "public,max-age=60,s-maxage=300");
  return c.html(<HomePage />);
});
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/source", (c) => c.html(<SourcePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.post("/api/telemetry", async (c) => {
  enforceSameOrigin(c);
  const payload = await parseJson(c);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ApiError("invalid_request", 400);
  const name =
    typeof (payload as Record<string, unknown>).name === "string"
      ? (payload as Record<string, string>).name
      : "";
  if (!telemetryNames.has(name)) throw new ApiError("invalid_event", 400);
  await recordEvent(c, name);
  return c.body(null, 202);
});

app.get("/health", async (c) => {
  const database = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({ ok: database?.ok === 1, prefectures: 47, service: "jichitai-code", total: 1965 });
});

app.get("/sitemap.xml", (c) => {
  const paths = ["/", "/guide", "/source", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((pagePath) => `<url><loc>${canonicalOrigin}${pagePath}</loc></url>`).join("")}</urlset>`;
  c.header("Cache-Control", "public,max-age=3600,s-maxage=86400");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});

app.notFound((c) => {
  c.status(404);
  return c.html(
    <Layout
      canonical={`${canonicalOrigin}/404`}
      description="指定されたページは見つかりません。"
      noindex
      title="ページが見つかりません | 自治体コード引き"
    >
      <main class="not-found" id="main">
        <span>404</span>
        <h1>このコード札は見つかりません</h1>
        <p>自治体コードを探す画面へ戻ってください。</p>
        <a href="/">自治体コードを探す</a>
      </main>
    </Layout>,
  );
});

app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.code, requestId: c.get("requestId") }, error.status);
  console.error(
    "request_failed",
    c.get("requestId"),
    error instanceof Error ? error.message : "unknown",
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export const scheduled = async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at < ?")
    .bind(nowSeconds() - 35 * 86400)
    .run();
};

export { app };
export default { fetch: app.fetch, scheduled };
