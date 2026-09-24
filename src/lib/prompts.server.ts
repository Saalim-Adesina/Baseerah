import type { Deal, Thesis } from "./types";
import { METRIC_KEYS } from "./types";
import { FOUNDER_QUESTIONS, INTAKE_FIELDS } from "./deal-intake-fields";

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
ROUND: ${deal.round || "not stated"}
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
Produce a full screening analysis as a single JSON object with EXACTLY these keys and no others:

{
  "overallScore": number 0-100,
  "recommendation": "Invest" | "Progress" | "Track" | "Pass",
  "headline": "one-sentence verdict",
  "roundFitNote": "how this reads calibrated to the ${deal.round} stage",
  "thesisFit": "how it fits or breaks the fund thesis",
  "metrics": [ { "key": one of ${METRIC_KEYS.map((m) => m.key).join(" | ")}, "label": string, "score": number 0-10, "verdict": string, "evidence": string, "gap": string } ],
  "humanCapital": { "score": number 0-10, "founderMarketFit": string, "linkedinRead": string, "meetingNotesRead": string, "biasCheck": string, "concerns": string[] },
  "productMarketFit": string,
  "unitEconomics": { "read": string, "benchmarks": string, "flags": string[] },
  "moat": { "read": string, "durability": string, "sources": string[] },
  "competitors": [ { "name": string, "positioning": string, "threatLevel": string, "differentiation": string } ],
  "missingInformation": string[],
  "founderQuestions": string[],
  "risks": string[],
  "killCriteria": string[]
}

Rules:
- "metrics" MUST contain one entry for every one of these keys: ${METRIC_KEYS.map((m) => m.key).join(", ")}.
- Use the fund's weights when forming the overall 0-100 score; state the round-stage calibration in roundFitNote.
- Keep every field concise and specific: no filler, no generic startup advice.
- founderQuestions must be the sharp questions to ask the founders next, tied to the actual gaps.
- missingInformation must be concrete artefacts or data points you would request.
- Never omit a key. If evidence is absent, say so explicitly in that field.`;
}

/**
 * Turns the intake form into a questionnaire the model answers against a deck.
 * Each field becomes a numbered question with its own rules, so the model is
 * reading for one specific answer at a time rather than filling a shape.
 *
 * The whole design rests on null being a first-class answer: a blank field is
 * reported to the investor as a diligence gap, while a confident guess is
 * laundered into the screening as though the founders had claimed it.
 */
export function intakeExtractionPrompt(deckText: string) {
  const questions = INTAKE_FIELDS.map(
    (field, index) =>
      `Q${index + 1}. ${field.label.replace(" *", "")} — ${field.question}
    Field: "${field.key}". ${field.guidance}`,
  ).join("\n\n");

  return `You are reading a startup pitch deck that has been converted to markdown. Answer each question below using only what this document states. You are extracting, not analysing: you have no opinion and add no knowledge of your own.

=== DOCUMENT ===
${deckText}

=== HOW TO ANSWER ===
For every question, either quote what the document states, or answer null.

null is the correct answer whenever:
- the document does not address the question at all;
- it gestures at the answer without giving it ("we are raising a round" with no amount);
- answering would need arithmetic, inference, or a fact you know from outside this document;
- you are less than certain which of two readings the deck means.

A null costs the investor nothing — the field is shown as an open diligence item. A guess is a defect: it enters the screening as though the founders had claimed it, and nobody downstream can tell the difference.

null is NOT for a claim the deck makes in its own way rather than in a labelled field. Reading is your job: a sector stated in a positioning line, a competitor plotted on a matrix, a prior employer shown as a logo on the team slide are all stated, and answering them is transcription, not inference. Withholding a claim the deck plainly makes is as much a defect as inventing one.

