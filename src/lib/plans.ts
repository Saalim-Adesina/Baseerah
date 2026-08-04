export type Plan = {
  id: "angel" | "syndicate" | "institution";
  name: string;
  price: string;
  cadence: string;
  audience: string;
  highlight?: boolean;
  features: string[];
};

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
