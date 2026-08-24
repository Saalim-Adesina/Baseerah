import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-user app settings. Everything here lives on the caller's own `profiles`
 * row, read and written through their RLS-bound client — the "Users manage own
 * profile" policy is what scopes it, not code in this file.
 */

/** Scan sizes the settings UI offers. The DB check constraint allows 1..100. */
export const SCAN_LIMIT_CHOICES = [50, 75, 100] as const;
export const DEFAULT_SCAN_LIMIT = 50;

export type AppSettings = {
  gmailScanLimit: number;
};

export const getMySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppSettings> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("gmail_scan_limit")
      .eq("id", context.userId)
      .maybeSingle();

    if (error) throw new Error(`Could not load settings: ${error.message}`);

    return { gmailScanLimit: data?.gmail_scan_limit ?? DEFAULT_SCAN_LIMIT };
  });

export const saveMySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ gmailScanLimit: z.number().int().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AppSettings> => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ gmail_scan_limit: data.gmailScanLimit })
      .eq("id", context.userId);

    if (error) throw new Error(`Could not save settings: ${error.message}`);
    return { gmailScanLimit: data.gmailScanLimit };
  });
