import { describe, expect, it } from "vitest";
import {
  appStatusFor,
  hasAccess,
  isExtraSeatMetadata,
  normalizeEmail,
  periodElapsed,
  screeningAllowed,
  screeningQuotaForPlan,
  seatCeiling,
  seatsForPlan,
} from "@/lib/billing-rules";
import { planById } from "@/lib/plans";
import { planIdForProduct } from "@/lib/polar-catalog";
import { SANDBOX_CATALOG } from "@/lib/test-catalog";
import { mappingDecision } from "@/routes/api/public/polar-webhook";

describe("billing rulebook", () => {
  it("normalizes email as the identity key", () => {
    expect(normalizeEmail("  Angel@Fund.COM ")).toBe("angel@fund.com");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("maps Polar statuses onto app statuses", () => {
    expect(appStatusFor("active")).toBe("active");
    expect(appStatusFor("trialing")).toBe("trialing");
    expect(appStatusFor("past_due")).toBe("past_due");
    expect(appStatusFor("revoked")).toBe("canceled");
    expect(appStatusFor("unpaid")).toBe("canceled");
  });

  it("maps product ids to plans within the active environment", () => {
    expect(planIdForProduct(SANDBOX_CATALOG, SANDBOX_CATALOG.products.syndicate)).toBe("syndicate");
    expect(planIdForProduct(SANDBOX_CATALOG, "unknown-product")).toBeUndefined();
  });

  it("adds extra seats on top of the bundle and clamps to the ceiling", () => {
    expect(seatsForPlan("syndicate", 0)).toBe(5);
    expect(seatsForPlan("syndicate", 3)).toBe(8);
    expect(seatsForPlan("syndicate", 100)).toBe(25);
    expect(seatsForPlan("angel", 4)).toBe(1);
    expect(seatsForPlan("institution", 30)).toBe(50);
  });

  it("never lets the ceiling fall below the plan bundle", () => {
    expect(seatCeiling(planById("syndicate"), 1)).toBe(5);
    expect(seatCeiling(planById("syndicate"), 12)).toBe(12);
    expect(seatCeiling(planById("angel"), 9)).toBe(1);
    expect(seatCeiling(planById("institution"), 20)).toBe(Number.POSITIVE_INFINITY);
  });

  it("recognises extra-seat checkouts from metadata", () => {
    expect(isExtraSeatMetadata({ kind: "extra_seat" })).toBe(true);
    expect(isExtraSeatMetadata({ plan: "syndicate" })).toBe(false);
  });
});

const seatProduct = SANDBOX_CATALOG.products.extra_seat!;

describe("extra-seat webhook events", () => {
  it("adds seats without touching the plan or the main subscription link", () => {
    const decision = mappingDecision(
      {
        type: "subscription.active",
        data: {
          id: "sub_seats_1",
          status: "active",
          product_id: seatProduct,
          quantity: 3,
          customer: { id: "cus_1", external_id: "user-1" },
        },
      },
      SANDBOX_CATALOG,
    );
    expect(decision.extraSeat).toBe(true);
    expect(decision.extraSeatQuantity).toBe(3);
    expect(decision.row["plan"]).toBeUndefined();
    expect(decision.row["polar_subscription_id"]).toBeUndefined();
    expect(decision.row["polar_customer_id"]).toBe("cus_1");
  });

  it("marks revoked extra-seat subscriptions as seat removals", () => {
    const decision = mappingDecision(
      {
        type: "subscription.revoked",
        data: {
          id: "sub_seats_1",
          status: "canceled",
          product_id: seatProduct,
          quantity: 2,
          customer: { id: "cus_1", external_id: "user-1" },
        },
      },
      SANDBOX_CATALOG,
    );
    expect(decision.extraSeat).toBe(true);
    expect(decision.revoked).toBe(true);
    expect(decision.row["plan"]).toBeUndefined();
  });

  // Seat-based products report their count in `seats`; `quantity` stays empty.
  // Reading only `quantity` would silently bill N seats but grant 1.
  it("reads the seat count from a seat-based subscription payload", () => {
    const decision = mappingDecision(
      {
        type: "subscription.active",
        data: {
          id: "sub_seats_2",
          status: "active",
          product_id: seatProduct,
          seats: 4,
          customer: { id: "cus_1", external_id: "user-1" },
          metadata: { kind: "extra_seat", quantity: "4", user_id: "user-1" },
        },
      },
      SANDBOX_CATALOG,
    );
    expect(decision.extraSeat).toBe(true);
    expect(decision.extraSeatQuantity).toBe(4);
    expect(decision.row["plan"]).toBeUndefined();
  });

  it("falls back to metadata quantity when the payload carries no seat field", () => {
    const decision = mappingDecision(
      {
        type: "subscription.active",
        data: {
          id: "sub_seats_3",
          status: "active",
          product_id: seatProduct,
          customer: { id: "cus_1", external_id: "user-1" },
          metadata: { kind: "extra_seat", quantity: "6", user_id: "user-1" },
        },
      },
      SANDBOX_CATALOG,
    );
    expect(decision.extraSeatQuantity).toBe(6);
  });

  it("still maps plan purchases normally", () => {
    const decision = mappingDecision(
      {
        type: "subscription.active",
        data: {
          id: "sub_plan_1",
          status: "active",
          product_id: SANDBOX_CATALOG.products.syndicate,
          customer: { id: "cus_2", external_id: "user-2" },
        },
      },
      SANDBOX_CATALOG,
    );
    expect(decision.extraSeat).toBe(false);
    expect(decision.row["plan"]).toBe("syndicate");
    expect(decision.row["seats"]).toBe(5);
    expect(decision.row["polar_subscription_id"]).toBe("sub_plan_1");
  });
});

describe("screening quota", () => {
  const FIXED_NOW = Date.parse("2026-08-22T00:00:00Z");
  const future = new Date(FIXED_NOW + 86_400_000).toISOString();
  const past = new Date(FIXED_NOW - 86_400_000).toISOString();

  it("reads the quota off the plan catalogue", () => {
    expect(screeningQuotaForPlan("angel")).toBe(150);
    expect(screeningQuotaForPlan("syndicate")).toBe(750);
    expect(screeningQuotaForPlan("institution")).toBeNull();
  });

  it("gives an unknown or missing plan the trial allowance, never unlimited", () => {
    expect(screeningQuotaForPlan("angel_trial")).toBe(10);
    expect(screeningQuotaForPlan(undefined)).toBe(10);
    expect(screeningQuotaForPlan("typo_plan")).toBe(10);
  });

  it("allows a paid account under its quota", () => {
    const verdict = screeningAllowed({ plan: "angel", status: "active", used: 149 });
    expect(verdict.allowed).toBe(true);
    if (verdict.allowed) expect(verdict.remaining).toBe(1);
  });

  it("refuses once the quota is spent", () => {
    const verdict = screeningAllowed({ plan: "angel", status: "active", used: 150 });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("quota-exceeded");
  });

  it("never refuses an unlimited plan", () => {
    const verdict = screeningAllowed({ plan: "institution", status: "active", used: 99_999 });
    expect(verdict.allowed).toBe(true);
    if (verdict.allowed) expect(verdict.quota).toBeNull();
  });

  it("refuses an account with no access", () => {
    const verdict = screeningAllowed({ plan: "angel", status: "canceled", used: 0 });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("no-access");
  });

  it("allows a trial that is still inside its period", () => {
    const verdict = screeningAllowed({
      plan: "angel_trial",
      status: "trialing",
      used: 0,
      periodEnd: future,
      now: FIXED_NOW,
    });
    expect(verdict.allowed).toBe(true);
  });

  it("refuses a trial whose period has elapsed even though hasAccess still says yes", () => {
    expect(hasAccess("angel_trial", "trialing")).toBe(true);
    const verdict = screeningAllowed({
      plan: "angel_trial",
      status: "trialing",
      used: 0,
      periodEnd: past,
      now: FIXED_NOW,
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("trial-expired");
  });

  it("treats a missing period end as not elapsed", () => {
    expect(periodElapsed(null, FIXED_NOW)).toBe(false);
    expect(periodElapsed(past, FIXED_NOW)).toBe(true);
    expect(periodElapsed(future, FIXED_NOW)).toBe(false);
  });
});
