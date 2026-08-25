import type { Document, Fact, Scenario, ToolDump, Turn } from "./types";

function csvBlock(rows: string[][]): string {
  return rows.map((r) => r.join(",")).join("\n");
}

const SUPPORT_THREADS = `THREAD-4412  2026-04-03  enterprise
Customer: Northwind Logistics (ARR €420k)
Agent: Priya
Body: Onboarding still not complete 19 days after signature. Implementation owner changed twice. Finance cannot invoice until kickoff is marked done in Salesforce. This is the third enterprise this quarter with the same stall.

THREAD-4488  2026-04-11  enterprise
Customer: Helion Retail
Agent: Marco
Body: They asked for a dedicated Slack. We said yes, then nobody joined. Champion went dark. CSAT comment: "we signed to move faster than our last vendor and we are waiting on you."

THREAD-4501  2026-04-18  mid-market
Customer: Kite Payroll
Agent: Priya
Body: Two seats unused. Not a churn risk. They just have not rolled out to finance yet.

THREAD-4610  2026-05-02  enterprise
Customer: Northwind Logistics
Agent: Lena
Body: Escalation. Legal is holding the DPA addendum. Sales promised EU-only inference. Engineering can do it but the checkbox in the order form was never wired to provisioning.

THREAD-4702  2026-05-19  enterprise
Customer: Helion Retail
Agent: Marco
Body: Cancellation notice. Effective 30 June. Reason code: time-to-value. Champion quoted 41 days from signature to first successful workflow.

THREAD-4811  2026-06-04  enterprise
Customer: Atlas Freight
Agent: Priya
Body: Same pattern as Northwind. Kickoff scheduled, cancelled, rescheduled. Salesforce stage is "Onboarding" for 22 days. Nobody owns the implementation checklist.

THREAD-4900  2026-06-21  enterprise
Customer: Atlas Freight
Agent: Lena
Body: They asked for a pause, not a cancel. Pause is how Helion started. Flag as watch.

THREAD-5012  2026-07-08  enterprise
Customer: Northwind Logistics
Agent: Priya
Body: Saved. Assigned a single implementation owner. Time-to-first-workflow dropped from 41 days (Helion) to 11 days once ownership was explicit.

` + Array.from({ length: 28 }, (_, i) =>
    `THREAD-51${20 + i}  2026-07-${String(10 + (i % 18)).padStart(2, "0")}  mixed
Customer: Account-${100 + i}
Agent: queue
Body: Generic follow-up about seat usage, invoice copy, and whether they saw the Q2 webinar. No signal. Please stop stuffing this into every prompt.
`,
  ).join("\n");

const CRM_EXPORT = csvBlock([
  ["account", "segment", "arr_eur", "signed", "first_workflow_days", "status", "owner", "cancel_reason"],
  ["Northwind Logistics", "enterprise", "420000", "2026-03-15", "41", "active", "unassigned→Priya", ""],
  ["Helion Retail", "enterprise", "310000", "2026-04-02", "41", "churned", "Marco", "time-to-value"],
  ["Atlas Freight", "enterprise", "280000", "2026-05-12", "22", "paused", "unassigned", ""],
  ["Kite Payroll", "mid-market", "48000", "2026-03-01", "6", "active", "Priya", ""],
  ["Orchid Health", "enterprise", "510000", "2026-02-20", "9", "active", "Lena", ""],
  ...Array.from({ length: 40 }, (_, i) => [
    `Filler Co ${i}`,
    i % 5 === 0 ? "enterprise" : "mid-market",
    String(20000 + i * 1370),
    "2026-01-12",
    String(4 + (i % 11)),
    "active",
    "pool",
    "",
  ]),
]);

const HANDBOOK = `People-Ops & Customer Implementation Handbook — internal, v3.4

Section 1. Purpose
This handbook is 9,400 words. Dumping all of it into a model is how teams light money on fire. Only section 4 and the onboarding SLA matter for the churn question.

Section 2. Office, holidays, equipment
... ${"Berlin office hours, bike budget, monitors, parental leave, travel policy. ".repeat(40)}

Section 3. Compensation bands
... ${"Bands are confidential. Do not paste this into a customer-facing prompt. ".repeat(24)}

Section 4. Enterprise onboarding SLA  ← this is the span that answers the question
Time-to-first-workflow target: 10 business days from contract signature.
Single-threaded implementation owner is mandatory above €150k ARR.
Kickoff cannot be marked complete until: (a) DPA region matches the order form, (b) Slack or Teams channel has an engineer in it, (c) first workflow has run on production data.
If day 8 has no owner, page the Head of CS. Helion Retail (2026) is the canonical failure: 41 days, then churn.
Pause is not a save. Treat pause as pre-churn.

Section 5. Quarterly review rubric
... ${"Five competencies, SMART goals, calibration week. Irrelevant to churn. ".repeat(30)}
`;

