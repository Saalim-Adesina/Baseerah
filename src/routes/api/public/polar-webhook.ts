import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "standardwebhooks";
import { planById } from "@/lib/plans";
import {
  appStatusFor,
  enforceTrialPolicy,
  isExtraSeatMetadata,
  isExtraSeatProduct,
  planForProduct,
  seatsForPlan,
} from "@/lib/billing-rules";

type PolarEvent = {
  type: string;
  data: Record<string, unknown>;
};

export type MappingDecision = {
  userId: string | null;
  planId?: string;
  seats?: number;
  mappingSource: "product_id" | "metadata" | "none";
  productId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  externalCustomerId: string | null;
  revoked: boolean;
  /** Extra-seat purchases only add seats; they never change the plan. */
  extraSeat: boolean;
  /** Seats bought on an extra-seat subscription. */
  extraSeatQuantity: number;
  row: Record<string, unknown>;
  notes: string;
};

/** Maps a Polar subscription payload onto our subscriptions row. */
export function subscriptionUpdateFromEvent(event: PolarEvent) {
  const decision = mappingDecision(event);
  if (!decision.userId) return null;
  return { userId: decision.userId, row: decision.row };
}

/** Full, auditable version of the mapping: why we chose a plan and seats. */
export function mappingDecision(event: PolarEvent): MappingDecision {
  const d = event.data as {
    id?: string;
    status?: string;
    quantity?: number;
    product_id?: string;
    product?: { id?: string } | null;
    current_period_end?: string | null;
    customer?: { id?: string; external_id?: string | null } | null;
    metadata?: Record<string, string> | null;
  };
  const userId = d.customer?.external_id ?? d.metadata?.["user_id"] ?? null;

  const productId = d.product_id ?? d.product?.id ?? null;
  // Product id first; checkout metadata is the fallback when the product isn't
  // mapped (e.g. a sandbox product id we don't know about).
  const fromProduct = planForProduct(productId);
  const metaPlan = d.metadata?.["plan"];
  const fromMeta = metaPlan && planById(metaPlan) ? metaPlan : undefined;
  const planId = fromProduct ?? fromMeta;
  const mappingSource: MappingDecision["mappingSource"] = fromProduct
    ? "product_id"
    : fromMeta
      ? "metadata"
      : "none";

  const revoked = event.type === "subscription.revoked" || event.type === "subscription.canceled";
  const metaSeats = d.metadata?.["seats"] ? Number(d.metadata["seats"]) : undefined;
  const seats =
    metaSeats && Number.isFinite(metaSeats)
      ? metaSeats
      : planId && !revoked
        ? planById(planId)?.seatsIncluded
        : undefined;

  // Standalone extra-seat subscriptions must not clobber the account's plan or
  // its main subscription link — they only move the seat count.
  const extraSeat = isExtraSeatProduct(productId) || isExtraSeatMetadata(d.metadata);
  const extraSeatQuantity = Math.max(
    Number(d.quantity ?? d.metadata?.["quantity"] ?? metaSeats ?? 1) || 1,
    1,
  );

  if (extraSeat) {
    return {
      userId,
      seats: extraSeatQuantity,
      mappingSource: "product_id",
      productId,
      subscriptionId: d.id ?? null,
      customerId: d.customer?.id ?? null,
      externalCustomerId: d.customer?.external_id ?? null,
      revoked,
      extraSeat: true,
      extraSeatQuantity,
      // Seats are resolved against the live row in the handler.
      row: { polar_customer_id: d.customer?.id ?? null },
      notes: revoked
        ? `Extra-seat subscription ended — ${extraSeatQuantity} seat(s) removed. Plan untouched.`
        : `Extra-seat purchase of ${extraSeatQuantity} seat(s). Plan and main subscription link untouched.`,
    };
  }

  const row = {
    ...(planId && !revoked ? { plan: planId } : {}),
    ...(revoked
      ? { plan: "trial", status: "canceled", seats: 1 }
      : // Trials are Angel-only: a trialing Syndicate/Institutional
        // subscription stays canceled until the payment lands.
        { status: enforceTrialPolicy(planId, appStatusFor(d.status)) }),
    ...(!revoked && seats ? { seats } : {}),

    polar_subscription_id: d.id ?? null,
    polar_product_id: productId,
    polar_customer_id: d.customer?.id ?? null,
    current_period_end: d.current_period_end ?? null,
  };

  const notes = !userId
    ? "No external customer id or user_id metadata on the payload — could not match an account."
    : revoked
      ? "Subscription ended — account reset to trial with 1 seat."
      : mappingSource === "product_id"
        ? `Product ${productId} mapped to the ${planId} plan.`
        : mappingSource === "metadata"
          ? `Product ${productId ?? "—"} is unmapped; used checkout metadata plan "${metaPlan}".`
          : "No plan could be resolved — only status and Polar ids were written.";

  return {
    userId,
    ...(planId ? { planId } : {}),
    ...(seats ? { seats } : {}),
    mappingSource,
    productId,
    subscriptionId: d.id ?? null,
    customerId: d.customer?.id ?? null,
    externalCustomerId: d.customer?.external_id ?? null,
    revoked,
    extraSeat: false,
    extraSeatQuantity: 0,
    row,
    notes,
  };
}



