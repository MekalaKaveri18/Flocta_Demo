/** Flocta /legal/models — Scaleway Generative APIs, € per 1M tokens. */
export type FloctaModel = {
  id: string;
  name: string;
  vendor: string;
  inEur: number;
  outEur: number;
};

export const FLOCTA_MODELS: FloctaModel[] = [
  { id: "glm-5.2", name: "GLM 5.2", vendor: "Z.ai", inEur: 1.8, outEur: 5.5 },
  { id: "qwen3.5-397b-a17b", name: "Qwen3.5 397B-A17B", vendor: "Alibaba", inEur: 0.6, outEur: 3.6 },
  { id: "qwen3.6-35b-a3b", name: "Qwen3.6 35B-A3B", vendor: "Alibaba", inEur: 0.25, outEur: 1.5 },
  { id: "qwen3-235b-a22b-instruct-2507", name: "Qwen3 235B Instruct", vendor: "Alibaba", inEur: 0.75, outEur: 2.25 },
  { id: "mistral-medium-3.5-128b", name: "Mistral Medium 3.5", vendor: "Mistral", inEur: 1.5, outEur: 7.5 },
  { id: "gpt-oss-120b", name: "gpt-oss 120b", vendor: "OpenAI", inEur: 0.15, outEur: 0.6 },
  { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", vendor: "Meta", inEur: 0.9, outEur: 0.9 },
  { id: "gemma-4-26b-a4b-it", name: "Gemma 4 26B-A4B", vendor: "Google", inEur: 0.25, outEur: 0.5 },
];

export const MODEL_BY_NAME: Record<string, FloctaModel> = Object.fromEntries(
  FLOCTA_MODELS.map((m) => [m.name, m]),
);

export function modelByName(name: string): FloctaModel {
  return MODEL_BY_NAME[name] ?? FLOCTA_MODELS[3];
}

export type CrewSeat = {
  model: FloctaModel;
  role: string;
  job: string;
  factIds: string[];
};

/** Homepage-shaped crew: six different open models, six jobs, one shared pack. */
export const CREW_SEATS: CrewSeat[] = [
  {
    model: FLOCTA_MODELS.find((m) => m.id === "llama-3.3-70b-instruct")!,
    role: "Fulfilment",
    job: "Watch SLA lag and the warehouse sheet.",
    factIds: ["crew:fulfil", "churn:sla", "bill:bug"],
  },
  {
    model: FLOCTA_MODELS.find((m) => m.id === "gpt-oss-120b")!,
    role: "Triage",
    job: "Classify the user turn; skip the frontier if the ledger already answers.",
    factIds: ["crew:build", "churn:fix", "bill:fix"],
  },
  {
    model: FLOCTA_MODELS.find((m) => m.id === "qwen3-235b-a22b-instruct-2507")!,
    role: "Sales ops",
    job: "Stop re-typing orders; keep ARR and cancel reasons.",
    factIds: ["crew:fulfil", "churn:helion", "churn:q2"],
  },
  {
    model: FLOCTA_MODELS.find((m) => m.id === "mistral-medium-3.5-128b")!,
    role: "CS",
    job: "Named onboarding owner; treat pause as pre-churn.",
    factIds: ["crew:onboard", "churn:helion", "churn:sla"],
  },
  {
    model: FLOCTA_MODELS.find((m) => m.id === "glm-5.2")!,
    role: "Plan",
    job: "Pick the two builds; do not re-read the corpus.",
    factIds: ["crew:build", "churn:fix", "bill:fix"],
  },
  {
    model: FLOCTA_MODELS.find((m) => m.id === "gemma-4-26b-a4b-it")!,
    role: "Finance",
    job: "Invoice on signature, not kickoff. Keep the numbers.",
    factIds: ["crew:onboard", "churn:q2", "bill:bug"],
  },
];
