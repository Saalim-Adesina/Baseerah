import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planById } from "@/lib/plans";
import {
  APP_PLANS,
  APP_STATUSES,
  normalizeEmail,
  seatCeiling,
  seatsForPlan,
  trialAllowedForPlan,
} from "@/lib/billing-rules";

export type OrgRow = {
  userId: string;
  email: string | null;
  fullName: string | null;
  firmName: string | null;
  investorType: string;
  plan: string;
  status: string;
  seats: number;
  seatsUsed: number;
  ceiling: number | null;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  polarProductId: string | null;
  currentPeriodEnd: string | null;
  manualOverrideAt: string | null;
  overrideReason: string | null;
  /** Rule violations detected on the row, e.g. more seats used than allowed. */
  warnings: string[];
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden — superadmin access required.");
}

async function audit(row: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    await supabaseAdmin.from("billing_webhook_events").insert(row as never);
  } catch (error) {
    console.error("Failed to write admin audit row", error);
  }
}

async function buildOrgs(): Promise<OrgRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [profiles, subs, members] = await Promise.all([
    supabaseAdmin.from("profiles").select("id,email,full_name,firm_name,investor_type"),
    supabaseAdmin.from("subscriptions").select("*"),
    supabaseAdmin.from("team_members").select("owner_id"),
  ]);
  if (profiles.error) throw profiles.error;
  if (subs.error) throw subs.error;
  if (members.error) throw members.error;

  const seatCounts = new Map<string, number>();
  for (const m of (members.data ?? []) as any[]) {
    seatCounts.set(m.owner_id, (seatCounts.get(m.owner_id) ?? 0) + 1);
  }
  const subByUser = new Map((subs.data ?? []).map((s: any) => [s.user_id, s]));

  return ((profiles.data ?? []) as any[]).map((p) => {
    const s = subByUser.get(p.id) ?? {};
    const plan = s.plan ?? "angel_trial";
    const paidSeats = s.seats ?? 1;
    const used = seatCounts.get(p.id) ?? 0;
    const rawCeiling = seatCeiling(planById(plan), paidSeats);
    const ceiling = Number.isFinite(rawCeiling) ? (rawCeiling as number) : null;

    const warnings: string[] = [];
    if (used === 0) warnings.push("No owner seat row — the owner's admin seat is missing.");
    if (ceiling !== null && used > ceiling)
      warnings.push(`${used} seats assigned but the plan allows ${ceiling}.`);
    if (plan !== "angel_trial" && !s.polar_subscription_id)
      warnings.push("Paid plan with no Polar subscription linked.");
    if (!s.polar_customer_id)
      warnings.push(
        "No Polar account linked — every account must exist in Polar, even on an Angel Trial.",
      );
    if ((s.status ?? "trialing") === "trialing" && plan !== "angel_trial" && plan !== "angel")
      warnings.push(
        `Trialing on the ${plan} plan — trials are Angel-only, this account must pay in full before access.`,
      );

    return {
      userId: p.id,
      email: normalizeEmail(p.email),
      fullName: p.full_name ?? null,
      firmName: p.firm_name ?? null,
      investorType: p.investor_type,
      plan,
      status: s.status ?? "trialing",
      seats: paidSeats,
      seatsUsed: used,
      ceiling,
      polarCustomerId: s.polar_customer_id ?? null,
      polarSubscriptionId: s.polar_subscription_id ?? null,
      polarProductId: s.polar_product_id ?? null,
      currentPeriodEnd: s.current_period_end ?? null,
      manualOverrideAt: s.manual_override_at ?? null,
      overrideReason: s.override_reason ?? null,
      warnings,
    } satisfies OrgRow;
  });
}

/** Every account with its plan, seats and rule violations. Admin only. */
export const listOrganizations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const orgs = await buildOrgs();
    orgs.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    return {
      orgs,
      summary: {
        total: orgs.length,
        paid: orgs.filter((o) => o.plan !== "trial").length,
        withWarnings: orgs.filter((o) => o.warnings.length > 0).length,
        withoutPolar: orgs.filter((o) => !o.polarCustomerId).length,
        seatsAssigned: orgs.reduce((n, o) => n + o.seatsUsed, 0),
      },
    };
  });

/**
 * Superadmin edit of an account's subscription. The same rules apply as the
 * webhook path: seats can never drop below the plan bundle or exceed its
 * ceiling, and every edit is stamped and written to the billing audit log.
 */
