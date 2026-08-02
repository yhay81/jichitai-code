import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product surface", () => {
  const worker = read("src/worker.tsx");
  const client = read("public/app.js");
  const css = read("public/styles.css");
  const migration = read("migrations/0001_telemetry.sql");
  const source = read("SOURCE.md");
  const surface = `${worker}\n${client}`;

  it("communicates through a regional map, split code plate, region board, cards, and tray", () => {
    expect(worker).toContain('class="code-landscape"');
    expect(worker).toContain('class="map-blocks"');
    expect(worker).toContain('class="code-plate"');
    expect(worker).toContain('class="region-grid"');
    expect(worker).toContain('class="code-tray"');
    expect(client).toContain('element("article", "municipality-card")');
    expect(client).toContain('element("code", "code-main", item.s)');
    expect(client).toContain('element("code", "code-check", item.c.slice(5))');
    expect(css.toLowerCase()).not.toContain("gradient");
    expect(css).not.toMatch(/h1\s*\{[^}]*font-size:\s*(?:[5-9]\d|[1-9]\d{2})px/su);
  });

  it("keeps queries and selected public records in the browser", () => {
    expect(worker).toContain('app.post("/api/telemetry"');
    expect(worker).not.toContain('app.post("/api/search"');
    expect(client).toContain("fetch(DATA_URL");
    expect(client).toContain("localStorage");
    expect(client).toContain("state.saved.length >= 8");
    expect(client).toContain("saved.slice(0, 8)");
    expect(migration).not.toMatch(
      /municipality_code|municipality_name|query|search_term|prefecture_name|email|phone|advertising/iu,
    );
    expect(client).not.toMatch(/history\.(?:pushState|replaceState)|location\.search\s*=/u);
  });

  it("offers kanji, kana, five-digit, six-digit, prefecture, and type lookup", () => {
    expect(client).toContain("item.k");
    expect(client).toContain("item.pk");
    expect(client).toContain("item.c");
    expect(client).toContain("item.s");
    expect(client).toContain("state.prefecture");
    expect(client).toContain("matchesType(item.t, state.type)");
    expect(client).toContain('normalize("NFKC")');
  });

  it("renders official data as text and distinguishes the check digit", () => {
    expect(client).not.toContain("innerHTML");
    expect(worker).not.toContain("dangerouslySetInnerHTML");
    expect(client).toContain("textContent");
    expect(worker).toContain("5桁本体と末尾の検査数字");
    expect(client).toContain("OFFICIAL_URL");
    expect(client).toContain('emit("official_opened")');
  });

  it("states source version, dimensions, terms, transformation, and special territorial handling", () => {
    expect(source).toContain("令和6年1月1日現在");
    expect(source).toContain("1,965");
    expect(source).toContain("Public Data Use Terms 1.0");
    expect(source).toContain("Transformation");
    expect(source).toContain("Northern Territories");
    expect(worker).toContain("北方領土の6村");
  });

  it("separates automated checks from users and needs no account", () => {
    expect(client).toContain("navigator.webdriver");
    expect(client).toContain('"x-jichitai-code-qa"');
    expect(migration).toContain("is_qa");
    expect(surface).not.toMatch(/better-auth|betterAuth/iu);
  });

  it("contains no internal evaluation language", () => {
    expect(surface).not.toMatch(
      /public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性/iu,
    );
  });
});