export const Route = createFileRoute("/api/public/polar-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { polarWebhookSecret } = await import("@/lib/polar.server");
        const secret = polarWebhookSecret();
        if (!secret) return new Response("Not configured", { status: 500 });

        const body = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((v, k) => (headers[k] = v));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const log = async (row: Record<string, unknown>) => {
          try {
            await supabaseAdmin.from("billing_webhook_events").insert(row as never);
          } catch (error) {
            console.error("Failed to write webhook audit row", error);
          }
        };

        let event: PolarEvent;
        try {
          const wh = new Webhook(Buffer.from(secret).toString("base64"));
          event = wh.verify(body, headers) as PolarEvent;
        } catch (error) {
          console.error("Polar webhook verification failed", error);
          await log({
            event_type: "unknown",
            signature_valid: false,
            outcome: "rejected",
            notes: "Signature verification failed — payload was not trusted or applied.",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        const eventId = (event.data?.["id"] as string | undefined) ?? null;

        if (!event.type?.startsWith("subscription.")) {
          await log({
            event_id: eventId,
            event_type: event.type ?? "unknown",
            outcome: "ignored",
            notes: "Not a subscription event — no account changes applied.",
            payload: event.data ?? null,
          });
          return new Response("ok");
        }

        const decision = mappingDecision(event);

        const base = {
          event_id: eventId,
          event_type: event.type,
          signature_valid: true,
          polar_subscription_id: decision.subscriptionId,
          polar_customer_id: decision.customerId,
          external_customer_id: decision.externalCustomerId,
          polar_product_id: decision.productId,
          matched_user_id: decision.userId,
          mapped_plan: decision.planId ?? null,
          mapped_seats: decision.seats ?? null,
          mapping_source: decision.mappingSource,
          payload: event.data ?? null,
        };

        if (!decision.userId) {
          await log({ ...base, outcome: "unmatched", notes: decision.notes });
          return new Response("ok");
        }

        let matchedEmail: string | null = null;
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", decision.userId)
          .maybeSingle();
        matchedEmail = (profile as { email?: string } | null)?.email ?? null;

        // Extra-seat subscriptions add to (or remove from) the seat count on
        // top of the plan bundle, leaving plan and links alone.
        let appliedRow: Record<string, unknown> = decision.row;
        if (decision.extraSeat) {
          const { data: current } = await supabaseAdmin
            .from("subscriptions")
            .select("plan, seats")
            .eq("user_id", decision.userId)
            .maybeSingle();
          const plan = (current as { plan?: string } | null)?.plan ?? "trial";
          const currentSeats = (current as { seats?: number } | null)?.seats ?? 1;
          const bundled = planById(plan)?.seatsIncluded ?? 1;
          const extraNow = Math.max(currentSeats - bundled, 0);
          const nextExtra = decision.revoked
            ? Math.max(extraNow - decision.extraSeatQuantity, 0)
            : extraNow + decision.extraSeatQuantity;
          appliedRow = {
            ...decision.row,
            seats: seatsForPlan(plan, nextExtra),
          };
        }

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update(appliedRow as never)
          .eq("user_id", decision.userId);


        if (error) {
          console.error("Failed to apply Polar subscription update", error.message);
          await log({
            ...base,
            matched_email: matchedEmail,
            outcome: "error",
            notes: `${decision.notes} Update failed: ${error.message}`,
            applied_row: appliedRow,
          });
          return new Response("Update failed", { status: 500 });
        }

        await log({
          ...base,
          matched_email: matchedEmail,
          outcome: "applied",
          notes: decision.notes,
          applied_row: appliedRow,
        });
        return new Response("ok");
      },
    },
  },
});
