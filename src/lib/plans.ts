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
  /** Price per additional seat in cents, null when extras aren't billed. */
  extraSeatCents: number | null;
  /** Whether this plan can be bought online, or is contact-sales only. */
  purchasable: boolean;
  /**
   * Screenings allowed per billing period, null = unlimited. The `features`
   * copy above is marketing text; this is the number the server enforces, so
   * the two must be kept in step.
   */
  screeningQuota: number | null;
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
    seatsIncluded: 1,
    extraSeatPrice: null,
    maxSeats: 1,
    extraSeatCents: null,
    purchasable: true,
    screeningQuota: 150,
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
      "5 team seats included, $29 / extra seat",
    ],
    seatsIncluded: 5,
    extraSeatPrice: "$29 / month",
    maxSeats: 25,
    extraSeatCents: 2900,
    purchasable: true,
    screeningQuota: 750,
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
      "Unlimited team seats with roles",
      "Onboarding and priority support",
    ],
    seatsIncluded: 20,
    extraSeatPrice: "Included",
    maxSeats: null,
    extraSeatCents: null,
    purchasable: true,
    screeningQuota: null,
  },
];
