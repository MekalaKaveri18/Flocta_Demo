import { shortHash } from "./hash";
import { CREW_SEATS } from "./models";
import { bill } from "./prices";
import { estimateTokens } from "./tokens";
import type { CallTrace, CrewResult, CrewSeatBill, Fact, Scenario } from "./types";

function seatFacts(facts: Fact[], factIds: string[]): Fact[] {
  const wanted = new Set(factIds);
  const picked = facts.filter((f) => wanted.has(f.id));
  if (picked.length) return picked;
  return facts.filter((f) => f.required).slice(0, 3);
}

function seatPack(args: {
  role: string;
  modelName: string;
  modelId: string;
  job: string;
  facts: Fact[];
  user: string;
  sharedHash: string;
  skipFrontier: boolean;
}): string {
  const ledger = args.facts.map((f) => `- ${f.key}: ${f.value}`).join("\n");
  const head = args.skipFrontier
    ? `NEED-GATE: answer from ledger. Do not call ${args.modelName}.`
    : `ATTESTED PACK ${args.sharedHash}\nSeat: ${args.role} · ${args.modelName}\nWitness: ${args.modelId}\n${args.job}`;
  return `${head}\nLEDGER SLICE\n${ledger || "(empty)"}\nDENIED: full VTT, other seats' notes, Drive dump\nUSER: ${args.user}`;
}

function memoryBlob(scenario: Scenario, facts: Fact[]): string {
  const stuffed = facts.map((f) => `${f.key}=${f.value}`).join("; ");
  const docs = scenario.documents
    .map((d) => d.spans.map((s) => s.text).join("\n"))
    .join("\n");
  return `FLOCTA MEMORY (opaque, same blob for every model)\nRemember: ${stuffed}\n\n${docs}`;
}

/**
 * Flow can fan a job to six models. Today each model still eats a full dump,
 * and Memory is the same stuffed system prompt on every seat.
 * Kiln compiles once, attests the pack, then each seat gets a slice + a hash.
 */
export function billCrew(scenario: Scenario, traces: CallTrace[], facts: Fact[]): CrewResult {
  const sharedHash = `kiln:${shortHash(traces.map((t) => t.compiledPrompt).join("|"))}`;
  const memory = memoryBlob(scenario, facts);
  const memoryTok = estimateTokens(memory);

  const seats: CrewSeatBill[] = CREW_SEATS.map((seat) => {
    let naiveTokens = 0;
    let compiledTokens = 0;
    let naiveEur = 0;
    let compiledEur = 0;
    let gatedTurns = 0;
    let lastPack = "";
    const allowed = seatFacts(facts, seat.factIds);

    for (const trace of traces) {
      naiveTokens += trace.naiveIn + trace.naiveOut;
      naiveEur += bill(trace.naiveIn, seat.model.inEur) + bill(trace.naiveOut, seat.model.outEur);

      const pack = seatPack({
        role: seat.role,
        modelName: seat.model.name,
        modelId: seat.model.id,
        job: seat.job,
        facts: allowed,
        user: scenario.turns.find((t) => t.id === trace.turnId)?.user ?? trace.turnId,
        sharedHash,
        skipFrontier: trace.skippedFrontier,
      });
      lastPack = pack;
      const packTok = estimateTokens(pack);
      const outTok = trace.skippedFrontier ? 12 : Math.max(24, Math.round(trace.naiveOut / 6));
      compiledTokens += packTok + outTok;
      compiledEur += bill(packTok, seat.model.inEur) + bill(outTok, seat.model.outEur);
      if (trace.skippedFrontier) gatedTurns += 1;
    }

    return {
      role: seat.role,
      modelName: seat.model.name,
      vendor: seat.model.vendor,
      inEurPerM: seat.model.inEur,
      outEurPerM: seat.model.outEur,
      job: seat.job,
      pack: lastPack,
      naiveTokens,
      compiledTokens,
      naiveEur,
      compiledEur,
      attestation: `${sharedHash}:${seat.model.id}:${shortHash(lastPack)}`,
      allowedFactIds: allowed.map((f) => f.id),
      gatedTurns,
    };
  });

  const sharedPackTokens = traces.reduce((n, t) => n + t.compiledIn, 0);
  const compiler = CREW_SEATS.find((s) => s.model.id === "gpt-oss-120b")!.model;
  const compilerEur = traces.reduce(
    (n, t) => n + bill(t.compiledIn, compiler.inEur) + bill(Math.min(48, t.compiledOut), compiler.outEur),
    0,
  );

  const seatNaiveTok = seats.reduce((n, s) => n + s.naiveTokens, 0);
  const seatCompiledTok = seats.reduce((n, s) => n + s.compiledTokens, 0);
  const seatNaiveEur = seats.reduce((n, s) => n + s.naiveEur, 0);
  const seatCompiledEur = seats.reduce((n, s) => n + s.compiledEur, 0);
  const memoryEur = CREW_SEATS.reduce((n, s) => n + bill(memoryTok, s.model.inEur), 0);

  return {
    seats,
    naiveTokens: seatNaiveTok,
    compiledTokens: seatCompiledTok + sharedPackTokens,
    naiveEur: seatNaiveEur,
    compiledEur: seatCompiledEur + compilerEur,
    sharedPackTokens,
    sharedHash,
    memoryTokens: memoryTok * seats.length,
    memoryEur,
  };
}
