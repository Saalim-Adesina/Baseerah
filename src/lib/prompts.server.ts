import type { Deal, Thesis } from "./types";
import { METRIC_KEYS } from "./types";

export function dealDossier(deal: Deal) {
  const founders = deal.founders
    .map(
      (f, i) =>
        `  ${i + 1}. ${f.name || "Unnamed"} — ${f.role || "role unknown"}\n     LinkedIn: ${
          f.linkedin || "not provided"
        }\n     Background: ${f.background || "not provided"}`,
    )
    .join("\n");

  return `COMPANY: ${deal.company}
WEBSITE: ${deal.website || "n/a"}
ONE LINER: ${deal.oneLiner || "n/a"}
SECTOR: ${deal.sector || "n/a"}
GEOGRAPHY: ${deal.geography || "n/a"}
ROUND: ${deal.round}
RAISING: ${deal.raising || "n/a"} at valuation: ${deal.valuation || "n/a"}

FOUNDERS (highest weight in this evaluation):
${founders || "  None provided."}

TRACTION / METRICS AS STATED:
${deal.traction || "None provided."}

UNIT ECONOMICS AS STATED:
${deal.unitEconomics || "None provided."}

COMPETITION AS STATED:
${deal.competition || "None provided."}

MEETING NOTES (investor's own observations):
${deal.meetingNotes || "None provided."}

INVESTOR'S PERSONAL BIASES / GUT NOTES ON THIS DEAL:
${deal.personalBias || "None provided."}

DECK / DOCUMENT CONTENT (${deal.deckFileName || "no file"}):
${deal.deckText ? deal.deckText.slice(0, 60000) : "No document uploaded."}`;
}

export function thesisBlock(thesis: Thesis) {
  const weights = METRIC_KEYS.map(
    (m) => `  - ${m.label} (${m.key}): weight ${thesis.weights[m.key] ?? 0.5}`,
  ).join("\n");

  return `FUND: ${thesis.fundName}
INVESTMENT THESIS (natural language, authoritative):
${thesis.statement}

PREFERRED INDUSTRIES: ${thesis.preferredIndustries}
EXCLUSIONS / ANTI-PORTFOLIO: ${thesis.antiPortfolio}
STAGE FOCUS: ${thesis.stageFocus}
CHECK SIZE: ${thesis.checkSize}

CUSTOM THINKING INSTRUCTIONS FROM THE PARTNER (follow these literally):
${thesis.modelInstructions}

SCORING WEIGHTS (relative importance):
${weights}`;
}

export const HOUSE_RULES = `You are the screening analyst for an institutional investor (VC / incubator / private equity).

Non-negotiable principles:
1. INVEST IN HUMAN BEINGS FIRST. Team, founder–market fit, integrity, resilience and earned insight dominate the judgement. A weak team with great metrics scores lower than a great team with early metrics.
2. Weight LinkedIn/background evidence and the investor's own meeting notes above deck marketing claims. Deck claims are hypotheses; notes and verifiable history are evidence.
3. CALIBRATE TO THE ROUND. Judge every metric against what is normal for the stated round stage. Pre-seed is judged on team, insight and early signal; Series A on repeatable go-to-market and cohort quality; growth/PE on unit economics, retention and cash efficiency. Never punish a pre-seed for missing Series B metrics, and never let a Series B pass on pre-seed evidence.
4. Separate claims from proof. Say explicitly what is unverified.
5. Surface the investor's stated personal biases and challenge them — say where the bias may be distorting the read, in both directions.
6. Never invent numbers, customers, competitors or people. If it is missing, list it under missing information.`;

export function analysisPrompt(deal: Deal, thesis: Thesis) {
  return `${HOUSE_RULES}

=== FUND CONTEXT ===
${thesisBlock(thesis)}

=== DEAL DOSSIER ===
${dealDossier(deal)}

=== TASK ===
Produce a full screening analysis.
- Score each of these metrics 0-10 with the exact keys: ${METRIC_KEYS.map((m) => m.key).join(", ")}.
- Use the fund's weights when forming the overall 0-100 score; state the round-stage calibration in roundFitNote.
- Recommendation must be one of: Invest, Progress, Track, Pass.
- Keep every field concise and specific: no filler, no generic startup advice.
- founderQuestions must be the sharp questions to ask the founders next, tied to the actual gaps.
- missingInformation must be concrete artefacts or data points you would request.`;
}
