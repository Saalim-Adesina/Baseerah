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
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Every account owns exactly one owner admin seat. Older accounts were
  // created before that rule existed, so it is applied once on entry.
  useEffect(() => {
    void ensureSeats().catch(() => undefined);
  }, [ensureSeats]);

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
