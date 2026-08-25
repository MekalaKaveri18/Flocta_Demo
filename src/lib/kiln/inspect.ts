import { shortHash } from "./hash";
import { estimateTokens } from "./tokens";
import type { Scenario, ToolDump } from "./types";

export type PointerRow = {
  id: string;
  doc: string;
  heading: string;
  tokens: number;
  hash: string;
  fetched: boolean;
};

export function pointerRows(scenario: Scenario, qualityFloor: number, neededIds: string[]): PointerRow[] {
  const wantNoise = qualityFloor >= 0.98;
  return scenario.documents.flatMap((d) =>
    d.spans.map((s) => ({
      id: s.id,
      doc: d.title,
      heading: s.heading,
      tokens: estimateTokens(s.text),
      hash: shortHash(s.text),
      fetched: neededIds.includes(s.id) || (wantNoise && !s.needed),
    })),
  );
}

export type ToolCompare = {
  name: string;
  raw: string;
  view: string;
  rawTokens: number;
  viewTokens: number;
};

export function toolCompare(tools: ToolDump[]): ToolCompare[] {
  return tools.map((tool) => {
    let view = `${tool.name}: (empty view)`;
    if (tool.keepKeys.length) {
      try {
        const parsed = JSON.parse(tool.raw) as unknown;
        const rows: string[] = [];
        const walk = (value: unknown) => {
          if (Array.isArray(value)) {
            value.forEach(walk);
            return;
          }
          if (value && typeof value === "object") {
            const rec = value as Record<string, unknown>;
            const picked: Record<string, unknown> = {};
            for (const key of tool.keepKeys) {
              if (key in rec && rec[key] != null) picked[key] = rec[key];
            }
            if (Object.keys(picked).length) rows.push(JSON.stringify(picked));
            Object.values(rec).forEach(walk);
          }
        };
        walk(parsed);
        view = `${tool.name} view (${tool.keepKeys.join(", ")}):\n${rows.slice(0, 12).join("\n")}`;
      } catch {
        const lines = tool.raw.split("\n");
        const kept = lines.filter((line) =>
          tool.keepKeys.some((k) => line.toLowerCase().includes(k.toLowerCase())),
        );
        view = `${tool.name} view:\n${(kept.length ? kept : lines).slice(0, 16).join("\n")}`;
      }
    }
    return {
      name: tool.name,
      raw: tool.raw,
      view,
      rawTokens: estimateTokens(tool.raw),
      viewTokens: estimateTokens(view),
    };
  });
}
