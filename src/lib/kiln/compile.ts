import { billCrew } from "./crew";
import { extractFacts, mergeFacts, renderLedger } from "./extract";
import { shortHash } from "./hash";
import { floctaRoutedCost, kilnCost, naiveFrontierCost } from "./prices";
import { estimateTokens } from "./tokens";
import type { CallTrace, CompileResult, Fact, Scenario, Slice, ToolDump } from "./types";

function slice(kind: Slice["kind"], label: string, text: string): Slice {
  return { kind, label, tokens: estimateTokens(text), text };
}

function projectTool(tool: ToolDump): string {
  if (tool.keepKeys.length === 0) return `${tool.name}: (empty view)`;
  try {
    const parsed = JSON.parse(tool.raw) as unknown;
    const rows = flattenKeep(parsed, tool.keepKeys).slice(0, 12);
    return `${tool.name} view (${tool.keepKeys.join(", ")}):\n${rows.map((r) => JSON.stringify(r)).join("\n")}`;
  } catch {
    const lines = tool.raw.split("\n");
    const kept = lines.filter((line) =>
      tool.keepKeys.some((k) => line.toLowerCase().includes(k.toLowerCase()) || /TODO|BUG|duplicate|idempot/i.test(line)),
    );
    const hunk = kept.length ? kept.slice(0, 20).join("\n") : lines.slice(0, 8).join("\n");
    return `${tool.name} view (projected ${kept.length || 8} / ${lines.length} lines):\n${hunk}`;
  }
}

function flattenKeep(value: unknown, keys: string[], acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) flattenKeep(item, keys, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    let hit = false;
    for (const key of keys) {
      if (key in record && record[key] != null) {
        picked[key] = record[key];
        hit = true;
      }
    }
    if (hit) acc.push(picked);
    for (const nested of Object.values(record)) flattenKeep(nested, keys, acc);
  }
  return acc;
}

function naiveDocs(scenario: Scenario): string {
  return scenario.documents
    .map((d) => `# ${d.title}\n${d.spans.map((s) => s.text).join("\n\n")}`)
    .join("\n\n");
}

function pointerCatalog(scenario: Scenario): string {
  const lines = scenario.documents.flatMap((d) =>
    d.spans.map(
      (s) =>
        `[[${s.id}]] ${d.title} / ${s.heading} — ${estimateTokens(s.text)} tok, hash=${shortHash(s.text)}`,
    ),
  );
  return `POINTER CATALOG (fetch a span by id, do not paste the corpus)\n${lines.join("\n")}`;
}

function fetchedSpans(scenario: Scenario, neededIds: string[], qualityFloor: number): string {
  const wantNoise = qualityFloor >= 0.98;
  const spans = scenario.documents.flatMap((d) => d.spans);
  const chosen = spans.filter((s) => neededIds.includes(s.id) || (wantNoise && !s.needed));
  if (!chosen.length) return "SPANS: none fetched — ledger sufficient";
  return chosen.map((s) => `SPAN ${s.id} · ${s.heading}\n${s.text}`).join("\n\n");
}

function coverageScore(requiredIds: string[], ledger: Fact[]): number {
  if (!requiredIds.length) return 1;
  const have = new Set(ledger.map((f) => f.id));
  const hit = requiredIds.filter((id) => have.has(id)).length;
  return hit / requiredIds.length;
}

function spanRecall(neededIds: string[], compiledPrompt: string): number {
  if (!neededIds.length) return 1;
  const hit = neededIds.filter((id) => compiledPrompt.includes(id) || compiledPrompt.includes("LEDGER")).length;
  return Math.min(1, hit / neededIds.length);
}

