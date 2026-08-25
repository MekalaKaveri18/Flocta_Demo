export type TokenKind =
  | "system"
  | "history"
  | "rag"
  | "tools"
  | "user"
  | "output"
  | "thinking"
  | "ledger"
  | "pointers"
  | "tool_view"
  | "delta"
  | "sketch"
  | "fill"
  | "gate";

export type Fact = {
  id: string;
  key: string;
  value: string;
  source: string;
  required: boolean;
};

export type DocSpan = {
  id: string;
  docId: string;
  heading: string;
  text: string;
  needed: boolean;
};

export type Document = {
  id: string;
  title: string;
  spans: DocSpan[];
};

export type ToolDump = {
  name: string;
  raw: string;
  keepKeys: string[];
};

export type Turn = {
  id: string;
  user: string;
  assistant: string;
  thinking?: string;
  tools: ToolDump[];
  /** If true, the compiled path can skip a frontier call once the ledger is warm. */
  answerableFromLedger?: boolean;
  requiredFactIds: string[];
  neededSpanIds: string[];
};

export type Scenario = {
  id: string;
  title: string;
  department: string;
  thesis: string;
  naiveModel: string;
  systemPrompt: string;
  documents: Document[];
  seededFacts: Fact[];
  turns: Turn[];
};

export type Slice = {
  kind: TokenKind;
  label: string;
  tokens: number;
  text: string;
};

export type CallTrace = {
  turnId: string;
  naive: Slice[];
  compiled: Slice[];
  naiveIn: number;
  naiveOut: number;
  compiledIn: number;
  compiledOut: number;
  skippedFrontier: boolean;
  compiledPrompt: string;
  naivePrompt: string;
  ledgerAfter: Fact[];
  quality: number;
  notes: string[];
};

export type PassId =
  | "need-gate"
  | "ledger"
  | "pointers"
  | "tool-views"
  | "delta"
  | "sketch-fill"
  | "verify"
  | "crew-pack";

export type CrewSeatBill = {
  role: string;
  modelName: string;
  vendor: string;
  inEurPerM: number;
  outEurPerM: number;
  job: string;
  pack: string;
  naiveTokens: number;
  compiledTokens: number;
  naiveEur: number;
  compiledEur: number;
  attestation: string;
  allowedFactIds: string[];
  gatedTurns: number;
};

export type CrewResult = {
  seats: CrewSeatBill[];
  naiveTokens: number;
  compiledTokens: number;
  naiveEur: number;
  compiledEur: number;
  sharedPackTokens: number;
  sharedHash: string;
  /** Opaque Flocta-style Memory: same stuffed blob billed on every seat. */
  memoryTokens: number;
  memoryEur: number;
};

export type CompileResult = {
  scenario: Scenario;
  qualityFloor: number;
  traces: CallTrace[];
  facts: Fact[];
  coverage: number;
  spanRecall: number;
  quality: number;
  naiveTokens: number;
  compiledTokens: number;
  naiveEur: number;
  compiledEur: number;
  floctaOnlyEur: number;
  kilnOnFloctaEur: number;
  crew: CrewResult;
};
