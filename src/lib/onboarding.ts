export const DEALS_PER_MONTH_OPTIONS = [
  { value: "0-10", label: "Fewer than 10", blurb: "Selective, mostly warm intros" },
  { value: "10-25", label: "10 – 25", blurb: "A steady trickle of inbound" },
  { value: "25-75", label: "25 – 75", blurb: "Inbox is starting to overflow" },
  { value: "75-200", label: "75 – 200", blurb: "Serious inbound volume" },
  { value: "200+", label: "200+", blurb: "Firehose — nothing gets read properly" },
] as const;

export const REVIEW_METHOD_OPTIONS = [
  { value: "manual", label: "Manually, deck by deck", blurb: "Open the PDF, skim, decide" },
  { value: "spreadsheet", label: "Spreadsheet tracker", blurb: "Notes and scores in Sheets/Excel" },
  { value: "crm", label: "A CRM or deal platform", blurb: "Affinity, HubSpot, Airtable…" },
  { value: "analyst", label: "An analyst screens first", blurb: "Someone filters before you look" },
  { value: "none", label: "No real process", blurb: "Whatever reaches the top of the inbox" },
] as const;

export const HOURS_PER_MONTH_OPTIONS = [
  { value: "<5", label: "Under 5 hours" },
  { value: "5-15", label: "5 – 15 hours" },
  { value: "15-40", label: "15 – 40 hours" },
  { value: "40+", label: "More than 40 hours" },
] as const;

export const TOOL_OPTIONS = [
  { value: "affinity", label: "Affinity", domain: "affinity.co" },
  { value: "hubspot", label: "HubSpot", domain: "hubspot.com" },
  { value: "pitchbook", label: "PitchBook", domain: "pitchbook.com" },
  { value: "dealroom", label: "Dealroom", domain: "dealroom.co" },
  { value: "crunchbase", label: "Crunchbase", domain: "crunchbase.com" },
  { value: "airtable", label: "Airtable", domain: "airtable.com" },
  { value: "notion", label: "Notion", domain: "notion.so" },
  { value: "salesforce", label: "Salesforce", domain: "salesforce.com" },
  { value: "carta", label: "Carta", domain: "carta.com" },
  { value: "sheets", label: "Google Sheets", domain: "google.com" },
  { value: "none", label: "None of these", domain: "" },
] as const;

export const INDUSTRY_OPTIONS = [
  "B2B SaaS",
  "Fintech",
  "AI / ML",
  "Healthtech",
  "Climate & energy",
  "Deeptech",
  "Consumer",
  "Marketplaces",
  "Developer tools",
  "Cybersecurity",
  "Logistics & supply chain",
  "Proptech",
  "Edtech",
  "Industrial automation",
] as const;

export const CHECK_SIZE_OPTIONS = [
  { value: "<25k", label: "Under $25k" },
  { value: "25k-100k", label: "$25k – $100k" },
  { value: "100k-500k", label: "$100k – $500k" },
  { value: "500k-2m", label: "$500k – $2m" },
  { value: "2m+", label: "$2m+" },
] as const;

export const HEARD_FROM_OPTIONS = [
  { value: "friend", label: "A friend or fellow investor" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X / Twitter" },
  { value: "search", label: "Google search" },
  { value: "event", label: "An event or demo day" },
  { value: "newsletter", label: "A newsletter or podcast" },
  { value: "other", label: "Somewhere else" },
] as const;

export type OnboardingAnswers = {
  deals_per_month: string | null;
  review_method: string | null;
  hours_per_month: string | null;
  tools: string[];
  industries: string[];
  industries_other: string | null;
  thesis_sentence: string | null;
  check_size: string | null;
  heard_from: string | null;
  heard_from_detail: string | null;
  connect_inbox: boolean | null;
};

export const EMPTY_ANSWERS: OnboardingAnswers = {
  deals_per_month: null,
  review_method: null,
  hours_per_month: null,
  tools: [],
  industries: [],
  industries_other: null,
  thesis_sentence: null,
  check_size: null,
  heard_from: null,
  heard_from_detail: null,
  connect_inbox: null,
};

export function toolLogoUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/** Human label lookup used by the thesis text the onboarding writes. */
export function labelFor(
  options: readonly { value: string; label: string }[],
  value: string | null,
) {
  return options.find((option) => option.value === value)?.label ?? "";
}
