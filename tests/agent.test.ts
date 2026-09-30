import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilingIndex } from "../src/lib/vector";

const fakeIndex: FilingIndex = {
  embeddingModel: "test",
  dimensions: 2,
  createdAt: "",
  companies: [{ ticker: "AAPL", company: "Apple Inc.", fiscalYear: "2025", filingDate: "2025-10-31", sourceUrl: "", chunks: 2 }],
  chunks: [
    { id: "AAPL-0000", ticker: "AAPL", company: "Apple Inc.", fiscalYear: "2025", filingDate: "", sourceUrl: "", text: "Supply chain risk in Asia", embedding: [1, 0] },
    { id: "AAPL-0001", ticker: "AAPL", company: "Apple Inc.", fiscalYear: "2025", filingDate: "", sourceUrl: "", text: "Services revenue grew", embedding: [0, 1] },
  ],
};

let currentIndex = fakeIndex;
vi.mock("../src/lib/index-store", () => ({ loadIndex: () => currentIndex }));
vi.mock("../src/lib/embed", () => ({ embedQuery: vi.fn(async () => [1, 0]) }));

const { tools, SYSTEM_PROMPT } = await import("../src/lib/agent");
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
    expect(out[0].id).toBe("AAPL-0000");
    expect(out[0]).not.toHaveProperty("embedding");
  });

  it("searchFilings explains how to fix an empty index", async () => {
    currentIndex = { ...fakeIndex, chunks: [] };
    const out = await tools.searchFilings.execute!({ query: "anything" }, opts);
    expect(out).toHaveProperty("error");
  });

  it("system prompt treats retrieved text as untrusted and requires citations", () => {
    expect(SYSTEM_PROMPT).toMatch(/untrusted/);
    expect(SYSTEM_PROMPT).toMatch(/\[AAPL-0042\]/);
  });
});
