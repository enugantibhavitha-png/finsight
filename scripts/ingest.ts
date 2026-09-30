/**
 * Download the latest 10-K for each ticker from SEC EDGAR, split it into
 * chunks, embed the chunks with OpenAI, and write data/index.json.
 *
 * Usage:  npm run ingest -- AAPL MSFT NVDA
 * Needs:  OPENAI_API_KEY and SEC_USER_AGENT in .env.local
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chunkText } from "../src/lib/chunk";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../src/lib/config";
import { embedBatch } from "../src/lib/embed";
import { htmlToText } from "../src/lib/html";
import type { Chunk, FilingIndex } from "../src/lib/vector";

const MAX_CHUNKS_PER_FILING = 600;
const BATCH = 96;

const userAgent = process.env.SEC_USER_AGENT;
if (!userAgent) {
  console.error('Set SEC_USER_AGENT in .env.local, e.g. SEC_USER_AGENT="FinSight your.email@example.com" (SEC requires a contact).');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY in .env.local");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sec(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": userAgent!, "Accept-Encoding": "gzip, deflate" } });
  if (!res.ok) throw new Error(`SEC request failed ${res.status}: ${url}`);
  await sleep(150); // stay well under SEC's 10 requests/second limit
  return res;
}

type TickerRow = { cik_str: number; ticker: string; title: string };

async function latest10K(ticker: string, tickers: Record<string, TickerRow>) {
  const row = Object.values(tickers).find((r) => r.ticker.toUpperCase() === ticker);
  if (!row) throw new Error(`Unknown ticker ${ticker}`);
  const cik = String(row.cik_str).padStart(10, "0");
  const subs = await (await sec(`https://data.sec.gov/submissions/CIK${cik}.json`)).json();
  const r = subs.filings.recent;
  const i = (r.form as string[]).findIndex((f) => f === "10-K");
  if (i < 0) throw new Error(`No 10-K found for ${ticker}`);
  const accession = (r.accessionNumber[i] as string).replace(/-/g, "");
  const doc = r.primaryDocument[i] as string;
  return {
    company: row.title,
    fiscalYear: String(r.reportDate[i]).slice(0, 4),
    filingDate: r.filingDate[i] as string,
    url: `https://www.sec.gov/Archives/edgar/data/${row.cik_str}/${accession}/${doc}`,
  };
}

async function main() {
  const requested = process.argv.slice(2).map((t) => t.toUpperCase());
  const list = requested.length ? requested : ["AAPL", "MSFT", "NVDA"];
  console.log(`Building index for: ${list.join(", ")}`);

  const tickers: Record<string, TickerRow> = await (await sec("https://www.sec.gov/files/company_tickers.json")).json();
  const index: FilingIndex = {
    embeddingModel: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    createdAt: new Date().toISOString(),
    companies: [],
    chunks: [],
  };

  for (const ticker of list) {
    const meta = await latest10K(ticker, tickers);
    console.log(`\n${ticker}: ${meta.company} 10-K (FY${meta.fiscalYear}, filed ${meta.filingDate})`);
    const html = await (await sec(meta.url)).text();
    const texts = chunkText(htmlToText(html)).slice(0, MAX_CHUNKS_PER_FILING);
    console.log(`  ${texts.length} chunks, embedding...`);

    for (let b = 0; b < texts.length; b += BATCH) {
      const batch = texts.slice(b, b + BATCH);
      const vectors = await embedBatch(batch);
      batch.forEach((text, j) => {
        const n = b + j;
        const chunk: Chunk = {
          id: `${ticker}-${String(n).padStart(4, "0")}`,
          ticker,
          company: meta.company,
          fiscalYear: meta.fiscalYear,
          filingDate: meta.filingDate,
          sourceUrl: meta.url,
          text,
          embedding: vectors[j],
        };
        index.chunks.push(chunk);
      });
      process.stdout.write(`  ${Math.min(b + BATCH, texts.length)}/${texts.length}\r`);
    }
    index.companies.push({
      ticker,
      company: meta.company,
      fiscalYear: meta.fiscalYear,
      filingDate: meta.filingDate,
      sourceUrl: meta.url,
      chunks: texts.length,
    });
  }

  const out = join(process.cwd(), "data", "index.json");
  writeFileSync(out, JSON.stringify(index));
  console.log(`\nSaved ${index.chunks.length} chunks to data/index.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
