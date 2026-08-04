import { planIdFromPolarProduct } from "@/lib/plans";

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

/** The app-side subscriptions row joined with its profile. */
export type AppSubRow = {
  userId: string;
  email: string | null;
  plan: string;
  status: string;
  seats: number;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  polarProductId: string | null;
  currentPeriodEnd: string | null;
};

export type Verdict = "ok" | "mismatch" | "missing_link" | "orphan_polar" | "orphan_app";

export type ReconcileIssue = {
  field: string;
  polar: string | null;
  app: string | null;
  detail: string;
};

export type ReconcileItem = {
  key: string;
  verdict: Verdict;
  email: string | null;
  matchedBy: "subscription_id" | "external_id" | "customer_id" | "email" | null;
  polar: PolarSubRecord | null;
  app: AppSubRow | null;
  issues: ReconcileIssue[];
  /** Patch that would bring the app row in line with Polar. */
  fix: Record<string, string | number | null> | null;
};

export type ReconcileReport = {
  server: string;
  checkedAt: string;
  counts: Record<Verdict, number>;
  items: ReconcileItem[];
};

const ACTIVE_POLAR = new Set(["active", "trialing", "past_due"]);

/** Polar status -> the status we store on the app row. */
export function appStatusFor(polarStatus: string) {
  if (polarStatus === "canceled" || polarStatus === "revoked" || polarStatus === "unpaid")
    return "canceled";
  if (polarStatus === "trialing") return "trialing";
  if (polarStatus === "past_due") return "past_due";
  return "active";
}

/** Plan the app row should carry for this Polar subscription. */
export function expectedPlan(sub: PolarSubRecord) {
  if (!ACTIVE_POLAR.has(sub.status)) return "trial";
  return planIdFromPolarProduct(sub.productId) ?? null;
}

function sameInstant(a: string | null, b: string | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000;
}

function norm(v: unknown) {
  return v === null || v === undefined ? null : String(v);
}

/**
 * Diffs live Polar subscriptions against app-side subscription rows.
 * Pure: no network, no database — everything is passed in.
 */
