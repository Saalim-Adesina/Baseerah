import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planById } from "@/lib/plans";
import { normalizeEmail, seatCeiling } from "@/lib/billing-rules";

export type SeatRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
  invite_token: string | null;
  accepted_at: string | null;
  is_owner: boolean;
};

export type SeatsPayload = {
  seats: SeatRow[];
  plan: string;
  paidSeats: number;
  ceiling: number | null;
  ownerEmail: string | null;
};

const seatRole = z.enum(["admin", "analyst", "viewer"]);

/**
 * Loads the account's subscription plus its seat rows, creating the owner's
 * admin seat when it is missing. Every account — trial or paid — owns exactly
 * one owner seat, so seat counts are consistent everywhere.
 */
async function loadAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: sub }, { data: profile }] = await Promise.all([
    supabaseAdmin
      .from("subscriptions")
      .select("plan, seats, status")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle(),
  ]);

  const ownerEmail = normalizeEmail((profile as { email?: string } | null)?.email);
  const plan = (sub as { plan?: string } | null)?.plan ?? "angel_trial";
  const paidSeats = (sub as { seats?: number } | null)?.seats ?? 1;

  // Baseline: the owner always holds an admin seat row on their own account.
  if (ownerEmail) {
    const { data: existing } = await supabaseAdmin
      .from("team_members")
      .select("id")
      .eq("owner_id", userId)
      .eq("member_user_id", userId)
      .maybeSingle();
    if (!existing) {
      // Insert may collide with a pre-existing invite row for the same email;
      // in that case claim it for the owner instead.
      const { error: insertError } = await supabaseAdmin.from("team_members").insert({
        owner_id: userId,
        member_user_id: userId,
        email: ownerEmail,
        full_name: (profile as { full_name?: string } | null)?.full_name ?? null,
        role: "admin",
        status: "active",
        accepted_at: new Date().toISOString(),
      } as never);
      if (insertError?.code === "23505") {
        await supabaseAdmin
          .from("team_members")
          .update({
            member_user_id: userId,
            role: "admin",
            status: "active",
            accepted_at: new Date().toISOString(),
          } as never)
          .eq("owner_id", userId)
          .eq("email", ownerEmail);
      }
    }
  }

  const { data: rows, error } = await supabaseAdmin
    .from("team_members")
    .select("id,email,full_name,role,status,created_at,invite_token,accepted_at,member_user_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const seats: SeatRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    role: r.role,
    status: r.status,
    created_at: r.created_at,
    invite_token: r.invite_token,
    accepted_at: r.accepted_at,
    is_owner: r.member_user_id === userId,
  }));

  const ceiling = seatCeiling(planById(plan), paidSeats);
  return {
    seats,
    plan,
    paidSeats,
    ceiling: Number.isFinite(ceiling) ? (ceiling as number) : null,
    ownerEmail,
  } satisfies SeatsPayload;
}

/** Seats for the signed-in account owner, with the owner seat guaranteed. */
export const getMySeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadAccount(context.userId));

/** Assigns a seat. The plan ceiling is enforced here, not in the browser. */
export const assignSeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        full_name: z.string().trim().max(100).optional(),
        role: seatRole,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const account = await loadAccount(context.userId);
    const email = normalizeEmail(data.email)!;

    if (account.ceiling !== null && account.seats.length >= account.ceiling) {
      throw new Error(
        `Your ${planById(account.plan)?.name ?? account.plan} plan is capped at ${account.ceiling} seats.`,
      );
    }
    if (account.seats.some((s) => s.email === email)) {
      throw new Error("That teammate already has a seat on this account.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("team_members").insert({
      owner_id: context.userId,
      email,
      full_name: data.full_name ?? null,
      role: data.role,
      status: "invited",
    } as never);
    if (error) throw new Error(error.message);
    return loadAccount(context.userId);
  });

/** Changes a seat's role. The owner seat must stay an admin seat. */
export const updateSeatRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), role: seatRole }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("team_members")
      .select("id, member_user_id")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Seat not found on your account.");
    if (row.member_user_id === context.userId && data.role !== "admin") {
      throw new Error("The account owner keeps the admin seat.");
    }
    const { error } = await supabaseAdmin
      .from("team_members")
      .update({ role: data.role } as never)
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return loadAccount(context.userId);
  });

/** Releases a seat. The owner's own seat can never be released. */
export const removeSeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("team_members")
      .select("id, member_user_id")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Seat not found on your account.");
    if (row.member_user_id === context.userId) {
      throw new Error("You can't release the owner's admin seat.");
    }
    const { error } = await supabaseAdmin
      .from("team_members")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return loadAccount(context.userId);
  });
