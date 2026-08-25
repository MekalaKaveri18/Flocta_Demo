import { FLOCTA_MODELS } from "./models";

const openAvg = (field: "inEur" | "outEur") =>
  FLOCTA_MODELS.reduce((n, m) => n + m[field], 0) / FLOCTA_MODELS.length;

/** Public-list-shaped EUR prices per million tokens. Used for the counterfactual bill. */
export const PRICES = {
  opus: { in: 15, out: 75, name: "Claude Opus 4.5" },
  sonnet: { in: 3, out: 15, name: "Claude Sonnet" },
  open: { in: openAvg("inEur"), out: openAvg("outEur"), name: "Flocta Scaleway mix" },
  tiny: { in: 0.02, out: 0.06, name: "Need-gate classifier" },
  sketch: { in: 0.15, out: 0.6, name: "gpt-oss 120b sketch" },
} as const;

export function bill(tokens: number, eurPerMillion: number): number {
  return (tokens / 1_000_000) * eurPerMillion;
}

/**
 * Open-weight routing without context compilation: 70% of input and 85% of
 * output at open-weight prices, the rest on the frontier model.
 */
export function floctaRoutedCost(inputTokens: number, outputTokens: number): number {
  const routedIn = inputTokens * 0.7;
  const frontierIn = inputTokens * 0.3;
  const routedOut = outputTokens * 0.85;
  const frontierOut = outputTokens * 0.15;
  return (
    bill(routedIn, PRICES.open.in) +
    bill(frontierIn, PRICES.opus.in) +
    bill(routedOut, PRICES.open.out) +
    bill(frontierOut, PRICES.opus.out)
  );
}

export function naiveFrontierCost(inputTokens: number, outputTokens: number): number {
  return bill(inputTokens, PRICES.opus.in) + bill(outputTokens, PRICES.opus.out);
}

export function kilnCost(args: {
  gateIn: number;
  gateOut: number;
  sketchIn: number;
  sketchOut: number;
  fillIn: number;
  fillOut: number;
  openIn: number;
  openOut: number;
}): number {
  return (
    bill(args.gateIn, PRICES.tiny.in) +
    bill(args.gateOut, PRICES.tiny.out) +
    bill(args.sketchIn, PRICES.sketch.in) +
    bill(args.sketchOut, PRICES.sketch.out) +
    bill(args.fillIn, PRICES.opus.in) +
    bill(args.fillOut, PRICES.opus.out) +
    bill(args.openIn, PRICES.open.in) +
    bill(args.openOut, PRICES.open.out)
  );
}
