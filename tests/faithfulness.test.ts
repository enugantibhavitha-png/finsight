import { describe, expect, it } from "vitest";
import { chunkId, extractCitations } from "../src/lib/citations";
import { extractClaims, ungroundedNumbers } from "../src/lib/faithfulness";
import { normalizeYear, search, type FilingIndex } from "../src/lib/vector";

describe("citations", () => {
  it("builds fiscal-year chunk ids", () => {
    expect(chunkId("AAPL", "2024", 42)).toBe("AAPL-FY24-0042");
  });

  it("extracts new and legacy citation ids", () => {
    expect(extractCitations("A [AAPL-FY24-0042] and B [NVDA-0083]. Not [approx].")).toEqual(["AAPL-FY24-0042", "NVDA-0083"]);
  });
});

describe("extractClaims", () => {
  it("splits sentences and separates cited from uncited claims", () => {
    const answer = [
      "Apple relies on outsourcing partners in Asia [AAPL-FY25-0010]. Net sales were $391,035 million [AAPL-FY24-0200].",
      "",
      "- **Microsoft** faces cloud competition [MSFT-FY25-0005][MSFT-FY25-0006]",
      "- This is not investment advice.",
    ].join("\n");
    const { cited, uncited } = extractClaims(answer);
    expect(cited).toEqual([
      { claim: "Apple relies on outsourcing partners in Asia.", citations: ["AAPL-FY25-0010"] },
      { claim: "Net sales were $391,035 million.", citations: ["AAPL-FY24-0200"] },
      { claim: "Microsoft faces cloud competition", citations: ["MSFT-FY25-0005", "MSFT-FY25-0006"] },
    ]);
    expect(uncited).toEqual(["This is not investment advice."]);
  });

  it("attaches a citation that trails the period to its sentence", () => {
    const { cited } = extractClaims("Revenue grew. [AAPL-FY25-0001] Margins fell [AAPL-FY25-0002].");
    expect(cited.map((c) => c.citations)).toEqual([["AAPL-FY25-0001"], ["AAPL-FY25-0002"]]);
  });

  it("ignores headings", () => {
    expect(extractClaims("### Summary\nRisk rose [NVDA-FY25-0001].").cited).toHaveLength(1);
  });
});

describe("ungroundedNumbers", () => {
  const passages = ["Total net sales were $391,035 million, up 2% (fiscal 2024)."];

  it("accepts numbers that appear in the passages, with or without commas", () => {
    expect(ungroundedNumbers("Net sales were $391,035 million in 2024.", passages)).toEqual([]);
    expect(ungroundedNumbers("Net sales were 391035 million.", passages)).toEqual([]);
  });

  it("flags numbers missing from the passages", () => {
    expect(ungroundedNumbers("Net sales were $400,000 million, up 12%.", passages)).toEqual(["$400,000", "12%"]);
  });

  it("does not match a number inside a longer number", () => {
    expect(ungroundedNumbers("Sales were 391 million.", passages)).toEqual(["391"]);
  });

  it("ignores years and small counts", () => {
    expect(ungroundedNumbers("In 2023 three of 5 segments grew.", passages)).toEqual([]);
  });
});

describe("fiscal-year search", () => {
  const index: FilingIndex = {
    embeddingModel: "test",
    dimensions: 2,
    createdAt: "",
    companies: [],
    chunks: [
      { id: "AAPL-FY25-0000", ticker: "AAPL", company: "Apple", fiscalYear: "2025", filingDate: "", sourceUrl: "", text: "a", embedding: [1, 0] },
      { id: "AAPL-FY24-0000", ticker: "AAPL", company: "Apple", fiscalYear: "2024", filingDate: "", sourceUrl: "", text: "b", embedding: [1, 0] },
    ],
  };

  it("normalizes year formats", () => {
    expect(["2024", "FY2024", "fy24", "24"].map(normalizeYear)).toEqual(["2024", "2024", "2024", "2024"]);
  });

  it("restricts results to the requested fiscal years", () => {
    expect(search(index, [1, 0], { fiscalYears: ["FY24"] }).map((h) => h.id)).toEqual(["AAPL-FY24-0000"]);
    expect(search(index, [1, 0]).length).toBe(2);
  });
});
