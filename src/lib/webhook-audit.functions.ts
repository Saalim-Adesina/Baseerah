import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WebhookAuditRow = {
  id: string;
  received_at: string;
  event_id: string | null;
  event_type: string;
  signature_valid: boolean;
  polar_subscription_id: string | null;
  polar_customer_id: string | null;
  external_customer_id: string | null;
  polar_product_id: string | null;
  matched_user_id: string | null;
  matched_email: string | null;
  mapped_plan: string | null;
  mapped_seats: number | null;
  mapping_source: string | null;
  outcome: string;
  notes: string | null;
  applied_row: Record<string, string | number | boolean | null> | null;
};

async function assertDeveloper(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "developer",
  });
  if (error || !data) throw new Error("Forbidden — developer access required.");
}

/** Recent Polar webhook deliveries with their mapping decisions and results. */
export const listWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        outcome: z.string().max(30).optional(),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("billing_webhook_events")
      .select(
        "id,received_at,event_id,event_type,signature_valid,polar_subscription_id,polar_customer_id,external_customer_id,polar_product_id,matched_user_id,matched_email,mapped_plan,mapped_seats,mapping_source,outcome,notes,applied_row",
      )
      .order("received_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.outcome && data.outcome !== "all") query = query.eq("outcome", data.outcome);
    if (data.search) {
      const s = data.search.trim();
      query = query.or(
        `matched_email.ilike.%${s}%,polar_subscription_id.ilike.%${s}%,polar_customer_id.ilike.%${s}%,event_type.ilike.%${s}%`,
      );
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const events = (rows ?? []) as unknown as WebhookAuditRow[];
    const summary = {
      total: events.length,
      applied: events.filter((e) => e.outcome === "applied").length,
      unmatched: events.filter((e) => e.outcome === "unmatched").length,
      failed: events.filter((e) => e.outcome === "error" || e.outcome === "rejected").length,
      unmappedProduct: events.filter((e) => e.mapping_source === "none").length,
    };
    return { events, summary };
  });
