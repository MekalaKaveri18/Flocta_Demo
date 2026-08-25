import { extractFacts } from "./extract";
import { estimateTokens } from "./tokens";
import type { Document, Fact, Scenario, ToolDump } from "./types";

export type JobDraft = {
  id: string;
  title: string;
  department: string;
  question: string;
  dump: string;
};

const CHUNK = 900;

function chunks(text: string): string[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length >= 2) return blocks;
  const out: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK) out.push(text.slice(i, i + CHUNK));
  return out.length ? out : [text];
}

function keywords(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9€]+/)
    .filter((w) => w.length > 3);
}

/** Build a compileable job from a pasted dump. Noise spans stay on disk unless SLA ≥ 98%. */
export function scenarioFromDump(draft: JobDraft): Scenario {
  const parts = chunks(draft.dump);
  const keys = keywords(draft.question);
  const spans = parts.map((text, i) => {
    const hit = keys.some((k) => text.toLowerCase().includes(k));
    return {
      id: `u${i + 1}`,
      heading: `Span ${i + 1}`,
      text,
      needed: hit || i === 0,
      docId: "dump",
    };
  });
  if (!spans.some((s) => s.needed)) spans[0].needed = true;
  // Keep at least one noise span so the inspector can show disk vs fetch.
  if (spans.length === 1) {
    spans.push({
      id: "u-noise",
      heading: "Padding (not in your paste)",
      text: "Stand-up notes, holiday policy, webinar invites, unused CSV columns. ".repeat(24),
      needed: false,
      docId: "dump",
    });
  }

  const documents: Document[] = [{ id: "dump", title: draft.title || "pasted dump", spans }];
  const mined = extractFacts(`${draft.question}\n${draft.dump.slice(0, 8000)}`, draft.id);
  const seededFacts: Fact[] = mined.slice(0, 8).map((f, i) => ({ ...f, required: i < 4 }));
  if (!seededFacts.length) {
    seededFacts.push({
      id: `${draft.id}:ask`,
      key: "Ask",
      value: draft.question.slice(0, 160),
      source: "user",
      required: true,
    });
  }

  const neededSpanIds = spans.filter((s) => s.needed).map((s) => s.id);
  const requiredFactIds = seededFacts.filter((f) => f.required).map((f) => f.id);

  let tools: ToolDump[] = [];
  const trimmed = draft.dump.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const keepKeys =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? Object.keys(parsed as object).slice(0, 8)
          : ["id", "type", "name"];
      tools = [{ name: "pasted.json", raw: trimmed.slice(0, 12000), keepKeys }];
    } catch {
      tools = [];
    }
  }

  const tok = estimateTokens(draft.dump);

  return {
    id: draft.id,
    title: draft.title.trim() || "Untitled job",
    department: draft.department.trim() || "Your dump",
    thesis: `You pasted ${tok.toLocaleString()} tok. Uncompiled resends all of it. Kiln fetches matching spans and keeps a ledger.`,
    naiveModel: "Claude Opus 4.5",
    systemPrompt:
      "You are the frontier model. You will be given the full pasted dump on every turn unless Kiln compiles it.",
    documents,
    seededFacts,
    turns: [
      {
        id: `${draft.id}-t1`,
        user: draft.question.trim(),
        assistant: seededFacts
          .filter((f) => f.required)
          .map((f) => `${f.key}: ${f.value}`)
          .join(". "),
        tools,
        requiredFactIds,
        neededSpanIds,
      },
      {
        id: `${draft.id}-t2`,
        user: "Remind me using only the ledger. Do not re-read the dump.",
        assistant: seededFacts
          .filter((f) => f.required)
          .slice(0, 4)
          .map((f) => f.value)
          .join(" · "),
        tools: [],
        requiredFactIds,
        neededSpanIds: [],
        answerableFromLedger: true,
      },
    ],
  };
}
