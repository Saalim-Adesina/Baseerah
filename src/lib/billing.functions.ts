import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXTRA_SEAT_PRODUCT_ID, PLANS } from "@/lib/plans";

const checkoutInput = z.object({
  planId: z.enum(["angel", "syndicate", "institution"]),
  origin: z.string().url(),
  extraSeats: z.number().int().min(0).max(500).optional(),
});

/** Starts a Polar checkout for the signed-in user and returns the hosted URL. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => checkoutInput.parse(data))
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
        seats: String(Math.max(plan.seatsIncluded, plan.seatsIncluded + (data.extraSeats ?? 0))),
        user_id: context.userId,
      },
    });
    return { url: checkout.url, id: checkout.id };
  });

/** Adds paid seats beyond the plan bundle through a separate seat subscription. */
export const startSeatCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ origin: z.string().url(), seats: z.number().int().min(1).max(100) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { createCheckoutSession, resolveProductId } = await import("@/lib/polar.server");
    const checkout = await createCheckoutSession({
      productId: resolveProductId("extra_seat", EXTRA_SEAT_PRODUCT_ID)!,
      externalCustomerId: context.userId,
      successUrl: `${data.origin}/billing?checkout_id={CHECKOUT_ID}`,
      metadata: { kind: "extra_seat", seats: String(data.seats), user_id: context.userId },
    });
    return { url: checkout.url, id: checkout.id };
  });

/** Verifies a completed checkout after the redirect back from Polar. */
export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ checkoutId: z.string().min(1) }).parse(data))
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
