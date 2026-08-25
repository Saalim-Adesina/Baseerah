import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXTRA_SEAT_PRODUCT_ID, PLANS, planById } from "@/lib/plans";

const checkoutInput = z.object({
  planId: z.enum(["angel", "syndicate", "institution"]),
  origin: z.string().url(),
});

const extraSeatInput = z.object({
  seats: z.number().int().min(1).max(100),
  origin: z.string().url(),
});

/** Starts a Polar checkout for the signed-in user and returns the hosted URL. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => checkoutInput.parse(data))
  .handler(async ({ data, context }) => {
    const plan = PLANS.find((p) => p.id === data.planId);
    if (!plan) throw new Error("Unknown plan.");

    const { createCheckoutSession, resolveProductId } = await import("@/lib/polar.server");
    const productId = resolveProductId(plan.id, plan.polarProductId);
    if (!productId) throw new Error("This plan is not purchasable online.");

    const checkout = await createCheckoutSession({
      productId,
      externalCustomerId: context.userId,
      customerEmail: (context.claims as { email?: string } | null)?.email ?? null,
      successUrl: `${data.origin}/billing?checkout_id={CHECKOUT_ID}`,
      metadata: {
        plan: plan.id,
        seats: String(plan.seatsIncluded),
        user_id: context.userId,
      },
    });
    return { url: checkout.url, id: checkout.id };
  });

/**
 * Buys seats beyond the plan's bundle. This is a standalone seat-based
 * subscription, so it must never carry plan metadata — the webhook keys off
 * `kind: "extra_seat"` to add seats without touching the account's plan.
 */
export const startExtraSeatCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => extraSeatInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("subscriptions")
      .select("plan, seats")
      .eq("user_id", context.userId)
      .maybeSingle();

    const current = row as { plan?: string; seats?: number } | null;
    const plan = planById(current?.plan);
    if (!plan) throw new Error("Start a paid plan before buying extra seats.");
    if (plan.extraSeatCents === null) {
      throw new Error(`The ${plan.name} plan does not sell extra seats.`);
    }

    // The ceiling is enforced here, not in the browser — same rule as
    // assignSeat, so a purchase can never buy past the plan's hard cap.
    const currentSeats = current?.seats ?? plan.seatsIncluded;
    const nextSeats = currentSeats + data.seats;
    if (plan.maxSeats !== null && nextSeats > plan.maxSeats) {
      throw new Error(
        `The ${plan.name} plan is capped at ${plan.maxSeats} seats. You have ${currentSeats}.`,
      );
    }

    const { createCheckoutSession, resolveProductId } = await import("@/lib/polar.server");
    const productId = resolveProductId("extra_seat", EXTRA_SEAT_PRODUCT_ID);
    if (!productId) throw new Error("Extra seats are not purchasable right now.");

    const checkout = await createCheckoutSession({
      productId,
      externalCustomerId: context.userId,
      customerEmail: (context.claims as { email?: string } | null)?.email ?? null,
      successUrl: `${data.origin}/billing?checkout_id={CHECKOUT_ID}`,
      seats: data.seats,
      // `quantity` is duplicated into metadata because the webhook's seat count
      // falls back to it when the subscription payload omits a seat field.
      metadata: {
        kind: "extra_seat",
        quantity: String(data.seats),
        user_id: context.userId,
      },
    });
    return { url: checkout.url, id: checkout.id, seats: data.seats };
  });

/** Verifies a completed checkout after the redirect back from Polar. */
export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ checkoutId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { getCheckoutSession } = await import("@/lib/polar.server");
    const checkout = await getCheckoutSession(data.checkoutId);
    return { status: checkout.status };
  });

/** Opens the Polar customer portal for the signed-in user. */
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { createPortalSession } = await import("@/lib/polar.server");
    const { data: row } = await context.supabase
      .from("subscriptions")
      .select("polar_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const email =
      (context.claims as { email?: string } | undefined)?.email ??
      (
        await context.supabase
          .from("profiles")
          .select("email")
          .eq("id", context.userId)
          .maybeSingle()
      ).data?.email ??
      null;
    const session = await createPortalSession(
      context.userId,
      row?.polar_customer_id ?? null,
      email,
    );
    return { url: session.customer_portal_url };
  });