export function reconcile(
  polarSubs: PolarSubRecord[],
  appRows: AppSubRow[],
  server = "sandbox",
): ReconcileReport {
  const byUser = new Map(appRows.map((r) => [r.userId, r]));
  const bySubId = new Map(
    appRows.filter((r) => r.polarSubscriptionId).map((r) => [r.polarSubscriptionId!, r]),
  );
  const byCustomer = new Map(
    appRows.filter((r) => r.polarCustomerId).map((r) => [r.polarCustomerId!, r]),
  );
  const byEmail = new Map(
    appRows.filter((r) => r.email).map((r) => [r.email!.toLowerCase(), r]),
  );

  const used = new Set<string>();
  const items: ReconcileItem[] = [];

  for (const sub of polarSubs) {
    let app: AppSubRow | undefined;
    let matchedBy: ReconcileItem["matchedBy"] = null;

    if (bySubId.has(sub.id)) {
      app = bySubId.get(sub.id);
      matchedBy = "subscription_id";
    } else if (sub.externalCustomerId && byUser.has(sub.externalCustomerId)) {
      app = byUser.get(sub.externalCustomerId);
      matchedBy = "external_id";
    } else if (sub.customerId && byCustomer.has(sub.customerId)) {
      app = byCustomer.get(sub.customerId);
      matchedBy = "customer_id";
    } else if (sub.email && byEmail.has(sub.email.toLowerCase())) {
      app = byEmail.get(sub.email.toLowerCase());
      matchedBy = "email";
    }

    if (!app) {
      items.push({
        key: sub.id,
        verdict: "orphan_polar",
        email: sub.email,
        matchedBy: null,
        polar: sub,
        app: null,
        issues: [
          {
            field: "account",
            polar: sub.externalCustomerId ?? sub.email,
            app: null,
            detail:
              "Polar has a subscription with no matching app account. The customer was created outside this app, or the user never signed up.",
          },
        ],
        fix: null,
      });
      continue;
    }

    used.add(app.userId);
    const issues: ReconcileIssue[] = [];
    const fix: Record<string, string | number | null> = {};

    if (app.polarSubscriptionId !== sub.id) {
      issues.push({
        field: "polar_subscription_id",
        polar: sub.id,
        app: app.polarSubscriptionId,
        detail: "App row is not linked to this Polar subscription.",
      });
      fix["polar_subscription_id"] = sub.id;
    }
    if (app.polarCustomerId !== sub.customerId) {
      issues.push({
        field: "polar_customer_id",
        polar: sub.customerId,
        app: app.polarCustomerId,
        detail: "Polar customer id is missing or stale on the app row.",
      });
      fix["polar_customer_id"] = sub.customerId;
    }
    if (app.polarProductId !== sub.productId) {
      issues.push({
        field: "polar_product_id",
        polar: sub.productId,
        app: app.polarProductId,
        detail: "Purchased product does not match the recorded product.",
      });
      fix["polar_product_id"] = sub.productId;
    }

    const plan = expectedPlan(sub);
    if (plan && app.plan !== plan) {
      issues.push({
        field: "plan",
        polar: plan,
        app: app.plan,
        detail: `Polar product "${sub.productName ?? sub.productId}" maps to the ${plan} plan.`,
      });
      fix["plan"] = plan;
    }
    if (!plan && ACTIVE_POLAR.has(sub.status)) {
      issues.push({
        field: "plan",
        polar: null,
        app: app.plan,
        detail:
          "Polar product id is not mapped to any app plan — add it to src/lib/plans.ts.",
      });
    }

    const status = appStatusFor(sub.status);
    if (app.status !== status) {
      issues.push({
        field: "status",
        polar: status,
        app: app.status,
        detail: `Polar reports "${sub.status}".`,
      });
      fix["status"] = status;
    }

    if (sub.seats !== null && app.seats !== sub.seats) {
      issues.push({
        field: "seats",
        polar: String(sub.seats),
        app: String(app.seats),
        detail: "Seat count on checkout metadata differs from the app row.",
      });
      fix["seats"] = sub.seats;
    }

    if (!sameInstant(sub.currentPeriodEnd, app.currentPeriodEnd)) {
      issues.push({
        field: "current_period_end",
        polar: norm(sub.currentPeriodEnd),
        app: norm(app.currentPeriodEnd),
        detail: "Renewal date is out of date.",
      });
      fix["current_period_end"] = sub.currentPeriodEnd;
    }

    const unlinked = !app.polarSubscriptionId && !app.polarCustomerId;
    items.push({
      key: sub.id,
      verdict: issues.length === 0 ? "ok" : unlinked ? "missing_link" : "mismatch",
      email: app.email ?? sub.email,
      matchedBy,
      polar: sub,
      app,
      issues,
      fix: Object.keys(fix).length ? fix : null,
    });
  }

  for (const row of appRows) {
    if (used.has(row.userId)) continue;
    const claimsPaid = row.plan !== "trial" || !!row.polarSubscriptionId;
    if (!claimsPaid) continue;
    items.push({
      key: `app:${row.userId}`,
      verdict: "orphan_app",
      email: row.email,
      matchedBy: null,
      polar: null,
      app: row,
      issues: [
        {
          field: "subscription",
          polar: null,
          app: row.polarSubscriptionId ?? row.plan,
          detail:
            "App row claims a paid plan but Polar has no matching subscription. Likely a stale row after a cancellation or a manual edit.",
        },
      ],
      fix: { plan: "trial", status: "canceled" },
    });
  }

  const counts: Record<Verdict, number> = {
    ok: 0,
    mismatch: 0,
    missing_link: 0,
    orphan_polar: 0,
    orphan_app: 0,
  };
  for (const item of items) counts[item.verdict] += 1;

  return { server, checkedAt: new Date().toISOString(), counts, items };
}
