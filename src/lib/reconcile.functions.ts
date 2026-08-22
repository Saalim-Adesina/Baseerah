import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reconcile, type AppSubRow, type PolarSubRecord } from "@/lib/reconcile";

async function assertDeveloper(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "developer",
  });
  if (error || !data) throw new Error("Forbidden — developer access required.");
}

async function loadReport() {
  const { listAllSubscriptions, polarServer } = await import("@/lib/polar.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [subs, subsRows, profiles] = await Promise.all([
    listAllSubscriptions(),
    supabaseAdmin.from("subscriptions").select("*"),
    supabaseAdmin.from("profiles").select("id, email"),
  ]);
  if (subsRows.error) throw subsRows.error;
  if (profiles.error) throw profiles.error;

  const emailByUser = new Map((profiles.data ?? []).map((p: any) => [p.id, p.email]));

  const appRows: AppSubRow[] = (subsRows.data ?? []).map((r: any) => ({
    userId: r.user_id,
    email: emailByUser.get(r.user_id) ?? null,
    plan: r.plan,
    status: r.status,
    seats: r.seats,
    polarCustomerId: r.polar_customer_id,
    polarSubscriptionId: r.polar_subscription_id,
    polarProductId: r.polar_product_id,
    currentPeriodEnd: r.current_period_end,
  }));

  const polarSubs: PolarSubRecord[] = subs.map((s) => ({
    id: s.id,
    status: s.status,
    productId: s.product_id ?? s.product?.id ?? null,
    productName: s.product?.name ?? null,
    customerId: s.customer?.id ?? null,
    externalCustomerId: s.customer?.external_id ?? s.metadata?.["user_id"] ?? null,
    email: s.customer?.email ?? null,
    currentPeriodEnd: s.current_period_end ?? null,
    seats: s.metadata?.["seats"] ? Number(s.metadata["seats"]) : null,
  }));

  return reconcile(polarSubs, appRows, polarServer());
}

/** Compares every Polar subscription against the app's subscriptions table. */
export const runReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeveloper(context as any);
    return loadReport();
  });

/** Applies the suggested fix for one reconciliation item. */
export const applyReconciliationFix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ key: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as any);
    const report = await loadReport();
    const item = report.items.find((i) => i.key === data.key);
    if (!item?.fix || !item.app) throw new Error("Nothing to repair for this entry.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(item.fix as never)
      .eq("user_id", item.app.userId);
    if (error) throw error;
    return { repaired: item.key, applied: item.fix };
  });

/** True when the signed-in user may view billing reconciliation. */
export const isBillingAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context as any).supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "developer",
    });
    return { admin: !!data };
  });
