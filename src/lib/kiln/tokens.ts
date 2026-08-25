/** Approximate o200k / cl100k tokenisation well enough to bill a demo honestly. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const normalised = text.replace(/\s+/g, " ").trim();
  if (!normalised) return 0;
  const chars = text.length;
  const words = normalised.split(" ").length;
  const punct = (text.match(/[{}\[\]:",]/g) ?? []).length;
  // JSON/code is denser than prose. Mix char and word estimators.
  const fromChars = chars / (punct > chars * 0.04 ? 3.2 : 3.8);
  const fromWords = words * 1.35;
  return Math.max(1, Math.round(fromChars * 0.62 + fromWords * 0.38));
}

export function sumTokens(parts: { tokens: number }[]): number {
  return parts.reduce((n, p) => n + p.tokens, 0);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return String(Math.round(n));
}

export function formatEur(n: number): string {
  if (n < 0.01) return `€${n.toFixed(4)}`;
  if (n < 1) return `€${n.toFixed(3)}`;
  return `€${n.toFixed(2)}`;
}
