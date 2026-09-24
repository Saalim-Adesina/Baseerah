/**
 * The single rulebook for billing, plans and seats.
 *
 * Every path that decides "what plan is this account on, what status, how many
 * seats" imports from here: the signup gate, checkout, the Polar webhook, the
 * billing auto-sync, reconciliation and the developer dashboard. Keeping the
 * rules in one place is what stops these surfaces from drifting apart.
 */
import { planById, type Plan } from "@/lib/plans";

export const APP_PLANS = ["angel_trial", "angel", "syndicate", "institution"] as const;
export type AppPlanId = (typeof APP_PLANS)[number];

export const PLAN_DISPLAY_NAMES: Record<AppPlanId, string> = {
  angel_trial: "Angel Trial",
  angel: "Angel",
  syndicate: "Syndicate",
  institution: "Institutional",
};

/** Human-readable plan label. Falls back to the raw id so unknown plans stay visible. */
export function planDisplayName(plan: string | null | undefined): string {
  return PLAN_DISPLAY_NAMES[(plan ?? "") as AppPlanId] ?? plan ?? "—";
}

export const APP_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

/** Polar statuses that mean the customer is currently entitled to the plan. */
export const ACTIVE_POLAR_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Email is the identity across Polar and the app — always compare normalized. */
export function normalizeEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() || null;
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
export const TRIAL_BASELINE = {
  plan: "angel_trial" as const,
  status: "canceled" as const,
  seats: 1,
};

/**
 * Trials are an Angel-only offer. Syndicate and Institutional accounts pay in
 * full before they get access — there is no free window on those plans.
 */
export const TRIAL_ELIGIBLE_PLANS = new Set<AppPlanId>(["angel_trial", "angel"]);

/** True when this plan may sit in a trialing state. */
export function trialAllowedForPlan(plan: string | null | undefined) {
  return TRIAL_ELIGIBLE_PLANS.has((plan ?? "angel_trial") as AppPlanId);
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

/**
 * Screenings allowed per billing period. `angel_trial` is not in `PLANS` (it is
 * the pre-payment state, not a purchasable product), so its allowance lives
 * here. null = unlimited.
 */
const TRIAL_SCREENING_QUOTA = 10;

export function screeningQuotaForPlan(plan: string | null | undefined): number | null {
  if ((plan ?? "angel_trial") === "angel_trial") return TRIAL_SCREENING_QUOTA;
  const found = planById(plan ?? "");
  // An unrecognised plan gets the trial allowance rather than unlimited — a
  // typo in a plan id must never open the meter wide.
  return found ? found.screeningQuota : TRIAL_SCREENING_QUOTA;
}

export type ScreeningVerdict =
  | { allowed: true; quota: number | null; used: number; remaining: number | null }
  | {
      allowed: false;
      reason: "no-access" | "trial-expired" | "quota-exceeded";
      message: string;
    };

/**
 * The one place that decides whether an account may screen another deal.
 * `used` is the count already recorded for the current period; callers are
 * responsible for having reset it when `periodEnd` has passed.
 */
export function screeningAllowed(input: {
  plan: string | null | undefined;
  status: string | null | undefined;
  used: number;
  periodEnd?: string | null;
  now?: number;
}): ScreeningVerdict {
  // A trial that has run past its period end keeps `status: "trialing"` on the
  // row until something reconciles it, and `hasAccess` still says yes. Left
  // alone that would hand an expired trial an unlimited number of fresh
  // allowances, one per rollover, so the meter checks the clock itself.
  if (
    input.status === "trialing" &&
    trialAllowedForPlan(input.plan) &&
    periodElapsed(input.periodEnd, input.now ?? Date.now())
  ) {
    return {
      allowed: false,
      reason: "trial-expired",
      message: "Your trial has ended. Choose a plan to keep screening deals.",
    };
  }

  if (!hasAccess(input.plan, input.status)) {
    return {
      allowed: false,
      reason: "no-access",
      message: "This account has no active subscription. Choose a plan to start screening.",
    };
  }

  const quota = screeningQuotaForPlan(input.plan);
  if (quota === null) return { allowed: true, quota: null, used: input.used, remaining: null };

  if (input.used >= quota) {
    return {
      allowed: false,
      reason: "quota-exceeded",
      message: `You've used all ${quota} screenings on the ${planDisplayName(
        input.plan,
      )} plan this period. Upgrade to keep screening.`,
    };
  }

  return { allowed: true, quota, used: input.used, remaining: quota - input.used };
}

/** True once the stored period end is in the past, so the meter should reset. */
export function periodElapsed(periodEnd: string | null | undefined, now = Date.now()) {
  if (!periodEnd) return false;
  const end = Date.parse(periodEnd);
  return Number.isFinite(end) && end <= now;
}