const SPREADSHEET = csvBlock([
  ["month", "logo_churn_pct", "logo_churn_n", "nrr_pct", "enterprise_ttv_days", "notes"],
  ["2025-11", "2.1", "1", "108", "11", "stable"],
  ["2025-12", "1.8", "1", "109", "10", "stable"],
  ["2026-01", "2.0", "1", "107", "12", "stable"],
  ["2026-02", "2.4", "1", "106", "13", "one mid-market"],
  ["2026-03", "3.1", "2", "104", "18", "Northwind stall begins"],
  ["2026-04", "4.2", "3", "101", "24", "Helion + Northwind"],
  ["2026-05", "5.9", "4", "97", "31", "Helion cancel notice"],
  ["2026-06", "6.8", "4", "94", "29", "Atlas pause"],
  ["2026-07", "4.9", "2", "99", "14", "owner model lands"],
]);

function doc(id: string, title: string, chunks: { id: string; heading: string; text: string; needed: boolean }[]): Document {
  return {
    id,
    title,
    spans: chunks.map((c) => ({ ...c, docId: id })),
  };
}

const churnDocs: Document[] = [
  doc("support", "Zendesk export — Q2 enterprise threads", [
    { id: "support-signal", heading: "Signal threads", text: SUPPORT_THREADS.slice(0, 2800), needed: true },
    { id: "support-noise", heading: "Noise / webinar follow-ups", text: SUPPORT_THREADS.slice(2800), needed: false },
  ]),
  doc("crm", "Salesforce accounts.csv", [
    { id: "crm-core", heading: "Named enterprise accounts", text: CRM_EXPORT.split("\n").slice(0, 7).join("\n"), needed: true },
    { id: "crm-filler", heading: "Filler rows", text: CRM_EXPORT.split("\n").slice(7).join("\n"), needed: false },
  ]),
  doc("handbook", "People-Ops handbook v3.4", [
    { id: "hb-sla", heading: "Section 4 — Enterprise onboarding SLA", text: HANDBOOK.split("Section 5")[0].split("Section 4")[1] ?? HANDBOOK, needed: true },
    { id: "hb-rest", heading: "Sections 1–3 and 5", text: HANDBOOK, needed: false },
  ]),
  doc("nrr", "Finance NRR workbook", [
    { id: "nrr-q2", heading: "Monthly churn & TTV", text: SPREADSHEET, needed: true },
  ]),
];

const churnFacts: Fact[] = [
  { id: "churn:q2", key: "Logo churn Q2", value: "2.4% → 6.8% (peak June)", source: "finance", required: true },
  { id: "churn:helion", key: "Helion Retail", value: "Cancelled 30 June, time-to-value, 41 days to first workflow", source: "crm", required: true },
  { id: "churn:sla", key: "Onboarding SLA", value: "10 business days, single owner above €150k ARR", source: "handbook", required: true },
  { id: "churn:fix", key: "Working fix", value: "Northwind recovered to 11 days once a named owner was assigned", source: "support", required: true },
];

const stripeDump: ToolDump = {
  name: "stripe.events.list",
  keepKeys: ["id", "type", "customer", "amount", "duplicate_of"],
  raw: JSON.stringify(
    {
      object: "list",
      has_more: true,
      data: Array.from({ length: 40 }, (_, i) => ({
        id: `evt_${1000 + i}`,
        object: "event",
        api_version: "2025-08-27",
        created: 1785000000 + i * 90,
        type: i % 7 === 0 ? "invoice.paid" : "charge.succeeded",
        pending_webhooks: 0,
        request: { id: `req_${i}`, idempotency_key: i % 7 === 0 ? "inv_month_close" : `key_${i}` },
        data: {
          object: {
            id: `ch_${i}`,
            customer: "cus_northwind",
            amount: 420000,
            currency: "eur",
            invoice: "in_42",
            duplicate_of: i % 7 === 0 ? "ch_duplicate_root" : null,
            billing_reason: i % 7 === 0 ? "subscription_cycle" : "manual",
            metadata: { env: "prod", region: "eu-central-1", unused: "x".repeat(80) },
          },
        },
      })),
    },
    null,
    2,
  ),
};

