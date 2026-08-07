import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OnboardingAnswers } from "@/lib/onboarding";

export type OnboardingState = {
  answers: OnboardingAnswers | null;
  completed: boolean;
};

export const getMyOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingState> => {
    const { supabase, userId } = context;
    const [{ data: row }, { data: profile }] = await Promise.all([
      supabase.from("onboarding_responses").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("onboarding_completed_at").eq("id", userId).maybeSingle(),
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
      completed: Boolean(profile?.onboarding_completed_at),
    };
  });

export const saveMyOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { answers: OnboardingAnswers; complete?: boolean }) => input)
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

    if (data.complete) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ onboarding_completed_at: now })
        .eq("id", userId);
      if (profileError) throw new Error(profileError.message);
    }

    return { ok: true };
  });
