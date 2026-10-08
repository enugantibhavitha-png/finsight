import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline } from "../src/lib/markdown";

describe("parseBlocks", () => {
  it("splits headings, lists and paragraphs", () => {
    const md = "Intro line\ncontinues here.\n\n### Summary\n- **Microsoft** one\n- NVIDIA two\n\n4. Fourth item\n5. Fifth item";
    expect(parseBlocks(md)).toEqual([
      { type: "p", text: "Intro line continues here." },
      { type: "heading", level: 3, text: "Summary" },
      { type: "ul", items: ["**Microsoft** one", "NVIDIA two"] },
      { type: "ol", start: 4, items: ["Fourth item", "Fifth item"] },
    ]);
  });

  it("keeps numbering when list items are separated by blank lines", () => {
    const blocks = parseBlocks("1. First\n\n2. Second");
    expect(blocks).toEqual([
      { type: "ol", start: 1, items: ["First"] },
      { type: "ol", start: 2, items: ["Second"] },
    ]);
  });

  it("handles Windows line endings", () => {
    expect(parseBlocks("a\r\n\r\nb")).toHaveLength(2);
  });
});

describe("parseInline", () => {
  it("parses bold, italic, code and citations", () => {
    expect(parseInline("**Risk**: see *note* `x` [NVDA-0083][NVDA-0085].")).toEqual([
      { type: "bold", value: "Risk" },
      { type: "text", value: ": see " },
      { type: "italic", value: "note" },
      { type: "text", value: " " },
      { type: "code", value: "x" },
      { type: "text", value: " " },
      { type: "cite", value: "NVDA-0083" },
      { type: "cite", value: "NVDA-0085" },
      { type: "text", value: "." },
    ]);
  });

  it("parses fiscal-year citation ids", () => {
    expect(parseInline("Risk [AAPL-FY24-0042].")).toEqual([
      { type: "text", value: "Risk " },
      { type: "cite", value: "AAPL-FY24-0042" },
      { type: "text", value: "." },
    ]);
  });

  it("leaves plain text and non-citation brackets alone", () => {
    expect(parseInline("costs [approx] 5 * 3")).toEqual([{ type: "text", value: "costs [approx] 5 * 3" }]);
  });
});
