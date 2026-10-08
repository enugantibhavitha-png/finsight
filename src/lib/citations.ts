/**
 * Chunk ids look like "AAPL-FY25-0042" (ticker, fiscal year, chunk number).
 * The older "AAPL-0042" format is still accepted so existing answers keep working.
 */
export const CHUNK_ID_PATTERN = String.raw`[A-Z.]{1,6}(?:-FY\d{2})?-\d{4}`;

export function chunkId(ticker: string, fiscalYear: string, n: number): string {
  return `${ticker}-FY${fiscalYear.slice(-2)}-${String(n).padStart(4, "0")}`;
}

/** All citation ids in an answer, in order of appearance (duplicates kept). */
export function extractCitations(text: string): string[] {
  return [...text.matchAll(new RegExp(String.raw`\[(${CHUNK_ID_PATTERN})\]`, "g"))].map((m) => m[1]);
}
