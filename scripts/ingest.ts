/**
 * Download the most recent 10-Ks for each ticker from SEC EDGAR, split them into
 * chunks, embed the chunks with OpenAI, and write data/index.json.
 *
 * Usage:  npm run ingest -- AAPL MSFT NVDA --years 3
 * Needs:  OPENAI_API_KEY and SEC_USER_AGENT in .env.local
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chunkId } from "../src/lib/citations";
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

type FilingMeta = { company: string; fiscalYear: string; filingDate: string; url: string };
type FilingList = { form: string[]; accessionNumber: string[]; primaryDocument: string[]; reportDate: string[]; filingDate: string[] };

function tenKs(list: FilingList, cik: number, company: string): FilingMeta[] {
  const out: FilingMeta[] = [];
  list.form.forEach((form, i) => {
    if (form !== "10-K") return; // skip amendments (10-K/A)
    const accession = list.accessionNumber[i].replace(/-/g, "");
    out.push({
      company,
      fiscalYear: String(list.reportDate[i]).slice(0, 4),
      filingDate: list.filingDate[i],
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${list.primaryDocument[i]}`,
    });
  });
  return out;
}

/** The newest `years` 10-K filings, one per fiscal year. */
async function recent10Ks(ticker: string, tickers: Record<string, TickerRow>, years: number): Promise<FilingMeta[]> {
  const row = Object.values(tickers).find((r) => r.ticker.toUpperCase() === ticker);
  if (!row) throw new Error(`Unknown ticker ${ticker}`);
  const cik = String(row.cik_str).padStart(10, "0");
  const subs = await (await sec(`https://data.sec.gov/submissions/CIK${cik}.json`)).json();
  let found = tenKs(subs.filings.recent, row.cik_str, row.title);
  // Busy filers push older 10-Ks out of "recent"; page through the archive files if needed.
  for (const file of (subs.filings.files ?? []) as { name: string }[]) {
    if (new Set(found.map((f) => f.fiscalYear)).size >= years) break;
    const older: FilingList = await (await sec(`https://data.sec.gov/submissions/${file.name}`)).json();
    found = found.concat(tenKs(older, row.cik_str, row.title));
  }
  const byYear = new Map<string, FilingMeta>();
  for (const f of found) if (!byYear.has(f.fiscalYear)) byYear.set(f.fiscalYear, f);
  const result = [...byYear.values()].sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear)).slice(0, years);
  if (!result.length) throw new Error(`No 10-K found for ${ticker}`);
  return result;
}

function parseArgs(argv: string[]) {
  const yearsFlag = argv.indexOf("--years");
  const years = yearsFlag >= 0 ? Number(argv[yearsFlag + 1]) : 3;
  if (!Number.isInteger(years) || years < 1 || years > 5) throw new Error("--years must be a whole number from 1 to 5");
  const tickers = argv.filter((a, i) => !a.startsWith("--") && (yearsFlag < 0 || i !== yearsFlag + 1)).map((t) => t.toUpperCase());
  return { years, tickers: tickers.length ? tickers : ["AAPL", "MSFT", "NVDA"] };
}

async function main() {
  const { years, tickers: list } = parseArgs(process.argv.slice(2));
  console.log(`Building index for: ${list.join(", ")} (last ${years} fiscal years)`);

  const tickers: Record<string, TickerRow> = await (await sec("https://www.sec.gov/files/company_tickers.json")).json();
  const index: FilingIndex = {
    embeddingModel: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    createdAt: new Date().toISOString(),
    companies: [],
    chunks: [],
  };

  for (const ticker of list) {
    for (const meta of await recent10Ks(ticker, tickers, years)) {
      console.log(`\n${ticker}: ${meta.company} 10-K (FY${meta.fiscalYear}, filed ${meta.filingDate})`);
      const html = await (await sec(meta.url)).text();
      const texts = chunkText(htmlToText(html)).slice(0, MAX_CHUNKS_PER_FILING);
      console.log(`  ${texts.length} chunks, embedding...`);

      for (let b = 0; b < texts.length; b += BATCH) {
        const batch = texts.slice(b, b + BATCH);
        const vectors = await embedBatch(batch);
        batch.forEach((text, j) => {
          const chunk: Chunk = {
            id: chunkId(ticker, meta.fiscalYear, b + j),
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
  }

  const out = join(process.cwd(), "data", "index.json");
  writeFileSync(out, JSON.stringify(index));
  console.log(`\nSaved ${index.chunks.length} chunks from ${index.companies.length} filings to data/index.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
