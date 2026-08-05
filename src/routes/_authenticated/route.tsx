import { useEffect } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMySeats } from "@/lib/seats.functions";

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

  // Every account owns exactly one owner admin seat. Older accounts were
  // created before that rule existed, so it is applied once on entry.
  useEffect(() => {
    void ensureSeats().catch(() => undefined);
  }, [ensureSeats]);

  return <Outlet />;
}
