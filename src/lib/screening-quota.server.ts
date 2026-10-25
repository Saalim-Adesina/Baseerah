// Server-only screening meter.
//
// `subscriptions` is readable by its owner but not writable by them (RLS grants
// SELECT only), which is the correct shape — an account must never be able to
// edit its own meter. So the increment runs on the service-role client, scoped
// explicitly by `user_id`.
import { periodElapsed, screeningAllowed, type ScreeningVerdict } from "@/lib/billing-rules";

/** Thrown when the account may not screen. Carries the reason for the UI. */
export class ScreeningNotAllowedError extends Error {
  readonly reason: string;
  constructor(verdict: Extract<ScreeningVerdict, { allowed: false }>) {
    super(verdict.message);
    this.name = "ScreeningNotAllowedError";
    this.reason = verdict.reason;
  }
}

/** Mirrors what `handle_new_user()` seeds, so a self-heal matches the trigger. */
const TRIAL_SEED = {
  plan: "angel_trial",
  status: "trialing",
  seats: 1,
  trialDays: 14,
} as const;

/**
 * Checks the caller's remaining allowance and records one screening against it.
 *
 * Deliberately check-then-increment in one place and called once, at the top of
 * `analyzeDeal`: memos, pass emails and chat are follow-ups on a deal that has
 * already been paid for, so metering them would charge the same deal twice.
 */
export async function assertAndRecordScreening(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status, deals_screened_this_period, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not read the subscription for this account: ${error.message}`);

  if (!row) {
    // Every user gets a row from the signup trigger; a missing one is an
    // anomaly. Re-seed it rather than locking the account out permanently.
    const periodEnd = new Date(Date.now() + TRIAL_SEED.trialDays * 86_400_000).toISOString();
    await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      plan: TRIAL_SEED.plan,
      status: TRIAL_SEED.status,
      seats: TRIAL_SEED.seats,
      current_period_end: periodEnd,
      deals_screened_this_period: 1,
    });
    return { quota: null as number | null, used: 1 };
  }

  // A paid period that has rolled over starts a fresh allowance. Trials are
  // excluded: `screeningAllowed` refuses an elapsed trial outright, so resetting
  // one here would hand it a new allowance every time the clock passed.
  const rolledOver = row.status !== "trialing" && periodElapsed(row.current_period_end, Date.now());
  const used = rolledOver ? 0 : (row.deals_screened_this_period ?? 0);

  const verdict = screeningAllowed({
    plan: row.plan,
    status: row.status,
    used,
    periodEnd: row.current_period_end,
  });
  if (!verdict.allowed) throw new ScreeningNotAllowedError(verdict);

  const { error: updateError } = await supabaseAdmin
    .from("subscriptions")
    .update({ deals_screened_this_period: used + 1 })
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`Could not record this screening: ${updateError.message}`);
  }

  return { quota: verdict.quota, used: used + 1 };
}
