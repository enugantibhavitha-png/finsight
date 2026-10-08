import { loadIndex } from "@/lib/index-store";
import { availableYears } from "@/lib/vector";

/** Filings and fiscal years in the index, for the UI year picker. */
export async function GET() {
  const index = loadIndex();
  return Response.json({ years: availableYears(index), filings: index.companies });
}