export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        plan: z.enum(APP_PLANS),
        status: z.enum(APP_STATUSES),
        seats: z.number().int().min(1).max(1000),
        polarCustomerId: z.string().trim().max(100).nullable().optional(),
        polarSubscriptionId: z.string().trim().max(100).nullable().optional(),
        reason: z.string().trim().min(3).max(280),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Trials are Angel-only; every other plan is pay-first.
    if (data.status === "trialing" && !trialAllowedForPlan(data.plan)) {
      throw new Error(
        `Trials are only available on the Angel plan — ${data.plan} accounts must pay in full before access.`,
      );
    }

    const plan = planById(data.plan);
    const bundled = plan?.seatsIncluded ?? 1;
    const extra = Math.max(data.seats - bundled, 0);
    const seats = data.plan === "trial" ? 1 : seatsForPlan(data.plan, extra);

    const row = {
      plan: data.plan,
      status: data.status,
      seats,
      polar_customer_id: data.polarCustomerId || null,
      polar_subscription_id: data.polarSubscriptionId || null,
      manual_override_at: new Date().toISOString(),
      override_reason: data.reason,
    };

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(row as never)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();

    await audit({
      event_type: "admin.subscription_edit",
      signature_valid: true,
      outcome: "applied",
      matched_user_id: data.userId,
      matched_email: (profile as any)?.email ?? null,
      mapped_plan: data.plan,
      mapped_seats: seats,
      mapping_source: "none",
      polar_customer_id: row.polar_customer_id,
      polar_subscription_id: row.polar_subscription_id,
      notes: `Superadmin edit by ${context.userId}: ${data.reason}`,
      applied_row: row,
    });

    return { ok: true, seats };
  });

/**
 * Permanently deletes an account: the auth user plus every row that cascades
 * from it (profile, subscription, seats, roles). Superadmins cannot delete
 * their own account, so the dashboard can never lock itself out.
 */
export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        confirmEmail: z.string().trim().email(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();

    const email = normalizeEmail((profile as any)?.email);
    if (!email || email !== normalizeEmail(data.confirmEmail)) {
      throw new Error("Confirmation email does not match this account.");
    }

    await supabaseAdmin.from("team_members").delete().eq("owner_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    await audit({
      event_type: "admin.account_deleted",
      signature_valid: true,
      outcome: "applied",
      matched_user_id: data.userId,
      matched_email: email,
      mapping_source: "none",
      notes: `Superadmin ${context.userId} deleted account ${email}.`,
    });

    return { ok: true };
  });

/** Repairs every account that is missing its owner admin seat row. */
export const backfillOwnerSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profiles, members] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,email,full_name"),
      supabaseAdmin.from("team_members").select("owner_id,member_user_id"),
    ]);
    if (profiles.error) throw profiles.error;
    if (members.error) throw members.error;

    const hasOwnerSeat = new Set(
      ((members.data ?? []) as any[])
        .filter((m) => m.owner_id === m.member_user_id)
        .map((m) => m.owner_id),
    );

    const missing = ((profiles.data ?? []) as any[]).filter(
      (p) => p.email && !hasOwnerSeat.has(p.id),
    );
    if (missing.length === 0) return { created: 0 };

    let created = 0;
    for (const p of missing) {
      const { error } = await supabaseAdmin.from("team_members").insert({
        owner_id: p.id,
        member_user_id: p.id,
        email: normalizeEmail(p.email),
        full_name: p.full_name ?? null,
        role: "admin",
        status: "active",
        accepted_at: new Date().toISOString(),
      } as never);
      if (!error) created += 1;
    }

    await audit({
      event_type: "admin.owner_seat_backfill",
      signature_valid: true,
      outcome: "applied",
      mapping_source: "none",
      notes: `Superadmin ${context.userId} created ${created} missing owner admin seats.`,
    });

    return { created };
  });

/**
 * Removes an account's subscription without touching the account itself.
 * Plan, seats and Polar links are reset; the auth user, profile, seat rows and
 * — importantly — any `user_roles` entries survive, so a superadmin can drop
 * their own paid plan and stay a superadmin.
 */
export const clearOrganizationSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        reason: z.string().trim().min(3).max(280).default("Subscription removed by superadmin"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      plan: "trial",
      // Trials are Angel-only, so a cleared subscription has no access until
      // a new plan is bought.
      status: "canceled",
      seats: 1,
      polar_subscription_id: null,
      polar_product_id: null,
      current_period_end: null,
      manual_override_at: new Date().toISOString(),
      override_reason: data.reason,
    };

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(row as never)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();

    await audit({
      event_type: "admin.subscription_cleared",
      signature_valid: true,
      outcome: "applied",
      matched_user_id: data.userId,
      matched_email: (profile as any)?.email ?? null,
      mapped_plan: "trial",
      mapped_seats: 1,
      mapping_source: "none",
      notes: `Superadmin ${context.userId} removed the subscription (roles kept): ${data.reason}`,
      applied_row: row,
    });

    return { ok: true };
  });
