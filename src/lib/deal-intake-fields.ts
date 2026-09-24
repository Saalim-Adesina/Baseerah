import { ROUNDS } from "./types";

/**
 * One entry per question the intake form puts to the user. The form renders
 * `label` and `placeholder`; the deck reader turns `question` and `guidance`
 * into the prompt it answers. Both read this list, so a label and the question
 * asked of the model cannot drift apart.
 */
export type IntakeFieldKey =
  | "company"
  | "website"
  | "oneLiner"
  | "sector"
  | "geography"
  | "round"
  | "raising"
  | "valuation"
  | "traction"
  | "unitEconomics"
  | "competition";

export type IntakeField = {
  key: IntakeFieldKey;
  label: string;
  /** Asked of the deck verbatim, in the model's numbered question list. */
  question: string;
  /** What counts as an answer, and the specific ways this field gets faked. */
  guidance: string;
  placeholder?: string;
};

export const INTAKE_FIELDS: IntakeField[] = [
  {
    key: "company",
    label: "Company name *",
    question: "What is the name of the company raising this round?",
    guidance:
      "The company presenting. Not a customer, investor, partner, portfolio example or comparable named anywhere in the deck. If several companies are named and which one is raising is not obvious, answer null.",
  },
  {
    key: "website",
    label: "Website",
    question: "What is this company's website?",
    guidance:
      "Only a URL that appears in the document and belongs to this company. Never construct one from the company name. An email domain is not a website.",
  },
  {
    key: "oneLiner",
    label: "One liner",
    question: "How does the deck describe what this company does, in one sentence?",
    guidance:
      "The deck's own positioning line, under 140 characters, in its words. Do not compose, summarise or improve one. If the deck has no such sentence, answer null.",
  },
  {
    key: "sector",
    label: "Sector / industry",
    question: "What sector or industry does the deck say this company operates in?",
    guidance:
      'The market this company sells into. Take it from any place the deck says so plainly: a stated sector or category, the positioning line ("the X platform for Y"), a market-size slide about their own market, or a self-description such as "we are a fintech company". Naming the category a deck describes at length is reading, not inference — answer null only when the deck genuinely never says what business it is in. What does not count: the industry of a customer, comparable or investor, and a conference or award name.',
  },
  {
    key: "geography",
    label: "Geography",
    question: "What geography or market does the deck say the company operates in or sells to?",
    guidance:
      "Only if named as their market. An office address or a city on a contact slide is not a stated geography.",
  },
  {
    key: "round",
    label: "Round",
    question: "Which funding stage does the deck say this raise is?",
    guidance: `Answer with exactly one of: ${ROUNDS.join(", ")}. Only if the deck names the stage. Do not infer a stage from the raise amount, the valuation, the company's age or its traction. Anything outside that list is null.`,
  },
  {
    key: "raising",
    label: "Raising",
    question: "How much is the company raising in this round?",
    guidance:
      "The amount being raised in this round, in the wording and units the deck uses (leave $2.5M as $2.5M). Never a revenue, valuation, market-size or prior-round figure. If the deck says it is raising but gives no amount, answer null.",
    placeholder: "$2.5m",
  },
  {
    key: "valuation",
    label: "Valuation / terms",
    question: "What valuation or deal terms does the deck state?",
    guidance:
      "Valuation, cap, discount, pre/post basis or instrument, as written. A raise amount is not a valuation. If terms are said to be open or undecided, answer null.",
    placeholder: "$12m post, SAFE",
  },
  {
    key: "traction",
    label: "Traction / metrics",
    question:
      "What traction does the deck claim: revenue, growth, users, retention, pipeline, named customers?",
    guidance:
      "The figures as stated, with their periods and units. Copy them; do not annualise, total, convert or recompute. Projections and targets are not traction — if a number is a forecast, either say so in the same words the deck uses or leave it out. Include named customer logos only where the deck presents them as customers.",
    placeholder: "ARR, growth rate, users, pipeline, retention, logos…",
  },
  {
    key: "unitEconomics",
    label: "Unit economics",
    question: "What unit economics does the deck give: CAC, LTV, gross margin, payback, burn?",
    guidance:
      "Only figures the deck states. Never derive one metric from another, even where the arithmetic is available.",
    placeholder: "CAC, LTV, gross margin, payback, burn multiple, contribution margin…",
  },
  {
    key: "competition",
    label: "Known competitors",
    question: "Which competitors does the deck name?",
    guidance:
      "Only companies the deck itself presents as competition or alternatives, including names on a competitive-landscape chart. Do not add competitors you know of from outside the document.",
  },
];

/** Asked once per person the deck names. */
export const FOUNDER_QUESTIONS = [
  "name: the person's full name as written.",
  "role: their title at this company (CEO, CTO, Head of Product…), only if stated.",
  "linkedin: their LinkedIn URL, only if the URL literally appears in the document.",
  "background: prior companies, roles, education or domain experience, as the deck states them. Team slides usually carry this as company logos rather than sentences: a row of wordmarks beside a person, or under a heading such as previously-at, ex-, our-team-has-built-at, or our-advisors-come-from. Those logos are a stated background claim and must be recorded here by company name, together with the heading that governs them, in the wording the deck uses. Keep whose claim it is intact: where a logo row is headed as advisors, say so rather than attributing it to the founder. Do not add anything you know about this person from outside the document.",
];
