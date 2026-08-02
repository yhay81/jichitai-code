import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type Item = {
  c: string;
  k: string;
  n: string;
  p: string;
  pk: string;
  r: string;
  s: string;
  t: string;
  u: boolean;
};
type Data = {
  counts: {
    city: number;
    designatedCity: number;
    designatedWard: number;
    prefecture: number;
    specialWard: number;
    town: number;
    total: number;
    village: number;
  };
  items: Item[];
  prefectures: Array<{ count: number; id: string; name: string }>;
  source: {
    bytes: number;
    listAsOf: string;
    retrievedAt: string;
    sha256: string;
    sourcePage: string;
    sourceUrl: string;
    workbookSheets: number;
  };
};

const dataPath = resolve(process.cwd(), "public/data/index.json");
const data = JSON.parse(readFileSync(dataPath, "utf8")) as Data;
const byCode = new Map(data.items.map((item) => [item.c, item]));

describe("official nationwide local-government codes", () => {
  it("contains the verified official workbook metadata", () => {
    expect(data.source).toEqual({
      bytes: 97186,
      listAsOf: "2024-01-01",
      retrievedAt: "2026-08-02",
      sha256: "7d04c8a7f6a6e76a7823a0414a8422bf2b26bb6070766971df76eab58ea6ff78",
      sourcePage: "https://www.soumu.go.jp/denshijiti/code.html",
      sourceUrl: "https://www.soumu.go.jp/main_content/000925835.xlsx",
      workbookSheets: 2,
    });
  });

  it("contains all 1,965 unique codes with the verified type totals", () => {
    expect(data.counts).toEqual({
      city: 772,
      designatedCity: 20,
      designatedWard: 171,
      prefecture: 47,
      specialWard: 23,
      town: 743,
      total: 1965,
      village: 189,
    });
    expect(data.items).toHaveLength(1965);
    expect(data.prefectures).toHaveLength(47);
    expect(new Set(data.items.map((item) => item.c)).size).toBe(1965);
  });

  it("retains six digits, five-digit bodies, names, kana, and valid designated-city parents", () => {
    data.items.forEach((item) => {
      expect(Object.keys(item).sort()).toEqual(["c", "k", "n", "p", "pk", "r", "s", "t", "u"]);
      expect(item.c).toMatch(/^\d{6}$/u);
      expect(item.s).toBe(item.c.slice(0, 5));
      expect(item.n.length).toBeGreaterThan(0);
      expect(item.p.length).toBeGreaterThan(0);
      if (item.t === "designated_ward") expect(byCode.get(item.r)?.t).toBe("designated_city");
      else expect(item.r).toBe("");
    });
  });

  it("retains known prefecture, special-ward, and designated-ward records", () => {
    expect(byCode.get("130001")).toMatchObject({ n: "東京都", s: "13000", t: "prefecture" });
    expect(byCode.get("131016")).toMatchObject({
      n: "千代田区",
      p: "東京都",
      s: "13101",
      t: "special_ward",
    });
    expect(byCode.get("011011")).toMatchObject({
      n: "札幌市中央区",
      p: "北海道",
      r: "011002",
      t: "designated_ward",
    });
  });

  it("flags exactly the six official Northern Territories records by code", () => {
    expect(data.items.filter((item) => item.u).map((item) => item.c)).toEqual([
      "016951",
      "016969",
      "016977",
      "016985",
      "016993",
      "017001",
    ]);
    expect(byCode.get("014036")).toMatchObject({ n: "泊村", u: false });
    expect(byCode.get("016969")).toMatchObject({ n: "泊村", u: true });
  });

  it("keeps the complete static dataset within the delivery budget", () => {
    expect(statSync(dataPath).size).toBeLessThan(550_000);
  });
});
