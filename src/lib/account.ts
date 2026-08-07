import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type InvestorType = "angel" | "syndicate" | "incubator" | "vc" | "family_office";

export const INVESTOR_TYPES: { value: InvestorType; label: string; blurb: string }[] = [
  {
    value: "angel",
    label: "Angel investor",
    blurb: "Solo cheque writer drowning in warm intros and cold decks.",
  },
  { value: "syndicate", label: "Syndicate lead", blurb: "You curate deals for a backer list." },
  { value: "incubator", label: "Incubator / accelerator", blurb: "Batch screening at volume." },
  { value: "vc", label: "Venture capital fund", blurb: "Partnership with an investment committee." },
  { value: "family_office", label: "Family office", blurb: "Multi-asset mandate, selective private deals." },
];

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  firm_name: string | null;
  investor_type: InvestorType;
  deal_inbox_email: string | null;
};

export type Subscription = {
  plan: string;
  status: string;
  deals_screened_this_period: number;
  seats: number;
  current_period_end: string | null;
};

export function inboxAddress(userId: string) {
  return `deals-${userId.slice(0, 8)}@inbox.baseerah.dev`;
}

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function useAccount() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (active) setLoading(false);
        return;
      }
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan,status,deals_screened_this_period,seats,current_period_end")
          .eq("user_id", auth.user.id)
          .maybeSingle(),
      ]);
      if (!active) return;
      setProfile((p as Profile | null) ?? null);
      setSubscription((s as Subscription | null) ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { profile, subscription, loading };
}

/** True when the signed-in user holds the superadmin role. */
export function useIsSuperadmin() {
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (active) setIsSuperadmin(false);
        return;
      }
      const { data } = await supabase.rpc("has_role", {
        _user_id: auth.user.id,
        _role: "superadmin",
      });
      if (active) setIsSuperadmin(Boolean(data));
    })();
    return () => {
      active = false;
    };
  }, []);

  return isSuperadmin;
}
