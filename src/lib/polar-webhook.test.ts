import { describe, expect, it } from "vitest";
import { subscriptionUpdateFromEvent } from "@/routes/api/public/polar-webhook";
import { SANDBOX_CATALOG } from "@/lib/test-catalog";

const syndicateProduct = SANDBOX_CATALOG.products.syndicate!;

describe("polar subscription webhook mapping", () => {
  it("activates the matching plan for the external customer", () => {
    const update = subscriptionUpdateFromEvent(
      {
        type: "subscription.active",
        data: {
          id: "sub_1",
          status: "active",
          product_id: syndicateProduct,
          current_period_end: "2026-09-01T00:00:00Z",
          customer: { id: "cus_1", external_id: "user-123" },
          metadata: { seats: "8" },
        },
      },
      SANDBOX_CATALOG,
    );
    expect(update).not.toBeNull();
    expect(update!.userId).toBe("user-123");
    expect(update!.row["plan"]).toBe("syndicate");
    expect(update!.row["status"]).toBe("active");
    expect(update!.row["seats"]).toBe(8);
    expect(update!.row["polar_subscription_id"]).toBe("sub_1");
    expect(update!.row["polar_customer_id"]).toBe("cus_1");
  });

  it("downgrades to trial when the subscription is revoked", () => {
    const update = subscriptionUpdateFromEvent(
      {
        type: "subscription.revoked",
        data: {
          id: "sub_1",
          status: "revoked",
          product_id: syndicateProduct,
          customer: { id: "cus_1", external_id: "user-123" },
        },
      },
      SANDBOX_CATALOG,
    );
    expect(update!.row["plan"]).toBe("angel_trial");
    expect(update!.row["status"]).toBe("canceled");
  });

  it("falls back to metadata for the user id", () => {
    const update = subscriptionUpdateFromEvent(
      {
        type: "subscription.created",
        data: { id: "sub_2", status: "active", metadata: { user_id: "user-999" } },
      },
      SANDBOX_CATALOG,
    );
    expect(update!.userId).toBe("user-999");
  });

  it("ignores events with no resolvable customer", () => {
    expect(
      subscriptionUpdateFromEvent(
        { type: "subscription.created", data: { id: "sub_3" } },
        SANDBOX_CATALOG,
      ),
    ).toBeNull();
  });

  it("does not trust a seats value that is not a number", () => {
    const update = subscriptionUpdateFromEvent(
      {
        type: "subscription.active",
        data: { id: "s", status: "active", metadata: { user_id: "u", seats: "lots" } },
      },
      SANDBOX_CATALOG,
    );
    expect(update!.row["seats"]).toBeUndefined();
  });
});
