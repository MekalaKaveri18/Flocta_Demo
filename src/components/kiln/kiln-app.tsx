"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, Play, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  compileScenario,
  PASSES,
  SCENARIOS,
  pointerRows,
  toolCompare,
  scenarioFromDump,
  type JobDraft,
} from "@/lib/kiln";
import { formatEur, formatTokens } from "@/lib/kiln/tokens";
import { FlameBar, FlameLegend } from "./flame";
import { cn } from "@/lib/utils";

const JOBS_KEY = "flocta-kiln-jobs-v1";

const emptyDraft = (): Omit<JobDraft, "id"> => ({
  title: "",
  department: "Ops",
  question: "",
  dump: "",
});

export function KilnApp() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [qualityFloor, setQualityFloor] = useState(0.95);
  const [running, setRunning] = useState(false);
  const [compiled, setCompiled] = useState(true);
  const [turnIndex, setTurnIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seatRole, setSeatRole] = useState("Plan");
  const [passTick, setPassTick] = useState(0);
  const [drafts, setDrafts] = useState<JobDraft[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyDraft);
  const [formError, setFormError] = useState("");
  const [jobsReady, setJobsReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOBS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as JobDraft[];
        if (Array.isArray(parsed)) setDrafts(parsed.filter((d) => d?.id && d.dump));
      }
    } catch {
      /* ignore */
    }
    setJobsReady(true);
  }, []);

  useEffect(() => {
    if (!jobsReady) return;
    localStorage.setItem(JOBS_KEY, JSON.stringify(drafts));
  }, [drafts, jobsReady]);

  const jobs = useMemo(() => [...SCENARIOS, ...drafts.map(scenarioFromDump)], [drafts]);

  const result = useMemo(
    () => compileScenario(jobs.find((s) => s.id === scenarioId) ?? jobs[0], qualityFloor),
    [jobs, scenarioId, qualityFloor],
  );

  const job = jobs.find((s) => s.id === scenarioId) ?? jobs[0];
  const trace = result.traces[Math.min(turnIndex, result.traces.length - 1)];
  const vsUncompiled = 1 - result.kilnOnFloctaEur / Math.max(1e-9, result.naiveEur);
  const vsRouted = 1 - result.kilnOnFloctaEur / Math.max(1e-9, result.floctaOnlyEur);
  const vsCrew = 1 - result.crew.compiledEur / Math.max(1e-9, result.crew.naiveEur);
  const monthlyUncompiled = result.naiveEur * 1000;
  const monthlyKiln = result.kilnOnFloctaEur * 1000;
  const seat = result.crew.seats.find((s) => s.role === seatRole) ?? result.crew.seats[4];
  const turn = job.turns[Math.min(turnIndex, job.turns.length - 1)];
  const pointers = pointerRows(job, qualityFloor, turn?.neededSpanIds ?? []);
  const tools = toolCompare(turn?.tools ?? []);
  const fetchedTok = pointers.filter((p) => p.fetched).reduce((n, p) => n + p.tokens, 0);
  const diskTok = pointers.filter((p) => !p.fetched).reduce((n, p) => n + p.tokens, 0);
  const deadTok = result.naiveTokens - result.compiledTokens;

  const waterfall = [
    { label: "Claude · full window", hint: "No Flocta. Same dump every turn.", eur: result.naiveEur, tone: "waste" as const },
    { label: "Flocta today · routed", hint: "Open weights. Same dump. Routing does not compile.", eur: result.floctaOnlyEur, tone: "mid" as const },
    { label: "Flocta + Kiln", hint: "Ledger, pointers, tool views.", eur: result.kilnOnFloctaEur, tone: "win" as const },
    { label: "Kiln crew · 6 seats", hint: "One pack, then a slice per Scaleway model.", eur: result.crew.compiledEur, tone: "win" as const },
  ];
  const waterfallMax = Math.max(...waterfall.map((w) => w.eur), 1e-9);

  function compile() {
    setRunning(true);
    setCompiled(false);
    setTurnIndex(0);
    setPassTick(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setPassTick(i);
      if (i >= PASSES.length) window.clearInterval(id);
    }, 85);
    window.setTimeout(() => {
      window.clearInterval(id);
      setPassTick(PASSES.length);
      setCompiled(true);
      setRunning(false);
    }, 85 * PASSES.length + 120);
  }

  function saveJob() {
    if (!form.title.trim() || !form.question.trim() || !form.dump.trim()) {
      setFormError("Title, question, and a pasted dump are required.");
      return;
    }
    const next: JobDraft = {
      id: `job-${crypto.randomUUID()}`,
      title: form.title.trim(),
      department: form.department.trim() || "Ops",
      question: form.question.trim(),
      dump: form.dump,
    };
    setDrafts((d) => [next, ...d]);
    setScenarioId(next.id);
    setAdding(false);
    setForm(emptyDraft());
    setFormError("");
    setTurnIndex(0);
    setCompiled(true);
  }

  function removeJob(id: string) {
    setDrafts((d) => d.filter((x) => x.id !== id));
    if (scenarioId === id) setScenarioId(SCENARIOS[0].id);
  }

  return (
    <div className="flex min-h-full flex-col bg-white text-zinc-950">
      <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-h-11 items-center gap-1.5">
            <Image
              src="/brand/flocta-wordmark-clean.png"
              alt="Flocta"
              width={118}
              height={34}
              className="h-8 w-auto object-contain"
              priority
            />
            <span className="pt-0.5 font-medium tracking-tight text-zinc-900">_Kiln</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-zinc-600 md:flex">
            <a href="#jobs" className="hover:text-zinc-950">
              Jobs
            </a>
            <a href="#usage" className="hover:text-zinc-950">
              Usage
            </a>
            <a href="#waterfall" className="hover:text-zinc-950">
              Bill
            </a>
            <a href="#how" className="hover:text-zinc-950">
              How it works
            </a>
            <a href="#inspector" className="hover:text-zinc-950">
              Pack
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSettingsOpen((o) => !o)}
              className="border-zinc-200"
            >
              <Settings2 className="size-3.5" />
              {(qualityFloor * 100).toFixed(0)}% quality
            </Button>
            <Button
              size="sm"
              onClick={compile}
              disabled={running}
              className="rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
            >
              {running ? "Compiling…" : "Compile"}
            </Button>
          </div>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pt-12 pb-8 sm:px-6 sm:pt-16">
        <p className="text-sm font-medium tracking-wide text-zinc-500">
          Routing changes who runs. Kiln changes what they read.
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-6xl sm:leading-[1.05]">
          Flocta_Kiln
          <span className="mt-2 block text-2xl font-normal tracking-tight text-zinc-500 sm:text-3xl">
            The context compiler for the AI you already use.
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">
          Routing changes who runs. Kiln changes what they read. Flocta already plans, routes,
          executes, verifies. The window is still a dump. Flocta_Kiln compiles it once — then each
          open model gets a slice.
        </p>

        <div id="usage" className="mt-10 grid scroll-mt-24 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
            <p className="text-sm text-zinc-500">Claude · full window</p>
            <p className="mt-2 font-mono text-3xl tracking-tight text-zinc-950 sm:text-4xl">
              {formatEur(result.naiveEur)}
            </p>
            <p className="mt-2 text-sm text-zinc-500">{formatTokens(result.naiveTokens)} tok this job</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm text-zinc-500">Flocta today · still the dump</p>
            <p className="mt-2 font-mono text-3xl tracking-tight text-zinc-950 sm:text-4xl">
              {formatEur(result.floctaOnlyEur)}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {Math.round((1 - result.floctaOnlyEur / Math.max(1e-9, result.naiveEur)) * 100)}% vs Claude ·
              same tokens
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-6 text-white">
            <p className="text-sm text-zinc-400">Flocta + Kiln</p>
            <p className="mt-2 font-mono text-3xl tracking-tight sm:text-4xl">
              {formatEur(result.kilnOnFloctaEur)}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {Math.round(vsRouted * 100)}% less than Flocta today · {formatTokens(result.compiledTokens)} tok
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-16 sm:px-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-72">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p id="jobs" className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
              Jobs
            </p>
            <Button
              size="xs"
              variant="outline"
              className="border-zinc-200"
              onClick={() => {
                setAdding(true);
                setFormError("");
              }}
            >
              <Plus className="size-3.5" />
              Add job
            </Button>
          </div>
          <p className="mb-2 text-[11px] leading-4 text-zinc-500">
            Three labeled demos. Add yours: paste a dump, compile it.
          </p>
          <div className="grid gap-2">
            {jobs.map((s) => {
              const custom = drafts.some((d) => d.id === s.id);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-xl border",
                    scenarioId === s.id ? "border-zinc-950 bg-zinc-50" : "border-zinc-200",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setScenarioId(s.id);
                      setTurnIndex(0);
                      setCompiled(true);
                      setAdding(false);
                    }}
                    className="w-full px-3 py-3 text-left"
                  >
                    <span className="text-sm font-medium text-zinc-950">{s.title}</span>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {s.department}
                      {custom ? " · yours" : ""}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{s.thesis}</p>
                  </button>
                  {custom && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 border-t border-zinc-200 px-3 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-950"
                      onClick={() => removeJob(s.id)}
                    >
                      <Trash2 className="size-3" />
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {adding && (
            <section className="rounded-2xl border border-zinc-950 bg-white p-5">
              <h2 className="text-sm font-medium">Add a job</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Paste the window you would otherwise dump into Claude. Kiln splits it into spans,
                builds a ledger, and bills compiled vs uncompiled. Stored in this browser only.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-zinc-600">
                  Title
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-950"
                    placeholder="Q3 renewal risk"
                  />
                </label>
                <label className="text-xs text-zinc-600">
                  Department
                  <input
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-950"
                    placeholder="CS × Finance"
                  />
                </label>
              </div>
              <label className="mt-3 block text-xs text-zinc-600">
                Question
                <input
                  value={form.question}
                  onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-950"
                  placeholder="Why did churn jump — and what do we do?"
                />
              </label>
              <label className="mt-3 block text-xs text-zinc-600">
                Dump
                <textarea
                  value={form.dump}
                  onChange={(e) => setForm((f) => ({ ...f, dump: e.target.value }))}
                  rows={10}
                  className="mt-1 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[11px] leading-5 text-zinc-950 outline-none focus:border-zinc-950"
                  placeholder="Paste Zendesk, CSV, JSON, a recording transcript…"
                />
              </label>
              {formError ? <p className="mt-2 text-xs text-red-600">{formError}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="rounded-full bg-zinc-950 text-white hover:bg-zinc-800" onClick={saveJob}>
                  Compile this dump
                </Button>
                <Button
                  variant="outline"
                  className="border-zinc-200"
                  onClick={() => {
                    setAdding(false);
                    setFormError("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </section>
          )}

          {settingsOpen && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-medium">Quality SLA</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Flocta_Kiln fetches only the spans required to hold this floor. Raise it and unused
                source material comes back into the pack.
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span>Target</span>
                <span className="font-mono text-zinc-950">{(qualityFloor * 100).toFixed(0)}%</span>
              </div>
              <Slider
                className="mt-3"
                min={80}
                max={99}
                step={1}
                value={[Math.round(qualityFloor * 100)]}
                onValueChange={(v) => {
                  const n = Array.isArray(v) ? v[0] : v;
                  setQualityFloor((n ?? 95) / 100);
                }}
              />
            </section>
          )}

          <section className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-zinc-500">{job.department}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{job.title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">{job.thesis}</p>
            </div>
            <Button
              onClick={compile}
              disabled={running}
              className="rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
            >
              <Play className="size-3.5" />
              {running ? "Compiling…" : "Compile job"}
            </Button>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Without Flocta_Kiln" value={formatEur(result.naiveEur)} hint={`${formatTokens(result.naiveTokens)} tok`} />
            <Stat
              label="With Flocta_Kiln"
              value={formatEur(result.kilnOnFloctaEur)}
              hint={`${Math.round(vsUncompiled * 100)}% lower`}
              accent
            />
            <Stat
              label="Quality held"
              value={`${Math.round(result.quality * 1000) / 10}%`}
              hint={`SLA ${(qualityFloor * 100).toFixed(0)}%`}
            />
            <Stat
              label="Dead tokens left on disk"
              value={formatTokens(deadTok)}
              hint={`${formatTokens(diskTok)} in unfetched spans`}
            />
            <Stat
              label="Saved at 1,000 runs"
              value={formatEur(monthlyUncompiled - monthlyKiln)}
              hint={`${Math.round(vsUncompiled * 100)}% vs Claude`}
            />
          </div>

          {!compiled && (
            <div className="rounded-2xl border border-zinc-200 px-5 py-8">
              <p className="text-center text-sm text-zinc-500">Compiling {job.title}…</p>
              <ol className="mx-auto mt-6 max-w-md space-y-2">
                {PASSES.map((p, i) => (
                  <li
                    key={p.id}
                    className={cn(
                      "flex items-center gap-3 text-sm",
                      i < passTick ? "text-zinc-950" : "text-zinc-300",
                    )}
                  >
                    <span className="font-mono text-[11px]">{String(i + 1).padStart(2, "0")}</span>
                    {p.title}
                    {i < passTick ? <span className="ml-auto text-[11px] text-emerald-700">ok</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {compiled && (
            <>
              {trace?.skippedFrontier && (
                <section className="rounded-2xl border border-emerald-700 bg-emerald-50 px-5 py-4">
                  <p className="text-sm font-medium text-emerald-900">Need-gate · frontier not called</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">
                    Turn {turnIndex + 1} is answerable from the ledger. Kiln billed a lookup, not
                    Claude and not six open models on the recording.
                  </p>
                </section>
              )}

              <section id="waterfall" className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5">
                <h3 className="text-sm font-medium">Bill waterfall</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Flocta’s 50% cut is the routing step. Kiln is the next cut: the window.
                </p>
                <ul className="mt-4 space-y-3">
                  {waterfall.map((w) => (
                    <li key={w.label}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                        <span className="text-zinc-700">{w.label}</span>
                        <span className="font-mono text-zinc-950">{formatEur(w.eur)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            w.tone === "waste" && "bg-orange-400",
                            w.tone === "mid" && "bg-zinc-400",
                            w.tone === "win" && "bg-emerald-600",
                          )}
                          style={{ width: `${Math.max(4, (w.eur / waterfallMax) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">{w.hint}</p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Token mix</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Warm colours are waste. Green is what Flocta_Kiln sends.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.traces.map((t, i) => (
                      <Button
                        key={t.turnId}
                        size="xs"
                        variant={i === turnIndex ? "default" : "outline"}
                        onClick={() => setTurnIndex(i)}
                        className={i === turnIndex ? "bg-zinc-950 text-white" : "border-zinc-200"}
                      >
                        Turn {i + 1}
                        {t.skippedFrontier ? " · gated" : ""}
                      </Button>
                    ))}
                  </div>
                </div>

                {trace && (
                  <div className="mt-6 grid gap-8 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-orange-700">Without Flocta_Kiln</span>
                        <span className="font-mono text-zinc-500">
                          {formatTokens(trace.naiveIn + trace.naiveOut)} tok
                        </span>
                      </div>
                      <FlameBar slices={trace.naive} />
                      <div className="mt-2">
                        <FlameLegend slices={trace.naive} />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-emerald-700">With Flocta_Kiln</span>
                        <span className="font-mono text-zinc-500">
                          {formatTokens(trace.compiledIn + trace.compiledOut)} tok
                        </span>
                      </div>
                      <FlameBar slices={trace.compiled} />
                      <div className="mt-2">
                        <FlameLegend slices={trace.compiled} />
                      </div>
                    </div>
                  </div>
                )}

                {trace && (
                  <ul className="mt-6 space-y-1 text-xs text-zinc-600">
                    {trace.notes.map((n) => (
                      <li key={n} className="flex gap-2">
                        <ArrowDownRight className="mt-0.5 size-3.5 text-zinc-400" />
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Crew pack · six Scaleway seats</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Uncompiled fans the same dump six times. Compiled shares one pack, then a
                      slice per seat at list €/1M.
                    </p>
                  </div>
                  <p className="font-mono text-sm">
                    {formatEur(result.crew.compiledEur)}{" "}
                    <span className="text-zinc-400">vs {formatEur(result.crew.naiveEur)}</span>
                    <span className="ml-2 text-xs text-emerald-700">{Math.round(vsCrew * 100)}% less</span>
                  </p>
                </div>
                {result.crew.sharedHash && (
                  <p className="mt-3 font-mono text-[11px] text-zinc-400">{result.crew.sharedHash}</p>
                )}
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {result.crew.seats.map((s) => (
                    <button
                      key={s.role}
                      type="button"
                      onClick={() => setSeatRole(s.role)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition",
                        seatRole === s.role ? "border-zinc-950 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300",
                      )}
                    >
                      <p className="text-[11px] text-zinc-500">
                        {s.role} · €{s.inEurPerM.toFixed(2)} / €{s.outEurPerM.toFixed(2)} per 1M
                      </p>
                      <p className="mt-0.5 text-sm font-medium">{s.modelName}</p>
                      <p className="mt-2 font-mono text-xs">
                        {formatEur(s.compiledEur)}{" "}
                        <span className="text-zinc-400">vs {formatEur(s.naiveEur)}</span>
                      </p>
                    </button>
                  ))}
                </div>
                {seat && (
                  <p className="mt-3 text-xs leading-5 text-zinc-600">
                    <span className="font-medium text-zinc-900">{seat.role}.</span> {seat.job} Vendor{" "}
                    {seat.vendor}. Slice {formatTokens(seat.compiledTokens)} tok instead of{" "}
                    {formatTokens(seat.naiveTokens)}.
                  </p>
                )}
              </section>

              <section id="spans" className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Pointers · fetch vs disk</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Company knowledge stays hashed. Drag quality to 98% and noise spans come off
                      disk — that is the SLA you are buying.
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500">
                    fetch {formatTokens(fetchedTok)} · disk {formatTokens(diskTok)}
                  </p>
                </div>
                <ul className="mt-4 space-y-2">
                  {pointers.map((p) => (
                    <li
                      key={p.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2",
                        p.fetched ? "border-zinc-950 bg-zinc-50" : "border-zinc-200",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-zinc-400">
                          [[{p.id}]] {p.hash}
                        </p>
                        <p className="text-sm text-zinc-900">
                          {p.doc} · {p.heading}
                        </p>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {formatTokens(p.tokens)} · {p.fetched ? "fetch" : "disk"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              {tools.length > 0 && (
                <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <h3 className="text-sm font-medium">Tool view · not the JSON dump</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Flow pastes the payload. Kiln projects an allow-list.
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {tools.map((t) => (
                      <div key={t.name} className="min-w-0">
                        <p className="text-xs font-medium">{t.name}</p>
                        <p className="mt-1 font-mono text-[11px] text-zinc-500">
                          {formatTokens(t.viewTokens)} tok view · {formatTokens(t.rawTokens)} tok raw
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <pre className="max-h-48 overflow-auto rounded-xl bg-orange-50 p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-zinc-700">
                            {t.raw.slice(0, 1400)}
                          </pre>
                          <pre className="max-h-48 overflow-auto rounded-xl bg-emerald-50 p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-zinc-700">
                            {t.view}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section id="how" className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5">
                <h3 className="text-sm font-medium">How the efficiency layer works</h3>
                <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                  {PASSES.map((pass, i) => (
                    <li key={pass.id} className="rounded-xl border border-zinc-200 p-3">
                      <p className="text-[11px] font-medium text-zinc-500">
                        {String(i + 1).padStart(2, "0")} · {pass.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-600">{pass.body}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <section id="ledger" className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5">
                <h3 className="text-sm font-medium">Company knowledge · ledger</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Durable facts. Later turns look these up instead of resending sources.
                </p>
                {result.facts.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">No facts extracted yet.</p>
                ) : (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {result.facts.slice(0, 10).map((f) => (
                      <li key={f.id} className="rounded-lg border border-zinc-200 px-3 py-2">
                        <p className="text-[11px] font-medium text-zinc-500">{f.key}</p>
                        <p className="text-sm text-zinc-900">{f.value}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section id="inspector" className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5">
                <h3 className="text-sm font-medium">Pack inspector</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Compiled pack is what one model receives. Seat slice is that pack cut for the
                  selected crew seat. Uncompiled is the full dump.
                </p>
                <Tabs defaultValue="compiled" className="mt-4">
                  <TabsList>
                    <TabsTrigger value="compiled">Compiled pack</TabsTrigger>
                    <TabsTrigger value="seat">Seat slice</TabsTrigger>
                    <TabsTrigger value="naive">Uncompiled</TabsTrigger>
                    {tools.length > 0 && <TabsTrigger value="tool">Tool view</TabsTrigger>}
                  </TabsList>
                  <TabsContent value="compiled">
                    <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-zinc-50 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-zinc-800">
                      {trace?.compiledPrompt}
                    </pre>
                  </TabsContent>
                  <TabsContent value="seat">
                    <p className="mt-3 text-xs text-zinc-500">
                      {seat?.role} · {seat?.modelName}
                    </p>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-zinc-50 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-zinc-800">
                      {seat?.pack}
                    </pre>
                  </TabsContent>
                  <TabsContent value="naive">
                    <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-zinc-50 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-zinc-800">
                      {trace?.naivePrompt.slice(0, 8000)}
                      {(trace?.naivePrompt.length ?? 0) > 8000
                        ? "\n\n… truncated in the inspector, billed in full."
                        : ""}
                    </pre>
                  </TabsContent>
                  {tools[0] && (
                    <TabsContent value="tool">
                      <p className="mt-3 text-xs text-zinc-500">
                        {tools[0].name} · {formatTokens(tools[0].viewTokens)} vs {formatTokens(tools[0].rawTokens)} raw
                      </p>
                      <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-zinc-50 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-zinc-800">
                        {tools[0].view}
                      </pre>
                    </TabsContent>
                  )}
                </Tabs>
              </section>
            </>
          )}
        </main>
      </div>

      <footer className="border-t border-zinc-200 py-8 text-center text-xs text-zinc-500">
        Flocta_Kiln · context compiler
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white")}>
      <p className={cn("text-[11px] tracking-wide uppercase", accent ? "text-zinc-400" : "text-zinc-500")}>{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
      <p className={cn("mt-1 text-xs", accent ? "text-zinc-400" : "text-zinc-500")}>{hint}</p>
    </div>
  );
}
