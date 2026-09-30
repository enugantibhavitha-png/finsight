import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./config";

const providerOptions = { openai: { dimensions: EMBEDDING_DIMENSIONS } };

const round = (v: number[]) => v.map((x) => Math.round(x * 1e5) / 1e5);

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embeddingModel(EMBEDDING_MODEL),
    value: text,
    providerOptions,
  });
  return embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embeddingModel(EMBEDDING_MODEL),
    values: texts,
    providerOptions,
    maxParallelCalls: 2,
  });
  return embeddings.map(round);
}
