import type { Plan } from "./plans";

/** Total seats the account currently pays for (never below the plan's bundle). */
export function totalSeats(plan: Plan, purchasedSeats: number | null | undefined) {
  return Math.max(purchasedSeats ?? 0, plan.seatsIncluded);
}

/** Seats in use: every teammate plus the account owner. */
export function seatsUsed(memberCount: number) {
  return memberCount + 1;
}

/** Seats still free before the account starts paying for extras. */
export function seatsRemaining(
  plan: Plan,
  purchasedSeats: number | null | undefined,
  memberCount: number,
) {
  return Math.max(totalSeats(plan, purchasedSeats) - seatsUsed(memberCount), 0);
}

/** Seats used beyond what the plan bundles — billed at renewal. */
export function overageSeats(
  plan: Plan,
  purchasedSeats: number | null | undefined,
  memberCount: number,
) {
  return Math.max(seatsUsed(memberCount) - totalSeats(plan, purchasedSeats), 0);
}

/** Hard plan ceiling reached (null maxSeats = unlimited). */
export function atSeatLimit(plan: Plan, memberCount: number) {
  return plan.maxSeats !== null && seatsUsed(memberCount) >= plan.maxSeats;
}

export function canAddSeat(plan: Plan, memberCount: number) {
  return plan.seatsIncluded > 1 && !atSeatLimit(plan, memberCount);
}

/** Monthly cost of overage seats in cents, 0 when the plan bundles extras. */
export function overageCostCents(
  plan: Plan,
  purchasedSeats: number | null | undefined,
  memberCount: number,
) {
  if (plan.extraSeatCents === null) return 0;
  return overageSeats(plan, purchasedSeats, memberCount) * plan.extraSeatCents;
}