const gitGrep: ToolDump = {
  name: "grep",
  keepKeys: ["file", "line", "match"],
  raw: Array.from({ length: 60 }, (_, i) =>
    `src/webhooks/stripe.ts:${40 + i}:  // ${i % 9 === 0 ? "TODO: idempotency key not checked on invoice.paid" : "logger.debug(payload)"}`,
  ).join("\n"),
};

const fileRead: ToolDump = {
  name: "read_file",
  keepKeys: ["path", "hunk"],
  raw: `// src/webhooks/stripe.ts — 420 lines dumped into the prompt every turn
${Array.from({ length: 120 }, (_, i) =>
    i === 88
      ? `export async function handleInvoicePaid(evt) {
  // BUG: we charge then write the ledger. If the worker retries, invoice.paid fires again.
  await stripe.charges.create({ amount: evt.data.object.amount, customer: evt.data.object.customer });
  await db.ledger.insert({ invoice: evt.data.object.invoice });
}`
      : `function ignore_${i}() { return ${i}; } // dead helper from a migration`,
  ).join("\n")}
`,
};

function turn(
  partial: Omit<Turn, "tools"> & { tools?: ToolDump[] },
): Turn {
  return { tools: [], ...partial };
}

export const SCENARIOS: Scenario[] = [
  {
    id: "churn",
    title: "Why did enterprise churn jump last quarter?",
    department: "CS × Finance",
    thesis:
      "Four sources are attached. Uncompiled runs paste all of them every turn. Kiln keeps a fact ledger and fetches only the SLA span.",
    naiveModel: "Claude Opus 4.5",
    systemPrompt: `You are the company’s frontier analyst. You will be given Zendesk, Salesforce, the people-ops handbook, and the NRR workbook on every turn. Quote sources. Do not invent numbers.
${"Always restate the full tool policy, safety preamble, and citation format. ".repeat(26)}`,
    documents: churnDocs,
    seededFacts: churnFacts,
    turns: [
      turn({
        id: "c1",
        user: "Why did churn go up last quarter — and what do we do about it?",
        thinking: "Need to read all four sources. Looking at NRR first, then named accounts.",
        assistant:
          "Logo churn: 2.4% → 6.8% peak in June. Helion Retail cancelled for time-to-value (41 days to first workflow). Handbook SLA is 10 business days with a single owner above €150k ARR. Northwind recovered to 11 days once Priya was named owner. Pause on Atlas should be treated as pre-churn.",
        requiredFactIds: ["churn:q2", "churn:helion", "churn:sla"],
        neededSpanIds: ["nrr-q2", "hb-sla", "crm-core", "support-signal"],
      }),
      turn({
        id: "c2",
        user: "Draft the 1-page fix for the Head of CS. Keep the numbers.",
        assistant:
          "Memo: mandate named implementation owners above €150k ARR, page CS at day 8, treat pause as pre-churn. Evidence: Helion 41 days → cancel; Northwind 11 days after owner; SLA 10 days.",
        requiredFactIds: ["churn:sla", "churn:fix", "churn:helion"],
        neededSpanIds: ["hb-sla"],
        answerableFromLedger: true,
      }),
      turn({
        id: "c3",
        user: "What was Helion’s ARR and cancel date again?",
        assistant: "Helion Retail: €310k ARR, cancellation effective 30 June, reason code time-to-value.",
        requiredFactIds: ["churn:helion"],
        neededSpanIds: ["crm-core"],
        answerableFromLedger: true,
      }),
    ],
  },
  {
    id: "billing",
    title: "Stripe is double-charging on invoice.paid retries",
    department: "Engineering",
    thesis:
      "A coding agent that re-sends grep hits, a 420-line file, and a Stripe list payload. Kiln projects tools to a schema and keeps only the buggy hunk.",
    naiveModel: "Claude Opus 4.5",
    systemPrompt: `You are a senior engineer in Cursor. Prefer minimal diffs. Match existing style.
