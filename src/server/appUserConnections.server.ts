// Server-only helpers for per-app-user connector credentials.
import { decryptConnectionKey, encryptConnectionKey } from "@/server/connectionKeyCrypto";

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
  accountLabel?: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey, { userId, connectorId }),
      account_label: accountLabel ?? null,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionKeyForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { connection_key_ciphertext: string } | null;
  if (!row) return null;
  // Scope must match what encryption bound the ciphertext to; a row whose
  // ciphertext was moved from another user fails here instead of decrypting.
  return decryptConnectionKey(row.connection_key_ciphertext, { userId, connectorId });
}

export async function getConnectionRowForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_user_connections")
    .select("account_label,updated_at")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  return (data as { account_label: string | null; updated_at: string } | null) ?? null;
}

export async function setAccountLabel(userId: string, connectorId: string, label: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_user_connections")
    .update({ account_label: label } as never)
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw error;
}
