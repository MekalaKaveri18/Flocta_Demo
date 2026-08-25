import { cn } from "@/lib/utils";
import type { Slice, TokenKind } from "@/lib/kiln/types";

const KIND: Record<TokenKind, { color: string }> = {
  system: { color: "bg-zinc-400" },
  history: { color: "bg-orange-500" },
  rag: { color: "bg-amber-400" },
  tools: { color: "bg-red-500" },
  user: { color: "bg-zinc-700" },
  output: { color: "bg-zinc-500" },
  thinking: { color: "bg-fuchsia-500" },
  ledger: { color: "bg-emerald-500" },
  pointers: { color: "bg-emerald-400" },
  tool_view: { color: "bg-teal-500" },
  delta: { color: "bg-sky-500" },
  sketch: { color: "bg-sky-400" },
  fill: { color: "bg-emerald-600" },
  gate: { color: "bg-green-600" },
};

export function FlameBar({ slices, className }: { slices: Slice[]; className?: string }) {
  const total = Math.max(1, slices.reduce((n, s) => n + s.tokens, 0));
  return (
    <div className={cn("flex h-9 w-full overflow-hidden rounded-md bg-zinc-100 ring-1 ring-zinc-200", className)}>
      {slices
        .filter((s) => s.tokens > 0)
        .map((s, i) => (
          <div
            key={`${s.kind}-${i}`}
            title={`${s.label}: ${s.tokens.toLocaleString()} tok`}
            className={cn("h-full min-w-px", KIND[s.kind].color)}
            style={{ width: `${(s.tokens / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

export function FlameLegend({ slices }: { slices: Slice[] }) {
  const grouped = new Map<string, { tokens: number; kind: TokenKind; label: string }>();
  for (const s of slices) {
    const prev = grouped.get(s.kind);
    grouped.set(s.kind, {
      kind: s.kind,
      label: s.label,
      tokens: (prev?.tokens ?? 0) + s.tokens,
    });
  }
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
      {[...grouped.values()]
        .sort((a, b) => b.tokens - a.tokens)
        .map((g) => (
          <li key={g.kind} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-sm", KIND[g.kind].color)} />
            <span>{g.label}</span>
            <span className="font-mono text-zinc-400">{g.tokens.toLocaleString()}</span>
          </li>
        ))}
    </ul>
  );
}
