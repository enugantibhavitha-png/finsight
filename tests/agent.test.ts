import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilingIndex } from "../src/lib/vector";

const fakeIndex: FilingIndex = {
  embeddingModel: "test",
  dimensions: 2,
  createdAt: "",
  companies: [
    { ticker: "AAPL", company: "Apple Inc.", fiscalYear: "2025", filingDate: "2025-10-31", sourceUrl: "", chunks: 2 },
    { ticker: "AAPL", company: "Apple Inc.", fiscalYear: "2024", filingDate: "2024-11-01", sourceUrl: "", chunks: 1 },
  ],
  chunks: [
    { id: "AAPL-FY25-0000", ticker: "AAPL", company: "Apple Inc.", fiscalYear: "2025", filingDate: "", sourceUrl: "", text: "Supply chain risk in Asia", embedding: [1, 0] },
    { id: "AAPL-FY25-0001", ticker: "AAPL", company: "Apple Inc.", fiscalYear: "2025", filingDate: "", sourceUrl: "", text: "Services revenue grew", embedding: [0, 1] },
    { id: "AAPL-FY24-0000", ticker: "AAPL", company: "Apple Inc.", fiscalYear: "2024", filingDate: "", sourceUrl: "", text: "Supply chain risk in 2024", embedding: [0.9, 0.1] },
  ],
};

let currentIndex = fakeIndex;
vi.mock("../src/lib/index-store", () => ({ loadIndex: () => currentIndex }));
vi.mock("../src/lib/embed", () => ({ embedQuery: vi.fn(async () => [1, 0]) }));

const { tools, makeTools, validYears, yearScopeNote, SYSTEM_PROMPT } = await import("../src/lib/agent");
const opts = { toolCallId: "t1", messages: [], context: {} } as never;

describe("agent tools", () => {
  beforeEach(() => {
    currentIndex = fakeIndex;
  });

  it("listCompanies returns index metadata", async () => {
    const out = await tools.listCompanies.execute!({}, opts);
    expect(out).toEqual(fakeIndex.companies);
  });

  it("searchFilings returns cited passages without embeddings", async () => {
    const out = (await tools.searchFilings.execute!({ query: "supply chain", k: 1 }, opts)) as { id: string; text: string }[];
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("AAPL-FY25-0000");
    expect(out[0]).not.toHaveProperty("embedding");
  });

  it("searchFilings explains how to fix an empty index", async () => {
    currentIndex = { ...fakeIndex, chunks: [] };
    const out = await tools.searchFilings.execute!({ query: "anything" }, opts);
    expect(out).toHaveProperty("error");
  });

  it("system prompt treats retrieved text as untrusted and requires citations", () => {
    expect(SYSTEM_PROMPT).toMatch(/untrusted/);
    expect(SYSTEM_PROMPT).toMatch(/\[AAPL-FY25-0042\]/);
  });

  it("searchFilings filters by fiscal year", async () => {
    const out = (await tools.searchFilings.execute!({ query: "supply chain", fiscalYears: ["FY2024"] }, opts)) as { id: string }[];
    expect(out.map((h) => h.id)).toEqual(["AAPL-FY24-0000"]);
  });

  it("a UI year scope overrides the years the model asks for", async () => {
    const scoped = makeTools(["2025"]);
    const out = (await scoped.searchFilings.execute!({ query: "supply chain", fiscalYears: ["2024"] }, opts)) as {
      fiscalYear: string;
    }[];
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((h) => h.fiscalYear === "2025")).toBe(true);
  });

  it("validYears keeps only known years and normalizes formats", () => {
    expect(validYears(["FY24", "2025", "1999", 7, "2025"])).toEqual(["2024", "2025"]);
    expect(validYears("2024")).toEqual([]);
  });

  it("yearScopeNote is empty when no years are picked", () => {
    expect(yearScopeNote([])).toBe("");
    expect(yearScopeNote(["2024"])).toMatch(/fiscal year 2024/);
  });
});
