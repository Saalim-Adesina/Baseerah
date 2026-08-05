/**
 * The single rulebook for billing, plans and seats.
 *
 * Every path that decides "what plan is this account on, what status, how many
 * seats" imports from here: the signup gate, checkout, the Polar webhook, the
 * billing auto-sync, reconciliation and the superadmin dashboard. Keeping the
 * rules in one place is what stops these surfaces from drifting apart.
 */
import { EXTRA_SEAT_PRODUCT_ID, planById, planIdFromPolarProduct, type Plan } from "@/lib/plans";

export const APP_PLANS = ["trial", "angel", "syndicate", "institution"] as const;
export type AppPlanId = (typeof APP_PLANS)[number];

export const APP_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

/** Polar statuses that mean the customer is currently entitled to the plan. */
export const ACTIVE_POLAR_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Email is the identity across Polar and the app — always compare normalized. */
export function normalizeEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() || null;
}

/** Polar product id -> app plan id (handles live and sandbox product ids). */
export function planForProduct(productId: string | null | undefined): AppPlanId | null {
  return (planIdFromPolarProduct(productId) as AppPlanId | undefined) ?? null;
}

/** Polar subscription status -> the status stored on the app row. */
export function appStatusFor(polarStatus: string | null | undefined): AppStatus {
  if (!polarStatus) return "active";
  if (polarStatus === "canceled" || polarStatus === "revoked" || polarStatus === "unpaid")
    return "canceled";
  if (polarStatus === "trialing") return "trialing";
  if (polarStatus === "past_due") return "past_due";
  return "active";
}

/**
 * Seats an account should have for a plan. Extra purchased seats are added on
 * top of the plan bundle and never take it below the bundle.
 */
export function seatsForPlan(planId: string | null | undefined, extraSeats = 0) {
  const plan = planById(planId ?? "");
  const bundled = plan?.seatsIncluded ?? 1;
  const total = bundled + Math.max(extraSeats, 0);
  return plan?.maxSeats === null ? total : Math.min(total, plan?.maxSeats ?? total);
}

/** Env keys holding the sandbox extra-seat product id. */
const SANDBOX_SEAT_ENV = ["POLAR_SANDBOX_PRODUCT_EXTRA_SEAT"];

/**
 * True when a Polar product is the standalone "extra seat" product. These
 * subscriptions must only add seats — they must never overwrite the account's
 * plan or its main subscription link.
 */
export function isExtraSeatProduct(productId: string | null | undefined) {
  if (!productId) return false;
  if (productId === EXTRA_SEAT_PRODUCT_ID) return true;
  if (typeof process !== "undefined" && process.env) {
    return SANDBOX_SEAT_ENV.some((key) => process.env[key] === productId);
  }
  return false;
}

/** True when metadata marks the checkout as an extra-seat purchase. */
export function isExtraSeatMetadata(metadata: Record<string, string> | null | undefined) {
  return metadata?.["kind"] === "extra_seat";
}

/** Hard plan ceiling on assigned seat rows (null = unlimited). */
export function seatCeiling(plan: Plan | undefined, paidSeats: number | null | undefined) {
  if (!plan) return 1;
  const paid = Math.max(paidSeats ?? 0, plan.seatsIncluded);
  if (plan.maxSeats === null) return Number.POSITIVE_INFINITY;
  return Math.min(Math.max(paid, plan.seatsIncluded), plan.maxSeats);
}

/** What an account looks like when it has no live Polar subscription. */
export const TRIAL_BASELINE = { plan: "trial" as const, status: "canceled" as const, seats: 1 };

/**
 * Trials are an Angel-only offer. Syndicate and Institutional accounts pay in
 * full before they get access — there is no free window on those plans.
 */
export const TRIAL_ELIGIBLE_PLANS = new Set<AppPlanId>(["trial", "angel"]);

/** True when this plan may sit in a trialing state. */
export function trialAllowedForPlan(plan: string | null | undefined) {
  return TRIAL_ELIGIBLE_PLANS.has((plan ?? "trial") as AppPlanId);
}

/** True when a new signup of this investor type may start on a trial. */
export function trialAllowedForInvestorType(investorType: string | null | undefined) {
  return (investorType ?? "angel") === "angel";
}

/**
 * Coerces a status against the trial policy: a non-Angel plan can never be
 * "trialing" — until payment lands it stays canceled (no access).
 */
export function enforceTrialPolicy(plan: string | null | undefined, status: AppStatus): AppStatus {
  if (status === "trialing" && !trialAllowedForPlan(plan)) return "canceled";
  return status;
}

/** True when the account is entitled to use the product right now. */
export function hasAccess(plan: string | null | undefined, status: string | null | undefined) {
  if (status === "active" || status === "past_due") return true;
  return status === "trialing" && trialAllowedForPlan(plan);
}