Also:
- Quote the deck's own wording, units and periods. "$2.5M" stays "$2.5M"; never normalise to 2500000.
- Never move a figure from one field to another. Revenue is not a raise; a raise is not a valuation; a market size is not traction.
- A number in a projection, target or "what we'll do with the money" slide is not a current fact.
- The document may end with a "VISUAL CONTENT" section: a transcription of the deck's charts, logo walls, team slides and diagrams, which the text extraction alone could not carry. Treat it as part of the deck and answer from it — a competitor named only on a positioning matrix, a founder named only on a team slide, an ARR figure printed only on a chart, or a prior employer shown only as a logo beside a founder all count as stated. When the transcription records a logo row with the heading that governed it, carry both the names and that heading into your answer, and keep whose claim it is intact. Respect what the transcription says about each one: a value it marks as forecast or projection is not traction, a logo wall headed "investors" is not a customer list, and anything it marks "illegible" is not an answer.
- If this document is not a pitch deck, or is too garbled to read, answer null to every question and return an empty founders list.

=== QUESTIONS ===
${questions}

Q${INTAKE_FIELDS.length + 1}. Founders — Which founders or executives of this company does the deck name?
    Field: "founders". One entry per named person, in the order the deck presents them. Per person answer:
${FOUNDER_QUESTIONS.map((line) => `      - ${line}`).join("\n")}
    Where a logo row covers the whole team rather than one person, record it in each covered person's background with the heading that governed it, so it stays a team-level claim rather than becoming one person's CV.
    Null each of those the deck does not state. Include only people presented as this company's team — not advisors described as advisors, not investors, not customers. If the deck names nobody, return an empty list.`;
}

/**
 * Asked of the figure crops a deck contains — charts, competitive matrices,
 * logo walls, team slides, product screenshots. Layout OCR returns their loose
 * text with the structure stripped out, which is how a "$1.2M ARR" label on a
 * projection chart ends up looking like present-tense traction. The answer to
 * that is transcription with the relationships intact, never interpretation.
 */
export function figureTranscriptionPrompt(count: number) {
  return `You are looking at ${count} image${count === 1 ? "" : "s"} cropped from a startup pitch deck. Transcribe what each one actually shows, so that a reader who cannot see the images can use them.

For each image, in order, write a block headed "FIGURE <n>" and describe:
- What kind of visual it is: line/bar chart, table, competitive matrix, logo wall, team slide, product screenshot, diagram, photo.
- Every piece of text visible in it, including headings, axis labels, units, legends, data labels, row and column headers, callouts and footnotes. Reproduce numbers exactly as printed, with their units and periods, and headings word for word.
- Every company logo or wordmark in it, by name, and what the slide places it next to.
- The shape of the data: which series is which, the axis ranges, and where labelled points sit. If a value is not printed, say the position only ("bar ends between the 40 and 60 gridlines") — never read a number off a pixel position and state it as fact.
- For a chart covering time: state the exact axis range, and whether the deck marks any part of it as forecast, projection, target or plan. This matters more than any other detail — a projection transcribed as history becomes a false traction claim downstream.
- For a competitive matrix: the axis labels, every company plotted, and where each sits.
- For a logo wall: every company name, and the heading above it verbatim (customers, partners, investors and "as seen in" are four different claims).
- For a team slide: each person's name, title, and every logo, wordmark or affiliation printed with them. Say which person each logo sits beside, and quote the heading that governs the row ("previously at", "ex-", "our team has built at", "our advisors come from") — that heading is what decides whether a logo is the founder's own history or somebody else's, and it must not be dropped. Where a logo row covers the whole slide rather than one person, record it as covering the whole team, in the deck's words.

Rules:
- Transcribe only. Do not summarise, evaluate, or infer a trend.
- Naming a logo IS transcription, and is required. A logo or wordmark is text drawn as a picture: read it and write down the company name, exactly as you would read a caption. Do this wherever logos appear — team slides, customer walls, investor rows, competitive matrices, integration diagrams. A logo you can recognise but whose name is not spelled out on the slide is still an answer, not a guess.
- What you must NOT add is knowledge about a company beyond its name: no sector, size, reputation, funding or relationship that the slide does not itself state. Read the mark; add nothing to it.
- If text or a logo is too small, cropped or blurred to identify, write "illegible" rather than guessing at it.
- If an image carries no usable information (decorative artwork, background texture, an icon), write "FIGURE <n>: no usable content."`;
}
