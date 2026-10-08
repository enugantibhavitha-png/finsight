/**
 * Minimal Markdown parser for model answers: headings, bullet and numbered
 * lists, paragraphs, **bold**, *italic*, `code`, and [TICKER-FY25-0000] citations.
 * Kept dependency-free and pure so it is easy to unit test.
 */
import { CHUNK_ID_PATTERN } from "./citations";

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "cite"; value: string };

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; start: number; items: string[] }
  | { type: "p"; text: string };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(HEADING))) {
      flush();
      blocks.push({ type: "heading", level: m[1].length, text: m[2].trim() });
    } else if ((m = line.match(BULLET))) {
      if (current?.type !== "ul") {
        flush();
        current = { type: "ul", items: [] };
      }
      current.items.push(m[1].trim());
    } else if ((m = line.match(NUMBERED))) {
      if (current?.type !== "ol") {
        flush();
        current = { type: "ol", start: Number(m[1]), items: [] };
      }
      current.items.push(m[2].trim());
    } else if (current?.type === "ul" || current?.type === "ol") {
      // Continuation of the previous list item.
      current.items[current.items.length - 1] += " " + line.trim();
    } else if (current?.type === "p") {
      current.text += " " + line.trim();
    } else {
      flush();
      current = { type: "p", text: line.trim() };
    }
  }
  flush();
  return blocks;
}

const INLINE = new RegExp(
  "(" +
    [
      String.raw`\*\*[^*]+\*\*`, // **bold**
      "__[^_]+__", // __bold__
      "`[^`]+`", // `code`
      String.raw`\[${CHUNK_ID_PATTERN}\]`, // [AAPL-FY25-0042]
      String.raw`\*[^*\s][^*]*\*`, // *italic*
    ].join("|") +
    ")",
  "g",
);

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", value: text.slice(last, idx) });
    const tok = m[0];
    if (tok.startsWith("**") || tok.startsWith("__")) out.push({ type: "bold", value: tok.slice(2, -2) });
    else if (tok.startsWith("`")) out.push({ type: "code", value: tok.slice(1, -1) });
    else if (tok.startsWith("[")) out.push({ type: "cite", value: tok.slice(1, -1) });
    else out.push({ type: "italic", value: tok.slice(1, -1) });
    last = idx + tok.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
