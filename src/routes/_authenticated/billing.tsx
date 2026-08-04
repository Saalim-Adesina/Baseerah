import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS } from "@/lib/plans";
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
  const typeLabel = INVESTOR_TYPES.find((t) => t.value === profile?.investor_type)?.label;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="label-caps">Account</p>
      <h1 className="mt-1 text-4xl">Plan &amp; billing</h1>

      <div className="panel mt-6 flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div>
          <p className="label-caps">Current plan</p>
          <p className="mt-1 font-display text-3xl capitalize">
            {loading ? "…" : (subscription?.plan ?? "trial")}
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
        </div>
      </div>

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
              onClick={() =>
                toast.info("Checkout is being connected — confirm payments to go live.")
              }
            >
              {subscription?.plan === plan.id ? "Current plan" : `Choose ${plan.name}`}
            </Button>
          </div>
        ))}
      </div>
    </main>
  );
}
