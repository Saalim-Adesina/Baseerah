import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ExternalLink, Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { confirmCheckout, openBillingPortal, startCheckout } from "@/lib/billing.functions";
import { syncMySubscriptionFromPolar } from "@/lib/account-link.functions";
import { isBillingAdmin } from "@/lib/reconcile.functions";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, planById, seatsSupported } from "@/lib/plans";
import { planDisplayName } from "@/lib/billing-rules";
import { TeamSeats } from "@/components/team-seats";
import { BackLink } from "@/components/back-link";
import { INVESTOR_TYPES, useAccount } from "@/lib/account";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Plan & Billing — Meridian" },
      {
        name: "description",
        content: "Manage your Meridian screening subscription, plan limits and investor profile.",
      },
      { property: "og:title", content: "Plan & Billing — Meridian" },
      {
        property: "og:description",
        content: "Manage your screening subscription and plan limits.",
      },
    ],
  }),
  component: Billing,
});

function Billing() {
  const { profile, subscription, loading } = useAccount();
  const checkout = useServerFn(startCheckout);
  const confirm = useServerFn(confirmCheckout);
  const portal = useServerFn(openBillingPortal);
  const syncBilling = useServerFn(syncMySubscriptionFromPolar);
  const [busy, setBusy] = useState<string | null>(null);
  const checkAdmin = useServerFn(isBillingAdmin);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    void checkAdmin({} as never)
      .then((r) => setAdmin(!!(r as { admin: boolean }).admin))
      .catch(() => setAdmin(false));
  }, [checkAdmin]);

  useEffect(() => {
    const checkoutId = new URLSearchParams(window.location.search).get("checkout_id");
    if (!checkoutId) return;
    void confirm({ data: { checkoutId } })
      .then((r) => {
        if (r.status === "succeeded" || r.status === "confirmed") {
          toast.success("Payment confirmed — your plan is being activated.");
        } else if (r.status === "failed" || r.status === "expired") {
          toast.error("That checkout did not complete. Nothing was charged.");
        } else {
          toast.info("Checkout still processing — we'll update your plan shortly.");
        }
      })
      .catch(() => toast.error("Could not verify that checkout."))
      .finally(() => window.history.replaceState({}, "", "/billing"));
  }, [confirm]);

  // Reconcile this account against Polar on every visit, matching on email.
  // Covers subscriptions bought before the app account existed.
  useEffect(() => {
    void syncBilling({}).catch(() => undefined);
  }, [syncBilling]);

  async function choosePlan(planId: string) {
    setBusy(planId);
    try {
      const { url } = await checkout({
        data: { planId: planId as "angel" | "syndicate" | "institution", origin: window.location.origin },
      });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
      setBusy(null);
    }
  }

  async function manageBilling() {
    setBusy("portal");
    try {
      const { url } = await portal({ data: undefined });
      window.location.href = url;
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? `Billing portal error: ${error.message}`
          : "Billing portal is unavailable right now.",
      );
      setBusy(null);
    }
  }
  const typeLabel = INVESTOR_TYPES.find((t) => t.value === profile?.investor_type)?.label;
  const currentPlan = planById(subscription?.plan);
  const showSeats = seatsSupported(subscription?.plan);

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <BackLink />
      <p className="label-caps">Account</p>
      <h1 className="mt-1 text-4xl">Plan &amp; billing</h1>

      <div className="panel mt-6 flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div>
          <p className="label-caps">Current plan</p>
          <p className="mt-1 font-display text-3xl">
            {loading ? "…" : planDisplayName(subscription?.plan)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {subscription?.current_period_end
              ? `Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`
              : "No renewal date set"}
          </p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>{profile?.full_name || profile?.email}</p>
          {typeLabel ? <Badge variant="outline">{typeLabel}</Badge> : null}
          <p className="mt-1">
            Deals screened this period: {subscription?.deals_screened_this_period ?? 0}
          </p>
          {showSeats ? <p>Seats: {subscription?.seats ?? currentPlan?.seatsIncluded}</p> : null}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy === "portal"}
              onClick={() => void manageBilling()}
            >
              {busy === "portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Manage billing
            </Button>
            {admin ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/webhook-audit">
                  <ScrollText className="h-4 w-4" />
                  View billing logs
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {showSeats && currentPlan ? (
        <TeamSeats plan={currentPlan} seats={subscription?.seats ?? currentPlan.seatsIncluded} />
      ) : (
        <div className="panel mt-8 px-6 py-5">
          <p className="label-caps">Team seats</p>
          <h2 className="mt-1 text-2xl">Screening with a team?</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The Angel plan is a single-seat account. Syndicate includes 5 seats with roles for
            analysts and backers, and Institutional comes with unlimited seats — upgrade below to
            invite your team into the same pipeline.
          </p>
        </div>
      )}

      {admin ? (
        <div className="panel mt-8 flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <p className="label-caps">Admin</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Review incoming billing events, how each was matched to an account, and the plan and
              seat changes applied.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Accounts &amp; subscriptions
            </Link>
            <Link
              to="/webhook-audit"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Billing webhook audit
            </Link>
          </div>

        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`panel flex flex-col px-6 py-6 ${
              plan.highlight ? "border-primary ring-1 ring-primary/40" : ""
            }`}
          >
            {plan.highlight ? (
              <span className="mb-3 w-fit rounded bg-primary px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary-foreground">
                Recommended for angels
              </span>
            ) : null}
            <h2 className="text-2xl">{plan.name}</h2>
            <p className="text-xs text-muted-foreground">{plan.audience}</p>
            <p className="mt-4 font-display text-4xl">
              {plan.price}
              <span className="ml-1 font-sans text-xs text-muted-foreground">{plan.cadence}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {plan.maxSeats === 1
                ? "Single seat"
                : plan.maxSeats === null
                  ? `${plan.seatsIncluded} seats included · unlimited`
                  : `${plan.seatsIncluded} seats included · up to ${plan.maxSeats}`}
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-6"
              variant={plan.highlight ? "default" : "outline"}
              disabled={busy !== null || subscription?.plan === plan.id}
              onClick={() => void choosePlan(plan.id)}
            >
              {busy === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {subscription?.plan === plan.id ? "Current plan" : `Choose ${plan.name}`}
            </Button>
          </div>
        ))}
      </div>
    </main>
  );
}
