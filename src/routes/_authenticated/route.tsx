import { useEffect } from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMySeats } from "@/lib/seats.functions";
import { getMyOnboarding } from "@/lib/onboarding.functions";
import { syncMySubscriptionFromPolar } from "@/lib/account-link.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { mode: "signin" } });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const ensureSeats = useServerFn(getMySeats);
  const loadOnboarding = useServerFn(getMyOnboarding);
  const syncBilling = useServerFn(syncMySubscriptionFromPolar);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Every account owns exactly one owner admin seat. Older accounts were
  // created before that rule existed, so it is applied once on entry.
  useEffect(() => {
    void ensureSeats().catch(() => undefined);
  }, [ensureSeats]);

  // Google sign-in creates the account without passing through the signup gate,
  // so reconcile against Polar by email on entry: a plan bought before the
  // account existed links here instead of leaving an orphan on the billing side.
  // Best effort — the billing page retries on every visit.
  useEffect(() => {
    void syncBilling().catch(() => undefined);
  }, [syncBilling]);

  // Onboarding is mandatory once, so any authenticated surface bounces to it
  // until the flow is finished.
  useEffect(() => {
    if (pathname.startsWith("/onboarding")) return;
    void loadOnboarding()
      .then((state) => {
        if (!state.completed) navigate({ to: "/onboarding", replace: true });
      })
      .catch(() => undefined);
  }, [loadOnboarding, navigate, pathname]);

  return <Outlet />;
}
