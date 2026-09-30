import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FilingIndex } from "./vector";

let cached: FilingIndex | null = null;

/** Load data/index.json once per server instance. */
export function loadIndex(): FilingIndex {
  if (!cached) {
    const raw = readFileSync(join(process.cwd(), "data", "index.json"), "utf8");
    cached = JSON.parse(raw) as FilingIndex;
  }
  return cached;
}
