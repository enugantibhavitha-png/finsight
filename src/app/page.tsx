"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo, useState } from "react";
import { parseBlocks, parseInline } from "@/lib/markdown";
import type { ChatMetadata } from "./api/chat/route";

type Passage = { id: string; ticker: string; fiscalYear: string; score: number; text: string };
type Msg = UIMessage<ChatMetadata>;

const EXAMPLES = [
  "What are Apple's biggest supply chain risks?",
  "Compare how Microsoft and NVIDIA describe competition in AI.",
  "How does NVIDIA describe its dependence on a few customers?",
  "Which companies are in the index?",
];

type AnyToolPart = { type: string; state?: string; input?: { query?: string; tickers?: string[] }; output?: unknown };

function passagesFrom(message: Msg): Map<string, Passage> {
  const map = new Map<string, Passage>();
  for (const part of message.parts as AnyToolPart[]) {
    if (part.type === "tool-searchFilings" && part.state === "output-available" && Array.isArray(part.output)) {
      for (const p of part.output as Passage[]) map.set(p.id, p);
    }
  }
  return map;
}

function AnswerText({ text, passages, onCite }: { text: string; passages: Map<string, Passage>; onCite: (p: Passage) => void }) {
  const inline = (s: string) =>
    parseInline(s).map((tok, i) => {
      switch (tok.type) {
        case "bold":
          return <strong key={i}>{tok.value}</strong>;
        case "italic":
          return <em key={i}>{tok.value}</em>;
        case "code":
          return <code key={i}>{tok.value}</code>;
        case "cite": {
          const passage = passages.get(tok.value);
          return passage ? (
            <button key={i} className="cite" onClick={() => onCite(passage)} title="Show source passage">
              {tok.value}
            </button>
          ) : (
            <span key={i} className="cite cite-missing">{tok.value}</span>
          );
        }
        default:
          return tok.value;
      }
    });

  return (
    <div className="answer">
      {parseBlocks(text).map((b, i) => {
        if (b.type === "heading") return <h3 key={i}>{inline(b.text)}</h3>;
        if (b.type === "ul") return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
        if (b.type === "ol")
          return (
            <ol key={i} start={b.start}>
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </ol>
          );
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}

function ToolStep({ part }: { part: AnyToolPart }) {
  const done = part.state === "output-available";
  if (part.type === "tool-listCompanies") {
    return <div className="step">{done ? "✓" : "…"} Checked which filings are available</div>;
  }
  if (part.type === "tool-searchFilings") {
    const q = part.input?.query;
    const t = part.input?.tickers?.length ? ` in ${part.input.tickers.join(", ")}` : "";
    const n = done && Array.isArray(part.output) ? ` · ${part.output.length} passages` : "";
    return (
      <div className="step">
        {done ? "✓" : "…"} Searched filings{t}: <em>{q ?? "…"}</em>
        {n}
      </div>
    );
  }
  return null;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [cited, setCited] = useState<Passage | null>(null);
  const { messages, sendMessage, status, error, stop } = useChat<Msg>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";

  const totals = useMemo(() => {
    let tokens = 0;
    let cost = 0;
    for (const m of messages) {
      const u = m.metadata?.usage;
      if (u) {
        tokens += u.inputTokens + u.outputTokens;
        cost += u.estimatedCostUsd ?? 0;
      }
    }
    return { tokens, cost };
  }, [messages]);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    sendMessage({ text: q });
    setInput("");
  };

  return (
    <main className="shell">
      <header className="top">
        <div>
          <h1>FinSight</h1>
          <p className="tag">An agentic RAG analyst for SEC 10-K filings, with cited answers.</p>
        </div>
        {totals.tokens > 0 && (
          <div className="usage" title="Tokens and estimated OpenAI cost for this session">
            {totals.tokens.toLocaleString()} tokens · ${totals.cost.toFixed(4)}
          </div>
        )}
      </header>

      <section className="thread">
        {messages.length === 0 && (
          <div className="empty">
            <p>Ask about risks, strategy, competition, or operations in the filings. Every claim links to its source passage.</p>
            <div className="examples">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => ask(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const passages = passagesFrom(m);
          return (
            <article key={m.id} className={m.role === "user" ? "msg user" : "msg bot"}>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return m.role === "user" ? (
                    <div key={i}>{part.text}</div>
                  ) : (
                    <AnswerText key={i} text={part.text} passages={passages} onCite={setCited} />
                  );
                }
                if (part.type.startsWith("tool-")) return <ToolStep key={i} part={part as AnyToolPart} />;
                return null;
              })}
              {m.metadata?.guardrail && <div className="guard">Guardrail: {m.metadata.guardrail.replace(/_/g, " ")}</div>}
              {m.metadata?.usage && (
                <div className="meta">
                  {m.metadata.model} · {m.metadata.usage.inputTokens + m.metadata.usage.outputTokens} tokens
                  {m.metadata.usage.estimatedCostUsd !== null && ` · $${m.metadata.usage.estimatedCostUsd.toFixed(5)}`}
                </div>
              )}
            </article>
          );
        })}
        {status === "submitted" && <div className="msg bot thinking">Thinking…</div>}
        {error && <div className="msg bot err">Something went wrong: {error.message}</div>}
      </section>

      {cited && (
        <aside className="source" role="dialog" aria-label="Source passage">
          <div className="source-head">
            <strong>{cited.id}</strong> · {cited.ticker} 10-K FY{cited.fiscalYear} · relevance {cited.score}
            <button onClick={() => setCited(null)} aria-label="Close">✕</button>
          </div>
          <p>{cited.text}</p>
        </aside>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the 10-K filings…"
          maxLength={2000}
          aria-label="Question"
        />
        {busy ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Ask
          </button>
        )}
      </form>
      <p className="disclaimer">For research and demo purposes only. Not investment advice.</p>
    </main>
  );
}