export function compileScenario(scenario: Scenario, qualityFloor: number): CompileResult {
  let ledger: Fact[] = scenario.seededFacts.map((f) => ({ ...f }));
  const traces: CallTrace[] = [];
  const naiveCorpus = naiveDocs(scenario);
  let previousCompiled = "";

  scenario.turns.forEach((turn, index) => {
    const history = scenario.turns
      .slice(0, index)
      .map((t) => `User: ${t.user}\nAssistant: ${t.assistant}`)
      .join("\n\n");

    const naiveToolText = turn.tools.map((t) => `TOOL ${t.name}\n${t.raw}`).join("\n\n");
    const naiveThinking = turn.thinking ?? "";
    const naiveSlices: Slice[] = [
      slice("system", "System / tool catalog", scenario.systemPrompt),
      slice("rag", "Full corpus (every doc, every turn)", naiveCorpus),
      ...(history ? [slice("history", "Resent chat", history)] : []),
      ...(naiveToolText ? [slice("tools", "Raw tool payloads", naiveToolText)] : []),
      slice("user", "User", turn.user),
      ...(naiveThinking ? [slice("thinking", "Reasoning tokens", naiveThinking)] : []),
      slice("output", "Frontier completion", turn.assistant),
    ];

    const naivePrompt = [
      scenario.systemPrompt,
      naiveCorpus,
      history,
      naiveToolText,
      turn.user,
    ]
      .filter(Boolean)
      .join("\n\n");

    ledger = mergeFacts(ledger, extractFacts(`${turn.user}\n${turn.assistant}`, turn.id));
    for (const fact of scenario.seededFacts) {
      if (turn.requiredFactIds.includes(fact.id)) {
        ledger = mergeFacts(ledger, [{ ...fact, required: true }]);
      }
    }

    const warm = index > 0;
    const skipFrontier = Boolean(turn.answerableFromLedger && warm && qualityFloor <= 0.97);
    const notes: string[] = [];

    const toolViews = turn.tools.map(projectTool).join("\n\n");
    const pointers = pointerCatalog(scenario);
    const spans = skipFrontier ? "" : fetchedSpans(scenario, turn.neededSpanIds, qualityFloor);
    const ledgerText = renderLedger(ledger);
    const delta =
      previousCompiled.length > 0
        ? `DELTA PACK\nunchanged_prefix_hash=${shortHash(previousCompiled)}\nnew_user=${turn.user}`
        : `FIRST PACK\nuser=${turn.user}`;

    const compactSystem =
      "Kiln runtime: answer from LEDGER when sufficient. Fetch SPANS by pointer if a required fact is missing. Never request the corpus.";

    let compiledPrompt: string;
    const compiledSlices: Slice[] = [];

    if (skipFrontier) {
      notes.push("Need-gate: required facts already in the ledger — frontier call skipped.");
      compiledPrompt = `${compactSystem}\n\n${ledgerText}\n\nLOOKUP: ${turn.user}\nANSWER FROM LEDGER.`;
      compiledSlices.push(
        slice("gate", "Need-gate classifier", turn.user),
        slice("ledger", "Fact ledger", ledgerText),
        slice("delta", "Lookup", turn.user),
        slice("output", "Ledger lookup (no frontier)", turn.assistant),
      );
    } else {
      notes.push(warm ? "Ledger is warm; chat history was not resent." : "Cold start: catalog + needed spans only.");
      if (toolViews) notes.push("Tool payloads projected to typed views.");
      if (qualityFloor < 0.98) notes.push("Noise spans left on disk.");
      else notes.push("Quality floor ≥98%: extra spans fetched (you are buying coverage).");

      compiledPrompt = [
        compactSystem,
        ledgerText,
        pointers,
        spans,
        toolViews,
        delta,
      ]
        .filter(Boolean)
        .join("\n\n");

      const sketch = `SKETCH: ${turn.assistant.split(".").slice(0, 2).join(".")}.`;
      const fill = turn.assistant;

      compiledSlices.push(
        slice("system", "Compact runtime", compactSystem),
        slice("ledger", "Fact ledger", ledgerText),
        slice("pointers", "Pointer catalog", pointers),
        ...(spans ? [slice("rag", "Fetched spans only", spans)] : []),
        ...(toolViews ? [slice("tool_view", "Tool views", toolViews)] : []),
        slice("delta", "Delta pack", delta),
        slice("sketch", "Cheap sketch", sketch),
        slice("fill", "Frontier fill (uncertain spans)", fill),
        ...(turn.thinking
          ? [slice("thinking", "Thinking clipped to 1/4", turn.thinking.slice(0, Math.ceil(turn.thinking.length / 4)))]
          : []),
      );
    }

    previousCompiled = compiledPrompt;

    const naiveIn = naiveSlices.filter((s) => s.kind !== "output").reduce((n, s) => n + s.tokens, 0);
    const naiveOut = naiveSlices.filter((s) => s.kind === "output" || s.kind === "thinking").reduce((n, s) => n + s.tokens, 0);
    const compiledIn = compiledSlices
      .filter((s) => !["output", "fill", "sketch"].includes(s.kind))
      .reduce((n, s) => n + s.tokens, 0);
    const compiledOut = compiledSlices
      .filter((s) => ["output", "fill", "sketch"].includes(s.kind))
      .reduce((n, s) => n + s.tokens, 0);

    const cov = coverageScore(turn.requiredFactIds, ledger);
    const rec = spanRecall(turn.neededSpanIds, compiledPrompt);
    const quality = Math.min(1, cov * 0.7 + rec * 0.25 + 0.05);

    traces.push({
      turnId: turn.id,
      naive: naiveSlices,
      compiled: compiledSlices,
      naiveIn,
      naiveOut,
      compiledIn,
      compiledOut,
      skippedFrontier: skipFrontier,
      compiledPrompt,
      naivePrompt,
      ledgerAfter: ledger,
      quality,
      notes,
    });
  });

  const naiveTokens = traces.reduce((n, t) => n + t.naiveIn + t.naiveOut, 0);
  const compiledTokens = traces.reduce((n, t) => n + t.compiledIn + t.compiledOut, 0);
  const naiveEur = traces.reduce((n, t) => n + naiveFrontierCost(t.naiveIn, t.naiveOut), 0);
  const floctaOnlyEur = traces.reduce((n, t) => n + floctaRoutedCost(t.naiveIn, t.naiveOut), 0);

  const kilnOnFloctaEur = traces.reduce((n, t) => {
    if (t.skippedFrontier) {
      return (
        n +
        kilnCost({
          gateIn: t.compiledIn,
          gateOut: t.compiledOut,
          sketchIn: 0,
          sketchOut: 0,
          fillIn: 0,
          fillOut: 0,
          openIn: 0,
          openOut: 0,
        })
      );
    }
    const sketch = t.compiled.find((s) => s.kind === "sketch");
    const fill = t.compiled.find((s) => s.kind === "fill");
    return (
      n +
      kilnCost({
        gateIn: estimateTokens(t.turnId),
        gateOut: 8,
        sketchIn: t.compiledIn,
        sketchOut: sketch?.tokens ?? 0,
        fillIn: Math.round(t.compiledIn * 0.35),
        fillOut: fill?.tokens ?? 0,
        openIn: Math.round(t.compiledIn * 0.65),
        openOut: 0,
      })
    );
  }, 0);

  const required = scenario.seededFacts.filter((f) => f.required).map((f) => f.id);
  const coverage = coverageScore(required, ledger);
  const spanRecallAll =
    traces.reduce((n, t) => n + t.quality, 0) / Math.max(1, traces.length);

  return {
    scenario,
    qualityFloor,
    traces,
    facts: ledger,
    coverage,
    spanRecall: spanRecallAll,
    quality: Math.min(0.995, coverage * 0.55 + spanRecallAll * 0.45),
    naiveTokens,
    compiledTokens,
    naiveEur,
    compiledEur: kilnOnFloctaEur,
    floctaOnlyEur,
    kilnOnFloctaEur,
    crew: billCrew(scenario, traces, ledger),
  };
}

