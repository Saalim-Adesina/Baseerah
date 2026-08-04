export type Plan = {
  id: "angel" | "syndicate" | "institution";
  name: string;
  price: string;
  cadence: string;
  audience: string;
  highlight?: boolean;
  features: string[];
  /** Seats bundled with the plan. Angel is a single-seat plan. */
  seatsIncluded: number;
  /** Price per additional seat, null when seats are not purchasable. */
  extraSeatPrice: string | null;
  /** Hard ceiling on seats, null = unlimited. */
  maxSeats: number | null;
};

export const SEAT_ROLES = [
  { value: "admin", label: "Admin", blurb: "Full access, can manage the thesis and billing." },
  { value: "analyst", label: "Analyst", blurb: "Screens deals, writes memos, runs chat." },
  { value: "viewer", label: "Viewer", blurb: "Read-only access to memos and scorecards." },
] as const;

export type SeatRole = (typeof SEAT_ROLES)[number]["value"];

export function planById(id: string | undefined) {
  return PLANS.find((p) => p.id === id);
}

export function seatsSupported(planId: string | undefined) {
  const plan = planById(planId);
  return !!plan && plan.seatsIncluded > 1;
}


export const PLANS: Plan[] = [
  {
    id: "angel",
    name: "Angel",
    price: "$49",
    cadence: "per month",
    audience: "Solo angel investors",
    highlight: true,
    features: [
      "Private deal inbox — forward any deck",
      "Up to 150 screened deals / month",
      "Thesis-driven scoring across 11 metrics",
      "Founder read from LinkedIn + meeting notes",
      "Bias check on your own conviction",
      "One-click polite pass emails",
      "Deal chat and IC-style memos",
    ],
  },
  {
    id: "syndicate",
    name: "Syndicate",
    price: "$199",
    cadence: "per month",
    audience: "Syndicate leads & incubators",
    features: [
      "Everything in Angel",
      "Up to 750 screened deals / month",
      "Batch screening for cohorts",
      "Shareable memos for your backers",
    ],
  },
  {
    id: "institution",
    name: "Institutional",
    price: "Custom",
    cadence: "annual",
    audience: "Venture funds & family offices",
    features: [
      "Everything in Syndicate",
      "Unlimited screening volume",
      "Multiple theses and mandates",
      "Onboarding and priority support",
    ],
  },
];
