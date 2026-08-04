import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "standardwebhooks";
import { planById, planIdFromPolarProduct } from "@/lib/plans";

type PolarEvent = {
  type: string;
  data: Record<string, unknown>;
};

/** Maps a Polar subscription payload onto our subscriptions row. */
export function subscriptionUpdateFromEvent(event: PolarEvent) {
  const d = event.data as {
    id?: string;
    status?: string;
    product_id?: string;
    product?: { id?: string } | null;
    current_period_end?: string | null;
    customer?: { id?: string; external_id?: string | null } | null;
    metadata?: Record<string, string> | null;
  };
  const userId = d.customer?.external_id ?? d.metadata?.["user_id"] ?? null;
  if (!userId) return null;

  const productId = d.product_id ?? d.product?.id ?? null;
  // Product id first; checkout metadata is the fallback when the product isn't
  // mapped (e.g. a sandbox product id we don't know about).
  const metaPlan = d.metadata?.["plan"];
  const planId =
    planIdFromPolarProduct(productId) ?? (metaPlan && planById(metaPlan) ? metaPlan : undefined);
  const revoked = event.type === "subscription.revoked" || event.type === "subscription.canceled";
  const metaSeats = d.metadata?.["seats"] ? Number(d.metadata["seats"]) : undefined;
  // Fall back to the seats bundled with the plan so a plan upgrade always
  // carries its seat allowance onto the app row.
  const seats =
    metaSeats && Number.isFinite(metaSeats)
      ? metaSeats
      : planId && !revoked
        ? planById(planId)?.seatsIncluded
        : undefined;

  return {
    userId,
    row: {
      ...(planId && !revoked ? { plan: planId } : {}),
      ...(revoked ? { plan: "trial", status: "canceled", seats: 1 } : { status: d.status ?? "active" }),
      ...(!revoked && seats ? { seats } : {}),
      polar_subscription_id: d.id ?? null,
      polar_product_id: productId,
      polar_customer_id: d.customer?.id ?? null,
      current_period_end: d.current_period_end ?? null,
    },
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

        let event: PolarEvent;
        try {
          const wh = new Webhook(Buffer.from(secret).toString("base64"));
          event = wh.verify(body, headers) as PolarEvent;
        } catch (error) {
          console.error("Polar webhook verification failed", error);
          return new Response("Invalid signature", { status: 401 });
        }

        if (!event.type?.startsWith("subscription.")) return new Response("ok");

        const update = subscriptionUpdateFromEvent(event);
        if (!update) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update(update.row)
          .eq("user_id", update.userId);
        if (error) {
          console.error("Failed to apply Polar subscription update", error.message);
          return new Response("Update failed", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});