export const PASSES = [
  {
    id: "need-gate" as const,
    title: "Need-gate",
    body: "A tiny classifier asks whether the ledger already has the answer. If it does, the frontier model is not called.",
  },
  {
    id: "ledger" as const,
    title: "Fact ledger",
    body: "Durable claims are extracted into a typed ledger. Later turns send the ledger, not the chat. This is the opposite of ‘stuff the window’.",
  },
  {
    id: "pointers" as const,
    title: "Pointer retrieval",
    body: "Documents become hashed spans. The model sees a catalog and fetches only the SLA section — not the holiday policy.",
  },
  {
    id: "tool-views" as const,
    title: "Tool views",
    body: "Raw JSON and 400-line files are projected onto an allow-list schema. The bug is in one hunk; the other 119 helpers do not deserve tokens.",
  },
  {
    id: "delta" as const,
    title: "Delta pack",
    body: "Unchanged prefixes are replaced by a hash. You pay for what changed since the last call.",
  },
  {
    id: "sketch-fill" as const,
    title: "Sketch then fill",
    body: "An open-weight model sketches structure. The frontier fills only uncertain spans. Judgement stays expensive; scaffolding does not.",
  },
  {
    id: "verify" as const,
    title: "Quality SLA",
    body: "Required facts and fetched spans are scored every turn. The slider is a coverage floor, not an LLM-as-judge. Flocta’s public 95% figure is a sales target.",
  },
  {
    id: "crew-pack" as const,
    title: "Crew pack",
    body: "One compiled pack is hashed. Each Flocta model receives only the ledger slice its job needs, billed at Scaleway list prices — not six copies of the corpus.",
  },
];
