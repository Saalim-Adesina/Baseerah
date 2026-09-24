import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Developer gate. Runs on the caller's own RLS-bound client, so the check is
 * against their identity and cannot be spoofed by the request body.
 */
async function assertDeveloper(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "developer",
  });
  if (error || !data) throw new Error("Forbidden — developer access required.");
}

/**
 * PostgREST reads `,` `(` `)` and `.` as structure inside an `or=` filter, so a raw search
 * term interpolated into the filter string can change the query. Double-quoting the value
 * makes PostgREST treat it as a literal; inside those quotes only `\` and `"` are special,
 * and both are escaped with a backslash. `%` stays unescaped so the match is still a
 * substring (ilike) search, exactly as before.
 */
function pgrestQuotedLike(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

/** Recent Polar webhook deliveries with their mapping decisions and results. */
export const listWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        outcome: z.string().max(30).optional(),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertDeveloper(context);
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
      const term = pgrestQuotedLike(data.search.trim());
      query = query.or(
        `matched_email.ilike.${term},polar_subscription_id.ilike.${term},polar_customer_id.ilike.${term},event_type.ilike.${term}`,
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
