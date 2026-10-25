import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Plan and billing moved into /settings. This route stays so links already in
 * the wild keep working — most importantly Polar checkouts created before the
 * move, whose success URL still points here with a `checkout_id` the billing
 * panel has to confirm. Drop that param and the payment is never reconciled.
 */
export const Route = createFileRoute("/_authenticated/billing")({
  validateSearch: (search: Record<string, unknown>): { checkout_id?: string } => {
    const checkoutId = search["checkout_id"];
    return typeof checkoutId === "string" && checkoutId ? { checkout_id: checkoutId } : {};
  },
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/settings",
      search: { tab: "billing" as const, ...search },
      replace: true,
    });
  },
});