${"Repository map, editor rules, MCP tool catalog, and safety notes follow. ".repeat(22)}`,
    documents: [
      doc("runbook", "billing-runbook.md", [
        {
          id: "rb-idem",
          heading: "Idempotency",
          text: "invoice.paid must be keyed by invoice id. Charges are not safe to create inside the webhook without a ledger claim.",
          needed: true,
        },
        {
          id: "rb-noise",
          heading: "Office Wi-Fi and staging URLs",
          text: `${"staging.internal.example / wifi password rotation / pager. ".repeat(50)}`,
          needed: false,
        },
      ]),
    ],
    seededFacts: [
      { id: "bill:bug", key: "Root cause", value: "handleInvoicePaid charges before ledger claim; retries duplicate", source: "code", required: true },
      { id: "bill:fix", key: "Fix", value: "Claim invoice id uniquely, then charge; ignore duplicate_of events", source: "code", required: true },
    ],
    turns: [
      turn({
        id: "b1",
        user: "Customers report double charges at month close. Start in the Stripe webhook.",
        tools: [gitGrep, stripeDump],
        thinking: "Grep shows a TODO on idempotency. Event list has duplicate_of on invoice.paid.",
        assistant:
          "Root cause: handleInvoicePaid charges before writing the ledger. invoice.paid retries create a second charge. Events with duplicate_of should be ignored.",
        requiredFactIds: ["bill:bug"],
        neededSpanIds: ["rb-idem"],
      }),
      turn({
        id: "b2",
        user: "Show me the exact hunk and a patch.",
        tools: [fileRead],
        assistant:
          "Patch: claim invoice id in the ledger first (unique constraint). If claim fails, return 200. Then create the charge. Skip events where duplicate_of is set.",
        requiredFactIds: ["bill:bug", "bill:fix"],
        neededSpanIds: ["rb-idem"],
      }),
      turn({
        id: "b3",
        user: "Write the unique constraint SQL only.",
        assistant: "ALTER TABLE ledger ADD CONSTRAINT ledger_invoice_unique UNIQUE (invoice);",
        requiredFactIds: ["bill:fix"],
        neededSpanIds: [],
        answerableFromLedger: true,
      }),
    ],
  },
  {
    id: "crew",
    title: "Six agents, one 40-minute ops recording",
    department: "Operations",
    thesis:
      "Flow can Add agent. It still pastes the recording six times. Kiln compiles one shared pack, then each Scaleway model gets a seat slice at list €/1M.",
    naiveModel: "6 × frontier context windows",
    systemPrompt: "You are one specialist in a crew. You will receive the full transcript and the other agents’ notes on every hop.",
    documents: [
      doc("rec", "ops-therapy-2026-06-12.vtt", [
        {
          id: "rec-signal",
          heading: "Bottlenecks named in the room",
          text: `00:04 Founder: Fulfilment is three days behind.
00:07 Head of Sales: We re-type every order into the warehouse sheet.
00:12 Ops: Nobody owns onboarding. Enterprise stalls in Salesforce.
00:18 Finance: We cannot invoice until kickoff is checked, so cash lags the signature.
00:24 CS: Helion churned on time-to-value. Atlas is pausing.
00:31 Founder: Build the two things that move cash and churn this month, nothing else.`,
          needed: true,
        },
        {
          id: "rec-noise",
          heading: "Full transcript padding",
          text: Array.from({ length: 80 }, (_, i) =>
            `${String(i).padStart(2, "0")}:00 Speaker: ${"um, yeah, circling back, I think we said this already — ".repeat(6)}`,
          ).join("\n"),
          needed: false,
        },
      ]),
    ],
    seededFacts: [
      { id: "crew:fulfil", key: "Fulfilment", value: "3 days behind; orders re-typed into a sheet", source: "recording", required: true },
      { id: "crew:onboard", key: "Onboarding", value: "No owner; invoice blocked on kickoff checkbox", source: "recording", required: true },
      { id: "crew:build", key: "Build this month", value: "Inbound lead triage + fulfilment SLA watchdog", source: "recording", required: true },
    ],
    turns: [
      turn({
        id: "r1",
        user: "Run the six-agent crew on this recording. List bottlenecks, then pick two things to build.",
        assistant:
          "Bottlenecks: fulfilment lag, re-typed orders, ownerless onboarding, invoice gated on kickoff. Build: inbound lead triage workflow; fulfilment SLA watchdog.",
        requiredFactIds: ["crew:fulfil", "crew:onboard", "crew:build"],
        neededSpanIds: ["rec-signal"],
      }),
      turn({
        id: "r2",
        user: "Each specialist: restated the recording and add your domain notes.",
        assistant:
          "Sales: stop re-typing — pipe the order object. Fulfilment: SLA watchdog at +24h. CS: named onboarding owner. Finance: invoice on signature, not kickoff. Cross-check agrees on the two builds.",
        requiredFactIds: ["crew:build", "crew:fulfil"],
        neededSpanIds: ["rec-signal"],
      }),
      turn({
        id: "r3",
        user: "Remind me the two builds we picked. Do not re-analyse.",
        assistant: "1) Inbound lead triage workflow. 2) Fulfilment SLA watchdog.",
        requiredFactIds: ["crew:build"],
        neededSpanIds: [],
        answerableFromLedger: true,
      }),
    ],
  },
];

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
