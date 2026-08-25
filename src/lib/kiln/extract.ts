import type { Fact } from "./types";

const KEY_VALUE =
  /(?:^|\n)\s*(?:[-*]\s*)?([A-Za-z][A-Za-z0-9_ /%]{1,48})\s*[:=]\s+([^\n]{2,160})/g;
const MONEY = /€\s?\d[\d.,]*|\b\d[\d.,]*\s?%|\bQ[1-4]\s?\d{4}\b/g;

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

/** Deterministic fact miner — no model. This is the ledger writer. */
export function extractFacts(text: string, source: string): Fact[] {
  const facts: Fact[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(KEY_VALUE)) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/[.;]$/, "");
    if (value.length < 2) continue;
    const id = `${source}:${slug(key)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    facts.push({ id, key, value, source, required: false });
  }

  const money = text.match(MONEY) ?? [];
  if (money.length) {
    const id = `${source}:numerics`;
    if (!seen.has(id)) {
      facts.push({
        id,
        key: "Observed numbers",
        value: [...new Set(money)].slice(0, 8).join(" · "),
        source,
        required: false,
      });
    }
  }

  return facts;
}

export function mergeFacts(existing: Fact[], incoming: Fact[]): Fact[] {
  const map = new Map(existing.map((f) => [f.id, f]));
  for (const fact of incoming) {
    const prev = map.get(fact.id);
    if (!prev) map.set(fact.id, fact);
    else map.set(fact.id, { ...prev, value: fact.value, required: prev.required || fact.required });
  }
  return [...map.values()];
}

export function renderLedger(facts: Fact[], max = 18): string {
  if (!facts.length) return "LEDGER: empty";
  const lines = facts.slice(0, max).map((f) => `- ${f.key}: ${f.value}`);
  const extra = facts.length > max ? `\n- … ${facts.length - max} older facts compacted` : "";
  return `LEDGER (${facts.length} facts, durable — do not resend chat)\n${lines.join("\n")}${extra}`;
}
