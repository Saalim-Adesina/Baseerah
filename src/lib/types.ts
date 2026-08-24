export type Round = "Pre-seed" | "Seed" | "Series A" | "Series B" | "Series C+" | "Growth / PE";

export const ROUNDS: Round[] = [
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C+",
  "Growth / PE",
];

export type Founder = {
  id: string;
  name: string;
  role: string;
  linkedin: string;
  background: string;
};

export type Deal = {
  id: string;
  createdAt: number;
  company: string;
  website: string;
  oneLiner: string;
  sector: string;
  geography: string;
  round: Round;
  raising: string;
  valuation: string;
  traction: string;
  unitEconomics: string;
  competition: string;
  founders: Founder[];
  meetingNotes: string;
  personalBias: string;
  deckText: string;
  deckFileName: string;
  status: "new" | "analyzed" | "shortlist" | "passed";
  analysis?: Analysis;
  memo?: string;
  passEmail?: PassEmail;
};

export type MetricScore = {
  key: string;
  label: string;
  score: number; // 0-10
  weight: number; // 0-1
  verdict: string;
  evidence: string;
  gap: string;
};

export type CompetitorRead = {
  name: string;
  positioning: string;
  threatLevel: "low" | "medium" | "high";
  differentiation: string;
};

export type Analysis = {
  generatedAt: number;
  overallScore: number; // 0-100
  recommendation: "Invest" | "Progress" | "Track" | "Pass";
  roundFitNote: string;
  headline: string;
  thesisFit: string;
  metrics: MetricScore[];
  humanCapital: {
    score: number;
    founderMarketFit: string;
    linkedinRead: string;
    meetingNotesRead: string;
    biasCheck: string;
    concerns: string[];
  };
  productMarketFit: string;
  unitEconomics: { read: string; benchmarks: string; flags: string[] };
  moat: { read: string; durability: string; sources: string[] };
  competitors: CompetitorRead[];
  missingInformation: string[];
  founderQuestions: string[];
  risks: string[];
  killCriteria: string[];
};

export type PassEmail = { subject: string; body: string; generatedAt: number };

export type Thesis = {
  statement: string;
  preferredIndustries: string;
  antiPortfolio: string;
  stageFocus: string;
  checkSize: string;
  modelInstructions: string;
  temperature: number;
  weights: Record<string, number>;
  fundName: string;
  partnerName: string;
};

export const METRIC_KEYS = [
  { key: "team", label: "Team & Human Capital" },
  { key: "founder_market_fit", label: "Founder–Market Fit" },
  { key: "market", label: "Market Size & Timing" },
  { key: "product", label: "Product & Technology" },
  { key: "pmf", label: "Product–Market Fit Evidence" },
  { key: "traction", label: "Traction vs. Round Stage" },
  { key: "unit_economics", label: "Unit Economics" },
  { key: "moat", label: "Moat & Defensibility" },
  { key: "competition", label: "Competitive Position" },
  { key: "deal_terms", label: "Deal Terms & Valuation" },
  { key: "thesis_fit", label: "Thesis Fit" },
] as const;

export const DEFAULT_THESIS: Thesis = {
  fundName: "Northgate Capital",
  partnerName: "Investment Team",
  statement:
    "We back exceptional operators building infrastructure for the industrial and financial economy. We prioritise the human beings first: founder quality, integrity, resilience and earned insight outweigh a polished deck.",
  preferredIndustries:
    "B2B SaaS, fintech infrastructure, supply chain, industrial automation, developer tools, applied AI with proprietary data.",
  antiPortfolio:
    "Consumer social, crypto trading venues, gambling, thin reseller/agency models, single-customer dependencies.",
  stageFocus: "Pre-seed through Series A, opportunistically Series B.",
  checkSize: "$500k – $4m, leading or co-leading with board observer rights.",
  modelInstructions:
    "Be blunt and evidence-driven. Never inflate a score to be polite. Explicitly separate what the deck claims from what is actually proven. Calibrate every expectation to the round stage. Where information is missing, say so instead of guessing.",
  temperature: 0.35,
  weights: {
    team: 1,
    founder_market_fit: 0.9,
    market: 0.7,
    product: 0.6,
    pmf: 0.85,
    traction: 0.7,
    unit_economics: 0.6,
    moat: 0.7,
    competition: 0.5,
    deal_terms: 0.4,
    thesis_fit: 0.8,
  },
};

/** Anything that survives a JSON round trip — threads are stored as jsonb. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type Thread = {
  id: string;
  dealId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** AI SDK `UIMessage[]`, kept JSON-shaped for storage and transport. */
  messages: JsonValue[];
};

/**
 * A deck-bearing message found by a Gmail scan, with its attachment already
 * extracted to text. Lives here rather than in `src/server/gmail.server.ts`
 * because the scan UI is client code, and `src/server/**` is blocked from the
 * client bundle by the import protection in `vite.config.ts`.
 */
export type GmailDealCandidate = {
  messageId: string;
  subject: string;
  from: string;
  fromName: string;
  receivedAt: number;
  snippet: string;
  filename: string;
  deckText: string;
  extractionError?: string;
};
