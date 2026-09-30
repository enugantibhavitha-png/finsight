/**
 * Evaluation harness.
 *   npm run eval            -> retrieval + safety evals (cheap: embeddings only)
 *   npm run eval -- --answers -> also runs the full agent on answer cases
 *
 * Exits with code 1 if results fall below the thresholds, so it can gate CI.
 */
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { readFileSync, writeFileSync } from "node:fs";
import { SYSTEM_PROMPT, ADVICE_NOTE, tools } from "../src/lib/agent";
import { CHAT_MODEL, DEFAULT_TOP_K, MAX_AGENT_STEPS } from "../src/lib/config";
import { summarizeUsage } from "../src/lib/cost";
import { embedQuery } from "../src/lib/embed";
import { checkInput, isAdviceRequest } from "../src/lib/guardrails";
import { loadIndex } from "../src/lib/index-store";
import { search } from "../src/lib/vector";

const THRESHOLDS = { hitRate: 0.8, mrr: 0.5, answerPass: 0.66 };

type Golden = {
  retrieval: { question: string; ticker: string; keywords: string[] }[];
  answers: { question: string; mustCite?: string[]; mustInclude?: string[] }[];
  safety: { question: string; expectBlocked: boolean }[];
};

const golden: Golden = JSON.parse(readFileSync("evals/golden.json", "utf8"));
const runAnswers = process.argv.includes("--answers");

async function retrievalEval() {
  const index = loadIndex();
  if (!index.chunks.length) throw new Error("Index is empty. Run `npm run ingest` first.");
  const available = new Set(index.companies.map((c) => c.ticker));
  const cases = golden.retrieval.filter((c) => available.has(c.ticker));

  let hits = 0;
  let rrSum = 0;
  const rows = [];
  for (const c of cases) {
    const results = search(index, await embedQuery(c.question), { k: DEFAULT_TOP_K });
    const rank = results.findIndex(
      (r) => r.ticker === c.ticker && c.keywords.some((k) => r.text.toLowerCase().includes(k.toLowerCase())),
    );
    if (rank >= 0) {
      hits++;
      rrSum += 1 / (rank + 1);
    }
    rows.push({ question: c.question, expected: c.ticker, rank: rank >= 0 ? rank + 1 : "miss", top: results[0]?.id });
  }
  const hitRate = cases.length ? hits / cases.length : 0;
  const mrr = cases.length ? rrSum / cases.length : 0;
  console.table(rows);
  console.log(`Retrieval: hit@${DEFAULT_TOP_K} = ${(hitRate * 100).toFixed(0)}%, MRR = ${mrr.toFixed(2)} (${cases.length} cases)`);
  return { hitRate, mrr, rows };
}

function safetyEval() {
  const rows = golden.safety.map((c) => {
    const blocked = checkInput(c.question).blocked;
    return { question: c.question, expectBlocked: c.expectBlocked, blocked, pass: blocked === c.expectBlocked };
  });
  console.table(rows);
  const passRate = rows.filter((r) => r.pass).length / rows.length;
  console.log(`Safety: ${(passRate * 100).toFixed(0)}% pass`);
  return { passRate, rows };
}

async function answerEval() {
  const validIds = new Set(loadIndex().chunks.map((c) => c.id));
  const rows = [];
  let totalCost = 0;
  for (const c of golden.answers) {
    const started = Date.now();
    const result = await generateText({
      model: openai(CHAT_MODEL),
      system: SYSTEM_PROMPT + (isAdviceRequest(c.question) ? ADVICE_NOTE : ""),
      prompt: c.question,
      tools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      temperature: 0,
    });
    const text = result.text;
    const cited = [...text.matchAll(/\[([A-Z.]{1,6}-\d{4})\]/g)].map((m) => m[1]);
    const invalid = cited.filter((id) => !validIds.has(id));
    const citesOk = (c.mustCite ?? []).every((t) => cited.some((id) => id.startsWith(`${t}-`)));
    const includesOk = (c.mustInclude ?? []).every((s) => text.toLowerCase().includes(s.toLowerCase()));
    const usage = summarizeUsage(CHAT_MODEL, result.totalUsage);
    totalCost += usage.estimatedCostUsd ?? 0;
    rows.push({
      question: c.question,
      citations: cited.length,
      invalidCitations: invalid.length,
      pass: citesOk && includesOk && invalid.length === 0,
      latencyMs: Date.now() - started,
      tokens: usage.inputTokens + usage.outputTokens,
    });
  }
  console.table(rows);
  const passRate = rows.filter((r) => r.pass).length / rows.length;
  console.log(`Answers: ${(passRate * 100).toFixed(0)}% pass, est. cost $${totalCost.toFixed(4)}`);
  return { passRate, rows };
}

async function main() {
  const retrieval = await retrievalEval();
  const safety = safetyEval();
  const answers = runAnswers ? await answerEval() : null;

  writeFileSync("evals/results.json", JSON.stringify({ at: new Date().toISOString(), retrieval, safety, answers }, null, 2));

  const failures: string[] = [];
  if (retrieval.hitRate < THRESHOLDS.hitRate) failures.push(`hit rate ${retrieval.hitRate.toFixed(2)} < ${THRESHOLDS.hitRate}`);
  if (retrieval.mrr < THRESHOLDS.mrr) failures.push(`MRR ${retrieval.mrr.toFixed(2)} < ${THRESHOLDS.mrr}`);
  if (safety.passRate < 1) failures.push("safety cases failed");
  if (answers && answers.passRate < THRESHOLDS.answerPass) failures.push(`answer pass ${answers.passRate.toFixed(2)} < ${THRESHOLDS.answerPass}`);

  if (failures.length) {
    console.error(`\nEVAL FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("\nAll evals passed. Results saved to evals/results.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
