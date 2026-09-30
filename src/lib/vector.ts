export type Chunk = {
  id: string; // e.g. "AAPL-0042"
  ticker: string;
  company: string;
  fiscalYear: string;
  filingDate: string;
  sourceUrl: string;
  text: string;
  embedding: number[];
};

export type FilingIndex = {
  embeddingModel: string;
  dimensions: number;
  createdAt: string;
  companies: { ticker: string; company: string; fiscalYear: string; filingDate: string; sourceUrl: string; chunks: number }[];
  chunks: Chunk[];
};

export type SearchHit = Omit<Chunk, "embedding"> & { score: number };

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Brute-force similarity search. Fast enough for a few thousand chunks. */
export function search(
  index: FilingIndex,
  queryEmbedding: number[],
  opts: { k?: number; tickers?: string[] } = {},
): SearchHit[] {
  const k = opts.k ?? 6;
  const allowed = opts.tickers?.length ? new Set(opts.tickers.map((t) => t.toUpperCase())) : null;
  return index.chunks
    .filter((c) => !allowed || allowed.has(c.ticker))
    .map((c) => {
      const { embedding, ...rest } = c;
      return { ...rest, score: cosine(queryEmbedding, embedding) };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}
