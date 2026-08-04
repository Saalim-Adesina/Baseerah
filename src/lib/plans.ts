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
  /** Polar product id used for checkout, null for contact-sales plans. */
  polarProductId: string | null;
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
    polarProductId: "c59a5ea7-e21e-4894-98a3-3ac1c1fa433e",
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
    polarProductId: "964f4eb8-91b2-4289-ab4a-35d8c26d9420",
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
    polarProductId: "a6970a25-435f-4278-9657-bc89fd7a5598",
  },

];

/** Polar product for extra seats beyond a plan's bundle. */
export const EXTRA_SEAT_PRODUCT_ID = "7afd79f7-1f49-47bb-8812-b985800c0354";

/** Maps a Polar product id back to an app plan id. */
export function planIdFromPolarProduct(productId: string | null | undefined) {
  return PLANS.find((p) => p.polarProductId === productId)?.id;
}
