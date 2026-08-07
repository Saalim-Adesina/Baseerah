import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OnboardingAnswers } from "@/lib/onboarding";
import type { InvestorType } from "@/lib/account";

export type OnboardingProfile = {
  full_name: string | null;
  firm_name: string | null;
  investor_type: InvestorType;
};

export type OnboardingState = {
  answers: OnboardingAnswers | null;
  profile: OnboardingProfile;
  completed: boolean;
};

export const getMyOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingState> => {
    const { supabase, userId } = context;
    const [{ data: row }, { data: profile }] = await Promise.all([
      supabase.from("onboarding_responses").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select("onboarding_completed_at,full_name,firm_name,investor_type")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    return {
      answers: row
        ? {
            deals_per_month: row.deals_per_month,
            review_method: row.review_method,
            hours_per_month: row.hours_per_month,
            tools: row.tools ?? [],
            industries: row.industries ?? [],
            industries_other: row.industries_other,
            thesis_sentence: row.thesis_sentence,
            check_size: row.check_size,
            heard_from: row.heard_from,
            heard_from_detail: row.heard_from_detail,
            connect_inbox: row.connect_inbox,
          }
        : null,
      profile: {
        full_name: profile?.full_name ?? null,
        firm_name: profile?.firm_name ?? null,
        investor_type: (profile?.investor_type as InvestorType | undefined) ?? "angel",
      },
      completed: Boolean(profile?.onboarding_completed_at),
    };
  });

export const saveMyOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      answers: OnboardingAnswers;
      profile?: Partial<OnboardingProfile>;
      complete?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    const { error } = await supabase.from("onboarding_responses").upsert(
      {
        user_id: userId,
        ...data.answers,
        ...(data.complete ? { completed_at: now } : {}),
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    const profilePatch: Record<string, unknown> = {};
    if (data.profile?.full_name != null) profilePatch['full_name'] = data.profile.full_name;
    if (data.profile?.firm_name != null) profilePatch['firm_name'] = data.profile.firm_name;
    if (data.profile?.investor_type) profilePatch['investor_type'] = data.profile.investor_type;
    if (data.complete) profilePatch['onboarding_completed_at'] = now;

    if (Object.keys(profilePatch).length > 0) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profilePatch)
        .eq("id", userId);
      if (profileError) throw new Error(profileError.message);
    }

    return { ok: true };
  });

