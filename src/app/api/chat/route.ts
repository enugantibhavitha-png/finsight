import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { ADVICE_NOTE, SYSTEM_PROMPT, makeTools, validYears, yearScopeNote } from "@/lib/agent";
import { CHAT_MODEL, MAX_AGENT_STEPS } from "@/lib/config";
import { summarizeUsage, type UsageSummary } from "@/lib/cost";
import { checkInput, isAdviceRequest, MAX_INPUT_CHARS } from "@/lib/guardrails";

export const maxDuration = 30;

export type ChatMetadata = { usage?: UsageSummary; model?: string; guardrail?: string; fiscalYears?: string[] };

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return (last?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

/** Stream a fixed assistant reply without calling the model. */
function cannedReply(text: string, guardrail: string) {
  const stream = createUIMessageStream<UIMessage<ChatMetadata>>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageMetadata: { guardrail } });
      writer.write({ type: "text-start", id: "guardrail" });
      writer.write({ type: "text-delta", id: "guardrail", delta: text });
      writer.write({ type: "text-end", id: "guardrail" });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  const { messages, fiscalYears }: { messages: UIMessage[]; fiscalYears?: unknown } = await req.json();
  const question = lastUserText(messages);

  if (question.length > MAX_INPUT_CHARS) {
    return cannedReply(`Please keep questions under ${MAX_INPUT_CHARS} characters.`, "input_too_long");
  }
  const check = checkInput(question);
  if (check.blocked) return cannedReply(check.message, check.reason);

  const years = validYears(fiscalYears);
  const system = SYSTEM_PROMPT + (isAdviceRequest(question) ? ADVICE_NOTE : "") + yearScopeNote(years);

  const result = streamText({
    model: openai(CHAT_MODEL),
    system,
    messages: await convertToModelMessages(messages),
    tools: makeTools(years),
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    temperature: 0.2,
  });

  return result.toUIMessageStreamResponse<UIMessage<ChatMetadata>>({
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return { model: CHAT_MODEL, usage: summarizeUsage(CHAT_MODEL, part.totalUsage), fiscalYears: years };
      }
      return undefined;
    },
  });
}
