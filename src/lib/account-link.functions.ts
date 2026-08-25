import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { appStatusFor, expectedPlan } from "@/lib/reconcile";

const emailInput = z.object({ email: z.string().email().max(320) });

export type SignupCheck = {
  /** What the auth screen should do with this email. */
  action: "signup" | "signin" | "reset";
  hasAppAccount: boolean;
  hasPolarAccount: boolean;
  plan: string | null;
  message: string;
};

/**
 * Email is the primary key across Polar and the app. Before letting anyone
 * sign up we check both sides: billing that already exists must be claimed by
 * signing in / resetting the password, never by creating a second account.
 */
export const checkEmailForSignup = createServerFn({ method: "POST" })
  .validator((data: unknown) => emailInput.parse(data))
  .handler(async ({ data }): Promise<SignupCheck> => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (profile) {
      return {
        action: "signin",
        hasAppAccount: true,
        hasPolarAccount: false,
        plan: null,
        message: "An account already exists for this email. Sign in instead.",
      };
    }

    const { polarCatalog } = await import("@/server/polarCatalog");

    let subscription = null;
    try {
      const { findSubscriptionByEmail } = await import("@/lib/polar.server");
      subscription = await findSubscriptionByEmail(email);
    } catch {
      // Billing lookup unavailable — fall through to a normal signup.
      subscription = null;
    }

    if (!subscription) {
      return {
        action: "signup",
        hasAppAccount: false,
        hasPolarAccount: false,
        plan: null,
        message: "",
      };
    }

    const plan = expectedPlan(
      {
        id: subscription.id,
        status: subscription.status,
        productId: subscription.product_id ?? subscription.product?.id ?? null,
        productName: subscription.product?.name ?? null,
        customerId: subscription.customer?.id ?? null,
        externalCustomerId: subscription.customer?.external_id ?? null,
        email,
        currentPeriodEnd: subscription.current_period_end ?? null,
        seats: null,
      },
      polarCatalog(),
    );

    return {
      action: "reset",
      hasAppAccount: false,
      hasPolarAccount: true,
      plan,
      message:
        "This email already has a subscription with us. Set a password to claim your account — don't create a new one.",
    };
  });

/**
 * Pulls the signed-in user's Polar subscription (matched on their email) into
 * their app subscription row. Runs automatically when billing is viewed, so a
 * subscription bought before the account existed still lands on the account.
 */
export const syncMySubscriptionFromPolar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string } | null)?.email;
    if (!email) return { linked: false, reason: "no-email" as const };

    const { findSubscriptionByEmail } = await import("@/lib/polar.server");
    const { polarCatalog } = await import("@/server/polarCatalog");
    const sub = await findSubscriptionByEmail(email);
    if (!sub) return { linked: false, reason: "no-polar-subscription" as const };

    const productId = sub.product_id ?? sub.product?.id ?? null;
    const plan = expectedPlan(
      {
        id: sub.id,
        status: sub.status,
        productId,
        productName: sub.product?.name ?? null,
        customerId: sub.customer?.id ?? null,
        externalCustomerId: sub.customer?.external_id ?? null,
        email,
        currentPeriodEnd: sub.current_period_end ?? null,
        seats: null,
      },
      polarCatalog(),
    );

    const patch: Record<string, string | number | null> = {
      polar_subscription_id: sub.id,
      polar_customer_id: sub.customer?.id ?? null,
      polar_product_id: productId,
      status: appStatusFor(sub.status),
      current_period_end: sub.current_period_end ?? null,
    };
    if (plan) patch["plan"] = plan;
    const metaSeats = Number(sub.metadata?.["seats"] ?? "");
    if (Number.isFinite(metaSeats) && metaSeats > 0) {
      patch["seats"] = metaSeats;
    } else if (plan) {
      const { planById } = await import("@/lib/plans");
      const seats = planById(plan)?.seatsIncluded;
      if (seats) patch["seats"] = seats;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(patch as never)
      .eq("user_id", context.userId);
    if (error) throw error;

    return { linked: true, plan, status: patch["status"] as string };
  });
