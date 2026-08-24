import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** True when the signed-in user may view billing reconciliation. */
export const isBillingAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Unlike the other developer gates this one reports rather than throws —
    // /billing uses it to decide whether to render the admin panel at all.
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "developer",
    });
    return { admin: !error && data === true };
  });
