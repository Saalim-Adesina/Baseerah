import {
  ACTIVE_POLAR_STATUSES,
  appStatusFor as statusRule,
  planForProduct,
} from "@/lib/billing-rules";

/** A subscription as returned by the Polar API, flattened to what we compare. */
export type PolarSubRecord = {
  id: string;
  status: string;
  productId: string | null;
  productName: string | null;
  customerId: string | null;
  externalCustomerId: string | null;
  email: string | null;
  currentPeriodEnd: string | null;
  seats: number | null;
};

const ACTIVE_POLAR = ACTIVE_POLAR_STATUSES;

/** Polar status -> the status we store on the app row (shared rulebook). */
export function appStatusFor(polarStatus: string) {
  return statusRule(polarStatus);
}

/** Plan the app row should carry for this Polar subscription. */
export function expectedPlan(sub: PolarSubRecord) {
  if (!ACTIVE_POLAR.has(sub.status)) return "angel_trial";
  return planForProduct(sub.productId);
}
